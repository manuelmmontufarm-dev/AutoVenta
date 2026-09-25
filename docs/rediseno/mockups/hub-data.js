// Datos del Hub — copia de hub/src/data/mock/fixtures.ts (tickets abiertos)
// y de hub/src/lib/format.ts (relTime, iniciales, avatarColor).
const MIN = 60_000;
const hace = (min) => Date.now() - min * MIN;

// [id, telefono, nombre, etapa, atiende, vehiculo, medida, esRecurrente, sinLeer, ultimoMensaje, haceMin]
const RAW = [
  [3, "+593 96 884 1057", null, "nuevo", "bot", null, null, false, 1, "info", 3],
  [1, "+593 98 412 7734", "Carlos Vinueza", "nuevo", "bot", "Chevrolet Sail 2021", null, false, 1, "¡Hola! 👋 Claro que sí, para el Sail tenemos varias opciones. ¿Me confirmas la medida de tus llantas? La encuentras en el costado, es algo como 185/60 R14.", 7],
  [2, "+593 99 630 2218", "Andrea Salazar", "nuevo", "bot", null, null, false, 2, "es para un Aveo", 15],
  [4, "+593 98 227 9640", "María Fernanda Torres", "medida_confirmada", "bot", "Toyota Hilux 2019", "265/65 R17", false, 0, "Perfecto, 265/65 R17 ✅ Dame un momento y te preparo la cotización con lo que tenemos en stock 🔧", 26],
  [8, "+593 99 348 8102", "Verónica Chiriboga", "cotizacion_enviada", "bot", "Kia Sportage 2020", "225/60 R17", false, 0, "Ahí te va 📄 4 llantas Falken Ziex con instalación, balanceo y válvulas incluidas. ¿Qué te parece? ¿Te interesa?", 55],
  [5, "+593 99 118 5523", "Jorge Paredes", "medida_confirmada", "bot", "Suzuki Vitara SZ", "215/60 R16", false, 0, "vitara sz", 62],
  [13, "+593 99 781 2236", "Marco Rivas", "cotizacion_enviada", "bot", "Mazda BT-50 2020", "255/70 R16", false, 0, "¡Te queda cerquita! El más cercano es Depot Tire Quito Sur — Galo Molina y Av. Alonso de Angulo, a 3,1 km de ti. Atendemos hasta las 17:30 🕠", 75],
  [16, "+593 99 205 8867", "Karen Moya", "seguimiento_venta", "bot", "Chevrolet Sail 2019", "185/60 R14", false, 0, "¡Buenísimo Karen! 🙌 Te esperamos entonces. Pregunta por Andrés y menciona la cotización #1032. ¡Buen viaje! 🚗", 91],
  [9, "+593 98 903 4471", "Paúl Guerrero", "cotizacion_enviada", "bot", "Chevrolet D-Max 2018", "245/70 R16", false, 1, "y en otra marca más barata?", 140],
  [6, "+593 96 502 7789", "Gabriela Almeida", "medida_confirmada", "bot", "Chevrolet Spark GT", "165/70 R13", false, 1, "creo que sí es esa, déjame ver", 190],
  [17, "+593 98 319 4405", "Fernando Ortiz", "seguimiento_venta", "humano", "Toyota Fortuner 2020", "265/65 R17", false, 0, "Dale, mañana paso por el local del sur", 200],
  [14, "+593 96 934 5518", "Sofía Carrera", "cotizacion_enviada", "bot", "Nissan Kicks 2022", "205/60 R16", false, 0, "¡Estás a nada! Depot Tire Cumbayá — C.C. La del Establo, a 1,8 km. ¿Te esperamos? 🙌", 250],
  [10, "+593 96 217 6650", "Cristina Játiva", "cotizacion_enviada", "bot", "Chevrolet Aveo Family", "185/60 R14", false, 0, "¡Claro Cristina! 📄 Ahí está la cotización de 4 Kenda Kaiser. ¿Te interesa? Cualquier duda me dices 🙌", 320],
  [15, "+593 98 550 7621", "Ricardo Proaño", "cotizacion_enviada", "bot", "Hyundai Tucson 2021", "225/55 R18", false, 0, "El local que te conviene es Depot Tire Quito Sur, a 5,4 km — Galo Molina y Av. Alonso de Angulo. ¿Vienes hoy o te agendo para mañana? 📅", 60 * 25],
  [7, "+593 98 775 3412", "Diego Cárdenas", "medida_confirmada", "humano", "Toyota Corolla 2017", "195/65 R15", false, 0, "Hola Diego, te saluda Andrés de Depot Tire 🙌 Claro que sí, pásame el RUC y te ayudo directo con la factura.", 60 * 26],
  [11, "+593 99 445 9083", "Xavier Bonilla", "cotizacion_enviada", "bot", "Mazda 3 2019", "205/60 R16", true, 0, "Listo 📄 ¿Te interesa? Como cliente que ya nos compró, te podemos dar prioridad de instalación 😉", 60 * 27 + 10],
  [18, "+593 96 448 2270", "Estefanía Cueva", "seguimiento_venta", "bot", "Kia Rio 2018", "195/55 R16", true, 0, "Perfecto, el sábado vamos los dos 👍", 60 * 28],
  [12, "+593 98 662 1194", "Daniela Espinosa", "cotizacion_enviada", "bot", "Toyota Yaris", "185/60 R15", false, 0, "Aquí tienes Daniela 📄 4 Sunoco Ecoplus con montaje incluido. ¿Te interesa?", 60 * 30 + 17],
];

export const CERRADOS = 8;

// Columnas del pipeline nuevo (brief): nuevo · medidas · cotizado · ubicación · visita.
// ubicación = cotizacion_enviada con local asignado (ids 13, 14, 15 en fixtures).
export const COLUMNAS = [
  { id: "nuevo", nombre: "Nuevo" },
  { id: "medidas", nombre: "Medidas" },
  { id: "cotizado", nombre: "Cotizado" },
  { id: "ubicacion", nombre: "Ubicación" },
  { id: "visita", nombre: "Visita" },
];
const CON_LOCAL = new Set([13, 14, 15]);
export function columnaDe(t) {
  if (t.etapa === "nuevo") return "nuevo";
  if (t.etapa === "medida_confirmada") return "medidas";
  if (t.etapa === "seguimiento_venta") return "visita";
  return CON_LOCAL.has(t.id) ? "ubicacion" : "cotizado";
}

// Conversación del ticket 9 (Paúl Guerrero) — fixtures.ts, conversaciones[9]
export const CONVERSACION_9 = [
  { rol: "cliente", tipo: "texto", contenido: "precio de la 245/70 r16 para dmax", min: 60 * 2 + 25 },
  { rol: "bot", tipo: "pdf", contenido: "Cotización #1025 · Kenda Klever A/T KR28 245/70 R16", min: 60 * 2 + 22 },
  { rol: "bot", tipo: "texto", contenido: "Listo Paúl 📄 Te cotizo la Kenda Klever A/T, va muy bien en la D-Max. ¿Te interesa? También tengo opciones más económicas si prefieres.", min: 60 * 2 + 22 },
  { rol: "cliente", tipo: "texto", contenido: "y en otra marca más barata?", min: 140 },
].map((x) => ({ ...x, hora: hace(x.min) }));

// Cotizador — resultados para 245/70 R16 (marcas y precios de fixtures.ts; stock por local inventado a partir de inventory del mock)
export const RESULTADOS_245_70_R16 = [
  { codigo: "KEN-KR28-2457016", marca: "Kenda", modelo: "Klever A/T KR28", tipo: "A/T", precio: 126, lista: 148, stockN: 12, spec: "111S · 1090 kg · 180 km/h", garantia: "Garantía de fábrica 5 años", estado: "Disponible", stock: "Cumbayá 8 · Sur 4", comparar: true },
  { codigo: "FAL-WPAT3-2457016", marca: "Falken", modelo: "Wildpeak A/T3W", tipo: "A/T", precio: 149, lista: 172, stockN: 6, spec: "111T · 1090 kg · 190 km/h", garantia: "Garantía de fábrica 6 años · cubre daño en vía", estado: "Disponible", stock: "Sur 6", comparar: true },
  { codigo: "KEN-KR50-2457016", marca: "Kenda", modelo: "Klever H/T KR50", tipo: "H/T", precio: 118, lista: 139, stockN: 3, spec: "111T · 1090 kg · 190 km/h", garantia: "Garantía de fábrica 5 años", estado: "Disponible", stock: "Cumbayá 3", comparar: true },
  { codigo: "EUR-TR4-2457016", marca: "Eurolub", modelo: "Trail 4x4", tipo: "A/T", precio: 96, lista: 110, stockN: 2, spec: "107S · 975 kg · 180 km/h", garantia: "Garantía de fábrica 3 años", estado: "Por confirmar", stock: "Contífico sin sincronizar", comparar: false },
  { codigo: "SUN-TX-2457016", marca: "Sunoco", modelo: "Terrain X", tipo: "H/T", precio: 104, lista: 121, stockN: 0, spec: "111H · 1090 kg · 210 km/h", garantia: "Garantía de fábrica 4 años", estado: "Agotada", stock: "0 en los dos locales", comparar: false },
];

// Métricas — SERIE_14D de fixtures.ts; el resto espeja HubMetrics del mock (inventory, billing)
export const SERIE_14D = [4, 6, 5, 8, 7, 9, 6, 10, 8, 11, 9, 13, 12, 14];
export const RESPUESTAS_POR_HORA = [
  [8, 3], [9, 9], [10, 14], [11, 18], [12, 12], [13, 7], [14, 11], [15, 16], [16, 21], [17, 15], [18, 9], [19, 5], [20, 2],
];
export const COTIZACIONES_SEMANA = [["S1", 9], ["S2", 12], ["S3", 15], ["S4", 11]];
export const PLANTILLAS = [["Enviadas", 42], ["Entregadas", 39], ["Leídas", 31], ["Respondidas", 12]];
export const INVENTARIO = { total: 375, available: 248, check: 41, out: 86, withImage: 9, brands: 3 };
export const DESCUENTOS = { conversionWith: 38, conversionWithout: 22, offered: 8, wonWith: 3, totalDiscount: 96.4 };
export const TOKENS_DIA = [["jue", 1.1], ["vie", 1.6], ["sáb", 0.9], ["dom", 0.4], ["lun", 1.5], ["mar", 1.8], ["mié", 1.42]];
export const CUENTA = { hoy: 1.42, semana: 8.75, mes: 11.9, mantenimiento: 80, total: 105.69, vence: "2 de octubre" };

export const BUSQUEDAS_RAPIDAS = ["175/70 R13", "185/65 R15", "195/55 R15", "205/55 R16", "215/75 R15", "225/65 R17", "265/70 R16", "31x10.50 R15"];

export const USUARIOS = [
  { nombre: "Joaquín Tamayo", rol: "Administrador", permisos: [true, true, true, true, true] },
  { nombre: "Andrés Chávez", rol: "Vendedor", permisos: [true, true, true, false, false] },
  { nombre: "Paola Mora", rol: "Vendedora", permisos: [true, true, false, false, false] },
];
export const PERMISOS = ["Inbox", "Pipeline", "Cotizador", "Métricas", "Ajustes"];
export const COTIZACION_9 = { numero: 1025, item: "Kenda Klever A/T KR28 245/70 R16", cantidad: 4, precioUnit: 126, subtotal: 504, iva: 75.6, total: 579.6 };

export const ETAPA_META = {
  nuevo: { nombre: "Nuevo", corto: "Nuevo", color: "#244d88" },
  medida_confirmada: { nombre: "Medida confirmada", corto: "Medida", color: "#178d72" },
  seleccionando: { nombre: "Opciones y comparación", corto: "Eligiendo", color: "#b87800" },
  cotizacion_enviada: { nombre: "Cotización enviada", corto: "Cotización", color: "#de2636" },
  seguimiento_venta: { nombre: "Seguimiento hasta venta", corto: "Seguimiento", color: "#287457" },
};

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export function relTime(t, ahora = Date.now()) {
  const s = Math.max(0, Math.floor((ahora - t) / 1000));
  if (s < 45) return "ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return DIAS[new Date(t).getDay()];
  return new Date(t).toLocaleDateString("es-EC", { day: "numeric", month: "short" });
}
export function horaCorta(t) {
  return new Date(t).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", hour12: false });
}
export function iniciales(nombre, telefono) {
  if (!nombre) return telefono.slice(-2);
  const p = nombre.trim().split(/\s+/);
  return (p[0][0] + (p[1]?.[0] ?? "")).toUpperCase();
}
const AV = ["#244d88", "#178d72", "#b87800", "#de2636", "#b25a77", "#287457", "#815e32"];
export function avatarColor(telefono) {
  let h = 0;
  for (const c of telefono) h = (h * 31 + c.charCodeAt(0)) % 997;
  return AV[h % AV.length];
}

export const TICKETS = RAW.map(([id, telefono, nombre, etapa, atiende, vehiculo, medida, esRecurrente, sinLeer, ultimoMensaje, min]) => ({
  id, telefono, nombre, etapa, atiende, vehiculo, medida, esRecurrente, sinLeer, ultimoMensaje,
  ultimaActividad: hace(min),
}));
