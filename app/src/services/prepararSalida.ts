/**
 * TODO LO QUE SALE HACIA UN CLIENTE PASA POR AQUÍ.
 *
 * Hasta hoy la cadena de candados vivía suelta en `index.ts`, línea tras línea,
 * y su orden lo sostenía nada más que el orden de esas líneas. Eso tenía dos
 * agujeros, los dos reales:
 *
 * 1. `sendCustomerText` se llama desde CUATRO sitios. `index.ts` corría los
 *    ocho candados; `resumeBot` —que llama al MISMO `runAgent` con las MISMAS
 *    herramientas cuando el bot retoma un chat que atendió un humano— corría
 *    UNO. La fuga del JSON crudo que se tapó el 27-ago seguía viva por esa
 *    puerta, y el aviso de stock corto no salía nunca.
 * 2. La prueba que vigilaba el orden leía `index.ts` COMO TEXTO y comparaba
 *    posiciones con `indexOf`. Vigilaba una sola de las cuatro puertas, y no se
 *    enteraba de que las otras no llamaban a nada.
 *
 * Aquí el orden es un dato: `PASOS`, una lista que se puede leer y probar. La
 * puerta dice de qué TIPO es lo que va a salir y la lista decide qué pasos le
 * tocan — no si hay candados o no.
 *
 * EL PORQUÉ DEL ORDEN, que es lo que no se puede perder al moverlo de sitio:
 * los candados deterministas corren DESPUÉS del Ángel Guardián porque **el
 * guardián es el último que reescribe**. Un candado que corre antes de quien
 * reescribe no es un candado — el 26-ago (conv 11061) la corrección del
 * guardián volvió a prometer «4 × KENDA KR203 … $262.60» cuando había 3,
 * borrando el aviso que un candado anterior ya había pegado.
 */
import type { Stage } from "./conversations.js";
import { applyOutboundGuard } from "./outboundGuard.js";
import { revisarConGuardian, type HuellaHerramienta } from "./guardian.js";
import { asegurarAvisoDeStock } from "./stockCorto.js";
import { insistirConLoQueFalta } from "./insistirCierre.js";
import { createBotAlert } from "./followUps.js";
import { MAX_BLOCKS } from "./quoteMessages.js";
import { sinPreguntasProhibidas } from "../domain/preguntasProhibidas.js";
import { sinJsonCrudo } from "../domain/jsonCrudo.js";
import { sinNumerosDeCotizacion } from "../domain/numerosDeCotizacion.js";
import { conPreguntaEnSuPropioMensaje } from "../domain/preguntaSola.js";

/**
 * De qué puerta viene el texto.
 *
 * - `respuesta`: el turno normal (`index.ts`). El 90 % del tráfico.
 * - `retomada`: el bot contestando un mensaje que quedó huérfano mientras
 *   atendía un humano (`resumeBot.ts`). Es una respuesta real a un cliente
 *   real, escrita por el mismo agente: le tocan los mismos candados.
 * - `seguimiento`: el mensaje automático tras el silencio del cliente
 *   (`followUpProcessor.ts`).
 * - `plantilla`: la plantilla aprobada fuera de ventana. **No se le aplica
 *   nada**, y está en esta lista justamente para decirlo: su texto lo fija
 *   Meta, no se puede tocar, y pagar una revisión sería tirar el dinero.
 */
export type TipoDeSalida = "respuesta" | "retomada" | "seguimiento" | "plantilla";

export interface ContextoDeSalida {
  conversation: { id: number; current_cycle: number; stage: Stage };
  tipo: TipoDeSalida;
  /** Las herramientas que llamó el agente en este turno, para el Ángel Guardián. */
  huella?: readonly HuellaHerramienta[];
}

export interface PasoDeSalida {
  /** Cómo se llama en la lista y en las pruebas del orden. */
  nombre: string;
  /** En qué puertas corre. */
  corre: readonly TipoDeSalida[];
  /** Devuelve el texto ya tratado, o `null` para no enviar nada. */
  aplicar(texto: string, ctx: ContextoDeSalida): Promise<string | null>;
}

/**
 * LA CADENA, EN ORDEN. Cambiar este array cambia lo que sale por las cuatro
 * puertas a la vez — que es exactamente el punto.
 */
export const PASOS: readonly PasoDeSalida[] = [
  {
    // Guardián de salida (5-ago): determinístico, corre sobre TODO lo que el
    // bot va a decir. Bloquea pedir fotos, la disculpa repetida, el mensaje
    // calcado y el saludo a mitad de conversación — y alerta al asesor.
    // null = no enviar.
    nombre: "guardian_deterministico",
    corre: ["respuesta", "retomada"],
    async aplicar(texto, ctx) {
      const vetted = await applyOutboundGuard(ctx.conversation.id, texto);
      return vetted.text;
    },
  },
  {
    // El Ángel Guardián (13-ago): revisión con IA de lo que se va a decir —
    // precios contra la cotización real, re-preguntas, contradicciones. Corre
    // DESPUÉS del guardián determinístico porque ese es gratis y este cuesta
    // tokens; se prende y apaga desde Ajustes. Falla abierto: si no contesta,
    // sale el borrador tal cual.
    nombre: "angel_guardian",
    corre: ["respuesta", "retomada", "seguimiento"],
    async aplicar(texto, ctx) {
      const revision = await revisarConGuardian(
        ctx.conversation, texto, ctx.huella ?? [],
        { tipo: ctx.tipo === "seguimiento" ? "seguimiento" : "respuesta" },
      );
      return revision.texto;
    },
  },
  {
    // El stock, después del que reescribe. El seguimiento también afirma la
    // cotización («su cotización de $262.60 sigue vigente») y sale días
    // después: si en ese rato el stock bajó, es el peor mensaje para prometer
    // un juego que no existe. Ver services/stockCorto.ts.
    nombre: "aviso_de_stock",
    corre: ["respuesta", "retomada", "seguimiento"],
    async aplicar(texto, ctx) {
      const conStock = await asegurarAvisoDeStock(
        ctx.conversation.id, ctx.conversation.current_cycle, texto,
      );
      return conStock.texto;
    },
  },
  {
    // Y la pregunta que falta, si el turno se fue por otro lado. Manuel,
    // 27-ago: «si hago preguntas se desvía la conversación y no acaba con una
    // pregunta». Ver domain/preguntaPendiente.ts. Fuera del seguimiento: ese
    // tiene su propio libreto y su propio cierre.
    nombre: "insistir_con_lo_que_falta",
    corre: ["respuesta", "retomada"],
    async aplicar(texto, ctx) {
      const insistido = await insistirConLoQueFalta(
        ctx.conversation.id, ctx.conversation.current_cycle, texto,
      );
      if (insistido.agregado) {
        console.log(
          `📌 Turno cerrado sin pedir ${insistido.agregado} en la conv ${ctx.conversation.id}: se agregó la pregunta`,
        );
      }
      return insistido.texto;
    },
  },
  {
    // Las preguntas de más, también al final y por la misma razón que el stock
    // y los números: quien las escribe es el Ángel Guardián, que corre DESPUÉS
    // de todos los candados deterministas. Y con esta familia no alcanza con
    // pedírselo: puesto a revisar «¿Cuántas llantas necesita?» la marcó en ALTA
    // y su propia corrección terminó con «¿Cuántas llantas desea llevar?»
    // (simulador, 26-ago). Ver domain/preguntasProhibidas.ts.
    nombre: "sin_preguntas_prohibidas",
    corre: ["respuesta", "retomada", "seguimiento"],
    async aplicar(texto, ctx) {
      const depurado = sinPreguntasProhibidas(texto);
      if (depurado.quitadas.length) {
        console.warn(
          `✂️ Pregunta de más quitada en la conv ${ctx.conversation.id}: ${depurado.quitadas.join(" | ")}`,
        );
        await createBotAlert({
          conversationId: ctx.conversation.id,
          cycle: ctx.conversation.current_cycle,
          type: "pregunta_de_mas",
          priority: "medium",
          summary: "Se quitó una pregunta que le costaba un turno a la venta",
          exactReason: `El bot iba a preguntar: «${depurado.quitadas.join(" | ")}». Se quitó antes de enviarla.`,
          suggestedAction: "El cliente NO la recibió. Delata que el modelo o el guardián se saltaron el contrato de cierre.",
          dedupeKey: `${ctx.conversation.id}:${ctx.conversation.current_cycle}:pregunta_de_mas:${depurado.quitadas[0].slice(0, 60)}`,
        }).catch(() => undefined);
      }
      return depurado.texto;
    },
  },
  {
    // El JSON de una herramienta, al final y por la misma razón que el stock y
    // las preguntas de más: quien lo puede dejar pasar es el Ángel Guardián,
    // que reescribe DESPUÉS de todos los candados deterministas.
    nombre: "sin_json_crudo",
    corre: ["respuesta", "retomada", "seguimiento"],
    async aplicar(texto, ctx) {
      const limpio = sinJsonCrudo(texto);
      if (limpio.quitados.length) {
        console.warn(
          `✂️ JSON crudo quitado en la conv ${ctx.conversation.id}: ${limpio.quitados.join(" | ").slice(0, 300)}`,
        );
        await createBotAlert({
          conversationId: ctx.conversation.id,
          cycle: ctx.conversation.current_cycle,
          type: "json_crudo",
          priority: "high",
          summary: "El bot casi le manda al cliente el JSON de una herramienta",
          exactReason: limpio.quitados.join(" | ").slice(0, 500),
          suggestedAction: "Revisá el turno: el modelo devolvió el resultado de una herramienta como respuesta.",
          dedupeKey: `json_crudo:${ctx.conversation.id}:${ctx.conversation.current_cycle}`,
        });
      }
      return limpio.texto;
    },
  },
  {
    // Los números de cotización, por la misma razón.
    // Ver domain/numerosDeCotizacion.ts.
    nombre: "sin_numeros_de_cotizacion",
    corre: ["respuesta", "retomada", "seguimiento"],
    async aplicar(texto) {
      return sinNumerosDeCotizacion(texto);
    },
  },
  {
    // Y la pregunta, sola en su mensaje. Va LO ÚLTIMO de la cadena: los
    // candados de arriba todavía pueden pegar o reescribir la pregunta del
    // cierre, así que separarla antes no serviría de nada. Manuel, 27-ago:
    // «trata que las preguntas vayan en su propio mensaje».
    //
    // Solo en el turno normal: es la única puerta que parte el texto en varios
    // mensajes (`splitBlocks`). Separar la pregunta donde después se envía todo
    // junto no la separaría — dejaría un «---» a la vista del cliente.
    nombre: "pregunta_en_su_propio_mensaje",
    corre: ["respuesta"],
    async aplicar(texto) {
      return conPreguntaEnSuPropioMensaje(texto, MAX_BLOCKS).texto;
    },
  },
];

export interface SalidaPreparada {
  /** Texto listo para enviar, o `null` si algún candado bloqueó el envío. */
  texto: string | null;
  /** Qué pasos corrieron, en orden. Para el hub y para las pruebas. */
  pasosCorridos: string[];
}

/** Los pasos que le tocan a una puerta, en orden. */
export function pasosPara(tipo: TipoDeSalida): PasoDeSalida[] {
  return PASOS.filter((paso) => paso.corre.includes(tipo));
}

/**
 * Pasa el borrador por la cadena que le toca a esta puerta.
 *
 * Nunca lanza por culpa de un paso: si uno falla, el texto sigue con lo que
 * traía. Un candado protege, no rompe el envío — el mismo criterio que ya
 * tenían `applyOutboundGuard` y el Ángel Guardián por separado.
 */
export async function prepararSalida(
  borrador: string,
  ctx: ContextoDeSalida,
): Promise<SalidaPreparada> {
  let texto: string | null = borrador;
  const pasosCorridos: string[] = [];
  for (const paso of pasosPara(ctx.tipo)) {
    if (!texto) break;
    pasosCorridos.push(paso.nombre);
    try {
      texto = await paso.aplicar(texto, ctx);
    } catch (error) {
      console.error(`⚠️ El candado ${paso.nombre} falló en la conv ${ctx.conversation.id}:`, error);
    }
  }
  return { texto: texto?.trim() ? texto : null, pasosCorridos };
}
