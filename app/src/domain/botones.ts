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

/** Tope duro de la Cloud API: tres botones de respuesta por mensaje. */
export const MAX_BOTONES = 3;
/** Tope duro de la Cloud API: 20 caracteres por título de botón. */
export const MAX_TITULO = 20;

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

/** Quita las líneas numeradas: con botones, repetirlas es ruido. */
function sinLineasNumeradas(bloque: string): string {
  return bloque
    .split("\n")
    .filter((linea) => !/^\s*\d\)\s/.test(linea))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface OpcionesDeBotones {
  ciclo: number;
  /** Ahora, para calcular «mañana» y el día siguiente hábil. */
  ahora?: Date;
  /** ¿El local atiende ese día? Sin predicado se asume que sí. */
  estaAbierto?: (fecha: Date) => boolean;
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
  const { ciclo, ahora = new Date(), estaAbierto } = opciones;
  const sufijo = `:c${ciclo}`;

  // 1 · La escalera de precio. Con un solo escalón no se pregunta nada.
  const escalones = escalonesDelMenu(bloque);
  if (escalones.length >= 2) {
    return {
      cuerpo: sinLineasNumeradas(bloque),
      // El título del botón ES la etiqueta del menú, sin adornos: el cliente
      // acaba de leer «*Costo* — la más conveniente de precio» y toca «Costo».
      // Un «La costo» pegado delante no lo ayuda y encima está mal escrito
      // (visto en el simulador, 27-ago).
      botones: escalones.map((k) => ({
        id: `escalera:${k}${sufijo}`,
        titulo: ETIQUETA_DEL_ESCALON[k],
      })),
    };
  }

  // 2 · El local. Son exactamente dos y viven en la config del negocio.
  if (preguntaElLocal(bloque)) {
    return {
      cuerpo: bloque,
      botones: [
        { id: `local:cumbaya${sufijo}`, titulo: "Cumbayá" },
        { id: `local:quito_sur${sufijo}`, titulo: "Quito Sur" },
      ],
    };
  }

  // 3 · El día de la visita. Dos días concretos y la salida a texto libre.
  if (preguntaElDia(bloque)) {
    const dias = diasSugeridos(ahora, estaAbierto);
    if (!dias.length) return null;
    return {
      cuerpo: bloque,
      botones: [
        ...dias.map((d) => ({ id: `dia:${iso(d.fecha)}${sufijo}`, titulo: d.titulo })),
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
    if (valor === "cumbaya") return "Cumbayá";
    if (valor === "quito_sur") return "Quito Sur";
  }
  if (familia === "dia") {
    if (valor === "otro") return "otro día";
    const fecha = new Date(`${valor}T12:00:00Z`);
    if (Number.isNaN(fecha.getTime())) return titulo;
    const manana = new Date(diaCivilEcuador(ahora).getTime() + 86_400_000);
    if (iso(fecha) === iso(manana)) return "voy mañana";
    return `voy el ${DIAS[fecha.getUTCDay()]}`;
  }
  return titulo;
}

/** Recorta un título al tope de Meta. Un mensaje feo sale; uno inválido no. */
export function recortarTitulo(titulo: string): string {
  return titulo.length <= MAX_TITULO ? titulo : `${titulo.slice(0, MAX_TITULO - 1)}…`;
}
