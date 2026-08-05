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
    falla: (r, ctx) => ctx.etapa === "nuevo" && !ctx.clienteDioMedida
      && !/\b(?:medida|205|\d{3}\/\d{2}|costado|placa|modelo de tu (?:carro|veh[íi]culo))\b/i.test(r),
  },
  {
    // Regla de Joaquín (5-ago): «hay que decirle al mijin del bot que no pida
    // fotos hasta que no pueda leer». El bot no procesa imágenes: pedir una
    // foto deja la conversación en un callejón sin salida.
    id: "pide_foto",
    gravedad: "critica",
    descripcion: "Pide una foto o imagen que el bot no puede leer",
    falla: (r) => /(?:m[áa]nd|mand|env[íi]|enviar|comp[áa]rt)[^.?!\n]{0,50}(?:foto|imagen)|foto (?:de la etiqueta|del costado|de la puerta)/i.test(r),
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
