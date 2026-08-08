import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

/**
 * Cableado REAL de los ecos contra una base Postgres de verdad.
 *
 * La lectura del payload ya está cubierta en echoes.test.ts (pura). Lo que aquí
 * se prueba es lo único que importaba en el ticket 1286: que un mensaje escrito
 * por el asesor desde WhatsApp TERMINE en la tabla `messages`, que salga por la
 * misma consulta que pinta el panel, y que el eco de nuestro propio envío no se
 * confunda con un humano y pause el bot por su propia respuesta.
 */

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";

const BASE = "autoventa_echoes_test";
const ADMIN_URL = "postgresql://manue@localhost/postgres";
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres(ADMIN_URL, { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const SECRET = "secret-de-esta-app";

// El canal se mockea porque handleEchoWebhook solo lo consulta para el app
// secret con el que valida la firma; la base NO se mockea (es lo que se prueba).
vi.mock("../src/services/channel.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/services/channel.js")>();
  return {
    ...real,
    getChannelConfig: vi.fn(async () => ({
      token: "t", phoneId: "1", appSecret: SECRET, verifyToken: "v", sellerPhone: "",
    })),
  };
});
// Los seguimientos que dispara setConversationAssignee salen por OpenAI/WhatsApp.
vi.mock("../src/services/followUps.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/services/followUps.js")>();
  return {
    ...real,
    scheduleConversationFollowUps: vi.fn(async () => {}),
    cancelPendingFollowUps: vi.fn(async () => {}),
  };
});

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { handleEchoWebhook } = await import("../src/wa/echoes.js");
const { getHubMessages } = await import("../src/services/hubData.js");
const { getHistory } = await import("../src/services/conversations.js");
const { registrarEnviado, _resetRegistroEnviados } = await import("../src/wa/outboundRegistry.js");
const { getEchoHealth } = await import("../src/services/echoHealth.js");

const TELEFONO = "593993676947";

function payload(field: string, mensajes: unknown[]): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field, value: { [field]: mensajes } }] }],
  });
}

const firmar = (body: string) =>
  `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

/** Manda el payload al webhook tal como llegaría de Meta, ya firmado. */
async function entregar(field: string, mensajes: unknown[]) {
  const body = payload(field, mensajes);
  return handleEchoWebhook(body, firmar(body));
}

const eco = (id: string, texto: string, to = TELEFONO) => ({
  from: "593982801766", to, id, timestamp: "1785941000", type: "text", text: { body: texto },
});

async function conversacionDe(telefono: string) {
  const [fila] = await sql<{ id: number; assigned_to: string; bot_paused_until: Date | null }[]>`
    select id, assigned_to, bot_paused_until from conversations where phone = ${telefono}
  `;
  return fila;
}

beforeAll(async () => {
  await ensureSchema();
}, 60_000);

beforeEach(() => _resetRegistroEnviados());

afterAll(async () => {
  await sql.end();
  const cierre = postgres(ADMIN_URL, { prepare: false, max: 1 });
  await cierre.unsafe(`drop database if exists ${BASE}`);
  await cierre.end();
});

describe("El asesor escribe desde WhatsApp (ticket 1286)", () => {
  it("el mensaje entra a la base y sale por la misma consulta que pinta el panel", async () => {
    const r = await entregar("message_echoes", [
      eco("wamid.ASESOR1", "¿Cuál es su nombre para la cotización?"),
    ]);
    expect(r).toMatchObject({ handled: true, status: 200, guardados: 1 });

    const conv = await conversacionDe(TELEFONO);
    const mensajes = await getHubMessages(conv.id);
    // Esto es literalmente lo que el panel dibuja como burbuja saliente.
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0]).toMatchObject({
      rol: "vendedor",
      tipo: "texto",
      contenido: "¿Cuál es su nombre para la cotización?",
    });
  });

  it("el agente lo ve en su historial: por eso deja de repreguntar lo ya resuelto", async () => {
    const conv = await conversacionDe(TELEFONO);
    const historial = await getHistory(conv.id);
    expect(historial).toContainEqual({
      role: "assistant",
      content: "¿Cuál es su nombre para la cotización?",
    });
  });

  it("la conversación pasa a control humano: el bot no habla encima del asesor", async () => {
    const conv = await conversacionDe(TELEFONO);
    expect(conv.assigned_to).toBe("human");
    expect(conv.bot_paused_until?.getTime()).toBeGreaterThan(Date.now());
  });

  it("Meta reentrega el mismo eco y no se duplica la burbuja", async () => {
    const conv = await conversacionDe(TELEFONO);
    const antes = (await getHubMessages(conv.id)).length;
    const r = await entregar("message_echoes", [
      eco("wamid.ASESOR1", "¿Cuál es su nombre para la cotización?"),
    ]);
    expect(r.guardados).toBe(0);
    expect(await getHubMessages(conv.id)).toHaveLength(antes);
  });

  it("smb_message_echoes (app de WhatsApp Business) entra igual", async () => {
    const r = await entregar("smb_message_echoes", [
      eco("wamid.ASESOR2", "Le espero en Quito Sur", "593900000777"),
    ]);
    expect(r.guardados).toBe(1);
    const conv = await conversacionDe("593900000777");
    expect((await getHubMessages(conv.id))[0]).toMatchObject({
      rol: "vendedor",
      contenido: "Le espero en Quito Sur",
    });
  });
});

describe("El eco de nuestro propio envío no puede pausar al bot", () => {
  it("se registra el wamid al enviar: el eco no cuenta como handoff", async () => {
    registrarEnviado("wamid.PROPIO");
    const r = await entregar("message_echoes", [
      eco("wamid.PROPIO", "Aquí está su cotización 👆", "593900000888"),
    ]);
    // Guardado sí (para que el panel lo muestre), handoff no.
    expect(r.guardados).toBe(0);
    const conv = await conversacionDe("593900000888");
    expect(conv.assigned_to).not.toBe("human");
    expect(await getHubMessages(conv.id)).toHaveLength(1);
  });
});

describe("Seguridad y encaminamiento", () => {
  it("una firma inválida no escribe nada y responde 401", async () => {
    const body = payload("message_echoes", [eco("wamid.FALSO", "transferencia a esta cuenta", "593900000999")]);
    const r = await handleEchoWebhook(body, "sha256=deadbeef");
    expect(r).toMatchObject({ handled: true, status: 401 });
    expect(await conversacionDe("593900000999")).toBeUndefined();
  });

  it("un mensaje entrante normal NO lo toca: sigue su camino a handle_post", async () => {
    const body = payload("messages", [eco("wamid.ENTRANTE", "hola")]);
    const r = await handleEchoWebhook(body, firmar(body));
    expect(r).toMatchObject({ handled: false });
  });

  it("un eco roto no tumba el lote: los buenos entran igual", async () => {
    const r = await entregar("message_echoes", [
      { ...eco("wamid.SIN_TO", "sin destinatario"), to: undefined },
      eco("wamid.BUENO", "Sí trabajamos con tarjeta de crédito", "593900000111"),
    ]);
    expect(r.guardados).toBe(1);
  });
});

/**
 * Lo que se descarta tiene que dejar rastro. Antes un eco rechazado moría en un
 * `console.error` que nadie lee, y desde el panel eso se veía igual que "el
 * asesor no escribió nada" — que es exactamente lo que pasó en el ticket 1848.
 */
describe("Salud de los ecos", () => {
  it("cuenta los que entran y los que se descartan, con el motivo", async () => {
    const antes = await getEchoHealth();

    const body = payload("message_echoes", [eco("wamid.MAL_FIRMADO", "hola", "593900000222")]);
    await handleEchoWebhook(body, "sha256=deadbeef");
    await entregar("message_echoes", [eco("wamid.CONTADO", "Le confirmo el stock", "593900000333")]);

    const salud = await getEchoHealth();
    expect(salud.guardados).toBe(antes.guardados + 1);
    expect(salud.descartados).toBe(antes.descartados + 1);
    expect(salud.ultimoDescarteMotivo).toBe("firma_invalida");
    expect(salud.ultimoGuardadoEn).not.toBeNull();
  });
});
