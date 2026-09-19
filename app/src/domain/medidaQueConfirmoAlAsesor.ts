/**
 * LO QUE EL CLIENTE LE CONFIRMA AL ASESOR TAMBIÉN CUENTA.
 *
 * Conv 19706 (14-sep). El cliente escribió «Falken 165/75 r16», una medida que
 * no existe. El asesor entró al chat: «Disculpe usted se referia a la
 * 265/75R16?». Ocho horas después el cliente contestó «Si». El bot retomó con
 * 165/75R16, mostró «equivalentes» en 215/60R16 y cotizó cuatro; el cliente:
 * «No me sirve esa medida». La corrección estaba en el hilo, en un mensaje del
 * asesor, y el bot solo lee como propias las preguntas que hizo él.
 *
 * Puro: el último mensaje saliente (si es del asesor) y lo que contestó el
 * cliente. Devuelve la medida solo cuando la pregunta nombra UNA y la respuesta
 * es un sí sin más.
 */
import { esAcuseSimple } from "./ofertaAceptada.js";
import { extractTireSizes, formatTireSize } from "./tireSize.js";

export function medidaQueConfirmoAlAsesor(
  ultimoDelAsesor: string | null | undefined,
  mensajeDelCliente: string,
): string | null {
  if (!ultimoDelAsesor || !/\?/.test(ultimoDelAsesor)) return null;
  const medidas = extractTireSizes(ultimoDelAsesor);
  if (medidas.length !== 1) return null;
  if (extractTireSizes(mensajeDelCliente).length) return null;
  return esAcuseSimple(mensajeDelCliente) ? formatTireSize(medidas[0]) : null;
}
