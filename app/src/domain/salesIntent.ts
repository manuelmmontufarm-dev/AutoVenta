import { cantidadGrandePedida } from "./cantidadGrande.js";
import { comproEnOtroLugar } from "./cierrePerdido.js";
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
  if (EN_OTRO_LADO.test(normalized) || comproEnOtroLugar(text)) return false;
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
 * Permiso del TURNO para firmar una cotización.
 *
 * Tener una cantidad guardada (o usar el juego comercial de 4) resuelve
 * CUÁNTAS llantas cotizar, pero no significa que el cliente esté comprando
 * ahora. Ese atajo hizo que un «Ok» sobre cambio de aceite terminara firmando
 * una cotización de llantas. El turno tiene que pedir la cotización, elegir
 * una opción/producto, declarar cantidad o aceptar la oferta de cotizar.
 *
 * PREGUNTAR EL PRECIO TAMPOCO AUTORIZA (Manuel, 1-sep, conv 13615: «Favor
 * costo de las 235/60 R 18» terminó en opciones y cotización en el mismo
 * turno). El precio se responde con la pieza de opciones —que trae los
 * precios— o con el número en texto; la cotización se firma recién cuando el
 * cliente elige escalón/producto, da cantidad, la pide con todas sus letras
 * o acepta la oferta.
 */
export function autorizaCotizacionEnEsteTurno(
  text: string,
  aceptoOfertaDeCotizar = false,
): boolean {
  if (aceptoOfertaDeCotizar) return true;
  if (hasExplicitQuantity(text) || respuestaDePreferencia(text) !== null) {
    return true;
  }
  // «Mándame una cotización» es la autorización más explícita que existe;
  // medido 31-ago (T115 Q06): pidePrecio no la reconocía y el candado
  // bloqueaba lo que el cliente había pedido con todas sus letras.
  // Se chequea sobre el texto NORMALIZADO (minúsculas y sin tildes): el patrón
  // viejo iba sobre el texto crudo y además traía \x08 (backspace) donde debía
  // decir \b — nunca matcheó nada; lo tapaba pidePrecio en la primera condición.
  const normalized = normalize(text);
  // `coti[cz]\w*` cubre la conjugación entera (cotización, cotízame, «me
  // cotizas», cotíceme) — el mismo alcance que pidioCotizacionExplicita usa en
  // agent.ts para FORZAR generar_cotizacion: si la puerta reconociera menos
  // que la orden, el turno se quedaría en «Cotización bloqueada» en bucle.
  if (/\bcoti[cz]\w*\b|\bproforma\b/.test(normalized)) return true;
  // «Quiero más información» / «quiero saber…» es cortesía de apertura, no la
  // elección de una llanta (conv 13615: ese «quiero» autorizaba la cotización
  // del primer mensaje). El verbo solo cuenta cuando NO pide información.
  return /\b(?:quiero|deme|dame|llevo|elijo|escojo|prefiero)\b(?!\s+(?:mas\s+)?(?:informacion|info|saber|consultar|preguntar|conocer)\b)/.test(normalized)
    || /\b(?:me\s+quedo|vamos|dale)\s+con\b/.test(normalized)
    || /^(?:si\s+)?(?:esa|esa\s+misma|ese|ese\s+mismo)$/.test(normalized);
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

/**
 * El nombre con el que el cliente ve cada escalón.
 *
 * Vive acá y no en `quoteMessages` porque ahora lo usan dos: el menú numerado
 * que se escribe y los botones que se tocan. Si el texto del menú y el título
 * del botón se escriben por separado, un día dejan de decir lo mismo y el
 * cliente elige una cosa creyendo que elige otra.
 */
export const ETIQUETA_DEL_ESCALON: Record<Preferencia, string> = {
  precio: "Costo",
  equilibrada: "Equilibrio",
  premium: "Premium",
};

export function respuestaDePreferencia(text: string): Preferencia | null {
  const normalized = normalize(text);
  // El menú de Joaquín es numerado (1 Costo / 2 Equilibrio / 3 Premium), así
  // que la respuesta más natural es el puro número. Solo cuenta si el mensaje
  // ES el número: un «1» suelto dentro de otra frase suele ser cantidad.
  const porNumero = normalized.match(/^(?:la\s+|el\s+|opcion\s+)?([123])\)?\.?$/);
  if (porNumero) return porNumero[1] === "1" ? "precio" : porNumero[1] === "2" ? "equilibrada" : "premium";
  // EL ECO DEL MENÚ CUENTA. Producción, 1-sep (conv 13617): el menú ofreció
  // «1) *Costo* — la más conveniente de precio», el cliente contestó «La más
  // conveniente» —las palabras del propio menú— y esto devolvía null: la
  // autorización de cotizar caía y el turno se quedó sin cotización y sin
  // cierre. Cada descripción de `DESCRIPCION_DEL_MENU` (quoteMessages.ts)
  // tiene que poder leerse aquí repetida por el cliente: «conveniente» y
  // «convenga» son el escalón 1, «la que (mejor) balancea» el 2. Se exige la
  // palabra completa: «balanceo» (el servicio) no cuenta.
  if (/\bequilibr\w+\b|\bintermedi\w+\b|\bla\s+del?\s+(?:en\s+)?medio\b|\bla\s+mediana\b|\bbalancead\w+\b|\bque\s+(?:mejor\s+)?balancea\b/.test(normalized)) {
    return "equilibrada";
  }
  // `[bv]arat` cubre «barata» y la falta real «varata»; «economica» llega sin
  // tilde porque normalize() ya la quitó. «costo» solo como respuesta seca:
  // dentro de una frase («costo de 4 llantas») es un pedido de precio, no la
  // elección del escalón 1.
  if (/\bmejor\s+precio\b|\b(?:la\s+)?mas\s+[bv]arat\w*\b|\b[bv]arat\w+\b|\beconomic\w+\b|\bmas\s+conveniente\b|\bla\s+que\s+(?:mas\s+)?convenga\b|^(?:el\s+|por\s+)?precio$|^(?:el\s+|la\s+de\s+)?costo$/.test(normalized)) {
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
  // «Que se adiera» / «Al pavimento» / «que no derrape» (chat del 1-sep-2026)
  // describen el uso igual que «para carretera»: el cliente está diciendo qué
  // necesita de la llanta, y eso ya es pedir la recomendación.
  return /\bpara\s+(?:la\s+|el\s+)?(?:carretera|ciudad|viaj\w+|trabaj\w+|carga|ripio|barro|lastre|montana|obra|campo|tierra|asfalto|pavimento|finca|playa|costa|oriente|sierra)\b|\buso\s+(?:mixto|urbano|rudo|diario|pesado)\b|\btodo\s+terreno\b|\bdoble\s+proposito\b|\b(?:al|en|sobre)\s+(?:el\s+)?(?:pavimento|asfalto)\b|\b(?:adhier\w*|adier\w*|adherencia|agarre|derrap\w*)\b/.test(
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

/**
 * ¿El cliente dijo cuántas quiere? Cuenta también los números que
 * `extractExplicitQuantity` no sabe leer, que topa en 8.
 *
 * El 27-ago (conv 3) un «dale con las kenda deme 20» no pasó el candado de
 * `canGenerateFinalQuote` —«el cliente está comparando o acaba de decir que
 * no»— porque para el sistema NO había dicho ninguna cantidad. La herramienta
 * devolvió ese error y el modelo improvisó: le dio el total en texto y le dijo
 * que «no me dejó generar la imagen de cotización». Nunca hubo una cotización.
 * Es el mismo tope de 8, escondido en otra puerta.
 */
export function hasExplicitQuantity(text: string): boolean {
  return extractExplicitQuantity(text) !== null || cantidadGrandePedida(text) !== null;
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
  mensajeCitado?: string | null,
): boolean {
  if (!/^(?:la\s+|el\s+|opci[oó]n\s+)?([123])\)?\.?$/i.test(text.trim())) return false;
  // EL REPLY MANDA. Cuando WhatsApp dice a qué mensaje contestó el cliente, ese
  // mensaje es la pregunta —no hay que adivinarla— y decide en las DOS
  // direcciones: citar el menú confirma el escalón, y citar cualquier otra cosa
  // (la vitrina, la cotización) descarta que ese «2» sea el escalón, cosa que la
  // heurística de abajo no sabía hacer. Producción, 31-ago 14:04: el cliente
  // contestó «2» CON REPLY al menú y el bot lo leyó como «quiero 2 llantas».
  if (mensajeCitado != null) return mensajeCitado.toLowerCase().includes(MARCA_DEL_MENU);
  // Sin reply (el cliente escribió el número suelto) queda la heurística de
  // siempre: ¿lo último que dijimos traía el menú?
  return Boolean(ultimoMensajeNuestro?.toLowerCase().includes(MARCA_DEL_MENU));
}

/**
 * RESPALDO TEXTUAL de la cantidad, con sus dos candados puestos.
 *
 * Producción, 27-ago-2026 (conv 3). El cliente escribió «quiero 20 llantas» y
 * el lector viejo, limitado a 8, no lo vio. Esta composición nació para que la
 * ruta determinística de recotización y la vitrina pudieran rescatar esa frase.
 * Desde las convs 11366/11005/11357 ya NO corre en el webhook ni decide primero:
 * `preparar_opciones.cantidad` es la fuente principal y esto se consulta solo
 * si el agente omitió el argumento.
 *
 * Los dos candados del respaldo, en este orden:
 * 1. El «2» del menú de preferencia es el ESCALÓN, no dos llantas.
 * 2. El número grande lo lee `cantidadGrandePedida`, que es el único que sabe
 *    pasar de 8.
 */
export function cantidadPedidaPorElCliente(
  text: string,
  ultimoMensajeNuestro: string | null | undefined,
  mensajeCitado?: string | null,
): number | null {
  if (esRespuestaDelMenuDePreferencia(text, ultimoMensajeNuestro, mensajeCitado)) return null;
  return cantidadGrandePedida(text) ?? extractExplicitQuantity(text);
}

export type OrigenDeCantidad = "herramienta" | "respaldo_textual" | "ficha" | "default";

/**
 * Cantidad con la que `preparar_opciones` filtra la vitrina.
 *
 * La declaración estructurada del agente manda: a diferencia de un regex,
 * entiende si «5» es cantidad, modelo del carro u hora. El lector histórico
 * queda de respaldo para expresiones que ya demostraron ser inequívocas
 * («deme solo 3», «un juego», «quiero 20 llantas») si el modelo omite el
 * argumento. La ficha conserva una declaración confiable de un turno anterior
 * y, sin ninguna señal, el contrato comercial son cuatro.
 */
export function cantidadParaPrepararOpciones(input: {
  declarada: number | null | undefined;
  guardada: number | null | undefined;
  textoActual: string;
  ultimoMensajeNuestro: string | null | undefined;
  /** El saliente al que el cliente le hizo reply, si WhatsApp lo informó. */
  mensajeCitado?: string | null;
}): { cantidad: number; origen: OrigenDeCantidad; guardar: boolean } {
  if (Number.isInteger(input.declarada) && Number(input.declarada) >= 1) {
    return { cantidad: Number(input.declarada), origen: "herramienta", guardar: true };
  }
  const respaldo = cantidadPedidaPorElCliente(
    input.textoActual, input.ultimoMensajeNuestro, input.mensajeCitado,
  );
  if (respaldo !== null) {
    return { cantidad: respaldo, origen: "respaldo_textual", guardar: true };
  }
  if (Number.isInteger(input.guardada) && Number(input.guardada) >= 1) {
    return { cantidad: Number(input.guardada), origen: "ficha", guardar: false };
  }
  return { cantidad: 4, origen: "default", guardar: false };
}

/**
 * LO QUE PARECE UNA CANTIDAD PERO CUENTA OTRA COSA.
 *
 * Se tapa con espacios antes de buscar la cantidad, igual que
 * `enmascararMedidas` hace con las medidas. Tres familias, las tres vistas en
 * producción el 26 y 27-ago:
 *
 * 1. LA HORA de la visita. Ya se tapaba «a las 3» y «tipo 3»; faltaban
 *    «pasado las 5» (conv 11357), «después de las 6» y «a partir de las 5».
 * 2. EL SUSTANTIVO QUE NO ES LLANTA. «Las 3 de ir marcas manejan ustedes»
 *    (conv 11005) es una pregunta por las marcas, y salió cotizada por 3.
 *    Se mira lo que viene DESPUÉS del número, hasta tres palabras más allá,
 *    porque el cliente escribe rápido y mete palabras en el medio.
 * 3. Se deja pasar a propósito lo que no está en la lista: «por las 4 llatas»
 *    —con la falta de ortografía— tiene que seguir contando como 4. Por eso
 *    esto es una lista de lo que NO es llanta, y no una lista de lo que sí.
 */
const LA_HORA =
  /\b(?:a\s+(?:eso\s+de\s+)?(?:las?\s+)?|tipo\s+|(?:hasta|desde)\s+las?\s+|pasad[oa]s?\s+(?:de\s+)?las?\s+|despues\s+de\s+las?\s+|luego\s+de\s+las?\s+|a\s+partir\s+de\s+las?\s+)[0-9]{1,2}(?:\s*(?:h|am|pm|de la (?:mañana|tarde|noche)))?\b/g;

const NO_ES_LLANTA =
  /\b(?:las|los)\s+[1-8]\b(?=(?:\s+\S+){0,3}\s+\b(?:marcas?|opciones?|medidas?|modelos?|alternativas?|locales?|sucursales?|fotos?)\b)/g;

function sinLoQueCuentaOtraCosa(normalized: string): string {
  return normalized.replace(LA_HORA, " ").replace(NO_ES_LLANTA, " ").replace(/\s+/g, " ").trim();
}

export function extractExplicitQuantity(text: string): number | null {
  const normalized = sinLoQueCuentaOtraCosa(normalize(text));
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
    // como si fueran 3 llantas. Y el «solo» opcional después del verbo es
    // «deme solo 3», que antes solo se leía por el número del borde — el
    // mismo atajo que confundía «Para arrizo 5» con cinco llantas.
    /\b([1-8]|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho)\s+(?:llantas?|unidades?)\b|\b(?:quiero|necesito|deme|dame|cotiza(?:me)?|llevo|cambiar|cambio|serian|serían|son)\s+(?:solo\s+|solamente\s+|unicamente\s+|nomas\s+|no\s+mas\s+)?(?:las?\s+|los\s+)?([1-8]|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho)\b|\bjuego\s+de\s+([1-8]|cuatro|cinco)\b|(?<!\ba\s)(?<!\bde\s)\b(?:las|los)\s+([1-8]|dos|tres|cuatro|cinco|seis|siete|ocho)\b/,
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3] ?? match?.[4];
  if (value) return /^\d$/.test(value) ? Number(value) : words[value] ?? null;
  // «solo dos» / «solamente 2» A SECAS: el mensaje entero ES la cantidad.
  // T115 Q05 (31-ago): tras «quiero la Falken», el «solo dos» no parseaba,
  // la autorización caía y el candado bloqueó una cotización legítima.
  const aSecas = normalized.match(/^(?:solo|solamente|unicamente|nomas|no\s+mas)\s+([1-8]|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho)$/);
  if (aSecas) return /^\d$/.test(aSecas[1]) ? Number(aSecas[1]) : words[aSecas[1]] ?? null;
  if (juego) return 4;
  // UN NÚMERO AL FINAL, CUANDO EL MENSAJE HABLA DE CUÁNTAS.
  //
  // «mejor 2» y «que sean 3» son cantidades sin verbo de la lista de arriba, y
  // se leían por un atajo que miraba el final del texto entero. Ese atajo es el
  // que confundió «Para arrizo 5» —el modelo del auto— con cinco llantas
  // (conv 11366, 26-ago) y lo dejó cotizado en $456.40.
  //
  // Lo que separa un caso del otro no es dónde está el número, sino si el
  // mensaje trae alguna señal de que se está hablando de cuántas. La lista es
  // corta y cada palabra salió de un mensaje real: preferir de menos y que el
  // cliente lo repita es más barato que firmar una cantidad que nadie pidió.
  const senalDeCantidad = /\b(?:mejor|ahora|solo|solamente|unicamente|nomas|serian|sean|total|llantas?|unidades?|neumaticos?|juego)\b/.test(normalized);
  if (senalDeCantidad) {
    const borde = normalized.match(/^([1-8])\s|\s([1-8])$/);
    const n = borde?.[1] ?? borde?.[2];
    if (n) return Number(n);
  }

  // EL NÚMERO QUE LLEGÓ SOLO, EN SU PROPIO MENSAJE.
  //
  // El agrupador de entrada pega los mensajes seguidos con «\n»
  // (pipeline/inbound.ts:102), así que «su propio mensaje» es «su propia
  // línea». El cliente que escribió «Las son para mi carro» y después «4» no
  // puede quedarse sin su cantidad (caso J.F.R.C, 6-ago).
  //
  // Antes esto miraba los EXTREMOS del texto entero, y ahí se colaba el nombre
  // del auto: «Para arrizo 5» termina en un número y salió cotizada por 5
  // (conv 11366, 26-ago). La línea propia es lo que separa un caso del otro —
  // el «4» que el cliente mandó aparte del «5» que es parte del modelo.
  const solo = text.split(/\r?\n/).map(normalize).find((linea) => /^[1-8]$/.test(linea));
  return solo ? Number(solo) : null;
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
