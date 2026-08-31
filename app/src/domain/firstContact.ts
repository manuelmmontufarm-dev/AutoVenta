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
 * Entrada estable y sin IA: se presenta, dice qué sabe hacer y deja claras las
 * TRES puertas (medida escrita, foto del costado, vehículo) antes de pedir
 * nada. Texto aprobado por Manuel el 31-ago-2026 — cambiarlo se consulta.
 */
export function firstContactReply(): string {
  return [
    "¡Hola! 👋 Soy el asistente de Depot Tire. Le cotizo al instante con stock y precios reales, comparo modelos y le armo su cotización para tienda.",
    "",
    "Puede mandarme la medida escrita, una foto del costado de la llanta o decirme su vehículo.",
    "",
    "¿Qué medida usa? Ej: 225/65R17",
  ].join("\n");
}
