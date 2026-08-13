#!/usr/bin/env node
/**
 * Genera el reporte HTML de la REVISIÓN CONTEXTUAL del día y archiva la
 * corrida en el registro, para que cada día se compare contra el anterior.
 *
 * Entradas:
 *   --datos     JSON de extraer.mjs (para fecha, commit y total de chats)
 *   --hallazgos array de hallazgos consolidado (lo escribe el skill)
 *   --sintesis  síntesis del revisor: { resumen, patrones[], correcciones[] }
 *   --salida    copia extra del HTML (opcional; el original SIEMPRE va al registro)
 *
 * Uso:
 *   node scripts/revision/render.mjs --datos /tmp/revision.json \
 *     --hallazgos /tmp/hallazgos.json --sintesis /tmp/sintesis.json
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};

const leer = (ruta) => JSON.parse(readFileSync(ruta, "utf8"));
const datos = leer(opt("datos", null) ?? falta("--datos"));
const hallazgos = leer(opt("hallazgos", null) ?? falta("--hallazgos"));
const sintesis = leer(opt("sintesis", null) ?? falta("--sintesis"));
const SALIDA_EXTRA = opt("salida", null);
const HUB = opt("hub", "https://autoventa-depottire.up.railway.app/admin");

function falta(cual) {
  console.error(`Falta ${cual}`);
  process.exit(1);
}

const REGISTRO = path.join(path.dirname(fileURLToPath(import.meta.url)), "registro");
const carpeta = path.join(REGISTRO, "reportes", datos.fecha);
mkdirSync(carpeta, { recursive: true });

// ── Métricas de la corrida ──────────────────────────────────────────────────
const porSeveridad = { alta: 0, media: 0, baja: 0 };
const porCategoria = {};
for (const h of hallazgos) {
  if (h.severidad in porSeveridad) porSeveridad[h.severidad] += 1;
  porCategoria[h.categoria] = (porCategoria[h.categoria] ?? 0) + 1;
}
const convsConHallazgo = new Set(hallazgos.map((h) => h.conversacionId)).size;

const entrada = {
  fecha: datos.fecha,
  generadoEn: datos.generadoEn,
  commitBot: datos.commit ?? null,
  conversaciones: datos.totalConversaciones,
  conversacionesConHallazgo: convsConHallazgo,
  hallazgos: porSeveridad,
  porCategoria,
};

// ── Historial: una línea por día; re-render del mismo día reemplaza la suya ──
const rutaHistorial = path.join(REGISTRO, "historial.jsonl");
const lineas = existsSync(rutaHistorial)
  ? readFileSync(rutaHistorial, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  : [];
const previa = [...lineas].reverse().find((l) => l.fecha < datos.fecha) ?? null;
const sinEsteDia = lineas.filter((l) => l.fecha !== datos.fecha);
sinEsteDia.push(entrada);
sinEsteDia.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
writeFileSync(rutaHistorial, sinEsteDia.map((l) => JSON.stringify(l)).join("\n") + "\n");

// ── HTML ────────────────────────────────────────────────────────────────────
const esc = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const link = (id) => `${HUB}/#/ticket/${id}`;

const SEV_ORDEN = { alta: 0, media: 1, baja: 2 };
const ordenados = [...hallazgos].sort(
  (a, b) => (SEV_ORDEN[a.severidad] ?? 9) - (SEV_ORDEN[b.severidad] ?? 9) || a.conversacionId - b.conversacionId,
);

const tendencia = Object.keys({ ...porCategoria, ...(previa?.porCategoria ?? {}) })
  .sort()
  .map((cat) => {
    const hoy = porCategoria[cat] ?? 0;
    const ayer = previa?.porCategoria?.[cat] ?? null;
    const delta = ayer == null ? null : hoy - ayer;
    return { cat, hoy, ayer, delta };
  });

const filaHallazgo = (h) => `
<tr class="sev-${esc(h.severidad)}">
  <td><span class="pill ${esc(h.severidad)}">${esc(h.severidad)}</span></td>
  <td><a href="${link(h.conversacionId)}" target="_blank">#${esc(h.conversacionId)}</a><div class="sub">${esc(h.cliente ?? "")}</div></td>
  <td><code>${esc(h.categoria)}</code></td>
  <td>
    <div class="resumen">${esc(h.resumen)}</div>
    <details><summary>evidencia y sugerencia</summary>
      <blockquote>${esc(h.evidencia ?? "")}</blockquote>
      ${h.costo ? `<p><strong>Costo:</strong> ${esc(h.costo)}</p>` : ""}
      ${h.sugerencia ? `<p><strong>Debió:</strong> ${esc(h.sugerencia)}</p>` : ""}
    </details>
  </td>
</tr>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Revisión contextual · ${esc(datos.fecha)} · Depot Tire</title>
<style>
  :root { --rojo:#e52c2a; --negro:#1c1e1b; --oro:#ffcb05; --gris:#605e5e; --borde:#e3e3e3; --fondo:#fafafa; }
  * { box-sizing:border-box; }
  body { font:15px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; color:var(--negro); background:var(--fondo); margin:0; }
  header { background:var(--negro); color:#fff; padding:26px 28px; border-bottom:6px solid var(--rojo); }
  header h1 { margin:0; font-size:21px; } header .sub { color:#b0b0b0; margin-top:4px; font-size:13px; }
  main { max-width:1080px; margin:0 auto; padding:24px 20px 60px; }
  .tarjetas { display:flex; gap:14px; flex-wrap:wrap; margin:18px 0; }
  .tarjeta { flex:1; min-width:150px; background:#fff; border:1px solid var(--borde); border-radius:12px; padding:16px 18px; }
  .tarjeta .n { font-size:34px; font-weight:800; } .tarjeta .l { color:var(--gris); font-size:12px; letter-spacing:1px; text-transform:uppercase; }
  .n.alta { color:var(--rojo); } .n.media { color:#c07f00; } .n.baja { color:var(--gris); }
  h2 { font-size:16px; letter-spacing:1px; text-transform:uppercase; border-left:5px solid var(--rojo); padding-left:10px; margin-top:34px; }
  .patron { background:#fff; border:1px solid var(--borde); border-left:5px solid var(--oro); border-radius:10px; padding:14px 18px; margin:10px 0; }
  .patron h3 { margin:0 0 6px; font-size:15px; }
  .patron .convs a { margin-right:6px; }
  table { width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--borde); border-radius:10px; overflow:hidden; }
  th { text-align:left; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:var(--gris); padding:10px 12px; border-bottom:2px solid var(--borde); }
  td { padding:10px 12px; border-bottom:1px solid var(--borde); vertical-align:top; }
  .pill { padding:3px 10px; border-radius:999px; font-size:11px; font-weight:700; text-transform:uppercase; }
  .pill.alta { background:#ffe3e2; color:var(--rojo); } .pill.media { background:#fff3d0; color:#8a6410; } .pill.baja { background:#eee; color:var(--gris); }
  .sub { color:var(--gris); font-size:12px; }
  details { margin-top:6px; } summary { cursor:pointer; color:var(--gris); font-size:13px; }
  blockquote { margin:8px 0; padding:8px 12px; background:var(--fondo); border-left:3px solid var(--borde); font-size:13px; white-space:pre-wrap; }
  .delta-up { color:var(--rojo); font-weight:700; } .delta-down { color:#1e7a3c; font-weight:700; }
  .resumen-dia { background:#fff; border:1px solid var(--borde); border-radius:12px; padding:16px 20px; font-size:15px; }
  a { color:#b3110f; }
</style></head><body>
<header>
  <h1>Revisión contextual del bot · ${esc(datos.fecha)}</h1>
  <div class="sub">${esc(datos.totalConversaciones)} conversaciones revisadas mensaje a mensaje · bot en commit ${esc(datos.commit ?? "?")} · generado ${esc(new Date(datos.generadoEn).toLocaleString("es-EC", { timeZone: "America/Guayaquil" }))}</div>
</header>
<main>
  <div class="tarjetas">
    <div class="tarjeta"><div class="n">${datos.totalConversaciones}</div><div class="l">chats del día</div></div>
    <div class="tarjeta"><div class="n">${convsConHallazgo}</div><div class="l">con hallazgos</div></div>
    <div class="tarjeta"><div class="n alta">${porSeveridad.alta}</div><div class="l">altas</div></div>
    <div class="tarjeta"><div class="n media">${porSeveridad.media}</div><div class="l">medias</div></div>
    <div class="tarjeta"><div class="n baja">${porSeveridad.baja}</div><div class="l">bajas</div></div>
  </div>

  <div class="resumen-dia">${esc(sintesis.resumen ?? "")}</div>

  <h2>Patrones del día</h2>
  ${(sintesis.patrones ?? []).map((p) => `
  <div class="patron">
    <h3>${esc(p.titulo)}</h3>
    <div>${esc(p.detalle)}</div>
    ${p.conversaciones?.length ? `<div class="convs sub">Chats: ${p.conversaciones.map((c) => `<a href="${link(c)}" target="_blank">#${esc(c)}</a>`).join(" ")}</div>` : ""}
    ${p.accion ? `<div><strong>Acción:</strong> ${esc(p.accion)}</div>` : ""}
  </div>`).join("")}

  ${(sintesis.correcciones ?? []).length ? `<h2>Corregido hoy mismo</h2><ul>${sintesis.correcciones.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}

  <h2>Tendencia por categoría</h2>
  <table><thead><tr><th>Categoría</th><th>Hoy</th><th>${previa ? `Anterior (${esc(previa.fecha)})` : "Anterior"}</th><th>Δ</th></tr></thead><tbody>
  ${tendencia.map((t) => `<tr><td><code>${esc(t.cat)}</code></td><td>${t.hoy}</td><td>${t.ayer ?? "—"}</td><td>${
    t.delta == null ? "—" : t.delta > 0 ? `<span class="delta-up">+${t.delta}</span>` : t.delta < 0 ? `<span class="delta-down">${t.delta}</span>` : "0"
  }</td></tr>`).join("")}
  </tbody></table>
  ${previa ? "" : `<p class="sub">Primera corrida: desde mañana esta tabla compara contra el día anterior.</p>`}

  <h2>Todos los hallazgos (${hallazgos.length})</h2>
  <table><thead><tr><th>Sev.</th><th>Chat</th><th>Categoría</th><th>Qué pasó</th></tr></thead>
  <tbody>${ordenados.map(filaHallazgo).join("")}</tbody></table>
</main></body></html>`;

writeFileSync(path.join(carpeta, "reporte.html"), html);
writeFileSync(path.join(carpeta, "hallazgos.json"), JSON.stringify(hallazgos, null, 1));
writeFileSync(path.join(carpeta, "sintesis.json"), JSON.stringify(sintesis, null, 1));
if (SALIDA_EXTRA) copyFileSync(path.join(carpeta, "reporte.html"), SALIDA_EXTRA);

console.error(`✔ Reporte del ${datos.fecha}: ${hallazgos.length} hallazgos (${porSeveridad.alta} altas) → ${path.join(carpeta, "reporte.html")}`);
