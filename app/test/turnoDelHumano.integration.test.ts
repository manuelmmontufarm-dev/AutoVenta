/**
 * FAMILIA 2-E CONTRA UNA BASE DE VERDAD: las secuencias de producción.
 *
 *  · Conv 15426 (F-150, aro 20): el dueño atendió el 21-sep; el cliente
 *    escribió «Buenas tardes» 19,6 h después. El reinicio por inactividad abrió
 *    el ciclo 2 (ficha vacía, etapa «nuevo»), la pausa de 6 h ya había vencido,
 *    `devolverAlBotSiVencioLaPausa` le dio el chat al bot, y el bot saludó como
 *    a un desconocido y pidió la medida dos veces más.
 *  · Conv 21640: el seguimiento `advisor_review` pasó el chat a humano con
 *    pausa `infinity`. El cliente escribió 80 min después («¿Qué precio tienen
 *    los 4 neumáticos? Envié unas fotos»): guardado, sin bot, sin alerta, y el
 *    rescate de 12 h no mira las pausas infinitas. Le contestaron a mano 7 días
 *    después.
 *  · Conv 21766: «Lo compro x este medio… me envía» y al día siguiente el
 *    seguimiento le preguntó qué día pasaba por Cumbayá.
 *  · Conv 23084: «ya dejé el caso anotado» — la frase solo puede salir si hay
 *    registro de verdad.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = `autoventa_turno_humano_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let conversations: typeof import("../src/services/conversations.js");
let turno: typeof import("../src/services/turnoDelHumano.js");
let salida: typeof import("../src/services/prepararSalida.js");
let processor: typeof import("../src/services/followUpProcessor.js");
let compra: typeof import("../src/services/compraADistancia.js");

async function alertasAbiertas(conversationId: number, tipo: string) {
  return appSql<{ priority: string; exact_reason: string; status: string }[]>`
    select priority, exact_reason, status from bot_alerts
    where conversation_id=${conversationId} and type=${tipo} and status in ('open','snoozed')
  `;
}

function paso(nombre: string) {
  const encontrado = salida.PASOS.find((p) => p.nombre === nombre);
  if (!encontrado) throw new Error(`No existe el paso ${nombre}`);
  return encontrado;
}

describe.sequential("el turno del humano", () => {
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
    salida = await import("../src/services/prepararSalida.js");
    processor = await import("../src/services/followUpProcessor.js");
    compra = await import("../src/services/compraADistancia.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  it("conv 15426: pausa vencida + el dueño habló último → ni ciclo nuevo, ni bot, y alerta alta", async () => {
    const conv = await conversations.getOrCreateConversation("593982774201", "Ali");
    await appSql`
      update conversations set stage='seguimiento_venta', tire_size='275/60R20',
        vehicle='Ford F-150 Lariat 2024', assigned_to='human',
        bot_paused_until='2026-09-22T03:45:48Z',
        last_customer_message_at='2026-09-21T21:46:00Z',
        last_assistant_message_at='2026-09-21T21:45:48Z'
      where id=${conv.id}
    `;
    await appSql`
      insert into messages (conversation_id, cycle, role, direction, author_kind, type, content, created_at)
      values
        (${conv.id}, 1, 'user', 'inbound', 'customer', 'text', 'Gracias', '2026-09-21T21:45:47Z'),
        (${conv.id}, 1, 'assistant', 'outbound', 'owner', 'text', 'excelente tarde', '2026-09-21T21:45:48Z'),
        (${conv.id}, 1, 'user', 'inbound', 'customer', 'text', 'Igualmente para usted', '2026-09-21T21:46:00Z')
    `;
    const buenasTardes = new Date("2026-09-22T17:24:32Z");

    const trasElSilencio = await conversations.reiniciarSiLaMemoriaVencio(conv, buenasTardes);
    // El chat que atiende una persona no es un chat frío: la ficha se queda.
    expect(trasElSilencio.current_cycle).toBe(conv.current_cycle);
    const [ficha] = await appSql<{ tire_size: string | null; stage: string; assigned_to: string }[]>`
      select tire_size, stage, assigned_to from conversations where id=${conv.id}
    `;
    expect(ficha).toMatchObject({ tire_size: "275/60R20", stage: "seguimiento_venta" });

    await conversations.appendMessage(conv.id, "user", "Buenas tardes", "wamid.15426.1", { occurredAt: buenasTardes });
    const decision = await turno.decidirQuienContesta(conv.id, "Buenas tardes", buenasTardes);
    expect(decision).toEqual({ contesta: "humano", motivo: "el_humano_hablo_ultimo" });

    // No se le devolvió el chat al bot…
    const [despues] = await appSql<{ assigned_to: string }[]>`select assigned_to from conversations where id=${conv.id}`;
    expect(despues.assigned_to).toBe("human");
    // …y el asesor tiene una alerta alta con lo que escribió el cliente.
    const alertas = await alertasAbiertas(conv.id, "cliente_sin_respuesta");
    expect(alertas).toHaveLength(1);
    expect(alertas[0].priority).toBe("high");
    expect(alertas[0].exact_reason).toContain("Buenas tardes");
  });

  it("conv 21640: advisor_review deja pausa finita; lo que escribe el cliente levanta y refresca UNA alerta", async () => {
    const conv = await conversations.getOrCreateConversation("593992528699", "Cliente 21640");
    const traspaso = new Date("2026-09-20T14:00:00Z");
    await appSql`
      update conversations set stage='cotizacion_enviada', assigned_to='bot',
        last_customer_message_at='2026-09-19T13:00:00Z', last_assistant_message_at='2026-09-19T13:01:00Z'
      where id=${conv.id}
    `;
    const [job] = await appSql<{ id: number }[]>`
      insert into follow_up_jobs (conversation_id, cycle, type, channel, due_at, idempotency_key, payload, status, locked_at, locked_by)
      values (${conv.id}, 1, 'advisor_review', 'advisor', ${traspaso}, 'advisor-review-21640',
        '{"reason":"Ventana de 24 horas agotada","preview":"Revisar"}'::jsonb,
        'processing', ${traspaso}, 'test-worker') returning id
    `;
    await processor.processFollowUpJob({ id: Number(job.id) } as never, { now: () => traspaso });

    const [estado] = await appSql<{ assigned_to: string; pausa: string }[]>`
      select assigned_to, bot_paused_until::text as pausa from conversations where id=${conv.id}
    `;
    expect(estado.assigned_to).toBe("human");
    // Una pausa que no vence es un chat mudo para siempre: el rescate de 12 h
    // no la mira y `devolverAlBotSiVencioLaPausa` nunca la encuentra vencida.
    expect(estado.pausa).not.toBe("infinity");

    const ochentaMinutos = new Date(traspaso.getTime() + 80 * 60_000);
    const pregunta = "¿Qué precio tienen los 4 neumáticos? Envié unas fotos";
    await conversations.appendMessage(conv.id, "user", pregunta, "wamid.21640.1", { occurredAt: ochentaMinutos });
    expect(await turno.decidirQuienContesta(conv.id, pregunta, ochentaMinutos))
      .toEqual({ contesta: "humano", motivo: "pausa_vigente" });
    let alertas = await alertasAbiertas(conv.id, "cliente_sin_respuesta");
    expect(alertas).toHaveLength(1);
    expect(alertas[0].priority).toBe("high");

    // Un segundo mensaje no abre otra: refresca la misma con lo último.
    const otro = new Date(ochentaMinutos.getTime() + 5 * 60_000);
    await conversations.appendMessage(conv.id, "user", "Hola??", "wamid.21640.2", { occurredAt: otro });
    await turno.decidirQuienContesta(conv.id, "Hola??", otro);
    alertas = await alertasAbiertas(conv.id, "cliente_sin_respuesta");
    expect(alertas).toHaveLength(1);
    expect(alertas[0].exact_reason).toContain("Hola??");

    // Cuando la persona contesta (eco o panel), la alerta deja de estar abierta.
    await conversations.setConversationAssignee(conv.id, "human");
    expect(await alertasAbiertas(conv.id, "cliente_sin_respuesta")).toHaveLength(0);
  });

  it("pausa vencida y el último saliente es del bot: contesta el bot (la red del 8-ago no se toca)", async () => {
    const conv = await conversations.getOrCreateConversation("593900002001", "Vuelve");
    await appSql`
      update conversations set assigned_to='human', bot_paused_until='2026-09-20T20:00:00Z'
      where id=${conv.id}
    `;
    await appSql`
      insert into messages (conversation_id, cycle, role, direction, author_kind, type, content, created_at)
      values (${conv.id}, 1, 'assistant', 'outbound', 'bot', 'text', '¿Le cotizo la 1 o la 2?', '2026-09-20T13:00:00Z')
    `;
    expect(await turno.decidirQuienContesta(conv.id, "la 2", new Date("2026-09-21T15:00:00Z")))
      .toEqual({ contesta: "bot" });
    expect(await alertasAbiertas(conv.id, "cliente_sin_respuesta")).toHaveLength(0);
  });

  it("conv 21766: quien compra a distancia no recibe «¿qué día pasa?» en el seguimiento, y hay alerta alta", async () => {
    const conv = await conversations.getOrCreateConversation("593997977317", ".");
    await appSql`update conversations set stage='seguimiento_venta', nearest_store='Depot Tire Cumbayá' where id=${conv.id}`;
    const texto = "Lo compro x este medio me cotiza lo cancelo comfirma y me envia";
    await appSql`
      insert into messages (conversation_id, cycle, role, direction, author_kind, type, content, created_at)
      values
        (${conv.id}, 1, 'user', 'inbound', 'customer', 'text', ${texto}, now() - interval '1 day'),
        (${conv.id}, 1, 'user', 'inbound', 'customer', 'text', 'Copiado', now() - interval '23 hours')
    `;
    await compra.avisarCompraADistancia({ id: conv.id, current_cycle: 1 }, texto);
    const [alerta] = await appSql<{ priority: string }[]>`
      select priority from bot_alerts where conversation_id=${conv.id} and type='customer_ready_to_buy'
    `;
    expect(alerta?.priority).toBe("high");

    const ctx = {
      conversation: { id: conv.id, current_cycle: 1, stage: "seguimiento_venta" as const },
      tipo: "seguimiento" as const,
    };
    const seguimiento =
      "Me quedé pendiente de su visita a *Depot Tire Cumbayá*.\n\n¿Qué día cree que puede pasar por *Depot Tire Cumbayá*?";
    expect(await paso("el_cliente_tomo_el_turno").aplicar(seguimiento, ctx)).toBeNull();
    expect((ctx as { motivoDeSupresion?: string }).motivoDeSupresion).toBe("compra_a_distancia");

    // Y en un turno normal la pregunta del día sale del texto; lo demás queda.
    const respuesta =
      "Perfecto. La cotización ya está enviada.\n---\n¿Qué día cree que puede pasar por *Depot Tire Cumbayá*?";
    const limpio = await paso("sin_visita_si_no_puede_venir").aplicar(respuesta, {
      ...ctx, tipo: "respuesta", textoDelCliente: "Copiado",
    });
    expect(limpio).toBe("Perfecto. La cotización ya está enviada.");
  });

  it("conv 23084: «ya dejé el caso anotado» solo sale si este turno dejó un registro", async () => {
    const conv = await conversations.getOrCreateConversation("593981696630", "Daniel");
    const borrador =
      "Para provincias como Loja, lo revisa un asesor porque depende de cobertura y envío. Ya dejé el caso anotado para que le confirmen 🙌";
    const inicioDelTurno = new Date(Date.now() - 1_000);
    const ctx = {
      conversation: { id: conv.id, current_cycle: 1, stage: "seguimiento_venta" as const },
      tipo: "respuesta" as const,
      inicioDelTurno,
    };
    const sinRegistro = await paso("sin_aviso_inventado").aplicar(borrador, ctx);
    expect(sinRegistro).not.toMatch(/anotado|lo revisa un asesor/i);
    expect(sinRegistro).toContain("Se lo consulto y le confirmo.");
    // Y «se lo consulto» no queda en el aire: la consulta se registra.
    const [consulta] = await appSql<{ priority: string }[]>`
      select priority from bot_alerts where conversation_id=${conv.id} and type='caso_sin_resolver'
    `;
    expect(consulta?.priority).toBe("high");

    // Con el registro hecho en el turno (la alerta de envío, como en la
    // conv 23084 real a las 19:51:03), la frase es cierta y sale tal cual.
    const otra = await conversations.getOrCreateConversation("593981696631", "Daniel 2");
    await appSql`
      insert into bot_alerts (conversation_id, cycle, type, priority, summary, exact_reason, suggested_action, dedupe_key)
      values (${otra.id}, 1, 'envio_fuera_de_cobertura', 'high', 'Loja', 'Sin ubicación', 'Cotizar envío', ${`${otra.id}:1:envio_fuera_de_cobertura`})
    `;
    expect(await paso("sin_aviso_inventado").aplicar(borrador, {
      ...ctx, conversation: { ...ctx.conversation, id: otra.id },
    })).toBe(borrador);

    // Un aviso de OTRO turno no autoriza la frase (conv 21766: los avisos del
    // ciclo existían y habían rebotado todos).
    const vieja = await conversations.getOrCreateConversation("593981696632", "Daniel 3");
    await appSql`
      insert into bot_alerts (conversation_id, cycle, type, priority, summary, exact_reason, suggested_action, dedupe_key, created_at)
      values (${vieja.id}, 1, 'customer_ready_to_buy', 'high', 'x', 'x', 'x', ${`${vieja.id}:1:customer_ready_to_buy`}, now() - interval '1 day')
    `;
    expect(await paso("sin_aviso_inventado").aplicar("Ya está avisado el asesor.", {
      ...ctx, conversation: { ...ctx.conversation, id: vieja.id },
    })).toBe("Se lo consulto y le confirmo.");
  });
});
