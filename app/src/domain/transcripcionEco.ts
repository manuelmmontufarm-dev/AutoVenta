/**
 * ¿LO QUE VOLVIÓ DEL TRANSCRIPTOR ES EL PROMPT, NO EL CLIENTE?
 *
 * `services/transcripcion.ts` le pasa a Whisper un VOCABULARIO como sesgo —las
 * medidas y las marcas que vendemos— para que «205/55R16» no salga escrito en
 * letras. Es la práctica normal con ese modelo, y funciona. Lo que no estaba
 * previsto es qué pasa cuando el audio sale mudo o inaudible: entonces el
 * modelo no tiene nada que transcribir y devuelve el propio prompt.
 *
 * Conv 18025, 9-sep-2026: dos audios seguidos devolvieron el vocabulario
 * completo, palabra por palabra. El bot lo leyó como si el cliente hubiera
 * dicho «205/55R16» y le armó la vitrina de esa medida; la cotización terminó
 * en una medida que nadie pidió.
 *
 * Vive en el dominio y no en el servicio para poder probarlo sin red, y porque
 * la decisión —«esto no es habla»— es una regla de negocio, no un detalle de
 * la llamada a la API.
 */

/** El mismo sesgo que viaja a Whisper. Fuente única: lo importa el servicio. */
export const VOCABULARIO_TRANSCRIPCION =
  "Llantas en Quito. Medidas como 205/55R16, 265/70R17, aro, rin, juego de 4. "
  + "Marcas: Kenda, Falken, Sunoco, Eurolub, Wildpeak. Cotización, precio, camioneta.";

const palabras = (texto: string): string[] =>
  texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    // «205/55R16» y «205 55 r16» son la misma cadena dicha por el modelo con y
    // sin la barra: se separan letras de números para que las dos coincidan.
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .trim()
    .split(" ")
    .filter(Boolean);

/**
 * Es eco cuando TODO lo que trae ya estaba en el vocabulario y además viene en
 * el mismo orden. Las dos condiciones juntas importan: un cliente puede decir
 * «llantas kenda para camioneta» —tres palabras del vocabulario— y eso es
 * habla de verdad, pero nadie repite la lista entera en su orden exacto.
 *
 * El umbral de seis palabras deja fuera los audios cortos legítimos («hola»,
 * «camioneta»), que ya se tratan como audio sin medida.
 */
export function esEcoDelVocabulario(texto: string): boolean {
  const dichas = palabras(texto);
  if (dichas.length < 6) return false;
  const base = palabras(VOCABULARIO_TRANSCRIPCION);
  // Subsecuencia en orden: cada palabra dicha se busca a partir de donde quedó
  // la anterior. Si alguna no está, no es el prompt.
  let i = 0;
  for (const palabra of dichas) {
    const pos = base.indexOf(palabra, i);
    if (pos === -1) return false;
    i = pos + 1;
  }
  return true;
}
