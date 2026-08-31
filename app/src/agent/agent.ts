/**
 * Loop del agente con OpenAI Chat Completions y function calling.
 * Ejecuta las tools locales y devuelve los resultados al modelo hasta obtener
 * una respuesta final para WhatsApp.
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { config } from "../config.js";
import {
  ofertaDeCotizacionAceptada,
  ofertaDeCotizacionVigenteAceptada,
  ofertaDeCotizarAceptada,
  ordenDeCotizarYa,
  recordatorioDeOfertaPendiente,
} from "../domain/ofertaAceptada.js";
import {
  marcaPreguntada, ordenDeConsultarRespaldo, ordenDeNombrarLaMarca, preguntaTecnicaDeRespaldo,
} from "../domain/consultaConRespaldo.js";
import { esAcuseSimple } from "../domain/ofertaAceptada.js";
import { respaldoCompleto } from "../domain/respaldoMarcas.js";
import { preguntaElLocal } from "../domain/storeSelection.js";
import { preguntaElDia } from "../domain/customerCommitment.js";
import { ordenDeNoReusarLaVitrina, vitrinaQueNoEsSuMedida } from "../domain/vitrinaVieja.js";
import { extractTireSizes, formatTireSize } from "../domain/tireSize.js";
import { getHistory, logAiRun } from "../services/conversations.js";
import { getAiConfig, getPublishedStagePrompt, getStoreHours } from "../services/settings.js";
import { getPhaseFlags, toolEnabled } from "../services/phases.js";
import { buildSystemPrompt } from "./prompts.js";
import { buildTools, type AgentContext } from "./tools.js";
import { getActiveDiscountOffer } from "../services/discountOffers.js";
import {
  discountOfferMessage,
  getPendingDiscountRule,
  pendingDiscountNoticeMessage,
} from "../services/discountOffers.js";
import { sql } from "../db/client.js";
import { activeBenefitFactsBlock } from "../services/benefits.js";
import { medidaEstaPedida } from "../domain/medidaPedida.js";
import { medidasDelPedido } from "../services/medidasDelPedido.js";
import { extractVehicleYear, type Escalones } from "../domain/salesIntent.js";
import { chatReasoningEffort } from "./aiRequestPolicy.js";
import { elegirFaseOperativa } from "./faseOperativa.js";
import {
  consultaFueraDeCatalogoActiva,
  ORDEN_FUERA_DE_CATALOGO,
} from "../domain/alcanceComercial.js";
import { hechosDeRestricciones, restriccionesDeLlanta } from "../domain/restriccionesLlanta.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/** Rondas del loop antes de rendirse; el rescate es la ronda siguiente. */
/**
 * Qué modelo atiende cada ronda del turno.
 *
 * Un turno sano se resuelve en 2–3 iteraciones (busca → pieza → responde). En
 * etapas post-cotización las dos primeras pueden usar `routineModel`; hoy se
 * configura igual a GPT-5.5 y solo se bajará después de un shadow eval. Si el
 * loop sigue, vuelve al principal y, al agotarse, el rescate siempre usa el
 * modelo de escalación con todo el contexto acumulado.
 *
 * Con OPENAI_ESCALATION_MODEL sin definir, config lo iguala al principal: sin
 * variable de entorno esto no cambia absolutamente nada.
 */
function modeloDelTurno(
  iteration: number,
  stage: AgentContext["conversation"]["stage"],
  exactoBarato = false,
): string {
  const routineStage = stage === "cotizacion_enviada" || stage === "seguimiento_venta";
  if (routineStage && iteration < 2) return config.openai.routineModel;
  if (exactoBarato && iteration < 2) return config.openai.exactToolModel!;
  return iteration < Math.min(4, config.openai.maxToolIterations)
    ? config.openai.model
    : config.openai.escalationModel;
}

/**
 * CANARY DEL TURNO EXACTO (25-ago).
 *
 * El 45 % de las corridas de producción termina en `exact_tool_reply`: la
 * herramienta devuelve `mensaje_para_enviar` y ese texto sale VERBATIM — el
 * modelo no redactó nada, solo eligió la herramienta. Pagar el cerebro grande
 * por enrutar es el gasto más grande que queda (2,85 M de tokens vivos en 14
 * días, medido el 25-ago). Con OPENAI_EXACT_TOOL_MODEL, las dos primeras
 * rondas de las etapas NO rutinarias van con el barato, con una regla dura:
 * el barato SOLO puede enrutar. Si contesta texto libre (eso es prosa
 * comercial: territorio del principal) o llama una herramienta con efectos
 * reales, la ronda se repite con el principal y lo del barato se descarta
 * SIN ejecutarse. Las etapas rutinarias no cambian: ya tienen su propio
 * canary con OPENAI_ROUTINE_MODEL.
 *
 * Estas dos herramientas firman cosas (una cotización real, un WhatsApp al
 * asesor): un argumento mal elegido no se corrige con retry. El barato no
 * las toca ni para acertar.
 */
const HERRAMIENTAS_CON_EFECTOS = new Set(["generar_cotizacion", "notificar_vendedor", "agendar_visita"]);

/** Rollout estable por conversación: la misma conversación siempre cae del mismo lado. */
function turnoExactoBarato(conversationId: number, stage: AgentContext["conversation"]["stage"]): boolean {
  if (!config.openai.exactToolModel || config.openai.exactToolModel === config.openai.model) return false;
  const etapaRutinaria = stage === "cotizacion_enviada" || stage === "seguimiento_venta";
  if (etapaRutinaria) return false;
  return conversationId % 100 < config.openai.exactToolRollout;
}

/**
 * Red de seguridad del turno (16-ago).
 *
 * `ejecutarAgente` toca Postgres, OpenAI, el Interbot y WheelSize, y hasta hoy
 * ninguna de esas excepciones estaba capturada en el camino principal: subían
 * intactas hasta `pipeline/inbound.ts`, que solo hace `console.error`. El
 * cliente se quedaba sin ninguna respuesta, sin fila en `ai_runs` y sin aviso
 * al asesor — el fallo más caro posible, porque desde fuera parece que el bot
 * está muerto.
 *
 * Un turno SIEMPRE devuelve texto. Si no hay nada que decir, se dice lo mínimo
 * y queda registrado para que el guardián y el reporte diario lo vean.
 */
export async function runAgent(ctx: AgentContext, userText: string): Promise<string> {
  try {
    return await ejecutarAgente(ctx, userText);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error("❌ El turno del agente se cayó entero:", mensaje);
    await logAiRun({
      conversationId: ctx.conversation.id,
      stage: ctx.conversation.stage,
      model: config.openai.model,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      iterations: 0,
      route: "failed",
      tools: [],
      error: `excepcion_no_capturada: ${mensaje}`,
    }).catch(() => {});
    return "Disculpa, se me cruzaron los cables un momento. ¿Me repites lo último, por favor?";
  }
}

async function ejecutarAgente(ctx: AgentContext, userText: string): Promise<string> {
  const startedAt = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let reasoningTokens = 0;
  const usedTools: string[] = [];
  const executedCalls = new Set<string>();
  // El estilo se edita en /configuracion/ia; getAiConfig cachea 30 s en memoria.
  const [aiConfig, activeDiscount, pendingDiscount, salesFacts, phaseFlags, storeHours, benefitFacts, history] =
    await Promise.all([
      getAiConfig(),
      getActiveDiscountOffer(ctx.conversation.id),
      getPendingDiscountRule(ctx.conversation.id),
      getAgentSalesFacts(ctx.conversation.id),
      getPhaseFlags(),
      getStoreHours(),
      activeBenefitFactsBlock(),
      getHistory(ctx.conversation.id, config.openai.historyLimit),
    ]);
  // ¿Le ofrecimos cotizar y contestó «gracias»? Eso es un sí (conv 11070,
  // 27-ago). Se calcula acá porque el último saliente ya está en `history`.
  // Ver `domain/ofertaAceptada.ts`.
  const ultimoDelBot = [...history].reverse().find((m) => m.role === "assistant");
  const aceptoLaOferta = ofertaDeCotizarAceptada(
    typeof ultimoDelBot?.content === "string" ? ultimoDelBot.content : null,
    userText,
  );
  ctx.aceptoOfertaComercial = aceptoLaOferta;
  ctx.aceptoCotizacion = ofertaDeCotizacionAceptada(
    typeof ultimoDelBot?.content === "string" ? ultimoDelBot.content : null,
    userText,
  );
  // La oferta que quedó pendiente uno o dos turnos atrás también cuenta
  // (T115 conv 9684, 30-ago): el acuse la acepta mientras no haya negativa.
  const aceptoOfertaPendiente = !ctx.aceptoCotizacion
    && ofertaDeCotizacionVigenteAceptada(history, userText);
  if (aceptoOfertaPendiente) ctx.aceptoCotizacion = true;
  const textosDelCliente = [
    ...history.filter((m) => m.role === "user").map((m) => m.content),
    userText,
  ];
  const fueraDeCatalogo = consultaFueraDeCatalogoActiva(textosDelCliente);
  ctx.consultaFueraDeCatalogo = fueraDeCatalogo;
  const restricciones = restriccionesDeLlanta(textosDelCliente);
  const hechoRestricciones = hechosDeRestricciones(restricciones);
  const faseOperativa = elegirFaseOperativa({
    etapaGuardada: ctx.conversation.stage,
    texto: userText,
    tieneCotizacion: Boolean(salesFacts.lastQuote),
    aceptoCotizar: aceptoLaOferta,
    ultimoMensajeBot: typeof ultimoDelBot?.content === "string" ? ultimoDelBot.content : null,
  });
  ctx.faseOperativa = faseOperativa;
  if (faseOperativa !== ctx.conversation.stage) {
    usedTools.push(`fase_operativa:${faseOperativa}`);
  }
  // La tarjeta del Kanban conserva el avance comercial. El prompt y las tools
  // siguen la necesidad del mensaje actual: una venta en seguimiento puede
  // volver a opciones sin borrar lo ya cotizado, y después retomar el cierre.
  const stagePrompt = await getPublishedStagePrompt(faseOperativa);
  const systemPrompt = buildSystemPrompt(aiConfig, {
    key: faseOperativa,
    name: stagePrompt.stage,
    objective: stagePrompt.objective,
    prompt: stagePrompt.prompt,
    version: stagePrompt.version,
    storedStage: ctx.conversation.stage,
  }, storeHours);
  // ¿La vitrina que ya salió es de otra medida que la que acaba de pedir?
  // (conv 11881, 27-ago: muestra por aro 15 re-etiquetada como 225/70R15, con
  // el precio de una 185/55R15 adentro). La medida sale del mensaje de ESTE
  // turno porque la etapa la mueve el clasificador recién al final.
  // Ver `domain/vitrinaVieja.ts`.
  const medidaDelTurno =
    extractTireSizes(userText).map(formatTireSize)[0] ?? salesFacts.tireSize ?? null;
  const [piezaPrevia] = await sql<{ metadata: { sizeLabel?: string | null; escalones?: Record<string, { nombre?: string }> } | null }[]>`
    select metadata from messages
    where conversation_id=${ctx.conversation.id} and cycle=${ctx.conversation.current_cycle}
      and role='assistant' and metadata->>'piece' = 'options'
    order by created_at desc limit 1
  `;
  const vitrinaAjena = piezaPrevia
    ? vitrinaQueNoEsSuMedida(
        {
          sizeLabel: piezaPrevia.metadata?.sizeLabel ?? null,
          etiquetas: Object.values(piezaPrevia.metadata?.escalones ?? {})
            .map((e) => e?.nombre ?? "")
            .filter(Boolean),
        },
        medidaDelTurno,
      )
    : null;
  if (history.at(-1)?.role === "user" && history.at(-1)?.content === userText) history.pop();
  ctx.currentUserText = userText;
  ctx.storeHours = storeHours;
  const allTools = buildTools(ctx);
  // La lista publicada por el administrador vuelve a ser la autoridad completa
  // para esta necesidad del turno. Un segundo recorte fijo por fase revivió el
  // dead-state del ticket 2150 (conv 8318, 29-ago): seguimiento no podía buscar
  // una medida que el cliente acababa de pedir.
  const HERRAMIENTAS_FUERA_DE_CATALOGO = new Set([
    "notificar_vendedor", "ubicacion_locales", "local_mas_cercano", "agendar_visita",
  ]);
  const allowed = new Set(
    fueraDeCatalogo
      ? stagePrompt.allowedTools.filter((name) => HERRAMIENTAS_FUERA_DE_CATALOGO.has(name))
      : stagePrompt.allowedTools,
  );
  // Gate de fases: aunque el prompt permita una tool, si está gateada solo se
  // ofrece con su fase encendida. Las no gateadas pasan siempre.
  const localTools =
    allowed.size === 0
      ? []
      : allTools.filter(
          (tool) => allowed.has(tool.function.name) && toolEnabled(tool.function.name, phaseFlags),
        );
  const tools: ChatCompletionTool[] = localTools.map(({ execute: _execute, ...tool }) => ({
    type: "function",
    function: tool.function,
  }));
  // ORDEN DE LOS MENSAJES = PRECIO DE LA ENTRADA (16-ago).
  //
  // OpenAI cachea el PREFIJO del prompt y lo cobra a un décimo ($0,50/M contra
  // $5/M). El prefijo solo vale mientras sea idéntico byte a byte, así que se
  // corta en el primer bloque que cambie entre turnos.
  //
  // Hasta hoy el índice 1 era salesFactsPrompt, que lleva dentro
  // `hace N min` — un número distinto en cada turno. Resultado medido el
  // 10-ago en producción: 10.086 tokens cacheados por llamada contra un
  // prompt de sistema de 10.471. Es decir, el caché cubría el system y se
  // cortaba justo ahí; el historial y los esquemas de tools se pagaban
  // enteros en cada llamada. Esos 4.534 tokens vivos eran el 74,8% de la
  // factura.
  //
  // Ahora lo volátil va DESPUÉS del historial: el prefijo pasa a ser
  // [system][historial], que dentro de una conversación solo crece por el
  // final y por tanto se reutiliza. Los bloques de hechos y descuentos no
  // pierden fuerza por ir al final — al contrario, quedan más cerca del
  // mensaje del cliente, que es donde más se respetan.
  const marcaDelTurno = marcaPreguntada(userText);
  // EL DESCANSO DEL ACUSE (T115 conv 9887 turno 10, 30-ago): el turno pasado
  // el bot ya preguntó local o día y el cliente respondió un puro acuse. El
  // borrador NO debe volver a empujar — el guardián lo corregía, pero un
  // borrador que necesita rescate ya es la falla. Determinístico.
  const textoUltimoDelBot = typeof ultimoDelBot?.content === "string" ? ultimoDelBot.content : "";
  const descansoDelAcuse =
    !aceptoLaOferta && !ctx.aceptoCotizacion
    && esAcuseSimple(userText)
    && (preguntaElLocal(textoUltimoDelBot) || preguntaElDia(textoUltimoDelBot));
  // LA CONSULTA TÉCNICA SE EJECUTA, NO SE SUGIERE (T115 conv 11274 turno 8,
  // 30-ago): pedírselo al modelo no alcanzó — llamó dos veces al catálogo y
  // dijo «no tengo el dato». respaldo_marcas es determinística y barata: se
  // corre aquí y el resultado le llega como hecho, registrado en la huella.
  const esPreguntaTecnica = preguntaTecnicaDeRespaldo(userText);
  if (esPreguntaTecnica) usedTools.push("respaldo_marcas");
  const bloquesVolatiles: ChatCompletionMessageParam[] = [
    { role: "system", content: salesFactsPrompt(salesFacts, ctx.resumedFromHuman) },
    ...(aceptoLaOferta ? [{ role: "system" as const, content: ordenDeCotizarYa(userText) }] : []),
    ...(!aceptoLaOferta && aceptoOfertaPendiente
      ? [{ role: "system" as const, content: recordatorioDeOfertaPendiente(userText) }]
      : []),
    // Marca preguntada y dato técnico: los dos hechos de T115 conv 11274
    // (30-ago). Ver domain/consultaConRespaldo.ts.
    ...((marcaDelTurno) ? [{ role: "system" as const, content: ordenDeNombrarLaMarca(marcaDelTurno) }] : []),
    ...(esPreguntaTecnica
      ? [{
          role: "system" as const,
          content:
            `${ordenDeConsultarRespaldo()}\n\nRESULTADO DE respaldo_marcas (ya consultado por el sistema): `
            + JSON.stringify(respaldoCompleto()),
        }]
      : []),
    ...(descansoDelAcuse
      ? [{
          role: "system" as const,
          content:
            "ACUSE TRAS TU PROPIA PREGUNTA (fuente determinística): en tu último mensaje ya pediste "
            + "el local o el día y el cliente respondió solo un acuse. PROHIBIDO repetir esa pregunta y "
            + "PROHIBIDO empujar visita, ubicación, cierre o cotización en este turno: agradece en una "
            + "línea, quédate disponible y nada más.",
        }]
      : []),
    ...(vitrinaAjena && medidaDelTurno
      ? [{ role: "system" as const, content: ordenDeNoReusarLaVitrina(vitrinaAjena, medidaDelTurno) }]
      : []),
    // Los beneficios vigentes de la tabla, como hecho (P-03, reunión 25-ago):
    // sin esto el bot decía «el balanceo es aparte» mientras su propia
    // cotización imprimía «alineación y balanceo incluidos». Va en los bloques
    // volátiles —detrás del historial— para no romper el prefijo del caché.
    ...(benefitFacts ? [{ role: "system" as const, content: benefitFacts }] : []),
    ...(fueraDeCatalogo
      ? [{ role: "system" as const, content: ORDEN_FUERA_DE_CATALOGO }]
      : []),
    ...(hechoRestricciones
      ? [{ role: "system" as const, content: hechoRestricciones }]
      : []),
    ...(activeDiscount ? [{ role: "system" as const, content: `OFERTA AUTORIZADA Y VIGENTE (fuente determinística): descuento adicional $${(activeDiscount.discountAmountCents / 100).toFixed(2)}, total final $${(activeDiscount.finalTotalCents / 100).toFixed(2)}, condición: ${activeDiscount.condition}. Motivo interno: ${activeDiscount.reason}. No cambies estos valores ni inventes otra oferta.` }] : []),
    ...(pendingDiscount ? [{ role: "system" as const, content: `DESCUENTO AUTORIZADO PENDIENTE DE COTIZACIÓN (fuente determinística): ${pendingDiscount.kind === "percentage" ? `${pendingDiscount.valueCents / 100}%` : `$${(pendingDiscount.valueCents / 100).toFixed(2)}`}, condición: ${pendingDiscount.condition}. No digas que no existe descuento. Se aplicará determinísticamente al generar la próxima cotización; antes de conocer el total no inventes ahorro ni total final.` }] : []),
  ];
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
    ...bloquesVolatiles,
    { role: "user", content: userText },
  ];

  // Modelo que produjo la respuesta que se devuelve al cliente. Se actualiza
  // ANTES de cada llamada (no después) para que la auditoría vea quién atendió
  // incluso si esa llamada revienta: interesa saber que ya se había escalado.
  let exactoBarato = turnoExactoBarato(ctx.conversation.id, faseOperativa);
  let modeloUsado = modeloDelTurno(0, faseOperativa, exactoBarato);
  let llamadasDeHerramienta = 0;
  let llamadasDuplicadas = 0;
  let falloEnLoop = false;

  for (let iteration = 0; iteration < config.openai.maxToolIterations; iteration += 1) {
    modeloUsado = modeloDelTurno(iteration, faseOperativa, exactoBarato);
    const gpt5 = modeloUsado.startsWith("gpt-5");
    const reasoningEffort = chatReasoningEffort(modeloUsado, tools.length > 0);
    // Un 429, un 500 o un timeout de OpenAI NO tumban el turno: se sale del
    // bucle y manda el rescate de abajo, que reintenta una sola vez con el
    // modelo de escalación y sin herramientas. Antes esta excepción subía
    // hasta el pipeline y el cliente no recibía nada.
    let response: Awaited<ReturnType<typeof openai.chat.completions.create>>;
    try {
      response = await openai.chat.completions.create({
        model: modeloUsado,
        messages,
        ...(tools.length > 0 ? { tools, tool_choice: "auto" as const } : {}),
        ...(tools.length > 0 ? { parallel_tool_calls: false } : {}),
        max_completion_tokens: config.openai.maxTokens,
        ...(gpt5 ? {
          // Chat Completions de GPT-5.5 solo acepta tools con `none`.
          reasoning_effort: reasoningEffort!,
          verbosity: "low" as const,
          prompt_cache_retention: "24h" as const,
        } : {}),
      });
    } catch (error) {
      falloEnLoop = true;
      console.warn(
        `⚠️ La llamada al modelo falló en la ronda ${iteration + 1}:`,
        error instanceof Error ? error.message : error,
      );
      break;
    }
    inputTokens += response.usage?.prompt_tokens ?? 0;
    outputTokens += response.usage?.completion_tokens ?? 0;
    cachedInputTokens += response.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    reasoningTokens += response.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    const message = response.choices[0]?.message;
    if (!message) {
      falloEnLoop = true;
      break;
    }

    // La red de seguridad del canary: el barato SOLO enruta. Texto libre es
    // prosa comercial (del principal); una herramienta con efectos firma cosas.
    // En los dos casos se descarta lo del barato SIN ejecutar nada y la MISMA
    // ronda se repite con el principal. `exactoBarato` se apaga, así que esto
    // ocurre a lo sumo una vez por turno. Los tokens del intento descartado
    // quedan sumados: son costo real del turno.
    if (exactoBarato && iteration < 2 && modeloUsado === config.openai.exactToolModel) {
      const primeraCall = message.tool_calls?.[0];
      const motivo = !message.tool_calls?.length
        ? "texto"
        : primeraCall?.type === "function" && HERRAMIENTAS_CON_EFECTOS.has(primeraCall.function.name)
          ? primeraCall.function.name
          : null;
      if (motivo) {
        usedTools.push(`escalado_a_cerebro:${motivo}`);
        exactoBarato = false;
        iteration -= 1;
        continue;
      }
    }
    messages.push(message);

    if (!message.tool_calls?.length) {
      const text = message.content?.trim();
      await logAiRun({
        conversationId: ctx.conversation.id,
        stage: ctx.conversation.stage,
        promptVersionId: stagePrompt.id,
        model: modeloUsado,
        latencyMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        reasoningTokens,
        iterations: iteration + 1,
        route: ctx.conversation.stage === "cotizacion_enviada" || ctx.conversation.stage === "seguimiento_venta" ? "routine_stage" : "commercial",
        tools: usedTools,
      });
      return withDiscountNotice(text || "Disculpa, ¿me repites por favor?", ctx, activeDiscount, pendingDiscount);
    }

    for (const call of message.tool_calls) {
      if (call.type !== "function") continue;
      llamadasDeHerramienta += 1;
      usedTools.push(call.function.name);
      const signature = `${call.function.name}:${call.function.arguments.trim()}`;
      const tool = localTools.find((candidate) => candidate.function.name === call.function.name);
      const repetida = executedCalls.has(signature);
      if (repetida) llamadasDuplicadas += 1;
      const result = repetida
        ? JSON.stringify({ error: "Esta misma herramienta con los mismos argumentos ya se ejecutó en este turno. Usa el resultado anterior y responde ahora; no la repitas." })
        : tool
          ? await tool.execute(parseArguments(call.function.arguments))
          : JSON.stringify({ error: `Tool desconocida: ${call.function.name}` });
      executedCalls.add(signature);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
      // La huella del turno, para el Ángel Guardián: qué se buscó y qué volvió.
      (ctx.toolTrace ??= []).push({
        herramienta: call.function.name,
        argumentos: call.function.arguments.slice(0, 300),
        resultado: result.slice(0, 500),
      });
      if (call.function.name === "enviar_comparacion") ctx.comparedThisTurn = true;
      const exact = exactToolReply(result);
      if (exact) {
        await logAiRun({
          conversationId: ctx.conversation.id,
          stage: ctx.conversation.stage,
          promptVersionId: stagePrompt.id,
          model: modeloUsado,
          latencyMs: Date.now() - startedAt,
          inputTokens,
          outputTokens,
          cachedInputTokens,
          reasoningTokens,
          iterations: iteration + 1,
          route: "exact_tool_reply",
          tools: usedTools,
        });
        return withDiscountNotice(exact, ctx, activeDiscount, pendingDiscount);
      }
    }
  }

  // RESCATE (5-ago): agotar las 8 rondas era la causa #1 del «tuve un problema
  // procesando» (7 casos en producción — el modelo se quedaba en bucle con una
  // herramienta que fallaba). Antes de rendirse, una última llamada SIN
  // herramientas lo obliga a responder al cliente con lo que ya averiguó.
  // ESCALACIÓN (7-ago): el rescate corría con el mismo modelo que acababa de
  // atascarse 8 veces; ahora es el turno del superior, con todo el contexto.
  // PRESUPUESTO DEL RESCATE (16-ago): en los modelos de razonamiento,
  // `max_completion_tokens` cubre el razonamiento Y la salida visible. El
  // rescate es la llamada con MÁS contexto del turno (system + hechos + hasta
  // 30 mensajes + 8 rondas de assistant/tool) y corría con el mismo tope de
  // 2048 y `reasoning_effort: medium`. Si el razonamiento se comía el
  // presupuesto, `content` volvía vacío y el código caía directo en la
  // disculpa que este bloque existe para evitar. Ahora el tope es holgado y,
  // si aun así vuelve cortado o vacío, hay un segundo intento sin razonamiento.
  const MAX_RESCATE = Math.max(config.openai.maxTokens, 4096);
  try {
    modeloUsado = config.openai.escalationModel;
    const gpt5 = modeloUsado.startsWith("gpt-5");
    const reasoningEffort = chatReasoningEffort(modeloUsado, false, true);
    const mensajesDeRescate: ChatCompletionMessageParam[] = [
      ...messages,
      {
        role: "system",
        content:
          "Se acabaron los intentos con herramientas. Responde AHORA al cliente con lo que ya sabes de esta conversación: si tienes opciones o precios de las herramientas, dilos; si algo falló, avanza por otro camino (pide el dato que falte o deriva al asesor). Prohibido disculparte por 'problemas procesando' y prohibido pedir que repita el mensaje.",
      },
    ];
    const rescate = await openai.chat.completions.create({
      model: modeloUsado,
      messages: mensajesDeRescate,
      max_completion_tokens: MAX_RESCATE,
      ...(gpt5 ? {
        reasoning_effort: reasoningEffort!,
        verbosity: "low" as const,
        prompt_cache_retention: "24h" as const,
      } : {}),
    });
    inputTokens += rescate.usage?.prompt_tokens ?? 0;
    outputTokens += rescate.usage?.completion_tokens ?? 0;
    cachedInputTokens += rescate.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    reasoningTokens += rescate.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    let texto = rescate.choices[0]?.message?.content?.trim();
    // Segundo intento SIN razonamiento. `finish_reason: "length"` significa que
    // el presupuesto se agotó antes de escribir nada visible; sin razonamiento
    // todo el tope va a la respuesta, que es lo único que hace falta aquí.
    if (!texto && gpt5) {
      const cortado = rescate.choices[0]?.finish_reason;
      console.warn(`⚠️ El rescate volvió sin texto (finish_reason: ${cortado ?? "?"}); reintento sin razonamiento.`);
      const segundo = await openai.chat.completions.create({
        model: modeloUsado,
        messages: mensajesDeRescate,
        max_completion_tokens: MAX_RESCATE,
        reasoning_effort: "none" as const,
        verbosity: "low" as const,
        prompt_cache_retention: "24h" as const,
      });
      inputTokens += segundo.usage?.prompt_tokens ?? 0;
      outputTokens += segundo.usage?.completion_tokens ?? 0;
      cachedInputTokens += segundo.usage?.prompt_tokens_details?.cached_tokens ?? 0;
      reasoningTokens += segundo.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
      texto = segundo.choices[0]?.message?.content?.trim();
    }
    if (texto) {
      // Llegar al límite no implica estar en bucle. Con el límite operativo de
      // tres, «buscar medida → ampliar catálogo → avisar al asesor» es una
      // cadena sana que solo necesita la ronda final de redacción. Se registra
      // como error únicamente si hubo fallo real o repetición de herramientas.
      const cadenaSanaFinalizada = !falloEnLoop
        && llamadasDuplicadas === 0
        && llamadasDeHerramienta === config.openai.maxToolIterations;
      await logAiRun({
        conversationId: ctx.conversation.id,
        stage: ctx.conversation.stage,
        promptVersionId: stagePrompt.id,
        model: modeloUsado,
        latencyMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        reasoningTokens,
        iterations: config.openai.maxToolIterations + 1,
        route: cadenaSanaFinalizada ? "tool_chain_finalized" : "rescue",
        tools: usedTools,
        error: cadenaSanaFinalizada ? undefined : "max_iterations_salvaged",
      });
      return withDiscountNotice(texto, ctx, activeDiscount, pendingDiscount);
    }
  } catch (error) {
    console.warn("⚠️ Rescate sin herramientas falló:", error instanceof Error ? error.message : error);
  }

  await logAiRun({
    conversationId: ctx.conversation.id,
    stage: ctx.conversation.stage,
    promptVersionId: stagePrompt.id,
    model: modeloUsado,
    latencyMs: Date.now() - startedAt,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    reasoningTokens,
    iterations: config.openai.maxToolIterations + 1,
    route: "failed",
    tools: usedTools,
    error: "max_iterations_or_empty_response",
  });
  return "Disculpa, tuve un problema procesando tu mensaje. ¿Me lo repites por favor?";
}

export interface AgentSalesFacts {
  tireSize: string | null;
  vehicle: string | null;
  vehicleYear: number | null;
  selectedProductCode: string | null;
  selectedQuantity: number | null;
  nearestStore: string | null;
  visitDate: Date | null;
  /** «de 4 a 5 pm»: la hora que dijo el cliente, para no inventarle otra. */
  visitTimeLabel: string | null;
  customerCommitment: string | null;
  /** Última cotización del ciclo — evita mandar dos números para la misma compra. */
  lastQuote: { number: string; total: number; minutesAgo: number; detalle: string | null; medida: string | null } | null;
  /** Las medidas que hoy se le pueden cotizar. Ver services/medidasDelPedido. */
  medidasDelPedido?: string[];
  /**
   * Escalones (premium/equilibrada/económica) de la ÚLTIMA pieza de opciones
   * del ciclo, guardados por preparar_opciones en la metadata del mensaje.
   * Es lo que permite entregar «la más barata» al turno siguiente sin volver
   * a buscar (cierre por preferencia, reunión 25-ago). Opcional: los tests
   * viejos y los ciclos sin pieza de opciones no lo traen.
   */
  escalones?: Escalones | null;
}

/**
 * «4 × KENDA KR50 225/60R17» — lo que la cotización CONTIENE, para el prompt.
 *
 * Sin esto el hecho decía número y total, y el modelo le colgaba la medida de
 * la conversación: la semana del 14-ago el guardián corrigió 8 borradores que
 * atribuían la cotización vigente a otra medida o marca (COT-MT06MIVA «queda
 * con Falken» siendo 4 × KR50, COT-MT0BS1YT «de 185/70R15» siendo 225/60R17).
 */
export function detalleDeItems(items: unknown): string | null {
  if (!Array.isArray(items) || !items.length) return null;
  const partes = items
    .map((raw) => {
      const linea = raw as { quantity?: unknown; brand?: unknown; design?: unknown; size?: unknown; sizeLabel?: unknown };
      const nombre = [linea.brand, linea.design].filter(Boolean).join(" ");
      if (!nombre) return null;
      const medida = linea.sizeLabel ?? linea.size;
      return `${Number(linea.quantity) || 1} × ${nombre}${medida ? ` ${medida}` : ""}`;
    })
    .filter(Boolean);
  return partes.length ? partes.join(", ") : null;
}

/** Exportada para pruebas: los hechos determinísticos que frenan al modelo (anti-duplicado, medida, cantidad). */
export async function getAgentSalesFacts(conversationId: number): Promise<AgentSalesFacts> {
  const [row] = await sql<{
    tire_size: string | null; vehicle: string | null; vehicle_year: number | null;
    current_cycle: number;
    selected_product_code: string | null; selected_quantity: number | null;
    nearest_store: string | null; visit_date: Date | null; visit_time_label: string | null;
    customer_commitment: string | null;
    inbound_messages: string[];
    last_quote_number: string | null; last_quote_total: string | number | null;
    last_quote_at: Date | null; last_quote_items: unknown;
    escalones: Escalones | null;
  }[]>`
    select c.tire_size, c.vehicle, c.vehicle_year, c.current_cycle, c.selected_product_code,
      c.selected_quantity, c.nearest_store, c.visit_date, c.visit_time_label,
      c.customer_commitment,
      q.quote_number as last_quote_number, q.total as last_quote_total,
      q.created_at as last_quote_at, q.items as last_quote_items,
      o.escalones,
      coalesce(array_agg(m.content order by m.created_at desc) filter (where m.id is not null), '{}') as inbound_messages
    from conversations c
    left join lateral (
      select quote_number, total, created_at, items from quotes
      where conversation_id=c.id and cycle=c.current_cycle
      order by created_at desc limit 1
    ) q on true
    left join lateral (
      select metadata->'escalones' as escalones from messages
      where conversation_id=c.id and cycle=c.current_cycle
        and metadata->>'piece'='options'
      order by created_at desc limit 1
    ) o on true
    left join messages m on m.conversation_id=c.id and m.cycle=c.current_cycle
      and m.direction='inbound'
    where c.id=${conversationId}
    group by c.id, q.quote_number, q.total, q.created_at, q.items, o.escalones
  `;
  const inferredYear = row?.vehicle_year ?? row?.inbound_messages
    .map(extractVehicleYear).find((value): value is number => value !== null) ?? null;
  return {
    tireSize: row?.tire_size ?? null,
    medidasDelPedido: await medidasDelPedido(conversationId, row?.current_cycle ?? 1),
    vehicle: row?.vehicle ?? null,
    vehicleYear: inferredYear,
    selectedProductCode: row?.selected_product_code ?? null,
    selectedQuantity: row?.selected_quantity ?? null,
    nearestStore: row?.nearest_store ?? null,
    visitDate: row?.visit_date ?? null,
    visitTimeLabel: row?.visit_time_label ?? null,
    customerCommitment: row?.customer_commitment ?? null,
    lastQuote: row?.last_quote_number && row.last_quote_at
      ? {
          number: row.last_quote_number,
          total: Number(row.last_quote_total ?? 0),
          minutesAgo: Math.round((Date.now() - row.last_quote_at.getTime()) / 60_000),
          detalle: detalleDeItems(row.last_quote_items),
          medida: (Array.isArray(row.last_quote_items) ? row.last_quote_items : [])[0]?.sizeLabel ?? null,
        }
      : null,
    escalones: row?.escalones ?? null,
  };
}

/** Exportada para pruebas: el bloque de sistema que aplica venta-primero sobre hechos de la base. */
export function salesFactsPrompt(facts: AgentSalesFacts, resumedFromHuman = false): string {
  // Cada línea dice el dato Y la pregunta que ese dato mata. El informe del
  // guardián de la semana del 14-ago mostró que «no vuelvas a preguntar un dato
  // listado aquí» (la instrucción genérica de abajo) no bastaba: el modelo
  // volvía a pedir la medida con la medida en pantalla, y «¿se la cotizo por
  // 4?» con la cantidad registrada. La prohibición pegada al dato sí se cumple.
  const lines = [
    facts.tireSize ? `Medida confirmada: ${facts.tireSize} — PROHIBIDO volver a pedir medida, aro o foto: ya los tienes.` : null,
    facts.vehicle ? `Vehículo mencionado: ${facts.vehicle}` : null,
    facts.vehicleYear ? `Año ya informado por el cliente: ${facts.vehicleYear}` : null,
    facts.selectedProductCode ? `Producto elegido: ${facts.selectedProductCode}` : null,
    facts.selectedQuantity ? `Cantidad ya confirmada: ${facts.selectedQuantity} — PROHIBIDO preguntar «¿se la cotizo por ${facts.selectedQuantity}?»: esa pregunta ya fue respondida; cotiza.` : null,
    facts.nearestStore ? `Local elegido/recomendado: ${facts.nearestStore} — nómbralo SIEMPRE tal cual; PROHIBIDO escribir el otro local o volver a ofrecer «¿Cumbayá o Quito Sur?».` : null,
    // Con FECHA y sin fecha son dos hechos distintos, y confundirlos cuesta caro
    // en las dos direcciones. Hasta el 26-ago, cualquier compromiso —aunque
    // fuera solo una hora— imprimía «PROHIBIDO volver a preguntar qué día
    // viene». Probado en el simulador: al cliente que escribió «de 4 a 5 … ese
    // día paso», el modelo, con la pregunta prohibida y sin el dato, se inventó
    // el día: «Listo, jueves de 4 a 5 pm». El cliente nunca dijo jueves.
    facts.visitDate
      ? `Día de visita YA REGISTRADO: ${facts.visitDate.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", weekday: "long", day: "numeric", month: "long" }).replace(",", "")}${facts.visitTimeLabel ? ` ${facts.visitTimeLabel}` : ""} — PROHIBIDO volver a preguntar qué día viene: ya lo dijo.`
      : facts.visitTimeLabel
        ? `Hora que dijo el cliente: ${facts.visitTimeLabel} — pero el DÍA todavía NO lo dijo. Confírmale la hora y pídele únicamente la fecha.`
        : null,
    facts.customerCommitment
      ? `Lo que escribió el cliente sobre su visita: «${facts.customerCommitment}»`
      : null,
    // El freno directo a la confabulación. El modelo no puede escribir un día
    // que no esté arriba: si no está, es que nadie lo dijo.
    facts.visitDate
      ? null
      : "PROHIBIDO escribir un día de la semana, «mañana» o una fecha para la visita: todavía no hay ninguno registrado. Invéntalo y le confirmas al cliente una cita que no existe.",
    facts.lastQuote
      ? `Cotización YA ENVIADA en este ciclo${facts.lastQuote.detalle ? `: ${facts.lastQuote.detalle}` : ""} por $${facts.lastQuote.total.toFixed(2)}, hace ${facts.lastQuote.minutesAgo} min. Al nombrarla, di ESE contenido: PROHIBIDO atribuirle otra medida, marca o total, y PROHIBIDO escribirle su número al cliente.`
      : null,
    // LA COTIZACIÓN QUE YA NO SIRVE (26-ago, conv 4732). Cuando la medida de
    // trabajo cambió después de cotizar, el número viejo no es «la cotización
    // del cliente»: es de otra llanta. Ahí el bot se quedó tres turnos
    // explicándole al cliente que su cotización no valía y prometiendo la
    // buena «apenas esté lista» — una promesa que nadie iba a cumplir, porque
    // nada la generaba. La salida es una sola y es una herramienta, no una
    // frase: cotizar de nuevo en la medida correcta.
    facts.lastQuote?.medida && (facts.medidasDelPedido?.length ?? 0) > 0
      && !medidaEstaPedida(facts.lastQuote.medida, facts.medidasDelPedido ?? [])
      ? `OJO: la cotización que enviaste es de ${facts.lastQuote.medida} y el cliente está comprando ${(facts.medidasDelPedido ?? []).join(" o ")}. Esa cotización NO le sirve. NO la menciones como válida, NO discutas medidas con él y NUNCA le prometas una cotización «que le paso apenas esté lista»: llama generar_cotizacion AHORA con la llanta correcta — la pieza nueva es la respuesta, no el texto.`
      : null,
    // El cierre de opciones pregunta la preferencia (mejor precio / equilibrada
    // / premium, reunión 25-ago). La respuesta llega en el turno SIGUIENTE, y
    // sin este hecho el modelo ya no tiene los precios de la pieza a mano.
    escalonesLine(facts.escalones ?? null),
  ].filter(Boolean);
  return [
    "HECHOS COMERCIALES CONFIRMADOS (fuente determinística):",
    ...(lines.length ? lines : ["Todavía no hay datos estructurados confirmados."]),
    "No vuelvas a preguntar un dato listado aquí. Pregunta únicamente lo que falte.",
    facts.nearestStore && facts.visitDate
      ? "Local y visita ya están confirmados. Confirma el plan una sola vez y NO vuelvas a pedir local ni fecha."
      : null,
    // El puente entre entender y registrar: sin esta línea el modelo confirma
    // la visita por escrito y el sistema no se entera (conv. 9878, 24-ago).
    //
    // Va en los DOS casos. Cuando solo cubría «todavía no hay fecha», el
    // simulador cazó el reverso: el cliente reagendó («mejor el 3 de
    // septiembre»), el bot le dijo que sí, y el registro se quedó en el jueves
    // anterior — el modelo no tenía ninguna instrucción para ese turno.
    facts.visitDate
      ? "Si el cliente CAMBIA el día o la hora de su visita, llama agendar_visita en ese mismo turno con los datos nuevos: el registro no se actualiza solo, y confirmarle el cambio por escrito sin llamarla deja al asesor esperándolo el día viejo."
      : "Apenas el cliente diga el DÍA, llama agendar_visita en ese mismo turno con lo que entendiste — aunque lo escriba con faltas («el juebes», «savado») o dé una fecha de calendario («el 3 de septiembre»). Decírselo por escrito NO lo registra.",
    "Si modelo y cantidad ya están confirmados, genera la cotización inmediatamente y después pregunta si está bien; no pidas otra confirmación.",
    // Sin este freno el modelo volvía a cotizar lo mismo cuando el cliente
    // reafirmaba la medida o la cantidad, y el cliente terminaba con dos
    // números distintos para una sola compra.
    facts.lastQuote && facts.lastQuote.minutesAgo < 30
      ? `Ya cotizaste hace ${facts.lastQuote.minutesAgo} min. NO generes otra cotización por el mismo pedido: si el cliente reafirma la medida, el modelo o la cantidad, remítelo a la que ya tiene —por modelo, cantidad y total, nunca por su número— y avanza al cierre (ubicación, visita, asesor). Solo cotiza de nuevo si cambia el producto o la cantidad.`
      : null,
    "Si el cliente ya dio una medida, cotiza con esa medida. No pidas versión, año ni etiqueta del vehículo, y nunca condiciones la cotización a confirmar el auto.",
    // Desde el 6-ago el bot SÍ lee fotos (visión); la instrucción vieja
    // («nunca pidas fotos: no puedes leerlas») ya era falsa y le quitaba un
    // camino para conseguir la medida.
    "Si falta la medida: pídela escrita (ej. 225/65R17) o pide una foto del costado de la llanta — sí puedes leer fotos. Siempre ofreciendo algo concreto en la misma respuesta.",
    resumedFromHuman ? "El asesor devolvió la conversación al bot con un mensaje del cliente pendiente. Responde directamente ese último mensaje y retoma el hilo; nunca lo dejes sin contestar." : null,
  ].filter(Boolean).join("\n");
}

/**
 * Los escalones de la última pieza de opciones, como hecho con instrucción de
 * entrega: si el cliente contesta la pregunta de preferencia («la más barata»,
 * «la del medio», «la mejor»), el turno entrega ESA opción con su precio —
 * sin volver a preguntar nada, que era la familia 2 del guardián.
 */
function escalonesLine(escalones: Escalones | null): string | null {
  if (!escalones) return null;
  const partes = (["premium", "equilibrada", "economica"] as const)
    .map((nivel) => {
      const opcion = escalones[nivel];
      return opcion ? `${nivel}: ${opcion.nombre} ($${opcion.precio_con_iva.toFixed(2)} c/u con IVA, código ${opcion.codigo})` : null;
    })
    .filter(Boolean);
  if (!partes.length) return null;
  return `Escalones de la última pieza de opciones enviada — ${partes.join("; ")}. Si el cliente responde su preferencia («mejor precio», «la más barata», «equilibrada», «la del medio», «premium», «la mejor»), entrega LA opción de ese escalón con su precio y ofrece cotizarla por 4 llantas — PROHIBIDO volver a preguntarle qué prefiere o si necesita una recomendación.`;
}

function withDiscountNotice(
  text: string,
  ctx: AgentContext,
  active: Awaited<ReturnType<typeof getActiveDiscountOffer>>,
  pending: Awaited<ReturnType<typeof getPendingDiscountRule>>,
): string {
  const target = active?.notificationMode === "next_message" && !active.notifiedAt
    ? { source: "offer" as const, id: active.id, message: discountOfferMessage(active) }
    : pending?.notificationMode === "next_message" && !pending.notifiedAt
      ? { source: "pending" as const, id: pending.id, message: pendingDiscountNoticeMessage(pending) }
      : null;
  if (!target) return text;
  ctx.discountNotice = { source: target.source, id: target.id };
  return /descuento|cotizaci[oó]n .*−|ahorras/i.test(text)
    ? text
    : `${text.trim()}\n\nY adicionalmente: ${target.message}`;
}

function exactToolReply(result: string): string | null {
  try {
    const parsed = JSON.parse(result) as { mensaje_para_enviar?: unknown };
    return typeof parsed.mensaje_para_enviar === "string"
      ? parsed.mensaje_para_enviar.trim()
      : null;
  } catch {
    return null;
  }
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
