/**
 * Seguimientos perezosos y redacción con IA, de punta a punta contra Postgres.
 *
 * La pregunta que responde esta batería es una sola: **¿se paga una redacción
 * exactamente cuando el mensaje va a salir, y ninguna vez más?** Por eso se
 * espía `generateFollowUpCopy` y se cuenta cuántas veces se pidió, en vez de
 * confiar en que las banderas del payload digan la verdad.
 */
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const espia = vi.hoisted(() => ({ llamadas: 0, kinds: [] as string[], textoForzado: null as string | null }));

vi.mock("../src/services/followUpCopy.js", () => ({
  generateFollowUpCopy: async (
    context: { name?: string | null },
    kind: string,
  ) => {
    espia.llamadas += 1;
    espia.kinds.push(kind);
    return { text: espia.textoForzado ?? `Redacción IA (${kind}) para ${context.name ?? "cliente"}`, source: "ai" as const };
  },
}));

const testDatabase = `autoventa_lazy_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let conversations: typeof import("../src/services/conversations.js");
let followUps: typeof import("../src/services/followUps.js");
let processor: typeof import("../src/services/followUpProcessor.js");
let followUpAdmin: typeof import("../src/services/followUpAdmin.js");
let quoteMessages: typeof import("../src/services/quoteMessages.js");
let storeSelection: typeof import("../src/domain/storeSelection.js");
let compromiso: typeof import("../src/domain/customerCommitment.js");

/** Lunes 20-jul-2026, 10:00 en Guayaquil → dentro del horario comercial. */
const AHORA = new Date("2026-07-20T15:00:00.000Z");
const HACE_UNA_HORA = new Date(AHORA.getTime() - 60 * 60 * 1000);
const HACE_59_MIN = new Date(AHORA.getTime() - 59 * 60 * 1000);

let siguienteTelefono = 0;

/** Conversación lista para recibir un seguimiento: en ventana y con el bot al mando. */
async function conversacionLista(stage = "cotizacion_enviada") {
  siguienteTelefono += 1;
  const phone = `59398${String(500000 + siguienteTelefono).padStart(6, "0")}`;
  const conversation = await conversations.getOrCreateConversation(phone, `Cliente ${siguienteTelefono}`);
  await appSql`
    update conversations set stage = ${stage}, tire_size = '205/55 R16',
      last_customer_message_at = ${HACE_UNA_HORA},
      last_assistant_message_at = ${HACE_59_MIN},
      customer_opt_in = true
    where id = ${conversation.id}
  `;
  await followUps.scheduleConversationFollowUps(conversation.id, AHORA);
  return conversation;
}

/** Una cotización viva en el ciclo actual: sin ella no hay visita que coordinar. */
async function conCotizacion(conversationId: number, numero: string) {
  await appSql`
    insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number)
    values (${conversationId}, 1, ${appSql.json([])}, 100, 15, 115, ${numero})
  `;
}

async function primerJob(conversationId: number) {
  const [job] = await appSql<{ id: number; status: string; payload: Record<string, unknown> }[]>`
    select id, status, payload from follow_up_jobs
    where conversation_id = ${conversationId} and type = 'in_window_first'
  `;
  return job;
}

/** Vence el job y lo entrega al worker tal como lo haría el ciclo real. */
async function reclamarYProcesar(conversationId: number, enviados: string[]) {
  await appSql`
    update follow_up_jobs set due_at = ${new Date(AHORA.getTime() - 60_000)}
    where conversation_id = ${conversationId} and type = 'in_window_first' and status = 'scheduled'
  `;
  const jobs = await followUps.claimDueFollowUpJobs({ now: AHORA, limit: 10 });
  for (const job of jobs) {
    await processor.processFollowUpJob(job, {
      now: () => AHORA,
      sendText: async (_id, _phone, body) => { enviados.push(body); return "wamid.test"; },
      sendTemplate: async () => "wamid.template",
    });
  }
  return jobs;
}

describe.sequential("Seguimientos perezosos y redacción con IA", () => {
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
    // Puerto de descarte: ninguna prueba debe alcanzar la Graph API de verdad.
    // Sin esto, las alertas al asesor salen a graph.facebook.com con un token
    // falso — lento, dependiente de la red y ruidoso en el log.
    process.env.GRAPH_BASE_URL = "http://127.0.0.1:9";

    const db = await import("../src/db/client.js");
    appSql = db.sql;
    await (await import("../src/db/schema.js")).ensureSchema();
    conversations = await import("../src/services/conversations.js");
    followUps = await import("../src/services/followUps.js");
    processor = await import("../src/services/followUpProcessor.js");
    followUpAdmin = await import("../src/services/followUpAdmin.js");
    quoteMessages = await import("../src/services/quoteMessages.js");
    storeSelection = await import("../src/domain/storeSelection.js");
    compromiso = await import("../src/domain/customerCommitment.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  beforeEach(() => { espia.llamadas = 0; espia.kinds = []; espia.textoForzado = null; });

  it("programar no cuesta ni una redacción", async () => {
    const conv = await conversacionLista();
    expect(espia.llamadas).toBe(0);
    const job = await primerJob(conv.id);
    expect(job.payload.aiPending).toBe(true);
    // El borrador determinístico existe igual, para que el panel muestre algo.
    expect(String(job.payload.preview).length).toBeGreaterThan(10);
  });

  it("la revisión del asesor nunca pasa por el modelo", async () => {
    const conv = await conversacionLista();
    const [advisor] = await appSql<{ payload: Record<string, unknown> }[]>`
      select payload from follow_up_jobs
      where conversation_id = ${conv.id} and type = 'advisor_review'
    `;
    expect(advisor.payload.aiPending).toBeUndefined();
    expect(followUps.followUpJobCopyKind("advisor_review")).toBeNull();
    expect(espia.llamadas).toBe(0);
  });

  it("el worker redacta al enviar, exactamente una vez", async () => {
    const conv = await conversacionLista();
    const enviados: string[] = [];
    await reclamarYProcesar(conv.id, enviados);

    expect(espia.llamadas).toBe(1);
    expect(espia.kinds).toEqual(["in_window_first"]);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toContain("Redacción IA (in_window_first)");
    const job = await primerJob(conv.id);
    expect(job.status).toBe("sent");
    expect(job.payload.aiPending).toBe(false);
    expect(job.payload.copySource).toBe("ai");
  });

  it("«Generar» del asesor fija el texto y el worker ya no vuelve a pedirlo", async () => {
    const conv = await conversacionLista();
    const generado = await followUps.generateFollowUpJobCopyById((await primerJob(conv.id)).id);
    expect(espia.llamadas).toBe(1);
    expect(generado?.generated).toBe(true);

    const enviados: string[] = [];
    await reclamarYProcesar(conv.id, enviados);
    // Sigue en 1: el worker respetó el texto ya redactado.
    expect(espia.llamadas).toBe(1);
    expect(enviados[0]).toBe(generado?.text);
  });

  it("el texto que el asesor escribió a mano sobrevive al worker", async () => {
    const conv = await conversacionLista();
    const job = await primerJob(conv.id);
    // Lo mismo que hace PATCH /api/hub/follow-ups/:id
    await appSql`
      update follow_up_jobs
      set payload = payload || jsonb_build_object('preview', ${"Texto del asesor, a mano"}::text,
        'aiPending', false, 'copySource', 'advisor')
      where id = ${job.id}
    `;
    const enviados: string[] = [];
    await reclamarYProcesar(conv.id, enviados);

    expect(espia.llamadas).toBe(0);
    expect(enviados[0]).toBe("Texto del asesor, a mano");
  });

  it("si el cliente responde, se cancela sin gastar redacción", async () => {
    const conv = await conversacionLista();
    await followUps.handleInboundFollowUpState(conv.id, "ya lo estoy pensando, gracias");
    const job = await primerJob(conv.id);
    expect(job.status).toBe("cancelled");
    expect(job.payload.aiGeneratedAt).toBeUndefined();
    expect(espia.llamadas).toBe(0);
  });

  it("el portón del worker cancela al cliente que escribió después, antes de redactar", async () => {
    const conv = await conversacionLista();
    // El inbound normal cancelaría el job; aquí se simula la carrera en la que
    // el worker despierta con el mensaje del cliente ya guardado.
    await appSql`
      update conversations set last_customer_message_at = ${new Date(AHORA.getTime() - 60_000)}
      where id = ${conv.id}
    `;
    const enviados: string[] = [];
    await reclamarYProcesar(conv.id, enviados);

    expect(espia.llamadas).toBe(0);
    expect(enviados).toHaveLength(0);
    const job = await primerJob(conv.id);
    expect(job.status).toBe("cancelled");
    expect(job.cancel_reason ?? (await appSql`select cancel_reason from follow_up_jobs where id=${job.id}`)[0].cancel_reason)
      .toBe("customer_replied");
  });

  it("un cambio de etapa cancela antes de redactar", async () => {
    const conv = await conversacionLista();
    await appSql`update conversations set stage = 'ganado' where id = ${conv.id}`;
    const enviados: string[] = [];
    await reclamarYProcesar(conv.id, enviados);

    expect(espia.llamadas).toBe(0);
    expect(enviados).toHaveLength(0);
  });

  it("el opt-out cancela y no redacta", async () => {
    const conv = await conversacionLista();
    await followUps.handleInboundFollowUpState(conv.id, "no me escribas más por favor");
    const job = await primerJob(conv.id);
    expect(job.status).toBe("cancelled");
    expect(espia.llamadas).toBe(0);
    const [estado] = await appSql<{ opted_out_at: Date | null }[]>`
      select opted_out_at from conversations where id = ${conv.id}
    `;
    expect(estado.opted_out_at).not.toBeNull();
  });

  it("fuera de horario comercial no se redacta", async () => {
    const conv = await conversacionLista();
    await appSql`
      update follow_up_jobs set due_at = ${new Date("2026-07-20T05:00:00.000Z")}
      where conversation_id = ${conv.id} and type = 'in_window_first'
    `;
    const madrugada = new Date("2026-07-20T05:00:00.000Z"); // 00:00 en Guayaquil
    const jobs = await followUps.claimDueFollowUpJobs({ now: madrugada, limit: 10 });
    const enviados: string[] = [];
    for (const job of jobs) {
      await processor.processFollowUpJob(job, {
        now: () => madrugada,
        sendText: async (_i, _p, body) => { enviados.push(body); return "x"; },
      });
    }
    expect(espia.llamadas).toBe(0);
    expect(enviados).toHaveLength(0);
  });

  it("las plantillas fuera de ventana no pasan por el modelo", async () => {
    const conv = await conversacionLista();
    await appSql`
      insert into follow_up_jobs (conversation_id, cycle, type, channel, due_at, window_closes_at, idempotency_key, payload)
      values (${conv.id}, 1, 'post_window_1', 'whatsapp', ${new Date(AHORA.getTime() - 60_000)},
        ${new Date(AHORA.getTime() - 3_600_000)}, ${`plantilla:${conv.id}`},
        ${appSql.json({ preview: "texto de plantilla", templateKey: "seguimiento_cotizacion_v1", stage: "cotizacion_enviada" })})
    `;
    const jobs = await followUps.claimDueFollowUpJobs({ now: AHORA, limit: 10 });
    for (const job of jobs) {
      await processor.processFollowUpJob(job, {
        now: () => AHORA,
        sendText: async () => "x",
        sendTemplate: async () => "wamid.template",
      });
    }
    // Aprobada o no, una plantilla lleva copy fijo de Meta: jamás se redacta.
    expect(espia.kinds).not.toContain("post_window");
  });

  /*
   * Chat de +593 99 874 7699 (18-ago): el cliente ya había dicho «al sur» y «el
   * viernes por favor», el bot lo confirmó… y horas después le llegaron dos
   * seguimientos citando esa misma frase y volviéndole a preguntar qué día.
   */
  it("con día y local ya confirmados, el seguimiento no vuelve a preguntar", async () => {
    const conv = await conversacionLista("seguimiento_venta");
    await appSql`
      update conversations
      set nearest_store = 'Depot Tire Quito Sur',
          customer_commitment = 'el viernes por favor',
          customer_commitment_cycle = current_cycle,
          visit_date = ${new Date(AHORA.getTime() + 3 * 24 * 3_600_000)}
      where id = ${conv.id}
    `;
    const enviados: string[] = [];
    await reclamarYProcesar(conv.id, enviados);

    expect(enviados).toHaveLength(0);
    expect(espia.llamadas).toBe(0);
    const [job] = await appSql<{ status: string; cancel_reason: string | null }[]>`
      select status, cancel_reason from follow_up_jobs
      where conversation_id = ${conv.id} and type = 'in_window_first'
    `;
    expect(job.status).toBe("cancelled");
    expect(job.cancel_reason).toBe("visita_agendada");
  });

  it("si el día prometido ya pasó, el seguimiento sí sale (hay que reagendar)", async () => {
    const conv = await conversacionLista("seguimiento_venta");
    await appSql`
      update conversations
      set nearest_store = 'Depot Tire Quito Sur',
          customer_commitment = 'el viernes por favor',
          customer_commitment_cycle = current_cycle,
          visit_date = ${new Date(AHORA.getTime() - 2 * 24 * 3_600_000)}
      where id = ${conv.id}
    `;
    const enviados: string[] = [];
    await reclamarYProcesar(conv.id, enviados);

    expect(enviados).toHaveLength(1);
  });

  /*
   * «Si a las ~3 horas no contesta, que el seguimiento mande las ubicaciones
   * (los dos links)» — Joaquín, 25-ago. Lo que se prueba aquí es que la promesa
   * no depende de la IA: el copy que sale al cliente lo escribió el modelo (está
   * mockeado arriba) y los mapas van igual, pegados por la capa determinística.
   */
  it("el seguimiento de quien no eligió local sale con los dos mapas", async () => {
    const conv = await conversacionLista();
    await conCotizacion(conv.id, "COT-MAPAS-1");

    const enviados: string[] = [];
    await reclamarYProcesar(conv.id, enviados);

    expect(enviados).toHaveLength(1);
    expect(espia.llamadas).toBe(1); // el texto sí lo redactó la IA…
    expect(enviados[0]).toContain("Redacción IA");
    expect(enviados[0].match(/https?:\/\/\S+/g) ?? []).toHaveLength(2); // …y los mapas no.
  });

  it("un link escrito por la IA no sale: se quita y se pega el bloque canónico", async () => {
    // El bloqueante de la revisión del sprint final: los maps.app.goo.gl son
    // exactamente el tipo de string que un modelo reproduce mal, y la guarda
    // vieja («si ya hay un link, no pego nada») dejaba pasar el mutilado
    // VERBATIM al cliente. Ahora lo que escriba el modelo se quita y los
    // links salen siempre de buildStoreLinksBlock.
    const conv = await conversacionLista();
    await conCotizacion(conv.id, "COT-MAPAS-3");
    espia.textoForzado = "Le esperamos 🚗 https://maps.app.goo.gl/MUT1LADO ¿qué día puede pasar?";

    const enviados: string[] = [];
    await reclamarYProcesar(conv.id, enviados);

    expect(enviados).toHaveLength(1);
    expect(enviados[0]).not.toContain("MUT1LADO");
    expect(enviados[0].match(/https?:\/\/\S+/g) ?? []).toHaveLength(2);
  });

  it("con el local ya elegido va solo su mapa, no los dos", async () => {
    const conv = await conversacionLista();
    await conCotizacion(conv.id, "COT-MAPAS-2");
    await appSql`update conversations set nearest_store='Depot Tire Quito Sur' where id=${conv.id}`;

    const enviados: string[] = [];
    await reclamarYProcesar(conv.id, enviados);

    expect(enviados[0].match(/https?:\/\/\S+/g) ?? []).toHaveLength(1);
    expect(enviados[0]).toContain("Quito Sur");
  });

  it("sin cotización todavía no van mapas: el mapa ahí es ruido", async () => {
    const conv = await conversacionLista();

    const enviados: string[] = [];
    await reclamarYProcesar(conv.id, enviados);

    expect(enviados).toHaveLength(1);
    expect(enviados[0]).not.toMatch(/https?:\/\//);
  });

  /*
   * El caso que trajo Joaquín el 25-ago: «el cliente puso "al sur por favor el
   * viernes" y el seguimiento volvió a preguntar el lugar».
   *
   * El portón `visita_agendada` ya existía desde el 18-ago y funciona —lo prueba
   * el caso de más abajo—, así que lo que fallaba estaba antes: los HECHOS. «Al
   * sur» solo se lee como elección de local si nuestro último mensaje puso los
   * dos locales sobre la mesa, y «el viernes» solo cuenta como fecha si ese
   * mismo mensaje preguntó el día. Por eso la pregunta de visita tiene que
   * llevar las dos cosas en UN solo mensaje: es lo que el turno siguiente lee.
   *
   * Esta prueba corre la misma cadena que index.ts sobre el texto real.
   */
  it("«al sur por favor el viernes» queda registrado y el seguimiento ya no repregunta", async () => {
    const conv = await conversacionLista("seguimiento_venta");
    await conCotizacion(conv.id, "COT-ALSUR");
    // Lo último que mandó el bot, tal cual sale hoy de la herramienta.
    const preguntaDelBot = quoteMessages.buildVisitPlanQuestion({
      conDescuentoAutorizado: false,
      locales: ["Depot Tire Cumbayá", "Depot Tire Quito Sur"],
    });
    await appSql`
      insert into messages (conversation_id, role, direction, type, content)
      values (${conv.id}, 'assistant', 'outbound', 'text', ${preguntaDelBot})
    `;

    const ENTRANTE = "al sur por favor el viernes";
    const ultimoNuestro = await conversations.lastOutboundText(conv.id);
    const local = storeSelection.extractExplicitStore(ENTRANTE, {
      respondiendoAlLocal: storeSelection.preguntamosElLocal(ultimoNuestro),
    });
    const visita = compromiso.extractCustomerCommitment(ENTRANTE, AHORA, {
      respondiendoAlDia: compromiso.preguntamosElDia(ultimoNuestro),
    });

    expect(local).toBe("Depot Tire Quito Sur");
    expect(visita?.visitDate).toBeInstanceOf(Date);

    await conversations.setExplicitStore(conv.id, local!);
    await conversations.updateConversationFacts(conv.id, {
      customerCommitment: visita!.text,
      visitDate: visita!.visitDate,
    });

    const enviados: string[] = [];
    await reclamarYProcesar(conv.id, enviados);

    expect(enviados).toHaveLength(0);
    const [job] = await appSql<{ status: string; cancel_reason: string | null }[]>`
      select status, cancel_reason from follow_up_jobs
      where conversation_id = ${conv.id} and type = 'in_window_first'
    `;
    expect(job.cancel_reason).toBe("visita_agendada");
  });

  /*
   * El sticker que descarriló el hilo (mismo reporte del 25-ago). Un sticker
   * entra al historial como un texto que dice «el bot no puede ver esto, pide la
   * medida» — y el miedo es que el seguimiento siguiente hable de medidas y se
   * olvide de la visita que ya se estaba coordinando.
   */
  it("un sticker no descarrila el seguimiento: sigue hablando de la visita", async () => {
    const conv = await conversacionLista("seguimiento_venta");
    await conCotizacion(conv.id, "COT-STICKER");
    await appSql`
      update conversations set customer_commitment = 'paso el viernes',
        customer_commitment_cycle = current_cycle
      where id = ${conv.id}
    `;
    const STICKER =
      "[El cliente mandó un mensaje que el bot no puede ver (video, sticker o similar). Pídele con amabilidad la medida escrita o una foto del costado de la llanta.]";

    // Primero: el sticker no puede leerse como enojo ni como opt-out. Esa rama
    // pausa el hilo para siempre y cancela la campaña.
    const estado = await followUps.handleInboundFollowUpState(conv.id, STICKER);
    expect(estado).toEqual({ optedOut: false, negative: false, requestedHuman: false });

    // El bot le contestó al sticker y se reprograma el seguimiento.
    const respuesta = new Date(AHORA.getTime() + 60_000);
    await appSql`
      update conversations set last_customer_message_at = ${AHORA},
        last_assistant_message_at = ${respuesta}
      where id = ${conv.id}
    `;
    await followUps.scheduleConversationFollowUps(conv.id, new Date(respuesta.getTime() + 60_000));

    const [job] = await appSql<{ payload: Record<string, unknown> }[]>`
      select payload from follow_up_jobs
      where conversation_id = ${conv.id} and type = 'in_window_first' and status = 'scheduled'
      order by id desc limit 1
    `;
    const borrador = String(job.payload.preview);
    expect(borrador).toContain("paso el viernes");
    expect(borrador).not.toMatch(/medida/i);
    expect(borrador.match(/https?:\/\/\S+/g) ?? []).toHaveLength(2);
  });

  it("las métricas cuentan los seguimientos que el portón evitó redactar", async () => {
    const metricas = await followUpAdmin.getFollowUpMetrics();
    expect(metricas.generations_avoided).toBeGreaterThan(0);
    expect(metricas.generations_used).toBeGreaterThan(0);
  });
});
