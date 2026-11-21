/**
 * El reporte simple contra una base de verdad.
 *
 * Lo que se afirma vive en el SQL (qué es «mañana» en Quito, qué cotización es
 * la última de cada persona) y en el límite de página y media, que sólo se
 * puede medir renderizando el PDF.
 */
import { beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";

const BASE = `av_reporte_simple_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { armarReporteSimple, buildReporteSimple, llantasDe, textoDelReporteSimple } = await import("../src/services/reporteSimple.js");
const { renderReporteSimplePdf, TOPES } = await import("../src/render/reporteSimplePdf.js");

// Viernes 20-nov-2026, 20:05 de Quito: el reporte cierra ese viernes.
const AHORA = new Date("2026-11-20T20:05:00-05:00");
const EN_EL_DIA = "2026-11-20T11:00:00-05:00";

async function chat(o: {
  phone: string; name: string; stage?: string; status?: string; visita?: string; franja?: string; retiro?: string;
  cotizaciones?: Array<{ total: number; cuando: string; items?: unknown }>; respondio?: string;
}): Promise<number> {
  const [c] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, stage, status, tire_size, nearest_store, visit_date, visit_time_label, pickup_date, last_customer_message_at)
    values (${o.phone}, ${o.name}, ${o.stage ?? "cotizacion_enviada"}, ${o.status ?? "open"}, '205/55R16', 'Cumbayá',
      ${o.visita ?? null}, ${o.franja ?? null}, ${o.retiro ?? null}, ${o.respondio ?? null})
    returning id`;
  for (const q of o.cotizaciones ?? []) {
    await sql`
      insert into quotes (conversation_id, items, subtotal, tax, total, created_at)
      values (${c.id}, ${sql.json((q.items ?? [{ descripcion: "Falken Ziex 205/55R16", cantidad: 4, precioUnit: q.total / 4 }]) as never)},
        ${q.total}, 0, ${q.total}, ${q.cuando})`;
  }
  return Number(c.id);
}

let ids: Record<string, number> = {};

beforeAll(async () => {
  await ensureSchema();
  ids.manana = await chat({ phone: "593990000001", name: "Viene mañana", visita: "2026-11-21T10:00:00-05:00", franja: "de 4 a 5 pm", cotizaciones: [{ total: 400, cuando: EN_EL_DIA }] });
  ids.lunes = await chat({ phone: "593990000002", name: "Retira el lunes", retiro: "2026-11-23", cotizaciones: [{ total: 300, cuando: "2026-11-18T10:00:00-05:00" }] });
  ids.paso = await chat({ phone: "593990000003", name: "Tenía fecha ayer", visita: "2026-11-19T10:00:00-05:00", cotizaciones: [{ total: 250, cuando: "2026-11-17T10:00:00-05:00" }] });
  ids.vendido = await chat({ phone: "593990000004", name: "Vino y compró", visita: "2026-11-20T10:00:00-05:00", cotizaciones: [{ total: 500, cuando: "2026-11-19T10:00:00-05:00" }] });
  // Cotizó dos veces hoy: es UNA persona, con la última cifra.
  ids.recotizo = await chat({ phone: "593990000005", name: "Cotizó dos veces", respondio: "2026-11-20T15:00:00-05:00", cotizaciones: [{ total: 900, cuando: EN_EL_DIA }, { total: 700, cuando: "2026-11-20T14:00:00-05:00" }] });
  ids.callado = await chat({ phone: "593990000006", name: "No respondió", respondio: "2026-11-20T10:00:00-05:00", cotizaciones: [{ total: 200, cuando: EN_EL_DIA }] });
  ids.perdido = await chat({ phone: "593990000007", name: "Ya se perdió", stage: "perdido", cotizaciones: [{ total: 100, cuando: EN_EL_DIA }] });
  // Fuera de la ventana: después de las 20:00 es del reporte de mañana.
  ids.tarde = await chat({ phone: "593990000008", name: "Escribió de noche", cotizaciones: [{ total: 999, cuando: "2026-11-20T20:02:00-05:00" }] });
});

describe("reporte simple con datos reales", () => {
  it("separa quién viene, quién ya pasó y lo cotizado hoy por persona", async () => {
    const r = await buildReporteSimple(AHORA);
    expect(r.diaClave).toBe("2026-11-20");

    // La agenda arranca mañana y trae siete días.
    expect(r.vienen.dias.map((d) => d.numero)).toEqual(["21", "22", "23", "24", "25", "26", "27"]);
    expect(r.vienen.dias[0].titulo).toMatch(/^Mañana · sábado 21$/);
    expect(r.vienen.dias[0].personas.map((p) => p.nombre)).toEqual(["Viene mañana"]);
    // La hora es la franja que dijo el cliente, nunca el relleno de visit_date.
    expect(r.vienen.dias[0].personas[0].hora).toBe("de 4 a 5 pm");
    expect(r.vienen.dias[2].personas.map((p) => p.nombre)).toEqual(["Retira el lunes"]);
    expect(r.vienen.dias[2].personas[0].hora).toBeNull();
    expect(r.vienen.total).toBe(2);
    expect(r.vienen.monto).toBe(700);

    // Sin fuente de facturas no se sabe quién compró: los dos con fecha vencida aparecen.
    expect(r.vienen.noVinieron.map((p) => [p.nombre, p.cuando])).toEqual([["Vino y compró", "hoy"], ["Tenía fecha ayer", "ayer"]]);

    // Cuatro personas cotizadas en la ventana; la que cotizó dos veces vale 700, no 1.600.
    expect(r.cotizado.total).toBe(4);
    expect(r.cotizado.monto).toBe(400 + 700 + 200 + 100);
    expect(r.cotizado.filas.map((f) => [f.nombre, f.estado])).toEqual([
      ["Cotizó dos veces", "pensando"],
      ["Viene mañana", "con_fecha"],
      ["No respondió", "sin_respuesta"],
    ]);
    expect(r.cotizado.filas[1].nota).toBe("viene sáb 21");
    expect(r.vendido.total).toBe(0);

    const pdf = await renderReporteSimplePdf(r);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("con factura cruzada: sale en vendido y deja de figurar como fecha vencida", async () => {
    const { buildDailyReport } = await import("../src/services/dailyReport.js");
    const base = await buildDailyReport(AHORA);
    const sinVenta = await buildReporteSimple(AHORA, base);
    const venta = {
      ticketId: ids.vendido, nombre: "Vino y compró", telefono: "593990000004", cliente: "CLIENTE SA",
      facturas: [{ documento: "001-002-000018342", dia: "2026-11-20", total: 512.4, local: "Cumbayá" }],
      total: 512.4, sinIva: 445.57, dia: "2026-11-20", hora: 11, llantas: "4 × FALKEN ZIEX 205/55R16",
      atendio: "bot" as const, grupo: "bot" as never, mensajesAsesor: 0, mensajesBot: 9, primerDia: "2026-11-19", cotizado: true,
    };
    // Mismas filas que leyó la base; sólo cambia que ahora hay una factura.
    const visitas = [...sinVenta.vienen.noVinieron].map((p) => p.nombre);
    expect(visitas).toContain("Vino y compró");
    const conVenta = armarReporteSimple({
      base,
      visitas: [
        { id: ids.vendido, phone: "593990000004", name: "Vino y compró", tire_size: null, nearest_store: null, visit_time_label: null, dia: "2026-11-20", total: 500, items: [] },
        { id: ids.paso, phone: "593990000003", name: "Tenía fecha ayer", tire_size: null, nearest_store: null, visit_time_label: null, dia: "2026-11-19", total: 250, items: [] },
      ],
      cotizadas: [],
      ventas: [venta],
    });
    expect(conVenta.vienen.noVinieron.map((p) => p.nombre)).toEqual(["Tenía fecha ayer"]);
    expect(conVenta.vendido).toMatchObject({ total: 1, monto: 512.4 });
    expect(conVenta.vendido.filas[0]).toMatchObject({ factura: "001-002-000018342", local: "Cumbayá" });
    expect(conVenta.embudo.compraron).toBe(1);
    expect(textoDelReporteSimple(conVenta)).toContain("1 venta confirmada con factura · $512");
    expect(textoDelReporteSimple(sinVenta)).not.toContain("confirmada");
  });

  it("los ítems de la cotización se leen a la defensiva", () => {
    expect(llantasDe([{ descripcion: "Kenda KR20 225/45R17", cantidad: 4 }], "225/45R17")).toBe("4 × Kenda KR20 225/45R17");
    expect(llantasDe([{ descripcion: "A", cantidad: 2 }, { descripcion: "B" }], null)).toBe("2 × A + 1 más");
    expect(llantasDe(null, "205/55R16")).toBe("205/55R16");
    expect(llantasDe("basura", null)).toBeNull();
  });

  it("el peor día —todas las listas pasadas de su tope— no pasa de dos páginas", async () => {
    const { buildDailyReport } = await import("../src/services/dailyReport.js");
    const base = await buildDailyReport(AHORA);
    const muchas = (n: number, dia: (i: number) => string) => Array.from({ length: n }, (_, i) => ({
      id: 1000 + i, phone: `59399${i}`, name: `Cliente con nombre largo número ${i}`, tire_size: "265/70R16",
      nearest_store: "Quito Sur", visit_time_label: i % 2 ? "de 4 a 5 de la tarde" : null, dia: dia(i), total: 480 + i,
      items: [{ descripcion: "Falken Wildpeak A/T 265/70R16 con un nombre de diseño bastante largo", cantidad: 4 }],
    }));
    const r = armarReporteSimple({
      base,
      visitas: [...muchas(20, (i) => `2026-11-${21 + (i % 7)}`), ...muchas(8, () => "2026-11-19").map((v) => ({ ...v, id: v.id + 500 }))],
      cotizadas: Array.from({ length: 25 }, (_, i) => ({
        id: 3000 + i, phone: `59398${i}`, name: `Cotizado ${i}`, tire_size: "205/55R16", stage: "cotizacion_enviada", status: "open",
        total: 300 + i * 10, items: [{ descripcion: "Kenda KR203 205/55R16", cantidad: 4 }], created_at: new Date(EN_EL_DIA),
        last_customer_message_at: i % 2 ? new Date("2026-11-20T15:00:00-05:00") : null, dia_visita: null,
      })),
      ventas: Array.from({ length: 7 }, (_, i) => ({
        ticketId: 5000 + i, nombre: `Comprador ${i}`, telefono: "5939", cliente: "X",
        facturas: [{ documento: `001-001-00002711${i}`, dia: "2026-11-20", total: 400, local: "Quito Sur" }],
        total: 400, sinIva: 348, dia: "2026-11-20", hora: 10, llantas: "4 × KENDA KR203 205/55R16 · 4 × ALINEACIÓN",
        atendio: "bot" as const, grupo: "bot" as never, mensajesAsesor: 0, mensajesBot: 5, primerDia: "2026-11-18", cotizado: true,
      })),
    });
    expect(r.vienen.total).toBeGreaterThan(TOPES.vienen);
    const pdf = await renderReporteSimplePdf(r);
    // Para mirarlo: REPORTE_SALIDA=/ruta/peor-dia.pdf npx vitest run test/reporteSimple…
    if (process.env.REPORTE_SALIDA) (await import("node:fs")).writeFileSync(process.env.REPORTE_SALIDA, pdf);
    const paginas = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
    expect(paginas).toBeLessThanOrEqual(2);
  });
});
