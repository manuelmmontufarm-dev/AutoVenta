/**
 * NINGÚN MENSAJE SALE CORTADO A MITAD DE FRASE.
 *
 * Producción, 12-sep-2026 17:29 (conv 3, Manuel probando). El Guardián
 * escribió «Perfecto. Para dejarle todo claro antes de su visita del lunes,
 * ¿le queda mejor Cumbayá o Quito Sur?». Un paso separó la pregunta, otro la
 * borró por calco (había salido 50 segundos antes) y al cliente le llegó:
 *
 *   BOT: «Perfecto. Para dejarle todo claro antes de su visita del lunes,»
 *
 * La causa se arregló en el separador (`preguntaSola.ts`). Esto es la red: el
 * último mensaje del turno no puede terminar en coma, dos puntos o punto y
 * coma. Se recorta hasta la última frase completa y, si no queda ninguna, ese
 * mensaje no sale. Solo quita: corre al final de la cadena, donde agregar
 * texto está prohibido.
 */

const SEPARADOR = /\n\s*-{3,}\s*\n/;
const COLGANDO = /[,:;]\s*(?:\p{Extended_Pictographic}️?\s*)*$/u;

export interface SinFraseColgando {
  /** El turno sin la frase cortada, o null si no quedó nada que mandar. */
  texto: string | null;
  /** Lo que se quitó, para el log. */
  recortado: string | null;
}

export function sinFraseColgando(texto: string): SinFraseColgando {
  const bloques = texto.split(SEPARADOR).map((b) => b.trim()).filter(Boolean);
  if (!bloques.length) return { texto, recortado: null };
  const ultimo = bloques[bloques.length - 1];
  if (!COLGANDO.test(ultimo)) return { texto, recortado: null };
  const cortes = [...ultimo.matchAll(/[.!?…](?=\s)|\n/g)];
  const corte = cortes[cortes.length - 1];
  const queda = corte?.index !== undefined ? ultimo.slice(0, corte.index + 1).trim() : "";
  const nuevos = [...bloques.slice(0, -1), ...(queda ? [queda] : [])];
  return {
    texto: nuevos.length ? nuevos.join("\n---\n") : null,
    recortado: ultimo.slice(queda.length).trim(),
  };
}
