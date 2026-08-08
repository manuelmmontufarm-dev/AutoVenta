import { beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

/**
 * Quién entra a Oportunidades y en qué grupo.
 *
 * El agujero que se tapa: un cliente que decía «voy el lunes» estando todavía
 * en 'cotizacion_enviada' no aparecía en NINGUNA pantalla. La consulta solo
 * admitía etapa 'seguimiento_venta', pidió-asesor o ventana cerrada, así que el
 * dato más accionable del sistema —una fecha— no tenía dónde mirarse.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";

const BASE = "autoventa_oportunidades_test";
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { listFollowUpBoard } = await import("../src/services/followUpAdmin.js");

async function crearChat(input: {
  phone: string;
  stage: string;
  visitDate?: Date | null;
  commitment?: string | null;
  pidioAsesor?: boolean;
}): Promise<number> {
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, stage, status, current_cycle,
      last_customer_message_at, visit_date, customer_commitment, customer_commitment_cycle)
    values (${input.phone}, ${`Cliente ${input.phone}`}, ${input.stage}, 'open', 1,
      now() - interval '10 minutes', ${input.visitDate ?? null},
      ${input.commitment ?? null}, ${input.commitment ? 1 : null})
    returning id
  `;
  const id = Number(fila.id);
  if (input.pidioAsesor) {
    await sql`
      insert into bot_alerts (conversation_id, cycle, type, priority, summary,
        exact_reason, suggested_action, dedupe_key)
      values (${id}, 1, 'human_requested', 'high', 'Pidió asesor', 'x', 'y', ${`${id}:1:human_requested`})
    `;
  }
  return id;
}

const enDosDias = () => new Date(Date.now() + 2 * 86_400_000);

beforeAll(async () => { await ensureSchema(); });

describe("Oportunidades · quién entra y en qué grupo", () => {
  it("el que dio fecha entra aunque siga en 'cotización enviada'", async () => {
    const id = await crearChat({
      phone: "593900020001", stage: "cotizacion_enviada",
      visitDate: enDosDias(), commitment: "Voy el lunes",
    });
    const tarjeta = (await listFollowUpBoard()).find((t) => t.conversationId === id);
    expect(tarjeta).toBeDefined();
    expect(tarjeta?.bucket).toBe("visita_confirmada");
    expect(tarjeta?.importanceLabel).toBe("Dijo que viene");
    expect(tarjeta?.commitment).toBe("Voy el lunes");
  });

  it("un tramo sin fecha exacta también cuenta como compromiso", async () => {
    const id = await crearChat({
      phone: "593900020002", stage: "seleccionando", commitment: "Paso este fin de semana",
    });
    const tarjeta = (await listFollowUpBoard()).find((t) => t.conversationId === id);
    expect(tarjeta?.bucket).toBe("visita_confirmada");
  });

  it("pedir un asesor pesa más que la fecha", async () => {
    const id = await crearChat({
      phone: "593900020003", stage: "cotizacion_enviada",
      visitDate: enDosDias(), commitment: "Voy el martes", pidioAsesor: true,
    });
    const tarjeta = (await listFollowUpBoard()).find((t) => t.conversationId === id);
    expect(tarjeta?.bucket).toBe("needs_human");
  });

  it("seguimiento sin fecha sigue en la recta final", async () => {
    const id = await crearChat({ phone: "593900020004", stage: "seguimiento_venta" });
    const tarjeta = (await listFollowUpBoard()).find((t) => t.conversationId === id);
    expect(tarjeta?.bucket).toBe("closing");
  });

  it("una conversación nueva y sin nada no ensucia la pantalla", async () => {
    const id = await crearChat({ phone: "593900020005", stage: "nuevo" });
    expect((await listFollowUpBoard()).find((t) => t.conversationId === id)).toBeUndefined();
  });

  it("los que ya debieron venir salen antes que los futuros", async () => {
    const atrasado = await crearChat({
      phone: "593900020006", stage: "seguimiento_venta",
      visitDate: new Date(Date.now() - 3 * 86_400_000), commitment: "Iba el viernes",
    });
    const futuro = await crearChat({
      phone: "593900020007", stage: "seguimiento_venta",
      visitDate: enDosDias(), commitment: "Voy el jueves",
    });
    const visitas = (await listFollowUpBoard()).filter((t) => t.bucket === "visita_confirmada");
    const posiciones = visitas.map((t) => t.conversationId);
    expect(posiciones.indexOf(atrasado)).toBeLessThan(posiciones.indexOf(futuro));
  });
});
