import {
  IVA,
  LOCALES,
  type Cotizacion,
  type FeedItem,
  type ItemCotizacion,
  type Mensaje,
  type MetricasComprobables,
  type Rol,
  type Ticket,
  type TipoMensaje,
} from "../types";

/* ─── Helpers ──────────────────────────────────────────────────────── */

const AHORA = Date.now();
const MIN = 60_000;

/** ISO de hace n minutos. */
const hace = (min: number): string => new Date(AHORA - min * MIN).toISOString();

/** El número va explícito para que coincida con el que se menciona en el chat. */
function cot(numero: number, items: ItemCotizacion[]): Cotizacion {
  const subtotal = items.reduce((s, i) => s + i.cantidad * i.precioUnit, 0);
  const iva = Math.round(subtotal * IVA * 100) / 100;
  return { numero, items, subtotal, iva, total: Math.round((subtotal + iva) * 100) / 100 };
}

const llanta = (medida: string, marca: string, modelo: string, precio: number, cant = 4): ItemCotizacion => ({
  descripcion: `${marca} ${modelo} ${medida}`,
  cantidad: cant,
  precioUnit: precio,
});

const CUMBAYA = LOCALES[0];
const SUR = LOCALES[1];

/* ─── Tickets ──────────────────────────────────────────────────────── */

type TicketSeed = Omit<Ticket, "ultimoMensaje" | "ultimaActividad" | "notas" | "sinLeer"> &
  Partial<Pick<Ticket, "notas" | "sinLeer">>;

const seeds: TicketSeed[] = [
  // ── Abiertos · NUEVO ──
  {
    id: 1, telefono: "+593 98 412 7734", nombre: "Carlos Vinueza", estado: "abierto",
    etapa: "nuevo", atiende: "bot", vehiculo: "Chevrolet Sail 2021",
    esRecurrente: false, sinLeer: 1, creadoEn: hace(8),
  },
  {
    id: 2, telefono: "+593 99 630 2218", nombre: "Andrea Salazar", estado: "abierto",
    etapa: "nuevo", atiende: "bot",
    esRecurrente: false, sinLeer: 2, creadoEn: hace(19),
  },
  {
    id: 3, telefono: "+593 96 884 1057", nombre: null, estado: "abierto",
    etapa: "nuevo", atiende: "bot",
    esRecurrente: false, sinLeer: 1, creadoEn: hace(3),
  },
  // ── Abiertos · MEDIDAS ──
  {
    id: 4, telefono: "+593 98 227 9640", nombre: "María Fernanda Torres", estado: "abierto",
    etapa: "medida_confirmada", atiende: "bot", vehiculo: "Toyota Hilux 2019", medida: "265/65 R17",
    esRecurrente: false, creadoEn: hace(31),
  },
  {
    id: 5, telefono: "+593 99 118 5523", nombre: "Jorge Paredes", estado: "abierto",
    etapa: "medida_confirmada", atiende: "bot", vehiculo: "Suzuki Vitara SZ", medida: "215/60 R16",
    esRecurrente: false, creadoEn: hace(64),
  },
  {
    id: 6, telefono: "+593 96 502 7789", nombre: "Gabriela Almeida", estado: "abierto",
    etapa: "medida_confirmada", atiende: "bot", vehiculo: "Chevrolet Spark GT", medida: "165/70 R13",
    esRecurrente: false, sinLeer: 1, creadoEn: hace(190),
  },
  {
    id: 7, telefono: "+593 98 775 3412", nombre: "Diego Cárdenas", estado: "abierto",
    etapa: "medida_confirmada", atiende: "humano", vehiculo: "Toyota Corolla 2017", medida: "195/65 R15",
    esRecurrente: false, creadoEn: hace(60 * 26), notas: ["Pidió factura a nombre de su empresa (Transcarga S.A.)"],
  },
  // ── Abiertos · COTIZADO ──
  {
    id: 8, telefono: "+593 99 348 8102", nombre: "Verónica Chiriboga", estado: "abierto",
    etapa: "cotizacion_enviada", atiende: "bot", vehiculo: "Kia Sportage 2020", medida: "225/60 R17",
    cotizacion: cot(1024, [llanta("225/60 R17", "Falken", "Ziex ZE310", 133)]),
    esRecurrente: false, creadoEn: hace(55),
  },
  {
    id: 9, telefono: "+593 98 903 4471", nombre: "Paúl Guerrero", estado: "abierto",
    etapa: "cotizacion_enviada", atiende: "bot", vehiculo: "Chevrolet D-Max 2018", medida: "245/70 R16",
    cotizacion: cot(1025, [llanta("245/70 R16", "Kenda", "Klever A/T KR28", 126)]),
    esRecurrente: false, sinLeer: 1, creadoEn: hace(140),
  },
  {
    id: 10, telefono: "+593 96 217 6650", nombre: "Cristina Játiva", estado: "abierto",
    etapa: "cotizacion_enviada", atiende: "bot", vehiculo: "Chevrolet Aveo Family", medida: "185/60 R14",
    cotizacion: cot(1026, [llanta("185/60 R14", "Kenda", "Kaiser KR26", 62)]),
    esRecurrente: false, creadoEn: hace(320),
  },
  {
    id: 11, telefono: "+593 99 445 9083", nombre: "Xavier Bonilla", estado: "abierto",
    etapa: "cotizacion_enviada", atiende: "bot", vehiculo: "Mazda 3 2019", medida: "205/60 R16",
    cotizacion: cot(1027, [llanta("205/60 R16", "Falken", "Sincera SN110", 95, 2)]),
    esRecurrente: true, creadoEn: hace(60 * 27),
  },
  {
    id: 12, telefono: "+593 98 662 1194", nombre: "Daniela Espinosa", estado: "abierto",
    etapa: "cotizacion_enviada", atiende: "bot", vehiculo: "Toyota Yaris", medida: "185/60 R15",
    cotizacion: cot(1028, [llanta("185/60 R15", "Sunoco", "Ecoplus HP", 69)]),
    esRecurrente: false, creadoEn: hace(60 * 30),
  },
  // ── Abiertos · UBICACIÓN ──
  {
    id: 13, telefono: "+593 99 781 2236", nombre: "Marco Rivas", estado: "abierto",
    etapa: "cotizacion_enviada", atiende: "bot", vehiculo: "Mazda BT-50 2020", medida: "255/70 R16",
    cotizacion: cot(1029, [llanta("255/70 R16", "Kenda", "Klever A/T KR28", 136)]),
    localAsignado: { nombre: SUR.nombre, direccion: SUR.direccion, distanciaKm: 3.1 },
    esRecurrente: false, creadoEn: hace(75),
  },
  {
    id: 14, telefono: "+593 96 934 5518", nombre: "Sofía Carrera", estado: "abierto",
    etapa: "cotizacion_enviada", atiende: "bot", vehiculo: "Nissan Kicks 2022", medida: "205/60 R16",
    cotizacion: cot(1030, [llanta("205/60 R16", "Eurolub", "Urban GT", 88)]),
    localAsignado: { nombre: CUMBAYA.nombre, direccion: CUMBAYA.direccion, distanciaKm: 1.8 },
    esRecurrente: false, creadoEn: hace(250),
  },
  {
    id: 15, telefono: "+593 98 550 7621", nombre: "Ricardo Proaño", estado: "abierto",
    etapa: "cotizacion_enviada", atiende: "bot", vehiculo: "Hyundai Tucson 2021", medida: "225/55 R18",
    cotizacion: cot(1031, [llanta("225/55 R18", "Falken", "Azenis FK510", 156)]),
    localAsignado: { nombre: SUR.nombre, direccion: SUR.direccion, distanciaKm: 5.4 },
    esRecurrente: false, creadoEn: hace(60 * 25),
  },
  // ── Abiertos · POR VISITAR ──
  {
    id: 16, telefono: "+593 99 205 8867", nombre: "Karen Moya", estado: "abierto",
    etapa: "seguimiento_venta", atiende: "bot", vehiculo: "Chevrolet Sail 2019", medida: "185/60 R14",
    cotizacion: cot(1032, [llanta("185/60 R14", "Kenda", "Kaiser KR26", 62)]),
    localAsignado: { nombre: CUMBAYA.nombre, direccion: CUMBAYA.direccion, distanciaKm: 2.4 },
    // Día exacto: la tarjeta lo muestra como chip, igual que la medida.
    compromisoCliente: "Voy mañana en la tarde", visitDate: hace(-60 * 20),
    esRecurrente: false, creadoEn: hace(95),
  },
  {
    id: 17, telefono: "+593 98 319 4405", nombre: "Fernando Ortiz", estado: "abierto",
    etapa: "seguimiento_venta", atiende: "humano", vehiculo: "Toyota Fortuner 2020", medida: "265/65 R17",
    cotizacion: cot(1033, [llanta("265/65 R17", "Falken", "Wildpeak A/T3W", 189)]),
    localAsignado: { nombre: SUR.nombre, direccion: SUR.direccion, distanciaKm: 4.2 },
    esRecurrente: false, creadoEn: hace(200), notas: ["Quiere alineación y balanceo incluidos — confirmar precio con taller"],
  },
  {
    id: 18, telefono: "+593 96 448 2270", nombre: "Estefanía Cueva", estado: "abierto",
    etapa: "seguimiento_venta", atiende: "bot", vehiculo: "Kia Rio 2018", medida: "195/55 R16",
    // Sin día exacto: el cliente dio un tramo y el chip conserva el tramo.
    compromisoCliente: "Paso este fin de semana",
    cotizacion: cot(1034, [llanta("195/55 R16", "Sunoco", "Ecoplus HP", 78, 2)]),
    localAsignado: { nombre: CUMBAYA.nombre, direccion: CUMBAYA.direccion, distanciaKm: 6.0 },
    esRecurrente: true, creadoEn: hace(60 * 28),
  },
  // ── Cerrados · GANADO ──
  {
    id: 19, telefono: "+593 98 106 3349", nombre: "Wladimir Pazmiño", estado: "cerrado",
    etapa: "seguimiento_venta", cierre: "ganado", cerradoEn: hace(60 * 49), atiende: "bot",
    vehiculo: "Chevrolet D-Max 2021", medida: "245/70 R16",
    cotizacion: cot(1019, [llanta("245/70 R16", "Kenda", "Klever A/T KR28", 126)]),
    localAsignado: { nombre: SUR.nombre, direccion: SUR.direccion, distanciaKm: 2.2 },
    esRecurrente: false, creadoEn: hace(60 * 52),
  },
  {
    id: 20, telefono: "+593 99 872 5510", nombre: "Nathaly Aguirre", estado: "cerrado",
    etapa: "seguimiento_venta", cierre: "ganado", cerradoEn: hace(60 * 74), atiende: "bot",
    vehiculo: "Chevrolet Sail 2020", medida: "185/60 R14",
    cotizacion: cot(1020, [llanta("185/60 R14", "Kenda", "Kaiser KR26", 62)]),
    localAsignado: { nombre: CUMBAYA.nombre, direccion: CUMBAYA.direccion, distanciaKm: 3.5 },
    esRecurrente: false, creadoEn: hace(60 * 78),
  },
  {
    id: 21, telefono: "+593 96 771 9284", nombre: "Óscar Valdez", estado: "cerrado",
    etapa: "seguimiento_venta", cierre: "ganado", cerradoEn: hace(60 * 98), atiende: "humano",
    vehiculo: "Toyota Hilux 2022", medida: "265/65 R17",
    cotizacion: cot(1021, [llanta("265/65 R17", "Falken", "Wildpeak A/T3W", 189)]),
    localAsignado: { nombre: SUR.nombre, direccion: SUR.direccion, distanciaKm: 1.9 },
    esRecurrente: true, creadoEn: hace(60 * 101), notas: ["Cliente frecuente — 3ra compra. Pidió descuento y se le dio 5%."],
  },
  {
    id: 22, telefono: "+593 98 990 4152", nombre: "Tatiana Rueda", estado: "cerrado",
    etapa: "seguimiento_venta", cierre: "ganado", cerradoEn: hace(60 * 146), atiende: "bot",
    vehiculo: "Toyota Corolla 2016", medida: "195/65 R15",
    cotizacion: cot(1022, [llanta("195/65 R15", "Sunoco", "Ecoplus HP", 73)]),
    localAsignado: { nombre: CUMBAYA.nombre, direccion: CUMBAYA.direccion, distanciaKm: 4.7 },
    esRecurrente: false, creadoEn: hace(60 * 150),
  },
  // ── Cerrados · PERDIDO ──
  {
    id: 23, telefono: "+593 99 514 6673", nombre: "Iván Cabezas", estado: "cerrado",
    etapa: "cotizacion_enviada", cierre: "perdido", cerradoEn: hace(60 * 50), atiende: "bot",
    vehiculo: "Hyundai Tucson 2019", medida: "225/55 R18",
    cotizacion: cot(1023, [llanta("225/55 R18", "Falken", "Azenis FK510", 156)]),
    esRecurrente: false, creadoEn: hace(60 * 55), notas: ["Encontró más barato en el sector de la Marín — sensible al precio"],
  },
  {
    id: 24, telefono: "+593 96 320 8845", nombre: "Priscila Montero", estado: "cerrado",
    etapa: "cotizacion_enviada", cierre: "perdido", cerradoEn: hace(60 * 122), atiende: "bot",
    vehiculo: "Chevrolet Spark", medida: "155/70 R13",
    cotizacion: cot(1035, [llanta("155/70 R13", "Eurolub", "Urban GT", 43)]),
    esRecurrente: false, creadoEn: hace(60 * 125),
  },
  // ── Cerrados · SIN RESPUESTA ──
  {
    id: 25, telefono: "+593 98 634 0027", nombre: "Guillermo Sánchez", estado: "cerrado",
    etapa: "cotizacion_enviada", cierre: "sin_respuesta", cerradoEn: hace(60 * 71), atiende: "bot",
    vehiculo: "Suzuki Grand Vitara", medida: "225/70 R16",
    cotizacion: cot(1036, [llanta("225/70 R16", "Kenda", "Klever H/T", 115)]),
    esRecurrente: false, creadoEn: hace(60 * 76),
  },
  {
    id: 26, telefono: "+593 99 268 7731", nombre: "Melissa Erazo", estado: "cerrado",
    etapa: "medida_confirmada", cierre: "sin_respuesta", cerradoEn: hace(60 * 143), atiende: "bot",
    esRecurrente: false, creadoEn: hace(60 * 145),
  },
];

/* ─── Conversaciones ───────────────────────────────────────────────── */

type MsgSeed = [rol: Rol, tipo: TipoMensaje, contenido: string, hacemin: number];

const conversaciones: Record<number, MsgSeed[]> = {
  1: [
    ["cliente", "texto", "Buenas 🙌 ¿tienen llantas para un Chevrolet Sail?", 8],
    ["bot", "texto", "¡Hola! 👋 Claro que sí, para el Sail tenemos varias opciones. ¿Me confirmas la medida de tus llantas? La encuentras en el costado, es algo como 185/60 R14.", 7],
  ],
  2: [
    ["cliente", "texto", "Hola, precio de llantas rin 15 porfa", 19],
    ["bot", "texto", "¡Hola! Con gusto 🙌 Para cotizarte exacto necesito la medida completa del costado de la llanta — son 3 números, tipo 195/65 R15. ¿Me la pasas?", 18],
    ["cliente", "texto", "ya le veo y le aviso", 16],
    ["cliente", "texto", "es para un Aveo", 15],
  ],
  3: [["cliente", "texto", "info", 3]],
  4: [
    ["cliente", "texto", "Buenas tardes, necesito llantas para mi Hilux", 31],
    ["bot", "texto", "¡Buenas tardes! 👋 De una. ¿Me confirmas la medida? En la Hilux suele ser 265/65 R17 — la puedes verificar en el costado de la llanta.", 30],
    ["cliente", "texto", "Sí, esa misma es. 265/65R17", 27],
    ["bot", "texto", "Perfecto, 265/65 R17 ✅ Dame un momento y te preparo la cotización con lo que tenemos en stock 🔧", 26],
  ],
  5: [
    ["cliente", "texto", "hola q tal, tienen la 215/60 r16?", 64],
    ["bot", "texto", "¡Hola! Sí tenemos 215/60 R16 💪 ¿Para qué vehículo es? Así te recomiendo la mejor opción.", 63],
    ["cliente", "texto", "vitara sz", 62],
  ],
  6: [
    ["cliente", "texto", "Hola, quiero cambiar las llantas de mi Spark", 195],
    ["bot", "texto", "¡Hola Gabriela! 👋 Claro. ¿Me pasas la medida del costado? En el Spark GT normalmente es 165/70 R13.", 193],
    ["cliente", "texto", "creo que sí es esa, déjame ver", 190],
  ],
  7: [
    ["cliente", "texto", "Buenos días, ¿tienen 195/65 R15 para Corolla? Necesito 4 con factura", 60 * 26 + 12],
    ["bot", "texto", "¡Buenos días Diego! Sí tenemos 195/65 R15 ✅ Ya te preparo la cotización.", 60 * 26 + 10],
    ["cliente", "texto", "La factura va a nombre de Transcarga S.A., ¿le puedo dar los datos a alguien?", 60 * 26 + 8],
    ["vendedor", "texto", "Hola Diego, te saluda Andrés de Depot Tire 🙌 Claro que sí, pásame el RUC y te ayudo directo con la factura.", 60 * 26],
  ],
  8: [
    ["cliente", "texto", "Hola, necesito 4 llantas 225/60 R17 para Sportage", 58],
    ["bot", "texto", "¡Hola Verónica! 👋 Sí tenemos. Te preparo la cotización al toque.", 57],
    ["bot", "pdf", "Cotización #1024 · Falken Ziex ZE310 225/60 R17", 55],
    ["bot", "texto", "Ahí te va 📄 4 llantas Falken Ziex con instalación, balanceo y válvulas incluidas. ¿Qué te parece? ¿Te interesa?", 55],
  ],
  9: [
    ["cliente", "texto", "precio de la 245/70 r16 para dmax", 60 * 2 + 25],
    ["bot", "pdf", "Cotización #1025 · Kenda Klever A/T KR28 245/70 R16", 60 * 2 + 22],
    ["bot", "texto", "Listo Paúl 📄 Te cotizo la Kenda Klever A/T, va muy bien en la D-Max. ¿Te interesa? También tengo opciones más económicas si prefieres.", 60 * 2 + 22],
    ["cliente", "texto", "y en otra marca más barata?", 140],
  ],
  10: [
    ["cliente", "texto", "buenas, 185/60 r14 tienen?", 325],
    ["bot", "pdf", "Cotización #1026 · Kenda Kaiser KR26 185/60 R14", 321],
    ["bot", "texto", "¡Claro Cristina! 📄 Ahí está la cotización de 4 Kenda Kaiser. ¿Te interesa? Cualquier duda me dices 🙌", 320],
  ],
  11: [
    ["cliente", "texto", "Hola de nuevo 😅 esta vez necesito solo 2 llantas 205/60 R16", 60 * 27 + 15],
    ["bot", "texto", "¡Xavier, qué gusto verte de vuelta! 👋 Claro, 2 de 205/60 R16. Te cotizo.", 60 * 27 + 13],
    ["bot", "pdf", "Cotización #1027 · Falken Sincera SN110 205/60 R16 (×2)", 60 * 27 + 10],
    ["bot", "texto", "Listo 📄 ¿Te interesa? Como cliente que ya nos compró, te podemos dar prioridad de instalación 😉", 60 * 27 + 10],
  ],
  12: [
    ["cliente", "texto", "cuánto la 185/60 r15 para yaris", 60 * 30 + 20],
    ["bot", "pdf", "Cotización #1028 · Sunoco Ecoplus HP 185/60 R15", 60 * 30 + 17],
    ["bot", "texto", "Aquí tienes Daniela 📄 4 Sunoco Ecoplus con montaje incluido. ¿Te interesa?", 60 * 30 + 17],
  ],
  13: [
    ["cliente", "texto", "Necesito llantas para BT-50, la 255/70 R16", 80],
    ["bot", "pdf", "Cotización #1029 · Kenda Klever A/T KR28 255/70 R16", 78],
    ["bot", "texto", "Ahí va Marco 📄 ¿Te interesa? Si me compartes tu ubicación te digo qué local te queda más cerca 📍", 78],
    ["cliente", "ubicacion", "📍 Solanda, Quito", 76],
    ["bot", "texto", "¡Te queda cerquita! El más cercano es Depot Tire Quito Sur — Galo Molina y Av. Alonso de Angulo, a 3,1 km de ti. Atendemos hasta las 17:30 🕠", 75],
  ],
  14: [
    ["cliente", "texto", "Hola! Vi que venden llantas, tengo una Kicks 2022", 255],
    ["bot", "texto", "¡Hola Sofía! 👋 Sí, para la Kicks es la 205/60 R16. Te cotizo de una.", 254],
    ["bot", "pdf", "Cotización #1030 · Eurolub Urban GT 205/60 R16", 252],
    ["cliente", "ubicacion", "📍 Cumbayá centro", 251],
    ["bot", "texto", "¡Estás a nada! Depot Tire Cumbayá — C.C. La del Establo, a 1,8 km. ¿Te esperamos? 🙌", 250],
  ],
  15: [
    ["cliente", "texto", "buenas, la 225/55 r18 en falken tienen?", 60 * 25 + 30],
    ["bot", "pdf", "Cotización #1031 · Falken Azenis FK510 225/55 R18", 60 * 25 + 26],
    ["cliente", "ubicacion", "📍 Chillogallo", 60 * 25 + 5],
    ["bot", "texto", "El local que te conviene es Depot Tire Quito Sur, a 5,4 km — Galo Molina y Av. Alonso de Angulo. ¿Vienes hoy o te agendo para mañana? 📅", 60 * 25],
  ],
  16: [
    ["cliente", "texto", "Hola, necesito 4 llantas para Sail 185/60 R14", 100],
    ["bot", "texto", "¡Hola Karen! 👋 Claro que sí. Te preparo la cotización de una vez.", 99],
    ["bot", "pdf", "Cotización #1032 · Kenda Kaiser KR26 185/60 R14", 97],
    ["bot", "texto", "Ahí te va 📄 ¿Te interesa? Si me compartes tu ubicación te digo el local más cercano 📍", 97],
    ["cliente", "texto", "Sí me interesa!", 95],
    ["cliente", "ubicacion", "📍 Tumbaco", 94],
    ["bot", "texto", "¡Perfecto! Te queda Depot Tire Cumbayá — C.C. La del Establo y Av. Oswaldo Guayasamín, a 2,4 km. ¿Te esperamos hoy? Atendemos hasta las 17:30 🕠", 93],
    ["cliente", "texto", "Sí, voy hoy después del trabajo, tipo 5", 92],
    ["bot", "texto", "¡Buenísimo Karen! 🙌 Te esperamos entonces. Pregunta por Andrés y menciona la cotización #1032. ¡Buen viaje! 🚗", 91],
  ],
  17: [
    ["cliente", "texto", "Necesito las Wildpeak para Fortuner, las 265", 205],
    ["bot", "pdf", "Cotización #1033 · Falken Wildpeak A/T3W 265/65 R17", 203],
    ["cliente", "texto", "¿Incluye alineación y balanceo?", 201],
    ["vendedor", "texto", "Hola Fernando, te saluda Andrés 👋 El balanceo va incluido; la alineación te la dejo en $15 llevando las 4. ¿Te parece?", 200],
    ["cliente", "texto", "Dale, mañana paso por el local del sur", 200],
  ],
  18: [
    ["cliente", "texto", "Holaa, otra vez yo 😄 ahora para el Rio de mi esposo, 2 llantas 195/55 R16", 60 * 28 + 20],
    ["bot", "texto", "¡Estefanía, bienvenida de vuelta! 🙌 Claro, 2 de 195/55 R16 para el Rio. Va la cotización.", 60 * 28 + 18],
    ["bot", "pdf", "Cotización #1034 · Sunoco Ecoplus HP 195/55 R16 (×2)", 60 * 28 + 15],
    ["cliente", "texto", "Perfecto, el sábado vamos los dos 👍", 60 * 28],
  ],
  19: [
    ["cliente", "texto", "buenas, necesito llantas AT para dmax 245/70r16", 60 * 52],
    ["bot", "pdf", "Cotización #1019 · Kenda Klever A/T KR28 245/70 R16", 60 * 51],
    ["bot", "texto", "Listo Wladimir 📄 ¿Te interesa? Compárteme tu ubicación y te digo el local más cercano 📍", 60 * 51],
    ["cliente", "ubicacion", "📍 La Magdalena", 60 * 50],
    ["bot", "texto", "Te queda Depot Tire Quito Sur a 2,2 km — Galo Molina y Av. Alonso de Angulo. ¿Te esperamos hoy? 🕠", 60 * 50],
    ["cliente", "texto", "Ya voy para allá mismo 💪", 60 * 49.5],
    ["bot", "texto", "¡Excelente! Te esperamos 🙌", 60 * 49.4],
    ["vendedor", "texto", "Wladimir ya pasó por el local — llevó las 4 Kenda + alineación. Cliente contento ✅", 60 * 49],
  ],
  20: [
    ["cliente", "texto", "hola, 185/60 r14 para sail cuánto?", 60 * 78],
    ["bot", "pdf", "Cotización #1020 · Kenda Kaiser KR26 185/60 R14", 60 * 77],
    ["cliente", "ubicacion", "📍 Calderón", 60 * 75],
    ["bot", "texto", "Te queda Depot Tire Cumbayá a 3,5 km 📍 ¿Te esperamos?", 60 * 75],
    ["cliente", "texto", "mañana en la mañana paso", 60 * 74.5],
  ],
  21: [
    ["cliente", "texto", "Andrés! Ya toca cambio de llantas de nuevo, la Hilux pide las Wildpeak 😄", 60 * 101],
    ["vendedor", "texto", "¡Don Óscar! 🙌 Un gusto. Le paso la cotización actualizada de una vez.", 60 * 100],
    ["bot", "pdf", "Cotización #1021 · Falken Wildpeak A/T3W 265/65 R17", 60 * 100],
    ["cliente", "texto", "Dale, el jueves paso por el sur como siempre", 60 * 98.5],
  ],
  22: [
    ["cliente", "texto", "hola, precio 195/65 r15 corolla", 60 * 150],
    ["bot", "pdf", "Cotización #1022 · Sunoco Ecoplus HP 195/65 R15", 60 * 149],
    ["cliente", "ubicacion", "📍 San Rafael", 60 * 147],
    ["bot", "texto", "Te queda Depot Tire Cumbayá a 4,7 km 📍 ¿Cuándo te esperamos?", 60 * 147],
    ["cliente", "texto", "el viernes voy 👍", 60 * 146.5],
  ],
  23: [
    ["cliente", "texto", "cuanto las 225/55 r18", 60 * 55],
    ["bot", "pdf", "Cotización #1023 · Falken Azenis FK510 225/55 R18", 60 * 54],
    ["bot", "texto", "Ahí tienes Iván 📄 ¿Te interesa?", 60 * 54],
    ["cliente", "texto", "uy no, en la marín me dan en 120 cada una", 60 * 51],
    ["bot", "texto", "Entiendo 🙌 Ojo que las nuestras incluyen instalación, balanceo y garantía de fábrica. Si cambias de opinión aquí estamos.", 60 * 50.5],
  ],
  24: [
    ["cliente", "texto", "llantas para spark las más económicas porfa", 60 * 125],
    ["bot", "pdf", "Cotización #1035 · Eurolub Urban GT 155/70 R13", 60 * 124],
    ["cliente", "texto", "gracias, lo voy a pensar", 60 * 122.5],
  ],
  25: [
    ["cliente", "texto", "hola, para grand vitara la 225/70?", 60 * 76],
    ["bot", "pdf", "Cotización #1036 · Kenda Klever H/T 225/70 R16", 60 * 75],
    ["bot", "texto", "¿Te interesa? Cualquier duda me avisas 🙌", 60 * 74],
  ],
  26: [
    ["cliente", "texto", "info de llantas rin 14", 60 * 145],
    ["bot", "texto", "¡Hola! Claro 🙌 ¿Me pasas la medida completa del costado? Algo como 185/60 R14.", 60 * 144.5],
  ],
};

/* ─── Ensamblado (garantiza consistencia inbox ↔ chat) ─────────────── */

let msgId = 1;

export const MENSAJES_SEED: Mensaje[] = Object.entries(conversaciones).flatMap(([tid, lista]) =>
  lista.map(([rol, tipo, contenido, hacemin]) => ({
    id: msgId++,
    ticketId: Number(tid),
    rol,
    tipo,
    contenido,
    // El demo es una operación sana: lo que salió, llegó y lo leyeron. Sin
    // estado, el panel lo pintaría como "en cola" — que ahora significa algo.
    estado: rol === "cliente" ? undefined : "read",
    hora: hace(hacemin),
  })),
);

export const TICKETS_SEED: Ticket[] = seeds.map((s) => {
  const msgs = conversaciones[s.id] ?? [];
  const ultimo = msgs[msgs.length - 1];
  const preview =
    ultimo?.[1] === "pdf" ? "📄 Cotización PDF" : ultimo?.[1] === "ubicacion" ? ultimo[2] : (ultimo?.[2] ?? "—");
  return {
    notas: [],
    sinLeer: 0,
    ...s,
    ultimoMensaje: preview,
    ultimaActividad: ultimo ? hace(ultimo[3]) : s.creadoEn,
  };
});

// En orden cronológico ascendente — el MockSource lo invierte al cargar.
export const FEED_SEED: FeedItem[] = [
  { id: 1, icono: "🏁", texto: "Venta cerrada: Wladimir Pazmiño — $579,60", hora: hace(60 * 49), ticketId: 19 },
  { id: 2, icono: "🔥", texto: "Fernando Ortiz confirmó visita al local Sur", hora: hace(200), ticketId: 17 },
  { id: 3, icono: "🔥", texto: "Karen Moya confirmó visita para hoy 17:00", hora: hace(91), ticketId: 16 },
  { id: 4, icono: "📍", texto: "Marco Rivas recibió su local más cercano (Sur, 3,1 km)", hora: hace(75), ticketId: 13 },
  { id: 5, icono: "📄", texto: "Cotización enviada a Verónica Chiriboga — $611,80", hora: hace(55), ticketId: 8 },
  { id: 6, icono: "👋", texto: "Nuevo cliente: Andrea Salazar", hora: hace(19), ticketId: 2 },
  { id: 7, icono: "👋", texto: "Nuevo cliente: Carlos Vinueza", hora: hace(8), ticketId: 1 },
];

/** Serie de conversaciones por día (14 días) para el dashboard. */
export const SERIE_14D: number[] = [4, 6, 5, 8, 7, 9, 6, 10, 8, 11, 9, 13, 12, 14];

/* ── Métricas comprobables del demo ────────────────────────────────────────
   Las cifras son las del control medido en producción el 23-oct-2026
   (PLAN-METRICAS-COMPROBABLES, encabezado): 26 ventas desde el 31-jul
   (ago 10, sep 5, oct 11), 174 facturas de llantas de la tienda (14,9 %), 17
   ventas sin asesor, mediana de 5 días hasta la factura, 0 ventas de chats de
   noche y de sábado, 8,9 % con día de visita contra 0,4 % sin día. Lo que el
   control no da (montos, semanas sueltas) es plausible y suma lo mismo que el
   total. El Sprint Final reemplaza esto por la salida real del servidor. */

type PeriodoComprobable = Pick<MetricasComprobables, "ventas" | "embudo"> & {
  participacion: MetricasComprobables["participacion"]["periodo"];
};

const COMPROBABLES_POR_MES: Record<string, PeriodoComprobable> = {
  "2026-08": {
    ventas: {
      n: 10, conIva: 5210, sinIva: 4530, rango: { bajo: 4.8, alto: 18.4 },
      grupos: { bot: { n: 7, conIva: 3640 }, bot_y_asesor: { n: 2, conIva: 1050 }, asesor: { n: 1, conIva: 520 } },
    },
    participacion: { llantasTienda: 62, delBot: 10, pct: 16.1 },
    embudo: {
      chats: 690, conMedida: 430, cotizados: 280, conDiaDeVisita: 38, compraron: 9, madura: true,
      porDia: { conDia: { chats: 38, compraron: 5 }, sinDia: { chats: 652, compraron: 4 } },
    },
  },
  "2026-09": {
    ventas: {
      n: 5, conIva: 2480, sinIva: 2157, rango: { bajo: 1.6, alto: 11.7 },
      grupos: { bot: { n: 3, conIva: 1490 }, bot_y_asesor: { n: 1, conIva: 510 }, asesor: { n: 1, conIva: 480 } },
    },
    participacion: { llantasTienda: 58, delBot: 5, pct: 8.6 },
    embudo: {
      chats: 1080, conMedida: 690, cotizados: 450, conDiaDeVisita: 52, compraron: 7, madura: true,
      porDia: { conDia: { chats: 52, compraron: 4 }, sinDia: { chats: 1028, compraron: 3 } },
    },
  },
  "2026-10": {
    ventas: {
      n: 11, conIva: 5850, sinIva: 5087, rango: { bajo: 5.5, alto: 19.7 },
      grupos: { bot: { n: 7, conIva: 3720 }, bot_y_asesor: { n: 2, conIva: 1100 }, asesor: { n: 2, conIva: 1030 } },
    },
    participacion: { llantasTienda: 54, delBot: 11, pct: 20.4 },
    embudo: {
      chats: 1284, conMedida: 780, cotizados: 520, conDiaDeVisita: 68, compraron: 10, madura: false,
      porDia: { conDia: { chats: 68, compraron: 5 }, sinDia: { chats: 1216, compraron: 5 } },
    },
  },
};

const COMPROBABLES_TODOS: PeriodoComprobable = {
  ventas: {
    n: 26, conIva: 13540, sinIva: 11774, rango: { bajo: 17, alto: 38.1 },
    grupos: { bot: { n: 17, conIva: 8850 }, bot_y_asesor: { n: 5, conIva: 2660 }, asesor: { n: 4, conIva: 2030 } },
  },
  participacion: { llantasTienda: 174, delBot: 26, pct: 14.9 },
  embudo: {
    chats: 3054, conMedida: 1900, cotizados: 1250, conDiaDeVisita: 158, compraron: 26, madura: false,
    porDia: { conDia: { chats: 158, compraron: 14 }, sinDia: { chats: 2896, compraron: 12 } },
  },
};

/** Un mes sin chats ni facturas: todo en cero, como lo entregaría el servidor. */
const COMPROBABLES_VACIO: PeriodoComprobable = {
  ventas: {
    n: 0, conIva: 0, sinIva: 0, rango: { bajo: 0, alto: 3.7 },
    grupos: { bot: { n: 0, conIva: 0 }, bot_y_asesor: { n: 0, conIva: 0 }, asesor: { n: 0, conIva: 0 } },
  },
  participacion: { llantasTienda: 0, delBot: 0, pct: 0 },
  embudo: {
    chats: 0, conMedida: 0, cotizados: 0, conDiaDeVisita: 0, compraron: 0, madura: true,
    porDia: { conDia: { chats: 0, compraron: 0 }, sinDia: { chats: 0, compraron: 0 } },
  },
};

/**
 * Doce semanas con dos olas de anuncios (desde el 19-sep, y la del 12-oct) y
 * la pausa del 30-sep: la del 5-oct sale «no», la del 12-oct «sí». Antes del
 * 14-sep la base no guardaba el anuncio: «sin dato». La del 19-oct va de
 * lunes a jueves (4 de 10), como en el control.
 */
const SEMANAS_DEMO: MetricasComprobables["participacion"]["semanas"] = [
  { lunes: "2026-08-03", llantasTienda: 13, delBot: 3, chats: 160, chatsConAnuncio: 0, anuncios: "sin_dato" },
  { lunes: "2026-08-10", llantasTienda: 14, delBot: 2, chats: 170, chatsConAnuncio: 0, anuncios: "sin_dato" },
  { lunes: "2026-08-17", llantasTienda: 12, delBot: 2, chats: 150, chatsConAnuncio: 0, anuncios: "sin_dato" },
  { lunes: "2026-08-24", llantasTienda: 15, delBot: 2, chats: 180, chatsConAnuncio: 0, anuncios: "sin_dato" },
  { lunes: "2026-08-31", llantasTienda: 13, delBot: 1, chats: 175, chatsConAnuncio: 0, anuncios: "sin_dato" },
  { lunes: "2026-09-07", llantasTienda: 12, delBot: 1, chats: 165, chatsConAnuncio: 0, anuncios: "sin_dato" },
  { lunes: "2026-09-14", llantasTienda: 14, delBot: 1, chats: 290, chatsConAnuncio: 240, anuncios: "si" },
  { lunes: "2026-09-21", llantasTienda: 15, delBot: 1, chats: 310, chatsConAnuncio: 280, anuncios: "si" },
  { lunes: "2026-09-28", llantasTienda: 13, delBot: 0, chats: 190, chatsConAnuncio: 12, anuncios: "no" },
  { lunes: "2026-10-05", llantasTienda: 12, delBot: 1, chats: 150, chatsConAnuncio: 0, anuncios: "no" },
  { lunes: "2026-10-12", llantasTienda: 17, delBot: 6, chats: 330, chatsConAnuncio: 300, anuncios: "si" },
  { lunes: "2026-10-19", llantasTienda: 10, delBot: 4, chats: 260, chatsConAnuncio: 235, anuncios: "si" },
];

/** Rezago y «cuándo»: todo el histórico, igual para cualquier mes elegido. */
const REZAGO_DEMO: MetricasComprobables["rezago"] = {
  n: 26,
  medianaDias: 5,
  acumulado: [
    { dias: 1, pct: 38.5 }, { dias: 3, pct: 50 }, { dias: 7, pct: 61.5 },
    { dias: 14, pct: 80.8 }, { dias: 30, pct: 84.6 }, { dias: 60, pct: 88.5 },
  ],
  porLlegar: { esperado: 3.4, bajo: 0, alto: 7, chatsVivos: 640 },
};

const CUANDO_DEMO: MetricasComprobables["cuando"] = {
  ventasTotales: 26,
  suficiente: false,
  escribenPorFranja: [
    { franja: "madrugada", chats: 180, ventas: 0 },
    { franja: "manana", chats: 780, ventas: 10 },
    { franja: "mediodia", chats: 820, ventas: 12 },
    { franja: "tarde", chats: 837, ventas: 4 },
    { franja: "noche", chats: 437, ventas: 0 },
  ],
  escribenPorDia: [
    { dia: 0, chats: 260, ventas: 1 }, { dia: 1, chats: 560, ventas: 6 }, { dia: 2, chats: 520, ventas: 5 },
    { dia: 3, chats: 500, ventas: 5 }, { dia: 4, chats: 480, ventas: 5 }, { dia: 5, chats: 333, ventas: 4 },
    { dia: 6, chats: 401, ventas: 0 },
  ],
  facturanPorFranja: [
    { franja: "madrugada", bot: 0, tienda: 0 },
    { franja: "manana", bot: 4, tienda: 52 },
    { franja: "mediodia", bot: 18, tienda: 78 },
    { franja: "tarde", bot: 4, tienda: 40 },
    { franja: "noche", bot: 0, tienda: 4 },
  ],
  facturanPorDia: [
    { dia: 0, bot: 0, tienda: 2 }, { dia: 1, bot: 6, tienda: 34 }, { dia: 2, bot: 5, tienda: 31 },
    { dia: 3, bot: 4, tienda: 30 }, { dia: 4, bot: 5, tienda: 32 }, { dia: 5, bot: 4, tienda: 28 },
    { dia: 6, bot: 2, tienda: 17 },
  ],
};

/** `metrics.comprobables` del demo para el período elegido («todos» o "YYYY-MM"). */
export function comprobablesDemo(clave: string, todos: boolean): MetricasComprobables {
  const p = todos ? COMPROBABLES_TODOS : COMPROBABLES_POR_MES[clave] ?? COMPROBABLES_VACIO;
  return {
    disponible: true,
    ultimaSync: new Date(Date.now() - 4 * 60_000).toISOString(),
    periodo: { clave, todos },
    ventas: p.ventas,
    participacion: { periodo: p.participacion, semanas: SEMANAS_DEMO },
    embudo: p.embudo,
    rezago: REZAGO_DEMO,
    cuando: CUANDO_DEMO,
  };
}
