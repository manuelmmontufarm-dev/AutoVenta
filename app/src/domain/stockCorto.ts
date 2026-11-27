import { MAXIMO_NORMAL } from "./cantidadGrande.js";
import { politica } from "../negocio/politica.js";

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

/**
 * ¿EL STOCK DE HOY ALCANZA PARA FIRMAR ESTA CANTIDAD?
 *
 * Esta es la línea que faltaba, y por eso el stock seguía fallando después de
 * tres arreglos. Hasta hoy el sistema tenía TRES capas mirando el stock y
 * ninguna que dijera que no:
 *
 *   · la vitrina (`opcionesQueAlcanzan`) filtraba… y su red de emergencia
 *     devolvía cualquier cosa con más de cero;
 *   · la caja (`generar_cotizacion`) decidía explícitamente NO bloquear;
 *   · el candado de salida (`asegurarAvisoDeStock`) solo PEGA un aviso detrás
 *     de una promesa que ya se hizo.
 *
 * Resultado, producción 27-ago conv 11720: 215/50R17 con UNA unidad de KENDA
 * KR20; la vitrina la enseñó, la caja firmó *4 × $105.88 = $423.52*, y el aviso
 * salió después. Tres candados, cero negativas. Manuel: «le cotizó una llanta
 * que solo hay 1 unidad».
 *
 * LA DISTINCIÓN QUE RECONCILIA LAS DOS DECISIONES. Joaquín (25-ago) dijo que
 * con 3 de 4 NO se bloquea, porque el stock de Contífico viene desfasado y
 * negarse pierde la venta cuando en bodega sí están. Tenía razón para 3 de 4 —
 * y su propio ejemplo de lo que estaba MAL era «una medida con UNA unidad y el
 * bot cotiza las 4 llantas de esa unidad». Las dos cosas son ciertas porque no
 * son el mismo caso:
 *
 *   3 de 4 → desfase plausible. Se cotiza y se avisa.
 *   1 de 4 → no hay. Firmar un juego ahí no es optimismo, es una promesa falsa.
 *
 * La raya se pone en la MITAD de lo pedido: por debajo de la mitad ya no es
 * desfase, es faltante. Es un número, no un criterio, y por eso se puede
 * mover en un solo sitio.
 */
export const PISO_DE_DESFASE = 0.5;

/**
 * UN SOLO STOCK ENTRE LOCALES (Competimotor, `politica.stockCortoSeVende`;
 * auditoría del 26-nov-2026, familia F-01).
 *
 * En Depot el stock de Contífico es por bodega y la raya de arriba tiene
 * sentido. En Competimotor el stock es uno solo y los locales se pasan
 * llantas: con KENDA KR28 235/60R16 en 2, el bot dijo «No me sale en stock…»
 * (chat 1331, 23-nov 16:25) y 13 minutos después el asesor escribió «Si
 * tenemos en la medida 235/60R16» y la cotizó. La única venta del periodo
 * (chat 469, $437) fue de una KR601 con 2 en catálogo que el bot había negado.
 *
 * Con la perilla: lo que tiene ≥ 1 se muestra y se cotiza por lo que pidió,
 * al cliente no se le nombra el stock (regla del negocio: ni «tengo 2», ni
 * «stock bajo») y al asesor sí, con la alerta `stock_insuficiente`, para que
 * consiga las que faltan. Sin la perilla (Depot) nada de esto cambia.
 */
export function stockCortoSeVende(): boolean {
  return politica.stockCortoSeVende === true;
}

/** ¿Al cliente se le dice cuántas hay cuando no alcanzan? Depot sí; Competimotor no. */
export function nombraElStockAlCliente(): boolean {
  return !stockCortoSeVende();
}

/**
 * Cuántas unidades tiene que tener una llanta para ENSEÑARLA en la vitrina.
 * Depot: las que pidió (el juego). Con stock único: una.
 */
export function minimoParaMostrar(pedidas: number): number {
  return stockCortoSeVende() ? 1 : Math.max(1, Math.round(pedidas));
}

/**
 * Lo que el vendedor recibe de la cotización con stock corto. Depot: el número
 * (lo dice el aviso). Con stock único: la orden de NO nombrarlo, sin el número
 * —si el número viaja, el modelo lo escribe—.
 */
export function stockCortoParaElVendedor(corto: { stock_hoy: number; solicitadas: number }): Record<string, unknown> {
  if (nombraElStockAlCliente()) return { stock_insuficiente: corto };
  return { stock_corto_interno: REGLA_STOCK_CORTO_SE_VENDE };
}

/** El hecho duro que reciben el vendedor y el Guardián cuando el negocio vende con stock corto. */
export const REGLA_STOCK_CORTO_SE_VENDE =
  "STOCK ÚNICO ENTRE LOCALES (regla del negocio): toda llanta del catálogo con stock de 1 o más SE OFRECE y SE COTIZA "
  + "por la cantidad que pide el cliente, aunque el número no alcance para el juego: los locales se pasan llantas y el "
  + "asesor consigue las que faltan (ya recibe la alerta). Ofrecerla o cotizarla así NO es error. "
  + "PROHIBIDO decirle al cliente cuántas hay, «stock bajo», «stock corto», «no hay stock suficiente», «no me alcanza "
  + "para el juego» o «consultar disponibilidad», y PROHIBIDO quitar, negar o cambiar una opción por tener pocas unidades. "
  + "«No hay» solo vale para una llanta con stock 0, y ni así se dice así: se ofrece lo más cercano que sí hay.";

/**
 * ARRIBA DEL JUEGO GRANDE ESTA RAYA NO APLICA.
 *
 * «Quiero 20 llantas» con 8 en bodega no es una promesa falsa: es un pedido de
 * flota, y esa conversación la termina el asesor con el proveedor. Bloquearlo
 * mataría la venta más grande del mes por una regla escrita para el juego de
 * cuatro. Ahí siguen valiendo el aviso de stock corto y la alerta al asesor,
 * que es exactamente lo que Joaquín pidió el 25-ago.
 */
const PEDIDO_DE_FLOTA = MAXIMO_NORMAL;

/** El mínimo de unidades que hacen creíble que en bodega estén las demás. */
export function minimoParaVender(pedidas: number): number {
  return Math.max(1, Math.ceil(Math.max(1, pedidas) * PISO_DE_DESFASE));
}

/**
 * `true` cuando se puede firmar la cantidad pedida (con aviso si falta algo),
 * `false` cuando lo honesto es decir cuántas hay.
 */
export function alcanzaParaVender(stockHoy: number, pedidas: number): boolean {
  const hay = Number(stockHoy ?? 0);
  if (hay <= 0) return false;
  // Stock único (Competimotor): con una sola se firma lo pedido; el asesor consigue el resto.
  if (stockCortoSeVende()) return true;
  if (hay >= pedidas) return true;
  if (pedidas > PEDIDO_DE_FLOTA) return true;
  return hay >= minimoParaVender(pedidas);
}

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
  // Con stock único al cliente no se le nombra el stock: el asesor ya tiene la alerta.
  if (!nombraElStockAlCliente()) return null;
  if (cotizacion.cantidad <= cotizacion.stockHoy) return null;
  // El agotado no es «stock corto»: tiene su propio candado en la cotización y
  // decirle «hoy hay 0» a alguien que ya tiene un número firmado es otra
  // conversación, que la tiene que tener el asesor.
  if (cotizacion.stockHoy <= 0) return null;
  if (!afirmaLaCotizacion(texto, cotizacion)) return null;
  if (yaAvisaDelStock(texto, cotizacion.stockHoy)) return null;
  return recordatorioStockCorto(cotizacion.stockHoy, cotizacion.cantidad);
}
