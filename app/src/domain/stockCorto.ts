/**
 * EL AVISO DE STOCK CORTO, Y POR QUÉ TIENE QUE VIAJAR PEGADO A LA COTIZACIÓN.
 *
 * Decisión de Joaquín (25-ago-2026): cuando el cliente pide 4 y hay 3, no se
 * bloquea. El stock que llega de Contífico viene desfasado y negarse pierde la
 * venta justo cuando en bodega sí están, que es el caso más común. Se cotiza,
 * se dice cuántas hay y se le abre la tarea al asesor.
 *
 * Eso se hizo, y falló igual — conv 11061, 26-ago. El aviso salió en el turno
 * de la cotización… y ahí murió. Era una variable local de `generar_cotizacion`
 * que no se guardaba en ningún lado, así que los turnos siguientes volvieron a
 * prometer las 4 limpias:
 *
 *   12:04:11  «⚠️ hoy tengo *3* disponibles y usted pidió *4*»        ← el aviso
 *   12:04:46  se reenvía la pieza: «4 unidades cotizadas»             ← sin aviso
 *   12:04:57  «la cotización vigente … *4 × KENDA KR203* … $262.60»   ← sin aviso
 *
 * El ÚLTIMO mensaje que leyó el cliente promete 4 unidades sin una palabra de
 * stock, y ese es el que se lleva al local. Peor: ese mensaje lo escribió el
 * Ángel Guardián, corrigiendo otra cosa — tenía el aviso en su ventana de
 * historial y no lo repitió, porque nada se lo exigía.
 *
 * De ahí este módulo. El aviso deja de ser un texto suelto en una tool y pasa a
 * ser una regla con tres patas, todas usando estas funciones:
 *
 *   1. `generar_cotizacion` lo hornea la primera vez (como siempre).
 *   2. `outboundGuard` lo vuelve a pegar en CUALQUIER mensaje que afirme la
 *      cotización y no lo traiga — determinístico, sin pedirle nada al modelo.
 *   3. El guardián lo ve como hecho duro y tiene una regla para exigirlo.
 *
 * La cantidad se compara SIEMPRE contra el stock de hoy, no contra el que había
 * cuando se firmó: si en bodega repusieron, el aviso desaparece solo.
 */

/** Lo que se dice la primera vez, con la cotización recién hecha. */
export function avisoStockCorto(stockHoy: number, solicitadas: number): string {
  return (
    `⚠️ Ojo: de esa llanta hoy tengo *${stockHoy}* ` +
    `${stockHoy === 1 ? "disponible" : "disponibles"} y usted pidió *${solicitadas}*. ` +
    "Se la cotizo completa y el resto se lo confirma el asesor en el local."
  );
}

/**
 * Lo que se dice al REPETIR la cotización (reenvío, resumen, seguimiento).
 *
 * Va aparte porque «hoy tengo 3 y usted pidió 4» dicho por tercera vez suena a
 * bot pegado; y porque el cliente ya lo sabe — esto es un recordatorio, no una
 * noticia. Lo que no cambia es el número: si se menciona la cotización, se
 * menciona cuántas hay.
 */
export function recordatorioStockCorto(stockHoy: number, solicitadas: number): string {
  return (
    `⚠️ Recuerde que de esa llanta hoy hay *${stockHoy}* y la cotización es por ` +
    `*${solicitadas}*: el resto se lo confirma el asesor en el local.`
  );
}

/**
 * ¿Este texto ya avisa del stock?
 *
 * Deliberadamente amplio: el guardián y el modelo redactan el aviso con sus
 * propias palabras («eso sí, hoy aparecen 3 disponibles», «hay 3 en tienda»), y
 * pegarle un segundo aviso encima sería peor que no tener ninguno. Alcanza con
 * que el número de hoy aparezca cerca de una palabra de disponibilidad.
 */
export function yaAvisaDelStock(texto: string, stockHoy: number): boolean {
  const plano = texto.toLowerCase();
  const palabraDeStock = /disponible|disponibles|hay|quedan|queda|stock|en tienda|en bodega|faltante|el resto|tengo/;
  // El número tiene que estar CERCA de la palabra, no suelto en el mensaje.
  // Con la coincidencia a nivel de texto entero, «le quedan 3 meses de garantía
  // contra golpes» se leía como un aviso de stock y el recordatorio no salía:
  // un falso positivo acá deja pasar el error que este módulo existe para
  // atajar, así que en la duda se pega el aviso (a lo sumo se repite).
  const unidadDeTiempo = /^\s*\*?\s*(mes|meses|año|años|día|días|km|kil[oó]metros)/;

  const aguja = new RegExp(`\\*?\\b${stockHoy}\\b\\*?`, "g");
  for (const coincidencia of plano.matchAll(aguja)) {
    const posición = coincidencia.index ?? 0;
    if (unidadDeTiempo.test(plano.slice(posición + coincidencia[0].length))) continue;
    const alrededor = plano.slice(Math.max(0, posición - 40), posición + 40);
    if (palabraDeStock.test(alrededor)) return true;
  }
  return false;
}

/**
 * ¿Este texto está AFIRMANDO la cotización vigente?
 *
 * No basta con que la nombre de pasada: la regla se dispara cuando el mensaje
 * le pone al cliente delante el trato — el número de cotización, la cantidad
 * cotizada, o el total. Es justo lo que hacían los dos mensajes de las 12:04.
 *
 * Un mensaje que solo dice «¿qué día puede pasar?» no afirma nada y no lleva
 * aviso: repetirlo en cada turno lo convertiría en ruido.
 */
export function afirmaLaCotizacion(
  texto: string,
  cotizacion: { numero?: string | null; cantidad?: number | null; total?: number | null },
): boolean {
  const plano = texto.toLowerCase();

  if (cotizacion.numero && plano.includes(cotizacion.numero.toLowerCase())) return true;

  if (cotizacion.total != null) {
    // «$262.60» y «262,60», que es como lo escribe el modelo a veces.
    const conPunto = cotizacion.total.toFixed(2);
    const conComa = conPunto.replace(".", ",");
    if (plano.includes(conPunto) || plano.includes(conComa)) return true;
  }

  if (cotizacion.cantidad != null) {
    // «4 × KENDA», «4 x kenda», «4 unidades», «juego de 4», «las 4».
    const n = cotizacion.cantidad;
    if (new RegExp(`\\*?${n}\\*?\\s*(?:×|x)\\s`).test(plano)) return true;
    if (new RegExp(`\\b${n}\\b\\s*\\*?\\s*(?:unidades?|llantas?)`).test(plano)) return true;
    if (new RegExp(`(?:juego|cotizaci[oó]n|cotizada[s]?|pedido)\\s+(?:de|por)\\s+\\*?${n}\\b`).test(plano)) return true;
  }

  return false;
}

/**
 * La decisión completa: dado un mensaje por salir y la cotización vigente,
 * ¿hay que pegarle el recordatorio?
 *
 * Devuelve el texto ya listo o `null`. Es una función pura para poder probar
 * los bordes sin base de datos: el mensaje que no afirma nada, el que ya avisa,
 * el que tiene stock de sobra.
 */
export function recordatorioQueFalta(
  texto: string,
  cotizacion: { numero?: string | null; cantidad: number; total?: number | null; stockHoy: number },
): string | null {
  if (cotizacion.cantidad <= cotizacion.stockHoy) return null;
  // El agotado no es «stock corto»: tiene su propio candado en la cotización y
  // decirle «hoy hay 0» a alguien que ya tiene un número firmado es otra
  // conversación, que la tiene que tener el asesor.
  if (cotizacion.stockHoy <= 0) return null;
  if (!afirmaLaCotizacion(texto, cotizacion)) return null;
  if (yaAvisaDelStock(texto, cotizacion.stockHoy)) return null;
  return recordatorioStockCorto(cotizacion.stockHoy, cotizacion.cantidad);
}
