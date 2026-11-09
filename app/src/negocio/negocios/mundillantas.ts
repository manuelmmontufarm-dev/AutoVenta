/**
 * MUNDILLANTAS / COMPETIMOTOR (Santo Domingo) — el segundo cliente, en prueba
 * de 2 semanas desde el pitch del 4-nov-2026.
 *
 * UN negocio con DOS marcas comerciales: Mundillantas (2 locales) y
 * Competimotor (1 local). El bot se presenta con las dos y, cuando el cliente
 * elige local, habla y cotiza con la marca de ese local.
 *
 * Acá va SOLO lo confirmado en el pitch, en las respuestas de Jenny del
 * 6-nov-2026 (`docs/clientes/mundillantas-arranque.md`) y en la ficha
 * (`docs/clientes/mundillantas.md`).
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
  "Mundillantas Kenda · pin (Jenny reenvió el mismo de Falken el 6-nov; puesto el de Falken)",
  "garantías por marca: meses del seguro contra impacto y años de fábrica (en 0 hasta que Jenny los dé)",
  "domingo cerrado es un SUPUESTO del pitch (lunes–sábado confirmado)",
];

/**
 * Pines que mandó Jenny por WhatsApp el 6-nov-2026. El de Falken (km 2) cae a
 * 6 m del Plus Code PRQ7+887 que antes usábamos como «matriz»: era este local.
 * El de Competimotor (km 1½) queda ~470 m hacia el centro, como corresponde.
 */
const PIN_FALKEN = { lat: -0.26177, lng: -79.186684 };
const PIN_COMPETIMOTOR = { lat: -0.259614, lng: -79.183052 };
const maps = (pin: { lat: number; lng: number }) => `https://maps.google.com/?q=${pin.lat},${pin.lng}`;

export const MUNDILLANTAS: PerfilDeNegocio = {
  id: "mundillantas",
  nombre: "Mundillantas",
  ciudad: "Santo Domingo",
  telefono: "[PENDIENTE] número de WhatsApp del bot (Jenny dio los de los asesores, no el del bot)",
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
  // Las cuatro con garantía y seguro contra impacto (Jenny, 6-nov). Los
  // letreros muestran más (Toyo, BFGoodrich, Aeolus); el catálogo manda.
  marcas: ["Kenda", "Falken", "Winrun", "Maxxis"],
  identidades: [
    { id: "mundillantas", nombre: "Mundillantas", locales: ["matriz", "local2"] },
    { id: "competimotor", nombre: "Competimotor", locales: ["competimotor"] },
  ],
  // Antes de elegir local, el bot habla por las dos marcas (decidido en
  // MULTICLIENTE.md §3.3: un solo número de WhatsApp para las dos).
  // Competimotor primero: Manuel lo pidió así el 6-nov, igual que el logo.
  presentacion: { modo: "combinada", frase: "Competimotor y Mundillantas" },
  // Los tres están sobre la Vía Quevedo, así que «quevedo» no elige ninguno.
  // «falken» y «kenda» solos tampoco: son marcas que el cliente pide.
  locales: [
    {
      // El slug se queda en «matriz»: es la clave de los botones y del horario.
      slug: "matriz",
      nombre: "Mundillantas Falken",
      nombreCorto: "Mundillantas Falken",
      direccion: "Vía Quevedo km 2 y Manuel Borrero, margen derecho, Santo Domingo",
      lat: PIN_FALKEN.lat,
      lng: PIN_FALKEN.lng,
      mapsUrl: maps(PIN_FALKEN),
      claveHorario: "matriz",
      comoLoNombran: /\bmundi(llantas)?\s+falken\b|\bfalken\s+mundi|\bmanuel\s+borrero\b|\bkm\.?\s*2\b|\bkilometro\s+2\b|\bmatriz\b/,
    },
    {
      slug: "local2",
      nombre: "Mundillantas Kenda",
      nombreCorto: "Mundillantas Kenda",
      direccion: "Vía Quevedo km 1½, a una cuadra del Banco Pichincha, margen derecho, Santo Domingo",
      // Jenny reenvió el pin de Falken para este local (PENDIENTES_NUMERICOS).
      // NUNCA se inventa una coordenada: queda el de Falken hasta el real.
      lat: PIN_FALKEN.lat,
      lng: PIN_FALKEN.lng,
      claveHorario: "local2",
      comoLoNombran: /\bmundi(llantas)?\s+kenda\b|\bkenda\s+mundi|\bbanco\s+pichincha\b/,
    },
    {
      slug: "competimotor",
      nombre: "Competimotor",
      nombreCorto: "Competimotor",
      direccion: "Vía Quevedo km 1½ y Juan León Mera #834, Santo Domingo",
      lat: PIN_COMPETIMOTOR.lat,
      lng: PIN_COMPETIMOTOR.lng,
      mapsUrl: maps(PIN_COMPETIMOTOR),
      claveHorario: "competimotor",
      comoLoNombran: /\bcompetimotor\b|\bcompeti\s*motor\b|\bjuan\s+leon\s+mera\b/,
    },
  ],
  // Sin las zonas de Santo Domingo cargadas, el bot pide el pin en vez de
  // adivinar (igual que la plantilla de ejemplo). Las llenan los asesores.
  sectores: [],
  palabrasDeLugarPropias: ["mundillantas", "mundi", "competimotor"],
  iva: 0.15,
  moneda: "USD",
  // Jenny (6-nov): «garantía normal de fábrica y seguro contra impacto» en
  // Kenda, Falken, Winrun y Maxxis, SIN meses ni años. En 0 hasta tener las
  // cifras: el texto dice «por confirmar con el asesor» y no promete plazos.
  garantias: { default: { golpesMeses: 0, fabricaAnios: 0 } },
  vendedor: { nombre: "[PENDIENTE] nombre del vendedor" },
  piezas: {
    antiguedad: "",
    antiguedadClasica: "",
    // Textos de pieza, no la verdad comercial (esa es la política del S4).
    // El Precio A de Fénix ya trae IVA (6-nov). Ecovalor: nadie lo nombró.
    condiciones: "Precios incluyen IVA.",
    condicionesDiaNoche: "Precios con IVA.",
    // Jenny, 6-nov: efectivo, transferencia y todas las tarjetas de crédito
    // hasta 6 meses sin intereses; hasta 1 año con intereses.
    mediosDePago: "Efectivo, transferencia o tarjeta de crédito: hasta 6 meses sin intereses",
    mediosDePagoDiaNoche: "Efectivo · transferencia · tarjeta hasta 6 meses sin intereses",
    // [PENDIENTE] hasta que Jenny aclare su respuesta 4: «por la compra de las
    // 4 llantas incluye todo el servicio y mantenimiento cada 10 mil km […]
    // todo menos alineación». Falta qué es «todo el servicio», si vale con 1–2
    // llantas y por cuánto tiempo el mantenimiento.
    todasIncluyen: "[PENDIENTE] qué incluye la compra de 4 (Jenny: «todo el servicio menos alineación» + mantenimiento cada 10.000 km)",
    impuestosIncluidos: "IVA incluido",
    precioSinDescuento: "[PENDIENTE] frase bajo el precio sin descuento",
    notaDePrecios: "Precios por unidad incluyen IVA.",
    notaDePrecioUnitario: "Precio incluye IVA.",
  },
  // Sin `facturacion` no salen pre-facturas: correcto durante la prueba.
  pendientesNumericos: PENDIENTES_NUMERICOS,
};
