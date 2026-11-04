/**
 * FUENTES DE DATOS (R-21): con Contífico, el MISMO catálogo y las MISMAS
 * facturas que antes de `services/fuentes/`.
 *
 * Los hashes de abajo salieron de correr `syncCatalog()` con el código de
 * `dc50dab` (antes de mover nada) contra estos mismos datos, con un fetch de
 * mentira que pagina de a 100 como Contífico y el snapshot de precios de
 * Interbot de Depot. Un cambio en cualquier campo de cualquier llanta —precio,
 * stock, nombre, orden— cambia el hash.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";
// Una base que no existe: la lectura del último barrido de Interbot falla y
// se queda el snapshot de fábrica, igual que cuando se sacó el hash.
process.env.DATABASE_URL = "postgresql://nadie@127.0.0.1:1/nada";

const MUESTRA = fileURLToPath(new URL("./fixtures/catalogo-contifico-muestra.json", import.meta.url));
const SNAPSHOT = fileURLToPath(new URL("../scripts/sim/datos/catalogo.json", import.meta.url));

/** Hash de `dc50dab` (código viejo) — ver el encabezado. */
const HASH_MUESTRA = "94bc6f71be19dee65745f9319c6a33794263eb38ff7262b1858fb7f5ec072e84";
const HASH_SNAPSHOT = "15d7474db38447d2b04d4cf80932ad75dcafc1a732f268e7b01a72c9f33fc85f";

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  vi.resetModules();
  delete process.env.CONTIFICO_API_KEY;
  delete process.env.CATALOG_SHEET_ID;
});

function servirContifico(filas: unknown[]) {
  globalThis.fetch = (async (url: URL | string) => {
    const u = new URL(String(url));
    const page = Number(u.searchParams.get("page") ?? "1");
    const results = filas.slice((page - 1) * 100, page * 100);
    const next = page * 100 < filas.length ? "siguiente" : null;
    return new Response(JSON.stringify({ count: filas.length, next, results }), { status: 200 });
  }) as typeof fetch;
}

async function hashDelCatalogo(ruta: string) {
  process.env.CONTIFICO_API_KEY = "fake";
  delete process.env.INTERBOT_USERNAME;
  delete process.env.NEGOCIO;
  const filas = JSON.parse(readFileSync(ruta, "utf8")) as Array<{ codigo: string }>;
  servirContifico(filas);
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const catalog = await import("../src/services/catalog.js");
  const reporte = await catalog.syncCatalog();
  log.mockRestore();
  warn.mockRestore();
  const lista = filas.map((f) => catalog.findByCode(f.codigo)).filter(Boolean);
  return {
    reporte,
    hash: createHash("sha256").update(JSON.stringify(lista)).digest("hex"),
  };
}

describe("Contífico por la fuente nueva = el catálogo de antes", () => {
  it("la muestra commiteada da el mismo hash que dc50dab", async () => {
    const { reporte, hash } = await hashDelCatalogo(MUESTRA);
    expect(reporte.source).toBe("contifico");
    expect(reporte.ok).toBe(30);
    expect(reporte.skipped).toHaveLength(15);
    expect(hash).toBe(HASH_MUESTRA);
  });

  // El snapshot completo lo ignora git (pesa 1,4 MB): corre donde existe.
  it.skipIf(!existsSync(SNAPSHOT))("el snapshot completo del simulador da el mismo hash que dc50dab", async () => {
    const { reporte, hash } = await hashDelCatalogo(SNAPSHOT);
    expect(reporte.ok).toBe(405);
    expect(reporte.skipped).toHaveLength(694);
    expect(hash).toBe(HASH_SNAPSHOT);
  });
});

describe("qué fuente manda, decidido en cada sincronización", () => {
  async function conHay(catalogo: boolean, facturas: boolean) {
    vi.doMock("../src/services/fuentes/archivo.js", async (original) => ({
      ...(await original<typeof import("../src/services/fuentes/archivo.js")>()),
      hayCatalogoArchivo: async () => catalogo,
      hayFacturasImportadas: async () => facturas,
    }));
    return import("../src/services/fuentes/index.js");
  }

  it("Contífico gana si hay clave, aunque haya archivo", async () => {
    process.env.CONTIFICO_API_KEY = "fake";
    const f = await conHay(true, true);
    expect((await f.fuenteDeCatalogo())?.id).toBe("contifico");
    expect((await f.fuenteDeFacturas())?.id).toBe("contifico");
  });

  it("sin Contífico, el archivo subido; sin archivo, nada", async () => {
    const f = await conHay(true, true);
    expect((await f.fuenteDeCatalogo())?.id).toBe("archivo");
    expect((await f.fuenteDeFacturas())?.id).toBe("archivo");
    vi.resetModules();
    const g = await conHay(false, false);
    expect(await g.fuenteDeCatalogo()).toBeNull();
    expect(await g.fuenteDeFacturas()).toBeNull();
  });

  it("sin Contífico ni archivo, la Sheet si está configurada", async () => {
    process.env.CATALOG_SHEET_ID = "hoja";
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||= "x@y.z";
    process.env.GOOGLE_PRIVATE_KEY ||= "clave";
    const f = await conHay(false, false);
    expect((await f.fuenteDeCatalogo())?.id).toBe("sheets");
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_PRIVATE_KEY;
  });
});

describe("facturas de Contífico: misma forma, más el local de Depot", () => {
  it("normalizarFactura conserva los campos y la serie dice el local", async () => {
    const { normalizarFactura } = await import("../src/services/fuentes/contifico.js");
    const f = normalizarFactura({
      tipo_documento: "FAC", anulado: false, documento: "002-001-000123",
      fecha_emision: "12/09/2026", hora_emision: "16:33:49", total: "460.00", subtotal: "400.00",
      cliente: { razon_social: " Juan Pérez ", telefonos: "0987109790 / 022345678" },
      detalles: [
        { producto_nombre: "205/55R16 91V ZE310R FALKEN", cantidad: "4", precio: "100", porcentaje_descuento: "0" },
        { producto_nombre: "BALANCEO", cantidad: "4", precio: "5" },
      ],
    });
    expect(f).toEqual({
      documento: "002-001-000123", dia: "2026-09-12", hora: 16, total: 460, subtotal: 400,
      cliente: "Juan Pérez", telefonos: ["987109790", "022345678"],
      llantas: [{ nombre: "205/55R16 91V ZE310R FALKEN", cantidad: 4, precio: 100 }],
      local: "Cumbayá",
    });
  });

  it("la regex de llantas lee también 33X12.5R17, 7.00R15 y LT245/75R16", async () => {
    const { LLANTA } = await import("../src/services/fuentes/contifico.js");
    for (const nombre of [
      "LLANTA 33X12.5R17 MT", "LLANTA 7.00R15 TRACCION", "LT245/75R16 120/116S KR628",
      // Las de antes siguen:
      "205/55R16 91V", "LT265/70R17", "255/50ZR19", "31X10.50R15",
    ]) {
      expect(LLANTA.test(nombre), nombre).toBe(true);
    }
    for (const nombre of ["BALANCEO", "VALVULA", "ALINEACION 4 RUEDAS", "FILTRO DE ACEITE BMW X3 2012-2018"]) {
      expect(LLANTA.test(nombre), nombre).toBe(false);
    }
  });
});
