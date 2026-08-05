#!/usr/bin/env node
/**
 * Convierte la extracción (+ el análisis del skill) en un HTML de una sola
 * página, y ADEMÁS registra la corrida en el historial.
 *
 * El historial es el punto: sin él, cada auditoría es una foto suelta y no hay
 * forma de saber si un cambio sirvió. Con él, cada corrida se compara contra la
 * anterior y contra los cambios que se aplicaron en medio.
 *
 * Uso:
 *   node scripts/auditoria/render.mjs \
 *     --datos /tmp/auditoria.json \
 *     --analisis /tmp/analisis.json \
 *     --salida ~/auditorias/2026-08-05.html
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aquí = dirname(fileURLToPath(import.meta.url));
const HISTORIAL = resolve(aquí, "registro/historial.jsonl");

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const datos = JSON.parse(readFileSync(opt("datos"), "utf8"));
const analisis = opt("analisis") && existsSync(opt("analisis"))
  ? JSON.parse(readFileSync(opt("analisis"), "utf8"))
  : { resumen: "", hipotesis: [], cambiosPropuestos: [], promptPropuesto: "" };
const SALIDA = opt("salida", resolve(aquí, "reportes/ultima.html"));

const historial = existsSync(HISTORIAL)
  ? readFileSync(HISTORIAL, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  : [];
const previa = historial.at(-1) ?? null;

const m = datos.metricas;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ── Deltas contra la corrida anterior ────────────────────────────────────────
// `mejorSiSube` dice hacia dónde es bueno moverse: sin eso, un -40% en fallas y
// un -40% en ventas se pintarían igual.
function delta(valorActual, valorPrevio, mejorSiSube) {
  if (valorPrevio == null || valorActual == null) return { texto: "primera medición", clase: "neutro" };
  const d = Number((valorActual - valorPrevio).toFixed(1));
  if (d === 0) return { texto: "sin cambio", clase: "neutro" };
  const bueno = mejorSiSube ? d > 0 : d < 0;
  return { texto: `${d > 0 ? "+" : ""}${d}`, clase: bueno ? "bien" : "mal" };
}

const FALLAS_ETIQUETA = {
  error_procesamiento: "El bot se colgó y pidió repetir el mensaje",
  pide_foto_que_no_puede_leer: "Pidió una foto que no puede leer",
  pregunta_teniendo_medida: "Preguntó teniendo ya la medida",
  pregunta_repetida: "Repitió la misma pregunta",
  cotizacion_duplicada: "Mandó la cotización dos veces",
  con_medida_sin_cotizar: "Tenía la medida y nunca cotizó",
  sin_ficha_verificada: "Se escudó en «no tengo ficha verificada»",
  pieza_fallida: "No pudo dibujar la pieza",
  abandono_tras_pregunta: "El cliente se fue tras una pregunta del bot",
};

const fallasOrdenadas = Object.entries(m.fallas)
  .map(([id, v]) => ({ id, ...v, etiqueta: FALLAS_ETIQUETA[id] ?? id,
    previa: previa?.metricas?.fallas?.[id]?.pctChats ?? null }))
  .sort((a, b) => b.pctChats - a.pctChats);

const ejemplos = (detector, n = 3) =>
  datos.hallazgos.filter((h) => h.detector === detector).slice(0, n);

const tarjeta = (titulo, valor, sufijo, d, nota) => `
  <div class="tarjeta">
    <p class="etiqueta">${esc(titulo)}</p>
    <p class="valor">${esc(valor)}<span class="sufijo">${esc(sufijo ?? "")}</span></p>
    <p class="delta ${d.clase}">${esc(d.texto)}${nota ? ` · ${esc(nota)}` : ""}</p>
  </div>`;

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Auditoría de ventas · AutoVenta</title>
<style>
  :root{--bg:#0b0e14;--card:#141926;--ink:#e9edf5;--muted:#93a0b8;--line:#232c3f;
        --bien:#3ddc84;--mal:#ff5c62;--neutro:#93a0b8;--acento:#ffb020}
  @media (prefers-color-scheme:light){:root{--bg:#f6f7fb;--card:#fff;--ink:#131722;--muted:#5d6880;--line:#e3e7f0}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;padding:32px 20px 64px}
  .wrap{max-width:1100px;margin:0 auto}
  h1{font-size:26px;margin:0 0 4px} h2{font-size:17px;margin:38px 0 12px;letter-spacing:.02em}
  .sub{color:var(--muted);font-size:13px;margin:0 0 28px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
  .tarjeta{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
  .etiqueta{font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin:0 0 6px}
  .valor{font-size:30px;font-weight:800;margin:0;font-variant-numeric:tabular-nums}
  .sufijo{font-size:14px;font-weight:600;color:var(--muted);margin-left:3px}
  .delta{font-size:11.5px;margin:5px 0 0;font-weight:700}
  .bien{color:var(--bien)} .mal{color:var(--mal)} .neutro{color:var(--neutro)}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
  .scroll{overflow-x:auto}
  th,td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--line);font-size:13.5px}
  th{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700}
  tr:last-child td{border-bottom:none}
  .barra{height:6px;border-radius:3px;background:var(--line);overflow:hidden;min-width:80px}
  .barra i{display:block;height:100%;background:var(--mal)}
  .ejemplo{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--acento);
           border-radius:0 10px 10px 0;padding:9px 13px;margin:7px 0;font-size:12.5px;color:var(--muted)}
  .ejemplo b{color:var(--ink);font-weight:700}
  pre{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;
      overflow-x:auto;font-size:12.5px;line-height:1.5;white-space:pre-wrap}
  .aviso{background:color-mix(in srgb,var(--acento) 12%,transparent);border:1px solid color-mix(in srgb,var(--acento) 35%,transparent);
         border-radius:12px;padding:13px 16px;font-size:13.5px;margin:14px 0}
  ul{padding-left:20px} li{margin:5px 0}
</style></head><body><div class="wrap">

<h1>¿Está vendiendo el bot?</h1>
<p class="sub">Últimos ${m.conversaciones ? datos.periodoDias : 0} días · ${m.conversaciones} conversaciones ·
generado ${new Date(datos.generadoEn).toLocaleString("es-EC")} ·
${previa ? `comparado contra la corrida del ${new Date(previa.fecha).toLocaleDateString("es-EC")}` : "primera corrida (sin comparación)"}</p>

<h2>El embudo</h2>
<div class="grid">
  ${tarjeta("Conversaciones", m.conversaciones, "", delta(m.conversaciones, previa?.metricas?.conversaciones, true))}
  ${tarjeta("Con medida", m.conMedida, "", delta(m.conMedida, previa?.metricas?.conMedida, true))}
  ${tarjeta("Llegaron a cotización", m.conCotizacion, "", delta(m.conCotizacion, previa?.metricas?.conCotizacion, true))}
  ${tarjeta("Ventas cerradas", m.ganados, "", delta(m.ganados, previa?.metricas?.ganados, true))}
  ${tarjeta("Medida → cotización", m.tasaMedidaACotizacion, "%", delta(m.tasaMedidaACotizacion, previa?.metricas?.tasaMedidaACotizacion, true))}
  ${tarjeta("Cotización → venta", m.tasaCotizacionAVenta, "%", delta(m.tasaCotizacionAVenta, previa?.metricas?.tasaCotizacionAVenta, true))}
</div>

<h2>Cuánto le cuesta al cliente llegar a un precio</h2>
<div class="grid">
  ${tarjeta("Preguntas antes de cotizar", m.preguntasAntesDeCotizarMediana ?? "—", " mediana",
      delta(m.preguntasAntesDeCotizarMediana, previa?.metricas?.preguntasAntesDeCotizarMediana, false),
      "menos es mejor")}
  ${tarjeta("Turnos antes de cotizar", m.turnosAntesDeCotizarMediana ?? "—", " mediana",
      delta(m.turnosAntesDeCotizarMediana, previa?.metricas?.turnosAntesDeCotizarMediana, false),
      "menos es mejor")}
  ${tarjeta("Errores del modelo", m.modelo.pctErrores, "%",
      delta(m.modelo.pctErrores, previa?.metricas?.modelo?.pctErrores, false),
      `${m.modelo.errores}/${m.modelo.corridas} corridas`)}
  ${tarjeta("Latencia", m.modelo.latenciaMedianaMs ?? "—", " ms",
      delta(m.modelo.latenciaMedianaMs, previa?.metricas?.modelo?.latenciaMedianaMs, false))}
</div>
<p class="sub" style="margin-top:10px">Modelo(s) en uso: <b>${esc(m.modelo.modelos.join(", ") || "—")}</b> ·
${m.modelo.tokensEntrada.toLocaleString("es-EC")} tokens de entrada,
${m.modelo.tokensSalida.toLocaleString("es-EC")} de salida.</p>

<h2>Dónde falla, por impacto</h2>
<div class="scroll"><table>
<tr><th>Falla</th><th>Chats afectados</th><th>%</th><th>Incidencias</th><th>vs. corrida anterior</th></tr>
${fallasOrdenadas.map((f) => {
  const d = delta(f.pctChats, f.previa, false);
  return `<tr>
    <td>${esc(f.etiqueta)}</td>
    <td>${f.chatsAfectados}</td>
    <td><div class="barra"><i style="width:${Math.min(100, f.pctChats)}%"></i></div>${f.pctChats}%</td>
    <td>${f.incidencias}</td>
    <td class="delta ${d.clase}">${esc(d.texto)}</td>
  </tr>`;
}).join("")}
</table></div>

<h2>Chats donde se ve</h2>
${fallasOrdenadas.filter((f) => f.incidencias > 0).slice(0, 5).map((f) => `
  <p style="font-size:13px;font-weight:700;margin:18px 0 4px">${esc(f.etiqueta)}</p>
  ${ejemplos(f.id).map((e) => `<div class="ejemplo">
    <b>${esc(e.cliente)}</b> · ticket ${e.conversationId} · ${new Date(e.cuando).toLocaleString("es-EC")}<br>${esc(e.extracto)}
  </div>`).join("")}
`).join("")}

${analisis.resumen ? `<h2>Lectura</h2><div class="aviso">${esc(analisis.resumen)}</div>` : ""}

${analisis.hipotesis?.length ? `<h2>Por qué pasa</h2><ul>${
  analisis.hipotesis.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}

${analisis.cambiosPropuestos?.length ? `<h2>Cambios propuestos</h2><div class="scroll"><table>
<tr><th>Cambio</th><th>Ataca</th><th>Métrica que debería moverse</th></tr>
${analisis.cambiosPropuestos.map((c) => `<tr><td>${esc(c.cambio)}</td><td>${esc(FALLAS_ETIQUETA[c.ataca] ?? c.ataca)}</td><td>${esc(c.metrica)}</td></tr>`).join("")}
</table></div>` : ""}

${analisis.promptPropuesto ? `<h2>Prompt propuesto</h2>
<p class="sub">Pegar en el panel → Ajustes → IA, o en <code>app/src/agent/prompts.ts</code>.</p>
<pre>${esc(analisis.promptPropuesto)}</pre>` : ""}

<h2>Historial de corridas</h2>
<div class="scroll"><table>
<tr><th>Fecha</th><th>Modelo</th><th>Cotizaciones</th><th>Ventas</th><th>Medida→cot.</th><th>Preguntas antes</th><th>Cambios aplicados desde la anterior</th></tr>
${[...historial, { fecha: datos.generadoEn, metricas: m, cambiosAplicados: analisis.cambiosPropuestos?.map((c) => c.cambio) ?? [] }]
  .map((r) => `<tr>
    <td>${new Date(r.fecha).toLocaleDateString("es-EC")}</td>
    <td>${esc((r.metricas.modelo?.modelos ?? []).join(", "))}</td>
    <td>${r.metricas.conCotizacion}</td>
    <td>${r.metricas.ganados}</td>
    <td>${r.metricas.tasaMedidaACotizacion}%</td>
    <td>${r.metricas.preguntasAntesDeCotizarMediana ?? "—"}</td>
    <td>${esc((r.cambiosAplicados ?? []).join(" · ") || "—")}</td>
  </tr>`).join("")}
</table></div>
<p class="sub" style="margin-top:10px">Cada fila es una auditoría. Si un cambio no mueve su métrica en la corrida
siguiente, no funcionó — revertirlo es tan válido como insistir.</p>

</div></body></html>`;

mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, html);

// Registrar la corrida SOLO después de escribir el HTML: si el render falla, la
// corrida no queda contada y el historial no miente.
mkdirSync(dirname(HISTORIAL), { recursive: true });
appendFileSync(HISTORIAL, `${JSON.stringify({
  fecha: datos.generadoEn,
  periodoDias: datos.periodoDias,
  metricas: m,
  cambiosAplicados: analisis.cambiosPropuestos?.map((c) => c.cambio) ?? [],
})}\n`);

console.log(`✅ Reporte: ${SALIDA}`);
console.log(`📎 Corrida registrada en ${HISTORIAL} (${historial.length + 1} en total)`);
