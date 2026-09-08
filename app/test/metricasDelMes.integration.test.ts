import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = `autoventa_metricas_mes_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let hubData: typeof import("../src/services/hubData.js");
let followUpAdmin: typeof import("../src/services/followUpAdmin.js");

/**
 * El dashboard arranca de cero cada mes: lo que se acumula (cotizaciones,
 * llegadas al final, piezas, entregas, seguimientos, descuentos) cuenta solo
 * desde el día 1. La base sigue guardando todo — lo que cambia es lo que el
 * panel lee.
 *
 * El sembrado es deliberadamente simétrico: el mes pasado y el mes en curso
 * tienen exactamente los mismos hechos. Sin el corte, cada número saldría al
 * doble; con el corte, cada uno vale 1.
 */
describe.sequential("Métricas del mes en curso", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.unsafe(`create database ${testDatabase}`);

    process.env.DATABASE_URL = `postgresql://manue@localhost/${testDatabase}`;
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";
    process.env.OPENAI_API_KEY = "test";

    const db = await import("../src/db/client.js");
    appSql = db.sql;
    const schema = await import("../src/db/schema.js");
    await schema.ensureSchema();
    hubData = await import("../src/services/hubData.js");
    followUpAdmin = await import("../src/services/followUpAdmin.js");

    await sembrar();
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  it("el período empieza el día 1 a las 00:00 de Guayaquil", async () => {
    const { periodo } = await hubData.getHubMetrics();
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(periodo.desde));
    const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value;

    expect(parte("day")).toBe("01");
    expect(parte("hour")).toBe("00");
    expect(parte("minute")).toBe("00");
    expect(new Date(periodo.hasta).getTime()).toBeGreaterThan(new Date(periodo.desde).getTime());
  });

  it("cotizaciones, ventas y llegadas al final cuentan solo este mes", async () => {
    const metrics = await hubData.getHubMetrics();

    expect(metrics.summary.cotizaciones).toBe(1);
    expect(metrics.summary.ganados).toBe(1);
    expect(metrics.summary.vendido).toBe(400);
    expect(metrics.summary.primeraRespuestaSegundos).toBe(30);
    expect(metrics.reachedFinal.total).toBe(1);
    expect(metrics.reachedFinal.cotizados).toBe(1);
    expect(metrics.reachedFinal.cotizadosQueLlegaron).toBe(1);
    expect(metrics.reachedFinal.ganados).toBe(1);
    expect(metrics.reachedFinal.valor).toBe(400);
  });

  it("los tickets abiertos y el pipeline no se reinician: son estado de hoy", async () => {
    const metrics = await hubData.getHubMetrics();

    // El ticket del mes pasado sigue abierto y su plata sigue en juego. Ponerlo
    // en cero el día 1 escondería trabajo vivo, que es lo contrario de reiniciar
    // un contador.
    expect(metrics.summary.abiertos).toBe(2);
    expect(metrics.summary.enJuego).toBe(500);
    expect(metrics.reachedFinal.abiertosAhora).toBe(0);
  });

  it("la serie diaria va del día 1 a hoy, no de los últimos 14 días", async () => {
    const metrics = await hubData.getHubMetrics();
    const hoy = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    expect(metrics.daily[0].day).toBe(`${hoy.slice(0, 7)}-01`);
    expect(metrics.daily.at(-1)?.day).toBe(hoy);
    expect(metrics.daily).toHaveLength(Number(hoy.slice(8, 10)));
    expect(metrics.daily[0].value).toBe(2);
  });

  it("el embudo cuenta los ciclos que empezaron este mes", async () => {
    const metrics = await hubData.getHubMetrics();
    const etapa = (stage: string) =>
      metrics.funnel.find((row) => row.stage === stage)?.value ?? 0;

    expect(etapa("nuevo")).toBe(2);
    expect(etapa("cotizacion_enviada")).toBe(1);
    expect(etapa("seguimiento_venta")).toBe(1);
    expect(etapa("ganado")).toBe(1);
  });

  it("entregas, piezas visuales, horas de respuesta y descuentos se reinician", async () => {
    const metrics = await hubData.getHubMetrics();

    expect(metrics.deliveries.find((row) => row.status === "delivered")?.value).toBe(1);
    expect(metrics.visualPieces.find((p) => p.piece === "quote")?.sent).toBe(1);
    expect(metrics.replyHours.reduce((total, row) => total + row.replies, 0)).toBe(1);
    expect(metrics.discounts.offered).toBe(1);
    expect(metrics.discounts.totalDiscount).toBe(20);
  });

  it("los seguimientos también cuentan desde el día 1", async () => {
    const followUps = await followUpAdmin.getFollowUpMetrics();

    expect(Number(followUps.sent)).toBe(1);
    expect(Number(followUps.opt_outs)).toBe(1);
    expect(Number(followUps.template_delivered)).toBe(1);
  });
});

/** Mismo guion dos veces: mes cerrado y mes en curso. */
async function sembrar(): Promise<void> {
  const [{ inicio }] = await appSql<{ inicio: Date }[]>`
    select (date_trunc('month', now() at time zone 'America/Guayaquil')
      at time zone 'America/Guayaquil') as inicio
  `;
  const mas = (base: Date, minutos: number) => new Date(base.getTime() + minutos * 60_000);
  // Día 1 al mediodía: siempre dentro del mes en curso, nunca en el borde.
  const esteMes = mas(inicio, 12 * 60);
  // 21 días antes del día 1: siempre en el mes anterior, cualquiera sea su largo.
  const mesPasado = mas(inicio, -21 * 24 * 60);

  for (const [telefono, nombre, cuando] of [
    ["593000000201", "Vieja", mesPasado],
    ["593000000202", "Nueva", esteMes],
  ] as const) {
    const [conv] = await appSql<{ id: number }[]>`
      insert into conversations (phone, name, stage, status, closed_at, created_at, updated_at)
      values (${telefono}, ${nombre}, 'ganado', 'closed', ${mas(cuando, 60)}, ${cuando}, ${cuando})
      returning id
    `;
    await appSql`
      insert into messages (conversation_id, role, content, direction, author_kind, type, status, metadata, cycle, created_at)
      values
        (${conv.id}, 'user', 'hola', 'inbound', 'customer', 'text', null, '{}'::jsonb, 1, ${cuando}),
        (${conv.id}, 'assistant', 'buenas', 'outbound', 'bot', 'text', 'delivered', '{}'::jsonb, 1, ${mas(cuando, 0.5)}),
        (${conv.id}, 'user', 'gracias', 'inbound', 'customer', 'text', null, '{}'::jsonb, 1, ${mas(cuando, 2)}),
        (${conv.id}, 'assistant', 'cotización', 'outbound', 'bot', 'image', 'sent', '{"piece":"quote"}'::jsonb, 1, ${mas(cuando, 3)})
    `;
    await appSql`
      insert into quotes (conversation_id, cycle, items, subtotal, tax, total, created_at)
      values (${conv.id}, 1, '[]'::jsonb, 350, 50, 400, ${mas(cuando, 3)})
    `;
    await appSql`
      insert into stage_transitions (conversation_id, cycle, from_stage, to_stage, created_at)
      values
        (${conv.id}, 1, 'nuevo', 'cotizacion_enviada', ${mas(cuando, 3)}),
        (${conv.id}, 1, 'cotizacion_enviada', 'seguimiento_venta', ${mas(cuando, 10)})
    `;
    await appSql`
      insert into sales_history (conversation_id, cycle, outcome, total, closed_at)
      values (${conv.id}, 1, 'ganado', 400, ${mas(cuando, 60)})
    `;
    await appSql`
      insert into discount_offers (conversation_id, cycle, kind, value_cents, base_total_cents,
        discount_amount_cents, final_total_cents, reason, condition_text, status, created_at, updated_at)
      values (${conv.id}, 1, 'total_amount', 2000, 42000, 2000, 40000, 'cierre', 'hoy', 'offered',
        ${mas(cuando, 5)}, ${mas(cuando, 5)})
    `;
    const [job] = await appSql<{ id: number }[]>`
      insert into follow_up_jobs (conversation_id, cycle, type, due_at, status, idempotency_key, created_at, executed_at)
      values (${conv.id}, 1, 'recordatorio', ${mas(cuando, 20)}, 'sent', ${`fu-${telefono}`},
        ${mas(cuando, 15)}, ${mas(cuando, 20)})
      returning id
    `;
    await appSql`
      insert into follow_up_attempts (job_id, conversation_id, cycle, attempt_number, status, message_type, created_at)
      values (${job.id}, ${conv.id}, 1, 1, 'delivered', 'template', ${mas(cuando, 20)})
    `;
    await appSql`
      update conversations set opted_out_at = ${mas(cuando, 30)} where id = ${conv.id}
    `;
  }

  // Recién llegado de este mes: sin cotización, alimenta el escalón "nuevo".
  await appSql`
    insert into conversations (phone, name, stage, status, created_at, updated_at)
    values ('593000000203', 'Recién Llegado', 'nuevo', 'open', ${esteMes}, ${esteMes})
  `;
  // Abierto desde el mes pasado, con cotización vieja: sigue siendo trabajo
  // vivo, así que tiene que seguir contando en abiertos y en el pipeline.
  const [viejoAbierto] = await appSql<{ id: number }[]>`
    insert into conversations (phone, name, stage, status, created_at, updated_at)
    values ('593000000204', 'Abierto Viejo', 'cotizacion_enviada', 'open', ${mesPasado}, ${mesPasado})
    returning id
  `;
  await appSql`
    insert into quotes (conversation_id, cycle, items, subtotal, tax, total, created_at)
    values (${viejoAbierto.id}, 1, '[]'::jsonb, 440, 60, 500, ${mesPasado})
  `;
}
