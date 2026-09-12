/**
 * EL BENEFICIO POR VENIR DE REDES SOCIALES.
 *
 * Pedido de Joaquín, 10-sep-2026, textual:
 *
 *   «que el bot comunique un beneficio extra para los clientes que vienen de
 *    redes sociales: una nueva alineación + rotación completamente gratis
 *    cuando el vehículo llegue a los 10.000 km posteriores a la compra.
 *
 *    Es importante que el mensaje deje claro que este beneficio es adicional a
 *    los servicios que ya recibe el día de la instalación, no que la
 *    alineación se hará recién a los 10.000 km.
 *
 *    La idea es que este mensaje salga automáticamente después de enviar la
 *    cotización.»
 *
 * El texto es el que él mismo redactó, palabra por palabra. Las dos cosas que
 * pidió con énfasis están en los tests: que se entienda ADICIONAL, y que el
 * cliente sepa que tiene que mencionarlo en el local — si no lo menciona, el
 * asesor no lo registra y el beneficio no existe.
 *
 * Sale UNA vez por ciclo. Los asesores ya lo venían pegando a mano (convs
 * 16982 y 18684, 10-sep), así que el detector reconoce también esa versión: dos
 * veces el mismo regalo se lee como un error, no como una atención.
 */

export const BENEFICIO_DE_REDES =
  "🎁 Y tiene un beneficio adicional por venir de nuestras redes sociales: además de los servicios "
  + "incluidos en la instalación de sus llantas, le obsequiamos una alineación + rotación "
  + "completamente GRATIS a los 10.000 km.\n\n"
  + "Cuando venga a realizar su compra, recuerde mencionar este beneficio a su asesor para que "
  + "pueda registrarlo. 🚗✅";

/** La huella que lo identifica, venga del bot o escrito a mano por el asesor. */
const HUELLA = /beneficio adicional por venir de (?:nuestras )?redes|alineaci[óo]n \+ rotaci[óo]n/i;

export function yaSalioElBeneficioDeRedes(mensajesDelCiclo: readonly (string | null | undefined)[]): boolean {
  return mensajesDelCiclo.some((m) => Boolean(m) && HUELLA.test(m!));
}
