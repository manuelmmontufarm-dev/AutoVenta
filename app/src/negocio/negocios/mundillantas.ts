/**
 * MUNDILLANTAS / COMPETIMOTOR (Santo Domingo) — el segundo cliente, en prueba
 * de 2 semanas desde el pitch del 4-nov-2026.
 *
 * UN negocio con DOS marcas comerciales: Mundillantas (2 locales) y
 * Competimotor (1 local). Hasta el 18-nov-2026 un solo bot se presentaba con
 * las dos; en el cierre (acta `docs/reuniones/2026-11-18-competimotor-cierre.md`,
 * 31:12–32:20) Jenny pidió lo contrario: dos marcas que se venden por separado,
 * cada una con su número, sus asesores y sus ventas. Desde entonces CADA
 * SERVICIO ES UNA MARCA (`identidadPorDefecto` + la variable `IDENTIDAD`, ver
 * `perfilDelServicio`): el de hoy, «Competimotor Online», es Competimotor y
 * nada más; Mundillantas levantará el suyo con `IDENTIDAD=mundillantas`.
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
  "Mundillantas Kenda · pin (Jenny reenvió el mismo de Falken el 6-nov; puesto el de Falken; 18-nov: «ya le pido este»)",
  // Lo que Jenny todavía no dijo. El 18-nov (tarde y noche) respondió las
  // garantías, el país de origen, qué incluye el mantenimiento, quién paga el
  // envío y cuánto demora la instalación.
  "envíos a otras ciudades: cuánto cuesta (lo paga el cliente; el envío gratis de Black Friday no está confirmado)",
  "promoción de diciembre: cuál es (el 18-nov solo dijo «desde el 10 hasta el 31»; no se anuncia)",
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
// Kenda no tiene ficha propia todavía (Jenny reenvió el pin de Falken). Manuel,
// 17-nov: mientras tanto, la búsqueda de Google Maps con su nombre y dirección.
// No es una coordenada inventada: Maps busca y muestra lo que encuentre.
const MAPS_KENDA = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  "Mundillantas Kenda, Vía Quevedo km 1.5, Santo Domingo, Ecuador",
)}`;

type Respaldo = NonNullable<PerfilDeNegocio["piezas"]["respaldo"]>;

/**
 * El respaldo de las piezas: seguro y garantía (de las cuatro marcas de llanta,
 * igual en los dos servicios) y la tarjeta de locales, que es lo único que
 * cambia de una marca a otra — el de Competimotor no puede listar a Mundillantas.
 */
function respaldoCon(locales: Respaldo[number]): Respaldo {
  return [
    {
      icono: "escudoOk",
      titulo: "SEGURO CONTRA IMPACTO",
      // Jenny, 18-nov: «solo con la factura». Carlos, 20-nov: «las únicas
      // marcas que manejamos con seguro son KENDA y FALKEN».
      detalle: "Incluido con su llanta. Se hace válido con la factura de su compra.",
      marcas: ["Kenda", "Falken"],
    },
    {
      icono: "medalla",
      titulo: "Garantía de fábrica",
      detalle: "Respaldo de la marca contra defectos de fabricación",
      marcas: ["Kenda", "Falken", "Winrun", "Maxxis"],
    },
    locales,
  ];
}

const LOS_TRES_LOCALES: Respaldo[number] = {
  icono: "local",
  titulo: "3 locales",
  detalle: "Competimotor, Mundillantas Falken y Mundillantas Kenda, en Santo Domingo",
};
const LOCALES_MUNDILLANTAS: Respaldo[number] = {
  icono: "local",
  titulo: "2 locales",
  detalle: "Mundillantas Falken y Mundillantas Kenda, en Santo Domingo",
};
const LOCAL_COMPETIMOTOR: Respaldo[number] = {
  icono: "local",
  titulo: "Nuestro local",
  detalle: "Vía Quevedo km 1½ y Juan León Mera, Santo Domingo",
};

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
  // Las cuatro con garantía de fábrica (Jenny, 6-nov); seguro contra impacto,
  // solo Kenda y Falken (Carlos, 20-nov). Los
  // letreros muestran más (Toyo, BFGoodrich, Aeolus); el catálogo manda.
  marcas: ["Kenda", "Falken", "Winrun", "Maxxis"],
  identidades: [
    {
      id: "mundillantas",
      nombre: "Mundillantas",
      locales: ["matriz", "local2"],
      delServicio: {
        // Tienen 3 números (uno por local) y se quedan con uno por marca
        // (acta 18-nov, 02:30); el de Mundillantas no lo eligieron todavía.
        telefono: "[PENDIENTE] número de WhatsApp de Mundillantas",
        piezas: { respaldo: respaldoCon(LOCALES_MUNDILLANTAS) },
      },
    },
    {
      id: "competimotor",
      nombre: "Competimotor",
      locales: ["competimotor"],
      delServicio: { piezas: { respaldo: respaldoCon(LOCAL_COMPETIMOTOR) } },
    },
  ],
  // UNA MARCA POR SERVICIO (cierre del 18-nov). Sin `IDENTIDAD`, el servicio
  // es Competimotor: es el único que existe y el número del bot es el suyo.
  identidadPorDefecto: "competimotor",
  // La frase combinada que salía hasta el 18-nov («Competimotor y
  // Mundillantas») ya no la ve nadie: cada servicio se presenta con su marca.
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
      referencia: "Vía Quevedo km 2 y Manuel Borrero",
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
      mapsUrl: MAPS_KENDA,
      claveHorario: "local2",
      referencia: "Vía Quevedo km 1½, a una cuadra del Banco Pichincha",
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
      referencia: "Vía Quevedo km 1½ y Juan León Mera",
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
  // Jenny, 18-nov (hoja «Garantías»): seguro contra impacto en meses y
  // garantía de fábrica en años, por marca. Falken 1,5 años y Winrun 0,5 se
  // dicen en meses (18 y 6: `plazoDeFabrica`). Las demás marcas, en 0: el texto
  // dice «por confirmar con el asesor» y no promete plazos.
  garantias: {
    default: { golpesMeses: 0, fabricaAnios: 0 },
    Kenda: { golpesMeses: 12, fabricaAnios: 1 },
    Falken: { golpesMeses: 18, fabricaAnios: 1.5 },
    // Carlos, 20-nov-2026 (conv del 265/65R17 Tourador): «Las únicas marcas que
    // manejamos con seguro son KENDA y FALKEN». Winrun y Maxxis se quedan con su
    // garantía de fábrica y sin seguro contra impacto.
    Winrun: { golpesMeses: 0, fabricaAnios: 0.5 },
    Maxxis: { golpesMeses: 0, fabricaAnios: 1 },
  },
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
    // Jenny, 6-nov: «tarjetas de crédito todas hasta 6 meses sin intereses».
    // 3 y 6 caben dentro de ese «hasta 6»; 12 es con intereses y no va.
    cuotasSinIntereses: [3, 6],
    // La oscura con rojo es la de Competimotor (#E42629) y la única que lleva
    // el logo oficial de cada marca de llanta (17-nov).
    plantillaPorDefecto: "diaNoche",
    // Jenny, 6-nov: «garantía normal de fábrica y seguro contra impacto» en
    // Kenda, Falken, Winrun y Maxxis. Desde el 18-nov las cuatro tienen cifras
    // en `garantias` y mandan ellas; esto queda para la tarjeta de locales.
    respaldo: respaldoCon(LOS_TRES_LOCALES),
    // Cómo se llama SU seguro (no el de Depot, que «cubre golpes, cortes o
    // cualquier daño»). Jenny, 18-nov: «solo con la factura y solo en marcas
    // maxxis, falken, kenda y winrun». Nada más: ni qué cubre ni exclusiones.
    // Jenny, 18-nov (noche): dónde se hace cada marca y de qué tecnología es.
    // La primera bandera es el país donde se hace; la segunda, la tecnología.
    origenDeMarcas: {
      FALKEN: { banderas: ["tailandia", "japon"], pais: "TAILANDIA", nota: "tecnología japonesa" },
      KENDA: { banderas: ["china", "taiwan"], pais: "CHINA", nota: "tecnología taiwanesa" },
      MAXXIS: { banderas: ["china", "taiwan"], pais: "CHINA", nota: "tecnología taiwanesa" },
      WINRUN: { banderas: ["china"], pais: "CHINA", nota: "línea de la marca Kenda" },
    },
    seguro: {
      enTexto: "de seguro contra impacto",
      titulo: "SEGURO CONTRA IMPACTO",
      etiqueta: "Impacto",
      corto: "de seguro contra impacto",
      insignia: "SEGURO CONTRA IMPACTO",
      detalle: "Se hace válido con la factura de su compra. Aplica en Kenda y Falken.",
    },
    horarioBajoElPrecio: true,
    letraDelModelo: "deportiva",
  },
  // Sin `facturacion` no salen pre-facturas: correcto durante la prueba.
  // La alineación SOLO con 4 llantas (Jenny, 8-nov): «alineación no porque
  // solo se da cuando lleva las 4 llantas». El mantenimiento cada 10.000 km:
  // Jenny, 18-nov, «si incluido sea 2 o 4 llantas»; y esa noche, qué incluye:
  // «rotación de llantas, revisión mecánica y nitrógeno gratis».
  // `min_quantity` no sabe de «2 o 4»: con 3 también sale, y el texto lo aclara.
  // OJO: esto siembra solo una base NUEVA; en producción la fila se agrega en
  // Ajustes → Promociones (ver el PR del 18-nov).
  beneficiosDeArranque: [
    { text: "Enllantaje, balanceo y nitrógeno" },
    { text: "Alineación (comprando las 4 llantas)", minQuantity: 4 },
    { text: "Mantenimiento cada 10.000 km: rotación, revisión mecánica y nitrógeno (comprando 2 o 4 llantas)", minQuantity: 2 },
  ],
  pendientesNumericos: PENDIENTES_NUMERICOS,
  // Carlos (Competimotor), 20-nov-2026, conv 469: la 30X9.5R15 es la 235/75R15
  // en pulgadas; ahí están sus M/T cuando la métrica no tiene.
  equivalenciasEnPulgadas: [{ metrica: "235/75R15", pulgadas: "30X9.5R15" }],
  // Chat 1456 (24-nov-2026): el asesor vendió 4 KENDA KR628 275/55R20 a quien
  // pidió 305/50R20 (30 mm menos de ancho, 0,3 % de diámetro). Tres pasos de
  // ancho; el diámetro sigue mandando con el mismo 3 %. [DUDA PARA EL DUEÑO]
  anchoMaximoEquivalenteMm: 30,
};
