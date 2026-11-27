/**
 * Botones de WhatsApp: qué pregunta del bot se puede tocar en vez de escribir.
 *
 * De dónde sale: Manuel, 27-ago-2026, viendo el bot preguntar la escalera con
 * una lista numerada («1) Costo 2) Equilibrio 3) Premium») y el local con una
 * frase que `storeSelection` tiene ~50 líneas de regex para volver a entender.
 * La Cloud API ofrece hasta 3 botones de respuesta; tocarlos devuelve un id
 * exacto en vez de texto que hay que adivinar.
 *
 * DOS REGLAS MANDAN SOBRE TODO LO DEMÁS:
 *
 *  1. **El bot funciona igual sin botones.** Un toque se traduce al texto que
 *     el cliente habría escrito y entra por el MISMO pipeline. Ningún camino
 *     nuevo, ningún parser nuevo: `respuestaDePreferencia`, `explicitStore` y
 *     `extractCustomerCommitment` siguen siendo los que deciden. Por eso
 *     `textoDeBoton` devuelve frases que esos tres ya entendían ayer.
 *
 *  2. **Solo se ofrece lo que se puede entregar.** Misma lección que
 *     `menuDePreferencia` (26ce2fe): la pieza no siempre trae tres escalones, y
 *     ofrecer «Equilibrio» cuando no existe es peor que ofrecer dos cosas. Los
 *     botones se arman leyendo lo que el bloque REALMENTE dice.
 *
 * Puro y sin base ni red, igual que el resto de los candados: se prueba sin
 * levantar nada.
 */
import { ETIQUETA_DEL_ESCALON, type Preferencia } from "./salesIntent.js";
import { preguntaElLocal } from "./storeSelection.js";
import { preguntaElDia } from "./customerCommitment.js";
import { negocio } from "../negocio/index.js";
import { politica } from "../negocio/politica.js";
import { esLaListaNumerada } from "./salesIntent.js";

/** Tope duro de la Cloud API: tres botones de respuesta por mensaje. */
export const MAX_BOTONES = 3;
/** Tope duro de la Cloud API: 20 caracteres por título de botón. */
export const MAX_TITULO = 20;
/** Tope duro de la Cloud API: 1024 caracteres en el cuerpo de un mensaje con botones. */
export const MAX_CUERPO = 1024;

export interface Boton {
  /** `escalera:premium:c9`. El ciclo detecta el toque a un mensaje viejo. */
  id: string;
  titulo: string;
}

export interface BloqueConBotones {
  /** El texto que se manda como cuerpo; puede ser más corto que el bloque. */
  cuerpo: string;
  botones: Boton[];
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** Mayúscula inicial sin tocar el resto: «viernes» → «Viernes». */
const capitalizar = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * ¿Este bloque es el menú de la escalera, y con qué escalones?
 *
 * Se lee del texto y no de un parámetro a propósito: `menuDePreferencia` ya
 * renumera según lo que la pieza trajo, así que el bloque es la única fuente
 * que sabe qué se le ofreció de verdad al cliente.
 */
export function escalonesDelMenu(bloque: string): Preferencia[] {
  const orden: Preferencia[] = ["precio", "equilibrada", "premium"];
  return orden.filter((k) => bloque.includes(`*${ETIQUETA_DEL_ESCALON[k]}*`));
}

/**
 * La pregunta del local con dónde queda cada uno, antes de los botones.
 *
 * Manuel, 17-nov (Competimotor): «Mundillantas Falken / Mundillantas Kenda /
 * Competimotor» no le dicen al cliente cuál le queda cerca; en Depot sí, porque
 * los locales se llaman como su barrio. Solo con `referencia` en el perfil.
 */
export function conDondeQueda(bloque: string): string {
  const conReferencia = negocio.locales.filter((local) => local.referencia);
  if (!conReferencia.length) return bloque;
  const lineas = conReferencia.map((local) =>
    `📍 *${local.nombreCorto}* (${local.referencia}): ${local.mapsUrl ?? ""}`.trimEnd());
  return `${lineas.join("\n")}\n\n${bloque}`;
}

/** ¿Algún bloque ya trae la lista de locales con su ubicación (links o referencias)? */
function yaDijoDondeQuedan(bloques: readonly string[]): boolean {
  const locales = negocio.locales.filter((local) => local.mapsUrl || local.referencia);
  return bloques.some((b) =>
    locales.some((local) => (local.mapsUrl && b.includes(local.mapsUrl)) || (local.referencia && b.includes(local.referencia))));
}

/** Quita las líneas numeradas: con botones, repetirlas es ruido. */
function sinLineasNumeradas(bloque: string): string {
  return bloque
    .split("\n")
    .filter((linea) => !/^\s*\d\)\s/.test(linea))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * El texto en que se traduce el toque a «Otro día».
 *
 * Es una frase entera y no «otro día» a secas. Con las dos palabras sueltas el
 * agente no entendía qué se le pedía y llamaba a `escalar_a_asesor`: en el
 * simulador (27-ago) el toque abrió una alerta `caso_sin_resolver` y le avisó a
 * un humano porque el cliente quería cambiar de fecha. Dicha como la diría un
 * cliente, el turno se resuelve solo.
 *
 * No puede traer un día ni un verbo de intención: `extractCustomerCommitment`
 * la leería como una fecha y registraría una visita que nadie agendó.
 */
export const TEXTO_OTRO_DIA = "ninguno de esos días me queda bien, prefiero otro";

const normalizar = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** ¿El cliente acaba de decir que ninguno de los días ofrecidos le sirve? */
export function pidioOtroDia(mensajeDelCliente: string | null | undefined): boolean {
  return normalizar(mensajeDelCliente ?? "") === normalizar(TEXTO_OTRO_DIA);
}

export interface OpcionesDeBotones {
  ciclo: number;
  /** Lo último que dijo el cliente, para no re-ofrecerle lo que ya rechazó. */
  mensajeDelCliente?: string | null;
  /** Ahora, para calcular «mañana» y el día siguiente hábil. */
  ahora?: Date;
  /**
   * Los bloques ANTERIORES del mismo turno. Si alguno ya dijo dónde quedan los
   * locales, la pregunta del local no lo repite (17-nov: salía dos veces).
   */
  bloquesAnteriores?: readonly string[];
  /** ¿El local atiende ese día? Sin predicado se asume que sí. */
  estaAbierto?: (fecha: Date) => boolean;
  /**
   * ¿La lista numerada lleva botones? Por defecto lo dice la política del
   * cliente (`politica.botonesDeOpciones`); las pruebas lo fijan a mano.
   */
  botonesDeOpciones?: boolean;
}

/**
 * Las posiciones que la pregunta de la lista ofrece: «¿Le cotizo la 1 o la 2?»
 * → [1, 2]. Se leen de la PREGUNTA, no de la lista: es lo que el cliente puede
 * contestar, y la repregunta («¿Cuál le cotizo, la 1, la 2 o la 3?») no trae
 * las líneas de la lista.
 */
function posicionesDeLaPregunta(bloque: string): number[] {
  const pregunta = bloque.split("\n").reverse().find((l) => esLaListaNumerada(l)) ?? "";
  return [...new Set([...pregunta.matchAll(/\bla\s+([1-3])\b/gi)].map((m) => Number(m[1])))].sort();
}

/** «1 · KENDA KR29 — $95.00 c/u · 4 = $380.00» → «KENDA KR29», si el bloque trae la línea. */
function nombreDeLaLinea(bloque: string, n: number): string | null {
  const linea = bloque.split("\n").find((l) => new RegExp(`^\\s*\\*?${n}\\s*[·.)]`).test(l));
  const nombre = linea?.replace(/^\s*\*?\d\s*[·.)]\s*/, "").split(/\s+—\s+/)[0]?.replace(/\*/g, "").trim();
  return nombre || null;
}

/**
 * Los dos días concretos que se ofrecen, más «Otro día».
 *
 * Nunca ofrece HOY: esto sale como cierre de una cotización, y para cuando el
 * cliente lo lee el local puede estar cerrado. Un botón que agenda una visita a
 * puerta cerrada es peor que no tener botón.
 */
export function diasSugeridos(
  ahora: Date,
  estaAbierto: (fecha: Date) => boolean = () => true,
): { fecha: Date; titulo: string; esManana: boolean }[] {
  const hoy = diaCivilEcuador(ahora);
  const dias: { fecha: Date; titulo: string; esManana: boolean }[] = [];
  for (let i = 1; i <= 7 && dias.length < 2; i += 1) {
    const fecha = new Date(hoy.getTime() + i * 86_400_000);
    if (!estaAbierto(fecha)) continue;
    dias.push({
      fecha,
      titulo: i === 1 ? "Mañana" : `El ${DIAS[fecha.getUTCDay()]}`,
      esManana: i === 1,
    });
  }
  return dias;
}

const iso = (fecha: Date): string => fecha.toISOString().slice(0, 10);

/**
 * El día civil de Ecuador, como fecha a mediodía UTC.
 *
 * Calcular los días con `new Date()` a secas los corría uno: a las 23:00 de
 * Quito ya es el día siguiente en UTC, así que el botón «Mañana» apuntaba a
 * pasado mañana y «El viernes» al sábado (visto en el simulador, 27-ago, con el
 * botón rotulado «Mañana» llevando la fecha 2026-08-28 cuando mañana era el 27).
 *
 * Mediodía y no medianoche: deja 12 h de colchón a cada lado, así que ningún
 * desfase de zona puede empujar la fecha al día vecino.
 */
export function diaCivilEcuador(ahora: Date): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Guayaquil",
  }).format(ahora);
  return new Date(`${partes}T12:00:00Z`);
}

/**
 * Convierte el ÚLTIMO bloque de un turno en un mensaje con botones, o null si
 * esa pregunta no es de las cerradas.
 *
 * `null` es la respuesta normal y correcta: la mayoría de los turnos del bot no
 * terminan en una pregunta de conjunto cerrado, y esos siguen saliendo como
 * texto igual que siempre.
 */
export function botonesParaBloque(
  bloque: string,
  opciones: OpcionesDeBotones,
): BloqueConBotones | null {
  const { ciclo, ahora = new Date(), estaAbierto, mensajeDelCliente } = opciones;
  const sufijo = `:c${ciclo}`;

  // LA ESCALERA NO LLEVA BOTONES, A PROPÓSITO.
  //
  // Manuel, 27-ago, después de probarlo en su teléfono: «prefiero que respondan
  // naturalmente ese primer mensaje, para que sientan los que escriben que sí
  // están hablando con un bot competente que responde mensajes más complejos, y
  // después vamos con esas plantillas».
  //
  // Es una decisión de producto y no una limitación: la primera respuesta del
  // cliente es la que le dice si del otro lado hay alguien que entiende o un
  // menú de call center. Tres botones ahí lo resuelven más rápido y lo hacen
  // sentir más tonto. Los botones entran después —local y día—, cuando ya sabe
  // con qué está hablando y lo único que queda son datos de cierre.
  //
  // El menú numerado de Joaquín se queda tal cual: se contesta escribiendo «2»
  // o «la equilibrio», que es lo que `respuestaDePreferencia` entiende.

  // 2 · El local. Salen del perfil del negocio, uno por local: antes eran dos
  // literales acá, y el comentario decía que «viven en la config» cuando no era
  // cierto. Con un solo local no hay nada que elegir y no van botones; el tope
  // de Meta es de tres, así que un negocio con más pregunta por texto.
  if (preguntaElLocal(bloque)) {
    const locales = negocio.locales;
    if (locales.length < 2 || locales.length > MAX_BOTONES) return null;
    return {
      cuerpo: yaDijoDondeQuedan([...(opciones.bloquesAnteriores ?? []), bloque]) ? bloque : conDondeQueda(bloque),
      botones: locales.map((local) => ({
        id: `local:${local.slug}${sufijo}`,
        titulo: local.nombreCorto,
      })),
    };
  }

  // 4 · La lista numerada con precios (Competimotor, 20-nov-2026). Detrás de la
  // perilla `politica.botonesDeOpciones`: Depot la tiene apagada. No es la
  // escalera de arriba (esa decisión de Manuel sigue): esto es la pregunta de
  // CIERRE, cuando el cliente ya vio la lámina y los precios y solo le queda
  // elegir cuál. El cuerpo es el bloque entero —la lista con sus precios va
  // escrita—; los botones solo reemplazan el tener que escribir «la 2».
  if ((opciones.botonesDeOpciones ?? politica.botonesDeOpciones === true) && esLaListaNumerada(bloque)) {
    const posiciones = posicionesDeLaPregunta(bloque);
    if (posiciones.length < 2 || posiciones.length > MAX_BOTONES || bloque.length > MAX_CUERPO) return null;
    return {
      cuerpo: bloque,
      botones: posiciones.map((n) => {
        // La lista suele salir en el bloque ANTERIOR (Competimotor, simulador
        // 20-nov: «1 · TOWNHALL TH161 — …» y después «¿Le cotizo la 1…?» solo).
        const nombre = [bloque, ...[...(opciones.bloquesAnteriores ?? [])].reverse()]
          .map((b) => nombreDeLaLinea(b, n)).find(Boolean) ?? null;
        return { id: `opcion:${n}${sufijo}`, titulo: nombre ? `${n} · ${nombre}` : `Opción ${n}` };
      }),
    };
  }

  // 3 · El día de la visita. Dos días concretos y la salida a texto libre.
  if (preguntaElDia(bloque)) {
    // SI ACABA DE TOCAR «OTRO DÍA», LA REPREGUNTA VA SIN BOTONES.
    //
    // Manuel, 27-ago: «no nos compliquemos por usar botones; si elige otro día,
    // que solo pregunte cuál por chat». Y probado en el simulador: volver a
    // pintar los mismos tres —«Otro día» incluido— es un bucle, y el cliente que
    // ya dijo que ninguno le sirve tiene que poder escribir el suyo.
    if (pidioOtroDia(mensajeDelCliente)) return null;
    const dias = diasSugeridos(ahora, estaAbierto);
    if (!dias.length) return null;
    // Sprint 2 (Competimotor): si la pregunta OFRECE hoy («¿Puede acercarse hoy
    // o qué día le agendo la cita?» — solo sale con el local abierto y tiempo
    // para atenderlo), el primer botón es «Hoy». Sin esa frase nunca hay «Hoy».
    const ofreceHoy = /\bacercarse hoy\b/i.test(bloque);
    return {
      cuerpo: bloque,
      botones: [
        ...(ofreceHoy ? [{ id: `dia:${iso(diaCivilEcuador(ahora))}${sufijo}`, titulo: "Hoy" }] : []),
        ...(ofreceHoy ? dias.slice(0, 1) : dias).map((d) => ({ id: `dia:${iso(d.fecha)}${sufijo}`, titulo: d.titulo })),
        { id: `dia:otro${sufijo}`, titulo: "Otro día" },
      ].slice(0, MAX_BOTONES),
    };
  }

  return null;
}

/**
 * Traduce un toque al texto que el cliente habría escrito.
 *
 * Cada frase de aquí está elegida para que la entienda el parser que YA existe:
 * «económica» cae en `respuestaDePreferencia`, «Cumbayá» en `explicitStore`, y
 * «voy el viernes» trae el verbo que `extractCustomerCommitment` exige. Cambiar
 * una de estas frases sin mirar su parser rompe el botón en silencio.
 *
 * `ciclo` es el de la conversación AHORA: si no coincide con el del id, el
 * cliente tocó un mensaje viejo (WhatsApp los deja tocables para siempre) y esa
 * respuesta no es de esta conversación. Se devuelve el título tal cual, que
 * entra como texto suelto y lo atiende el agente.
 */
export function textoDeBoton(id: string, titulo: string, ciclo: number, ahora = new Date()): string {
  const partes = id.split(":");
  const cicloDelBoton = partes[partes.length - 1];
  // TOQUE A UN MENSAJE VIEJO: se cuenta, no se obedece.
  //
  // WhatsApp deja los botones tocables para siempre, así que un cliente que
  // sube por el chat puede tocar el «Quito Sur» de un ciclo cerrado. Devolver el
  // TÍTULO parecía inofensivo y no lo era: «Quito Sur» es exactamente el texto
  // que `extractExplicitStore` entiende, así que el toque viejo cambiaba el
  // local igual (simulador, 27-ago — el test afirmaba el mecanismo y no el
  // efecto, y por eso pasaba). Entra como nota entre corchetes, el mismo formato
  // que ya se usa para lo que el bot no puede leer: el agente lo ve y pregunta.
  if (cicloDelBoton !== `c${ciclo}`) {
    // El TÍTULO no va en la nota. Meterlo parecía informativo y reintroducía el
    // bug entero: «Quito Sur» dentro del texto lo lee `extractExplicitStore`
    // igual, y el toque viejo volvía a cambiar el local. La nota tiene que ser
    // inerte para TODOS los parsers, y eso significa no nombrar la opción.
    void titulo;
    // Ni el título NI palabras de tiempo: «ahora» al final de la frase lo leía
    // `extractCustomerCommitment` como una fecha y registraba una visita para
    // hoy (lo cazó el test de efecto, no la lectura del código). La nota se
    // prueba contra los tres parsers, no contra el ojo.
    return "[El cliente tocó un botón de un mensaje anterior de esta conversación, no del último. Pregúntale qué necesita.]";
  }

  const [familia, valor] = partes;
  if (familia === "escalera") {
    if (valor === "precio") return "económica";
    if (valor === "equilibrada") return "equilibrio";
    if (valor === "premium") return "premium";
  }
  if (familia === "local") {
    // El nombre corto es exactamente lo que `extractExplicitStore` entiende:
    // el toque entra como si el cliente hubiera escrito «Cumbayá».
    const local = negocio.locales.find((l) => l.slug === valor);
    if (local) return local.nombreCorto;
  }
  if (familia === "opcion" && /^[1-3]$/.test(valor ?? "")) {
    // «la 2» es la forma seca que entienden todos los lectores de la elección
    // (`posicionElegida`, `escalonContestado`, el candado de la cantidad): el
    // toque elige la opción 2, nunca dos llantas.
    return `la ${valor}`;
  }
  if (familia === "dia") {
    if (valor === "otro") return TEXTO_OTRO_DIA;
    const fecha = new Date(`${valor}T12:00:00Z`);
    if (Number.isNaN(fecha.getTime())) return titulo;
    const manana = new Date(diaCivilEcuador(ahora).getTime() + 86_400_000);
    if (iso(fecha) === iso(diaCivilEcuador(ahora))) return "voy hoy";
    if (iso(fecha) === iso(manana)) return "voy mañana";
    return `voy el ${DIAS[fecha.getUTCDay()]}`;
  }
  return titulo;
}

/** Recorta un título al tope de Meta. Un mensaje feo sale; uno inválido no. */
export function recortarTitulo(titulo: string): string {
  return titulo.length <= MAX_TITULO ? titulo : `${titulo.slice(0, MAX_TITULO - 1)}…`;
}
