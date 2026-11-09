import { normalizeCatalogText } from "./catalog.js";

export interface ProductoIdentificable {
  code: string;
  brand: string;
  design: string;
}

export type MotivoFrenoGuardian = "precio_nuevo" | "producto_nuevo" | "juego_incompleto";

export interface ResultadoFrenoGuardian {
  texto: string;
  bloqueado: boolean;
  motivos: MotivoFrenoGuardian[];
}

function contieneFrase(textoNormalizado: string, frase: string): boolean {
  const termino = normalizeCatalogText(frase);
  return termino.length > 0 && ` ${textoNormalizado} `.includes(` ${termino} `);
}

/**
 * ¿Este producto del catálogo está nombrado en el texto?
 *
 * El diseño cuenta solo desde cuatro caracteres compactos: modelos como KR20
 * sí identifican una llanta; un diseño corto como «A/T» es lenguaje común y
 * marcarlo solo llenaría el candado de falsos positivos.
 */
export function mencionaProducto(texto: string, producto: ProductoIdentificable): boolean {
  const normalizado = normalizeCatalogText(texto);
  const diseno = normalizeCatalogText(producto.design);
  const codigo = normalizeCatalogText(producto.code);
  const compacto = (valor: string): string => valor.replace(/[^a-z0-9]/g, "");
  return contieneFrase(normalizado, `${producto.brand} ${producto.design}`)
    || (compacto(diseno).length >= 4 && contieneFrase(normalizado, diseno))
    || (compacto(codigo).length >= 4 && contieneFrase(normalizado, codigo));
}

function tienePrecio(texto: string): boolean {
  return /\$\s*\d+(?:[.,]\d{1,2})?|\b\d+[.,]\d{2}\s*(?:c\s*\/\s*u|con\s+iva|d[oó]lares?)\b/i.test(texto);
}

/** Los importes que nombra un texto, normalizados («$111.36», «111,36 c/u» → 111.36). */
function preciosEn(texto: string): Set<string> {
  const precios = new Set<string>();
  const patron = /\$\s*(\d+(?:[.,]\d{1,2})?)|\b(\d+[.,]\d{2})\s*(?:c\s*\/\s*u|con\s+iva|d[oó]lares?)\b/gi;
  for (const m of texto.matchAll(patron)) {
    const crudo = (m[1] ?? m[2] ?? "").replace(",", ".");
    if (crudo) precios.add(Number(crudo).toFixed(2));
  }
  return precios;
}

/**
 * Los importes que viajan como VALOR de un campo de dinero en un JSON:
 * `"precio_con_iva":143.53`, `"salePriceWithTax":181.71`, `"total":726.83`.
 *
 * Solo se usa para el «ya dicho», nunca para juzgar la corrección: acá un falso
 * positivo deja pasar una respuesta buena, y allá firmaría un precio inventado.
 * Por eso se exige el nombre del campo y no cualquier número suelto — una
 * medida (`"sizeLabel":"215/65R16"`) o una cantidad (`"quantity":4`) no son
 * dinero y no pueden colarse.
 */
function preciosDeCamposDeDinero(texto: string): Set<string> {
  const precios = new Set<string>();
  const patron = /"(?:[a-zA-Z_]*(?:precio|price|total|subtotal|monto|amount|iva|tax)[a-zA-Z_]*)"\s*:\s*"?(\d+(?:\.\d{1,2})?)"?/gi;
  for (const m of texto.matchAll(patron)) {
    const valor = Number(m[1]);
    if (Number.isFinite(valor) && valor > 0) precios.add(valor.toFixed(2));
  }
  return precios;
}

/**
 * LOS PRECIOS QUE EL CLIENTE YA TIENE A LA VISTA, CON LOS TOTALES DEL JUEGO.
 *
 * Familia 3 (auditoría del 19-oct): 43 correcciones del Guardián descartadas
 * por `precio_nuevo` en una semana. En el chat 27418 la lámina de ese mismo
 * turno ya estaba guardada con «KENDA KR605 $192.97», y el Guardián escribió
 * «$192.97 c/u con IVA · 4 = $771.88». El unitario lo reconocía; el TOTAL no
 * estaba en ninguna parte, y por él se tiró la corrección entera. El total del
 * juego es aritmética sobre un precio que el cliente está mirando, no una
 * venta nueva: cuenta como conocido de 1 a 10 llantas.
 */
const MAXIMO_DE_LLANTAS_EN_UN_TOTAL = 10;
function conTotalesDelJuego(unitarios: Iterable<string | number>): Set<string> {
  const conocidos = new Set<string>();
  for (const u of unitarios) {
    const centavos = Math.round(Number(u) * 100);
    if (!Number.isFinite(centavos) || centavos <= 0) continue;
    for (let n = 1; n <= MAXIMO_DE_LLANTAS_EN_UN_TOTAL; n++) conocidos.add(((centavos * n) / 100).toFixed(2));
  }
  return conocidos;
}

/** Lo ya dicho en texto, lo que viaja en campos de dinero y el hecho `preciosMostrados` de las piezas. */
function preciosConocidos(
  borrador: string,
  yaDichoEnElCiclo: string,
  preciosMostrados: readonly number[],
): Set<string> {
  return conTotalesDelJuego([
    ...preciosEn(`${borrador}\n${yaDichoEnElCiclo}`),
    ...preciosDeCamposDeDinero(yaDichoEnElCiclo),
    ...preciosMostrados,
  ]);
}

/**
 * LA FRASE QUE NIEGA O EXPLICA NO ES UNA OFERTA (auditoría 9-nov, 2d).
 *
 * «Hoy solo hay 1 unidad, así que no puedo ofrecerla para juego de 4» (39282,
 * dos veces) y «hoy aparecen 3 unidades y para juego de 4 no la manejo» (40097)
 * decían lo contrario de vender, y la regex de abajo las leía como «hay 1
 * unidad… ofrecer»: el candado restauraba el borrador que el propio Guardián
 * acababa de marcar como error.
 *
 * Dos reglas, y la segunda manda sobre la primera (revisión del sprint 2):
 *  1. Una PROPUESTA de venta en cualquier parte del texto («¿le cotizo las 3?»,
 *     «le cotizo esas 2», «¿le sirve?», «se las dejo», «le consigo la cuarta»)
 *     hace que «N llantas disponibles» siga siendo una oferta, diga lo que diga
 *     alrededor («no alcanzan para el juego, ¿le cotizo las 3?» es 11972).
 *  2. Sin propuesta, la cláusula (se parte en puntos, «;» y «pero/sino/aunque»)
 *     que trae «N llantas» no es oferta si la NEGACIÓN RIGE EL VERBO DE OFRECER:
 *     «no puedo ofrecerla», «no se la puedo cotizar», «no la manejo», «no hay
 *     juego». Un «no» cualquiera («no alcanzan», «no le puedo hacer descuento»)
 *     no cuenta.
 */
/**
 * Qué cuenta como PROPUESTA de venta (revisión del sprint 2, rondas 1 y 2): no
 * una lista cerrada de verbos —la próxima redacción del Guardián usa otro— sino
 * (a) cualquier PREGUNTA «¿…?», (b) «si desea/quiere/gusta… le vendo/cotizo/
 * dejo…» y (c) los verbos de venta sueltos. Se exceptúa la pregunta que vuelve
 * al menú («¿le cotizo la 1 o la 2?») o al juego completo («¿le cotizo el juego
 * de 4?»): esa no ofrece las 1–3 llantas, las descarta.
 */
const PREGUNTA_DE_MENU_O_JUEGO =
  /\bla\s+[1-9]\b|\bopci[oó]n\s+[1-9]\b|\bjuego\s+(?:completo|de\s+(?:[4-9]|cuatro))\b|\blas?\s+(?:4|cuatro)\b|\blos\s+(?:4|cuatro)\b|\bel\s+juego\b/i;
const VERBO_DE_PROPUESTA =
  /\b(?:le|se\s+la|se\s+las|se\s+lo|se\s+los|te)\s+(?:cotizo|sirve|dejo|consigo|armo|preparo|separo|reservo|vendo|aparto|ofrezco)\b|\b(?:cotizo|vendo|aparto)\s+(?:esas?|esos?|las|los|la|lo)\b|\bsi\s+(?:desea|quiere|gusta|prefiere|le\s+parece)\b[^.?!]{0,40}\b(?:cotizo|dejo|consigo|armo|vendo|ofrezco|aparto|esas?|esos?|las|los)\b/i;

/** Una pregunta: con «¿…?» o, sin apertura, la oración que termina en «?». */
const PREGUNTA = /¿[^?]*\?|[^.!?\n¿]*\?/g;

function hayPropuestaDeVenta(texto: string): boolean {
  // Las preguntas que vuelven al menú o al juego completo no son propuesta, ni
  // tampoco los verbos que van dentro de ellas.
  const sinPreguntasDeMenu = texto.replace(PREGUNTA, (pregunta) => (PREGUNTA_DE_MENU_O_JUEGO.test(pregunta) ? " " : pregunta));
  if (sinPreguntasDeMenu.includes("?")) return true;
  return VERBO_DE_PROPUESTA.test(sinPreguntasDeMenu);
}

const RECHAZO_DE_LA_OFERTA =
  /\bno\s+(?:(?:le|la|lo|se|les|las|los|me)\s+){0,2}(?:puedo|podemos|ofrezc\w*|ofrec\w*|cotiz\w*|vend\w*|manej\w*)\b|\bno\s+(?:hay|tengo|tenemos|queda\w*|existe\w*)\s+(?:el\s+|un\s+)?juego\b|\bsin\s+(?:el\s+)?juego\b/;

const OFERTA_DE_1_A_3 = [
  /\b(?:tengo|hay|quedan|cuento\s+con|disponible(?:s)?|ofrezco|ofrecer\w*|cotizo|cotizar\w*|vendo|vender\w*)\b.{0,64}\b[1-3]\s+(?:llantas?|unidad(?:es)?)\b/,
  /\b[1-3]\s+(?:llantas?|unidad(?:es)?)\b.{0,64}\b(?:disponible(?:s)?|ofrezco|ofrecer\w*|cotizo|cotizar\w*|vendo|vender\w*)\b/,
];

function ofreceJuegoIncompleto(texto: string): boolean {
  const hayPropuesta = hayPropuestaDeVenta(texto);
  return texto
    .split(/[.!?¿\n;]+|\b(?:pero|sino|aunque)\b/i)
    .some((clausula) => {
      const normalizada = normalizeCatalogText(clausula);
      if (!OFERTA_DE_1_A_3.some((patron) => patron.test(normalizada))) return false;
      return hayPropuesta || !RECHAZO_DE_LA_OFERTA.test(normalizada);
    });
}

/**
 * ÚLTIMO CANDADO DEL ÁNGEL GUARDIÁN: revisar no es vender.
 *
 * Conv 11986, 27-ago-2026: el borrador era un menú sin modelos ni precios y la
 * corrección inventó una vitrina, incluida FALKEN WILDPEAK M/T a $282.10.
 * Conv 11972, la misma noche: el borrador decía que no había stock vendible y
 * la corrección ofreció 1 KENDA KR20 a $82.42. El catálogo era un hecho duro
 * para AUDITAR; el guardián lo convirtió en permiso para vender por su cuenta.
 *
 * La rúbrica intenta prevenirlo, pero quien reescribe es una IA. Este candado
 * corre después: si la corrección agrega un precio donde no había ninguno, un
 * producto que el borrador no nombraba o una oferta parcial de 1–3 unidades,
 * gana el borrador original. No se intenta «arreglar la corrección»: eso sería
 * inventar una tercera redacción sobre dinero real.
 */
/**
 * LO QUE YA SALIÓ EN EL CICLO NO ES UN HECHO NUEVO (auditoría 2-6 sep, familia B).
 *
 * Este candado comparaba contra el BORRADOR y nada más. Pero la plantilla de
 * seguimiento nunca nombra la llanta, y un borrador vago del modelo tampoco:
 * cada vez que el guardián concretaba «la Falken ZE310R a $111.36 que le
 * mostré» —dato que el bot ya había dicho el día anterior (conv 15193)— el
 * candado lo leía como una venta nueva, tiraba la corrección y salía el
 * borrador malo. En 4,6 días fueron 105 bloqueos, 51 sobre seguimientos, y
 * detrás de la mitad de las re-preguntas y contradicciones que vieron los
 * clientes estaba este freno.
 *
 * `yaDichoEnElCiclo` es el texto de lo que el bot ya mandó en el ciclo (con las
 * piezas de opciones y sus precios). Un producto o un importe que aparece ahí
 * no abre nada: el cliente ya lo vio. Lo que no está ni en el borrador ni en
 * el ciclo sigue frenándose igual que antes.
 */
export function frenarHechosNuevosDelGuardian(
  borrador: string,
  correccion: string,
  productos: readonly ProductoIdentificable[],
  yaDichoEnElCiclo = "",
  /** El hecho que cada pieza guarda al salir: los unitarios que el cliente vio. */
  preciosMostrados: readonly number[] = [],
): ResultadoFrenoGuardian {
  if (correccion.trim() === borrador.trim()) {
    return { texto: correccion, bloqueado: false, motivos: [] };
  }

  const motivos: MotivoFrenoGuardian[] = [];
  if (!tienePrecio(borrador) && tienePrecio(correccion)) {
    // Lo YA DICHO se lee con manga ancha y la corrección con manga estrecha, a
    // propósito. En «ya dicho» entra el metadato de la imagen de opciones, donde
    // el precio viaja como `"precio_con_iva":143.53` — sin `$` y sin «c/u»—, así
    // que el extractor estricto no lo veía y el precio que el cliente está
    // MIRANDO en la lámina contaba como nuevo. Siete correcciones buenas se
    // perdieron por eso en la semana del 8 al 11-sep; lo que salió en su lugar
    // fue «Quedo atento a lo que necesite» (convs 18871, 5008, 17647, 18113,
    // 18262, 18342, 18348, 18893).
    //
    // Pasarse de ancho acá solo puede DEJAR PASAR una corrección legítima;
    // quedarse corto es lo que le dio al cliente la respuesta vacía.
    const conocidos = preciosConocidos(borrador, yaDichoEnElCiclo, preciosMostrados);
    const nuevos = [...preciosEn(correccion)].filter((p) => !conocidos.has(p));
    if (nuevos.length) motivos.push("precio_nuevo");
  }

  const productoNuevo = productos.some(
    (producto) =>
      mencionaProducto(correccion, producto)
      && !mencionaProducto(borrador, producto)
      && !(yaDichoEnElCiclo && mencionaProducto(yaDichoEnElCiclo, producto)),
  );
  if (productoNuevo) motivos.push("producto_nuevo");
  if (ofreceJuegoIncompleto(correccion)) motivos.push("juego_incompleto");

  return motivos.length
    ? { texto: borrador, bloqueado: true, motivos }
    : { texto: correccion, bloqueado: false, motivos: [] };
}

/**
 * CUANDO EL BORRADOR ES UN DATO FALSO, RESTAURARLO TAMBIÉN ES VENDER MAL.
 *
 * Auditoría 25-27 sep: tres veces el revisor marcó el borrador como
 * `medida_incorrecta` / `hecho_comercial_inventado` / `tipo_negado_con_stock`,
 * lo corrigió, y la corrección traía un producto o un precio nuevo; el candado
 * de arriba tiró la corrección ENTERA y el cliente recibió el borrador con el
 * error (conv 23080: «le entra la 215/60R17, ¿se la cotizo?» — el único dato
 * falso que llegó a un cliente en la ventana; conv 23489: llanta de turismo a
 * quien pidió todo terreno teniendo A/T en stock).
 *
 * Esta función se queda con la corrección pero le PODA las líneas que traen
 * los hechos nuevos (el producto o el precio que el borrador no nombraba y el
 * ciclo tampoco), y limpia lo que queda colgando: separadores seguidos, una
 * línea que terminaba en «:» anunciando la lista que se fue. Devuelve null si
 * después de podar no queda nada con sustancia: ahí el que llama decide.
 */
export function podarHechosNuevosDelGuardian(
  borrador: string,
  correccion: string,
  productos: readonly ProductoIdentificable[],
  yaDichoEnElCiclo = "",
  preciosMostrados: readonly number[] = [],
): string | null {
  const conocidos = preciosConocidos(borrador, yaDichoEnElCiclo, preciosMostrados);
  const nuevos = productos.filter(
    (p) => !mencionaProducto(borrador, p) && !(yaDichoEnElCiclo && mencionaProducto(yaDichoEnElCiclo, p)),
  );
  const traeHechoNuevo = (linea: string): boolean =>
    nuevos.some((p) => mencionaProducto(linea, p))
    || [...preciosEn(linea)].some((precio) => !conocidos.has(precio))
    || ofreceJuegoIncompleto(linea);

  const originales = correccion.split("\n");
  const podadas = new Set(originales.map((linea, i) => (traeHechoNuevo(linea) ? i : -1)).filter((i) => i >= 0));
  // Una línea que anunciaba lo podado («…sí tengo opción A/T en aro 16:») queda
  // colgando; se va con lo que anunciaba: si lo primero con texto que venía
  // después de ella fue podado, ella también.
  const sinAnuncios = originales.filter((linea, i) => {
    if (podadas.has(i)) return false;
    if (!/[:：]\s*$/.test(linea)) return true;
    const siguiente = originales.findIndex((l, j) => j > i && l.trim() !== "" && l.trim() !== "---");
    return siguiente < 0 || !podadas.has(siguiente);
  });
  const texto = sinAnuncios
    .join("\n")
    .replace(/(?:\n\s*---\s*)+\n\s*---\s*/g, "\n---")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*---\s*\n|\n\s*---\s*$/g, "")
    .trim();
  const conSustancia = texto.replace(/[^\p{L}\p{N}]/gu, "").length >= 20;
  if (!conSustancia) return null;
  if (frenarHechosNuevosDelGuardian(borrador, texto, productos, yaDichoEnElCiclo, preciosMostrados).bloqueado) return null;
  return texto;
}
