/**
 * Dos preguntas del cliente que el modelo contesta mal cuando se le deja solo,
 * detectadas de forma determinística para inyectarle la instrucción como hecho.
 *
 * 30-ago-2026, corrida T115 conv 11274 (ancla H08):
 * - «Disponen de llantas 255 70 R16 A/T … En Falken» → el bot buscó, no había
 *   Falken en esa medida, y mandó las alternativas SIN DECIR si había Falken o
 *   no. El cliente preguntó por una marca y la respuesta ni la nombró.
 * - «De que fabricación es» → el bot contestó «no tengo ese dato» sin llamar a
 *   `respaldo_marcas`, que existe exactamente para eso (origen, garantía,
 *   rendimiento por marca).
 *
 * En la corrida de las 19:32 el modelo hizo las dos cosas bien y en la de las
 * 21:22 hizo las dos mal, con el mismo código: era una moneda al aire. Estos
 * detectores no responden por él — le ponen la obligación por delante, y el
 * Ángel Guardián la ve también.
 */

const normalizar = (texto: string): string =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Las marcas por las que un cliente pregunta de verdad. Las tres primeras son
 * las que Depot maneja; el resto llegan a WhatsApp porque el cliente ya las
 * tiene puestas o las vio en otra vitrina. Una marca desconocida no dispara
 * nada: el detector prefiere callarse a inventar.
 */
const MARCAS_CONOCIDAS = [
  "falken", "kenda", "winrun", "giti", "aplus", "maxtrek",
  "michelin", "bridgestone", "goodyear", "continental", "hankook", "pirelli",
  "firestone", "toyo", "yokohama", "dunlop", "kumho", "nexen", "sailun",
  "triangle", "linglong", "general tire",
] as const;

/**
 * ¿El mensaje pregunta si HAY una marca? Exige la marca y una señal de
 * disponibilidad o pedido — nombrar una marca a secas («mis Falken rozan») no
 * es preguntar por ella.
 */
export function marcaPreguntada(texto: string): string | null {
  const n = normalizar(texto);
  const marca = MARCAS_CONOCIDAS.find((m) => new RegExp(`\\b${m}\\b`).test(n));
  if (!marca) return null;
  const pideDisponibilidad =
    /\b(?:tienen?|hay|disponen?|manejan?|trabajan?|venden?|llego|llegaron|consigo|consiguen)\b|\bme\s+confirma\b|\bnecesito\b|\bbusco\b|\bquiero\b|\ben\s+marca\b|\?/.test(n);
  return pideDisponibilidad ? marca.toUpperCase() : null;
}

export function ordenDeNombrarLaMarca(marca: string): string {
  return (
    `EL CLIENTE PREGUNTÓ POR LA MARCA ${marca} (fuente determinística). Tu respuesta DEBE decir ` +
    `explícitamente si hay ${marca} disponible según lo que devuelvan las herramientas de búsqueda: ` +
    `si los resultados no la traen, dilo con claridad («De ${marca} no tengo disponibilidad en esa ` +
    `medida») ANTES de ofrecer alternativas. PROHIBIDO mandar opciones de otras marcas sin nombrar ` +
    `a ${marca} en el texto.`
  );
}

/**
 * ¿El mensaje pide un dato técnico que `respaldo_marcas` respalda?
 * Fabricación/origen, garantía, seguro, rendimiento, desempeño. La medida y el
 * precio no cuentan: esas van por el catálogo.
 */
export function preguntaTecnicaDeRespaldo(texto: string): boolean {
  const n = normalizar(texto);
  return /\bfabricacion\b|\bde\s+(?:que|donde)\s+(?:pais\s+)?(?:es|son|viene)\b|\borigen\b|\bfrenado\b|\bmojado\b|\bdurabilidad\b|\bcuanto\s+dura\w*\b|\bgarantia\b|\bseguro\b|\brendimiento\b|\bkilometr\w+\b|\bdesgaste\b|\bdot\b|\btraccion\b/.test(n);
}

export function ordenDeConsultarRespaldo(): string {
  return (
    "PREGUNTA TÉCNICA DETECTADA (fuente determinística): el cliente pide un dato de fabricación, " +
    "origen, garantía, seguro, duración o desempeño. CONSULTA respaldo_marcas en ESTE turno antes " +
    "de responder — tiene origen, garantía, seguro y rendimiento por marca. PROHIBIDO decir «no " +
    "tengo ese dato» sin haberla llamado. Si tras consultarla el dato puntual no está (p. ej. la " +
    "fecha exacta de fabricación o el DOT de una llanta física), dilo y explica que se verifica en " +
    "la llanta al momento de la revisión."
  );
}
