/**
 * Vista previa del reporte del día sin base de datos.
 *
 * `npm run build && node scripts/preview-reporte.mjs [paleta] [fuente]`
 *
 * Existe porque el reporte sólo se puede mirar de verdad cuando está armado, y
 * armarlo de verdad exige una base con una semana de conversaciones dentro. Con
 * datos inventados el PDF se revisa en un segundo y en las seis paletas, que es
 * justo lo que hay que comprobar cuando se toca el diseño.
 */
import fs from "node:fs";
import path from "node:path";

process.env.OPENAI_API_KEY ||= "preview";
process.env.WHATSAPP_TOKEN ||= "preview";
process.env.WHATSAPP_APP_SECRET ||= "preview";
process.env.WHATSAPP_VERIFY_TOKEN ||= "preview";
process.env.WHATSAPP_PHONE_ID ||= "preview";
process.env.DATABASE_URL ||= "postgresql://localhost/preview";

const { renderDailyReportPdf, nombreArchivoReporte } = await import("../dist/render/dailyReportPdf.js");
const { renderDailyReportHtml } = await import("../dist/render/dailyReportHtml.js");

const paleta = process.argv[2] ?? "grafito";
const fuente = process.argv[3] ?? "exo";
const salida = process.argv[4] ?? path.resolve("../reporte-preview");

const DIAS = ["mié 6", "jue 7", "vie 8", "sáb 9", "dom 10", "lun 11", "mar 12"];
const MONTOS = [2140, 3980, 1560, 5230, 720, 4410, 3180];
const ESCRIBIERON = [14, 22, 11, 27, 6, 24, 19];

const cliente = (id, nombre, motivo, cuando, vencida, monto, medida, local, horas) => ({
  conversationId: id, nombre, telefono: `5939${String(id).padStart(7, "0")}`, motivo, cuando, vencida,
  monto, medida, local,
  esperaDesde: new Date(Date.parse("2026-08-12T20:00:00-05:00") - horas * 3_600_000).toISOString(),
  link: `https://hub.example.com/#/ticket/${id}`,
});

const reporte = {
  negocio: "Depot Tire",
  paleta, fuente,
  generadoEn: "2026-08-12T20:00:00-05:00",
  desde: "2026-08-11T20:00:00-05:00",
  hasta: "2026-08-12T20:00:00-05:00",
  periodo: "martes 11 de agosto, 20:00 → miércoles 12 de agosto, 20:00",
  dia: "miércoles 12 de agosto",
  diaClave: "2026-08-12",
  hubUrl: "https://hub.example.com",
  linkOportunidades: "https://hub.example.com/#/opportunities",
  resumen: {
    clientesNuevos: 9,
    clientesQueEscribieron: 19,
    cotizacionesEnviadas: 7,
    montoCotizado: 3180.4,
    visitasAgendadas: 4,
    ventasGanadas: 2,
    montoGanado: 968.5,
    montoEnJuego: 18432,
  },
  semana: {
    dias: DIAS.map((etiqueta, i) => ({
      clave: `2026-08-0${i + 6}`.slice(0, 10),
      etiqueta,
      esHoy: i === DIAS.length - 1,
      cotizaciones: Math.round(MONTOS[i] / 450),
      monto: MONTOS[i],
      escribieron: ESCRIBIERON[i],
      ganadas: i % 3 === 0 ? 1 : 0,
      montoGanado: i % 3 === 0 ? 480 : 0,
    })),
    cotizaciones: 47,
    montoCotizado: MONTOS.reduce((a, b) => a + b, 0),
    escribieron: ESCRIBIERON.reduce((a, b) => a + b, 0),
    ganadas: 5,
    montoGanado: 2410,
  },
  fases: [
    { etapa: "medida_confirmada", nombre: "Medida confirmada", corto: "Medida", hoy: 12, semana: 61 },
    { etapa: "seleccionando", nombre: "Eligiendo opciones", corto: "Eligiendo", hoy: 8, semana: 44 },
    { etapa: "cotizacion_enviada", nombre: "Cotización enviada", corto: "Cotización", hoy: 7, semana: 39 },
    { etapa: "seguimiento_venta", nombre: "Seguimiento hasta venta", corto: "Seguimiento", hoy: 4, semana: 21 },
    { etapa: "ganado", nombre: "Ganado", corto: "Ganado", hoy: 2, semana: 9 },
    { etapa: "perdido", nombre: "Perdido", corto: "Perdido", hoy: 1, semana: 7 },
  ],
  acumulado: { cotizaciones: 612, montoCotizado: 284_310 },
  cotizados: {
    total: 19,
    filas: [
      cliente(101, "María José Peñafiel 🛞", "Dijo que venía y no apareció — rescatar", "lun 10 ago 16:00", true, 486.4, "205/55R16", "Cumbayá", 52),
      cliente(102, "Jonathan Ruales", "Dijo: “paso el viernes en la tarde con el carro”", "mañana 15:30", false, 1290.75, "265/70R16", "Quito Sur", 6),
      cliente(103, "Andrea Villacís", "Visita agendada — confirmar y tener las llantas listas", "hoy 18:00", false, 742, "185/65R15", "Cumbayá", 2),
      cliente(104, "Carlos Mendoza", "Cotización enviada — empujar el cierre", null, false, 2140.9, "225/45R17", null, 27),
      cliente(105, "Verónica Salazar", "Pidió el precio de 4 y no volvió a escribir", null, false, 968.2, "195/60R15", "Quito Sur", 71),
    ],
  },
  pidenAsesor: {
    total: 6,
    filas: [
      cliente(201, "Diego Almeida", "Pidió hablar con un asesor", null, false, null, "235/60R18", "Cumbayá", 19),
      cliente(202, "Paola Chiriboga", "El chat está en manos del equipo", null, false, 512.3, null, "Quito Sur", 8),
      cliente(203, "Luis Cabrera", "Va a llamar para confirmar la reserva", "vie 14 ago 09:00", false, 1834, "265/65R17", "Cumbayá", 3),
    ],
  },
  errores: {
    total: 2,
    filas: [
      { conversationId: 301, nombre: "Sofía Terán", motivo: "El bot repitió el saludo tres veces seguidas", link: "https://hub.example.com/#/ticket/301" },
      { conversationId: 302, nombre: "0987654321", motivo: "El cliente pidió que no le escriban más", link: "https://hub.example.com/#/ticket/302" },
    ],
  },
  tecnicos: {
    total: 2,
    filas: [
      { telefono: "593987654321", etiqueta: "No salió un mensaje", veces: 3 },
      { telefono: "593998877665", etiqueta: "Hizo falta una plantilla", veces: 1 },
    ],
  },
};

const pdf = await renderDailyReportPdf(reporte);
fs.writeFileSync(`${salida}.pdf`, pdf);
fs.writeFileSync(`${salida}.html`, renderDailyReportHtml(reporte));
console.log(`${nombreArchivoReporte(reporte)} → ${salida}.pdf (${(pdf.length / 1024).toFixed(0)} kB) y ${salida}.html`);
