/**
 * LA CONVERSACIÓN 9878, DE PUNTA A PUNTA.
 *
 * Lunes 24-ago-2026, cliente Cesar (+593 99 844 7910), cotización COT-MT7H1534:
 *
 *   11:57  BOT      «…solo confírmeme qué día sería cuando lo tenga definido.»
 *   11:58  CLIENTE  «X eso el juebes»
 *   11:58  BOT      «Listo, jueves de 4 a 5 pm en Depot Tire Quito Sur.»
 *   14:58  BOT      «😊 Sobre tu visita, ¿te ayudo a dejar lista la visita…?»
 *   09:58  BOT      «🚗 Me quedé pendiente de tu visita. ¿Qué día te quedaría…?»
 *
 * Los dos últimos son los que Joaquín reportó. La causa no estaba en el
 * seguimiento: estaba en que «juebes» no entró como fecha, y sin fecha el
 * sistema entero creía que la visita seguía sin coordinar — no hubo aviso al
 * asesor, no salió el cupón, y el seguimiento hizo lo único que sabía hacer.
 *
 * Esta batería corre la MISMA cadena que index.ts sobre el texto real del
 * cliente y termina en el worker de seguimientos, sin mockear la redacción.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = `autoventa_juebes_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let conversations: typeof import("../src/services/conversations.js");
let followUps: typeof import("../src/services/followUps.js");
let processor: typeof import("../src/services/followUpProcessor.js");
let compromiso: typeof import("../src/domain/customerCommitment.js");

/** Lunes 24-ago-2026, 11:58 en Guayaquil — el minuto exacto del chat real. */
const LUNES = new Date("2026-08-24T16:58:20.000Z");
/** Tres horas después: cuando salió el primer seguimiento. */
const TRES_HORAS_DESPUES = new Date("2026-08-24T19:58:20.000Z");

/** Miércoles 26-ago-2026, 16:00 en Guayaquil: el día del reagendamiento. */
const MIERCOLES = new Date("2026-08-26T21:00:00.000Z");

const PREGUNTA_DEL_BOT =
  "Perfecto, le dejo anotado que pasaría *de 4 a 5 pm* por *Depot Tire Quito Sur*. " +
  "Para dejarle avisado al asesor, solo confírmeme qué día sería cuando lo tenga definido.";

async function conversacionDeCesar() {
  const conv = await conversations.getOrCreateConversation("593998447910", "Cesar");
  await appSql`
    update conversations
    set stage = 'seguimiento_venta', tire_size = '235/75R15',
        nearest_store = 'Depot Tire Quito Sur',
        location_label = 'Local elegido explícitamente por el cliente: Depot Tire Quito Sur',
        customer_opt_in = true,
        last_customer_message_at = ${new Date(LUNES.getTime() - 60_000)},
        last_assistant_message_at = ${new Date(LUNES.getTime() - 30_000)}
    where id = ${conv.id}
  `;
  await appSql`
    insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number)
    values (${conv.id}, 1, ${appSql.json([])}, 564.50, 67.74, 632.24, 'COT-MT7H1534')
  `;
  await appSql`
    insert into messages (conversation_id, cycle, role, direction, type, content)
    values (${conv.id}, 1, 'assistant', 'outbound', 'text', ${PREGUNTA_DEL_BOT})
  `;
  return conv;
}

/** La cadena de index.ts: leer el mensaje entrante y guardar lo que trae. */
async function entra(conversationId: number, texto: string, ahora = LUNES) {
  const ultimoNuestro = await conversations.lastOutboundText(conversationId);
  const visita = compromiso.extractCustomerCommitment(texto, ahora, {
    respondiendoAlDia: compromiso.preguntamosElDia(ultimoNuestro),
  });
  if (!visita) return null;
  return conversations.registrarCompromisoDeVisita(conversationId, {
    texto: visita.text,
    visitDate: visita.visitDate,
    visitTimeLabel: visita.visitTimeLabel,
  });
}

describe.sequential("«X eso el juebes» (conversación 9878)", () => {
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
    // Como producción: la respuesta seca de visita la contesta la ruta directa.
    process.env.DIRECT_SALES_ROUTES_ENABLED = "true";

    appSql = (await import("../src/db/client.js")).sql;
    await (await import("../src/db/schema.js")).ensureSchema();
    conversations = await import("../src/services/conversations.js");
    followUps = await import("../src/services/followUps.js");
    processor = await import("../src/services/followUpProcessor.js");
    compromiso = await import("../src/domain/customerCommitment.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  it("el typo entra como fecha: jueves 27, de 4 a 5 pm", async () => {
    const conv = await conversacionDeCesar();
    await entra(conv.id, "X la tarde de 4 a 5  x yo soy de probincia i ese día paso x ai");
    await entra(conv.id, "X eso el juebes");

    const [fila] = await appSql<{ visit_date: Date | null; visit_time_label: string | null }[]>`
      select visit_date, visit_time_label from conversations where id = ${conv.id}
    `;
    expect(fila.visit_date?.toISOString()).toBe("2026-08-27T21:00:00.000Z");
    expect(fila.visit_time_label).toBe("de 4 a 5 pm");
  });

  /*
   * El seguimiento sale —así lo decidieron Manuel y Joaquín el 26-ago— pero
   * diciendo lo contrario de lo que decía: confirma en vez de preguntar.
   * Se compara contra los DOS textos reales que recibió Cesar.
   */
  it("el seguimiento de las 3 horas confirma la visita en vez de repreguntarla", async () => {
    const conv = await conversacionDeCesar();
    await entra(conv.id, "X eso el juebes");
    await followUps.scheduleConversationFollowUps(conv.id, LUNES);
    await appSql`
      update follow_up_jobs set due_at = ${new Date(TRES_HORAS_DESPUES.getTime() - 60_000)}
      where conversation_id = ${conv.id} and type = 'in_window_first' and status = 'scheduled'
    `;

    const enviados: string[] = [];
    for (const job of await followUps.claimDueFollowUpJobs({ now: TRES_HORAS_DESPUES, limit: 10 })) {
      await processor.processFollowUpJob(job, {
        now: () => TRES_HORAS_DESPUES,
        sendText: async (_id, _phone, body) => { enviados.push(body); return "wamid.test"; },
        sendTemplate: async () => "wamid.template",
      });
    }

    expect(enviados).toHaveLength(1);
    const mensaje = enviados[0];
    // Lo que decía antes, palabra por palabra.
    expect(mensaje).not.toMatch(/te ayudo a dejar lista la visita/i);
    expect(mensaje).not.toMatch(/qué día/i);
    // Lo que dice ahora.
    expect(mensaje).toMatch(/le esperamos/i);
    expect(mensaje).toMatch(/jueves 27 de agosto de 4 a 5 pm/i);
    expect(mensaje).toMatch(/Depot Tire Quito Sur/);
  });

  it("el segundo intento es el «no se olvide», con la cotización", async () => {
    const conv = await conversacionDeCesar();
    await entra(conv.id, "X eso el juebes");
    await followUps.scheduleConversationFollowUps(conv.id, LUNES);
    const MANANA = new Date("2026-08-25T14:58:20.000Z");
    await appSql`
      update follow_up_jobs set due_at = ${new Date(MANANA.getTime() - 60_000)}, status = 'scheduled'
      where conversation_id = ${conv.id} and type = 'in_window_second'
    `;
    await appSql`
      update follow_up_jobs set status = 'cancelled'
      where conversation_id = ${conv.id} and type <> 'in_window_second'
    `;

    const enviados: string[] = [];
    for (const job of await followUps.claimDueFollowUpJobs({ now: MANANA, limit: 10 })) {
      await processor.processFollowUpJob(job, {
        now: () => MANANA,
        sendText: async (_id, _phone, body) => { enviados.push(body); return "wamid.test"; },
        sendTemplate: async () => "wamid.template",
      });
    }

    expect(enviados).toHaveLength(1);
    expect(enviados[0]).not.toMatch(/me quedé pendiente de tu visita/i);
    expect(enviados[0]).toMatch(/no se olvide/i);
    expect(enviados[0]).toMatch(/jueves 27 de agosto de 4 a 5 pm/i);
    // El número de cotización ya no se le escribe al cliente (26-ago, Joaquín):
    // el recordatorio le dice que la lleve, no cómo se llama.
    expect(enviados[0]).toMatch(/lleve a mano su cotización/i);
    expect(enviados[0]).not.toMatch(/COT-|AV-/);
  });

  /*
   * El daño que no se veía en la captura: sin fecha registrada, el asesor nunca
   * supo que Cesar venía. Ese aviso es la razón de ser de todo el cierre.
   */
  /*
   * La tercera puerta: con `DIRECT_SALES_ROUTES_ENABLED=true` una respuesta
   * seca de visita la contesta una ruta determinística, sin pasar por el
   * agente. Desde que el extractor tolera faltas, `customer_commitment` puede
   * ser «X eso el juebes» — y esta ruta lo devolvía entre asteriscos como si
   * fuera la fecha.
   */
  it("la ruta directa confirma la fecha interpretada, no el typo del cliente", async () => {
    const conv = await conversacionDeCesar();
    const visita = compromiso.extractCustomerCommitment("X eso el juebes de 4 a 5", LUNES, {
      respondiendoAlDia: true,
    });
    await entra(conv.id, "X eso el juebes de 4 a 5");
    const rutas = await import("../src/services/directSalesRoutes.js");
    const respuesta = await rutas.tryDirectSalesRoute(
      {
        conversation: { id: conv.id, current_cycle: 1, stage: "seguimiento_venta" } as never,
        customerPhone: "593998447910",
        explicitStore: null,
        commitment: visita,
      },
      "X eso el juebes de 4 a 5",
    );

    expect(respuesta).not.toBeNull();
    expect(respuesta!).not.toMatch(/juebes/i);
    expect(respuesta!).toMatch(/jueves 27 de agosto de 4 a 5 pm/i);
    expect(respuesta!).toMatch(/Depot Tire Quito Sur/);
  });

  /*
   * El turno de las 11:57: dio la hora pero no el día. El compromiso existe
   * (hay que anotarlo) pero NO hay fecha, así que esta ruta deja el turno al
   * agente — que es quien puede contestar además el «soy de provincia».
   */
  it("con hora pero sin día, la ruta directa no se queda con el turno", async () => {
    const conv = await conversacionDeCesar();
    const texto = "X la tarde de 4 a 5  x yo soy de probincia i ese día paso x ai";
    const visita = compromiso.extractCustomerCommitment(texto, LUNES);
    expect(visita?.visitDate).toBeUndefined();
    await entra(conv.id, texto);

    const rutas = await import("../src/services/directSalesRoutes.js");
    const respuesta = await rutas.tryDirectSalesRoute(
      {
        conversation: { id: conv.id, current_cycle: 1, stage: "seguimiento_venta" } as never,
        customerPhone: "593998447910",
        explicitStore: null,
        commitment: visita,
      },
      texto,
    );

    expect(respuesta).toBeNull();
  });

  it("el asesor recibe el aviso de visita comprometida, con la hora que dijo el cliente", async () => {
    const conv = await conversacionDeCesar();
    const visita = await entra(conv.id, "X eso el juebes de 4 a 5");
    const visitAlerts = await import("../src/services/visitAlerts.js");
    await visitAlerts.avisarVisitaComprometida({
      conversationId: conv.id,
      cycle: 1,
      texto: "X eso el juebes de 4 a 5",
      visitDate: visita?.visitDate,
      visitTimeLabel: visita?.visitTimeLabel,
    });

    const [alerta] = await appSql<{ summary: string }[]>`
      select summary from bot_alerts
      where conversation_id = ${conv.id} and type = 'visita_comprometida'
    `;
    expect(alerta.summary).toMatch(/jueves 27 de agosto,? de 4 a 5 pm/i);
    // La hora inventada de antes: `visit_date` traía las 10:00 de relleno.
    expect(alerta.summary).not.toMatch(/10:00/);
  });

  /*
   * El cupón sale como bloque aparte, al final del turno. Cuando «lo último que
   * dijimos» era un solo mensaje, ese bloque tapaba la pregunta por el día y la
   * respuesta del cliente dejaba de leerse — probado en el simulador el 26-ago
   * con un reagendamiento que se perdió entero.
   */
  it("el bloque del cupón no tapa la pregunta por el día", async () => {
    const conv = await conversacionDeCesar();
    await appSql`
      update conversations set visit_time_label = 'de 4 a 5 pm' where id = ${conv.id}
    `;
    await appSql`
      insert into messages (conversation_id, cycle, role, direction, type, content)
      values
        (${conv.id}, 1, 'assistant', 'outbound', 'text',
         'Perfecto: *jueves 27 de agosto de 4 a 5 pm en Depot Tire Quito Sur*. Ya quedó registrado.'),
        (${conv.id}, 1, 'assistant', 'outbound', 'text',
         '🎟️ Su código de descuento es *DT-RUTA76*. Dígalo en caja antes de pagar.')
    `;
    const ultimo = await conversations.lastOutboundText(conv.id);
    expect(compromiso.preguntamosElDia(ultimo)).toBe(true);

    const visita = await entra(conv.id, "disculpe mejor el 3 de septiembre a la misma hora", MIERCOLES);
    expect(visita?.visitDate?.toISOString().slice(0, 10)).toBe("2026-09-03");
    // Y hereda la hora que ya estaba registrada.
    expect(visita?.visitTimeLabel).toBe("de 4 a 5 pm");
  });
});
