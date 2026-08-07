/**
 * Cableado REAL del aviso a los asesores en `PUT /api/bot-power`.
 *
 * El texto puro (`mensajeCambioDeBot`) y la persistencia (`setBotPower`) ya
 * están cubiertos en botPowerAviso.test.ts. Lo que NO estaba cubierto es el
 * pegamento, que es justo lo que se rompe en producción:
 *
 * - que el aviso salga SOLO cuando el interruptor cambia de verdad (si sale por
 *   cada guardado, el asesor lo silencia y el día que importe no lo mirará);
 * - que reguardar el mismo estado no genere ruido;
 * - que un cuerpo sin `activo` no encienda el bot (la regresión de zod);
 * - y sobre todo: que un WhatsApp caído NO rompa la respuesta HTTP ni impida el
 *   apagado. Apagar el bot es una emergencia; si Meta está caído, apagar tiene
 *   que seguir funcionando.
 *
 * Por eso se levanta el router de verdad contra Postgres de verdad y se le
 * hacen peticiones HTTP reales.
 */
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// La config y el módulo admin.ts leen el entorno AL IMPORTARSE: todo esto va
// antes de cualquier import dinámico de src/.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.GRAPH_BASE_URL ||= "http://127.0.0.1:9";
// Sin esto, el cache de 5 s de getBotPower devuelve el estado viejo entre
// peticiones y el endpoint compararía contra un "previo" fantasma.
process.env.BOT_POWER_CACHE_MS = "0";

/**
 * Autenticación del router, decidida a propósito:
 *
 * `admin.ts` congela `ADMIN_KEY` y `NODE_ENV` en constantes al importarse. Se
 * pone una clave REAL (en vez de dejarla vacía) por dos razones: así el gate de
 * `x-admin-key` se ejerce de verdad en cada petición, y así la prueba no depende
 * de que la máquina de quien la corra tenga o no `ADMIN_KEY` en el entorno —
 * con la clave puesta, la rama de fail-closed de producción ni se toca.
 */
const ADMIN_KEY = "clave-de-prueba-bot-power";
process.env.ADMIN_KEY = ADMIN_KEY;
// Explícito para no heredar un NODE_ENV=production del shell: con ADMIN_KEY
// puesta el fail-closed no aplica, pero conviene que la prueba diga qué asume.
process.env.NODE_ENV = "test";

const BASE = `autoventa_botpowerapi_${process.pid}`;
const ADMIN_URL = "postgresql://manue@localhost/postgres";
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

// Base efímera creada ANTES de importar el pool (se conecta con la URL vigente
// al importarse), igual que en outboundGuardWiring.test.ts.
const admin = postgres(ADMIN_URL, { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

/**
 * Único mock, y lo más abajo posible: el envío a Meta.
 *
 * Se corta en `sendAdvisorText` y no en `avisarAsesoresGlobal` para que corran
 * de verdad el cableado del endpoint (comparar previo/nuevo, armar el texto con
 * el `apagadoAt` anterior, lanzar el aviso en segundo plano), `avisarAsesoresGlobal`
 * y `asesoresActivos()` con su consulta a la tabla `advisors`. Mockear el aviso
 * entero dejaría fuera precisamente lo que puede fallar.
 */
vi.mock("../src/wa/client.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/wa/client.js")>();
  return { ...real, sendAdvisorText: vi.fn(async () => "wamid.test") };
});

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { createAdminRouter } = await import("../src/server/admin.js");
const { sendAdvisorText } = await import("../src/wa/client.js");
const enviar = vi.mocked(sendAdvisorText);

interface Power {
  activo: boolean;
  apagadoAt: string | null;
  motivo: string;
}

interface RespuestaPower {
  ok: boolean;
  power?: Power;
  error?: string;
}

let server: Server;
let baseUrl: string;

/** PUT real por la red, con el header que exige el gate de administración. */
async function ponerPower(cuerpo: unknown): Promise<{ status: number; body: RespuestaPower }> {
  const r = await fetch(`${baseUrl}/api/bot-power`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY },
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, body: (await r.json()) as RespuestaPower };
}

/**
 * Lo que quedó en la BASE, no lo que dijo la respuesta. Es la diferencia entre
 * "el endpoint contestó bonito" y "el bot está apagado de verdad".
 */
async function powerEnBase(): Promise<Power | undefined> {
  const [fila] = await sql<{ value: Power }[]>`
    select value from settings where key = 'bot_power'
  `;
  return fila?.value;
}

/** Textos que se le mandaron a los asesores, en orden. */
function avisos(): string[] {
  return enviar.mock.calls.map((llamada) => String(llamada[0]));
}

beforeAll(async () => {
  await ensureSchema();
  // Un asesor de verdad en la tabla: así `asesoresActivos()` corre su consulta
  // real en vez de caer al respaldo por entorno.
  await sql`delete from advisors`;
  await sql`insert into advisors (nombre, telefono, prioridad) values ('Asesor prueba', '593900000201', 1)`;
  // Sin fila en settings el estado nace ENCENDIDO (default de la instalación),
  // que es de donde parte la secuencia de abajo.
  await sql`delete from settings where key = 'bot_power'`;

  const app = express();
  app.use(express.json());
  app.use("/api", createAdminRouter()); // mismo prefijo que webhook.ts
  server = await new Promise<Server>((listo) => {
    const s = app.listen(0, () => listo(s));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60_000);

afterAll(async () => {
  await new Promise<void>((listo) => server.close(() => listo()));
  await sql.end();
  const cierre = postgres(ADMIN_URL, { prepare: false, max: 1 });
  await cierre.unsafe(`drop database if exists ${BASE}`);
  await cierre.end();
});

/**
 * Secuencial y con estado compartido a propósito: el aviso depende del estado
 * ANTERIOR, así que la única forma honesta de probarlo es una secuencia de
 * clics como la que haría una persona en el panel.
 */
describe.sequential("PUT /api/bot-power avisa a los asesores solo cuando el interruptor cambia", () => {
  it("apagar responde 200 y manda UN aviso con el motivo", async () => {
    const { status, body } = await ponerPower({ activo: false, motivo: "catálogo desactualizado" });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.power?.activo).toBe(false);
    expect(await powerEnBase()).toMatchObject({ activo: false, motivo: "catálogo desactualizado" });
    expect((await powerEnBase())?.apagadoAt).not.toBeNull();

    // El aviso sale con `void (async () => …)`: no está listo al volver del PUT.
    await vi.waitFor(() => expect(enviar).toHaveBeenCalledTimes(1), { timeout: 5_000, interval: 50 });
    expect(avisos()[0]).toContain("APAGADO");
    expect(avisos()[0]).toContain("catálogo desactualizado");
    // Y llegó al asesor de la tabla, no al respaldo del entorno.
    expect(enviar.mock.calls[0][1]).toBe("593900000201");
  });

  it("reguardar el MISMO estado no genera un aviso nuevo", async () => {
    const antes = enviar.mock.calls.length;

    const { status, body } = await ponerPower({ activo: false, motivo: "otra nota" });

    expect(status).toBe(200);
    expect(body.power?.activo).toBe(false);
    // El motivo sí se corrige: lo que no cambia es el interruptor.
    expect(await powerEnBase()).toMatchObject({ activo: false, motivo: "otra nota" });
    expect(enviar).toHaveBeenCalledTimes(antes);
    // La comprobación fuerte de que NO salió nada tarde va en la prueba de
    // encendido: allí se espera un aviso y el total tiene que seguir cuadrando.
  });

  /**
   * En zod 4 `.partial()` NO desactiva los `.default()`, así que un cuerpo con
   * solo el motivo llegaba con `activo: true` de contrabando y ENCENDÍA el bot.
   * Es la peor falla posible en un interruptor de emergencia, y por la red es
   * donde de verdad se comprueba: el panel manda exactamente este JSON.
   */
  it("un cuerpo SIN `activo` corrige la nota y no enciende el bot ni avisa", async () => {
    const antes = enviar.mock.calls.length;

    const { status, body } = await ponerPower({ motivo: "solo corrijo la nota" });

    expect(status).toBe(200);
    expect(body.power?.activo).toBe(false);
    expect(await powerEnBase()).toMatchObject({ activo: false, motivo: "solo corrijo la nota" });
    expect(enviar).toHaveBeenCalledTimes(antes);
  });

  it("encender avisa con la duración del apagón y confirma que los pasos mudos lo fueron", async () => {
    const { status, body } = await ponerPower({ activo: true, motivo: "ya está el catálogo" });

    expect(status).toBe(200);
    expect(body.power?.activo).toBe(true);
    expect(body.power?.apagadoAt).toBeNull();
    expect(await powerEnBase()).toMatchObject({
      activo: true, apagadoAt: null, motivo: "ya está el catálogo",
    });

    await vi.waitFor(() => expect(enviar).toHaveBeenCalledTimes(2), { timeout: 5_000, interval: 50 });
    const texto = avisos()[1];
    expect(texto).toContain("ENCENDIDO");
    expect(texto).toContain("ya está el catálogo");
    // La duración sale del apagadoAt ANTERIOR: al encender ya viene en null, y
    // si el endpoint tomara el nuevo, esta línea desaparecería del mensaje.
    expect(texto).toContain("Estuvo apagado");
    // Total exacto: si los dos guardados intermedios hubieran avisado tarde,
    // aquí habría 3 o 4 envíos en vez de 2. Sin dormir un tiempo fijo.
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  /**
   * El caso que más importa. Apagar el bot es una emergencia: si Meta está
   * caído, el apagado tiene que consumarse igual y el panel tiene que ver un 200.
   */
  it("si WhatsApp falla, el apagado se consuma igual y la respuesta sigue siendo 200", async () => {
    enviar.mockRejectedValueOnce(new Error("Meta caído: ventana cerrada"));
    const antes = enviar.mock.calls.length;

    const { status, body } = await ponerPower({ activo: false, motivo: "emergencia" });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.power?.activo).toBe(false);
    // Lo que de verdad protege al negocio: el estado quedó apagado en la BASE.
    expect(await powerEnBase()).toMatchObject({ activo: false, motivo: "emergencia" });

    // Se intentó avisar (y falló) sin que nada de eso llegara a la respuesta.
    await vi.waitFor(() => expect(enviar).toHaveBeenCalledTimes(antes + 1), {
      timeout: 5_000, interval: 50,
    });
  });
});
