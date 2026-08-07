/**
 * Aviso a los asesores cuando alguien mueve el interruptor global.
 *
 * El 6-ago el bot pasó 8 horas apagado y nadie se enteró: el panel lo mostraba,
 * pero nadie mira el panel un sábado. De ahí las dos mitades que se prueban:
 *
 * 1. `mensajeCambioDeBot` — el texto que llega al celular. Es lo ÚNICO que el
 *    asesor va a ver, así que se prueba puro y con la hora fijada: si depende
 *    del reloj de la máquina, la prueba miente en cuanto cambie la hora.
 * 2. `setBotPower` — que el motivo sobreviva al ENCENDER. Hasta hoy se borraba,
 *    y por eso «ya está el catálogo» nunca podía llegar a ningún lado.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// La config se lee al importar: el entorno va ANTES de cualquier import de src/.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.GRAPH_BASE_URL ||= "http://127.0.0.1:9";
// Sin esto el cache de 5 s devuelve el estado viejo entre asserts consecutivos.
process.env.BOT_POWER_CACHE_MS = "0";

const BASE = `autoventa_botaviso_${process.pid}`;
const ADMIN_URL = "postgresql://manue@localhost/postgres";
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

// Base efímera creada ANTES de importar el pool (se conecta con la URL vigente
// al importarse), igual que en outboundGuardWiring.test.ts.
const admin = postgres(ADMIN_URL, { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

// Único mock: el envío real sale por Meta. Todo lo demás (DB incluida) es real.
vi.mock("../src/wa/client.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/wa/client.js")>();
  return { ...real, sendAdvisorText: vi.fn(async () => "wamid.test") };
});

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { setBotPower } = await import("../src/services/botPower.js");
const { mensajeCambioDeBot, avisarAsesoresGlobal } = await import(
  "../src/services/advisorNotifications.js"
);
const { sendAdvisorText } = await import("../src/wa/client.js");

const AHORA = new Date("2026-08-07T03:17:00.000Z"); // 6-ago 22:17 en Guayaquil

beforeAll(async () => {
  await ensureSchema();
}, 60_000);

afterAll(async () => {
  await sql.end();
  const cierre = postgres(ADMIN_URL, { prepare: false, max: 1 });
  await cierre.unsafe(`drop database if exists ${BASE}`);
  await cierre.end();
});

describe("mensajeCambioDeBot", () => {
  it("apagado con motivo: lleva el motivo y avisa de que nadie responde", () => {
    const texto = mensajeCambioDeBot({
      activo: false,
      motivo: "catálogo desactualizado",
      apagadoAt: AHORA.toISOString(),
      ahora: AHORA,
    });

    expect(texto).toContain("APAGADO");
    expect(texto).toContain("catálogo desactualizado");
    expect(texto).toContain("NO reciben respuesta");
    expect(texto).toContain("a mano");
    // La hora es de Guayaquil (UTC-5), no UTC: 03:17Z son las 22:17 del día 6.
    expect(texto).toContain("6 ago, 22:17");
  });

  it("apagado sin motivo: lo dice explícitamente en vez de dejar el hueco", () => {
    const texto = mensajeCambioDeBot({
      activo: false, motivo: "", apagadoAt: AHORA.toISOString(), ahora: AHORA,
    });
    expect(texto).toContain("Sin motivo");
    expect(texto).not.toContain("Motivo:");
  });

  it("encendido tras 8 h: dice cuánto duró el apagón", () => {
    const apagadoAt = new Date(AHORA.getTime() - (8 * 3_600_000 + 12 * 60_000));
    const texto = mensajeCambioDeBot({
      activo: true, motivo: "", apagadoAt: apagadoAt.toISOString(), ahora: AHORA,
    });

    expect(texto).toContain("ENCENDIDO");
    expect(texto).toContain("Estuvo apagado 8 h 12 min");
    expect(texto).toContain("seguimientos");
  });

  it("encendido con motivo: el motivo del ENCENDIDO también llega", () => {
    const texto = mensajeCambioDeBot({
      activo: true, motivo: "ya está el catálogo", apagadoAt: null, ahora: AHORA,
    });

    expect(texto).toContain("ya está el catálogo");
    // Sin apagadoAt no se puede saber cuánto duró: mejor callarlo que inventar.
    expect(texto).not.toContain("Estuvo apagado");
  });

  it("un apagón corto se cuenta en minutos, no se redondea a 0 h", () => {
    const apagadoAt = new Date(AHORA.getTime() - 7 * 60_000);
    const texto = mensajeCambioDeBot({
      activo: true, motivo: "", apagadoAt: apagadoAt.toISOString(), ahora: AHORA,
    });
    expect(texto).toContain("Estuvo apagado 7 min");
  });
});

describe("avisarAsesoresGlobal", () => {
  it("le escribe a todos los asesores activos, sin conversación de por medio", async () => {
    await sql`delete from advisors`;
    await sql`
      insert into advisors (nombre, telefono, prioridad)
      values ('Uno', '593900000101', 1), ('Dos', '593900000102', 2)
    `;
    vi.mocked(sendAdvisorText).mockClear();

    const salida = await avisarAsesoresGlobal("texto de prueba");

    expect(salida).toEqual({ enviados: 2 });
    expect(vi.mocked(sendAdvisorText).mock.calls.map((c) => c[1]))
      .toEqual(["593900000101", "593900000102"]);
  });

  it("si WhatsApp falla NO lanza: apagar el bot no puede depender de Meta", async () => {
    await sql`delete from advisors`;
    await sql`insert into advisors (nombre, telefono) values ('Uno', '593900000101')`;
    vi.mocked(sendAdvisorText).mockRejectedValueOnce(new Error("ventana cerrada"));

    const salida = await avisarAsesoresGlobal("texto de prueba");

    expect(salida.enviados).toBe(0);
    expect(salida.error).toContain("ventana cerrada");
  });
});

describe.sequential("setBotPower conserva el motivo del estado actual", () => {
  it("encender CON motivo lo conserva (antes se borraba)", async () => {
    await setBotPower({ activo: false, motivo: "probando el catálogo" });
    const encendido = await setBotPower({ activo: true, motivo: "ya está el catálogo" });

    expect(encendido.activo).toBe(true);
    expect(encendido.motivo).toBe("ya está el catálogo");
    expect(encendido.apagadoAt).toBeNull();
  });

  it("encender SIN motivo deja la cadena vacía, no el motivo del apagado", async () => {
    await setBotPower({ activo: false, motivo: "probando el catálogo" });
    const encendido = await setBotPower({ activo: true });
    expect(encendido.motivo).toBe("");
  });

  it("apagar sella apagadoAt y guarda el motivo", async () => {
    await setBotPower({ activo: true });
    const apagado = await setBotPower({ activo: false, motivo: "catálogo desactualizado" });

    expect(apagado.apagadoAt).not.toBeNull();
    expect(apagado.motivo).toBe("catálogo desactualizado");
  });

  it("apagar dos veces seguidas NO re-sella apagadoAt", async () => {
    await setBotPower({ activo: true });
    const primero = await setBotPower({ activo: false, motivo: "uno" });
    await new Promise((listo) => setTimeout(listo, 5));
    const segundo = await setBotPower({ activo: false, motivo: "dos" });

    // Lo que importa es desde cuándo el negocio está mudo, no el último clic.
    expect(segundo.apagadoAt).toBe(primero.apagadoAt);
    expect(segundo.motivo).toBe("dos");
  });

  /**
   * En zod 4 `.partial()` NO desactiva los `.default()`, así que un cuerpo con
   * solo el motivo llegaba con `activo: true` de regalo y ENCENDÍA el bot. Es
   * la peor falla posible en un interruptor de emergencia.
   */
  it("mandar solo el motivo no enciende el bot", async () => {
    await setBotPower({ activo: false, motivo: "catálogo desactualizado" });
    const otra = await setBotPower({ motivo: "sigo esperando el catálogo" });

    expect(otra.activo).toBe(false);
    expect(otra.motivo).toBe("sigo esperando el catálogo");
  });

  it("reguardar el mismo estado sin motivo conserva el que ya había", async () => {
    await setBotPower({ activo: true });
    await setBotPower({ activo: false, motivo: "catálogo desactualizado" });
    const otra = await setBotPower({ activo: false });
    expect(otra.motivo).toBe("catálogo desactualizado");
  });
});
