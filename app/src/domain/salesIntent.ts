/** Guardas deterministas del flujo: el LLM no puede saltárselas. */

export function isComparisonRequest(text: string): boolean {
  const normalized = normalize(text);
  return /\b(compar|diferencia|cual es mejor|cu[aá]l conviene|mejor entre)\w*/.test(normalized);
}

/**
 * «Ya compré» EN OTRO LADO no es una venta ganada, es una perdida.
 *
 * Cazado el 27-ago escribiendo la prueba del cierre: «ya compre en otro lado»
 * caía en el patrón de «ya compré» y la conversación se marcaba **ganado**.
 * Es el peor error posible de los dos: un cliente que se fue a la competencia
 * entrando al conteo de ventas del negocio, y encima cerrando la conversación.
 */
const EN_OTRO_LADO = /\b(?:en|con|a)\s+(?:otro|otra)\s+(?:lado|lugar|parte|tienda|llantera|local|sitio)\b|\bcon\s+otros?\b|\ben\s+otro\s+lado\b/;

export function isExplicitPurchaseConfirmation(text: string): boolean {
  const normalized = normalize(text);
  if (EN_OTRO_LADO.test(normalized)) return false;
  return /\b(ya (?:las? )?compr[eé]|acabo de comprar|ya pagu[eé]|compra (?:hecha|realizada)|pago realizado)\b/.test(
    normalized,
  );
}

/**
 * Negativa clara = lo ÚNICO que frena la cotización cuando el bot ya preguntó.
 * Regla de venta (6-ago): si no es un NO, es un sí. Rodrigo dijo «Si», «Pero
 * quiero cambiar las 5» y «La de emergencia también» y el bot le pidió
 * confirmar CUATRO veces porque buscaba un sí con formato de máquina.
 */
export function isNegativeResponse(text: string): boolean {
  const normalized = normalize(text);
  return /\b(?:no(?:\s+gracias)?|todavia no|aun no|ahorita no|por ahora no|mejor no|dejeme pensar(?:lo)?|dejame pensar(?:lo)?|lo pienso|voy a pensar|solo (?:estoy )?pregunt\w*|solo (?:era|es) (?:una )?consulta|despues le aviso|luego le aviso|mas tarde le aviso|otro dia|cancel\w*)\b/.test(
    normalized,
  ) && !/\bno\s+(?:hay\s+)?problema\b/.test(normalized);
}

/**
 * El cliente preguntó por plata. Existe porque el turno de `preparar_opciones`
 * cerraba SIEMPRE con «¿Necesita alguna recomendación?», también cuando lo que
 * el cliente acababa de escribir era «¿a cómo la Kenda?» — el guardián lo marcó
 * como «ignora la pregunta» en las convs 6559, 6505, 6507 y 6525 del 15-ago.
 * Devolver una pregunta por respuesta a una pregunta es lo que hace que el
 * cliente deje de contestar.
 */
export function pidePrecio(text: string): boolean {
  const normalized = normalize(text);
  // `coti[cz]` cubre la conjugación entera sin listarla: cotizar, cotización,
  // cotizo y el «cotíceme» que escribe medio Quito.
  // «costo», «en/por cuánto sale» y «de qué precio» salieron del informe del
  // guardián (14-ago): preguntas de precio reales que este detector no veía,
  // y el turno respondía beneficios en vez del número.
  return /\b(?:precios?|valor|costos?|presupuesto|coti[cz]\w*)\b|\ba\s+como\b|\b(?:en|por)\s+cuanto\b|\bcuanto\s+(?:sale|cuesta|vale|esta|seria|me\s+(?:sale|cuesta|queda))\b|\bque\s+precio\b/.test(
    normalized,
  );
}

/**
 * El cliente pidió que le recomienden. Misma historia: si él ya preguntó cuál
 * le conviene, ofrecerle una recomendación es repetirle la pregunta.
 */
export function pideRecomendacion(text: string): boolean {
  const normalized = normalize(text);
  return /\brecomien\w*|\brecomend\w*|\baconsej\w*|\bsugier\w*|\bcual\s+(?:es\s+(?:la\s+)?mejor|me\s+conviene|seria\s+(?:la\s+)?mejor|me\s+llevo|escojo|elijo)\b|\bque\s+me\s+conviene\b/.test(
    normalized,
  );
}

/**
 * Los tres escalones que ofrece el cierre nuevo de opciones (reunión con
 * Joaquín, 25-ago): «¿busca el mejor precio, algo equilibrado o lo premium?».
 * Este detector lee la RESPUESTA a esa pregunta, con las variantes reales de
 * WhatsApp («la más barata», «la del medio», «la mejor») y sus faltas («la mas
 * varata»). Null = el mensaje no es una respuesta de preferencia.
 *
 * El orden de los chequeos importa: «algo equilibrado entre precio y calidad»
 * contiene la palabra «precio», así que equilibrada se evalúa primero.
 */
export type Preferencia = "precio" | "equilibrada" | "premium";

export function respuestaDePreferencia(text: string): Preferencia | null {
  const normalized = normalize(text);
  // El menú de Joaquín es numerado (1 Costo / 2 Equilibrio / 3 Premium), así
  // que la respuesta más natural es el puro número. Solo cuenta si el mensaje
  // ES el número: un «1» suelto dentro de otra frase suele ser cantidad.
  const porNumero = normalized.match(/^(?:la\s+|el\s+|opcion\s+)?([123])\)?\.?$/);
  if (porNumero) return porNumero[1] === "1" ? "precio" : porNumero[1] === "2" ? "equilibrada" : "premium";
  if (/\bequilibr\w+\b|\bintermedi\w+\b|\bla\s+del?\s+(?:en\s+)?medio\b|\bla\s+mediana\b|\bbalancead\w+\b/.test(normalized)) {
    return "equilibrada";
  }
  // `[bv]arat` cubre «barata» y la falta real «varata»; «economica» llega sin
  // tilde porque normalize() ya la quitó. «costo» solo como respuesta seca:
  // dentro de una frase («costo de 4 llantas») es un pedido de precio, no la
  // elección del escalón 1.
  if (/\bmejor\s+precio\b|\b(?:la\s+)?mas\s+[bv]arat\w*\b|\b[bv]arat\w+\b|\beconomic\w+\b|^(?:el\s+|por\s+)?precio$|^(?:el\s+|la\s+de\s+)?costo$/.test(normalized)) {
    return "precio";
  }
  if (/\bpremium\b|\bla\s+mejor\b|\bmejor\s+calidad\b|\bmaxima\s+calidad\b|\bdurabilidad\b|\bmas\s+durad\w+\b|\bla\s+(?:mas\s+)?top\b|\bla\s+mas\s+cara\b|\bla\s+buena\b/.test(normalized)) {
    return "premium";
  }
  return null;
}

/**
 * El cliente ya contó PARA QUÉ quiere la llanta. Con el uso dicho, cerrar con
 * la pregunta de preferencia es ignorarlo: la recomendación se entrega con su
 * motivo (familia 2 del guardián, ~10 casos del 21–25 ago). Cubre los usos que
 * aparecen en los chats reales: carretera, ciudad, viajes, trabajo, carga,
 * ripio, barro, campo, y las fórmulas «uso mixto» / «todo terreno».
 */
export function describeUso(text: string): boolean {
  const normalized = normalize(text);
  return /\bpara\s+(?:la\s+|el\s+)?(?:carretera|ciudad|viaj\w+|trabaj\w+|carga|ripio|barro|lastre|montana|obra|campo|tierra|asfalto|finca|playa|costa|oriente|sierra)\b|\buso\s+(?:mixto|urbano|rudo|diario|pesado)\b|\btodo\s+terreno\b|\bdoble\s+proposito\b/.test(
    normalized,
  );
}

/**
 * Los escalones de la pieza de opciones, mapeados por PRECIO sobre lo que el
 * cliente tiene en pantalla: la más cara es la premium, la más barata la
 * económica, la del medio la equilibrada. Se mapea por precio y no por la
 * escalera de marcas porque la respuesta del cliente («la más barata») se
 * refiere a lo que está VIENDO, no al posicionamiento comercial de la marca.
 *
 * Con dos opciones no hay «del medio» (equilibrada = null); con UNA, las tres
 * apuntan a la misma — cualquier preferencia entrega la única que hay, que es
 * mejor que responderle que ese escalón no existe.
 */
export interface OpcionDeEscalon {
  codigo: string;
  nombre: string;
  precio_con_iva: number;
}

export interface Escalones {
  premium: OpcionDeEscalon | null;
  equilibrada: OpcionDeEscalon | null;
  economica: OpcionDeEscalon | null;
}

export function escalonesDeOpciones(opciones: readonly OpcionDeEscalon[]): Escalones {
  if (!opciones.length) return { premium: null, equilibrada: null, economica: null };
  const porPrecio = [...opciones].sort((a, b) => b.precio_con_iva - a.precio_con_iva);
  if (porPrecio.length === 1) {
    return { premium: porPrecio[0], equilibrada: porPrecio[0], economica: porPrecio[0] };
  }
  return {
    premium: porPrecio[0],
    equilibrada: porPrecio.length >= 3 ? porPrecio[1] : null,
    economica: porPrecio[porPrecio.length - 1],
  };
}

export function hasExplicitQuantity(text: string): boolean {
  return extractExplicitQuantity(text) !== null;
}

/**
 * El texto con el que el cierre de opciones pregunta la preferencia. Vive acá
 * para que quien lo escribe y quien lo reconoce no se separen nunca.
 */
export const MARCA_DEL_MENU = "¿qué prioriza usted?";

/**
 * ¿Ese «2» es el escalón del menú, o son dos llantas?
 *
 * El cierre de opciones pregunta «1) Costo / 2) Equilibrio / 3) Premium», y a
 * eso el cliente contesta con el número pelado. `extractExplicitQuantity` lee
 * cualquier 1–8 suelto como cantidad, así que ese «2» quedaba guardado como
 * «quiere 2 llantas»: pasó en producción el 27-ago (conv 3, ciclo 7) —el
 * cliente contestó «2», compró un juego de 4, y la ficha decía 2—.
 *
 * `generar_cotizacion` ya tenía su propio candado para no COTIZAR 2 (26-ago),
 * pero el dato igual se escribía en la conversación y de ahí lo leen otras
 * cosas: el filtro de opciones vendibles usa esa cantidad para decidir qué
 * enseñar. Un candado en la caja no arregla un dato mal anotado en la ficha.
 */
export function esRespuestaDelMenuDePreferencia(
  text: string,
  ultimoMensajeNuestro: string | null | undefined,
): boolean {
  if (!ultimoMensajeNuestro?.toLowerCase().includes(MARCA_DEL_MENU)) return false;
  return /^(?:la\s+|el\s+|opci[oó]n\s+)?([123])\)?\.?$/i.test(text.trim());
}

export function extractExplicitQuantity(text: string): number | null {
  const normalized = normalize(text);
  if (/^[1-8]$/.test(normalized)) return Number(normalized);
  const words: Record<string, number> = {
    un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4,
    cinco: 5, seis: 6, siete: 7, ocho: 8,
  };
  // «Juego de llantas» = 4 en toda llantera del Ecuador. 18 mensajes en 15
  // chats lo usaron en dos semanas y el bot respondía pidiendo "la cantidad
  // exacta" (caso Wilson Gómez, 6-ago). Solo si no viene un número explícito
  // al lado («juego de 4», «juego de 5 con emergencia») que diga otra cosa.
  const juego = /\bjuego\b/.test(normalized);
  const match = normalized.match(
    // El lookbehind «(?<!a )» evita leer «paso a las 3» (una hora de visita)
    // como si fueran 3 llantas.
    /\b([1-8]|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho)\s+(?:llantas?|unidades?)\b|\b(?:quiero|necesito|deme|dame|cotiza(?:me)?|llevo|cambiar|cambio|serian|serían|son)\s+(?:las?\s+|los\s+)?([1-8]|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho)\b|\bjuego\s+de\s+([1-8]|cuatro|cinco)\b|(?<!\ba\s)(?<!\bde\s)\b(?:las|los)\s+([1-8]|dos|tres|cuatro|cinco|seis|siete|ocho)\b/,
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3] ?? match?.[4];
  if (value) return /^\d$/.test(value) ? Number(value) : words[value] ?? null;
  if (juego) return 4;
  // Número suelto al inicio o al final del mensaje: el agrupador de entrada
  // pega mensajes seguidos («Las son para mi carro» + «4» → un solo texto) y
  // el «4» del cliente quedaba invisible (caso J.F.R.C, 6-ago). Solo en los
  // extremos para no confundirse con medidas o años dentro de la frase.
  // Las HORAS se quitan antes: «paso a las 3» es una visita, no 3 llantas.
  const sinHoras = normalized.replace(/\b(?:a\s+(?:eso\s+de\s+)?(?:las?\s+)?|tipo\s+|(?:hasta|desde)\s+las?\s+)[0-9]{1,2}(?:\s*(?:h|am|pm|de la (?:mañana|tarde|noche)))?\b/g, " ").replace(/\s+/g, " ").trim();
  const suelto = sinHoras.match(/^([1-8])\s|\s([1-8])$/);
  const borde = suelto?.[1] ?? suelto?.[2];
  return borde ? Number(borde) : null;
}

export function extractVehicleYear(text: string): number | null {
  const match = normalize(text).match(/\b(19[5-9]\d|20[0-2]\d|2030)\b/);
  return match ? Number(match[1]) : null;
}

/**
 * Candado de generar_cotizacion. Antes exigía que el ÚLTIMO mensaje trajera
 * una cantidad con verbo («quiero 4»); un «Si», un «4» suelto o un «juego»
 * rebotaban y el modelo volvía a pedir confirmación — así se perdió a Rodrigo
 * (4 confirmaciones) y a J.F.R.C (escribió «4» dos veces). Regla nueva:
 * cotizar es lo correcto salvo que el cliente esté comparando o haya dicho
 * que NO. La cantidad sale del texto, del hecho guardado o del juego de 4.
 */
/**
 * Frases con las que el cliente se está yendo, no corrigiendo.
 *
 * Se separan del «no» pelado porque un «no» con una cantidad al lado es otra
 * cosa: «no, perdón, deme 2» está PIDIENDO dos llantas. Hasta el 27-ago eso se
 * leía como negativa y `canGenerateFinalQuote` bloqueaba la cotización, así que
 * el bot le contestaba «¿qué le falta para decidirse?» a alguien que acababa de
 * decirle cuántas quería. Un «no gracias» o un «mejor no» sí siguen frenando,
 * aunque nombren un número («no gracias, ya tengo 4 llantas»).
 */
const RECHAZO_BLANDO =
  /\b(?:no\s+gracias|todavia no|aun no|ahorita no|por ahora no|mejor no|dejeme pensar(?:lo)?|dejame pensar(?:lo)?|lo pienso|voy a pensar|solo (?:estoy )?pregunt\w*|solo (?:era|es) (?:una )?consulta|despues le aviso|luego le aviso|mas tarde le aviso|otro dia|cancel\w*)\b/;

/** ¿El «no» viene a corregir la cantidad, en vez de a cerrar la puerta? */
export function esCorreccionDeCantidad(text: string): boolean {
  if (!hasExplicitQuantity(text)) return false;
  return !RECHAZO_BLANDO.test(normalize(text));
}

export function canGenerateFinalQuote(
  text: string,
  comparedThisTurn = false,
  confirmedQuantity = false,
): boolean {
  if (comparedThisTurn || isComparisonRequest(text)) return false;
  if (isNegativeResponse(text) && !esCorreccionDeCantidad(text)) return false;
  return hasExplicitQuantity(text) || confirmedQuantity;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9áéíóúñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
