#!/usr/bin/env node
/**
 * Pre-facturas mensuales de Depot Tire, separadas: IA (consumo de OpenAI) y
 * mantenimiento, cada una con su IVA.
 *
 *   node app/scripts/factura/generar.mjs                 # mes anterior (el que acaba de cerrar)
 *   node app/scripts/factura/generar.mjs --period 2026-09
 *   node app/scripts/factura/generar.mjs --actual        # mes en curso, marcado PRELIMINAR
 *
 * Los montos NO se calculan acá: se leen de producción (`GET /api/hub/billing`),
 * que es la misma cuenta que ve Depot en el tab KPI del hub. Así la pre-factura
 * y el hub no pueden decir cosas distintas. La clave se toma de ADMIN_KEY o,
 * si no está, de Railway (`railway variables`, entorno Depot_Tire).
 *
 * El formato copia campo por campo la factura electrónica que la contadora
 * emite en Siigo (emisor, razón social, ítems, subtotales por tarifa, forma de
 * pago SRI), para que la pase tal cual. El número 001-002-… y la clave de
 * acceso los asigna Siigo: la pre-factura no los inventa.
 *
 * Emisor, cliente y forma de pago son datos tributarios reales, así que viven
 * fuera de git: `facturas/emisor.json` en la raíz del checkout principal (ver
 * `emisor.ejemplo.json`). Ahí mismo salen los HTML y PDF (Chrome headless).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BILLING_URL ?? "https://autoventa-depottire.up.railway.app";
const TZ = "America/Guayaquil";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

/** Raíz del checkout principal aunque el script corra desde un worktree. */
function raizPrincipal() {
  const comun = execFileSync("git", ["-C", AQUI, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
    encoding: "utf8",
  }).trim();
  return dirname(comun);
}
const outDir = resolve(arg("--out") ?? join(raizPrincipal(), "facturas"));

function hoyLocal() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
function mesAnterior(period) {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
const period = arg("--period") ?? (args.includes("--actual") ? hoyLocal().slice(0, 7) : mesAnterior(hoyLocal().slice(0, 7)));
if (!/^\d{4}-\d{2}$/.test(period)) {
  console.error(`Periodo inválido: ${period} (usa YYYY-MM)`);
  process.exit(1);
}

const rutaDatos = join(outDir, "emisor.json");
if (!existsSync(rutaDatos)) {
  console.error(`Falta ${rutaDatos}. Copiá ${join(AQUI, "emisor.ejemplo.json")} ahí y llenalo con los datos de la última factura de Siigo.`);
  process.exit(1);
}
const datos = JSON.parse(readFileSync(rutaDatos, "utf8"));

function adminKey() {
  if (process.env.ADMIN_KEY) return process.env.ADMIN_KEY;
  const kv = execFileSync("railway", ["variables", "--environment", "Depot_Tire", "--service", "AutoVenta", "--kv"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const linea = kv.split("\n").find((l) => l.startsWith("ADMIN_KEY="));
  if (!linea) throw new Error("No encontré ADMIN_KEY en Railway (Depot_Tire/AutoVenta). Pasala por entorno.");
  return linea.slice("ADMIN_KEY=".length).trim();
}

const res = await fetch(`${BASE_URL}/api/hub/billing`, { headers: { "x-admin-key": adminKey() } });
if (!res.ok) throw new Error(`El hub respondió ${res.status} en /api/hub/billing`);
const { billing } = await res.json();
const mes = billing.meses.find((m) => m.period === period);
if (!mes) throw new Error(`Producción no tiene el periodo ${period} (empieza en ${billing.inicioServicio}).`);

const r2 = (n) => Math.round(n * 100) / 100;
// Siigo imprime punto decimal y sin separador de miles: igual acá, para copiar sin traducir.
const usd = (n) => `$${n.toFixed(2)}`;
const miles = (n) => n.toLocaleString("es-EC");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ddmmyyyy = (iso) => iso.split("-").reverse().join("/");
const nombreMes = (p) => MESES[Number(p.slice(5)) - 1];

const ivaPorc = Math.round(billing.ivaPorc * 100);
const preliminar = mes.enCurso;
const emitida = hoyLocal();
const MES = nombreMes(period).toUpperCase();

// Dos documentos separados: la IA es pasante (varía cada mes) y el mantenimiento
// es fijo; se facturan y se pagan por cuerda separada.
const DOCUMENTOS = [
  {
    clave: "ia",
    ref: `DT-IA-${period}`,
    detalle: `CONSUMO INTELIGENCIA ARTIFICIAL ${MES}`,
    subtotal: mes.uso.usd,
    iva: mes.ivaTokens,
    anexo: `Consumo del ${ddmmyyyy(mes.desde)} al ${ddmmyyyy(mes.hasta)}: ${miles(mes.uso.runs)} corridas de IA · ${miles(mes.uso.inputTokens)} tokens de entrada (${miles(mes.uso.cachedInputTokens)} en caché) · ${miles(mes.uso.outputTokens)} de salida. Tarifa de OpenAI, sin recargo. Detalle diario en el tab KPI del hub.`,
    preliminar,
  },
  {
    clave: "mantenimiento",
    ref: `DT-MANT-${period}`,
    detalle: `MENSUALIDAD ${MES}`,
    subtotal: mes.mantenimiento,
    iva: mes.ivaMantenimiento,
    anexo: "Servidor, base de datos, WhatsApp, soporte y ajustes del bot.",
    // Monto fijo: no depende de que el mes haya cerrado.
    preliminar: false,
  },
];

const e = datos.emisor;
const c = datos.cliente;
const fila = (k, v) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`;

const html = (doc) => {
  const total = r2(doc.subtotal + doc.iva);
  const totales = [
    ["Subtotal Sin Impuestos", doc.subtotal],
    [`Subtotal ${ivaPorc}%`, doc.subtotal],
    ["Subtotal 5%", 0],
    ["Subtotal 0%", 0],
    ["Subtotal No Objeto IVA", 0],
    ["Descuentos", 0],
    ["ICE", 0],
    [`IVA ${ivaPorc}%`, doc.iva],
    ["IVA 5%", 0],
    ["Servicio %", 0],
    ["Valor Total", total],
  ];
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Pre-factura ${doc.ref} · ${esc(c.razonSocial)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font: 11.5px/1.45 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1c1c1c; margin: 0; }
  .caja { background: #f1f1f1; padding: 10px 12px; }
  .top { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .doc h1 { font-size: 15px; margin: 0 0 8px; display: flex; justify-content: space-between; }
  .doc .k { font-weight: 700; margin-top: 6px; }
  .cli { display: grid; grid-template-columns: 2fr 1fr; gap: 4px 16px; margin-top: 10px; }
  table { width: 100%; border-collapse: collapse; }
  .items { margin-top: 12px; }
  .items th { background: #e4e4e4; font-size: 11px; padding: 6px 4px; text-align: center; }
  .items td { padding: 6px 4px; vertical-align: top; }
  .n { text-align: right; white-space: nowrap; }
  .abajo { display: grid; grid-template-columns: 1fr 300px; gap: 16px; margin-top: 12px; align-items: start; }
  .abajo h3 { font-size: 11.5px; background: #e4e4e4; margin: 0; padding: 6px 10px; }
  .abajo .cuerpo { background: #f6f6f6; padding: 8px 10px; margin-bottom: 10px; }
  .info td { padding: 2px 8px 2px 0; vertical-align: top; }
  .tot td { padding: 3px 8px; border-bottom: 2px solid #fff; background: #f1f1f1; }
  .tot td.n { background: #e4e4e4; }
  .tot tr:last-child td { font-weight: 700; }
  .aviso { background: #fff4d6; border: 1px solid #e6c35c; padding: 8px 12px; margin-bottom: 10px; font-weight: 600; }
  .conta { border: 1.5px dashed #888; padding: 8px 12px; margin-top: 16px; }
  .conta b { display: block; margin-bottom: 4px; }
  .anexo { margin-top: 10px; color: #555; font-size: 11px; }
</style></head><body>
${doc.preliminar ? `<div class="aviso">PRELIMINAR — el mes todavía no cierra; el consumo de IA puede subir. No facturar con estos valores.</div>` : ""}
<div class="top">
  <div class="caja">
    ${fila("Emisor", e.nombre)}${fila("RUC", e.ruc)}${fila("Matriz", e.matriz)}${fila("Correo", e.correo)}${fila("Teléfono", e.telefono)}${fila("Obligado a llevar contabilidad", e.obligadoContabilidad)}
  </div>
  <div class="caja doc">
    <h1><span>PRE-FACTURA</span><span>Ref. ${doc.ref}</span></h1>
    <div class="k">No. de factura:</div><div>Lo asigna Siigo al emitir (001-002-…)</div>
    <div class="k">Número de Autorización / Clave de Acceso:</div><div>La asigna el SRI al autorizar</div>
    <div class="k">Ambiente / Emisión:</div><div>PRODUCCION / NORMAL</div>
  </div>
</div>
<div class="caja cli">
  ${fila("Razón Social", c.razonSocial)}${fila("RUC/CI", c.ruc)}
  ${fila("Dirección", c.direccion)}${fila("Teléfono", c.telefono)}
  ${fila("Fecha Emisión", ddmmyyyy(emitida))}${fila("Correo", c.correo)}
</div>
<table class="items">
  <tr><th>Código Principal</th><th>Cantidad</th><th>Descripción</th><th>Detalles Adicionales</th><th>Precio Unitario</th><th>Descuento</th><th>Total</th></tr>
  <tr><td>${esc(datos.item.codigo)}</td><td class="n">1.00</td><td>${esc(datos.item.descripcion)}</td><td>Detalle: ${esc(doc.detalle)}</td><td class="n">${doc.subtotal.toFixed(2)}</td><td class="n">$0.00</td><td class="n">${usd(doc.subtotal)}</td></tr>
</table>
<div class="abajo">
  <div>
    <h3>Información Adicional</h3>
    <div class="cuerpo"><table class="info">${datos.infoAdicional.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table></div>
    <h3>Formas de pago</h3>
    <div class="cuerpo"><table class="info"><tr><td>${esc(datos.formaPago.descripcion)}</td><td class="n">${usd(total)}</td><td>${esc(datos.formaPago.plazo)}</td></tr></table></div>
  </div>
  <table class="tot">${totales.map(([k, v]) => `<tr><td>${k}:</td><td class="n">${usd(v)}</td></tr>`).join("")}</table>
</div>
<div class="conta">
  <b>Para la contadora — cargar en Siigo así:</b>
  Cliente ${esc(c.razonSocial)} (RUC ${esc(c.ruc)}) · 1 ítem «${esc(datos.item.descripcion)}», código ${esc(datos.item.codigo)}, detalle «${esc(doc.detalle)}», precio ${doc.subtotal.toFixed(2)}, IVA ${ivaPorc}% · forma de pago «${esc(datos.formaPago.descripcion)}», ${esc(datos.formaPago.plazo)} · total ${usd(total)}.
</div>
${datos.transferencia?.cuenta ? `<div class="conta"><b>Datos para la transferencia</b>Titular: ${esc(datos.transferencia.titular)} · RUC ${esc(datos.transferencia.ruc)} · ${esc(datos.transferencia.banco)} · ${esc(datos.transferencia.tipo)} N.º ${esc(datos.transferencia.cuenta)} · Comprobante a ${esc(datos.transferencia.correo)}</div>` : ""}
<div class="anexo">${esc(doc.anexo)}</div>
</body></html>`;
};

mkdirSync(outDir, { recursive: true });
console.log(`Pre-facturas ${period} para ${c.razonSocial}${preliminar ? " (PRELIMINAR, mes en curso)" : ""}`);
for (const doc of DOCUMENTOS) {
  const base = join(outDir, `prefactura-depot-${period}-${doc.clave}${doc.preliminar ? "-preliminar" : ""}`);
  writeFileSync(`${base}.html`, html(doc));
  let pdf = null;
  if (existsSync(CHROME)) {
    execFileSync(CHROME, ["--headless", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${base}.pdf`, `file://${base}.html`], {
      stdio: "ignore",
    });
    pdf = `${base}.pdf`;
  }
  console.log(`  ${doc.ref.padEnd(18)} ${doc.detalle.padEnd(40)} ${usd(doc.subtotal)} + IVA ${usd(doc.iva)} = ${usd(r2(doc.subtotal + doc.iva))}`);
  console.log(`    ${pdf ?? `${base}.html (sin Chrome: no hay PDF)`}`);
}
console.log(`  TOTAL DEL MES      ${usd(mes.total)}${mes.pagado ? "   (YA PAGADO)" : ""}`);
const impagos = billing.meses.filter((m) => !m.pagado && !m.enCurso && m.period < period);
for (const m of impagos) console.log(`  OJO: ${m.period} sigue sin marcarse pagado en el hub (${usd(m.total)})`);
