/**
 * Reglas duras de calidad comercial.
 *
 * Son determinísticas a propósito: no dependen de ningún modelo, corren gratis
 * y en milisegundos, y atrapan justo lo que más daño hace en una venta —
 * inventarse un precio, un stock o un descuento que nadie autorizó. Un juez
 * LLM opina sobre el tono; estas reglas no opinan, verifican.
 *
 * Espejan las mismas prohibiciones que el prompt le pone al bot y que
 * `isSafeCopy` aplica a los seguimientos, para que el criterio sea uno solo.
 */

/** El bot está pidiendo el dato que le falta para poder vender. */
const PIDE_UN_DATO =
  /\b(?:medida|aro|rin|costado|foto|imagen|qu[ée] (?:carro|veh[íi]culo|auto))\b/i;

/**
 * Algo concreto en la misma respuesta: llantas, un precio, el rango de aros que
 * hay, o la invitación al local a que se lo midan. Cualquiera salva el turno —
 * lo que no se perdona es pedir y no dar nada.
 *
 * El lookbehind por «no» no es un detalle: «no tengo una medida verificada» es
 * exactamente la frase que el dueño mandó eliminar, y sin él contaba como oferta
 * por la palabra «tengo». La negación invierte el sentido, no lo matiza.
 */
const OFRECE_ALGO =
  /\$\s?\d|(?<!\bno\s)\b(?:tenemos|manejamos|tengo|hay|le queda|quedan)\b|\bdel \d{2} al \d{2}\b|\bopciones\b|\b(?:pase|ven[ga]|ac[ée]rquese|le medimos|se lo medimos)\b|\blocal(?:es)?\b|\bCumbay[áa]\b|\bQuito Sur\b/i;

const REGLAS = [
  {
    id: "inventa_precio",
    gravedad: "critica",
    descripcion: "Menciona un precio sin que haya cotización ni descuento autorizado",
    falla: (r, ctx) => /\$\s?\d|\d+\s?(?:d[óo]lares|usd)/i.test(r) && !ctx.tienePrecioAutorizado,
  },
  {
    id: "inventa_descuento",
    gravedad: "critica",
    descripcion: "Ofrece descuento, promoción o rebaja sin oferta vigente",
    falla: (r, ctx) => /\b(?:descuento|promoci[óo]n|rebaja|oferta especial|te lo dejo en)\b/i.test(r)
      && !ctx.tieneDescuentoAutorizado,
  },
  {
    id: "inventa_stock",
    gravedad: "critica",
    descripcion: "Afirma disponibilidad o escasez sin dato de inventario",
    falla: (r, ctx) => /\b(?:tenemos en stock|hay disponibles|[úu]ltimas unidades|se est[áa]n agotando|quedan pocas)\b/i.test(r)
      && !ctx.tieneStock,
  },
  {
    id: "inventa_plazo",
    gravedad: "alta",
    descripcion: "Promete una fecha o plazo de entrega concreto",
    falla: (r) => /\b(?:llega|entrega|lo tienes)\b[^.]{0,30}\b(?:ma[ñn]ana|hoy mismo|en \d+ (?:d[íi]as|horas))\b/i.test(r),
  },
  {
    id: "no_pide_medida",
    gravedad: "alta",
    descripcion: "El cliente no dio la medida y el bot no se la pide ni ofrece ayuda para encontrarla",
    // `aro` y `rin` entraron el 8-ago: hasta el commit 28ed12e el dato que se
    // pedía era «la medida», y desde «el aro manda» el bot pregunta el aro —
    // que es lo que el cliente sí sabe mirar. Sin estas dos palabras la regla
    // reprobaba justo la respuesta correcta. Y si salió una pieza (la guía del
    // costado, o las opciones), ya se le ofreció ayuda: eso no es dejarlo solo.
    falla: (r, ctx) => ctx.etapa === "nuevo" && !ctx.clienteDioMedida && !ctx.mandoPieza
      && !/\b(?:medida|aro|rin|205|\d{3}\/\d{2}|costado|placa|modelo de tu (?:carro|veh[íi]culo))\b/i.test(r),
  },
  {
    // Reemplaza a la vieja `pide_foto` (regla de Joaquín, 5-ago: «que no pida
    // fotos hasta que no pueda leer»). Esa se escribió cuando el bot era ciego;
    // desde `services/vision.ts` sí las lee, y la migración 012 repuso esa vía a
    // propósito —prohibirla dejaba fuera el camino más fácil para el cliente que
    // no ubica la medida—. Pedir la foto ya no es el error.
    //
    // El error es el del ticket 2150 (8-ago): pedir el dato y no ofrecer NADA en
    // la misma respuesta. El cliente escribió «xfavor ya le envío y q me ayude
    // con una cotización» y recibió, por tercera vez, «apenas me envíe la foto le
    // hago la cotización». Eso es lo que mata la venta, no la palabra foto.
    id: "pide_sin_ofrecer",
    gravedad: "critica",
    descripcion: "Pide medida, aro o foto sin ofrecer nada concreto en la misma respuesta",
    falla: (r, ctx) => PIDE_UN_DATO.test(r) && !OFRECE_ALGO.test(r) && !ctx.mandoPieza,
  },
  {
    // Regla de Joaquín (5-ago): «no debería confirmar con el vehículo sino ya
    // con la medida que tiene cotizar de una». Con medida en mano, preguntar
    // versión/vehículo es fricción que enfría la venta.
    id: "pregunta_vehiculo_con_medida",
    gravedad: "alta",
    descripcion: "El cliente ya dio la medida y el bot pregunta vehículo/versión en vez de cotizar",
    falla: (r, ctx) => ctx.clienteDioMedida
      && /(?:¿qu[ée] (?:carro|veh[íi]culo|auto)|versi[óo]n de(?:l| su)? (?:auto|carro|veh[íi]culo)|¿me puede dar la versi[óo]n|etiqueta de la puerta|¿de qu[ée] a[ñn]o es)/i.test(r),
  },
  {
    id: "demasiado_largo",
    gravedad: "media",
    descripcion: "Más de 700 caracteres: en WhatsApp no se lee",
    falla: (r) => r.length > 700,
  },
  {
    id: "vacio",
    gravedad: "critica",
    descripcion: "Respuesta vacía o de relleno",
    falla: (r) => r.trim().length < 10 || /^(?:disculpa,? ¿me repites)/i.test(r.trim()),
  },
  {
    id: "exceso_emojis",
    gravedad: "baja",
    descripcion: "Más de 3 emojis: suena a spam",
    falla: (r) => (r.match(/\p{Extended_Pictographic}/gu) ?? []).length > 3,
  },
  {
    id: "sin_pregunta",
    gravedad: "media",
    descripcion: "No hace ninguna pregunta: la conversación se muere ahí",
    falla: (r) => !r.includes("?"),
  },
  {
    id: "se_presenta_de_nuevo",
    gravedad: "media",
    descripcion: "Vuelve a saludar dentro de una conversación ya empezada",
    falla: (r, ctx) => ctx.turno > 1 && /^(?:hola|buenas|buenos d[íi]as|buenas tardes)\b/i.test(r.trim()),
  },
];

export function evaluarReglas(respuesta, contexto) {
  const fallos = REGLAS
    .filter((regla) => {
      try { return regla.falla(respuesta, contexto); } catch { return false; }
    })
    .map(({ id, gravedad, descripcion }) => ({ id, gravedad, descripcion }));
  return {
    fallos,
    criticas: fallos.filter((f) => f.gravedad === "critica").length,
    altas: fallos.filter((f) => f.gravedad === "alta").length,
    aprueba: fallos.every((f) => f.gravedad === "baja" || f.gravedad === "media"),
  };
}

export const REGLAS_IDS = REGLAS.map((r) => r.id);

/** Rúbrica para el juez LLM: lo que las reglas duras no pueden medir. */
export const PROMPT_JUEZ = `Eres un gerente de ventas de una llantera en Ecuador evaluando a un asesor.

Califica ÚNICAMENTE la respuesta del asesor, del 1 al 5, en estas dimensiones:
- utilidad: ¿hace avanzar la venta y responde lo que el cliente preguntó?
- naturalidad: ¿suena a una persona ecuatoriana amable, o a robot/plantilla?
- precision: ¿se apega a los hechos dados y evita inventar datos?
- accion: ¿deja un siguiente paso claro y fácil de responder?

Un 3 es "aceptable". Sé exigente: reserva el 5 para respuestas que de verdad
venden. Si la respuesta inventa cualquier dato, precision no puede pasar de 2.

Devuelve solo JSON: {"utilidad":n,"naturalidad":n,"precision":n,"accion":n,"comentario":"una frase"}`;
