#!/usr/bin/env node
/**
 * Pre-facturas mensuales de Depot Tire, separadas: IA (consumo de OpenAI) y mantenimiento, cada una con IVA.
 *
 *   node app/scripts/factura/generar.mjs                 # mes anterior (el que acaba de cerrar)
 *   node app/scripts/factura/generar.mjs --period 2026-09
 *   node app/scripts/factura/generar.mjs --actual        # mes en curso, marcado PRELIMINAR
 *
 * Los números NO se calculan acá: se leen de producción (`GET /api/hub/billing`),
 * que es la misma cuenta que ve Depot en el tab KPI del hub. Así la pre-factura
 * y el hub no pueden decir cosas distintas. La clave se toma de ADMIN_KEY o,
 * si no está, de Railway (`railway variables`, entorno Depot_Tire).
 *
 * Sale un HTML y un PDF (Chrome headless) en `facturas/` en la raíz del repo
 * (ignorado por git). Los datos de emisor/cliente/pago van en `emisor.json`.
 *
 * Es un documento de cobro, no la factura electrónica del SRI: esa se emite
 * aparte con estos mismos valores.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "../../..");
const BASE_URL = process.env.BILLING_URL ?? "https://autoventa-depottire.up.railway.app";
const TZ = "America/Guayaquil";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const outDir = resolve(arg("--out") ?? join(RAIZ, "facturas"));

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

const datos = JSON.parse(readFileSync(join(AQUI, "emisor.json"), "utf8"));
const r2 = (n) => Math.round(n * 100) / 100;
const usd = (n) => `$${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const miles = (n) => n.toLocaleString("es-EC");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaLarga = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
};
const nombreMes = (p) => {
  const [y, m] = p.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
};

const ivaPorc = Math.round(billing.ivaPorc * 100);
const preliminar = mes.enCurso;
const emitida = hoyLocal();
const finDeMes = `${period}-${new Date(Date.UTC(+period.slice(0, 4), +period.slice(5), 0)).getUTCDate()}`;

// Dos documentos separados: la IA es pasante (varía cada mes) y el mantenimiento
// es fijo; Depot los registra en cuentas distintas.
const DOCUMENTOS = [
  {
    clave: "ia",
    numero: `DT-IA-${period}`,
    concepto: "Inteligencia artificial — consumo del mes",
    detalle: `${miles(mes.uso.runs)} corridas de IA · ${miles(mes.uso.inputTokens)} tokens de entrada (${miles(mes.uso.cachedInputTokens)} en caché) · ${miles(mes.uso.outputTokens)} de salida. Tarifa de OpenAI, sin recargo.`,
    subtotal: mes.uso.usd,
    iva: mes.ivaTokens,
    preliminar,
  },
  {
    clave: "mantenimiento",
    numero: `DT-MANT-${period}`,
    concepto: "Mantenimiento mensual",
    detalle: "Servidor, base de datos, WhatsApp, soporte y ajustes del bot.",
    subtotal: mes.mantenimiento,
    iva: mes.ivaMantenimiento,
    // Monto fijo: no depende de que el mes haya cerrado.
    preliminar: false,
  },
];

const html = (doc) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Pre-factura ${doc.numero} · Depot Tire</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font: 13px/1.5 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1c1c1c; margin: 0; }
  h1 { font-size: 22px; margin: 0; letter-spacing: .02em; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1c1c1c; padding-bottom: 12px; }
  .num { text-align: right; color: #555; }
  .num b { color: #1c1c1c; font-size: 15px; }
  .partes { display: flex; gap: 40px; margin: 20px 0; }
  .partes div { flex: 1; }
  .rot { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #777; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #777; border-bottom: 1px solid #ccc; padding: 6px 4px; }
  td { padding: 10px 4px; border-bottom: 1px solid #eee; vertical-align: top; }
  td.m, th.m { text-align: right; white-space: nowrap; }
  .det { color: #666; font-size: 12px; }
  .tot { width: 300px; margin-left: auto; margin-top: 12px; }
  .tot td { border: 0; padding: 4px; }
  .tot tr.g td { border-top: 2px solid #1c1c1c; font-weight: 700; font-size: 16px; padding-top: 8px; }
  .aviso { background: #fff4d6; border: 1px solid #e6c35c; padding: 8px 12px; margin: 16px 0; font-weight: 600; }
  .pie { margin-top: 28px; font-size: 12px; color: #555; border-top: 1px solid #ddd; padding-top: 10px; }
</style></head><body>
<div class="top">
  <div><h1>PRE-FACTURA</h1><div class="det">Servicio AutoVenta · bot de ventas por WhatsApp</div></div>
  <div class="num">N.º <b>${doc.numero}</b><br>Emitida: ${fechaLarga(emitida)}<br>Vence: ${fechaLarga(mes.vence)}</div>
</div>
${doc.preliminar ? `<div class="aviso">PRELIMINAR — el mes todavía no cierra; el consumo de IA puede subir hasta el ${fechaLarga(finDeMes)}.</div>` : ""}
<div class="partes">
  <div><div class="rot">De</div><b>${esc(datos.emisor.nombre)}</b><br>${datos.emisor.ruc ? `RUC ${esc(datos.emisor.ruc)}<br>` : ""}${esc(datos.emisor.correo)}${datos.emisor.telefono ? ` · ${esc(datos.emisor.telefono)}` : ""}</div>
  <div><div class="rot">Para</div><b>${esc(datos.cliente.nombre)}</b><br>${datos.cliente.ruc ? `RUC ${esc(datos.cliente.ruc)}<br>` : ""}${esc(datos.cliente.direccion)}</div>
  <div><div class="rot">Periodo</div><b>${nombreMes(period)}</b><br>${fechaLarga(mes.desde)} – ${fechaLarga(mes.hasta)}</div>
</div>
<table>
  <tr><th>Concepto</th><th class="m">Valor</th></tr>
  <tr><td><b>${doc.concepto}</b><div class="det">${doc.detalle}</div></td><td class="m">${usd(doc.subtotal)}</td></tr>
</table>
<table class="tot">
  <tr><td>Subtotal</td><td class="m">${usd(doc.subtotal)}</td></tr>
  <tr><td>IVA ${ivaPorc} %</td><td class="m">${usd(doc.iva)}</td></tr>
  <tr class="g"><td>Total a pagar</td><td class="m">${usd(r2(doc.subtotal + doc.iva))}</td></tr>
</table>
<div class="pie">
  <div><b>Forma de pago:</b> ${esc(datos.pago)}</div>
  <div style="margin-top:6px">${doc.clave === "ia" ? "El detalle diario del consumo está en el tab KPI del hub. " : ""}La factura electrónica del SRI se emite por los mismos valores.</div>
</div>
</body></html>`;

mkdirSync(outDir, { recursive: true });
console.log(`Pre-facturas ${period}${preliminar ? " (PRELIMINAR, mes en curso)" : ""}`);
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
  console.log(`  ${doc.numero.padEnd(18)} ${usd(doc.subtotal)} + IVA ${usd(doc.iva)} = ${usd(r2(doc.subtotal + doc.iva))}`);
  console.log(`    ${pdf ?? `${base}.html (sin Chrome: no hay PDF)`}`);
}
console.log(`  TOTAL DEL MES      ${usd(mes.total)}   vence ${mes.vence}${mes.pagado ? "   (YA PAGADO)" : ""}`);
const impagos = billing.meses.filter((m) => !m.pagado && !m.enCurso && m.period < period);
for (const m of impagos) console.log(`  OJO: ${m.period} sigue sin marcarse pagado en el hub (${usd(m.total)})`);
