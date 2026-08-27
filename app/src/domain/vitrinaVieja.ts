/**
 * LA VITRINA VIEJA NO SE RE-ETIQUETA CON LA MEDIDA NUEVA.
 *
 * Producción, 27-ago-2026, conv 11881. El cliente escribió «Ron 15» —el aro, sin
 * medida— y el bot le mandó una MUESTRA por aro 15, que es un camino legítimo y
 * que se guarda con `sizeLabel: null` justamente porque NO es su medida:
 *
 *   14:43  pieza: FALKEN WILDPEAK A/T 4W · KENDA KR20 · WINRUN R330   (sizeLabel: null)
 *   15:35  CLIENTE: «225/70/15»
 *   15:35  BOT: «Perfecto, en *225/70R15* ya le envié estas opciones:
 *          *Costo* WINRUN R330 $58.69 c/u, *Equilibrio* KENDA KR20 $71.77 c/u
 *          y *Premium* FALKEN WILDPEAK A/T 4W $208.48 c/u.»
 *   15:38  CLIENTE: «Las den58,69»
 *   15:38  BOT: «Disculpe, esa opción de $58.69 no corresponde a su medida
 *          *225/70R15*, fue un cruce de medidas.»
 *
 * La WINRUN R330 de $58.69 es el código `1855515WNR330`: una **185/55R15**. El
 * modelo no buscó nada — le puso a la medida nueva la etiqueta de la vitrina
 * vieja, el cliente eligió el precio más barato de esa lista, y hubo que
 * desdecirse en el turno siguiente. Un precio prometido y retirado es peor que
 * no haberlo dado.
 *
 * El sistema TENÍA el dato: la pieza se guarda con su `sizeLabel`. Lo que
 * faltaba era ponérselo delante al modelo en el turno en que llega la medida.
 *
 * Puro a propósito: se prueba sin base y sin modelo.
 */

/**
 * "265/75R16", "265/75 r16" y "265/75/16" son la misma medida para comparar.
 *
 * La R se cae con los separadores a propósito: el cliente casi nunca la
 * escribe («225/70/15» fue literalmente lo que mandó en la conv 11881) y una
 * comparación que las trate como medidas distintas dispararía la advertencia
 * contra su propia pieza correcta.
 */
const limpiar = (s: string) => s.trim().toUpperCase().replace(/[\s./-]/g, "").replace(/R/g, "");

export interface VitrinaPrevia {
  /** Lo que decía la pieza: la medida rotulada, o `null` si fue muestra por aro. */
  sizeLabel: string | null;
  /** Nombres tal como se los enseñamos, para poder nombrarlos en la orden. */
  etiquetas: readonly string[];
}

/**
 * ¿La última pieza de opciones que salió es de OTRA medida que la que el
 * cliente acaba de pedir?
 *
 * `null` cuando no hay pieza previa, cuando es de la misma medida, o cuando el
 * cliente todavía no dio medida — en esos tres casos no hay nada que advertir.
 */
export function vitrinaQueNoEsSuMedida(
  previa: VitrinaPrevia | null | undefined,
  medidaPedida: string | null | undefined,
): VitrinaPrevia | null {
  if (!previa || !medidaPedida?.trim()) return null;
  if (previa.sizeLabel && limpiar(previa.sizeLabel) === limpiar(medidaPedida)) return null;
  return previa;
}

/** El hecho duro que se le mete al turno. Va entre los bloques volátiles. */
export function ordenDeNoReusarLaVitrina(
  previa: VitrinaPrevia,
  medidaPedida: string,
): string {
  const deDonde = previa.sizeLabel
    ? `de *${previa.sizeLabel}*`
    : "una MUESTRA por aro, sin medida confirmada";
  const cuales = previa.etiquetas.length
    ? ` (${previa.etiquetas.slice(0, 4).join(", ")})`
    : "";
  return (
    `LA VITRINA QUE YA MANDASTE NO ES DE ${medidaPedida} (fuente determinística): la última pieza de `
    + `opciones${cuales} salió ${deDonde}, y el cliente acaba de pedir ${medidaPedida}. `
    + `PROHIBIDO decir «en ${medidaPedida} ya le envié estas opciones», PROHIBIDO repetir esos precios `
    + `como si fueran de ${medidaPedida} y PROHIBIDO cotizar sobre ellos. Busca de nuevo con `
    + `buscar_llanta para ${medidaPedida} y manda una pieza NUEVA con preparar_opciones. `
    + "Si alguna de las de antes también existe en su medida, saldrá de esa búsqueda con SU precio."
  );
}
