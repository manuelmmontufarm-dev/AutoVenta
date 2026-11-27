// Página HTML del barrido de modelos (27-nov-2026): tabla corta + un gráfico
// de control por combinación (diferencia de nota contra A, caso por caso).
// Lee analisis.json (de analizar.mjs) y, opcional, un trozo de HTML con la conclusión.
// uso: node informe-html.mjs <analisis.json> [conclusion.html] > salida.html
import { readFileSync } from "node:fs";

const a = JSON.parse(readFileSync(process.argv[2], "utf8"));
const NOMBRES = {
  "bm-a": ["A · Sonnet 5.5, esfuerzo low (producción hoy)", "#55554f", "#bdbcb5"],
  "bm-c": ["C · Sonnet 5.5, esfuerzo medium", "#2a78d6", "#3987e5"],
  "bm-d": ["D · Haiku 5.5, esfuerzo medium", "#1baf7a", "#22c389"],
  "bm-e": ["E · Opus 5.5, esfuerzo low", "#c2410c", "#fb923c"],
};
const base = a.resumen[0].lote;
const filasBase = new Map(a.porLote[base].filas.map((f) => [f.n, f]));
const f1 = (v) => (v == null ? "—" : v.toFixed(1));
const f2 = (v) => (v == null ? "—" : (v > 0 ? "+" : "") + v.toFixed(2));
const usd = (v) => `$${v.toFixed(3)}`;

function serie(lote) {
  const pts = a.porLote[lote].filas.filter((f) => f.nota != null && filasBase.get(f.n)?.nota != null)
    .sort((x, y) => x.n - y.n).map((f) => ({ n: f.n, d: f.nota - filasBase.get(f.n).nota, a: f.nota, b: filasBase.get(f.n).nota }));
  const ds = pts.map((p) => p.d);
  const media = ds.reduce((x, y) => x + y, 0) / Math.max(1, ds.length);
  const mr = ds.slice(1).map((d, i) => Math.abs(d - ds[i]));
  const mrBar = mr.reduce((x, y) => x + y, 0) / Math.max(1, mr.length);
  // Gráfico de individuos: ±2,66 × rango móvil medio ≈ ±3σ.
  return { pts, media, ucl: media + 2.66 * mrBar, lcl: media - 2.66 * mrBar };
}

function chart(s, color) {
  const W = 860, H = 240, m = { l: 34, r: 16, t: 14, b: 26 };
  const xs = s.pts.map((p) => p.n);
  const x = (i) => m.l + ((i + 0.5) / Math.max(1, xs.length)) * (W - m.l - m.r);
  const yMin = Math.min(-7, Math.floor(s.lcl) - 1), yMax = Math.max(7, Math.ceil(s.ucl) + 1);
  const y = (v) => m.t + ((yMax - v) / (yMax - yMin)) * (H - m.t - m.b);
  let g = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Diferencia de nota contra A por caso">`;
  g += `<rect x="${m.l}" y="${y(s.ucl)}" width="${W - m.l - m.r}" height="${y(s.lcl) - y(s.ucl)}" fill="var(--band)"/>`;
  for (let v = Math.ceil(yMin / 2) * 2; v <= yMax; v += 2) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v > 0 ? "+" : ""}${v}</text>`;
  g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--fg2)"/>`;
  g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(s.media)}" y2="${y(s.media)}" stroke="${color}" stroke-dasharray="5 4"/>`;
  for (const [v, t] of [[s.ucl, "límite +3σ"], [s.lcl, "límite −3σ"]]) {
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--muted)" stroke-dasharray="2 3"/>`;
    g += `<text x="${W - m.r}" y="${y(v) + (v > 0 ? -4 : 13)}" text-anchor="end" font-size="11" fill="var(--muted)">${t} ${f1(v)}</text>`;
  }
  g += `<text x="${m.l + 4}" y="${y(s.media) - 5}" font-size="11" fill="${color}">media ${f2(s.media)}</text>`;
  g += `<path d="${s.pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.d).toFixed(1)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="1.5" opacity=".55"/>`;
  s.pts.forEach((p, i) => {
    const fuera = p.d < s.lcl || p.d > s.ucl;
    g += `<circle cx="${x(i)}" cy="${y(p.d)}" r="${fuera ? 6 : 4}" fill="${fuera ? color : "var(--card)"}" stroke="${color}" stroke-width="2"><title>Caso ${p.n}: ${p.a} contra ${p.b} de A</title></circle>`;
    if (p.n === 28 || fuera) g += `<text x="${x(i)}" y="${y(p.d) + (p.d < 0 ? 17 : -9)}" text-anchor="middle" font-size="11" fill="var(--fg)">${p.n}</text>`;
  });
  xs.forEach((n, i) => { if (i % Math.ceil(xs.length / 10) === 0) g += `<text x="${x(i)}" y="${H - 7}" text-anchor="middle" font-size="11" fill="var(--muted)">caso ${n}</text>`; });
  return g + "</svg>";
}

const filasTabla = a.resumen.map((r) => {
  const [nombre] = NOMBRES[r.lote] ?? [r.lote];
  const cotizan = Math.round((r.pct_cotiza * r.casos) / 100);
  return `<tr><td>${nombre}</td><td>${r.casos}</td><td>${f1(r.nota)}</td><td>${r.dif_vs_base == null ? "—" : `${f2(r.dif_vs_base)} ± ${r.dif_sigma.toFixed(2)}`}</td>
    <td>${r.pct_cotiza} %</td><td>${r.convs_con_grave} · ${r.errores_visibles}</td><td>${usd(r.usd_total_conv)}</td><td>${usd(r.usd_anthropic_conv)}</td>
    <td>${cotizan ? usd((r.usd_total_conv * r.casos) / cotizan) : "—"}</td><td>${(r.lat_vend_p50_ms / 1000).toFixed(1)} / ${(r.lat_vend_p90_ms / 1000).toFixed(1)} s</td></tr>`;
}).join("\n");

const bloques = a.resumen.filter((r) => r.lote !== base).map((r) => {
  const [nombre, c, cd] = NOMBRES[r.lote] ?? [r.lote, "#888", "#aaa"];
  const s = serie(r.lote);
  const fuera = s.pts.filter((p) => p.d < s.lcl || p.d > s.ucl);
  return `<section class="card" style="--c:${c};--cd:${cd}"><h2>${nombre}</h2>
  <p class="nota">${s.pts.length} casos pareados con A · diferencia media <b>${f2(r.dif_vs_base)} ± ${r.dif_sigma.toFixed(2)}</b> (±1σ) ·
  ${fuera.length ? `fuera de límites: ${fuera.map((p) => `caso ${p.n} (${f2(p.d)})`).join(", ")}` : "ningún caso fuera de límites: <b>es ruido</b>"}</p>
  <div class="chart">${chart(s, `var(--c)`)}</div></section>`;
}).join("\n");

process.stdout.write(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Barrido de modelos del vendedor</title>
<style>
:root{--bg:#fafaf8;--card:#fff;--fg:#1d1d1b;--fg2:#55554f;--muted:#7a7a73;--grid:#ecebe6;--line:#e4e3de;--band:#f1f0ea}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#1f1f1d;--fg:#ecebe7;--fg2:#bdbcb5;--muted:#8f8e87;--grid:#2b2b28;--line:#33332f;--band:#262624}
 section[style]{--c:var(--cd)!important}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:920px;margin:0 auto;padding:28px 16px 56px}h1{font-size:24px;margin:0 0 6px}h2{font-size:17px;margin:0 0 8px;color:var(--c,var(--fg))}
.sub{color:var(--muted);margin:0 0 18px;font-size:15px}.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px;margin:0 0 16px}
.tabla{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-weight:600;color:var(--fg2);font-size:12px}.chart svg{width:100%;height:auto;display:block}.nota{font-size:14px;color:var(--fg2);margin:0 0 6px}
</style></head><body><main>
<h1>Barrido de modelos del vendedor</h1>
<p class="sub">Casos difíciles reales del lote del 24-nov, repetidos en el simulador el 27-nov-2026 · Guardián Haiku 5.5 en todas · juez: subagentes de Claude Code a ciegas, misma rúbrica del 24-nov</p>
<section class="card"><h2>Qué estás viendo</h2><p class="nota" style="margin:0">Cada combinación atendió los mismos clientes difíciles que A (lo que hay hoy en producción).
Arriba, la tabla con nota (1–10), % que cotiza, errores graves, costo y demora. Abajo, un gráfico de control por combinación: cada punto es un caso,
<b>su nota menos la de A</b>. La franja gris son los límites ±3σ: un punto adentro es ruido del bot y del juez, no «mejor» ni «peor». Solo un punto afuera, u 8 seguidos del mismo lado, sería una diferencia real.</p></section>
${process.argv[3] ? `<section class="card"><h2>Lo que dice</h2>${readFileSync(process.argv[3], "utf8")}</section>` : ""}
<section class="card tabla"><table><thead><tr><th>Combinación</th><th>Casos</th><th>Nota</th><th>Δ vs A ±σ</th><th>Cotiza</th><th>Graves (frenó Guardián · vio cliente)</th><th>$ / conv total</th><th>$ / conv Anthropic</th><th>$ por conv. que cotiza</th><th>Vendedor p50 / p90</th></tr></thead>
<tbody>${filasTabla}</tbody></table></section>
${bloques}
</main></body></html>
`);
