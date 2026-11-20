import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pidePrecioPorVolumen } from "../src/domain/cantidadGrande.js";

/**
 * PRUEBA COMPETIMOTOR 40 × 3 (18-nov-2026) · familia C: avisos al asesor.
 *
 * CM04 (3/3) y CM05 (2/3): `notificar_vendedor` corrió dos veces por lo mismo.
 * La alerta `caso_sin_resolver` quedó en el Hub, pero los asesores del perfil
 * no reciben ese tipo de aviso por WhatsApp, así que `advisor_notifications`
 * quedó vacía; el agente (que solo miraba esa tabla) creía que nunca se avisó y
 * le ordenaba al modelo volver a notificar.
 *
 * CM35: «precio especial por volumen?» con 12 llantas en la ficha: el bot dijo
 * «lo confirma un asesor» y no se avisó a nadie.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_aviso_ciclo_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

vi.mock("../src/wa/client.js", () => ({
  sendText: async () => "wamid", sendTemplate: async () => "wamid", sendImage: async () => "wamid", sendPdf: async () => "wamid",
}));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { avisoRegistradoEnElCiclo, avisarPrecioPorVolumen } = await import("../src/services/avisoAlAsesor.js");
const { createBotAlert } = await import("../src/services/followUps.js");

async function conversacion(phone: string, extra: { selected_quantity?: number } = {}) {
  const [fila] = await sql<{ id: number; current_cycle: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, selected_quantity)
    values (${phone}, 'Cliente', 'open', 'seleccionando', 1, ${extra.selected_quantity ?? null})
    returning id, current_cycle
  `;
  return fila;
}
const alertas = (id: number) => sql<{ type: string }[]>`select type from bot_alerts where conversation_id=${id}`;

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("¿ya se le pasó el caso a un asesor en el ciclo?", () => {
  it("CM04: con la alerta caso_sin_resolver y sin fila en advisor_notifications → sí", async () => {
    const c = await conversacion("593900000401");
    await createBotAlert({
      conversationId: c.id, cycle: 1, type: "caso_sin_resolver", priority: "high",
      summary: "Cliente pide traer de otro local", exactReason: "x", suggestedAction: "y",
      dedupeKey: `${c.id}:1:caso_sin_resolver`,
    });
    expect(await avisoRegistradoEnElCiclo(c.id, 1)).toBe(true);
  });

  it("sin nada → no; una alerta de otro ciclo o una visita no cuentan", async () => {
    const c = await conversacion("593900000402");
    expect(await avisoRegistradoEnElCiclo(c.id, 1)).toBe(false);
    await createBotAlert({
      conversationId: c.id, cycle: 1, type: "visita_comprometida", priority: "high",
      summary: "viene el sábado", exactReason: "x", suggestedAction: "y", dedupeKey: `${c.id}:1:visita`,
    });
    await createBotAlert({
      conversationId: c.id, cycle: 2, type: "caso_sin_resolver", priority: "high",
      summary: "otro ciclo", exactReason: "x", suggestedAction: "y", dedupeKey: `${c.id}:2:caso_sin_resolver`,
    });
    expect(await avisoRegistradoEnElCiclo(c.id, 1)).toBe(false);
  });
});

describe.sequential("CM35 · precio por volumen de una compra grande avisa al asesor", () => {
  it("«precio especial por volumen?» con 12 en la ficha: una alerta caso_sin_resolver, y una sola aunque se repita", async () => {
    const c = await conversacion("593900003501", { selected_quantity: 12 });
    expect(await avisarPrecioPorVolumen(c, "precio especial por volumen?")).toBe(true);
    expect(await avisarPrecioPorVolumen(c, "precio especial por volumen?")).toBe(true);
    // (sin asesores en la base de prueba, notifyAdvisor deja además «advisor_notification_failed»)
    expect((await alertas(c.id)).map((a) => a.type).filter((t) => t === "caso_sin_resolver")).toEqual(["caso_sin_resolver"]);
    expect(await avisoRegistradoEnElCiclo(c.id, 1)).toBe(true);
  });

  it("con 4 llantas no es volumen: no avisa", async () => {
    const c = await conversacion("593900003502", { selected_quantity: 4 });
    expect(await avisarPrecioPorVolumen(c, "precio especial por volumen?")).toBe(false);
    expect(await alertas(c.id)).toEqual([]);
  });

  it("la lectura pura", () => {
    expect(pidePrecioPorVolumen("precio especial por volumen?", 12)).toBe(true);
    expect(pidePrecioPorVolumen("necesito 20 llantas, hay precio mayorista?", null)).toBe(true);
    expect(pidePrecioPorVolumen("precio especial por volumen?", 4)).toBe(false);
    expect(pidePrecioPorVolumen("cuanto las 12?", 12)).toBe(false);
  });
});
