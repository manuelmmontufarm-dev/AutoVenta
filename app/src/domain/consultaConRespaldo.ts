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
    `EL CLIENTE PREGUNTÓ POR LA MARCA ${marca} (fuente determinística). BUSCA EN EL CATÁLOGO EN ` +
    `ESTE TURNO (buscar_llanta / buscar_por_aro_y_tipo / buscar_catalogo) — PROHIBIDO afirmar o ` +
    `negar disponibilidad sin búsqueda. Tu respuesta DEBE decir explícitamente si hay ${marca} según los resultados: ` +
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
  // «procedencia» y «de qué país» entraron el 31-ago (producción, conv 671):
  // Manuel preguntó «¿De qué procedencia son?» y el bot contestó «la procedencia
  // exacta no la tengo confirmada aquí» — teniendo el dato en la ficha de la
  // marca («Falken es una marca japonesa…»). El detector no conocía la palabra,
  // así que nunca fue a buscarlo y el modelo respondió de memoria, hedgeando.
  return /\bfabricacion\b|\bpro[cs]edenc\w*\b|\bde\s+(?:que|donde)\s+(?:pais\s+)?(?:es|son|vienen?|proceden)\b|\bde\s+que\s+pais\b|\bdonde\s+(?:se\s+)?(?:fabric|hacen|producen)\w*\b|\bmarca\s+de\s+donde\b|\borigen\b|\bfrenado\b|\bmojado\b|\bdurabilidad\b|\bcuanto\s+dura\w*\b|\bgarantia\b|\bseguro\b|\brendimiento\b|\bkilometr\w+\b|\bdesgaste\b|\bdot\b|\btraccion\b/.test(n);
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

/**
 * ¿Este texto del bot ofrece o promete un asesor? Alineado con la falla real:
 * T115 conv 8288 (ancla H02), corrida 4 del 30-ago — el bot ofreció el asesor
 * en DIEZ turnos («¿desea que le pase con un asesor para que le confirme
 * ingreso?») y jamás ejecutó notificar_vendedor. La zanahoria eterna es la
 * falla original de producción que esta ancla existe para impedir.
 */
export function ofrecioAsesor(textoDelBot: string): boolean {
  const n = normalizar(textoDelBot);
  return /(?:asesor|vendedor)[^.?!\n]{0,60}(?:revis|confirm|ayud|contact|respond|valid|ingres)|le\s+(?:paso|pase|dejo)\s+con\s+(?:un|el)\s+asesor|le\s+aviso\s+(?:a|con)\s+(?:un|el)\s+asesor|dej[eo]\s+el\s+caso\s+con/.test(n);
}

export function ordenDeNotificarLoPrometido(): string {
  return (
    "OFRECISTE ASESOR Y NO LO NOTIFICASTE (fuente determinística): en esta conversación ya "
    + "ofreciste o prometiste que un asesor ayudaría, y notificar_vendedor no se ha ejecutado. Si el "
    + "caso del cliente sigue sin resolverse y no ha rechazado la ayuda, llama notificar_vendedor "
    + "AHORA, una sola vez, con un resumen accionable (medida pedida, qué falta, teléfono) — y dile "
    + "al cliente que ya quedó avisado. PROHIBIDO volver a ofrecer al asesor sin ejecutarlo."
  );
}

/**
 * Peticiones que el modelo débil deja pasar si nadie se las pone por delante.
 * Medidas el 31-ago en el nivel 2 del T115 (agente en gpt-5.4-mini):
 * - E01: «Quiero hablar con una persona» → cero herramientas, y encima el
 *   texto decía «ya le avisé» (mentira que ataja lo_prometido_se_ejecuta).
 * - Q06: «Mándame una cotización de 225/65R17» → mostró opciones y PREGUNTÓ
 *   «¿le cotizo?» a quien ya la había pedido.
 * - Q05: «solo dos» con cotización de 4 vigente → entendió el 2 y no recotizó.
 */
export function pidioHumanoExplicito(texto: string): boolean {
  const n = normalizar(texto);
  return /quiero\s+hablar\s+con\s+(?:una\s+persona|alguien|un\s+humano|un\s+asesor)|me\s+atienda?\s+una\s+persona|con\s+un\s+humano|p[aá]s[ae]me\s+con\s+(?:un[oa]?|el)\s+(?:asesor|persona|vendedor)|que\s+me\s+(?:llame|escriba|contacte)\s+(?:alguien|una\s+persona|un\s+asesor)/.test(n);
}

export function ordenDeNotificarHumano(): string {
  return (
    "SOLICITUD HUMANA EXPLÍCITA (fuente determinística): el cliente pidió hablar con una persona. "
    + "Llama notificar_vendedor EN ESTE TURNO con un resumen accionable de lo que necesita, y dile "
    + "que el aviso ya está hecho. PROHIBIDO seguir interrogando antes del aviso y PROHIBIDO decir "
    + "que avisaste sin haber llamado la herramienta."
  );
}

export function pidioCotizacionExplicita(texto: string): boolean {
  const n = normalizar(texto);
  return /(?:m[aá]nd[ae]me|env[ií][ae]me|p[aá]s[ae]me|h[aá]game|hazme|quiero|necesito|deme|dame)\s+(?:una?\s+|la\s+)?(?:cotizaci[oó]n|proforma)|cot[ií]za?me|me\s+cotiza[sr]?\b|una\s+proforma/.test(n);
}

export function ordenDeCotizarLoPedido(): string {
  return (
    "PEDIDO EXPLÍCITO DE COTIZACIÓN (fuente determinística): el cliente YA pidió la cotización con "
    + "todas sus letras. Búscala si hace falta y GENÉRALA con generar_cotizacion EN ESTE TURNO "
    + "(juego de 4 llantas si no dijo otra cantidad, sobre la recomendación válida). PROHIBIDO "
    + "preguntarle si la quiere: ya la pidió."
  );
}

export function ordenDeRecotizarCantidad(cantidad: number): string {
  return (
    `CANTIDAD NUEVA SOBRE COTIZACIÓN VIGENTE (fuente determinística): el cliente acaba de fijar la `
    + `cantidad en ${cantidad} y la cotización vigente tiene otra. REGENERA la cotización por `
    + `${cantidad} con generar_cotizacion en este turno, mismo producto, y entrégala. PROHIBIDO `
    + `dejar la cotización vieja como respuesta.`
  );
}

/**
 * «una rin 15 porf» (producción, 31-ago 13:21, Manuel probando en vivo): el
 * bot mandó la guía de medida y pidió la medida completa; el cliente tuvo que
 * repetir «una rin 15» para ver opciones. La política del corpus (P03) es la
 * contraria: el aro YA permite mostrar opciones; el uso se afina después.
 * Detector determinista del aro pedido — solo cuando NO viene una medida
 * completa en el mismo mensaje (ahí manda la medida).
 */
export function aroPedido(texto: string): number | null {
  const n = normalizar(texto);
  if (/\b\d{3}\s*[\/x-]\s*\d{2}\b|\b\d{3}\/\d{2}r\d{2}\b/.test(n)) return null; // trae medida completa
  const m = n.match(/\b(?:rin(?:es)?|aro(?:s)?|ring)\s*(1[2-9]|2[0-4])\b/);
  return m ? Number(m[1]) : null;
}

/**
 * EL CLIENTE CONTESTÓ EL MENÚ CON UN REPLY (producción, 31-ago 14:04).
 *
 * Manuel respondió «2» citando el mensaje que preguntaba la preferencia, y el
 * bot lo leyó como «quiero 2 llantas»: le mandó una llanta de otra medida en vez
 * de la opción equilibrada. Hasta hoy esto era una pista blanda del prompt
 * (`escalonesLine`) y el modelo podía irse por cualquier lado; el reply es un
 * hecho comprobable, así que la instrucción es dura como las demás.
 *
 * `escalon` viene de `respuestaDePreferencia`, que ya sabe que 1=costo,
 * 2=equilibrio, 3=premium — el mapeo no se reescribe acá para que no se
 * separen nunca.
 */
export function ordenDeResponderElEscalon(escalon: string): string {
  return (
    `RESPUESTA AL MENÚ DE PREFERENCIA, CONFIRMADA POR EL REPLY (fuente determinística): el `
    + `cliente citó con reply el mensaje donde le preguntaste qué prioriza, y eligió el escalón `
    + `«${escalon}». Entrega ESA opción de la última pieza de opciones —nombre y precio con IVA— y `
    + `ofrécele cotizarla. PROHIBIDO leer ese número como una CANTIDAD de llantas, PROHIBIDO buscar `
    + `otra medida o cambiar de llanta, y PROHIBIDO volver a preguntarle qué prefiere: ya contestó.`
  );
}

export function ordenDeMostrarPorAro(aro: number): string {
  return (
    `EL CLIENTE DIO EL ARO ${aro} (fuente determinística). Llama buscar_por_aro_y_tipo EN ESTE `
    + `TURNO y manda opciones reales con preparar_opciones — el aro ya alcanza para mostrar. El uso `
    + `o la medida exacta se afinan DESPUÉS de que vea algo. PROHIBIDO responder solo con la guía de `
    + `medida y PROHIBIDO pedir la medida completa sin haber mostrado opciones del aro.`
  );
}

/**
 * La última marca que el cliente PIDIÓ en esta visita — la restricción viva
 * que una cotización tiene que respetar, igual que la medida.
 *
 * Producción, 31-ago-2026 (conv 671): «necesito falken r17 265 70» → el bot
 * cotizó KENDA $961.32; «y de las falken?» + «coticeme 4 at» → el candado
 * anti-duplicado le repitió «su cotización sigue vigente por $961.32» — la de
 * la OTRA marca. El cliente detectó el precio incoherente; uno real se lleva
 * un número equivocado.
 *
 * La última mención manda (pedir Kenda después de Falken cambia el pedido), y
 * «cualquier marca» / «la que sea» / «no importa la marca» lo libera.
 */
export function ultimaMarcaPedida(textosCronologicos: readonly string[]): string | null {
  let marca: string | null = null;
  for (const texto of textosCronologicos) {
    const n = normalizar(texto ?? "");
    if (/cualquier\s+marca|la\s+que\s+sea|no\s+importa\s+la\s+marca|la\s+marca\s+no\s+importa|me\s+da\s+igual\s+la\s+marca/.test(n)) {
      marca = null;
      continue;
    }
    const pedida = marcaPreguntada(texto ?? "") ?? marcaElegidaASecas(texto ?? "");
    if (pedida) marca = pedida;
  }
  return marca;
}

/**
 * «las. winrun» — el cliente ELIGIÓ una de las opciones mostradas, nombrándola
 * a secas. Producción, 31-ago 23:59: tras la vitrina con Falken/Kenda/Winrun
 * escribió eso, y el bot le contestó el precio unitario y le preguntó «¿le
 * cotizo?» — a quien ya había elegido. Una elección vale más que una pregunta:
 * se cotiza en ese turno.
 *
 * Solo dispara cuando el mensaje ES la marca con relleno alrededor (artículos,
 * «mejor», «dame», puntuación). «mis winrun rozan» no es una elección.
 */
export function marcaElegidaASecas(texto: string): string | null {
  const n = normalizar(texto ?? "")
    .replace(/[.,!¡?¿]/g, " ")
    .replace(/\b(?:las?|los?|el|la|esa?s?|este?|mejor|dame|deme|quiero|prefiero|me\s+quedo\s+con|vamos\s+con|con|si|sí|dale|dele|pue|pues|entonces|de\s+una)\b/g, " ")
    .replace(/\s+/g, " ").trim();
  const marca = MARCAS_CONOCIDAS.find((m) => n === m);
  return marca ? marca.toUpperCase() : null;
}
