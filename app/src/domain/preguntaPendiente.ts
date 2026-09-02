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
  /** Fila en `quotes` del ciclo vigente. */
  hayCotizacion: boolean;
  /**
   * Venta verbal en cierre: opciones/precio acordados sin PDF (conv 13909).
   * Solo cuenta si quien llama ya filtró la etapa (`cotizacion_enviada` /
   * `seguimiento_venta`). Ver `domain/compromisoDeCierre.ts`.
   */
  hayCompromisoSinCotizacion?: boolean;
  localElegido: boolean;
  /** El día YA registrado, no el prometido de palabra. */
  visitaRegistrada: boolean;
}

/** ¿Este turno todavía empuja local/día? */
export function enCierreComercial(estado: EstadoDelCierre): boolean {
  return estado.hayCotizacion || Boolean(estado.hayCompromisoSinCotizacion);
}

/**
 * El local primero y el día después, en ese orden y de a uno.
 *
 * Los dos juntos en el mismo mensaje fue lo que hacía que el cliente
 * contestara solo uno (26-ago). Preguntar de a uno convierte el cierre en dos
 * preguntas fáciles en vez de una difícil.
 */
/**
 * Con qué se cierra el turno cuando ya no falta ningún dato.
 *
 * Manuel, 27-ago, viendo el cierre en su teléfono: «cuando confirma todo que
 * solo pregunte si tiene otra pregunta o algo así». Sin esto, el turno que
 * registra la visita terminaba en punto —«Ya quedó registrado para el asesor.»—
 * y el hilo moría ahí. El bot dejó de vender en el mensaje en que más cerca
 * estaba de cerrar.
 *
 * No pide un dato: los tres que importan (medida, local, día) ya están. Deja la
 * puerta abierta, que es lo único que queda por hacer.
 */
export const PREGUNTA_DE_CIERRE = "¿Le queda alguna otra duda? Ahí le esperamos. 🤝";

export function datoQueFalta(estado: EstadoDelCierre): DatoPendiente | null {
  if (!enCierreComercial(estado)) return null;
  if (!estado.localElegido) return "local";
  if (!estado.visitaRegistrada) return "dia";
  return null;
}
