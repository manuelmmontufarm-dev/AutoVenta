#!/usr/bin/env node
/**
 * Cruce multi-señal: además del teléfono, ata cotizaciones a facturas por
 * NOMBRE, por SKU seleccionado y por día de visita prometido.
 * Ninguna señal sola es prueba; se reportan por separado y combinadas.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DATOS = path.join(AQUI, "datos");
for (const linea of fs.readFileSync(path.join(AQUI, "..", "..", ".env"), "utf8").split("\n")) {
  const i = linea.indexOf("=");
  if (i > 0 && !process.env[linea.slice(0, i)]) process.env[linea.slice(0, i)] = linea.slice(i + 1).trim();
}

const norm = (s) => (s ?? "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
const tel9 = (s) => { const d = (s ?? "").replace(/[^0-9]/g, ""); return d.length >= 9 ? d.slice(-9) : null; };
const fechaEc = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? ""); return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00Z`) : null; };
const dia = (d) => d.toISOString().slice(0, 10);

const raw = JSON.parse(fs.readFileSync(path.join(DATOS, "documentos.json"), "utf8"));
const productos = JSON.parse(fs.readFileSync(path.join(DATOS, "productos.json"), "utf8"));
const skuPorId = new Map(productos.map((p) => [p.id, p.codigo]));
const idPorSku = new Map(productos.map((p) => [String(p.codigo).toUpperCase(), p.id]));

const personas = raw.personas ?? [];
const facturas = raw.documentos.filter((d) => d.tipo_documento === "FAC" && !d.anulado);

// índices
const personaPorId = new Map(personas.map((p) => [p.id, p]));
const personaPorTel = new Map();
const personaPorNombre = new Map();
for (const p of personas) {
  for (const t of String(p.telefonos ?? "").split(/[^0-9]+/)) { const k = tel9(t); if (k) personaPorTel.set(k, p); }
  const n = norm(p.razon_social);
  if (n.split(" ").length >= 2) personaPorNombre.set(n, p);
}
// rareza de cada SKU: en cuántas facturas distintas aparece
const facturasPorProducto = new Map();
for (const f of facturas) {
  for (const l of f.detalles ?? []) {
    if (!l.producto_id) continue;
    if (!facturasPorProducto.has(l.producto_id)) facturasPorProducto.set(l.producto_id, []);
    facturasPorProducto.get(l.producto_id).push(f);
  }
}
const facturasPorDia = new Map();
for (const f of facturas) { const d = fechaEc(f.fecha_emision); if (!d) continue;
  const k = dia(d); if (!facturasPorDia.has(k)) facturasPorDia.set(k, []); facturasPorDia.get(k).push(f); }

const sql = postgres(process.env.DATABASE_URL, { ssl: process.env.PGSSL === "disable" ? false : "require" });
const filas = await sql.unsafe(`
  select c.id, c.phone, c.name, c.selected_product_code sku, c.visit_date, c.nearest_store, c.tire_size,
         min(q.created_at) primera, max(q.total) mayor
  from conversations c join quotes q on q.conversation_id = c.id
  group by c.id, c.phone, c.name, c.selected_product_code, c.visit_date, c.nearest_store, c.tire_size`);
await sql.end();

const res = [];
for (const r of filas) {
  const desde = new Date(r.primera);
  const señales = {};

  // A. teléfono
  const pTel = personaPorTel.get(tel9(r.phone));
  if (pTel) { const fs_ = facturas.filter((f) => f.persona_id === pTel.id && fechaEc(f.fecha_emision) >= desde);
    if (fs_.length) señales.telefono = { persona: pTel.razon_social, monto: fs_.reduce((a, f) => a + Number(f.total || 0), 0) }; }

  // B. nombre (exige >=2 palabras para no casar "Jaime" con cualquiera)
  const n = norm(r.name);
  if (!señales.telefono && n.split(" ").length >= 2) {
    const pN = personaPorNombre.get(n);
    if (pN) { const fs_ = facturas.filter((f) => f.persona_id === pN.id && fechaEc(f.fecha_emision) >= desde);
      if (fs_.length) señales.nombre = { persona: pN.razon_social, monto: fs_.reduce((a, f) => a + Number(f.total || 0), 0) }; }
  }

  // C. SKU seleccionado, facturado después de cotizar
  const pid = r.sku ? idPorSku.get(String(r.sku).toUpperCase()) : null;
  if (pid) {
    const cands = (facturasPorProducto.get(pid) ?? []).filter((f) => fechaEc(f.fecha_emision) >= desde);
    const totalSku = (facturasPorProducto.get(pid) ?? []).length;
    if (cands.length) señales.sku = { sku: r.sku, candidatos: cands.length, vecesFacturadoEnTotal: totalSku,
      rareza: totalSku <= 3 ? "raro" : totalSku <= 10 ? "medio" : "comun" };
  }

  // D. día de visita prometido
  if (r.visit_date) {
    const k = dia(new Date(r.visit_date));
    const ese = facturasPorDia.get(k) ?? [];
    if (ese.length) señales.visita = { dia: k, facturasEseDia: ese.length };
  }
  res.push({ ...r, señales });
}

const con = (k) => res.filter((r) => r.señales[k]);
const skuFuerte = res.filter((r) => r.señales.sku && r.señales.sku.rareza !== "comun");
console.log("SEÑALES DE ATRIBUCIÓN — más allá del teléfono");
console.log("─".repeat(62));
console.log("Conversaciones cotizadas          ", res.length);
console.log("  A. teléfono en Contífico + FAC  ", con("telefono").length);
console.log("  B. nombre completo calza + FAC  ", con("nombre").length);
console.log("  C. su SKU se facturó después    ", con("sku").length, `(de esos, SKU raro/medio: ${skuFuerte.length})`);
console.log("  D. prometió día de visita       ", con("visita").length);
const union = res.filter((r) => r.señales.telefono || r.señales.nombre);
console.log("");
console.log("Atribución dura (A o B)           ", union.length,
  "$" + union.reduce((a, r) => a + (r.señales.telefono?.monto ?? r.señales.nombre?.monto ?? 0), 0).toFixed(2));
console.log("");
if (con("nombre").length) {
  console.log("NUEVOS por nombre (no los veía el teléfono):");
  for (const r of con("nombre")) console.log(`  ${r.phone}  bot="${r.name}"  ↔  Contífico="${r.señales.nombre.persona}"  $${r.señales.nombre.monto.toFixed(2)}`);
  console.log("");
}
if (skuFuerte.length) {
  console.log("Pistas por SKU poco común (sospechosos, NO prueba):");
  for (const r of skuFuerte.slice(0, 15))
    console.log(`  ${r.phone}  ${r.name.slice(0, 22).padEnd(22)} SKU ${r.señales.sku.sku.padEnd(20)} ${r.señales.sku.candidatos} factura(s) tras cotizar, ${r.señales.sku.rareza}`);
}
fs.writeFileSync(path.join(DATOS, "senales.json"), JSON.stringify(res, null, 2));
console.log("\nDetalle: datos/senales.json");
