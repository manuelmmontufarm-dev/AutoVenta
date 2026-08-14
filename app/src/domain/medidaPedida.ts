/**
 * ¿La llanta que se va a cotizar es de la medida que pidió el cliente?
 *
 * Nace del chat 5499 (13-ago-2026). El cliente escribió «265/70/16», el bot le
 * mostró bien esa medida, y cuando pidió «menor precio dispone» el modelo buscó
 * por ARO —no por medida— y presentó tres llantas de tres medidas distintas
 * (215/60R16, 245/70R16, 225/70R16), ninguna la suya. Cotizó la 225/70R16 en
 * $499,04 y, cuando el cliente dijo «Esa medida», le contestó que sí, que esa
 * misma medida estaba cotizada. La llanta correcta costaba $145,47 c/u contra
 * $124,76: **$82,84 menos en el juego**, con el número de cotización en la mano
 * del cliente para exigirlo en el local.
 *
 * Por eso esto es un CANDADO y no una línea de prompt: cotizar es firmar un
 * precio. La medida que se firma tiene que ser una que el cliente haya pedido.
 *
 * Vive aquí, puro y sin base ni catálogo, para poder probarlo sin levantar nada
 * — mismo criterio que opcionesCandados y aros.
 */
import {
  extractFlotationSizes, extractTireSizes, formatFlotationSize, formatTireSize,
} from "./tireSize.js";

/** Toda medida —métrica o de flotación— que aparezca en un texto, canónica. */
export function medidasEnTexto(texto: string): string[] {
  return [
    ...extractTireSizes(texto).map(formatTireSize),
    ...extractFlotationSizes(texto).map(formatFlotationSize),
  ];
}

/**
 * Las medidas que el cliente nombró, más la que la conversación tiene
 * confirmada. Es el conjunto de lo que se le puede cotizar sin sorprenderlo.
 *
 * `confirmada` entra porque es como se registra que el cliente ACEPTÓ una
 * equivalencia: cuando en su medida no hay stock, el agente le ofrece otra, el
 * cliente dice que sí y el agente la busca — y buscarla la deja como medida de
 * trabajo de la conversación. Ese camino sigue abierto; el que se cierra es el
 * de cotizar una medida que nadie nombró nunca.
 */
export function medidasPermitidas(
  textosDelCliente: readonly string[],
  confirmada?: string | null,
): string[] {
  const todas = new Set<string>();
  for (const texto of textosDelCliente) for (const m of medidasEnTexto(texto)) todas.add(m);
  if (confirmada) for (const m of medidasEnTexto(confirmada)) todas.add(m);
  return [...todas];
}

/** Normaliza una etiqueta del catálogo («LT265/75R16 123/120S») a «265/75R16». */
function canonica(sizeLabel: string): string | null {
  return medidasEnTexto(sizeLabel)[0] ?? null;
}

/**
 * ¿Se puede cotizar esta medida sin avisar?
 *
 * Sin medidas permitidas (el cliente nunca dijo ninguna: llegó por vehículo o
 * por aro) NO se bloquea nada — no hay contra qué comparar y frenar ahí sería
 * romper ventas legítimas. El candado solo actúa cuando el cliente SÍ pidió una
 * medida concreta y la que se va a firmar es otra.
 */
export function medidaEstaPedida(
  sizeLabel: string | null | undefined,
  permitidas: readonly string[],
): boolean {
  if (!permitidas.length) return true;
  if (!sizeLabel) return false;
  const propia = canonica(sizeLabel);
  if (!propia) return false;
  return permitidas.some((p) => canonica(p) === propia);
}

/**
 * Las medidas de un grupo de productos, sin repetir. Sirve para saber si una
 * pieza de opciones mezcla medidas —lo que pasó en el 5499— y para poder
 * decírselo al cliente en vez de rotular la imagen con una sola.
 */
export function medidasDeProductos(
  productos: readonly { sizeLabel?: string | null }[],
): string[] {
  const out: string[] = [];
  for (const p of productos) {
    const c = p.sizeLabel ? canonica(p.sizeLabel) ?? p.sizeLabel : null;
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}
