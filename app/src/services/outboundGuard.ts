import { sql } from "../db/client.js";
import { createBotAlert } from "./followUps.js";
import { notifyAdvisor } from "./advisorNotifications.js";
// El aviso de stock corto NO vive aquí. Vivió duplicado (aquí y en
// services/stockCorto.ts) hasta el 29-ago: dos copias de la misma regla son la
// receta de este repo para que una se quede atrás. La única fuente es
// `asegurarAvisoDeStock`, que corre en `prepararSalida` DESPUÉS del Ángel
// Guardián — que es además el único lugar donde el aviso sobrevive a quien
// reescribe (el 26-ago el guardián lo borró justo desde aquí).

/**
 * Guardián de salida: la última línea de defensa ANTES de enviar al cliente.
 *
 * Existe por el 5-ago: el bot le mandó a clientes reales 18 pedidos de foto,
 * tres «tuve un problema procesando» seguidos (dos idénticos) y saludos
 * repetidos a mitad de conversación — hasta que Joaquín lo apagó a mano.
 * El prompt y las tools ya están corregidos, pero un prompt es una petición al
 * modelo; esto es determinístico: aunque el modelo produzca la falla, no llega
 * al cliente, y el asesor se entera por una alerta.
 *
 * Mismo criterio que scripts/eval/rubrica.mjs y la auditoría: una sola vara.
 */

// JUBILADO (7-ago): el censor de peticiones de foto (regex PIDE_FOTO). Existió
// porque el bot no podía leer imágenes y pedir una foto mataba la conversación
// (caso Orlando, 5-ago). Desde el 6-ago la visión está activa (services/vision.ts)
// y pedir «una foto del costado» es una jugada legítima del playbook — censurarla
// aquí borraba la jugada nueva y disparaba alertas falsas al asesor. El detector
// histórico sigue en scripts/auditoria para medir el pasado, no el presente.
const APOLOGIA = /disculpa,?\s*tuve un problema procesando/i;

/** Saludo de apertura: válido solo en el primer mensaje del bot del ciclo. */
const SALUDO_INICIAL = /^\s*(?:¡\s*)?(?:hola|buen[oa]s(?:\s+(?:d[íi]as|tardes|noches))?)\s*[!.,]*\s*/i;

export type GuardIssue =
  | "mensaje_duplicado" | "bot_atascado" | "saludo_repetido" | "precio_ajustado"
  | "idea_repetida";

export interface GuardResult {
  /** Texto listo para enviar; null = no enviar nada (ya se alertó al asesor). */
  text: string | null;
  issues: GuardIssue[];
}

const normalizar = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();
// La MISMA IDEA con distinto maquillaje no comparte los bytes pero sí las
// palabras: «no tiene stock exacto ahora mismo» y «no tiene stock exacto
// ahora» difieren en una. Se compara el conjunto de palabras (Jaccard ≥ 0.85
// con al menos 8 palabras): determinista, barato y sin modelos.
const palabrasDe = (t: string): Set<string> => new Set(
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3),
);
const esMismaIdea = (a: Set<string>, b: Set<string>): boolean => {
  if (a.size < 8 || b.size < 8) return false;
  let comunes = 0;
  for (const w of a) if (b.has(w)) comunes += 1;
  return comunes / (a.size + b.size - comunes) >= 0.85;
};

/** El texto con el que se corta un bucle de idea repetida. La promesa que
 *  contiene la ejecuta de verdad `lo_prometido_se_ejecuta` en la cadena de
 *  salida — por eso puede afirmar el aviso. */
export const RESPUESTA_ANTI_BUCLE =
  "Para no repetirle lo mismo: dejé su caso avisado a un asesor, que le confirma apenas haya novedad. 🤝";

/**
 * Núcleo puro (exportado para pruebas). Reglas, en orden de gravedad:
 *
 * 1. Repetir EXACTAMENTE el último mensaje del bot → no se envía.
 * 2. Disculpa tras disculpa → no se envía (el cliente ya recibió una;
 *    la segunda es spam y la tercera espanta) y se alerta «bot atascado».
 * 3. Saludo de apertura a mitad de conversación → se recorta.
 * (La regla de censurar peticiones de foto se jubiló el 7-ago: ver arriba.)
 */
export function guardOutboundReply(
  reply: string,
  lastOutbound: string | null,
  hasPriorOutbound: boolean,
  salientesRecientes: readonly string[] = [],
): GuardResult {
  const issues: GuardIssue[] = [];

  // T115 nivel 2 (31-ago, H02 con el agente en mini): cuatro veces «la medida
  // 165/80R13 no tiene stock exacto» con maquillaje distinto. La primera
  // repetición se tolera (reafirmar una vez es humano); la TERCERA vez de la
  // misma idea corta el bucle y deriva — y la derivación se ejecuta de verdad.
  const palabras = palabrasDe(reply);
  if (salientesRecientes.filter((t) => esMismaIdea(palabras, palabrasDe(t))).length >= 2) {
    return { text: RESPUESTA_ANTI_BUCLE, issues: ["idea_repetida"] };
  }

  // Antes que el duplicado genérico: dos disculpas seguidas (idénticas o no)
  // son un bot atascado — la alerta ALTA que le llega al asesor por WhatsApp.
  if (APOLOGIA.test(reply) && lastOutbound && APOLOGIA.test(lastOutbound)) {
    return { text: null, issues: ["bot_atascado"] };
  }

  // El duplicado exacto se caza contra los ÚLTIMOS salientes, no solo el
  // último: en ráfagas con turnos cruzados el duplicado queda dos mensajes
  // atrás (producción, 31-ago 17:23: «¿A cuál local le queda mejor ir?» salió
  // idéntico dos veces en 7 segundos, con otro mensaje en el medio).
  const firmaDeReply = normalizar(reply);
  const yaSalio = (t: string | null) => t !== null && normalizar(t) === firmaDeReply;
  if (yaSalio(lastOutbound) || salientesRecientes.some((t) => yaSalio(t))) {
    // Contrato T115, regla 1: ningún turno del cliente se queda sin respuesta.
    // El duplicado exacto no se manda — pero el silencio es peor que un acuse
    // corto (31-ago, R06: el cliente dijo «Ok» y nadie le contestó nada).
    // Si el acuse neutro TAMBIÉN acaba de salir, ahí sí silencio + alerta.
    const neutro = "Quedo atento a lo que necesite. 🤝";
    const neutroYaSalio = normalizar(neutro) === normalizar(lastOutbound ?? "")
      || salientesRecientes.some((t) => normalizar(t) === normalizar(neutro));
    if (!neutroYaSalio) {
      return { text: neutro, issues: ["mensaje_duplicado"] };
    }
    return { text: null, issues: ["mensaje_duplicado"] };
  }

  let texto = reply;

  // El saludo se recorta solo si el bot YA SALUDÓ en este ciclo — no porque
  // haya dicho cualquier cosa antes. Producción, 31-ago 13:30: tras el
  // «empezamos de cero» del /restart, el «hola» del cliente recibió la guía
  // sin ningún saludo, porque la confirmación del reinicio contaba como
  // «mensaje anterior» y el filtro recortaba la bienvenida legítima.
  const yaSaludoEnElCiclo = salientesRecientes.some((t) => SALUDO_INICIAL.test(t))
    || (lastOutbound !== null && SALUDO_INICIAL.test(lastOutbound));
  if (hasPriorOutbound && SALUDO_INICIAL.test(texto)) {
    const sinSaludo = texto.replace(SALUDO_INICIAL, "").trim();
    if (sinSaludo.length < 5) {
      // El mensaje ERA solo un saludo: a mitad de conversación no aporta nada
      // (caso Jordian, 5-ago) — se bloquea aunque nadie haya saludado antes.
      return { text: null, issues: [...issues, "saludo_repetido"] };
    }
    if (yaSaludoEnElCiclo) {
      issues.push("saludo_repetido");
      // Recapitalizar el arranque para que no quede «¿qué medida…» tras «¡Hola! »
      texto = sinSaludo.charAt(0).toUpperCase() + sinSaludo.slice(1);
    }
    // Si nadie saludó todavía en el ciclo, la bienvenida se queda: el
    // «empezamos de cero» del /restart no es un saludo (31-ago, 13:30).
  }

  return { text: texto, issues };
}

/**
 * Corrector determinístico de precios: los dos errores de cifra que el Ángel
 * Guardián corrigió con IA en producción, resueltos con texto y aritmética.
 *
 * Nacen del informe del guardián del 14/15-ago (8 hallazgos precio_incorrecto
 * ALTA en 2 días); 5 eran de estas dos familias, no invención:
 *
 *  1. COMA DECIMAL. El modelo (o un formateador con locale) escribe «$600,96»
 *     cuando la cotización, la pieza renderizada y las herramientas dicen
 *     $600.96. Mismo número, formato contradictorio → se reescribe con punto.
 *  2. CÉNTIMO TRANSCRITO MAL. El modelo recalcula en vez de copiar: escribió
 *     $391.88 (4 × 97.97) cuando la cotización vigente registra $391.89 (el
 *     redondeo del IVA va por línea). Si una cifra del borrador queda a ≤2
 *     céntimos de un monto real de la cotización y no es exacta, se reemplaza
 *     por el monto real. Una cifra genuinamente distinta (otro producto, otra
 *     cantidad) queda lejos de esa tolerancia y no se toca.
 *
 * Esto NO valida cifras inventadas sin cotización (eso no se puede sin
 * entender la conversación): solo hace imposible contradecir en formato o por
 * un céntimo los números que SÍ están registrados.
 */
export function corregirPrecios(
  texto: string,
  montos: readonly number[] = [],
): { texto: string; ajustes: string[] } {
  const ajustes: string[] = [];

  // Familia 1: coma decimal (con o sin puntos de miles: $1.234,56 → $1234.56).
  // Exactamente dos decimales tras la coma, para no tocar «$1,200» estilo
  // gringo (miles) ni cantidades sin decimales.
  let out = texto.replace(
    /\$\s?(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?!\d)/g,
    (original, entero: string, decimales: string) => {
      const plano = `$${entero.replace(/\./g, "")}.${decimales}`;
      ajustes.push(`${original.trim()} → ${plano}`);
      return plano;
    },
  );

  // Familia 2: céntimo contra los montos reales de la cotización vigente.
  if (montos.length) {
    const exactos = new Set(montos.map((monto) => monto.toFixed(2)));
    out = out.replace(/\$\s?(\d+\.\d{2})(?!\d)/g, (original, cifra: string) => {
      if (exactos.has(cifra)) return original;
      const valor = Number(cifra);
      const real = montos.find((monto) => Math.abs(monto - valor) <= 0.02);
      if (real === undefined) return original;
      ajustes.push(`$${cifra} → $${real.toFixed(2)}`);
      return `$${real.toFixed(2)}`;
    });
  }

  return { texto: out, ajustes };
}

const ALERTAS: Record<GuardIssue, { priority: "high" | "medium"; summary: string; reason: string; action: string }> = {
  bot_atascado: {
    priority: "high",
    summary: "Bot atascado: dos disculpas seguidas — el cliente quedó sin respuesta",
    reason: "El bot falló dos veces seguidas procesando al cliente. La segunda disculpa NO se envió para no espantarlo, pero nadie le está respondiendo.",
    action: "Abrir el ticket y responder a mano AHORA; el cliente está esperando.",
  },
  mensaje_duplicado: {
    priority: "medium",
    summary: "El modelo repitió exactamente el mensaje anterior (no se envió)",
    reason: "La respuesta era idéntica al último mensaje del bot; enviarla otra vez es spam.",
    action: "Revisar el ticket: el cliente puede estar esperando una respuesta distinta.",
  },
  saludo_repetido: {
    priority: "medium",
    summary: "El modelo volvió a saludar a mitad de conversación (recortado)",
    reason: "Un «¡Hola!» en medio del hilo delata al bot y confunde; el saludo se recortó antes de enviar.",
    action: "Nada urgente; queda registrado para la auditoría.",
  },
  idea_repetida: {
    priority: "medium",
    summary: "El bot repetía la misma idea por tercera vez: se cortó el bucle y se derivó al asesor",
    reason: "Tres mensajes con la misma idea con distinto maquillaje. El tercero se reemplazó por una derivación real al asesor.",
    action: "Revisar el ticket: al cliente le falta algo que el bot no le está resolviendo.",
  },
  precio_ajustado: {
    priority: "medium",
    summary: "El modelo escribió mal una cifra de la cotización (corregida antes de enviar)",
    reason: "Una cifra del borrador contradecía la cotización vigente (formato con coma o un céntimo de diferencia). Al cliente le llegó la cifra correcta.",
    action: "Nada urgente para el cliente; si se repite seguido en un mismo chat, revisar qué está transcribiendo mal el bot.",
  },
};

/**
 * Aplica el guardián con el contexto real de la conversación y alerta al
 * asesor cuando algo se bloqueó. Nunca lanza: ante cualquier error interno
 * devuelve la respuesta original (el guardián protege, no rompe el envío).
 */
export async function applyOutboundGuard(conversationId: number, reply: string): Promise<GuardResult> {
  try {
    const [row] = await sql<{ cycle: number; last_outbound: string | null }[]>`
      select c.current_cycle as cycle,
        (select content from messages
         where conversation_id = c.id and cycle = c.current_cycle
           and direction = 'outbound' and author_kind = 'bot' and type = 'text'
         order by created_at desc limit 1) as last_outbound
      from conversations c where c.id = ${conversationId}
    `;
    if (!row) return { text: reply, issues: [] };
    const recientes = await sql<{ content: string | null }[]>`
      select content from messages
      where conversation_id = ${conversationId} and cycle = ${row.cycle}
        and direction = 'outbound' and author_kind = 'bot' and type = 'text'
      order by created_at desc limit 5
    `;
    const result = guardOutboundReply(
      reply, row.last_outbound, row.last_outbound !== null,
      recientes.map((m) => m.content ?? ""),
    );

    // Corrector de precios: siempre que haya texto por salir. Los montos
    // reales salen de la cotización vigente del ciclo — los mismos datos
    // duros que ve el Ángel Guardián, sin gastar un token.
    if (result.text) {
      const [cotizacion] = await sql<{
        quote_number: string | null;
        total: string | number; subtotal: string | number; tax: string | number;
        items: Array<{ code?: string; quantity?: number; salePriceWithTax?: number; unitPrice?: number }> | null;
      }[]>`
        select quote_number, total, subtotal, tax, items from quotes
        where conversation_id = ${conversationId} and cycle = ${row.cycle}
        order by created_at desc limit 1
      `;
      const montos = cotizacion
        ? [
            Number(cotizacion.total),
            Number(cotizacion.subtotal),
            Number(cotizacion.tax),
            ...(cotizacion.items ?? []).flatMap((item) => {
              const unitario = item.salePriceWithTax ?? null;
              return unitario == null
                ? []
                : [unitario, Math.round(unitario * (item.quantity ?? 1) * 100) / 100];
            }),
          ].filter((monto) => Number.isFinite(monto) && monto > 0)
        : [];
      const precios = corregirPrecios(result.text, montos);
      if (precios.ajustes.length) {
        result.text = precios.texto;
        result.issues.push("precio_ajustado");
        console.warn(`💲 Precio ajustado antes de enviar (conv ${conversationId}): ${precios.ajustes.join(" · ")}`);
      }

    }

    for (const issue of result.issues) {
      // La alerta jamás debe frenar el envío al cliente.
      void (async () => {
        try {
          await createBotAlert({
            conversationId,
            cycle: row.cycle,
            type: `guard_${issue}`,
            priority: ALERTAS[issue].priority,
            summary: ALERTAS[issue].summary,
            exactReason: ALERTAS[issue].reason,
            suggestedAction: ALERTAS[issue].action,
            dedupeKey: `${conversationId}:${row.cycle}:guard:${issue}`,
          });
          if (ALERTAS[issue].priority === "high") {
            await notifyAdvisor({
              conversationId,
              cycle: row.cycle,
              eventType: `guard_${issue}`,
              dedupeKey: `${conversationId}:${row.cycle}:guard:${issue}`,
              title: ALERTAS[issue].summary,
              reason: ALERTAS[issue].reason,
              action: ALERTAS[issue].action,
            });
          }
        } catch (error) {
          console.warn("⚠️ No se pudo alertar del guardián:", error instanceof Error ? error.message : error);
        }
      })();
    }

    return result;
  } catch (error) {
    console.warn("⚠️ Guardián de salida falló; se envía sin filtrar:", error instanceof Error ? error.message : error);
    return { text: reply, issues: [] };
  }
}
