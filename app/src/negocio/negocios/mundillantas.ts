/**
 * MUNDILLANTAS / COMPETIMOTOR (Santo Domingo) — el segundo cliente, en prueba
 * de 2 semanas desde el pitch del 4-nov-2026.
 *
 * UN negocio con DOS marcas comerciales: Mundillantas (2 locales) y
 * Competimotor (1 local). El bot se presenta con las dos y, cuando el cliente
 * elige local, habla y cotiza con la marca de ese local.
 *
 * Acá va SOLO lo confirmado en el pitch y en la ficha
 * (`docs/clientes/mundillantas.md`, `docs/clientes/mundillantas-arranque.md`).
 * Lo que falta se escribe `[PENDIENTE] <qué falta>` y NUNCA llega a un
 * cliente (candado `sinPendiente`, R-10); lo numérico sin confirmar va en
 * `PENDIENTES_NUMERICOS`. Nada se inventa: ni coordenadas, ni garantías, ni
 * formas de pago.
 */
import type { PerfilDeNegocio } from "../perfil.js";

/**
 * Valores numéricos que todavía son un supuesto. Un número no puede llevar la
 * marca `[PENDIENTE]`, así que se listan acá para que el panel los muestre.
 */
export const PENDIENTES_NUMERICOS = [
  "Local 2 de Mundillantas · dirección y pin (puestos en los de la matriz)",
  "Competimotor · dirección y pin (puestos en los de la matriz)",
  "garantías por marca (en 0 = sin seguro contra golpes hasta que Jenny confirme)",
  "domingo cerrado es un SUPUESTO del pitch (lunes–sábado confirmado)",
];

/**
 * El pin de la matriz sale del Plus Code de su ficha de Google
 * (PRQ7+887 Santo Domingo = 67F2PRQ7+887), decodificado con el algoritmo
 * estándar de Open Location Code: cae sobre la Av. Quevedo, a ~1,7 km del
 * centro, que es exactamente «Av. Quevedo km 1».
 */
const PIN_MATRIZ = { lat: -0.261712, lng: -79.186703 };

export const MUNDILLANTAS: PerfilDeNegocio = {
  id: "mundillantas",
  nombre: "Mundillantas",
  ciudad: "Santo Domingo",
  telefono: "[PENDIENTE] número de WhatsApp de ventas (tienen 6; Jenny elige uno)",
  // Confirmado en el pitch: lunes a sábado 8:00–18:00 (8–12:30 y 12:30–18).
  // Domingo cerrado es un supuesto registrado en PENDIENTES_NUMERICOS.
  horarioEnPalabras: "Lunes a sábado, 8:00–18:00",
  horasPorDia: {
    0: null,
    1: { open: "08:00", close: "18:00" },
    2: { open: "08:00", close: "18:00" },
    3: { open: "08:00", close: "18:00" },
    4: { open: "08:00", close: "18:00" },
    5: { open: "08:00", close: "18:00" },
    6: { open: "08:00", close: "18:00" },
  },
  // Vacío a propósito: «unas 10 marcas» dijo Andrés, pero ninguna confirmada.
  // El catálogo manda sobre esto cuando se cargue.
  marcas: [],
  identidades: [
    { id: "mundillantas", nombre: "Mundillantas", locales: ["matriz", "local2"] },
    { id: "competimotor", nombre: "Competimotor", locales: ["competimotor"] },
  ],
  // Antes de elegir local, el bot habla por las dos marcas (decidido en
  // MULTICLIENTE.md §3.3: un solo número de WhatsApp para las dos).
  presentacion: { modo: "combinada", frase: "Mundillantas y Competimotor" },
  locales: [
    {
      slug: "matriz",
      nombre: "Mundillantas Matriz",
      nombreCorto: "Matriz",
      direccion: "Av. Quevedo km 1, Santo Domingo",
      lat: PIN_MATRIZ.lat,
      lng: PIN_MATRIZ.lng,
      claveHorario: "matriz",
      comoLoNombran: /\bmatriz\b|\bquevedo\b/,
    },
    {
      slug: "local2",
      nombre: "[PENDIENTE] nombre del segundo local de Mundillantas",
      nombreCorto: "[PENDIENTE] nombre corto del local 2",
      direccion: "[PENDIENTE] dirección del segundo local de Mundillantas",
      // El pin real está pendiente (PENDIENTES_NUMERICOS); mientras tanto el de
      // la matriz: NUNCA se inventa una coordenada nueva.
      lat: PIN_MATRIZ.lat,
      lng: PIN_MATRIZ.lng,
      claveHorario: "local2",
      comoLoNombran: /\blocal\s*2\b|\bsegundo\s+local\b/,
    },
    {
      slug: "competimotor",
      nombre: "Competimotor",
      nombreCorto: "Competimotor",
      direccion: "[PENDIENTE] dirección de Competimotor",
      lat: PIN_MATRIZ.lat,
      lng: PIN_MATRIZ.lng,
      claveHorario: "competimotor",
      comoLoNombran: /\bcompetimotor\b|\bcompeti\s*motor\b/,
    },
  ],
  // Sin las zonas de Santo Domingo cargadas, el bot pide el pin en vez de
  // adivinar (igual que la plantilla de ejemplo). Las llenan los asesores.
  sectores: [],
  palabrasDeLugarPropias: ["mundillantas", "mundi", "competimotor"],
  iva: 0.15,
  moneda: "USD",
  // [PENDIENTE] garantías por marca (pregunta 9 de la lista de arranque). En 0:
  // sin seguro contra golpes y sin años de fábrica EN NINGÚN texto hasta que
  // Jenny confirme — mejor callar que prometer la garantía de otro negocio.
  garantias: { default: { golpesMeses: 0, fabricaAnios: 0 } },
  vendedor: { nombre: "[PENDIENTE] nombre del vendedor" },
  piezas: {
    antiguedad: "",
    antiguedadClasica: "",
    // Textos de pieza, no la verdad comercial (esa es la política del S4).
    condiciones: "[PENDIENTE] condiciones de precios al pie de las piezas",
    condicionesDiaNoche: "[PENDIENTE] condiciones de precios (plantilla día y noche)",
    mediosDePago: "[PENDIENTE] formas de pago al pie de las piezas",
    mediosDePagoDiaNoche: "[PENDIENTE] formas de pago (plantilla día y noche)",
    todasIncluyen: "[PENDIENTE] qué incluye toda compra",
    impuestosIncluidos: "[PENDIENTE] frase de impuestos (¿cobran Ecovalor?)",
    precioSinDescuento: "[PENDIENTE] frase bajo el precio sin descuento",
    notaDePrecios: "[PENDIENTE] nota de precios de las listas en texto",
    notaDePrecioUnitario: "[PENDIENTE] nota de precio de la cotización en texto",
  },
  // Sin `facturacion` no salen pre-facturas: correcto durante la prueba.
  pendientesNumericos: PENDIENTES_NUMERICOS,
};
