/**
 * LA OFERTA DE COTIZAR ES UN HECHO, NO UNA LECTURA DEL HISTORIAL.
 *
 * Regla de Manuel (20-oct, revisión del sprint 1 de la auditoría del 19-oct):
 * nada de «qué le ofreció el bot» se recupera parseando lo que el bot escribió
 * turnos atrás. Ese patrón —releer con regex el texto propio— dio los dos
 * lectores de medida y la poda del Guardián, y se rompe con la próxima
 * reescritura del Guardián o del copy.
 *
 * Ahora la oferta se escribe en el momento en que sale, en `metadata.oferta`
 * del mensaje enviado (`services/ofertaVigente.ts`, las tres puertas que
 * guardan salientes: turno, retomada y seguimiento), y el «sí» la lee de ahí.
 *
 * Este archivo es el DUEÑO ÚNICO:
 *  - el tipo del hecho;
 *  - `ofertaEnElTexto`: el ÚNICO lugar con regex, y corre sobre el texto que se
 *    está ENVIANDO, no sobre el historial. Si una puerta ya sabe qué ofreció
 *    (`declarada`), manda lo declarado mientras el texto final siga ofreciendo;
 *  - `ofertaVigente`: el lector del hilo. La oferta muere con una cotización
 *    enviada, con una negativa del cliente o con más de dos mensajes suyos;
 *    un menú se cierra cuando el cliente ya eligió después de él;
 *  - las lecturas del sí contra el hecho (`aceptaLaOferta`, `consienteEsta`).
 *
 * Puro: se prueba sin base y sin modelo.
 */
import {
  codigoDeLoOfrecido, esMenuDeOpciones, esNegativaCorta, ofreceCotizarEn, palabrasDelAcuse, respondeQueSi,
} from "./ofertaAceptada.js";
import { ofrecioCotizarLaUnica } from "./cotizarLaUnica.js";
import { eligePosicionDelMenu, pidioPrecioOCotizacion, respuestaDePreferencia } from "./salesIntent.js";

export interface OfertaDeCotizar {
  tipo: "oferta_de_cotizar";
  /** «una»: la oferta nombra UNA llanta («¿Se la cotizo?»). «menu»: pide elegir entre varias. */
  clase: "una" | "menu";
  /** La llanta ofrecida (clase «una»), si se sabe. */
  codigo?: string;
  /** Cuántas opciones tenía el menú (clase «menu»). */
  opciones?: number;
  /** La medida de la llanta ofrecida, si la oferta la nombró («¿Le cotizo la X en MEDIDA?»). */
  medida?: string;
  /** La cantidad que el cliente ya dijo, si la hay. */
  cantidad?: number;
  /** La oferta es la de la ÚNICA opción («Es la única que tengo… ¿Se la cotizo?»). */
  unica?: boolean;
}

/** Lo que el detector necesita saber de la última lámina para resolver la llanta nombrada. */
export interface OpcionDeLamina {
  codigo: string;
  marca: string;
  diseno: string;
  medida?: string | null;
}

/**
 * ¿El texto que se está ENVIANDO ofrece cotizar? Devuelve el hecho o null.
 *
 * `declarada` es lo que la puerta que armó la oferta ya sabe (el código de la
 * equivalente, las opciones del menú, la cantidad): manda sobre lo detectado si
 * el texto final sigue ofreciendo lo mismo. Si el Guardián o un candado quitó la
 * oferta, no hay hecho aunque se haya declarado.
 */
export function ofertaEnElTexto(
  texto: string | null | undefined,
  lamina: readonly OpcionDeLamina[],
  declarada?: OfertaDeCotizar | null,
): OfertaDeCotizar | null {
  if (!texto?.trim()) return null;
  let detectada: OfertaDeCotizar | null = null;
  if (esMenuDeOpciones(texto)) {
    const distintas = new Set(lamina.map((o) => o.codigo)).size;
    const opciones = /\bla\s+3\b/i.test(texto) ? 3 : distintas >= 3 && !/\bla\s+1\s+o\s+la\s+2\b/i.test(texto) ? 3 : 2;
    detectada = { tipo: "oferta_de_cotizar", clase: "menu", opciones };
  } else if (ofreceCotizarEn(texto)) {
    const codigo = codigoDeLoOfrecido(texto, lamina);
    const medida = codigo ? lamina.find((o) => o.codigo === codigo)?.medida ?? undefined : undefined;
    detectada = {
      tipo: "oferta_de_cotizar",
      clase: "una",
      ...(codigo ? { codigo } : {}),
      ...(medida ? { medida } : {}),
      ...(ofrecioCotizarLaUnica(texto) ? { unica: true } : {}),
    };
  }
  if (!detectada) return null;
  if (declarada && declarada.clase === detectada.clase) return { ...detectada, ...declarada };
  return detectada;
}

/** Una fila del hilo, como sale de `messages` (el orden es viejo → nuevo). */
export interface FilaDelHilo {
  role: string;
  content: unknown;
  metadata?: Record<string, unknown> | null;
}

export interface OfertaLeida {
  oferta: OfertaDeCotizar | null;
  /**
   * «hecho»: el hilo tiene salientes con el hecho guardado (aunque ninguno vigente).
   * «respaldo»: ninguna fila del tramo trae el hecho —hilo anterior al deploy—;
   * quien llama cae a la lectura vieja del texto y lo deja en el log.
   */
  fuente: "hecho" | "respaldo";
  /** Mensajes del cliente entre la oferta y el turno actual (0 = la oferta fue el último turno del bot). */
  turnosAtras: number;
}

/** «Voy a mirar en Ibarra», «ya compré», «no gracias»: el cliente se apartó de la oferta. */
function seApartoDeLaOferta(texto: string): boolean {
  const n = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return esNegativaCorta(texto)
    || /\bno\s+gracias\b|\bya\s+compre\b|\bya\s+no\b|\b[bv]oy\s+a\s+(?:mirar|ver|pensar|comparar)\b|\blo\s+(?:voy\s+a\s+)?pienso\b/.test(n);
}

/**
 * La oferta de cotizar vigente en el hilo, leída del HECHO guardado.
 *
 * Los mensajes del cliente del final son el turno que se está evaluando y no
 * cuentan. Hacia atrás: una cotización enviada (la pieza `quote`) mata la
 * oferta; una negativa del cliente también; con más de dos mensajes suyos en el
 * medio, la oferta ya es vieja. Un menú se cierra si el cliente ya eligió
 * después de él («La 2») aunque el bot no haya podido cotizar.
 */
export function ofertaVigente(hilo: readonly FilaDelHilo[]): OfertaLeida {
  let fin = hilo.length - 1;
  while (fin >= 0 && hilo[fin].role === "user") fin--;
  let clientesEnMedio = 0;
  let yaEligio = false;
  let hayHecho = false;
  // Una fila del bot SIN la clave (anterior al deploy) dentro del tramo: si no
  // aparece una oferta guardada, la respuesta la tiene el respaldo. Si no, un
  // hilo abierto el día del deploy —oferta vieja sin hecho, un turno nuevo sin
  // oferta, y el «Si»— perdía la oferta (simulador, 20-oct, chat 27992).
  let filaSinHecho = false;
  const fuenteSinOferta = (): OfertaLeida["fuente"] => (hayHecho && !filaSinHecho ? "hecho" : "respaldo");
  for (let i = fin; i >= 0 && clientesEnMedio <= 2; i--) {
    const fila = hilo[i];
    const texto = typeof fila.content === "string" ? fila.content : "";
    if (fila.role === "user") {
      if (seApartoDeLaOferta(texto)) return { oferta: null, fuente: fuenteSinOferta(), turnosAtras: clientesEnMedio };
      if (respuestaDePreferencia(texto) !== null || eligePosicionDelMenu(texto)) yaEligio = true;
      clientesEnMedio += 1;
      continue;
    }
    if (fila.role !== "assistant") continue;
    const metadata = fila.metadata ?? {};
    // La cotización enviada es un hecho de la pieza (`piece: "quote"`, que ya
    // guardaban las cotizaciones antes de este cambio), no una lectura del texto.
    if (metadata.piece === "quote") {
      return { oferta: null, fuente: "hecho", turnosAtras: clientesEnMedio };
    }
    if (!("oferta" in metadata)) {
      // Las piezas (lámina, cotización) nunca llevan la clave: no cuentan.
      if (!("piece" in metadata)) filaSinHecho = true;
      continue;
    }
    hayHecho = true;
    const oferta = metadata.oferta as OfertaDeCotizar | null;
    if (!oferta || oferta.tipo !== "oferta_de_cotizar") continue;
    // El mismo turno que ENTREGÓ la cotización no deja una oferta viva, aunque
    // su cierre suene a oferta: la pieza `quote` de ese turno manda.
    for (let j = i - 1; j >= 0 && hilo[j].role !== "user"; j--) {
      if (hilo[j].role === "assistant" && (hilo[j].metadata ?? {}).piece === "quote") {
        return { oferta: null, fuente: "hecho", turnosAtras: clientesEnMedio };
      }
    }
    if (oferta.clase === "menu" && yaEligio) return { oferta: null, fuente: "hecho", turnosAtras: clientesEnMedio };
    return { oferta, fuente: "hecho", turnosAtras: clientesEnMedio };
  }
  return { oferta: null, fuente: fuenteSinOferta(), turnosAtras: clientesEnMedio };
}

/**
 * Un sí que no deja dudas: trae «sí», «dale», «claro», «listo» o el verbo de
 * cotizar. «Ok» o «gracias» solos son acuse de lo último que se dijo, y si
 * entre la oferta y este mensaje hubo otra respuesta del bot, no se puede
 * asumir que contestan la oferta vieja.
 */
export function esSiFuerte(mensajeDelCliente: string): boolean {
  if (!respondeQueSi(mensajeDelCliente)) return false;
  return palabrasDelAcuse(mensajeDelCliente).some((p) =>
    /^(?:si|sip|dale|dele|claro|listo|deuna|hagale|hagalo|hagala|perfecto|obvio|exacto|las|el|esa|ese)$/.test(p) || /^coti[cz]/.test(p));
}

/**
 * ¿El mensaje acepta la oferta de UNA llanta del hecho?
 *
 * Pegado a la oferta (`turnosAtras` 0) vale cualquier sí, también el acuse
 * («Gracias» a «¿Se la cotizo?», conv 11070) y el «Precio por favor» a la
 * única. Con otra respuesta en el medio, solo el sí fuerte.
 */
export function aceptaLaOferta(leida: OfertaLeida, mensajeDelCliente: string): boolean {
  const oferta = leida.oferta;
  if (!oferta || oferta.clase !== "una") return false;
  if (leida.turnosAtras === 0) {
    return respondeQueSi(mensajeDelCliente)
      || (Boolean(oferta.unica) && mensajeDelCliente.length <= 60
        && !/\?[^?]*\?|,\s*y\b/.test(mensajeDelCliente) && pidioPrecioOCotizacion(mensajeDelCliente));
  }
  return esSiFuerte(mensajeDelCliente);
}

/** Opciones del menú abierto según el hecho; 0 si no hay menú vigente. */
export function opcionesDelMenuAbierto(leida: OfertaLeida): number {
  return leida.oferta?.clase === "menu" ? leida.oferta.opciones ?? 3 : 0;
}

/**
 * ¿El sí consiente ESTA llanta? Para la equivalente de otra medida y para el
 * cambio de marca: la oferta vigente tiene que haber nombrado esta llanta (por
 * código, o por la medida si no se resolvió el código) y el cliente decir que sí.
 */
export function consienteEsta(
  leida: OfertaLeida,
  producto: { codigo: string; medida?: string | null },
  mensajeDelCliente: string,
): boolean {
  const oferta = leida.oferta;
  if (!oferta || oferta.clase !== "una") return false;
  const pelar = (m: string) => m.toLowerCase().replace(/[\s\-/x×r*]/g, "");
  const esEsta = oferta.codigo
    ? oferta.codigo === producto.codigo
    : Boolean(oferta.medida && producto.medida && pelar(oferta.medida) === pelar(producto.medida));
  return esEsta && aceptaLaOferta(leida, mensajeDelCliente);
}

/** El hecho para el Guardián: lo mismo que leen el agente y los candados. */
export function hechoDeOfertaVigente(leida: OfertaLeida, nombre?: string | null): string | null {
  const oferta = leida.oferta;
  if (!oferta) return null;
  if (oferta.clase === "menu") {
    return `OFERTA VIGENTE (hecho guardado al enviarla): un MENÚ de ${oferta.opciones ?? 3} opciones para que el cliente elija cuál cotizar. Un acuse o una cantidad no eligen ninguna.`;
  }
  const llanta = nombre ? `la *${nombre}*${oferta.medida ? ` en ${oferta.medida}` : ""}` : "UNA llanta";
  return `OFERTA VIGENTE (hecho guardado al enviarla): el bot ofreció cotizar ${llanta}${leida.turnosAtras ? ` (hace ${leida.turnosAtras} mensaje(s) del cliente)` : ""}. Un sí del cliente acepta ESA llanta y nada más.`;
}
