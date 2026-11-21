/**
 * CONV 469 CONTRA UNA BASE DE VERDAD (Competimotor, 21-nov-2026).
 *
 * El asesor vendió a mano 4 × 235/75R15 Townhall MT, se despidió a las 08:39
 * («Muchas gracias por elegir COMPETIMOTOR…») y a las 08:48 marcó la venta como
 * ganada desde el panel. A las 09:39 el cliente escribió «Me confirma amigo si
 * consiguió las llantas»: el ciclo 2 se abrió con la ficha vacía y el bot —que
 * solo lee su ciclo— contestó «Todavía no tengo una medida confirmada…».
 *
 * Alcance final (Manuel, 21-nov 11:29): «ganado» se marca cuando el cliente YA
 * compró, así que el ciclo nuevo lo contesta el bot. Quedan dos reglas:
 *  2. con fecha de llegada o visita vigente, la memoria no vence por silencio,
 *     y la fecha no se borra al reabrir una venta ganada;
 *  3. el ciclo nuevo lleva la ficha del anterior (datos guardados) y el bot no
 *     vuelve a pedir la medida a quien ya compró.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = `autoventa_ficha_anterior_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let conversations: typeof import("../src/services/conversations.js");
let turno: typeof import("../src/services/turnoDelHumano.js");
let ficha: typeof import("../src/services/fichaDelCicloAnterior.js");
let agent: typeof import("../src/agent/agent.js");

const HORA = 3_600_000;
const DIA = 24 * HORA;
const DESPEDIDA = "Muchas gracias por elegir *COMPETIMOTOR* su seguridad y su confianza son lo primero 🚗🔧";

/** 'YYYY-MM-DD' del día en Guayaquil, `offsetDias` desde hoy. */
function diaLocal(offsetDias: number): string {
  return new Date(Date.now() + offsetDias * DIA - 5 * HORA).toISOString().slice(0, 10);
}

/** El ciclo 1 de la conv 469: el asesor vendió y se despidió; la venta se marcó ganada hace `haceMs`. */
async function ventaGanadaPorElAsesor(phone: string, haceMs: number, extra: { pickup?: string } = {}) {
  const conv = await conversations.getOrCreateConversation(phone, "Abg Jumbo");
  const cierre = new Date(Date.now() - haceMs);
  await appSql`
    update conversations set stage = 'seguimiento_venta', assigned_to = 'human', bot_paused_reason = 'persona_escribio',
      last_customer_message_at = ${new Date(cierre.getTime() - 12 * 60_000)},
      last_assistant_message_at = ${new Date(cierre.getTime() - 40 * 60_000)}
    where id = ${conv.id}
  `;
  await appSql`
    insert into messages (conversation_id, cycle, role, direction, type, author_kind, content, created_at) values
      (${conv.id}, 1, 'user', 'inbound', 'text', 'customer', 'Llantas 23575r15', ${new Date(cierre.getTime() - 20 * HORA)}),
      (${conv.id}, 1, 'assistant', 'outbound', 'text', 'owner', 'Si mi estimado ese sería el valor por las 4 llantas', ${new Date(cierre.getTime() - 38 * 60_000)}),
      (${conv.id}, 1, 'user', 'inbound', 'text', 'customer', 'Me confirma amigo si llego ?', ${new Date(cierre.getTime() - 12 * 60_000)}),
      (${conv.id}, 1, 'assistant', 'outbound', 'text', 'owner', ${DESPEDIDA}, ${new Date(cierre.getTime() - 9 * 60_000)})
  `;
  if (extra.pickup) await appSql`update conversations set pickup_date = ${extra.pickup}::date where id = ${conv.id}`;
  await conversations.setStage(conv.id, "ganado", { actor: "owner", reason: "Compro 235/75R15 TOWNHALL MT" });
  await appSql`update conversations set closed_at = ${cierre} where id = ${conv.id}`;
  await appSql`update sales_history set closed_at = ${cierre} where conversation_id = ${conv.id}`;
  return conv;
}

describe.sequential("la ficha del ciclo anterior y la memoria con fecha", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.unsafe(`create database ${testDatabase}`);
    process.env.DATABASE_URL = `postgresql://manue@localhost/${testDatabase}`;
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";
    process.env.SELLER_PHONE = "593000000000";
    process.env.OPENAI_API_KEY = "test";
    process.env.GRAPH_BASE_URL = "http://127.0.0.1:9";

    appSql = (await import("../src/db/client.js")).sql;
    await (await import("../src/db/schema.js")).ensureSchema();
    conversations = await import("../src/services/conversations.js");
    turno = await import("../src/services/turnoDelHumano.js");
    ficha = await import("../src/services/fichaDelCicloAnterior.js");
    agent = await import("../src/agent/agent.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  it("conv 469: el ciclo nuevo lo contesta el bot, pero con la ficha de la compra y sin la orden de pedir la medida", async () => {
    const conv = await ventaGanadaPorElAsesor("593993873816", 51 * 60_000);
    // La venta del panel: factura y monto (ventas_registradas, PR #80).
    await appSql`
      insert into ventas_registradas (vendedor, telefono, tel9, factura, monto, vino_de_whatsapp, conversation_id, cycle, dia)
      values ('Andre', '593993873816', '993873816', '001-002-000012345', 437, true, ${conv.id}, 1, current_date)
    `;

    const reabierta = await conversations.getOrCreateConversation("593993873816");
    expect(reabierta.current_cycle).toBe(2);
    expect((await turno.decidirQuienContesta(conv.id, "Me confirma amigo si consiguió las llantas )")).contesta).toBe("bot");

    const leida = await ficha.leerFichaDelCicloAnterior(conv.id);
    expect(leida).toMatchObject({
      cycle: 1, resultado: "ganado", nota: "Compro 235/75R15 TOWNHALL MT",
      venta: { factura: "001-002-000012345", monto: 437 },
    });
    expect(leida?.ultimoDelAsesor?.texto).toBe(DESPEDIDA);

    const prompt = agent.salesFactsPrompt(await agent.getAgentSalesFacts(conv.id));
    expect(prompt).toContain("FICHA DE LA COMPRA ANTERIOR (ciclo 1");
    expect(prompt).toContain("Resultado: GANADA");
    expect(prompt).toContain("Venta registrada: factura 001-002-000012345, monto $437.00");
    expect(prompt).toMatch(/PROHIBIDO pedirle otra vez la medida/);
    expect(prompt).toMatch(/notificar_vendedor con motivo caso_sin_resolver/);
    // La instrucción genérica de pedir la medida no puede contradecir la ficha.
    expect(prompt).not.toContain("Si falta la medida: pídela escrita");
  });

  it("una venta anulada no aparece como venta registrada", async () => {
    const [{ id }] = await appSql<{ id: number }[]>`select id from conversations where phone = '593993873816'`;
    await appSql`update ventas_registradas set anulada_at = now() where conversation_id = ${id}`;
    expect((await ficha.leerFichaDelCicloAnterior(id))?.venta).toBeNull();
  });

  it("al reabrir una venta ganada, la fecha de llegada vigente no se borra y queda en la ficha", async () => {
    const conv = await ventaGanadaPorElAsesor("593993873818", 2 * DIA, { pickup: diaLocal(0) });
    const [archivada] = await appSql<{ pickup_date: Date | null }[]>`
      select pickup_date from sales_history where conversation_id = ${conv.id}
    `;
    expect(archivada.pickup_date).not.toBeNull();
    await conversations.getOrCreateConversation("593993873818");
    const [estado] = await appSql<{ assigned_to: string; pickup_date: Date | null; current_cycle: number }[]>`
      select assigned_to, pickup_date, current_cycle from conversations where id = ${conv.id}
    `;
    expect(estado).toMatchObject({ assigned_to: "bot", current_cycle: 2 });
    expect(estado.pickup_date).not.toBeNull();
    expect((await ficha.leerFichaDelCicloAnterior(conv.id))?.entrega).not.toBeNull();
  });

  it("con la llegada ya pasada hace dos días, la fecha se borra como siempre", async () => {
    const conv = await ventaGanadaPorElAsesor("593993873819", 5 * DIA, { pickup: diaLocal(-2) });
    await conversations.getOrCreateConversation("593993873819");
    const [estado] = await appSql<{ pickup_date: Date | null }[]>`select pickup_date from conversations where id = ${conv.id}`;
    expect(estado.pickup_date).toBeNull();
  });

  it("un cierre perdido deja su ficha como contexto, y no conserva la visita", async () => {
    const conv = await conversations.getOrCreateConversation("593993873820", "X");
    await appSql`update conversations set tire_size = '205/55R16', visit_date = now() + interval '1 day' where id = ${conv.id}`;
    await conversations.setStage(conv.id, "perdido", { actor: "owner", reason: "precio" });
    await conversations.getOrCreateConversation("593993873820");
    const [estado] = await appSql<{ visit_date: Date | null }[]>`select visit_date from conversations where id = ${conv.id}`;
    expect(estado.visit_date).toBeNull();
    const leida = await ficha.leerFichaDelCicloAnterior(conv.id);
    expect(leida).toMatchObject({ resultado: "perdido", medida: "205/55R16" });
    expect(leida?.visita).not.toBeNull();
  });

  it("el /restart empieza de cero: la ficha no cruza un reinicio a propósito", async () => {
    const conv = await ventaGanadaPorElAsesor("593993873821", 10 * 60_000);
    await conversations.reiniciarConversacion(conv.id);
    const [{ current_cycle }] = await appSql<{ current_cycle: number }[]>`select current_cycle from conversations where id = ${conv.id}`;
    await appSql`update sales_history set reason = 'Reinicio manual (/restart)' where conversation_id = ${conv.id} and cycle = ${current_cycle - 1}`;
    expect(await ficha.leerFichaDelCicloAnterior(conv.id)).toBeNull();
  });

  it("regla 2: el bot dio visita para dentro de 3 días; al día siguiente de esa fecha la memoria sigue", async () => {
    const conv = await conversations.getOrCreateConversation("593900000777", "Cliente");
    const cotizo = new Date(Date.now() - 4 * DIA);
    const visita = new Date(Date.now() - 1 * DIA); // = cotizó + 3 días
    await appSql`
      update conversations set stage = 'cotizado', tire_size = '265/70R16', nearest_store = 'Competimotor',
        visit_date = ${visita}, last_customer_message_at = ${cotizo}, last_assistant_message_at = ${cotizo}
      where id = ${conv.id}
    `;
    await appSql`insert into messages (conversation_id, cycle, role, direction, type, author_kind, content, created_at)
      values (${conv.id}, 1, 'assistant', 'outbound', 'text', 'bot', 'Listo, le esperamos el martes.', ${cotizo})`;

    const despues = await conversations.reiniciarSiLaMemoriaVencio({ ...conv, status: "open", current_cycle: 1 }, new Date());
    expect(despues.current_cycle).toBe(1);
    const [fila] = await appSql<{ tire_size: string | null; visit_date: Date | null }[]>`
      select tire_size, visit_date from conversations where id = ${conv.id}
    `;
    expect(fila.tire_size).toBe("265/70R16");
    expect(fila.visit_date).not.toBeNull();

    // Dos días después de la visita, ya no hay fecha que proteja: vence como siempre.
    await appSql`update conversations set visit_date = ${new Date(Date.now() - 3 * DIA)} where id = ${conv.id}`;
    const vencida = await conversations.reiniciarSiLaMemoriaVencio({ ...conv, status: "open", current_cycle: 1 }, new Date());
    expect(vencida.current_cycle).toBe(2);
    // Y el ciclo nuevo lee la ficha del anterior: medida, local y visita.
    const leida = await ficha.leerFichaDelCicloAnterior(conv.id);
    expect(leida).toMatchObject({ resultado: "perdido", medida: "265/70R16", local: "Competimotor" });
    expect(leida?.visita).not.toBeNull();
  });
});
