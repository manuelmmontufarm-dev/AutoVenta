import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * DESHACER UN «VENDIDO» POR ERROR (21-nov, Eric Acosta en Competimotor).
 *
 * Mover el chat de `ganado` a una etapa abierta en la misma visita lo reabre
 * con su día y su cotización (Para cerrar lo vuelve a mostrar), y la venta que
 * no pasó deja de contarse: su fila de `sales_history` se va. Reabrir con
 * `reopenConversation` no sirve para esto: empieza una visita nueva y guarda el
 * cierre como venta.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_deshacer_cierre_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { setStage } = await import("../src/services/conversations.js");
await ensureSchema();

afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

async function chatConVisita(phone: string): Promise<number> {
  const visita = new Date("2026-11-22T15:00:00Z");
  const [c] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, visit_date, visit_time_label)
    values (${phone}, 'Eric', 'open', 'seguimiento_venta', 1, '265/70R16', ${visita}, '10:00')
    returning id
  `;
  await sql`insert into quotes (conversation_id, items, subtotal, tax, total, cycle)
    values (${c.id}, ${sql.json([{ quantity: 4, brand: "KENDA", design: "KR28" }])}, 400, 60, 460, 1)`;
  return c.id;
}

describe("deshacer un cierre en la misma visita", () => {
  it("ganado → seguimiento: abierto, mismo ciclo, día y cotización intactos, y la venta deja de contarse", async () => {
    const id = await chatConVisita("593990000001");
    await setStage(id, "ganado", { actor: "owner", reason: "ganado" });
    const [venta] = await sql`select count(*)::int as n from sales_history where conversation_id=${id} and outcome='ganado'`;
    expect(venta.n).toBe(1);

    await setStage(id, "seguimiento_venta", { actor: "owner", reason: "Vendido por error" });

    const [c] = await sql`select status, stage, current_cycle, closed_at, visit_date, visit_time_label from conversations where id=${id}`;
    expect(c).toMatchObject({ status: "open", stage: "seguimiento_venta", current_cycle: 1, closed_at: null, visit_time_label: "10:00" });
    expect(c.visit_date).not.toBeNull();
    const [q] = await sql`select count(*)::int as n from quotes where conversation_id=${id} and cycle=1`;
    expect(q.n).toBe(1);
    const [despues] = await sql`select count(*)::int as n from sales_history where conversation_id=${id}`;
    expect(despues.n).toBe(0);
    const [t] = await sql`select from_stage, to_stage from stage_transitions where conversation_id=${id} order by id desc limit 1`;
    expect(t).toMatchObject({ from_stage: "ganado", to_stage: "seguimiento_venta" });
  });

  it("pasar de una etapa abierta a otra no toca las ventas de visitas anteriores", async () => {
    const id = await chatConVisita("593990000002");
    await sql`insert into sales_history (conversation_id, cycle, outcome, total, closed_at) values (${id}, 0, 'ganado', 300, now())`;
    await setStage(id, "cotizacion_enviada", { actor: "owner" });
    const [n] = await sql`select count(*)::int as n from sales_history where conversation_id=${id}`;
    expect(n.n).toBe(1);
  });
});
