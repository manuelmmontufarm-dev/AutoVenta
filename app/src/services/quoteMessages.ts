import { business } from "../config.js";
import { fraseDeAhorro, type AhorroDeLaCotizacion } from "../domain/ahorro.js";
import { PREGUNTA_DE_LOCAL } from "../domain/storeSelection.js";
import type { CatalogItem } from "../domain/catalog.js";
import { getTirePatternProfile } from "../domain/tireKnowledge.js";

export interface CatalogQuoteSelection {
  product: CatalogItem;
  quantity: number;
}

export type CustomerMessageStyle = "comparison" | "customer";

/**
 * Separador de bloques. El agente y las tools lo emiten; index.ts lo convierte
 * en varios mensajes cortos seguidos, que es como escribe un vendedor humano.
 */
export const BLOCK_SEPARATOR = "\n\n---\n\n";

/** Tope de bloques por turno: más que esto se lee como spam. */
export const MAX_BLOCKS = 4;

/** Une bloques descartando los vacíos y respetando el tope. */
export function composeBlocks(...blocks: (string | null | undefined)[]): string {
  return blocks
    .map((block) => block?.trim() ?? "")
    .filter(Boolean)
    .slice(0, MAX_BLOCKS)
    .join(BLOCK_SEPARATOR);
}

/**
 * Parte una respuesta en los mensajes que se van a enviar.
 * Tolerante con el modelo: acepta 3 o más guiones y espacios alrededor.
 */
export function splitBlocks(reply: string): string[] {
  return reply
    .split(/\n\s*-{3,}\s*\n/)
    .map((block) => aWhatsApp(block.trim()))
    .filter(Boolean)
    .slice(0, MAX_BLOCKS);
}

/**
 * Negrita de Markdown → negrita de WhatsApp.
 *
 * El prompt pide `*texto*`, pero el modelo se escapa a `**texto**` cada tantos
 * mensajes y WhatsApp lo muestra con los asteriscos a la vista. Se corrige aquí
 * y no con más instrucciones: una regla determinista no falla el 3 % de las
 * veces. También cae `__texto__`, que WhatsApp tampoco entiende.
 */
export function aWhatsApp(texto: string): string {
  return texto
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/__([^_\n]+)__/g, "*$1*");
}

/* ------------------------------------------------------------------ *
 * Captions — la imagen ES el mensaje.
 *
 * La pieza visual ya lleva marca, diseño, medida, precio tachado, precio de
 * hoy, índice de carga, disponibilidad y garantías. Repetir todo eso en texto
 * es el muro que el cliente reportó que nadie lee. El caption solo aporta lo
 * que la imagen no puede.
 * ------------------------------------------------------------------ */

/**
 * Cierre de las opciones. Antes aquí iba un bloque «Yo iría por la X porque…»
 * ANTES de la imagen, y el turno cerraba con «¿Cuál le llama más la atención?».
 *
 * Joaquín lo mandó a quitar el 6-ago viendo la conversación real: con el
 * preámbulo, la imagen, el INCLUYE y la pregunta, la cadena se volvía tan larga
 * que «los mijines ya no leen» — y la recomendación, que es lo que más pesa, se
 * perdía en el muro. Ahora la recomendación no se adelanta: se OFRECE. El bot
 * la tiene lista (`recomendado` + `motivo` de preparar_opciones) y la da en una
 * frase solo si el cliente dice que sí, cuando ya está mirando la pieza.
 *
 * El 25-ago Joaquín pidió cambiar el ofrecimiento genérico («¿Necesita alguna
 * recomendación?») por la pregunta de PREFERENCIA: mejor precio / equilibrada /
 * premium. La pregunta abierta invitaba un «sí» que no decía nada; la de tres
 * escalones devuelve una respuesta con la que se cierra al siguiente turno.
 * El texto es el que JOAQUÍN mandó (reenviado el 25-ago por WhatsApp), casi
 * verbatim — solo se le quitó el «Buenos días» porque va pegado a la pieza,
 * no abriendo conversación. Menú numerado a propósito: invita a contestar
 * «1», «2» o «3», y `respuestaDePreferencia` entiende esas respuestas.
 */
const MENU_PREFERENCIA = [
  "Para afinarle la recomendación sobre las opciones que le envié, dígame una sola cosa: ¿qué prioriza usted?",
  "",
  "1) *Costo* — la más conveniente de precio",
  "2) *Equilibrio* — la que mejor balancea precio y rendimiento",
  "3) *Premium* — la de máxima calidad y durabilidad",
  "",
];

export const PREGUNTA_PREFERENCIA = [
  ...MENU_PREFERENCIA,
  "Con eso le dejo la opción exacta para su medida.",
].join("\n");

/**
 * El mismo menú, pero SIN prometer «su medida».
 *
 * El cierre de Joaquín termina en «la opción exacta para su medida» — perfecto
 * cuando las opciones son de su medida, y una contradicción cuando son
 * equivalentes. El guardián lo cazó el mismo día del deploy (26-ago, casos
 * 190/50R15 y 245/50R18): «el borrador cierra diciendo "la opción exacta para
 * su medida", pero la herramienta indica que no hay disponibilidad exacta».
 * Dos frases arriba el mensaje ya avisó que son equivalentes; prometer lo
 * contrario al pie lo desmiente. Con equivalentes se promete la mejor DE
 * ESTAS, que es lo que de verdad se puede cumplir.
 */
export const PREGUNTA_PREFERENCIA_EQUIVALENTES = [
  ...MENU_PREFERENCIA,
  "Con eso le digo cuál de estas le conviene más.",
].join("\n");

/**
 * El cierre del turno de opciones — la pregunta, o la recomendación ya dada.
 *
 * La regla de Joaquín (ofrecer y no adelantar) vale cuando el cliente todavía
 * no ha preguntado nada: ahí la cadena corta gana. Pero el informe del guardián
 * del 15-ago mostró el reverso — convs 6559, 6505, 6507 y 6525: el cliente
 * escribió «a cómo salen» o «cuál me recomienda», el bot mandó la pieza y
 * cerró preguntándole si necesitaba una recomendación. Ese turno no acorta
 * nada: le devuelve al cliente su propia pregunta, y es la categoría de
 * hallazgo más frecuente del guardián («ignora la pregunta», 16 en 7 días).
 *
 * Así que la recomendación se OFRECE por defecto y se ENTREGA cuando ya la
 * pidieron — explícitamente o pidiendo el precio, que es la misma decisión.
 *
 * Y se entrega CON PRECIO. La familia más grande del guardián (23 correcciones
 * en la semana del 14-ago) era esta: el cliente preguntó «a cómo», el turno
 * respondía la recomendación sin número, y el guardián tenía que reescribirla
 * con el precio que la herramienta ya había devuelto. La regla dura prohíbe la
 * LISTA numerada de precios, no responder un precio preguntado: un precio, el
 * de la recomendada, en la misma frase.
 */
export function buildCierreOpciones(input: {
  entregarRecomendacion: boolean;
  recomendacion: string;
  motivo: string;
  /** Precio unitario con IVA de la recomendada; null si no vino de la herramienta. */
  precioConIva?: number | null;
  /** Alguna opción NO es de la medida pedida: no se promete «su medida». */
  hayEquivalentes?: boolean;
}): string {
  if (!input.entregarRecomendacion) {
    return input.hayEquivalentes ? PREGUNTA_PREFERENCIA_EQUIVALENTES : PREGUNTA_PREFERENCIA;
  }
  const motivo = input.motivo.trim().replace(/[.\s]+$/, "");
  const precio = input.precioConIva ? ` — $${input.precioConIva.toFixed(2)} c/u con IVA` : "";
  return `Yo iría por la *${input.recomendacion}*${precio}: ${motivo}. ¿Se la cotizo por 4? 😊`;
}

/**
 * La pregunta por el día de la visita. Cierra los dos momentos en los que el
 * cliente ya tiene todo para decidir: cuando recibe la cotización y cuando ya
 * sabe a qué local ir.
 *
 * Por qué se pregunta la fecha y no solo "¿le interesa?": un "sí" no se puede
 * agendar ni recordar, un día sí. Es además el único dato que convierte la
 * última columna del kanban en una lista de trabajo — sin él, "Seguimiento
 * hasta venta" es un montón de tarjetas sin nada que hacer hoy.
 *
 * El motivo SIEMPRE es el descuento, y siempre es verdad: la cotización sale
 * con el precio rebajado y su número es lo que el local exige para respetarlo,
 * así que avisar al asesor es literalmente lo que hace que se lo apliquen. Lo
 * que cambia según el caso es CUÁL descuento — el extra autorizado por un
 * asesor cuando existe, el de la propia cotización cuando no. Lo que sigue
 * prohibido es inventar un descuento extra que nadie autorizó.
 */
export function buildVisitDayQuestion(conDescuentoAutorizado: boolean, conCotizacion = true): string {
  if (conDescuentoAutorizado) {
    return "¿Qué día podría pasar? Le aviso al asesor y le dejo anotado su descuento extra para que se lo respeten apenas llegue. 📅";
  }
  // Sin cotización no hay «número de cotización» ni descuento que prometer:
  // el guardián corrigió exactamente esa promesa vacía (numero_venta: null).
  return conCotizacion
    ? "¿Qué día podría pasar? Le aviso al asesor con su número de cotización para que le apliquen el descuento cuando llegue. 📅"
    : "¿Qué día podría pasar? Le aviso al asesor para que le atienda apenas llegue. 📅";
}

/**
 * Los dos datos que cierran la cotización: qué día viene y a cuál local.
 *
 * Van juntos y en una sola pregunta porque son la misma decisión del cliente y
 * porque el asesor no puede hacer nada con uno solo: una fecha sin local no se
 * le puede avisar a nadie, y un local sin fecha no entra en la agenda de nadie.
 * Después de mandar la cotización, conseguir estos dos datos ES el objetivo del
 * bot — no un cierre de cortesía.
 *
 * Y la pregunta viaja con los mapas pegados (Joaquín, 25-ago). Preguntarle a
 * alguien «¿Cumbayá o Quito Sur?» sin decirle dónde queda cada uno es pedirle
 * que elija a ciegas: el propio Manuel recibió esta pregunta pelada y tuvo que
 * pedir la ubicación aparte. Los links van DESPUÉS de la pregunta y en el MISMO
 * bloque, no como mensaje suelto, por dos razones: se lee «te pregunto esto,
 * aquí están las dos opciones», y el mensaje que queda como último saliente
 * contiene a la vez la pregunta por el día y los dos nombres de local — que es
 * lo que `preguntamosElDia` y `preguntamosElLocal` necesitan ver para entender
 * un «al sur por favor el viernes» en el turno siguiente.
 */
export function buildVisitPlanQuestion(input: {
  conDescuentoAutorizado: boolean;
  locales: readonly string[];
  /**
   * Local ya registrado en la conversación (nearest_store). Cuando existe, la
   * pregunta es SOLO por el día: volver a ofrecer «¿Cumbayá o Quito Sur?» a
   * quien ya eligió es la re-pregunta que el Ángel Guardián corrigió 4 veces
   * el 15-ago (convs 6275 y 6375) — y este texto salía fijo de aquí, no del
   * modelo, así que se arregla aquí.
   */
  localElegido?: string | null;
  /**
   * ¿Hay una cotización viva? El motivo que damos es el descuento de esa
   * cotización, así que sin cotización esa frase promete algo que no existe:
   * quien pregunta la ubicación antes de cotizar recibe la pregunta pelada.
   */
  conCotizacion?: boolean;
  /**
   * Apágalo cuando quien llama ya compuso el bloque de mapas por su cuenta
   * (`ubicacion_locales` los pone arriba, porque ahí el mapa ES la respuesta).
   * Nadie más debería apagarlo: sin links la pregunta vuelve a ser la de antes.
   */
  enlaces?: boolean;
  /**
   * El ahorro de la cotización viva. Cuando está, el motivo deja de ser «le
   * aplican el descuento» —abstracto— y pasa a ser la cifra: «*25 %* de
   * descuento, *$277.44* menos». Pedido por Joaquín el 26-ago: el número de
   * plata es lo que hace que contesten. Ver `domain/ahorro.ts`.
   */
  ahorro?: AhorroDeLaCotizacion | null;
}): string {
  const motivo = input.conDescuentoAutorizado
    ? " Con ese dato le aviso al asesor y le dejo anotado su descuento extra para que se lo respeten apenas llegue."
    : input.conCotizacion === false
      ? " Con ese dato le aviso al asesor para que le atienda apenas llegue."
      : input.ahorro
        ? ` Con ese dato le aviso al asesor y le dejan lista su cotización con ${fraseDeAhorro(input.ahorro)}.`
        : " Con ese dato le aviso al asesor y le aplican el descuento de su cotización apenas llegue.";
  // Con local elegido va SOLO su mapa: el otro link es ruido y reabre una
  // decisión ya tomada. Sin local elegido van los dos, que es la pregunta.
  const mapas = input.enlaces === false
    ? ""
    : buildStoreLinksBlock(input.localElegido, { soloDestacado: Boolean(input.localElegido) });
  const conMapas = (pregunta: string) => (mapas ? `${pregunta}\n${mapas}` : pregunta);
  if (input.localElegido) {
    return conMapas(`¿Qué día cree que puede pasar por *${input.localElegido}*?${motivo} 📅`);
  }
  const opciones = input.locales.length
    ? ` ¿${input.locales.slice(0, 2).join(" o ")}?`
    : "";
  return conMapas(
    `¿Qué día puede pasar y a cuál local?${opciones}${motivo.replace(" Con ese dato ", " Con esos dos datos ")} 📅`,
  );
}

/**
 * El cierre de la cotización, en DOS mensajes en vez de uno.
 *
 * Joaquín, 26-ago-2026, dictando el orden que quiere: «foto; mensaje corto con
 * las dos ubicaciones que igual diga sin compromiso en algún lado; y otro
 * mensaje diciendo a cuál de las dos le queda mejor ir».
 *
 * El motivo es de venta y no de estética: metida dentro del bloque de los dos
 * links, la pregunta se lee como pie de página de dos URLs y el cliente la
 * saltea. Sola, en un mensaje de una línea, es lo último que le queda en
 * pantalla — y es una pregunta de dos opciones, la más fácil de contestar que
 * tiene el bot.
 *
 * El día NO se pregunta acá a propósito: se pregunta cuando ya eligió local,
 * junto con la cifra del descuento (ver `buildVisitPlanQuestion`). Dos datos en
 * un mismo mensaje era lo que hacía que contestaran uno solo.
 */
export function buildStoreChoiceBlocks(): { ubicaciones: string; pregunta: string } {
  const mapas = buildStoreLinksBlock();
  return {
    ubicaciones: [
      "Puede pasar sin compromiso a verlas y probarlas en su vehículo.",
      mapas,
    ].filter(Boolean).join("\n"),
    pregunta: `${PREGUNTA_DE_LOCAL} 📍`,
  };
}

/**
 * Los mapas de los locales: una línea por local, nombre y link. Nada más.
 *
 * La dirección escrita salió de aquí el 18-ago. El reclamo de Manuel fue exacto
 * —«están muy repetitivas las ubicaciones, solo con poner los links nos
 * ahorramos los parrafotes»—: una calle y una referencia no le dicen a nadie
 * cómo llegar, y repetidas dos veces por local convierten el cierre en un muro
 * de texto. El link de Maps hace las dos cosas que la dirección no hace: abre
 * la ruta y se ve de un vistazo.
 *
 * El 18-ago se decidió mandarlos al CONFIRMAR la ubicación y nunca al
 * preguntarla —«un link dentro de una pregunta es ruido»—. Joaquín revirtió esa
 * regla el 25-ago viendo los chats: «la gente se queda sin ubicación porque el
 * bot espera el pin; que cuando diga los lugares, mande los links de una». Y le
 * pasó al propio Manuel, que recibió «¿qué día puede pasar y cuál local?» sin
 * un solo mapa. El link no es el ruido: PREGUNTAR a cuál local va sin decirle
 * dónde quedan es lo que deja al cliente sin poder contestar.
 *
 * Así que ahora la pregunta por el local los lleva pegados (ver
 * `buildVisitPlanQuestion`). Dos líneas, una por local, siguen sin ser un muro
 * de texto — lo que era muro eran las calles escritas, y esas no volvieron.
 *
 * Si se pasa `destacado`, ese local va primero. Con `soloDestacado` va SOLO ese:
 * cuando el cliente ya eligió local o preguntó por uno, el otro link es ruido.
 */
export function buildStoreLinksBlock(
  destacado?: string | null,
  opciones?: { soloDestacado?: boolean },
): string {
  const conMapa = business.stores.filter((store) => Boolean(store.mapsUrl));
  if (!conMapa.length) return "";
  // El nombre llega completo desde la base («Depot Tire Quito Sur»), pero
  // también abreviado desde quien solo tiene «Cumbayá» a mano. Un `soloDestacado`
  // que no calza devolvía los DOS links contradiciendo al texto que lo acompaña.
  const elegido = destacado
    ? conMapa.find((store) => store.name === destacado) ?? conMapa.find((store) => store.name.includes(destacado))
    : undefined;
  const mostrados = !elegido
    ? conMapa
    : opciones?.soloDestacado
      ? [elegido]
      : [elegido, ...conMapa.filter((store) => store !== elegido)];
  return mostrados.map((store) => `📍 *${store.name}*: ${store.mapsUrl}`).join("\n");
}

/** Cotización: número, total y vigencia. El desglose ya está en la imagen. */
/**
 * El texto que acompaña a la cotización — y con la foto enviada, NINGUNO.
 *
 * Hasta el 26-ago este turno mandaba la imagen y debajo un resumen en palabras
 * («1 × FALKEN WILDPEAK A/T 4W: $221.77»). Joaquín, viendo el chat de Andrés
 * Tamayo: «quiero reducir la cantidad de texto… ese mensaje que ya no haya y
 * sea más por las fotos». Tiene razón por partida doble: el resumen no agrega
 * nada que la pieza no muestre mejor, y —al repetir cifras y número de
 * cotización— es la superficie donde el bot se contradice consigo mismo. En ese
 * chat esa línea fue justo el borrador que el guardián tuvo que corregir tres
 * veces.
 *
 * Cuando la foto NO salió sigue yendo el detalle completo: ahí el texto es lo
 * único que le queda al cliente y quedarse sin cotización es peor que leer de
 * más (fallo del demo del 20-jul).
 */
export function textoDeLaCotizacion(
  soloLaFoto: boolean,
  selection: CatalogQuoteSelection,
  customerName = "",
  offerDiscount?: { amount: number; finalTotal: number; condition: string; expiresAt?: Date | null },
  firmados?: PreciosFirmados,
): string | null {
  return soloLaFoto
    ? null
    : buildSingleQuoteMessageDetallado(selection, customerName, offerDiscount, firmados);
}

/** Comparativa: una línea por modelo con la diferencia práctica, no la ficha. */
export function buildComparisonCaption(products: readonly CatalogItem[]): string {
  return [
    "Le dejo la comparativa 👆",
    "",
    ...products.map((product) => {
      const profile = getTirePatternProfile(product.brand, product.design);
      return `${brandEmoji(product.brand)} *${product.brand} ${product.design}* — ${
        profile ? profile.category : "ver ficha"
      } · ${money(product.minimumPriceWithTax)} c/u`;
    }),
  ].join("\n");
}

export function buildComparisonMessageDetallado(products: readonly CatalogItem[]): string {
  const lines = products.flatMap((product) => [
    `🔹 ${product.brand} ${product.design} — ${product.sizeLabel ?? product.name}`,
    `   💰 ${money(product.minimumPriceWithTax)} (antes ${money(product.customerPriceWithTax)}, −${discount(product)}%)`,
    ...(specLine(product) ? [`   📦 ${specLine(product)}`] : []),
    `   ⭐ ${warrantyForBrand(product.brand).factory}`,
    ...(warrantyForBrand(product.brand).roadHazard
      ? [`   🔒 ${warrantyForBrand(product.brand).roadHazard}`]
      : []),
    "",
  ]);
  return [
    `Comparativa de Llantas — ${dateLabel()}`,
    "",
    ...lines,
    "Precios por unidad incluyen IVA y Ecovalor.",
  ]
    .join("\n")
    .trim();
}

/**
 * Muro completo de opciones. Ya NO es el camino normal: solo se usa cuando la
 * imagen no salió, para que el cliente nunca se quede sin la información.
 */
export function buildCustomerOptionsMessageDetallado(
  products: readonly CatalogItem[],
  _customerName = "",
): string {
  const groups = new Map<string, CatalogItem[]>();
  for (const product of products) {
    const current = groups.get(product.brand) ?? [];
    current.push(product);
    groups.set(product.brand, current);
  }
  // Esta pieza normalmente se envía a mitad de una conversación activa.
  // No reinicia el saludo ni repite el nombre del cliente.
  const lines: string[] = ["Opciones disponibles:", ""];
  for (const [brand, brandProducts] of groups) {
    lines.push(`${brandEmoji(brand)} ${brand.toUpperCase()}`);
    for (const product of brandProducts) {
      const warranty = warrantyForBrand(product.brand);
      lines.push(
        `• ${product.design} — ${money(product.customerPriceWithTax)} → ${money(product.minimumPriceWithTax)}`,
        `  ${availabilityLine(product)}`,
        ...(specLine(product) ? [`  📦 ${specLine(product)}`] : []),
        `  ⭐ ${warranty.factory}`,
        ...(warranty.roadHazard ? [`  🔒 ${warranty.roadHazard}`] : []),
      );
    }
    lines.push("");
  }
  lines.push("Precios por unidad incluyen IVA y Ecovalor.", "Confirma vigencia y stock al momento de comprar.");
  return lines.join("\n").trim();
}

export function buildDistributorOptionsMessage(
  products: readonly CatalogItem[],
): string {
  const lines = products.flatMap((product) => {
    const stock =
      product.availability === "available"
        ? `Disponible (${Math.floor(product.stock)})`
        : product.availability === "check"
          ? `Consultar (${Math.floor(product.stock)})`
          : "Agotada";
    return [
      `🔹 ${product.brand} ${product.design} — ${product.sizeLabel ?? product.name}`,
      `   Cliente ${money(product.minimumPriceWithTax)} · PVP ${money(product.customerPriceWithTax)}`,
      `   🔒 Distribuidor ${money(product.distributorPriceWithTax)}`,
      `   📦 ${stock}${specLine(product) ? ` · ${specLine(product)}` : ""}`,
      "",
    ];
  });
  return [
    `Opciones para distribuidor — ${dateLabel()}`,
    "",
    ...lines,
    "Valores incluyen IVA. Confirma stock antes de cerrar el pedido.",
  ]
    .join("\n")
    .trim();
}

/** Cotización completa en texto. Respaldo para cuando la imagen y el PDF fallan. */
/**
 * El respaldo en texto cuando la pieza no salió.
 *
 * Sin número de cotización ni número de venta desde el 26-ago (Joaquín):
 * «número de cotización más código de descuento ya demasiadas vainas… lo
 * dejaría solo con el código de descuento del 2 %». El cliente no llega al
 * local recitando un COT-MTACN72K; llega con el cupón, que sí es corto y sí se
 * dicta en caja. Los números siguen vivos donde hacen falta: en la pieza, en el
 * aviso al asesor y en la base.
 */
export function buildSingleQuoteMessageDetallado(
  selection: CatalogQuoteSelection,
  customerName = "",
  offerDiscount?: { amount: number; finalTotal: number; condition: string; expiresAt?: Date | null },
  firmados?: PreciosFirmados,
): string {
  const { product, quantity } = selection;
  const warranty = warrantyForBrand(product.brand);
  const hoy = firmados?.unitarioConIva ?? product.minimumPriceWithTax;
  const lista = firmados?.listaConIva ?? product.customerPriceWithTax;
  const rebaja = firmados ? porcentaje(lista, hoy) : discount(product);
  const total = offerDiscount?.finalTotal ?? firmados?.total ?? product.minimumPriceWithTax * quantity;
  return [
    `📄 Cotización — ${dateLabel()}`,
    `${brandEmoji(product.brand)} ${product.brand} ${product.design} — ${product.sizeLabel ?? product.name}`,
    `💰 ${money(hoy)} c/u (antes ${money(lista)}, −${rebaja}%)`,
    `🛞 ${quantity} llanta${quantity === 1 ? "" : "s"}: ${money(total)}`,
    ...(offerDiscount ? [
      `1️⃣ Descuento base Depot Tire: de ${money(lista)} a ${money(hoy)} c/u (−${rebaja}%).`,
      `2️⃣ Descuento EXTRA del asesor: −${money(offerDiscount.amount)}.`,
      `⚠️ Este segundo descuento aplica ÚNICAMENTE si: ${offerDiscount.condition}.`,
      `💰 Total final cumpliendo la condición: ${money(total)}. Si no la cumple, conserva solo el precio base.`,
    ] : []),
    ...(specLine(product) ? [`📦 ${specLine(product)}`] : []),
    availabilityLine(product),
    `⭐ ${warranty.factory}`,
    ...(warranty.roadHazard ? [`🔒 ${warranty.roadHazard}`] : []),
    "",
    offerDiscount?.expiresAt
      ? `Precio incluye IVA y Ecovalor. Oferta vigente hasta ${offerDiscount.expiresAt.toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}.`
      : "Precio incluye IVA y Ecovalor. Vigencia por confirmar con el asesor.",
    // Aquí NO va ninguna pregunta por la ubicación: este bloque sale en el mismo
    // turno que buildVisitPlanQuestion, que ya pregunta el día y el local. Tener
    // las dos era lo que hacía que el bot enumerara los locales y acto seguido
    // preguntara dónde vive el cliente.
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** Compatibilidad temporal con consumidores anteriores. */
export function buildCustomerQuoteMessage(
  selections: readonly CatalogQuoteSelection[],
  customerName = "",
): string {
  return selections.length === 1
    ? buildSingleQuoteMessageDetallado(selections[0], customerName)
    : buildCustomerOptionsMessageDetallado(
        selections.map(({ product }) => product),
        customerName,
      );
}

export function warrantyForBrand(brand: string): {
  factory: string;
  roadHazard: string | null;
  roadHazardMonths: number | null;
} {
  const normalized = brand.toLowerCase();
  const roadHazardMonths = normalized.includes("falken")
    ? 18
    : normalized.includes("kenda")
      ? 12
      : normalized.includes("winrun")
        ? 6
        : null;
  return {
    factory: "5 años garantía de fábrica contra defectos de fabricación",
    roadHazard: roadHazardMonths
      ? `${roadHazardMonths} meses contra golpes y estalladuras`
      : null,
    roadHazardMonths,
  };
}

function specLine(product: CatalogItem): string | null {
  if (!product.loadSpeed) return null;
  const details = [
    product.loadSpeed.loadKg ? `${product.loadSpeed.loadKg}kg` : null,
    product.loadSpeed.speedKmh ? `${product.loadSpeed.speedKmh}km/h` : null,
  ].filter(Boolean);
  return details.length
    ? `${product.loadSpeed.code} (${details.join(" · ")})`
    : product.loadSpeed.code;
}

function availabilityLine(product: CatalogItem): string {
  return product.availability === "available"
    ? "✅ Disponible"
    : product.availability === "check"
      ? "⚠️ Consultar disponibilidad"
      : "⛔ Agotada";
}

function discount(product: CatalogItem): number {
  if (product.customerPriceWithTax <= 0) return 0;
  return Math.round(
    (1 - product.minimumPriceWithTax / product.customerPriceWithTax) * 100,
  );
}

/**
 * Los números QUE FIRMA la cotización, para que el texto del chat no los
 * recalcule por su cuenta (16-ago).
 *
 * `generar_cotizacion` confirma el precio contra el Interbot en el momento
 * (`refreshPriceForSize` + `getInterbotPrice`) y con ESE número construye la
 * cotización y la imagen. Pero el texto que se le manda al cliente se armaba
 * con `product.minimumPriceWithTax`, que es la foto del catálogo en memoria y
 * solo se actualiza en el barrido completo. Resultado: el total que el cliente
 * leía en el chat podía no ser el de la cotización que presenta en la tienda.
 * Y aun coincidiendo el precio, los dos caminos redondeaban distinto y ~13 %
 * de las combinaciones daban un centavo de diferencia.
 *
 * Cuando viene esto, manda esto. Es opcional para no romper a los llamadores
 * que solo tienen el catálogo a mano.
 */
export interface PreciosFirmados {
  /** Unitario con IVA, el mismo que imprime la pieza. */
  unitarioConIva: number;
  /** Precio anterior con IVA (el tachado). */
  listaConIva: number;
  /** Total con IVA de la cotización, ya por la cantidad. */
  total: number;
}

function porcentaje(listaConIva: number, hoyConIva: number): number {
  if (listaConIva <= 0 || hoyConIva >= listaConIva) return 0;
  return Math.round((1 - hoyConIva / listaConIva) * 100);
}

function brandEmoji(brand: string): string {
  const normalized = brand.toLowerCase();
  if (normalized.includes("falken")) return "🔵";
  if (normalized.includes("kenda")) return "🔴";
  if (normalized.includes("winrun")) return "🟢";
  return "⚫";
}

function dateLabel(): string {
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Guayaquil",
  }).format(new Date());
}

/**
 * $600.96, con punto decimal — el MISMO formato que la pieza renderizada
 * (depotPosters) y que los totales que las herramientas devuelven al modelo.
 *
 * Antes esto formateaba con locale es-EC, que escribe «$600,96»: el caption
 * contradecía a la propia imagen y a los datos duros de la cotización, y el
 * Ángel Guardián lo corrigió 4 veces en 2 días como precio_incorrecto ALTA.
 * Un solo formato canónico en todo el stack elimina la categoría de raíz.
 */
function money(value: number): string {
  return `$${value.toFixed(2)}`;
}
