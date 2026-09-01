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
import { insistirConLoQueFalta, sinPreguntaPendienteConsecutiva } from "./insistirCierre.js";
import { createBotAlert } from "./followUps.js";
import { MAX_BLOCKS } from "./quoteMessages.js";
import { sinPreguntasProhibidas } from "../domain/preguntasProhibidas.js";
import {
  afirmaQueAceptanAceiteDelCliente,
  preguntaSiPuedeLlevarSuAceite,
  RESPUESTA_SEGURA_SOBRE_ACEITE,
} from "../domain/alcanceComercial.js";
import { sinJsonCrudo } from "../domain/jsonCrudo.js";
import { conLocalesReales } from "./localesReales.js";
import { notifyAdvisor } from "./advisorNotifications.js";
import { sql } from "../db/client.js";
import { sinNumerosDeCotizacion } from "../domain/numerosDeCotizacion.js";
import { conPreguntaEnSuPropioMensaje } from "../domain/preguntaSola.js";
import { despedidaQueCorresponde } from "../domain/cierrePerdido.js";
import { motivoDeUbicacion } from "../domain/ubicacionPedida.js";
import { buildStoreLinksBlock } from "./quoteMessages.js";
import { buildStoreLinksBlockOnce } from "./storeLinks.js";
import { business } from "../config.js";
import { productosDelCatalogoMencionados } from "./catalog.js";
import { frenarHechosNuevosDelGuardian } from "../domain/guardianNoVendeSolo.js";
import { sinBloquesCalcados } from "../domain/calcoReciente.js";
import { sinPreguntaRepetidaEnElTurno } from "../domain/preguntaRepetidaEnElTurno.js";
import { estructurarTurno } from "../domain/estructuraDelTurno.js";

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
  /** Fase real de este turno; no necesariamente coincide con el máximo guardado en el Kanban. */
  faseOperativa?: Stage;
  /** Las herramientas que llamó el agente en este turno, para el Ángel Guardián. */
  huella?: readonly HuellaHerramienta[];
  /**
   * Lo que el cliente acaba de escribir en ESTE turno.
   *
   * La cadena leía solo la base, y por eso el 27-ago (conv 4732) le insistió
   * con el descuento a alguien que acababa de decir «ya compré en otro lugar»:
   * en la base seguía faltando la fecha de visita, y eso era todo lo que
   * `insistirConLoQueFalta` miraba. El clasificador que cierra como perdida
   * corre DESPUÉS de enviar, así que la etapa todavía decía `seguimiento_venta`.
   * El único sitio donde ese «ya compré» existe a tiempo es el mensaje mismo.
   */
  textoDelCliente?: string | null;
  /** Estado interno de la cadena: el texto que recibió el Ángel Guardián. */
  textoAntesDelGuardian?: string;
  /** Un cierre definitivo: ningún paso posterior puede anexar nada. */
  salidaTerminal?: boolean;
  /** Este turno termina sin empuje comercial, pero no cierra ni borra el ciclo. */
  suprimirEmpujeComercial?: boolean;
  /** La intención vigente es un servicio que no está en el catálogo de llantas. */
  consultaFueraDeCatalogo?: boolean;
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
    // Un dato pendiente se vuelve spam si se pregunta en dos turnos seguidos.
    // Se limpia ANTES del guardián para que el revisor vea el borrador real que
    // queremos producir, no tenga que corregirlo y no dependa de IA para esto.
    nombre: "sin_pregunta_pendiente_consecutiva",
    corre: ["respuesta", "retomada"],
    async aplicar(texto, ctx) {
      return sinPreguntaPendienteConsecutiva(
        ctx.conversation.id, ctx.conversation.current_cycle, texto, ctx.textoDelCliente,
      );
    },
  },
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
      // Una despedida de cierre determinista es una CONSTANTE: revisarla con
      // IA es pagar para que un modelo dude de un texto fijo. Medido 31-ago
      // (T115 nivel 2, guardián en mini): marcó insiste_tras_rechazo sobre la
      // propia despedida canónica en H05, H06 y H09.
      if (ctx.suprimirEmpujeComercial) return texto;
      ctx.textoAntesDelGuardian = texto;
      const revision = await revisarConGuardian(
        ctx.conversation, texto, ctx.huella ?? [],
        { tipo: ctx.tipo === "seguimiento" ? "seguimiento" : "respuesta" },
      );
      return revision.texto;
    },
  },
  {
    // EL GUARDIÁN REVISA; NO VENDE POR SU CUENTA.
    //
    // 27-ago-2026, conv 11986: recibió un menú sin modelos ni precios y lo
    // convirtió en una vitrina nueva con FALKEN WILDPEAK M/T a $282.10.
    // Conv 11972: convirtió «no hay stock disponible» en una oferta de UNA
    // KENDA KR20 a $82.42. Pedírselo en la rúbrica ayuda, pero no garantiza:
    // por eso este paso determinístico corre INMEDIATAMENTE DESPUÉS de quien
    // reescribe y restaura el borrador si aparecen hechos comerciales nuevos.
    nombre: "guardian_no_vende_solo",
    corre: ["respuesta", "retomada", "seguimiento"],
    async aplicar(texto, ctx) {
      const borrador = ctx.textoAntesDelGuardian ?? texto;
      const productos = productosDelCatalogoMencionados(`${borrador}\n${texto}`);
      const resultado = frenarHechosNuevosDelGuardian(borrador, texto, productos);
      if (!resultado.bloqueado) return texto;

      console.warn(
        `🛑 Corrección comercial frenada en la conv ${ctx.conversation.id}: ${resultado.motivos.join(", ")}`,
      );
      await createBotAlert({
        conversationId: ctx.conversation.id,
        cycle: ctx.conversation.current_cycle,
        type: "guardian_hecho_nuevo_bloqueado",
        priority: "high",
        summary: "El guardián intentó agregar una oferta que el borrador no traía",
        exactReason:
          `Se frenó la corrección por: ${resultado.motivos.join(", ")}. `
          + `Borrador: «${borrador.slice(0, 180)}». Corrección: «${texto.slice(0, 180)}».`,
        suggestedAction:
          "El cliente recibió el borrador original. Revisa por qué el guardián intentó vender con datos del catálogo.",
        dedupeKey:
          `guardian_hecho_nuevo:${ctx.conversation.id}:${ctx.conversation.current_cycle}:${resultado.motivos.join("-")}`,
      }).catch(() => undefined);
      return resultado.texto;
    },
  },
  {
    // EL DEDUPE OTRA VEZ, PORQUE EL GUARDIÁN REESCRIBE DESPUÉS DE ÉL.
    //
    // 30-ago-2026, corrida T115 conv 9887 turnos 9-10: el primer
    // `sin_pregunta_pendiente_consecutiva` limpió el borrador, pero el Ángel
    // Guardián reescribió («el cliente no eligió local») y REINTRODUJO la
    // pregunta del local — dos turnos seguidos con la misma pregunta, que es
    // exactamente lo que el paso 1 existe para impedir. Todo lo que reescribe
    // tiene que volver a pasar por el dedupe; corre tras `guardian_no_vende_solo`
    // para ver el texto ya definitivo del guardián.
    nombre: "sin_pregunta_consecutiva_tras_guardian",
    corre: ["respuesta", "retomada"],
    async aplicar(texto, ctx) {
      return sinPreguntaPendienteConsecutiva(
        ctx.conversation.id, ctx.conversation.current_cycle, texto, ctx.textoDelCliente,
      );
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
    // La política de servicios ajenos al catálogo no puede depender de que el
    // revisor la vea. Si el cliente pregunta por usar su propio aceite, una
    // afirmación del modelo compromete al taller; se reemplaza por lo único
    // respaldado: confirmación directa de un asesor.
    nombre: "alcance_fuera_de_catalogo",
    corre: ["respuesta", "retomada"],
    async aplicar(texto, ctx) {
      if (
        !ctx.consultaFueraDeCatalogo
        || !preguntaSiPuedeLlevarSuAceite(ctx.textoDelCliente ?? "")
        || !afirmaQueAceptanAceiteDelCliente(texto)
      ) return texto;
      return RESPUESTA_SEGURA_SOBRE_ACEITE;
    },
  },
  {
    // LA DESPEDIDA, CUANDO LA VENTA SE PERDIÓ DE VERDAD.
    //
    // Va antes de `insistir_con_lo_que_falta` porque es exactamente ese paso el
    // que hay que callar: el 27-ago (conv 4732) el cliente escribió «Gracias ya
    // compré en otro lugar», el modelo contestó bien —«Entendido, gracias por
    // avisar»— y el candado del cierre le pegó detrás «¿Qué día cree que puede
    // pasar… con 25 % de descuento, $73.92 menos». Nadie escribió ese mensaje:
    // lo pegó una regla que lee la base y no al cliente.
    //
    // Y va DESPUÉS del Ángel Guardián por la razón de siempre: el guardián
    // reescribe, y lo que tiene que ser cierto sí o sí va al final. Reemplaza
    // el texto entero: cuando alguien acaba de decir que compró en otro lado,
    // lo único que corresponde es despedirse bien. Ver `domain/cierrePerdido.ts`.
    nombre: "despedida_de_venta_perdida",
    corre: ["respuesta", "retomada"],
    async aplicar(texto, ctx) {
      const despedida = despedidaQueCorresponde(ctx.textoDelCliente ?? "");
      if (!despedida) return texto;
      // Conv 11818, 27-ago-2026: después de «ya hice el pedido aquí en Ibarra»
      // la despedida recibió los mapas de Depot porque ubicación corre después.
      // Marcarla terminal protege también de cualquier paso que se agregue en
      // el futuro: después de una compra ajena no hay otro mensaje comercial.
      ctx.salidaTerminal = true;
      if (texto.trim() === despedida) return texto;
      console.log(
        `👋 Venta perdida en la conv ${ctx.conversation.id}: se reemplazó el cierre por la despedida`,
      );
      await createBotAlert({
        conversationId: ctx.conversation.id,
        cycle: ctx.conversation.current_cycle,
        type: "venta_perdida_despedida",
        priority: "medium",
        summary: "El cliente dijo que ya no sigue: el bot se despidió y dejó de insistir",
        exactReason:
          `El cliente escribió: «${(ctx.textoDelCliente ?? "").slice(0, 160)}». `
          + `El borrador que iba a salir era: «${texto.slice(0, 200)}».`,
        suggestedAction:
          "El bot ya no le insiste. Si te consta que la venta sigue viva, retomala vos desde el panel.",
        dedupeKey: `venta_perdida_despedida:${ctx.conversation.id}:${ctx.conversation.current_cycle}`,
      }).catch(() => undefined);
      return despedida;
    },
  },
  {
    // EL MAPA NO ESPERA SU TURNO EN EL EMBUDO.
    //
    // Manuel, 27-ago: «si preguntan dónde estamos, o si son de una provincia,
    // que solo mande los links de las ubicaciones para que vean rápido —
    // no siempre la conversación va en el orden que queremos». Conv 11901: el
    // cliente preguntó «De donde son», el bot contestó «Son *Kenda*»; después
    // dijo «Soy de provincia de santo domingo» y el bot habló de Cumbayá y
    // Quito Sur SIN UN SOLO LINK, y tuvo que entrar el asesor a mano.
    //
    // Va después del Ángel Guardián por lo de siempre —él reescribe— y antes
    // del cierre, para que la pregunta del día quede al final del turno.
    // Ver `domain/ubicacionPedida.ts`.
    nombre: "ubicacion_cuando_la_piden",
    corre: ["respuesta", "retomada"],
    async aplicar(texto, ctx) {
      const motivo = motivoDeUbicacion(ctx.textoDelCliente ?? "");
      if (!motivo) return texto;
      // Si el turno YA lleva los mapas (la cotización los manda), no se duplican.
      const yaLosLleva = business.stores.some(
        (store) => store.mapsUrl && texto.includes(store.mapsUrl),
      );
      if (yaLosLleva) return texto;
      // Preguntó: el mapa sale aunque ya se lo hayamos mandado — si vuelve a
      // preguntar es porque no lo encontró. Solo nombró su ciudad: sale una vez.
      const mapas = motivo === "la_pidio"
        ? buildStoreLinksBlock()
        : await buildStoreLinksBlockOnce(ctx.conversation.id);
      if (!mapas) return texto;
      console.log(
        `📍 Ubicación pegada en la conv ${ctx.conversation.id} (${motivo})`,
      );
      return `${texto}\n---\n${mapas}`;
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
      if (ctx.suprimirEmpujeComercial) return texto;
      const insistido = await insistirConLoQueFalta(
        ctx.conversation.id, ctx.conversation.current_cycle, texto, ctx.textoDelCliente,
        ctx.faseOperativa,
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
    // LO PROMETIDO SE EJECUTA. Regla 3 del corpus T115: «si el bot afirma que
    // avisó, la acción ocurrió realmente». Medido 31-ago (nivel 2, mini,
    // escenario E01): el modelo escribió «ya le avisé a un asesor» sin llamar
    // ninguna herramienta. Este paso lee el texto FINAL: si afirma un aviso y
    // no existe ninguno en el ciclo, lo ejecuta de verdad — una sola vez, con
    // dedupe — para que el cliente nunca reciba una promesa hueca.
    nombre: "lo_prometido_se_ejecuta",
    corre: ["respuesta", "retomada"],
    async aplicar(texto, ctx) {
      const afirmaAviso = /ya\s+(?:le\s+)?avis[eé]|ya\s+notifiqu|ya\s+(?:le\s+)?pas[eé]\s+(?:su|el)\s+(?:caso|consulta|pedido)|dej[eé]\s+(?:notificad|avisad|su\s+caso)|qued[oó]\s+(?:avisad|notificad)/i
        .test(texto.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      if (!afirmaAviso) return texto;
      const [ya] = await sql`
        select 1 as x from advisor_notifications
        where conversation_id=${ctx.conversation.id} and cycle=${ctx.conversation.current_cycle}
        limit 1
      `;
      if (ya) return texto;
      await notifyAdvisor({
        conversationId: ctx.conversation.id,
        cycle: ctx.conversation.current_cycle,
        eventType: "human_requested",
        dedupeKey: `prometido_ejecutado:${ctx.conversation.id}:${ctx.conversation.current_cycle}`,
        title: "El bot prometió un aviso — ejecutado por el candado",
        reason: `El texto saliente afirmaba haber avisado y no existía aviso. Último mensaje del cliente: «${(ctx.textoDelCliente ?? "").slice(0, 160)}»`,
        action: "Revisa la conversación y contacta al cliente.",
      }).catch((err) => console.warn(`⚠️ lo_prometido_se_ejecuta no pudo avisar en la conv ${ctx.conversation.id}:`, err.message));
      console.log(`📣 Aviso prometido y no ejecutado: el candado lo mandó de verdad (conv ${ctx.conversation.id})`);
      return texto;
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
    // Ningún local inventado sobrevive el turno.
    //
    // Producción, 27-ago, conv 11302: el bot ofreció «¿Le queda mejor el sector
    // *Quito Norte* o *Quito Sur*?» y Depot Tire no tiene local en el norte. El
    // cliente contestó «en el norte» y el turno siguiente hubo que desdecirse.
    // Va aquí, después del Ángel Guardián, porque ese nombre lo escribió el
    // modelo y el guardián lo dejó pasar. Ver domain/localesInventados.ts.
    nombre: "sin_locales_inventados",
    corre: ["respuesta", "retomada", "seguimiento"],
    async aplicar(texto, ctx) {
      const conLocales = conLocalesReales(texto);
      if (conLocales.inventados.length) {
        console.warn(
          `✂️ Local inventado en la conv ${ctx.conversation.id}: ${conLocales.inventados.join(" | ")}`,
        );
        await createBotAlert({
          conversationId: ctx.conversation.id,
          cycle: ctx.conversation.current_cycle,
          type: "local_inventado",
          priority: "high",
          summary: "El bot ofreció un local que no existe",
          exactReason: `Ofreció: ${conLocales.inventados.join(" | ")}`,
          suggestedAction: "Se reemplazó por la pregunta de los dos locales reales. Revisá el turno.",
          dedupeKey: `local_inventado:${ctx.conversation.id}:${ctx.conversation.current_cycle}`,
        });
      }
      return conLocales.texto;
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
  {
    // EL CALCO DE HACE UN MOMENTO, LO ÚLTIMO DE TODO.
    //
    // `applyOutboundGuard` ya frena el mensaje idéntico… pero corre ANTES del
    // Ángel Guardián, y el 31-ago (conv 3 c20) fue el guardián quien reescribió
    // el borrador dejándolo idéntico al bloque de locales que había salido 7
    // segundos antes — el cliente recibió los mapas y la pregunta del local dos
    // veces seguidas. La ventana es corta (10 minutos) a propósito: repetir un
    // dato pedido de nuevo media hora después es servicio; repetirlo a los
    // segundos es un bot con eco. Ver domain/calcoReciente.ts.
    nombre: "sin_pregunta_repetida_en_el_turno",
    corre: ["respuesta", "retomada"],
    async aplicar(texto, ctx) {
      const limpio = sinPreguntaRepetidaEnElTurno(texto);
      if (!limpio.quitadas.length) return texto;
      console.warn(
        `✂️ Pregunta repetida en el turno de la conv ${ctx.conversation.id}: ${limpio.quitadas.join(" | ").slice(0, 200)}`,
      );
      await createBotAlert({
        conversationId: ctx.conversation.id,
        cycle: ctx.conversation.current_cycle,
        type: "pregunta_repetida_en_turno",
        priority: "medium",
        summary: "El bot iba a preguntar lo mismo dos veces en el mismo turno (recortado)",
        exactReason:
          `El turno preguntaba dos veces lo mismo con otras palabras. Se quitó: «${limpio.quitadas.join(" | ").slice(0, 300)}»`,
        suggestedAction:
          "El cliente recibió una sola pregunta. Si se repite seguido, el modelo está cerrando dos veces el mismo turno.",
        dedupeKey: `pregunta_repetida_turno:${ctx.conversation.id}:${ctx.conversation.current_cycle}`,
      }).catch(() => undefined);
      return limpio.texto;
    },
  },
  {
    // LA FORMA DEL TURNO: [respuesta] [links] [pregunta]. Manuel, 1-sep-2026.
    //
    // Corre después de todos los pasos que agregan o quitan contenido (la
    // ubicación pega los mapas, insistir agrega la pregunta, el guardián
    // reescribe) y ANTES del calco reciente, que compara bloque a bloque contra
    // lo ya enviado: tiene que ver los mismos bloques que van a salir —los
    // links solos, la pregunta sola— o el bloque de mapas repetido se le pasa
    // pegado a un párrafo distinto. Solo en el turno normal, la única puerta
    // que parte el texto en mensajes. Ver domain/estructuraDelTurno.ts.
    nombre: "estructura_del_turno",
    corre: ["respuesta"],
    async aplicar(texto, ctx) {
      const forma = estructurarTurno(texto);
      if (forma.repetidosQuitados.length) {
        console.warn(
          `✂️ Idea repetida en el turno de la conv ${ctx.conversation.id}: ${forma.repetidosQuitados.map((p) => p.slice(0, 80)).join(" | ")}`,
        );
      }
      return forma.texto;
    },
  },
  {
    // EL CALCO DE HACE UN MOMENTO, LO ÚLTIMO DE TODO. Ver domain/calcoReciente.ts.
    nombre: "sin_calco_reciente",
    corre: ["respuesta", "retomada"],
    async aplicar(texto, ctx) {
      // Solo del CICLO vigente: tras un reinicio —manual o por inactividad— lo
      // que dijimos antes es de otra conversación, y repetirlo no es pereza
      // sino lo correcto. Sin este filtro, un `/restart` seguido de «hola» se
      // quedaba sin bienvenida: el saludo del ciclo anterior seguía dentro de
      // la ventana de 10 minutos y este candado se comía el bloque entero
      // (simulador, 31-ago: el turno salió sin presentarse, solo con la
      // pregunta suelta «¿Qué medida usa?»).
      const recientes = await sql<{ content: string | null }[]>`
        select content from messages
        where conversation_id=${ctx.conversation.id}
          and direction='outbound' and author_kind='bot' and type='text'
          and cycle=(select current_cycle from conversations where id=${ctx.conversation.id})
          and created_at > now() - interval '10 minutes'
        order by created_at desc limit 8
      `;
      // Si el cliente PIDIÓ los mapas con todas las letras («mándeme las dos»),
      // el bloque de links no es un calco aunque haya salido hace segundos:
      // quitarlo dejaba el texto prometiendo «le dejo nuevamente las dos
      // ubicaciones:» sin nada debajo (simulador, 1-sep 23:14). Solo el
      // bloque de links se salva; el resto del turno sigue bajo el candado.
      const pidioMapas = motivoDeUbicacion(ctx.textoDelCliente ?? "") === "la_pidio";
      const conLink = /https?:\/\//i;
      const resultado = sinBloquesCalcados(
        texto,
        recientes.map((m) => m.content ?? "").filter((m) => !(pidioMapas && conLink.test(m))),
      );
      if (!resultado.calcados.length) return texto;
      console.warn(
        `✂️ Calco reciente quitado en la conv ${ctx.conversation.id}: ${resultado.calcados.map((b) => b.slice(0, 80)).join(" | ")}`,
      );
      await createBotAlert({
        conversationId: ctx.conversation.id,
        cycle: ctx.conversation.current_cycle,
        type: "calco_reciente",
        priority: "medium",
        summary: "El bot iba a repetir un mensaje que acababa de enviar (recortado)",
        exactReason:
          `Bloques idénticos a mensajes de los últimos 10 minutos: «${resultado.calcados.join(" | ").slice(0, 300)}»`,
        suggestedAction:
          resultado.texto
            ? "Al cliente le llegó el turno sin la repetición. Nada urgente."
            : "El turno entero era una repetición y no se envió. Revisa si el cliente esperaba algo distinto.",
        dedupeKey: `calco_reciente:${ctx.conversation.id}:${ctx.conversation.current_cycle}`,
      }).catch(() => undefined);
      return resultado.texto;
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
  ctx.salidaTerminal = false;
  for (const paso of pasosPara(ctx.tipo)) {
    if (!texto) break;
    pasosCorridos.push(paso.nombre);
    try {
      texto = await paso.aplicar(texto, ctx);
      if (ctx.salidaTerminal) break;
    } catch (error) {
      console.error(`⚠️ El candado ${paso.nombre} falló en la conv ${ctx.conversation.id}:`, error);
    }
  }
  return { texto: texto?.trim() ? texto : null, pasosCorridos };
}
