/**
 * LAS PIEZAS DEL CHAT, RÁPIDAS (22-nov-2026).
 *
 * El panel vuelve a dibujar cada cotización/opciones desde los códigos del
 * mensaje. Medido en el teléfono: ~1 s y ~900 kB por pieza, CADA vez que se
 * abría el chat. Dos arreglos:
 *
 *  · memoria: la pieza dibujada se guarda 30 min por mensaje — la segunda vez
 *    sale en milisegundos (los precios son «los de hoy», así que media hora de
 *    memoria no cambia lo que se ve);
 *  · versión chica: la burbuja del chat mide 260 px; se le sirve la pieza a
 *    560 px de ancho y la grande solo cuando el asesor la amplía.
 */
import { Resvg } from "@resvg/resvg-js";

const VIGENCIA_MS = 30 * 60 * 1000;
const MAX_ENTRADAS = 40;

const memoria = new Map<string, { png: Buffer; at: number }>();

export function piezaEnMemoria(clave: string, ahora = Date.now()): Buffer | null {
  const entrada = memoria.get(clave);
  if (!entrada) return null;
  if (ahora - entrada.at > VIGENCIA_MS) {
    memoria.delete(clave);
    return null;
  }
  // La más usada va al final: la que se borra al llenarse es la más vieja.
  memoria.delete(clave);
  memoria.set(clave, entrada);
  return entrada.png;
}

export function guardarPieza(clave: string, png: Buffer, ahora = Date.now()): void {
  memoria.delete(clave);
  memoria.set(clave, { png, at: ahora });
  while (memoria.size > MAX_ENTRADAS) {
    const primera = memoria.keys().next().value;
    if (primera === undefined) break;
    memoria.delete(primera);
  }
}

export function olvidarPiezas(): void {
  memoria.clear();
}

/** Ancho y alto de un PNG, leídos de su cabecera (IHDR). null si no es un PNG. */
export function medidasDelPng(png: Buffer): { ancho: number; alto: number } | null {
  if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47) return null;
  return { ancho: png.readUInt32BE(16), alto: png.readUInt32BE(20) };
}

/**
 * La misma pieza a `ancho` píxeles. Si ya es más chica, o algo falla, devuelve
 * la original: una pieza grande es mejor que ninguna.
 */
export function achicarPieza(png: Buffer, ancho: number): Buffer {
  try {
    const medidas = medidasDelPng(png);
    if (!medidas || medidas.ancho <= ancho) return png;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${medidas.ancho}" height="${medidas.alto}" viewBox="0 0 ${medidas.ancho} ${medidas.alto}">` +
      `<image width="${medidas.ancho}" height="${medidas.alto}" href="data:image/png;base64,${png.toString("base64")}"/></svg>`;
    return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: ancho } }).render().asPng());
  } catch (error) {
    console.warn("⚠️ No se pudo achicar la pieza:", error instanceof Error ? error.message : error);
    return png;
  }
}
