const GENERIC_FIRST_CONTACTS = new Set([
  "hola",
  "buenas",
  "buenos dias",
  "buenas tardes",
  "buenas noches",
  "hola quiero informacion",
  "hola quiero mas informacion",
  "hola quisiera informacion",
  "hola quisiera mas informacion",
  "hola necesito informacion",
  "hola necesito mas informacion",
  "hola me gustaria informacion",
  "hola me gustaria mas informacion",
  "quiero informacion",
  "quiero mas informacion",
  "quisiera informacion",
  "quisiera mas informacion",
  "necesito informacion",
  "necesito mas informacion",
  "mas informacion",
]);

function normalizeFirstContact(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Solo toma saludos vacíos o el texto genérico de los anuncios de Meta.
 * Si el cliente ya dijo producto, vehículo, medida o pregunta concreta, el
 * agente conserva el turno para poder entenderlo y actuar sobre el catálogo.
 */
export function isGenericFirstContact(text: string): boolean {
  return GENERIC_FIRST_CONTACTS.has(normalizeFirstContact(text));
}

/**
 * Entrada estable y sin IA: prioriza el dato más rápido sin hacer creer que el
 * bot es un formulario que únicamente acepta una medida.
 */
export function firstContactReply(): string {
  return [
    "¡Hola! 👋 Le cotizo con stock y precios reales.",
    "Lo más rápido es enviarme la *medida de la llanta* (ej. 225/65R17) o una foto del costado.",
    "Si no la tiene, dígame *marca, modelo y año del vehículo* o el aro; también puedo orientarle según su uso y comparar opciones.",
  ].join("\n");
}
