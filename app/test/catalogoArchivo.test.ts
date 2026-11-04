/**
 * CATÁLOGO POR ARCHIVO (R-22) y AROS COMO PRODUCTO en el bot (R-24).
 *
 * Mundillantas usa Fénix en un servidor local sin API: Jenny exporta el
 * inventario a Excel y lo sube en el panel. Esto prueba el camino entero con
 * el Excel de muestra (`fixtures/inventario-fenix-muestra.xlsx`: 10 llantas,
 * 3 aros, columnas tipo Fénix y una fila mala) contra un Postgres de verdad y
 * por HTTP: mapeo → subida → el bot lo usa sin reinicio → /catalog/status → y
 * sigue ahí después de reiniciar.
 */
import express from "express";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.GRAPH_BASE_URL ||= "http://127.0.0.1:9";
// Sin Contífico ni Sheets: la fuente es el archivo subido.
delete process.env.CONTIFICO_API_KEY;
delete process.env.CATALOG_SHEET_ID;
const ADMIN_KEY = "clave-de-prueba-catalogo-archivo";
process.env.ADMIN_KEY = ADMIN_KEY;
process.env.NODE_ENV = "test";

const BASE = `autoventa_catalogo_archivo_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const fixture = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
const XLSX = readFileSync(fixture("inventario-fenix-muestra.xlsx"));
const CSV = readFileSync(fixture("inventario-fenix-muestra.csv"));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { createAdminRouter } = await import("../src/server/admin.js");
const archivo = await import("../src/services/fuentes/archivo.js");
const catalog = await import("../src/services/catalog.js");
const { arosDelCatalogo, cargarArosDelCatalogo } = await import("../src/domain/aroProducto.js");

/** El mapeo de este Excel: stock de los dos locales sumado, precios SIN IVA. */
const MAPEO = {
  columnas: {
    medida: "medida", marca: "marca", diseno: "modelo", codigo: "codigo", nombre: "descripcion",
    precio: "pvp", precioLista: "pvp lista", stock: "stock", foto: "foto",
    stockPorLocal: { matriz: "stock matriz", sucursal: "stock sucursal" },
  },
  precioIncluyeIva: false,
  filasDeAros: { columna: "linea", patron: "^aro" },
};

let server: Server;
let baseUrl: string;
const clientesAbiertos: Array<{ end: (o?: { timeout?: number }) => Promise<void> }> = [];
const headers = { "x-admin-key": ADMIN_KEY };

beforeAll(async () => {
  await ensureSchema();
  const app = express();
  app.use(express.json());
  app.use("/api", createAdminRouter());
  await new Promise<void>((listo) => {
    server = app.listen(0, () => listo());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => server?.close(r));
  await sql.end({ timeout: 5 });
  for (const c of clientesAbiertos) await c.end({ timeout: 5 });
  const a = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
  await a.unsafe(`drop database if exists ${BASE} with (force)`);
  await a.end();
});

describe("normalizar el Excel (puro)", () => {
  it("10 llantas, 3 aros aparte y la fila mala descartada con su motivo", async () => {
    const filas = await archivo.filasDelArchivo("inventario.xlsx", XLSX);
    const r = archivo.normalizarCatalogoSubido("inventario.xlsx", filas, archivo.CatalogoMapeoSchema.parse(MAPEO));
    expect(r.filas).toHaveLength(10);
    expect(r.aros.map((a) => a.codigo)).toEqual(["ARO-015", "ARO-016", "ARO-014"]);
    expect(r.descartadas).toEqual([{ fila: 15, motivo: 'medida no reconocida: "XXXX"' }]);
  });

  it("el CSV del mismo inventario da lo mismo que el XLSX", async () => {
    const mapeo = archivo.CatalogoMapeoSchema.parse(MAPEO);
    const deXlsx = archivo.normalizarCatalogoSubido("x", await archivo.filasDelArchivo("x.xlsx", XLSX), mapeo, new Date(0));
    const deCsv = archivo.normalizarCatalogoSubido("x", await archivo.filasDelArchivo("x.csv", CSV), mapeo, new Date(0));
    expect(deCsv).toEqual(deXlsx);
  });

  it("una fila sin medida ni marca de aro nunca se pierde en silencio", async () => {
    const r = archivo.normalizarCatalogoSubido(
      "x",
      [{ codigo: "Z1", medida: "", pvp: "10", linea: "LLANTAS" }, { codigo: "Z2", medida: "205/55R16", pvp: "0", linea: "LLANTAS" }],
      archivo.CatalogoMapeoSchema.parse(MAPEO),
    );
    expect(r.filas).toHaveLength(0);
    expect(r.descartadas.map((d) => d.motivo)).toEqual(['medida no reconocida: ""', "precio inválido"]);
  });

  it("con precio que YA trae IVA no se suma otra vez", async () => {
    const mapeo = archivo.CatalogoMapeoSchema.parse({ ...MAPEO, precioIncluyeIva: true });
    const r = archivo.normalizarCatalogoSubido("x", await archivo.filasDelArchivo("x.xlsx", XLSX), mapeo);
    expect(r.filas[0].precios.minimoConIva).toBe(96.5);
  });
});

describe("subir el Excel por el panel (HTTP + Postgres)", () => {
  it("PUT /catalog/mapeo valida con zod", async () => {
    const malo = await fetch(`${baseUrl}/api/catalog/mapeo`, {
      method: "PUT", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ columnas: { medida: "" } }),
    });
    expect(malo.status).toBe(400);
    const bueno = await fetch(`${baseUrl}/api/catalog/mapeo`, {
      method: "PUT", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ mapeo: MAPEO }),
    });
    expect(bueno.status).toBe(200);
    const leido = await (await fetch(`${baseUrl}/api/catalog/mapeo`, { headers })).json();
    expect(leido.mapeo.columnas.stockPorLocal).toEqual(MAPEO.columnas.stockPorLocal);
  });

  it("sin credencial no entra", async () => {
    const r = await fetch(`${baseUrl}/api/catalog/import?nombre=x.xlsx`, { method: "POST", body: XLSX });
    expect(r.status).toBe(401);
  });

  it("un cuerpo vacío se rechaza con un motivo", async () => {
    const r = await fetch(`${baseUrl}/api/catalog/import?nombre=x.xlsx`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream" }, body: Buffer.alloc(0),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/Falta el archivo/);
  });

  it("POST /catalog/import (crudo) lo guarda y el bot lo usa sin reinicio", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const r = await fetch(`${baseUrl}/api/catalog/import?nombre=inventario-fenix-muestra.xlsx`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream" }, body: XLSX,
    });
    log.mockRestore();
    const body = await r.json();
    expect(r.status, JSON.stringify(body)).toBe(200);
    expect(body.importado).toMatchObject({ llantas: 10, aros: 3 });
    // El catálogo en memoria ya es el del archivo.
    expect(catalog.catalogStatus()).toMatchObject({ items: 10, source: "archivo", error: null });
    expect(arosDelCatalogo()).toHaveLength(3);
  });

  it("/catalog/status muestra fuente, fecha, filas y descartadas con motivo", async () => {
    const { catalog: estado } = await (await fetch(`${baseUrl}/api/catalog/status`, { headers })).json();
    expect(estado.source).toBe("archivo");
    expect(estado.items).toBe(10);
    expect(estado.lastSync).toBeTruthy();
    expect(estado.archivo).toMatchObject({ nombre: "inventario-fenix-muestra.xlsx", aros: 3 });
    expect(estado.descartadas).toEqual([{ row: 15, reason: 'medida no reconocida: "XXXX"' }]);
  });

  it("precio sin IVA → se suma el IVA del perfil UNA vez; stock de los locales sumado", () => {
    const grabber = catalog.findByCode("MLL-001")!;
    expect(grabber.minimumPriceWithTax).toBe(110.98); // 96,50 × 1,15
    expect(grabber.customerPriceWithTax).toBe(128.8); // lista 112 × 1,15 (tachado)
    expect(grabber.stock).toBe(6); // 4 matriz + 2 sucursal
    // Sin precio de lista: los dos iguales, sin descuento visible.
    const triangle = catalog.findByCode("MLL-002")!;
    expect(triangle.customerPriceWithTax).toBe(triangle.minimumPriceWithTax);
    expect(arosDelCatalogo().find((a) => a.codigo === "ARO-015")).toMatchObject({ precio: 94.3, stock: 12, diametro: 15, pernos: 4 });
  });

  it("un aro nunca aparece en una búsqueda de llantas", () => {
    for (const aro of [14, 15, 16]) {
      expect(catalog.searchByRim(aro).map((i) => i.code).filter((c) => c.startsWith("ARO"))).toEqual([]);
    }
    expect(catalog.searchByText("aro", 100).map((i) => i.code).filter((c) => c.startsWith("ARO"))).toEqual([]);
  });

  it("después de reiniciar, el catálogo sale del archivo guardado — y el IVA no se duplica", async () => {
    vi.resetModules();
    cargarArosDelCatalogo([]);
    const fresco = await import("../src/services/catalog.js");
    const aros = await import("../src/domain/aroProducto.js");
    expect(fresco.catalogStatus().items).toBe(0);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const reporte = await fresco.syncCatalog();
    log.mockRestore();
    expect(reporte).toMatchObject({ ok: 10, source: "archivo" });
    expect(aros.arosDelCatalogo()).toHaveLength(3);
    expect(fresco.findByCode("MLL-001")!.minimumPriceWithTax).toBe(110.98);
    // El reinicio abrió otra conexión: se cierra al final, con la primera.
    clientesAbiertos.push((await import("../src/db/client.js")).sql);
  });
});

describe("buscar_aros le llega al modelo solo con aros en el catálogo", () => {
  const CTX = {
    conversation: { id: 1, phone: "593999", name: "Cliente", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: "593999",
    customerName: "Cliente",
    currentUserText: "tienen aros de 15?",
  };

  it("con aros y los prompts por defecto, la lista final del agente incluye buscar_aros", async () => {
    const { buildTools } = await import("../src/agent/tools.js");
    const { ensureDefaultStagePrompts, getPublishedStagePrompt } = await import("../src/services/settings.js");
    const { toolEnabled, getPhaseFlags } = await import("../src/services/phases.js");
    await ensureDefaultStagePrompts();
    const flags = await getPhaseFlags();
    for (const etapa of ["nuevo", "medida_confirmada", "seleccionando", "cotizacion_enviada", "seguimiento_venta"] as const) {
      const prompt = await getPublishedStagePrompt(etapa);
      const permitidas = new Set(prompt.allowedTools);
      // El mismo filtro que `agent.ts` (allowedTools publicados ∩ buildTools ∩ fases).
      const finales = buildTools(CTX as never)
        .filter((t) => permitidas.has(t.function.name) && toolEnabled(t.function.name, flags))
        .map((t) => t.function.name);
      expect(finales, etapa).toContain("buscar_aros");
    }
  });

  it("buscar_aros responde diámetro, pernos, precio con IVA y stock, corto", async () => {
    const { buildTools } = await import("../src/agent/tools.js");
    const tool = buildTools(CTX as never).find((t) => t.function.name === "buscar_aros")!;
    const salida = await tool.execute({ diametro: 15, pernos: null, texto: null });
    const json = JSON.parse(salida);
    expect(json.aros).toEqual([{ codigo: "ARO-015", diametro: 15, pernos: 4, precio_con_iva: 94.3, stock: 12 }]);
    expect(json.nombres).toEqual({ "ARO-015": "ARO 15 4X100 NEGRO MATE" });
    expect(json.regla).toMatch(/PROHIBIDO afirmar que calzan/);
  });

  it("5 aros caben enteros en la huella del guardián (≤ 500 caracteres)", async () => {
    const { buildTools } = await import("../src/agent/tools.js");
    const { cargarArosDelCatalogo: cargar, arosDelCatalogo: vigentes } = await import("../src/domain/aroProducto.js");
    const antes = vigentes();
    cargar(Array.from({ length: 5 }, (_, i) => ({
      id: `ARO-0${15 + i}-XL`, codigo: `ARO-0${15 + i}-XL`, nombre: "ARO DE ALUMINIO 15 4X100 NEGRO MATE DEPORTIVO",
      marca: "GENERICO", diametro: 15, pernos: 4, precio: 1094.35, stock: 120, imageUrl: null,
    })));
    const tool = buildTools(CTX as never).find((t) => t.function.name === "buscar_aros")!;
    const salida = await tool.execute({ diametro: 15, pernos: null, texto: null });
    const huella = salida.slice(0, 500);
    for (let i = 0; i < 5; i++) expect(huella, `aro ${i}`).toContain(`"codigo":"ARO-0${15 + i}-XL","diametro":15,"pernos":4,"precio_con_iva":1094.35,"stock":120}`);
    cargar(antes);
  });

  it("«tienen aros de 15?» no manda la vitrina de llantas por aro", async () => {
    const { aroParaMostrar } = await import("../src/services/mostrarPorAro.js");
    expect(aroParaMostrar("tienen aros de 15?", null)).toBeNull();
    // «rin 15» a secas sigue siendo la ruta de llantas.
    expect(aroParaMostrar("rin 15", null)).toBe(15);
  });

  it("sin aros (Depot) la herramienta no existe y el ruteo por aro es el de hoy", async () => {
    const { buildTools } = await import("../src/agent/tools.js");
    const { aroParaMostrar } = await import("../src/services/mostrarPorAro.js");
    const { cargarArosDelCatalogo: cargar } = await import("../src/domain/aroProducto.js");
    cargar([]);
    expect(buildTools(CTX as never).map((t) => t.function.name)).not.toContain("buscar_aros");
    expect(aroParaMostrar("tienen aros de 15?", null)).toBe(15);
  });
});
