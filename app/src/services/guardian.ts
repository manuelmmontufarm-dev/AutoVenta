/**
 * EL ÁNGEL GUARDIÁN — revisión con IA de cada respuesta ANTES de enviarla.
 *
 * Pedido por Depot el 13-ago-2026, el mismo día en que se descubrió que el bot
 * había firmado una cotización en otra medida y se la confirmó al cliente como
 * si fuera la suya. El guardián de salida determinístico (outboundGuard) caza
 * patrones fijos; este caza lo que solo se ve ENTENDIENDO la conversación:
 * un precio que no cuadra con la cotización, la pregunta que el cliente ya
 * respondió, la contradicción con lo dicho dos mensajes atrás.
 *
 * Diseño:
 *  · Ve las cosas DESDE AFUERA: recibe lo que el bot quiere decir + los hechos
 *    duros (medida pedida, cotización vigente con sus números, historial) y
 *    decide: aprobar o corregir. Nunca bloquea — dejar al cliente sin
 *    respuesta es peor que cualquier error de estilo (lección de los chats
 *    mudos del 13-ago).
 *  · FALLA ABIERTO. Si el modelo revisor no contesta, contesta tarde o
 *    contesta basura, se envía el borrador original. El guardián existe para
 *    quitar errores, no para agregar un punto de fallo.
 *  · TODO queda registrado en guardian_reviews — aprobaciones incluidas. Al
 *    final de la semana eso ES la lista documentada de errores chicos y
 *    grandes que Depot pidió, con su categoría y su chat, para atacar causas.
 *  · Se prende y apaga desde Ajustes (settings guardian_config): cuando el
 *    asesor no quiere gastar tokens lo apaga; cuando quiere cero errores lo
 *    prende. El costo es ~1 llamada extra por turno, sin herramientas.
 *
 * El modelo revisor es el MISMO nivel que el vendedor (gpt-5.5 en producción,
 * OPENAI_GUARDIAN_MODEL para cambiarlo): un revisor más débil que el redactor
 * no ve los errores que el redactor no vio.
 */
import OpenAI from "openai";
import { z } from "zod";
import { config } from "../config.js";
import { sql } from "../db/client.js";
import type { Stage } from "../domain/pipeline.js";
import { medidasPermitidas } from "../domain/medidaPedida.js";
import { logAiRun } from "./conversations.js";
import { createBotAlert } from "./followUps.js";
import { getGuardianConfig } from "./settings.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/** Tiempo máximo de la revisión. Pasado esto, gana el borrador original. */
const TIMEOUT_MS = 12_000;

/** Mensajes de contexto que ve el revisor. Más historia ≈ más tokens del cliente. */
const MENSAJES_DE_CONTEXTO = 16;

export const CATEGORIAS = [
  "precio_incorrecto",
  "medida_incorrecta",
  "re-pregunta",
  "contradiccion",
  "repeticion",
  "ignora-pregunta",
  "tono",
  "otro",
] as const;

const HallazgoSchema = z.object({
  categoria: z.enum(CATEGORIAS),
  severidad: z.enum(["alta", "media", "baja"]),
  detalle: z.string(),
});

const VeredictoSchema = z.object({
  veredicto: z.enum(["aprobar", "corregir"]),
  texto_corregido: z.string(),
  hallazgos: z.array(HallazgoSchema),
});

export type VeredictoGuardian = z.infer<typeof VeredictoSchema>;

/** Lo que el guardián decidió para un envío. `texto` es SIEMPRE enviable. */
export interface RevisionGuardian {
  texto: string;
  veredicto: "aprobar" | "corregir" | "sin_revision";
  hallazgos: z.infer<typeof HallazgoSchema>[];
}

const ESQUEMA_SALIDA = {
  type: "json_schema",
  json_schema: {
    name: "revision_guardian",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["veredicto", "texto_corregido", "hallazgos"],
      properties: {
        veredicto: { type: "string", enum: ["aprobar", "corregir"] },
        texto_corregido: {
          type: "string",
          description: "El borrador corregido, completo y listo para enviar. Vacío si el veredicto es aprobar.",
        },
        hallazgos: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["categoria", "severidad", "detalle"],
            properties: {
              categoria: { type: "string", enum: [...CATEGORIAS] },
              severidad: { type: "string", enum: ["alta", "media", "baja"] },
              detalle: { type: "string", description: "Qué está mal, en una o dos frases concretas, citando el dato." },
            },
          },
        },
      },
    },
  },
} as const;

const INSTRUCCIONES = `Eres el ÁNGEL GUARDIÁN del bot de ventas de Depot Tire (llantas, Quito). Revisas el BORRADOR que el bot está por enviar y lo apruebas o lo corriges. No eres el vendedor: eres el auditor que ve la conversación desde afuera.

REVISA, en este orden de gravedad:
1. PRECIOS Y COTIZACIONES. Todo número que el borrador afirme (precio unitario, total, número de cotización, meses de garantía) debe coincidir EXACTAMENTE con los datos duros del contexto. Si el borrador confirma que una cotización corresponde a una medida y los datos dicen otra medida, eso es un error ALTO.
2. MEDIDA. Si el cliente pidió una medida concreta y el borrador ofrece o confirma otra sin decirle con todas las letras que es una equivalente, error ALTO.
3. RE-PREGUNTAS. Si el borrador pregunta algo que el cliente ya respondió en la conversación (local, fecha, medida, cantidad, uso), error ALTO. La corrección usa el dato ya dado y avanza.
4. CONTRADICCIONES con lo que el propio bot dijo antes.
5. IGNORAR LA PREGUNTA del último mensaje del cliente: el borrador debe responderla antes de seguir con su guion.
6. REPETICIÓN: bloques, frases o preguntas calcadas de mensajes anteriores del bot.
7. TONO: trato de «usted» consistente, sin saludos a mitad de conversación, sin muletillas robóticas.
8. LO QUE EL BOT HIZO vs LO QUE DICE. Si te doy la sección de herramientas del turno, el borrador debe ser consistente con ella: si una búsqueda devolvió opciones que el borrador niega u omite, o si la búsqueda usó un texto visiblemente distinto a lo que el cliente pidió, es error ALTO — corrige usando SOLO lo que la herramienta devolvió.
9. NUNCA SE NIEGA EN SECO UN MODELO DE LAS MARCAS DE LA CASA. Depot vende Falken (Wildpeak, Azenis, Ziex/ZE), Kenda (Klever, KR…) y Winrun: esos modelos existen en decenas de medidas y una búsqueda de texto que da vacío casi siempre es la búsqueda fallando (el cliente escribe «at4» y el catálogo dice «A/T4W»), no la llanta faltando. Si el borrador afirma «no tenemos» o «no aparece en catálogo» un modelo de esas marcas, es error ALTO aunque la búsqueda haya dado vacío: reescribe para NO negar la existencia — «déjeme confirmarlo con el asesor» — y ofrecer en el mismo mensaje las opciones de esa medida. Negar en seco solo es válido para marcas que Depot no maneja.

REGLAS DE CORRECCIÓN (innegociables):
- NUNCA inventes precios, medidas, stock, plazos ni datos que no estén en el contexto. Si no puedes verificar una cifra, NO la cambies: repórtala como hallazgo y aprueba.
- La corrección conserva la intención de venta del borrador, su idioma y su formato (los separadores '---' se respetan; los *negritas* de WhatsApp también).
- La corrección debe ser un mensaje COMPLETO y natural, listo para el cliente. Nunca entregues un texto vacío ni notas para el bot.
- Corrige solo cuando haga falta: un borrador correcto se aprueba sin tocar. Corregir por gusto es ruido.
- En la duda, aprueba y reporta el hallazgo. Peor que un error de estilo es un guardián que rompe una venta.`;

interface FilaMensaje {
  direction: string;
  author_kind: string | null;
  content: string | null;
}

interface CotizacionVigente {
  quote_number: string;
  total: string | number;
  created_at: Date;
  items: Array<{ brand?: string; design?: string; sizeLabel?: string; quantity?: number; salePriceWithTax?: number }>;
}

export interface HuellaHerramienta {
  herramienta: string;
  argumentos: string;
  resultado: string;
}

/** El contexto que ve el revisor, armado con los mismos datos que usa el bot. */
export async function armarContexto(
  conversationId: number,
  cycle: number,
  borrador: string,
  huella: readonly HuellaHerramienta[] = [],
): Promise<string> {
  const mensajes = await sql<FilaMensaje[]>`
    select direction, author_kind, content from messages
    where conversation_id=${conversationId}
    order by created_at desc limit ${MENSAJES_DE_CONTEXTO}
  `;
  const [hechos] = await sql<{
    tire_size: string | null; vehicle: string | null; selected_quantity: number | null;
    nearest_store: string | null; customer_commitment: string | null; visit_date: Date | null;
  }[]>`
    select tire_size, vehicle, selected_quantity, nearest_store, customer_commitment, visit_date
    from conversations where id=${conversationId}
  `;
  const [cotizacion] = await sql<CotizacionVigente[]>`
    select quote_number, total, created_at, items from quotes
    where conversation_id=${conversationId} and cycle=${cycle}
    order by created_at desc limit 1
  `;
  const inbound = mensajes.filter((m) => m.direction === "inbound").map((m) => m.content ?? "");
  const pedidas = medidasPermitidas(inbound, hechos?.tire_size);

  const historial = [...mensajes].reverse().map((m) => {
    const quien = m.direction === "inbound" ? "CLIENTE" : m.author_kind === "bot" ? "BOT" : "ASESOR";
    return `${quien}: ${(m.content ?? "").slice(0, 380)}`;
  }).join("\n");

  const item = cotizacion?.items?.[0];
  return [
    "== HECHOS REGISTRADOS ==",
    `Medidas que el cliente pidió: ${pedidas.length ? pedidas.join(", ") : "(ninguna todavía)"}`,
    hechos?.vehicle ? `Vehículo: ${hechos.vehicle}` : null,
    hechos?.selected_quantity != null ? `Cantidad elegida: ${hechos.selected_quantity}` : null,
    hechos?.nearest_store ? `Local ya elegido: ${hechos.nearest_store}` : null,
    hechos?.customer_commitment ? `Compromiso de visita: ${hechos.customer_commitment}` : null,
    cotizacion
      ? `Cotización vigente: ${cotizacion.quote_number} · total $${Number(cotizacion.total).toFixed(2)}` +
        (item ? ` · ${item.quantity ?? "?"} × ${item.brand ?? ""} ${item.design ?? ""} ${item.sizeLabel ?? ""}` +
          (item.salePriceWithTax ? ` a $${Number(item.salePriceWithTax).toFixed(2)} c/u` : "") : "")
      : "Cotización vigente: ninguna",
    "",
    "== CONVERSACIÓN (vieja → nueva) ==",
    historial,
    ...(huella.length
      ? [
          "",
          "== LO QUE EL BOT HIZO ESTE TURNO (herramientas) ==",
          ...huella.map((h) => `${h.herramienta}(${h.argumentos}) → ${h.resultado}`),
        ]
      : []),
    "",
    "== BORRADOR QUE EL BOT QUIERE ENVIAR ==",
    borrador,
  ].filter((linea) => linea !== null).join("\n");
}

/** Interpreta la salida del modelo con la red de seguridad puesta. */
export function aplicarVeredicto(borrador: string, crudo: unknown): RevisionGuardian {
  const parsed = VeredictoSchema.safeParse(crudo);
  if (!parsed.success) return { texto: borrador, veredicto: "sin_revision", hallazgos: [] };
  const v = parsed.data;
  const corregido = v.texto_corregido.trim();
  // Una «corrección» vacía o idéntica no es corrección: se aprueba con hallazgos.
  if (v.veredicto === "corregir" && corregido && corregido !== borrador.trim()) {
    return { texto: corregido, veredicto: "corregir", hallazgos: v.hallazgos };
  }
  return { texto: borrador, veredicto: "aprobar", hallazgos: v.hallazgos };
}

/**
 * Revisa el borrador y devuelve el texto que de verdad se envía.
 *
 * Nunca lanza y nunca devuelve vacío: en cualquier fallo, el borrador original
 * sale tal cual y la conversación no se entera de que el guardián existe.
 */
export async function revisarConGuardian(
  conversation: { id: number; current_cycle: number; stage: Stage },
  borrador: string,
  huella: readonly HuellaHerramienta[] = [],
): Promise<RevisionGuardian> {
  const sinRevision: RevisionGuardian = { texto: borrador, veredicto: "sin_revision", hallazgos: [] };
  try {
    const cfg = await getGuardianConfig();
    if (!cfg.activo) return sinRevision;

    const inicio = Date.now();
    const contexto = await armarContexto(conversation.id, conversation.current_cycle, borrador, huella);
    const respuesta = await Promise.race([
      openai.chat.completions.create({
        model: config.openai.guardianModel,
        messages: [
          { role: "system", content: INSTRUCCIONES },
          { role: "user", content: contexto },
        ],
        response_format: ESQUEMA_SALIDA as never,
        max_completion_tokens: 1200,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Guardián sin respuesta en ${TIMEOUT_MS} ms`)), TIMEOUT_MS)),
    ]);
    const ms = Date.now() - inicio;
    const texto = respuesta.choices[0]?.message?.content ?? "";
    const revision = aplicarVeredicto(borrador, texto ? JSON.parse(texto) : null);

    await logAiRun({
      conversationId: conversation.id,
      stage: conversation.stage,
      model: config.openai.guardianModel,
      latencyMs: ms,
      inputTokens: respuesta.usage?.prompt_tokens ?? 0,
      outputTokens: respuesta.usage?.completion_tokens ?? 0,
      cachedInputTokens: respuesta.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      route: "guardian",
      callType: "guardian",
      tools: [],
    }).catch(() => undefined);

    await sql`
      insert into guardian_reviews (
        conversation_id, cycle, model, verdict, findings, original_text, corrected_text, latency_ms
      ) values (
        ${conversation.id}, ${conversation.current_cycle}, ${config.openai.guardianModel},
        ${revision.veredicto}, ${sql.json(revision.hallazgos as never)}, ${borrador},
        ${revision.veredicto === "corregir" ? revision.texto : null}, ${ms}
      )
    `;

    // Solo las correcciones con hallazgo alto llegan al tab de Errores: son
    // las que el asesor debe mirar. El resto vive en el informe del guardián.
    const alto = revision.hallazgos.find((h) => h.severidad === "alta");
    if (revision.veredicto === "corregir" && alto) {
      await createBotAlert({
        conversationId: conversation.id,
        cycle: conversation.current_cycle,
        type: "guardian_correccion",
        priority: "high",
        summary: `El guardián corrigió la respuesta: ${alto.categoria}`,
        exactReason: alto.detalle,
        suggestedAction: "Revisa el chat: el error se corrigió antes de enviarse, pero delata qué está fallando en el bot.",
        dedupeKey: `guardian:${conversation.id}:${conversation.current_cycle}:${alto.categoria}:${alto.detalle.slice(0, 60)}`,
      }).catch(() => undefined);
    }
    return revision;
  } catch (error) {
    console.warn("👼 Guardián falló abierto (se envía el borrador):", error instanceof Error ? error.message : error);
    return sinRevision;
  }
}

/**
 * La lista documentada de la semana: qué encontró, cuántas veces y dónde.
 * Es el insumo con el que se identifican causas y se arregla de raíz.
 */
export async function informeGuardian(dias: number): Promise<{
  desde: string;
  revisiones: number;
  correcciones: number;
  porCategoria: Array<{ categoria: string; severidad: string; veces: number }>;
  hallazgos: Array<{
    conversationId: number; fecha: string; veredicto: string;
    categoria: string; severidad: string; detalle: string;
  }>;
}> {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const filas = await sql<{
    conversation_id: number; verdict: string; findings: unknown; created_at: Date;
  }[]>`
    select conversation_id, verdict, findings, created_at from guardian_reviews
    where created_at >= ${desde} order by created_at desc
  `;
  const hallazgos: Array<{ conversationId: number; fecha: string; veredicto: string; categoria: string; severidad: string; detalle: string }> = [];
  const conteo = new Map<string, number>();
  for (const fila of filas) {
    const lista = Array.isArray(fila.findings) ? fila.findings : [];
    for (const h of lista) {
      const parsed = HallazgoSchema.safeParse(h);
      if (!parsed.success) continue;
      hallazgos.push({
        conversationId: fila.conversation_id,
        fecha: fila.created_at.toISOString(),
        veredicto: fila.verdict,
        ...parsed.data,
      });
      const clave = `${parsed.data.categoria}|${parsed.data.severidad}`;
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    }
  }
  return {
    desde: desde.toISOString(),
    revisiones: filas.length,
    correcciones: filas.filter((f) => f.verdict === "corregir").length,
    porCategoria: [...conteo.entries()]
      .map(([clave, veces]) => {
        const [categoria, severidad] = clave.split("|");
        return { categoria, severidad, veces };
      })
      .sort((a, b) => b.veces - a.veces),
    hallazgos,
  };
}
