/**
 * UNA SOLA OPCIÓN + EL CLIENTE YA PIDIÓ EL PRECIO = SE COTIZA, NO SE PREGUNTA.
 *
 * Producción, conv +593 99 842 8277, 25-sep y 27-sep 23:42 (esta última DESPUÉS
 * del deploy 636a7bf): «31x10.5R15» + «Precio por favor», y «cotízame la
 * 265/70R16». Había una sola llanta vendible y el bot contestó «Es la única que
 * tengo: Kenda KR628 $191 c/u. ¿Se la cotizo?» — dos veces, y los seguimientos
 * repitieron el «¿se la cotizo?». La cotización nunca salió.
 *
 * LA FAMILIA: «el cliente ya pidió X y el bot le pide permiso para hacer X».
 * El precio a secas NO autoriza cuando hay un menú de tres (conv 13615: primero
 * las opciones, el cliente elige, recién ahí la cotización). Pero con UNA sola
 * llanta no hay nada que elegir: el menú no existe y la pregunta es un turno
 * perdido. Esta es la fuente única de esa decisión; la usan la pieza de opciones
 * (`preparar_opciones`) y, por `domain/ofertaAceptada.ts`, el turno siguiente.
 *
 * La cantidad NO cambia: el turno cotiza lo que el cliente haya dicho y, si no
 * dijo, el juego de 4 con su aclaración horneada — igual que con «cotízame».
 * Puro a propósito: se prueba sin base y sin modelo.
 */

import { pidioPrecioOCotizacion } from "./salesIntent.js";

export function cotizarLaUnicaDeUnaVez(input: {
  /** Cuántas llantas DISTINTAS ofrece la pieza (tres escalones con el mismo código son una). */
  opcionesDistintas: number;
  /** Lo que el cliente dijo en esta visita, incluido el mensaje del turno. */
  textosDelCliente: readonly string[];
  /** La medida la dedujo el bot: sin la del cliente no se cotiza. */
  medidaSinConfirmar: boolean;
}): boolean {
  if (input.medidaSinConfirmar || input.opcionesDistintas !== 1) return false;
  return input.textosDelCliente.some((texto) => pidioPrecioOCotizacion(texto ?? ""));
}

/**
 * EL ÚLTIMO TURNO DEL BOT, no su última fila. Una respuesta sale en varias filas
 * del historial (la pieza, el texto, y el cierre «¿Se la cotizo? 😊» aparte):
 * mirar solo la última perdía «Es la única que tengo…» (simulador en vivo,
 * 28-sep). Junta las filas `assistant` consecutivas que van antes del próximo
 * mensaje del cliente, saltando el mensaje actual de éste si ya está al final.
 * Única fuente: la usan `agent.ts` y `ofertaAceptada.ts`.
 */
export function ultimoTurnoDelBot(
  historial: readonly { role: string; content: unknown }[],
): string {
  let i = historial.length - 1;
  // Solo se salta UN mensaje del cliente (el actual): con más, la oferta ya es vieja.
  if (i >= 0 && historial[i].role === "user") i--;
  const filas: string[] = [];
  for (; i >= 0 && historial[i].role === "assistant"; i--) {
    const c = historial[i].content;
    if (typeof c === "string" && c.trim()) filas.unshift(c);
  }
  return filas.join("\n");
}

/** El último mensaje del bot ofreció cotizar la ÚNICA llanta («Es la única que tengo… ¿Se la cotizo?»). */
export function ofrecioCotizarLaUnica(ultimoMensajeDelBot: string | null | undefined): boolean {
  const bot = (ultimoMensajeDelBot ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return /es la unica que tengo/.test(bot)
    || /es la que tengo disponible en su medida[^?]*\?/.test(bot);
}
