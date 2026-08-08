import { beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

/**
 * Qué pasa cuando vence la pausa del handoff.
 *
 * El 8-ago Manuel lo vio así: «en la página sale como si responde pero en vida
 * real no». La cadena era esta — un asesor toma el chat (assigned_to='human' +
 * pausa de 6 h), pasan las 6 h, nadie lo devuelve, y desde ahí cada mensaje del
 * cliente disparaba un turno COMPLETO del modelo que la política bloqueaba al
 * enviar por `human_control`. Plata gastada y un mensaje fallido que el panel
 * pintaba como entregado.
 *
 * Se prueban las dos mitades del arreglo: que el chat vuelva al bot cuando el
 * plazo se cumplió, y que NO vuelva mientras el asesor sigue dentro de su
 * ventana — pisarle la conversación a alguien que está atendiendo sería peor
 * que el problema original.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";

const BASE = "autoventa_handoff_test";
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { devolverAlBotSiVencioLaPausa } = await import("../src/services/conversations.js");
const { authorizeConversationOutbound } = await import("../src/services/whatsappPolicy.js");

async function crearChat(
  phone: string, assignedTo: "bot" | "human", pausaHasta: Date | null,
): Promise<number> {
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, stage, status, current_cycle, assigned_to,
      bot_paused_until, last_customer_message_at)
    values (${phone}, 'seleccionando', 'open', 1, ${assignedTo}, ${pausaHasta}, now())
    returning id
  `;
  return Number(fila.id);
}

const enUnaHora = () => new Date(Date.now() + 3_600_000);
const haceUnaHora = () => new Date(Date.now() - 3_600_000);

beforeAll(async () => { await ensureSchema(); });

describe("Pausa del handoff vencida", () => {
  it("devuelve el chat al bot y con eso vuelve a poder enviar", async () => {
    const id = await crearChat("593900010001", "human", haceUnaHora());

    // Antes: el bot habría redactado y la política le bloquea el envío. Ese es
    // exactamente el turno de modelo que se estaba tirando a la basura.
    const antes = await authorizeConversationOutbound({
      conversationId: id, contentType: "text", actor: "bot",
    });
    expect(antes).toMatchObject({ allowed: false, code: "human_control" });

    expect(await devolverAlBotSiVencioLaPausa(id)).toBe(true);

    const despues = await authorizeConversationOutbound({
      conversationId: id, contentType: "text", actor: "bot",
    });
    expect(despues.allowed).toBe(true);
  });

  it("no le pisa la conversación al asesor que todavía está dentro del plazo", async () => {
    const id = await crearChat("593900010002", "human", enUnaHora());
    expect(await devolverAlBotSiVencioLaPausa(id)).toBe(false);
    const [fila] = await sql<{ assigned_to: string }[]>`
      select assigned_to from conversations where id = ${id}
    `;
    expect(fila.assigned_to).toBe("human");
  });

  it("no toca los chats que ya son del bot", async () => {
    const id = await crearChat("593900010003", "bot", null);
    expect(await devolverAlBotSiVencioLaPausa(id)).toBe(false);
  });

  /**
   * Filas viejas con `assigned_to='human'` y sin pausa: sin esto se quedaban
   * mudas para siempre, que es el caso que originó todo.
   */
  it("rescata los chats humanos que quedaron sin plazo", async () => {
    const id = await crearChat("593900010004", "human", null);
    expect(await devolverAlBotSiVencioLaPausa(id)).toBe(true);
  });
});
