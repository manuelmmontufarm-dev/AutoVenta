/**
 * Ejemplo del reporte del día, modelo simple, con datos inventados.
 *
 * `npm run build && node scripts/preview-reporte-simple.mjs [paleta] [fuente] [salida] [sinventa]`
 *
 * Los datos son el peor día a propósito —todas las listas en su tope— porque lo
 * que hay que comprobar es que el documento no pase de una página y media.
 * Con `sinventa` sale el mismo día sin ventas, para ver cómo se acomoda.
 */
import fs from "node:fs";
import path from "node:path";

process.env.OPENAI_API_KEY ||= "preview";
process.env.WHATSAPP_TOKEN ||= "preview";
process.env.WHATSAPP_APP_SECRET ||= "preview";
process.env.WHATSAPP_VERIFY_TOKEN ||= "preview";
process.env.WHATSAPP_PHONE_ID ||= "preview";
process.env.DATABASE_URL ||= "postgresql://localhost/preview";

const { renderReporteSimplePdf } = await import("../dist/render/reporteSimplePdf.js");

const paleta = process.argv[2] ?? "depot";
const fuente = process.argv[3] ?? "exo";
const salida = process.argv[4] ?? path.resolve("../reporte-simple-ejemplo.pdf");
const sinVenta = process.argv[5] === "sinventa";

let id = 100;
const link = () => `https://hub.example.com/#/ticket/${++id}`;
const p = (nombre, hora, llantas, local, monto) => ({ nombre, link: link(), hora, llantas, local, monto });

const reporte = {
  negocio: "Depot Tire",
  paleta, fuente,
  dia: "viernes 20 de noviembre",
  diaClave: "2026-11-20",
  linkOportunidades: "https://hub.example.com/#/opportunities",
  embudo: { escribieron: 23, cotizados: 11, dieronFecha: 5, compraron: sinVenta ? 0 : 3 },
  vienen: {
    total: 9,
    monto: 5862,
    dias: [
      { corto: "SÁB", numero: "21", titulo: "Mañana · sábado 21", personas: [
        p("Jonathan Ruales", "09:30", "4 × 265/70R16 Falken Wildpeak A/T", "Quito Sur", 1291),
        p("Andrea Villacís", "11:00", "4 × 185/65R15 Kenda KR203", "Cumbayá", 412),
        p("Luis Cabrera", "15:30", "2 × 205/55R16 Maxxis Victra", "Cumbayá", 318),
        p("Paola Chiriboga 🚗", null, "4 × 195/60R15 Winrun R330", "Quito Sur", 356),
      ] },
      { corto: "DOM", numero: "22", titulo: "Domingo 22", personas: [] },
      { corto: "LUN", numero: "23", titulo: "Lunes 23", personas: [
        p("Diego Almeida", "10:00", "4 × 235/60R18 Falken Ziex", "Cumbayá", 1124),
        p("Verónica Salazar", "17:00", "4 × 225/45R17 Kenda KR20", "Quito Sur", 742),
      ] },
      { corto: "MAR", numero: "24", titulo: "Martes 24", personas: [] },
      { corto: "MIÉ", numero: "25", titulo: "Miércoles 25", personas: [
        p("Esteban Proaño", "12:30", "4 × 215/65R16 Maxxis Bravo", "Quito Sur", 689),
      ] },
      { corto: "JUE", numero: "26", titulo: "Jueves 26", personas: [] },
      { corto: "VIE", numero: "27", titulo: "Viernes 27", personas: [
        p("Gabriela Montalvo", "16:00", "4 × 175/70R13 Winrun R380", "Cumbayá", 268),
        p("Marco Tipán", null, "4 × 245/75R16 Kenda Klever M/T", "Quito Sur", 662),
      ] },
    ],
    noVinieron: [
      { ...p("María José Peñafiel", null, "4 × 205/55R16 Falken Ziex", "Cumbayá", 486), cuando: "ayer" },
      { ...p("Carlos Mendoza", null, "4 × 225/45R17 Falken Azenis", "Quito Sur", 934), cuando: "mié 18" },
    ],
  },
  cotizado: {
    total: 11,
    monto: 6418,
    semana: [
      { etiqueta: "sáb 14", monto: 5230 }, { etiqueta: "dom 15", monto: 720 }, { etiqueta: "lun 16", monto: 4410 },
      { etiqueta: "mar 17", monto: 3180 }, { etiqueta: "mié 18", monto: 3960 }, { etiqueta: "jue 19", monto: 2840 },
      { etiqueta: "vie 20", monto: 6418 },
    ],
    filas: [
      { nombre: "Jonathan Ruales", link: link(), llantas: "4 × 265/70R16 Falken Wildpeak A/T", monto: 1291, estado: "con_fecha", nota: "viene mañana 09:30" },
      { nombre: "Diego Almeida", link: link(), llantas: "4 × 235/60R18 Falken Ziex", monto: 1124, estado: "con_fecha", nota: "viene lun 23" },
      { nombre: "Santiago Borja", link: link(), llantas: "4 × 265/65R17 Maxxis Razr A/T", monto: 986, estado: "pensando" },
      { nombre: "Esteban Proaño", link: link(), llantas: "4 × 215/65R16 Maxxis Bravo", monto: 689, estado: "con_fecha", nota: "viene mié 25" },
      { nombre: "Marco Tipán", link: link(), llantas: "4 × 245/75R16 Kenda Klever M/T", monto: 662, estado: "con_fecha", nota: "viene vie 27" },
      { nombre: "Daniela Erazo", link: link(), llantas: "4 × 205/60R16 Kenda KR203", monto: 498, estado: "sin_respuesta" },
      { nombre: "0998 412 776", link: link(), llantas: "4 × 195/65R15 Winrun R330", monto: 372, estado: "pensando" },
      { nombre: "Gabriela Montalvo", link: link(), llantas: "4 × 175/70R13 Winrun R380", monto: 268, estado: "con_fecha", nota: "viene vie 27" },
      { nombre: "Fernando Jácome", link: link(), llantas: "2 × 185/60R14 Kenda KR20", monto: 196, estado: "sin_respuesta" },
      { nombre: "Rosa Guamán", link: link(), llantas: "2 × 175/65R14 Winrun R380", monto: 172, estado: "sin_respuesta" },
      { nombre: "Iván Paredes", link: link(), llantas: "2 × 165/70R13 Winrun R380", monto: 160, estado: "pensando" },
    ],
  },
  vendido: sinVenta ? { total: 0, monto: 0, filas: [] } : {
    total: 3,
    monto: 1846,
    filas: [
      { nombre: "Patricio Soria", link: link(), llantas: "4 × 225/65R17 Falken Ziex · cotizó el mar 17", factura: "001-002-000018342", local: "Cumbayá", total: 968 },
      { nombre: "Lorena Andrade", link: link(), llantas: "4 × 185/65R15 Kenda KR203 · cotizó ayer", factura: "001-001-000027115", local: "Quito Sur", total: 412 },
      { nombre: "Juan Manuel Durán", link: link(), llantas: "2 × 215/55R17 Maxxis Victra · cotizó hoy", factura: "001-001-000027121", local: "Quito Sur", total: 466 },
    ],
  },
  enElPanel: { pidenAsesor: 3, errores: 1 },
};

const pdf = await renderReporteSimplePdf(reporte);
fs.writeFileSync(salida, pdf);
console.log(`${salida} (${(pdf.length / 1024).toFixed(0)} kB)`);
