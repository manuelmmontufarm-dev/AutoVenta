/**
 * NINGÚN TURNO CON COTIZACIÓN CIERRA SIN LA PREGUNTA QUE FALTA.
 *
 * Manuel, 27-ago-2026, viendo su propio chat de prueba: «después de ese mensaje
 * debería insistir en que dé el local que le conviene, o si ya dijo eso, el día
 * que va, pero molestando con esas preguntas hasta que se respondan. Si hago
 * preguntas se desvía la conversación y no acaba con una pregunta».
 *
 * Lo que pasó (conv 3 ciclo 8, 21:49): el bot ya tenía el local y había pedido
 * el día. El cliente mandó dos preguntas seguidas —«si incluye alineación y
 * eso», «¿y son buenas para montaña?»— que se atendieron en DOS turnos, y el
 * segundo terminó así:
 *
 *   «Sí, le sirven para uso mixto; la WINRUN MAXCLAW A/T es A/T, más apta que
 *    una de calle para tierra y camino irregular. Si quiere, le dejo la visita
 *    en Depot Tire Cumbayá y el asesor se la confirma en tienda.»
 *
 * Sin pregunta. Ahí muere el hilo: el bot contestó bien y dejó de vender.
 *
 * El prompt YA lo pedía —«ningún turno posterior a la cotización cierra sin esa
 * pregunta»— y no alcanzó, que es la misma historia de toda la semana. Así que
 * es un candado y corre al final, después del Ángel Guardián: él reescribe el
 * texto entero y es perfectamente capaz de quitar la pregunta al resumir.
 *
 * Puro y sin base: recibe lo que la conversación ya sabe y devuelve qué falta.
 */

/** Lo que el bot todavía necesita para que el asesor pueda atenderlo. */
export type DatoPendiente = "local" | "dia";

export interface EstadoDelCierre {
  /** Sin cotización viva no hay cierre que empujar: se está vendiendo todavía. */
  hayCotizacion: boolean;
  localElegido: boolean;
  /** El día YA registrado, no el prometido de palabra. */
  visitaRegistrada: boolean;
}

/**
 * El local primero y el día después, en ese orden y de a uno.
 *
 * Los dos juntos en el mismo mensaje fue lo que hacía que el cliente
 * contestara solo uno (26-ago). Preguntar de a uno convierte el cierre en dos
 * preguntas fáciles en vez de una difícil.
 */
export function datoQueFalta(estado: EstadoDelCierre): DatoPendiente | null {
  if (!estado.hayCotizacion) return null;
  if (!estado.localElegido) return "local";
  if (!estado.visitaRegistrada) return "dia";
  return null;
}
