/**
 * A QUIÉN VALE LA PENA RESCATAR.
 *
 * El rescate de chats olvidados (`services/hubMaintenance.ts`) retoma los que
 * el asesor dejó sin contestar más de 12 h. Para decidirlo miraba una sola
 * cosa: que el último mensaje del cliente no tuviera respuesta después. Una
 * despedida cumple esa condición, así que también se rescataba.
 *
 * Tres de los cinco rescates de la auditoría del 8 al 11-sep cayeron sobre
 * despedidas, y los tres repreguntaron algo ya resuelto:
 *
 *  · conv 404 · «Muchas gracias organizaré mi presupuesto estaremos en
 *    contacto» → «Igualmente» → 18 h después: «¿A cuál local le queda mejor
 *    ir?», a un cliente cuyo sector ya sabían desde agosto.
 *  · conv 6468 · «voy a la del sur… el fin de semana» → «Gracias» → el bot
 *    volvió a preguntar el local y el fin de semana.
 *  · conv 16872 · el asesor mandó el mapa, el cliente confirmó «El sábado
 *    entre las 10 estoy dónde ustedes» → el bot repreguntó el local y el
 *    cliente tuvo que escribir «Quito sur» otra vez.
 *  · conv 18294 · el cliente dijo «Gracias» al asesor → 12 h después el bot
 *    le contestó «Con gusto, quedo atento» a ese agradecimiento.
 *
 * Un chat de verdad olvidado termina con una PREGUNTA o un pedido sin
 * responder. Tres cosas dicen que no hay nada que rescatar: que el cliente se
 * haya despedido, que él mismo haya dicho que avisa, y que la visita ya esté
 * anotada.
 *
 * Puro y sin base para poder probarlo con los mensajes exactos de esos chats.
 */
import { esCierreComercialDelTurno, esPlazoDeDecision } from "./cierreTurno.js";
import { despedidaQueCorresponde } from "./cierrePerdido.js";

export type MotivoDeNoRescatar = "despedida" | "plazo" | "visita_registrada";

export interface Rescate {
  rescatar: boolean;
  /** Por qué no, para que la alerta del asesor lo diga en cristiano. */
  motivo: MotivoDeNoRescatar | null;
}

const AGRADECIMIENTO_SOLO =
  /^(?:muchas\s+)?(?:gracias|grasias|ok\s+gracias|listo\s+gracias|muy\s+amable|igualmente|perfecto\s+gracias|dale\s+gracias)[\s.!👍🙏😊🤝]*$/i;

export function mereceRescate(input: {
  /** El último mensaje del cliente, el que quedó sin respuesta. */
  ultimoDelCliente: string | null | undefined;
  /** ¿Ya hay día de visita anotado en la ficha? */
  visitaRegistrada: boolean;
}): Rescate {
  if (input.visitaRegistrada) return { rescatar: false, motivo: "visita_registrada" };
  const texto = (input.ultimoDelCliente ?? "").trim();
  if (!texto) return { rescatar: true, motivo: null };
  // El plazo va antes que la despedida: «ya le confirmo» es un compromiso
  // vivo, no un cierre, y el motivo que se guarda tiene que decir eso.
  if (esPlazoDeDecision(texto)) return { rescatar: false, motivo: "plazo" };
  if (
    AGRADECIMIENTO_SOLO.test(texto.normalize("NFD").replace(/[̀-ͯ]/g, ""))
    || despedidaQueCorresponde(texto)
    || esCierreComercialDelTurno(texto)
  ) return { rescatar: false, motivo: "despedida" };
  return { rescatar: true, motivo: null };
}
