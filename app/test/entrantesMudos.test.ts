import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { entranteMudo, mensajeDeLaNovedad, textoDeRescate } from "../src/domain/entranteMudo.js";

/**
 * 25-nov-2026, Competimotor conv 1321: el asesor retomó el chat y en el panel
 * no se veía nada más del cliente. Una reacción, un `unsupported`, un pedido
 * del catálogo o un aviso de sistema se descartaban sin fila ni log, y un
 * mensaje cuyo procesamiento fallaba 3 veces desaparecía. Regla nueva: TODO lo
 * que entra deja una fila que el panel muestra — sin despertar al bot.
 */

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";

const BASE = "autoventa_entrantes_mudos_test";
const ADMIN_URL = "postgresql://manue@localhost/postgres";
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres(ADMIN_URL, { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { guardarEntranteMudo, rescatarEntrante } = await import("../src/services/entrantesMudos.js");
const { appendMessage, getOrCreateConversation } = await import("../src/services/conversations.js");
const { getHubMessages } = await import("../src/services/hubData.js");

const CLIENTE = "593982866398";
const AHORA = new Date("2026-11-24T20:40:00Z");

const novedad = (message: Record<string, unknown>, nombre = "Cirio") => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { phone_number_id: "PHONE" },
    contacts: [{ wa_id: message.from, profile: { name: nombre } }], messages: [message],
  } }] }],
});

async function ficha(telefono: string) {
  const [fila] = await sql<{ id: number; unread_count: number; last_customer_message_at: Date | null; status: string; current_cycle: number }[]>`
    select id, unread_count, last_customer_message_at, status, current_cycle from conversations where phone = ${telefono}
  `;
  return fila;
}

beforeAll(async () => { await ensureSchema(); }, 60_000);
afterAll(async () => {
  await sql.end();
  const cierre = postgres(ADMIN_URL, { prepare: false, max: 1 });
  await cierre.unsafe(`drop database if exists ${BASE}`);
  await cierre.end();
});

describe("entranteMudo (lectura del payload)", () => {
  it("lo que tiene camino propio no es mudo", () => {
    expect(entranteMudo({ type: "text", text: { body: "hola" } })).toBeNull();
    expect(entranteMudo({ type: "image", image: { id: "1" } })).toBeNull();
    expect(entranteMudo({ type: "sticker", sticker: { id: "1" } })).toBeNull();
    expect(entranteMudo({ type: "interactive", interactive: { type: "button_reply", button_reply: { id: "a", title: "Sí" } } })).toBeNull();
    expect(entranteMudo({ type: "button", button: { text: "Sí voy" } })).toBeNull();
  });

  it("una reacción se lee con su emoji y no cuenta como actividad", () => {
    const m = entranteMudo({ type: "reaction", reaction: { emoji: "👍", message_id: "wamid.X" } });
    expect(m).toMatchObject({ clase: "reaccion", cuentaComoActividad: false, detalle: { emoji: "👍", aMensaje: "wamid.X" } });
    expect(m?.texto).toContain("👍");
    expect(entranteMudo({ type: "reaction", reaction: { message_id: "wamid.X" } })?.texto).toContain("quitó su reacción");
  });

  it("unsupported, unknown, pedido, sistema, formulario y botón vacío dejan texto para el asesor", () => {
    const ns = entranteMudo({ type: "unsupported", errors: [{ code: 131051, title: "Message type unknown" }] });
    expect(ns).toMatchObject({ clase: "no_soportado", cuentaComoActividad: true, detalle: { codigo: 131051, motivo: "Message type unknown" } });
    expect(entranteMudo({ type: "unknown" })?.clase).toBe("no_soportado");
    expect(entranteMudo({ type: "order", order: { product_items: [{}, {}], text: "los quiero hoy" } })?.texto).toMatch(/2 productos[\s\S]*los quiero hoy/);
    expect(entranteMudo({ type: "system", system: { body: "User A changed from 1 to 2" } })?.texto).toContain("changed from");
    expect(entranteMudo({ type: "interactive", interactive: { type: "nfm_reply", nfm_reply: {} } })?.clase).toBe("formulario");
    expect(entranteMudo({ type: "button", button: {} })?.clase).toBe("boton_vacio");
  });

  it("el texto de rescate conserva lo que el cliente escribió", () => {
    expect(textoDeRescate({ type: "text", text: { body: "  225/60R17  " } })).toBe("225/60R17");
    expect(textoDeRescate({ type: "image", image: { id: "1", caption: "esta llanta" } })).toMatch(/una foto[\s\S]*esta llanta/);
    expect(textoDeRescate({ type: "raro" })).toContain("un mensaje");
  });

  it("mensajeDeLaNovedad saca el mensaje y el remitente; un status no es un mensaje", () => {
    expect(mensajeDeLaNovedad(novedad({ from: CLIENTE, id: "wamid.A", type: "text", text: { body: "hola" } })))
      .toMatchObject({ from: CLIENTE, name: "Cirio", message: { id: "wamid.A" } });
    expect(mensajeDeLaNovedad({ entry: [{ changes: [{ field: "messages", value: { statuses: [{ id: "wamid.S" }] } }] }] })).toBeNull();
  });
});

describe("Lo que el bot no contesta igual queda en el panel", () => {
  it("un `unsupported` del cliente se guarda, suma no leídos y sale por la consulta del panel", async () => {
    const conv = await getOrCreateConversation(CLIENTE, "Cirio");
    await appendMessage(conv.id, "assistant", "Me quedo al pendiente", "wamid.ASESOR", { authorKind: "owner", status: "sent" });
    const mudo = entranteMudo({ type: "unsupported", errors: [{ code: 131051, title: "Message type unknown" }] })!;
    expect(await guardarEntranteMudo(CLIENTE, "Cirio", "wamid.NS1", mudo, AHORA)).toBe(conv.id);

    const hilo = await getHubMessages(conv.id);
    const fila = hilo.find((m) => m.metadata?.mudo === "no_soportado");
    expect(fila).toMatchObject({ rol: "cliente" });
    expect(fila?.contenido).toContain("celular del negocio");
    const f = await ficha(CLIENTE);
    expect(f.unread_count).toBe(1);
    expect(f.last_customer_message_at?.toISOString()).toBe(AHORA.toISOString());
  });

  it("la reentrega de Meta no duplica la fila", async () => {
    const mudo = entranteMudo({ type: "unsupported" })!;
    expect(await guardarEntranteMudo(CLIENTE, "Cirio", "wamid.NS1", mudo, AHORA)).toBeNull();
    expect((await ficha(CLIENTE)).unread_count).toBe(1);
  });

  it("una reacción se guarda pero NO mueve el reloj del cliente", async () => {
    const antes = await ficha(CLIENTE);
    const mudo = entranteMudo({ type: "reaction", reaction: { emoji: "👍", message_id: "wamid.ASESOR" } })!;
    const cuando = new Date(AHORA.getTime() + 3_600_000);
    expect(await guardarEntranteMudo(CLIENTE, "Cirio", "wamid.R1", mudo, cuando)).toBe(antes.id);
    const despues = await ficha(CLIENTE);
    expect(despues.unread_count).toBe(antes.unread_count + 1);
    expect(despues.last_customer_message_at?.toISOString()).toBe(antes.last_customer_message_at?.toISOString());
    expect((await getHubMessages(antes.id)).some((m) => m.contenido.includes("👍"))).toBe(true);
  });

  it("el 👍 de un número sin chat (un asesor reaccionando a un aviso) no abre un lead", async () => {
    const mudo = entranteMudo({ type: "reaction", reaction: { emoji: "👍", message_id: "wamid.AVISO" } })!;
    expect(await guardarEntranteMudo("593990000001", "Asesor", "wamid.R2", mudo, AHORA)).toBeNull();
    expect(await ficha("593990000001")).toBeUndefined();
  });

  it("sobre una venta cerrada se guarda sin reabrir el ciclo", async () => {
    const tel = "593990000002";
    const conv = await getOrCreateConversation(tel, "Cerrado");
    await sql`update conversations set status = 'closed', closed_at = now() where id = ${conv.id}`;
    const mudo = entranteMudo({ type: "order", order: { product_items: [{}] } })!;
    expect(await guardarEntranteMudo(tel, "Cerrado", "wamid.O1", mudo, AHORA)).toBe(conv.id);
    expect(await ficha(tel)).toMatchObject({ status: "closed", current_cycle: conv.current_cycle });
  });
});

describe("Rescate: el mensaje que falló todas las veces no desaparece", () => {
  it("guarda el texto tal cual, marcado como rescate, y lo muestra el panel", async () => {
    const tel = "593990000003";
    const id = await rescatarEntrante(novedad({ from: tel, id: "wamid.F1", timestamp: "1795552800", type: "text", text: { body: "Sí me interesan las dos" } }, "Rescatado"));
    expect(id).toBeTruthy();
    const hilo = await getHubMessages(id!);
    expect(hilo).toHaveLength(1);
    expect(hilo[0]).toMatchObject({ rol: "cliente", contenido: "Sí me interesan las dos" });
    expect(hilo[0].metadata).toMatchObject({ rescate: true, waType: "text" });
  });

  it("no duplica lo que ya estaba guardado, ni lanza con un payload que no es mensaje", async () => {
    expect(await rescatarEntrante(novedad({ from: "593990000003", id: "wamid.F1", type: "text", text: { body: "otra vez" } }))).toBeNull();
    expect(await rescatarEntrante({ entry: [{ changes: [{ field: "messages", value: { statuses: [{ id: "x" }] } }] }] })).toBeNull();
    expect(await rescatarEntrante(null)).toBeNull();
  });
});
