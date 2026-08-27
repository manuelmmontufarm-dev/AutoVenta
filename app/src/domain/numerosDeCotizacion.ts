/**
 * Los números de cotización no se le escriben al cliente.
 *
 * Joaquín, 26-ago-2026, viendo el chat de Andrés Tamayo: «quitaría los números
 * de cotización, que le veo imposible que un cliente llegue y dé eso porque se
 * ve muy repetitivo y puede hasta confundir; lo dejaría solo con el código de
 * descuento del 2 %. Número de cotización más código de descuento ya demasiadas
 * vainas».
 *
 * Esto es un candado y no solo una línea de prompt porque el texto que sale al
 * cliente lo escriben TRES manos y solo una obedece al prompt: el modelo, el
 * Ángel Guardián —que reescribe DESPUÉS de todos los candados deterministas— y
 * las plantillas de código. En ese mismo chat fue el guardián quien llenó
 * cuatro mensajes seguidos de «COT-MTACN72K», discutiendo consigo mismo delante
 * del cliente. Por eso corre al final de la cadena, junto al aviso de stock.
 *
 * Puro y sin base para poder probarlo sin levantar nada.
 */

/**
 * `COT-` o `AV-` seguidos del sufijo base36 que arma `buildQuote`.
 *
 * Cuatro caracteres como mínimo es lo que separa un número de cotización de un
 * guion cualquiera. Y ojo con lo que NO puede tocar: el cupón es `DT-PUMA47`
 * —otro prefijo— y las medidas («235/75R15») no llevan guion.
 */
const FORMA = String.raw`\*?\b(?:COT|AV)-[A-Z0-9]{4,}\b\*?`;

/**
 * Se lleva puesto UN espacio contiguo, el de antes o el de después, para no
 * dejar « la cotización  no la tomo» ni descolocar la sangría de una línea que
 * empezaba con el número.
 */
const CON_SU_ESPACIO = new RegExp(`(?:[ \\t]${FORMA}|${FORMA}[ \\t]?)`, "gi");
const HAY_ALGUNO = new RegExp(FORMA, "i");

/**
 * Quita los números de cotización de un texto que va al cliente y deja la frase
 * legible: sin espacios dobles y sin la coma colgando.
 *
 * No reescribe la frase: si el mensaje quedaba sostenido por ese número, el
 * problema es el mensaje y se arregla donde se escribió, no acá.
 */
export function sinNumerosDeCotizacion(texto: string): string {
  if (!HAY_ALGUNO.test(texto)) return texto;
  const limpias: string[] = [];
  for (const linea of texto.split("\n")) {
    if (!HAY_ALGUNO.test(linea)) {
      limpias.push(linea);
      continue;
    }
    const limpia = linea
      .replace(CON_SU_ESPACIO, "")
      .replace(/[ \t]+([,.;:!?])/g, "$1")
      .replace(/\(\s*\)/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+$/g, "");
    // La línea que SOLO existía para nombrar el número («🔖 Número de venta:
    // AV-…») se va entera: dejar la etiqueta sola es peor que no haberla
    // escrito. Se reconoce porque lo que queda no tiene ni una letra ni un
    // dígito después de los dos puntos.
    if (/^[^\p{L}\p{N}]*$/u.test(limpia) || /:[^\p{L}\p{N}]*$/u.test(limpia)) continue;
    limpias.push(limpia);
  }
  return limpias.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** ¿Este texto le está mostrando al cliente un número de cotización? */
export function tieneNumeroDeCotizacion(texto: string): boolean {
  return HAY_ALGUNO.test(texto);
}
