/**
 * MUNDILLANTAS / COMPETIMOTOR (Santo Domingo) — el segundo cliente, en prueba
 * de 2 semanas desde el pitch del 4-nov-2026.
 *
 * UN negocio con DOS marcas comerciales: Mundillantas (2 locales) y
 * Competimotor (1 local). El bot se presenta con las dos y, cuando el cliente
 * elige local, habla y cotiza con la marca de ese local.
 *
 * Acá va SOLO lo confirmado en el pitch, en las respuestas de Jenny del
 * 6-nov y del 8-nov-2026 (`docs/clientes/mundillantas-arranque.md`) y en la ficha
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
];

/**
 * Links de Google Maps que mandó Jenny el 9-nov-2026 (la ficha de cada local
 * en Maps) y el pin de esa ficha. Reemplazan los pines del 6-nov, que estaban
 * a 6 m (Falken) y 8 m (Competimotor) y salían como `maps.google.com/?q=…`.
 * La ficha de Falken en Maps se llama «Mundillantas Matriz» (Plus Code
 * PRQ7+887). Competimotor (km 1½) queda ~480 m hacia el centro.
 */
const PIN_FALKEN = { lat: -0.2617224, lng: -79.186715 };
const PIN_COMPETIMOTOR = { lat: -0.2595733, lng: -79.1829972 };
const MAPS_FALKEN = "https://maps.app.goo.gl/swNHGotRKPLJn3LZA";
const MAPS_COMPETIMOTOR = "https://maps.app.goo.gl/QTFCzK2KDRXULRwz7";

export const MUNDILLANTAS: PerfilDeNegocio = {
  id: "mundillantas",
  nombre: "Mundillantas",
  ciudad: "Santo Domingo",
  // 11-nov-2026: el bot va en «Competimotor Online», +593 98 548 7924. Carlos
  // (el diseñador) confirmó que los anuncios de Facebook mandan a ese número;
  // el 099 124 4698 que había dicho Jenny el 8-nov es el del punto de venta.
  // OJO: 0985487924 era hasta hoy el celular del asesor Carlos André en
  // Ajustes → Asesores; sus avisos tienen que ir a otro número.
  telefono: "+593 98 548 7924",
  // Jenny, 8-nov: los tres locales atienden igual, «de lunes a viernes de 8am
  // hasta las 6pm y los sábados de 8am hasta las 4pm». El domingo no lo nombró
  // en ninguna respuesta (ni en el pitch): cerrado.
  horarioEnPalabras: "Lunes a viernes 8:00–18:00 y sábados 8:00–16:00",
  horasPorDia: {
    0: null,
    1: { open: "08:00", close: "18:00" },
    2: { open: "08:00", close: "18:00" },
    3: { open: "08:00", close: "18:00" },
    4: { open: "08:00", close: "18:00" },
    5: { open: "08:00", close: "18:00" },
    6: { open: "08:00", close: "16:00" },
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
      mapsUrl: MAPS_FALKEN,
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
      mapsUrl: MAPS_COMPETIMOTOR,
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
    // Jenny, 8-nov (aclara la respuesta ambigua del 6-nov): «comprando las 4
    // llantas incluye alineación, balanceo, nitrógeno y enllantaje, y si llevan
    // una sola llanta incluye solo balanceo, nitrógeno y enllantaje». Es el
    // texto de reserva de la franja; lo que se imprime sale de la tabla
    // `benefits`, filtrado por cantidad (`beneficiosDeArranque`, abajo).
    todasIncluyen: "Enllantaje, balanceo y nitrógeno · alineación comprando las 4",
    impuestosIncluidos: "IVA incluido",
    precioSinDescuento: "[PENDIENTE] frase bajo el precio sin descuento",
    notaDePrecios: "Precios por unidad incluyen IVA.",
    notaDePrecioUnitario: "Precio incluye IVA.",
  },
  // Sin `facturacion` no salen pre-facturas: correcto durante la prueba.
  // La alineación SOLO con 4 llantas (Jenny, 8-nov): «alineación no porque
  // solo se da cuando lleva las 4 llantas». El mantenimiento cada 10.000 km
  // del 6-nov no lo repitió: no se promete.
  beneficiosDeArranque: [
    { text: "Enllantaje, balanceo y nitrógeno" },
    { text: "Alineación (comprando las 4 llantas)", minQuantity: 4 },
  ],
  pendientesNumericos: PENDIENTES_NUMERICOS,
};
