/**
 * «YA AVISÉ AL ASESOR» ES UNA PROMESA: solo se dice si quedó registrado.
 *
 * Familia 2-E (auditoría 28-sep). «Ya está avisado el asesor» (conv 21766),
 * «Para provincias como Loja, lo revisa un asesor… Ya dejé el caso anotado para
 * que le confirmen» (conv 23084). Después de esa frase el cliente deja de
 * insistir: espera a una persona. Si detrás no hay una alerta o un aviso de
 * verdad, nadie va a aparecer — es la peor forma de perder una venta, porque el
 * cliente cree que lo están atendiendo.
 *
 * Aquí vive lo que es texto: reconocer la afirmación y reescribirla. Saber si
 * el turno dejó registro es de `services/avisoAlAsesor.ts`; el candado que las
 * junta, `sin_aviso_inventado` en `services/prepararSalida.ts`, después del
 * Ángel Guardián (que también puede escribir la frase en su corrección).
 */

/** Lo que se dice cuando no hay registro: cierto y sin prometer a nadie. */
export const RESPUESTA_SIN_AVISO = "Se lo consulto y le confirmo.";

const normalizar = (t: string): string =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Afirmaciones de que el caso YA está en manos de una persona. No entra el
 * condicional del cierre («con ese dato le aviso al asesor»): eso es lo que
 * pasará cuando el cliente conteste, y ahí sí se registra.
 */
const AFIRMA_AVISO: readonly RegExp[] = [
  /\bya\s+(?:le\s+|les\s+|lo\s+)?(?:avise|notifique|informe|reporte|escale)\b/,
  /\bya\s+(?:esta|quedo|queda)\s+(?:avisad[oa]s?|notificad[oa]s?|informad[oa]s?)\b/,
  /\basesor(?:es)?\s+ya\s+(?:esta[n]?\s+)?(?:avisad[oa]s?|notificad[oa]s?|enterad[oa]s?|informad[oa]s?|tiene[n]?\s+(?:su|el)\s+caso)\b/,
  /\bdeje\s+(?:el\s+|su\s+)?caso\s+anotado\b|\bdeje\s+anotado\b|\bya\s+(?:lo\s+|la\s+)?anote\b|\bqueda\s+anotad[oa]\s+(?:su|el)\s+(?:caso|pedido)\b/,
  // Las formas que ya atajaba `lo_prometido_se_ejecuta` (T115 E01, 31-ago).
  /\bdeje\s+(?:su\s+caso\s+)?(?:notificad|avisad)\w*|\bdeje\s+su\s+caso\b|\bquedo\s+(?:avisad|notificad)\w*/,
  /\bya\s+(?:le\s+)?pase\s+(?:su|el)\s+(?:caso|pedido|dato|consulta)/,
  /\b(?:lo|la|le)\s+(?:revisa|esta\s+revisando)\s+un\s+asesor\b|\bun\s+asesor\s+(?:ya\s+)?(?:lo|la)\s+(?:revisa|esta\s+revisando)\b/,
  /\bun\s+asesor\s+(?:ya\s+)?(?:le\s+)?(?:va\s+a\s+)?(?:escribir|contactar|llamar)\b|\ble\s+(?:va\s+a\s+)?(?:escribir|contactar|llamar)\s+un\s+asesor\b/,
];

function afirmaEnLaFrase(frase: string): boolean {
  const n = normalizar(frase);
  return AFIRMA_AVISO.some((re) => re.test(n));
}

export function afirmaQueAviso(texto: string | null | undefined): boolean {
  return afirmaEnLaFrase(texto ?? "");
}

/**
 * «Se lo consulto (a un asesor) y le confirmo»: la promesa honesta que deja
 * este candado, el anti-bucle y la corrección del guardián. Es futuro, pero
 * también es una promesa: quien la lee espera que alguien pregunte. El candado
 * la registra de verdad si el turno no dejó ya un aviso.
 */
export function prometeConsultar(texto: string | null | undefined): boolean {
  return /\bse\s+lo\s+consulto\b|\blo\s+consulto\s+con\s+(?:un|el|la)\s+asesor/.test(normalizar(texto ?? ""));
}

/**
 * Cambia cada frase que afirma el aviso por «Se lo consulto y le confirmo.»,
 * una sola vez: si había dos frases de aviso seguidas, la segunda se quita. El
 * resto del texto —la llanta, el precio, los separadores— queda igual.
 */
export function sinAvisoInventado(texto: string): { texto: string; cambiado: boolean } {
  if (!afirmaQueAviso(texto)) return { texto, cambiado: false };
  let yaPuesta = false;
  const lineas = texto.split("\n").map((linea) => {
    if (!afirmaEnLaFrase(linea)) return linea;
    const frases = linea.split(/(?<=[.!?…])\s+/);
    const quedan = frases.flatMap((frase) => {
      if (!afirmaEnLaFrase(frase)) return [frase];
      if (yaPuesta) return [];
      yaPuesta = true;
      return [RESPUESTA_SIN_AVISO];
    });
    return quedan.join(" ").trim();
  });
  const limpio = lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { texto: limpio, cambiado: true };
}

/**
 * El hecho para el Ángel Guardián. Solo viaja cuando el borrador afirma haber
 * avisado: si el revisor no lo sabe, o borra una frase cierta o deja pasar una
 * falsa — y su corrección también puede inventarla.
 */
export function hechoDelAvisoAlAsesor(registrado: boolean): string {
  return registrado
    ? "AVISO AL ASESOR REGISTRADO ESTE TURNO: hay una alerta/aviso real para el asesor. El borrador PUEDE decir que avisó o que un asesor lo revisa."
    : "AVISO AL ASESOR: este turno NO se registró ninguna alerta ni aviso al asesor. Decir «ya avisé», «ya está avisado el asesor», «dejé el caso anotado» o «lo revisa un asesor» es **promesa_incumplible** (alta): la corrección dice «Se lo consulto y le confirmo.» y no promete que alguien le escribirá.";
}
