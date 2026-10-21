/**
 * FAMILIA 4 DE LA AUDITORÍA DEL 19-OCT CONTRA UNA BASE DE VERDAD.
 *
 * La cadena del chat 4231 (14-oct, 17:43 UTC), comprobada en producción:
 *
 *  1. El cliente vuelve tras semanas. Su chat tenía la pausa 'infinity' que
 *     dejó el advisor_review del 13-ago (antes del arreglo del 28-sep).
 *  2. `reiniciarSiLaMemoriaVencio` abre el ciclo 2 y, al devolverle la pausa,
 *     postgres.js tira RangeError (Invalid Date). El mensaje no se guarda;
 *     whatsapp-api-js responde 500 sin dejar rastro en el log.
 *  3. En ese hueco el worker ve el ciclo 2 sin plan y le agenda un
 *     advisor_review con la ventana de agosto: nace vencido, se ejecuta en el
 *     mismo milisegundo y pausa al bot 6 h.
 *  4. Meta reentrega; la segunda entrega abre el ciclo 3 (la reapertura no
 *     toca los `last_*`) y le copia la pausa de 6 h.
 *  5. El bot calla y levanta `cliente_sin_respuesta`; el rescate de 12 h le
 *     contesta a las 08:41 del día siguiente.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = `autoventa_pausas_mudas_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let conversations: typeof import("../src/services/conversations.js");
let turno: typeof import("../src/services/turnoDelHumano.js");
let followUps: typeof import("../src/services/followUps.js");
let processor: typeof import("../src/services/followUpProcessor.js");

const SEMANAS_ATRAS = new Date(Date.now() - 60 * 86_400_000);

async function ficha(id: number) {
  const [fila] = await appSql<{
    current_cycle: number; assigned_to: string; pausa: string | null; motivo: string | null;
  }[]>`
    select current_cycle, assigned_to, bot_paused_until::text as pausa, bot_paused_reason as motivo
    from conversations where id=${id}
  `;
  return fila;
}

async function alertas(id: number, tipo: string) {
  return appSql<{ status: string; exact_reason: string }[]>`
    select status, exact_reason from bot_alerts where conversation_id=${id} and type=${tipo}
  `;
}

/** Un chat viejo como los de la familia: el bot habló último, hace semanas. */
async function chatViejo(telefono: string, pausa: "infinity" | null) {
  const conv = await conversations.getOrCreateConversation(telefono, "Cliente");
  await appSql`
    insert into messages (conversation_id, cycle, role, direction, author_kind, type, content, created_at)
    values
      (${conv.id}, 1, 'user', 'inbound', 'customer', 'text', '¡Hola! Quiero más información', ${SEMANAS_ATRAS}),
      (${conv.id}, 1, 'assistant', 'outbound', 'bot', 'text', '¿Qué medida usa?', ${new Date(SEMANAS_ATRAS.getTime() + 60_000)})
  `;
  await appSql`
    update conversations set stage='nuevo',
      assigned_to=${pausa ? "human" : "bot"},
      last_customer_message_at=${SEMANAS_ATRAS},
      last_assistant_message_at=${new Date(SEMANAS_ATRAS.getTime() + 60_000)}
    where id=${conv.id}
  `;
  if (pausa) await appSql`update conversations set bot_paused_until='infinity' where id=${conv.id}`;
  // El plan del ciclo 1 ya existía (como en producción): ensureActive no lo toca.
  await appSql`
    insert into follow_up_jobs (conversation_id, cycle, type, channel, due_at, idempotency_key, payload, status, executed_at)
    values (${conv.id}, 1, 'advisor_review', 'advisor', ${SEMANAS_ATRAS}, ${`viejo-${conv.id}`}, '{}'::jsonb, 'sent', ${SEMANAS_ATRAS})
  `;
  return conv;
}

/** Lo que hace `recibirMensaje` (index.ts) hasta guardar el mensaje. */
async function entrega(telefono: string, texto: string, wamid: string, ahora: Date) {
  const creada = await conversations.getOrCreateConversation(telefono, "Cliente");
  const conv = await conversations.reiniciarSiLaMemoriaVencio(creada, ahora);
  await conversations.appendMessage(conv.id, "user", texto, wamid, { occurredAt: ahora });
  return conv;
}

describe.sequential("familia 4: pausas que dejan mudo al bot", () => {
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
    followUps = await import("../src/services/followUps.js");
    processor = await import("../src/services/followUpProcessor.js");
    // El cliente escribe en horario de atención: la política abre todo el día
    // para que la prueba no dependa de la hora a la que corre.
    const todoElDia = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { open: "00:00", close: "23:59" }]));
    await appSql`update follow_up_policies set business_hours=${appSql.json(todoElDia)}, enabled=true`;
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  it("4231: con la pausa 'infinity' heredada, el reinicio no tira y abre UN solo ciclo aunque Meta reentregue", async () => {
    const tel = "593900004231";
    const conv = await chatViejo(tel, "infinity");
    const ahora = new Date();
    // Primera entrega: antes del arreglo tiraba RangeError acá, con el ciclo
    // 2 ya abierto y el mensaje sin guardar.
    const primera = await conversations.getOrCreateConversation(tel, "Cliente");
    const reabierta = await conversations.reiniciarSiLaMemoriaVencio(primera, ahora);
    expect(reabierta.current_cycle).toBe(2);
    // Reentrega del mismo wamid ANTES de que el primero guarde el mensaje:
    // el ciclo 2 está vacío y no hay nada que olvidar.
    const segunda = await conversations.getOrCreateConversation(tel, "Cliente");
    const otraVez = await conversations.reiniciarSiLaMemoriaVencio(segunda, ahora);
    expect(otraVez.current_cycle).toBe(2);
    const [transiciones] = await appSql<{ n: number }[]>`
      select count(*)::int as n from stage_transitions where conversation_id=${conv.id} and reason like 'Reinicio por inactividad%'
    `;
    expect(transiciones.n).toBe(1);
    // La pausa infinita no sobrevive como pausa: se lee como «sin pausa».
    expect((await ficha(conv.id)).pausa).toBeNull();
  });

  it("4231: en el hueco entre reabrir y guardar, el worker NO agenda un advisor_review vencido", async () => {
    const tel = "593900004232";
    const conv = await chatViejo(tel, null);
    const ahora = new Date();
    const creada = await conversations.getOrCreateConversation(tel, "Cliente");
    await conversations.reiniciarSiLaMemoriaVencio(creada, ahora);
    // El worker corre cada 5 s; acá corre justo en el hueco.
    await followUps.ensureActiveConversationPlans(ahora);
    const nuevos = await appSql<{ due_at: Date; created_at: Date }[]>`
      select due_at, created_at from follow_up_jobs where conversation_id=${conv.id} and cycle=2
    `;
    expect(nuevos).toHaveLength(0);
    expect((await ficha(conv.id)).assigned_to).toBe("bot");

    // Entra el mensaje: el bot contesta.
    await conversations.appendMessage(conv.id, "user", "¡Hola! Quiero más información", "wamid.4232", { occurredAt: ahora });
    expect(await turno.decidirQuienContesta(conv.id, "¡Hola! Quiero más información", ahora)).toEqual({ contesta: "bot" });
    expect(await alertas(conv.id, "cliente_sin_respuesta")).toHaveLength(0);
  });

  it("el plan del ciclo nuevo arranca en su propio mensaje: ningún advisor_review nace vencido", async () => {
    const tel = "593900004233";
    const conv = await chatViejo(tel, null);
    const ahora = new Date();
    await entrega(tel, "¡Hola! Quiero más información", "wamid.4233", ahora);
    // El bot contestó (el turno guarda su saliente) y se agenda el plan.
    await conversations.appendMessage(conv.id, "assistant", "¿Qué medida usa?", "wamid.4233.b", { occurredAt: new Date(ahora.getTime() + 2_000) });
    await followUps.scheduleConversationFollowUps(conv.id, new Date(ahora.getTime() + 3_000));
    const revisiones = await appSql<{ due_at: Date; created_at: Date }[]>`
      select due_at, created_at from follow_up_jobs where conversation_id=${conv.id} and cycle=2 and type='advisor_review'
    `;
    expect(revisiones.length).toBeGreaterThan(0);
    for (const r of revisiones) expect(r.due_at.getTime()).toBeGreaterThan(r.created_at.getTime() + 3_600_000);
  });

  it("26121: la revisión automática pausa con su motivo; el cliente escribe y contesta el bot, con alerta y sin cerrar la de la revisión", async () => {
    const conv = await conversations.getOrCreateConversation("593900026121", "Cliente 26121");
    const revision = new Date(Date.now() - 21 * 60_000);
    await appSql`
      update conversations set stage='nuevo', assigned_to='bot',
        last_customer_message_at=${new Date(revision.getTime() - 86_400_000)},
        last_assistant_message_at=${new Date(revision.getTime() - 3_600_000)}
      where id=${conv.id}
    `;
    await appSql`
      insert into messages (conversation_id, cycle, role, direction, author_kind, type, content, created_at)
      values (${conv.id}, 1, 'assistant', 'outbound', 'bot', 'text', '😊 Solo me falta la medida de la llanta', ${new Date(revision.getTime() - 3_600_000)})
    `;
    const [job] = await appSql<{ id: number }[]>`
      insert into follow_up_jobs (conversation_id, cycle, type, channel, due_at, idempotency_key, payload, status, locked_at, locked_by)
      values (${conv.id}, 1, 'advisor_review', 'advisor', ${revision}, 'advisor-review-26121',
        '{"reason":"Ventana de 24 horas agotada","preview":"Revisar"}'::jsonb, 'processing', ${revision}, 'test') returning id
    `;
    await processor.processFollowUpJob({ id: Number(job.id) } as never, { now: () => revision });
    expect(await ficha(conv.id)).toMatchObject({ assigned_to: "human", motivo: "revision_automatica" });

    const ahora = new Date();
    const texto = "Muy buenas tardes.  215/75 R14\nMarcas y precios";
    await conversations.appendMessage(conv.id, "user", texto, "wamid.26121", { occurredAt: ahora });
    expect(await turno.decidirQuienContesta(conv.id, texto, ahora)).toEqual({ contesta: "bot", retoma: "pausa_automatica" });
    // El chat vuelve al bot de verdad: si no, la política lo frena por human_control.
    expect(await ficha(conv.id)).toMatchObject({ assigned_to: "bot", pausa: null, motivo: null });
    const retomo = await alertas(conv.id, "bot_retomo_el_chat");
    expect(retomo).toHaveLength(1);
    expect(retomo[0].exact_reason).toContain("Marcas y precios");
    expect((await alertas(conv.id, "advisor_follow_up")).map((a) => a.status)).toEqual(["open"]);
    expect(await alertas(conv.id, "cliente_sin_respuesta")).toHaveLength(0);
  });

  it("el cliente que pide un asesor sigue pausando al bot: su próximo mensaje espera a la persona", async () => {
    const conv = await conversations.getOrCreateConversation("593900000777", "Pide asesor");
    const ahora = new Date();
    await conversations.appendMessage(conv.id, "user", "quiero hablar con un asesor", "wamid.777.1", { occurredAt: ahora });
    await followUps.handleInboundFollowUpState(conv.id, "quiero hablar con un asesor");
    expect(await ficha(conv.id)).toMatchObject({ assigned_to: "human", motivo: "pidio_asesor" });
    const luego = new Date(ahora.getTime() + 5 * 60_000);
    await conversations.appendMessage(conv.id, "user", "¿hola?", "wamid.777.2", { occurredAt: luego });
    expect(await turno.decidirQuienContesta(conv.id, "¿hola?", luego)).toEqual({ contesta: "humano", motivo: "pausa_vigente" });
  });

  it("25844: una persona escribe en el chat (eco) → el bot calla y la alerta sale, como siempre", async () => {
    const conv = await conversations.getOrCreateConversation("593900025844", "Cliente 25844");
    const ahora = new Date();
    await conversations.appendMessage(conv.id, "assistant", "Buenas tardes, le ayudo yo", "wamid.25844.eco", {
      authorKind: "owner", status: "sent", occurredAt: ahora,
    });
    await conversations.setConversationAssignee(conv.id, "human", "persona_escribio");
    expect(await ficha(conv.id)).toMatchObject({ assigned_to: "human", motivo: "persona_escribio" });
    const luego = new Date(ahora.getTime() + 60_000);
    await conversations.appendMessage(conv.id, "user", "¿Tienen la 265/70R16?", "wamid.25844.1", { occurredAt: luego });
    expect(await turno.decidirQuienContesta(conv.id, "¿Tienen la 265/70R16?", luego)).toEqual({ contesta: "humano", motivo: "pausa_vigente" });
    expect(await alertas(conv.id, "cliente_sin_respuesta")).toHaveLength(1);
  });

  it("12639: la última palabra de una persona es del 31-ago → el cliente que vuelve recibe al bot y el asesor la alerta", async () => {
    const conv = await conversations.getOrCreateConversation("593900012639", "Cliente 12639");
    const persona = new Date(Date.now() - 45 * 86_400_000);
    await appSql`
      insert into messages (conversation_id, cycle, role, direction, author_kind, type, content, created_at)
      values (${conv.id}, 1, 'assistant', 'outbound', 'owner', 'text', 'Con gusto, aquí le esperamos', ${persona})
    `;
    await appSql`
      update conversations set assigned_to='human', bot_paused_until=${new Date(persona.getTime() + 6 * 3_600_000)},
        last_customer_message_at=${persona}, last_assistant_message_at=${persona}
      where id=${conv.id}
    `;
    const ahora = new Date();
    const texto = "¡Hola! Quiero más información precio en ein 15";
    // El silencio no reinicia: la última palabra fue de una persona.
    const tras = await entrega("593900012639", texto, "wamid.12639", ahora);
    expect(tras.current_cycle).toBe(1);
    expect(await turno.decidirQuienContesta(conv.id, texto, ahora)).toEqual({ contesta: "bot", retoma: "humano_hace_mucho" });
    expect((await ficha(conv.id)).assigned_to).toBe("bot");
    expect(await alertas(conv.id, "bot_retomo_el_chat")).toHaveLength(1);
  });
});
