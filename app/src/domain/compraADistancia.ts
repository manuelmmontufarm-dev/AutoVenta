/**
 * EL CLIENTE QUIERE COMPRAR SIN PASAR POR EL LOCAL: paga a distancia y quiere
 * que se lo envíen (familia 2-E, conv 21766, 20-sep-2026).
 *
 *   CLIENTE: «Lo compro x este medio me cotiza lo cancelo comfirma y me envia»
 *   BOT:     «Ya está avisado el asesor. Por este medio no confirmo cobros…»
 *   BOT (21-sep, seguimiento): «¿Qué día cree que puede pasar por Cumbayá?»
 *
 * Nadie le mandó los datos para pagar hasta el 28-sep. El seguimiento le
 * preguntó el día de la visita a quien acababa de decir que no iba a ir: el
 * candado de «no puede pasar por el local» solo conocía la geografía
 * (`fueraDeCobertura.ts`), no la forma de comprar.
 *
 * Es una DECISIÓN de compra, no una pregunta: «¿aceptan transferencia?» o
 * «¿hacen envíos?» siguen su camino normal. Hacen falta las dos mitades —
 * «compro / pago / cancelo / transfiero» y «por este medio / me lo envían /
 * a domicilio»—, y un anuncio de visita («el sábado paso») la desarma.
 *
 * Pura: entra el texto del cliente, sale sí o no.
 */

const normalizar = (t: string): string =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** La mitad de la compra: decide comprar o pagar. */
const COMPRA_O_PAGA =
  /\b(?:lo|la|los|las)?\s*compr(?:o|amos|aria|are)\b|\bquiero\s+comprar\b|\b(?:lo|la|los|las)?\s*cancel(?:o|amos|aria|are)\b|\b(?:le\s+)?(?:hago|hacemos|haria|mando|envio)\s+(?:la\s+)?transferencia\b|\bpag(?:o|amos|aria|are)\s+(?:por|con|via|x)\s+(?:transferencia|deposito)\b|\btransfier(?:o|e)\b|\bdeposit(?:o|amos)\b/;

/** La mitad de la distancia: por este canal, o que se lo manden. */
const A_DISTANCIA =
  /\b(?:por|x)\s+(?:este\s+medio|aqui|aca|whatsapp|wasap|este\s+chat)\b|\bme\s+(?:lo|la|los|las)?\s*(?:envi(?:a|an|en|e|as)|mand(?:a|an|en|e)|despach(?:a|an|en|e))\b|\b(?:que\s+)?me\s+(?:lo|la|los|las)\s+(?:traigan|lleven)\b|\ba\s+domicilio\b|\benvio\s+a\s+(?:mi|la)\s+(?:casa|direccion|ciudad)\b/;

/** Anuncia que viene: entonces no es a distancia aunque pague por transferencia. */
const VIENE_AL_LOCAL =
  /\b(?:paso|pasare|pasaria|voy|ire|me\s+acerco|me\s+acercare|llego|vamos)\b[^.?!]{0,30}\b(?:local|tienda|cumbaya|quito\s+sur|manana|hoy|sabado|domingo|lunes|martes|miercoles|jueves|viernes|semana)\b|\b(?:el|este)\s+(?:sabado|domingo|lunes|martes|miercoles|jueves|viernes)\s+(?:paso|voy|me\s+acerco)\b/;

export function quiereComprarADistancia(texto: string | null | undefined): boolean {
  const n = normalizar(texto ?? "");
  if (!n.trim()) return false;
  if (/\?\s*$/.test(n.trim()) && !/\b(?:lo|la|los|las)\s+compro\b/.test(n)) return false;
  if (VIENE_AL_LOCAL.test(n)) return false;
  return COMPRA_O_PAGA.test(n) && A_DISTANCIA.test(n);
}

/**
 * ¿Lo último que dijo el cliente sobre CÓMO compra fue «a distancia»? Recorre
 * sus mensajes del más nuevo al más viejo: gana el primero que hable del tema
 * (un «mejor el sábado paso» posterior deshace el «me lo envían» de antes).
 */
export function comproADistanciaSegunLoDicho(mensajesDelMasNuevo: readonly (string | null | undefined)[]): boolean {
  for (const texto of mensajesDelMasNuevo) {
    const n = normalizar(texto ?? "");
    if (VIENE_AL_LOCAL.test(n)) return false;
    if (quiereComprarADistancia(texto)) return true;
  }
  return false;
}
