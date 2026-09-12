/**
 * EL TURNO PARA QUIEN NO PUEDE PASAR POR EL LOCAL.
 *
 * Cuando el cliente está fuera de cobertura y no anunció que sube a Quito, hay
 * tres cosas que sobran en lo que se le manda: los mapas, la pregunta del
 * local y la pregunta del día de visita. Las tres las pegan candados que solo
 * miran si falta el dato, no dónde está el cliente.
 *
 * De la auditoría del 8 al 11-sep:
 *
 *  · conv 17934 · «Soy de Guayaquil» → el seguimiento del día siguiente le
 *    reenvió los dos mapas de Quito.
 *  · conv 18025 · «Soy de TULCÁN ya le molestare gracias» → mapas en el mismo
 *    turno, y otra vez al día siguiente.
 *  · conv 18603 · «No viajo a Quito» → el seguimiento volvió a mandar el mapa.
 *  · conv 18302 · «Yo vivo en santo domingo» → le asignaron Quito Sur «como lo
 *    más práctico» y 3 h después el seguimiento repitió la pregunta del día.
 *  · conv 18262 · pidió envío a San Lorenzo → los dos seguimientos insistieron
 *    con «¿a cuál local le queda mejor ir?», con mapas.
 *
 * Se QUITA, nunca se agrega: lo que el turno dice de llantas, precios o envío
 * se respeta entero, y si al quitar no queda nada el turno devuelve vacío para
 * que no se envíe. Esa disciplina no es un detalle — corre al final de la
 * cadena de salida, donde está prohibido agregar contenido porque ya no queda
 * ningún candado detrás que pueda revisarlo.
 *
 * Puro: entra el texto, sale el texto. Quién está fuera lo decide
 * `domain/fueraDeCobertura.ts`, y cuándo aplicarlo, la cadena de salida.
 */

/** Los bloques del turno, tal como los separa la cadena de salida. */
const SEPARADOR = /\n---\n/;

const ES_MAPA = /maps\.app\.goo\.gl|maps\.google\.com|📍/;
const PIDE_LOCAL = /\b(?:a\s+)?cu[aá]l\s+(?:de\s+(?:nuestros|los)\s+)?local(?:es)?\b|\bcumbay[aá]\s*(?:o|\/)\s*quito\s*sur\b|\bqu[eé]\s+local\b/i;
const PIDE_DIA_DE_VISITA =
  /\bqu[eé]\s+d[ií]a\b[^.?!]{0,60}\b(?:pasar?|venir|visitar|acercar|ir)\b|\bcu[aá]ndo\b[^.?!]{0,40}\b(?:puede|podr[ií]a|nos\s+visita)\b|\bd[ií]a\s+(?:le\s+)?(?:queda|vendr[ií]a|ser[ií]a)\b/i;

export interface TurnoSinVisita {
  texto: string;
  /** ¿Se quitó algo? Para poder anotarlo en el log y en la alerta. */
  quitado: boolean;
}

export function sinVisitaNiMapas(texto: string): TurnoSinVisita {
  const bloques = texto.split(SEPARADOR).map((b) => b.trim()).filter(Boolean);
  const sobra = (b: string) => ES_MAPA.test(b) || PIDE_LOCAL.test(b) || PIDE_DIA_DE_VISITA.test(b);
  const quedan = bloques.filter((b) => !sobra(b));
  if (quedan.length === bloques.length) return { texto, quitado: false };
  // Puede pasar que un bloque traiga la respuesta Y la pregunta pegadas. Ahí
  // se recorta la oración que sobra en vez de tirar el bloque entero.
  const limpios = quedan.map((b) =>
    b
      .split(/(?<=[.!?])\s+/)
      .filter((oracion) => !PIDE_LOCAL.test(oracion) && !PIDE_DIA_DE_VISITA.test(oracion))
      .join(" ")
      .trim(),
  ).filter(Boolean);
  // Sin nada que decir, el turno no se manda. Es el caso del mensaje que era
  // SOLO «¿A cuál local le queda mejor ir?» a alguien de Guayaquil (conv
  // 18106): la respuesta de verdad ya salió en su propio mensaje.
  return { texto: limpios.join("\n---\n"), quitado: true };
}
