import { beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

/**
 * Un aviso que Meta rechaza tiene que verse rechazado.
 *
 * Reproduce el caso real del 8-ago: el número de Joaquín estaba mal tecleado en
 * el panel (+32 Bélgica en vez de +34 España), la Graph API aceptó los 62 envíos
 * devolviendo wamid, y después rechazó cada uno con el 131026 "Message
 * undeliverable". La tabla los mostró 'sent' todo el tiempo.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";

const BASE = "autoventa_no_entregado_test";
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

/** Meta acepta y devuelve wamid: exactamente lo que hace con un número que no existe. */
let wamidSeq = 0;
vi.mock("../src/wa/client.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/wa/client.js")>();
  return {
    ...real,
    sendAdvisorText: vi.fn(async () => `wamid.TEST_${++wamidSeq}`),
  };
});

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { notifyAdvisor } = await import("../src/services/advisorNotifications.js");
const { recordMessageStatus } = await import("../src/services/conversations.js");

const NUMERO_MALO = "32611771772";

async function conversacion(phone: string): Promise<{ id: number }> {
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle)
    values (${phone}, 'Cliente', 'open', 'cotizacion_enviada', 1)
    returning id
  `;
  return fila;
}

async function avisar(conversationId: number, dedupeKey: string): Promise<string> {
  await notifyAdvisor({
    conversationId,
    cycle: 1,
    eventType: "quote_created",
    dedupeKey,
    title: "Nueva cotización",
    reason: "4 × Kenda KR203",
    action: "Revisar el ticket.",
  });
  const [fila] = await sql<{ provider_message_id: string }[]>`
    select provider_message_id from advisor_notifications
    where dedupe_key = ${dedupeKey} and recipient_phone = ${NUMERO_MALO}
  `;
  return fila.provider_message_id;
}

beforeAll(async () => {
  await ensureSchema();
  await sql`
    insert into advisors (nombre, telefono, prioridad, active)
    values ('Joaquín Tamayo', ${NUMERO_MALO}, 1, true)
    on conflict (telefono) do nothing
  `;
});

describe("avisos al asesor que Meta no entrega", () => {
  it("el rechazo de Meta deja el aviso en 'failed' con el código, no en 'sent'", async () => {
    const conv = await conversacion("593980001001");
    const wamid = await avisar(conv.id, `${conv.id}:1:quote_created`);

    const [antes] = await sql<{ status: string }[]>`
      select status from advisor_notifications where provider_message_id = ${wamid}
    `;
    expect(antes.status).toBe("sent"); // así se veía siempre: aceptado por la Graph API

    await recordMessageStatus(wamid, "failed", {
      error: { code: 131026, title: "Message undeliverable" },
    });

    const [despues] = await sql<{ status: string; error: string }[]>`
      select status, error from advisor_notifications where provider_message_id = ${wamid}
    `;
    expect(despues.status).toBe("failed");
    expect(despues.error).toMatch(/131026/);
  });

  it("levanta una alerta con el número que hay que corregir", async () => {
    const [alerta] = await sql<{ type: string; exact_reason: string; summary: string }[]>`
      select type, exact_reason, summary from bot_alerts
      where type = 'advisor_notification_undelivered'
    `;
    expect(alerta.summary).toMatch(/Joaquín Tamayo/);
    expect(alerta.exact_reason).toMatch(new RegExp(`\\+${NUMERO_MALO}`));
  });

  it("62 avisos rebotados generan UNA alerta, no 62", async () => {
    for (let i = 0; i < 5; i += 1) {
      const conv = await conversacion(`59398000200${i}`);
      const wamid = await avisar(conv.id, `${conv.id}:1:quote_created`);
      await recordMessageStatus(wamid, "failed", {
        error: { code: 131026, title: "Message undeliverable" },
      });
    }
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from bot_alerts
      where type = 'advisor_notification_undelivered' and status in ('open','snoozed')
    `;
    expect(n).toBe(1);
  });

  it("cuando sí se entrega, queda la marca de entrega y el estado no se toca", async () => {
    const conv = await conversacion("593980003001");
    const wamid = await avisar(conv.id, `${conv.id}:1:quote_created`);

    await recordMessageStatus(wamid, "delivered", {});

    const [fila] = await sql<{ status: string; delivered_at: Date | null }[]>`
      select status, delivered_at from advisor_notifications where provider_message_id = ${wamid}
    `;
    expect(fila.status).toBe("sent");
    expect(fila.delivered_at).not.toBeNull();
  });
});
