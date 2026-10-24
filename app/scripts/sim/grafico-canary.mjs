#!/usr/bin/env node
/**
 * Gráfico de control del canary: una página HTML, poco texto.
 *
 * Por cada configuración barata (todo en mini, guardián en mini, vendedor en
 * mini) dibuja la DIFERENCIA de nota del juez contra el control, caso por caso,
 * con límites de control de individuos (media ± 2,66 × rango móvil medio).
 * Un punto bajo el límite inferior es una pérdida real; el resto es ruido del
 * propio bot (dos corridas del mismo modelo no dan la misma nota).
 *
 *   node scripts/sim/grafico-canary.mjs > ../docs/reportes-historicos/2026-10-24-canary-control-chart.html
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const dir = resolve(import.meta.dirname, "mediciones");
const leer = async (e) => JSON.parse(await readFile(resolve(dir, `canary-${e}.json`), "utf8")).casos;
const control = await leer("control");
const CONFIGS = [
  { etiqueta: "mini-ambos", nombre: "Vendedor + Guardián en mini", color: "#eb6834", colorDark: "#d95926" },
  { etiqueta: "mini-guardian", nombre: "Solo el Guardián en mini", color: "#2a78d6", colorDark: "#3987e5" },
  { etiqueta: "mini-vendedor", nombre: "Solo el vendedor en mini", color: "#1baf7a", colorDark: "#199e70" },
];
const porN = (xs) => new Map(xs.map((c) => [c.n, c]));
const C = porN(control);

const tecnico = (c) => (c.turnos ?? []).filter((t) => t.sinRespuesta || /problema t[ée]cnico|le consulto con un asesor y le confirmo/i.test((t.bot ?? []).map((b) => b.texto).join(" "))).length;
const resumen = (xs) => {
  const conNota = xs.filter((c) => c.juez?.nota);
  return {
    casos: xs.length,
    nota: conNota.length ? conNota.reduce((a, c) => a + c.juez.nota, 0) / conNota.length : null,
    bajas: xs.filter((c) => (c.juez?.nota ?? 10) <= 4).length,
    tecnicos: xs.reduce((a, c) => a + tecnico(c), 0),
    turnos: xs.reduce((a, c) => a + (c.turnos?.length ?? 0), 0),
    invariantes: xs.filter((c) => c.invariantes?.length).length,
    cotizaciones: xs.reduce((a, c) => a + (c.cotizaciones ?? 0), 0),
    visitas: xs.filter((c) => c.visita).length,
    usd: xs.reduce((a, c) => a + (c.costo?.usd ?? 0), 0),
    segundos: xs.reduce((a, c) => a + (c.segundos ?? 0), 0) / Math.max(1, xs.length),
  };
};

const series = [];
for (const cfg of CONFIGS) {
  const casos = await leer(cfg.etiqueta).catch(() => []);
  const M = porN(casos);
  const comunes = [...M.keys()].filter((n) => C.has(n)).sort((a, b) => a - b);
  const puntos = comunes.map((n) => {
    const a = M.get(n).juez?.nota, b = C.get(n).juez?.nota;
    return { n, a, b, d: a != null && b != null ? a - b : null, familia: M.get(n).familia, titulo: M.get(n).titulo };
  });
  const ds = puntos.map((p) => p.d).filter((d) => d != null);
  const media = ds.reduce((x, y) => x + y, 0) / Math.max(1, ds.length);
  const mr = ds.slice(1).map((d, i) => Math.abs(d - ds[i]));
  const mrBar = mr.reduce((x, y) => x + y, 0) / Math.max(1, mr.length);
  const ucl = media + 2.66 * mrBar, lcl = media - 2.66 * mrBar;
  const mios = comunes.map((n) => M.get(n)), suyos = comunes.map((n) => C.get(n));
  // Además del punto suelto, el corrimiento de la MEDIA: error estándar ×2.
  const sd = Math.sqrt(ds.reduce((x, d) => x + (d - media) ** 2, 0) / Math.max(1, ds.length - 1));
  const ee2 = (2 * sd) / Math.sqrt(Math.max(1, ds.length));
  series.push({ ...cfg, puntos, media, ucl, lcl, ee2, corrida: media + ee2 < 0, fuera: puntos.filter((p) => p.d != null && p.d < lcl), mejor: puntos.filter((p) => p.d != null && p.d > ucl), r: resumen(mios), rc: resumen(suyos) });
}

const f1 = (v) => (v == null ? "—" : v.toFixed(1));
const f2 = (v) => (v == null ? "—" : v.toFixed(2));
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : "—");

function chart(s) {
  const W = 860, H = 260, m = { l: 36, r: 16, t: 14, b: 28 };
  const xs = s.puntos.map((p) => p.n);
  const x = (n) => m.l + ((n - 1) / 49) * (W - m.l - m.r);
  const yMin = Math.min(-6, Math.floor(s.lcl) - 1), yMax = Math.max(6, Math.ceil(s.ucl) + 1);
  const y = (v) => m.t + ((yMax - v) / (yMax - yMin)) * (H - m.t - m.b);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Diferencia de nota contra el control, caso por caso, con límites de control">`;
  svg += `<rect x="${m.l}" y="${y(s.ucl)}" width="${W - m.l - m.r}" height="${y(s.lcl) - y(s.ucl)}" fill="var(--band)"/>`;
  for (let v = yMin; v <= yMax; v += 2) svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v > 0 ? "+" : ""}${v}</text>`;
  svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--fg2)" stroke-width="1"/>`;
  svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(s.media)}" y2="${y(s.media)}" stroke="var(--c)" stroke-dasharray="5 4"/>`;
  svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(s.ucl)}" y2="${y(s.ucl)}" stroke="var(--muted)" stroke-dasharray="2 3"/>`;
  svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(s.lcl)}" y2="${y(s.lcl)}" stroke="var(--muted)" stroke-dasharray="2 3"/>`;
  svg += `<text x="${W - m.r}" y="${y(s.ucl) - 4}" text-anchor="end" font-size="11" fill="var(--muted)">límite superior ${s.ucl > 0 ? "+" : ""}${f1(s.ucl)}</text>`;
  svg += `<text x="${W - m.r}" y="${y(s.lcl) + 13}" text-anchor="end" font-size="11" fill="var(--muted)">límite inferior ${f1(s.lcl)}</text>`;
  svg += `<text x="${m.l + 4}" y="${y(s.media) - 5}" font-size="11" fill="var(--c)">media ${s.media > 0 ? "+" : ""}${f2(s.media)}</text>`;
  const con = s.puntos.filter((p) => p.d != null);
  svg += `<path d="${con.map((p, i) => `${i ? "L" : "M"}${x(p.n).toFixed(1)},${y(p.d).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--c)" stroke-width="1.5" opacity=".6"/>`;
  for (const p of con) {
    const fuera = p.d < s.lcl || p.d > s.ucl;
    svg += `<circle cx="${x(p.n)}" cy="${y(p.d)}" r="${fuera ? 6 : 4}" fill="${fuera ? "var(--c)" : "var(--card)"}" stroke="var(--c)" stroke-width="2"><title>Caso ${p.n} · ${p.familia}\n${p.titulo}\nbarato ${p.a} · control ${p.b} · diferencia ${p.d > 0 ? "+" : ""}${p.d}</title></circle>`;
    if (fuera) svg += `<text x="${x(p.n)}" y="${y(p.d) + (p.d < 0 ? 18 : -10)}" text-anchor="middle" font-size="11" fill="var(--fg)">${p.n}</text>`;
  }
  for (const n of [1, 10, 20, 30, 40, 50]) svg += `<text x="${x(n)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">caso ${n}</text>`;
  return svg + `</svg>`;
}

const bloque = (s) => `
<section class="card" style="--c:${s.color};--cd:${s.colorDark}">
  <h2>${s.nombre}</h2>
  <div class="tiles">
    <div class="tile"><div class="l">Nota media (control)</div><div class="n">${f1(s.r.nota)} <span class="vs">vs ${f1(s.rc.nota)}</span></div></div>
    <div class="tile"><div class="l">Diferencia media ± 2 EE</div><div class="n ${s.corrida ? "bad" : "good"}">${s.media > 0 ? "+" : ""}${f2(s.media)} <span class="vs">± ${f2(s.ee2)}</span></div></div>
    <div class="tile"><div class="l">Casos bajo el límite</div><div class="n ${s.fuera.length ? "bad" : "good"}">${s.fuera.length}<span class="vs"> de ${s.puntos.length}</span></div></div>
    <div class="tile"><div class="l">Turnos con falla técnica</div><div class="n">${s.r.tecnicos} <span class="vs">vs ${s.rc.tecnicos}</span></div></div>
    <div class="tile"><div class="l">Cotizaciones · visitas</div><div class="n">${s.r.cotizaciones} · ${s.r.visitas} <span class="vs">vs ${s.rc.cotizaciones} · ${s.rc.visitas}</span></div></div>
    <div class="tile"><div class="l">Costo contra el control</div><div class="n">${pct(s.r.usd, s.rc.usd)}</div></div>
  </div>
  <div class="chart">${chart(s)}</div>
  ${s.fuera.length ? `<p class="lost">Pierde de verdad en: ${s.fuera.map((p) => `caso ${p.n} (${p.familia}, ${p.d})`).join(" · ")}.</p>` : `<p class="lost">${s.corrida ? "Ningún caso solo cae bajo el límite, pero la media está corrida hacia abajo: pierde un poco en muchos casos." : "Ningún caso cae bajo el límite y la media no se mueve: las diferencias son ruido del bot."}</p>`}
</section>`;

const total = resumen(control);
process.stdout.write(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Canary modelo barato · gráfico de control</title>
<style>
  :root { --bg:#fafaf8; --card:#fff; --fg:#1d1d1b; --fg2:#55554f; --muted:#7a7a73; --grid:#ecebe6; --line:#e4e3de; --band:#f1f0ea; --good:#15803d; --bad:#c2410c; }
  @media (prefers-color-scheme: dark) { :root { --bg:#161615; --card:#1f1f1d; --fg:#ecebe7; --fg2:#bdbcb5; --muted:#8f8e87; --grid:#2b2b28; --line:#33332f; --band:#262624; --good:#4ade80; --bad:#fb923c; } }
  * { box-sizing:border-box } body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif }
  main { max-width:900px; margin:0 auto; padding:28px 16px 56px }
  h1 { font-size:24px; margin:0 0 6px } h2 { font-size:18px; margin:0 0 10px; color:var(--c) }
  .sub { color:var(--muted); margin:0 0 20px; font-size:15px }
  .card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:16px; margin:0 0 16px }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin-bottom:10px }
  .tile { border:1px solid var(--line); border-radius:6px; padding:8px 10px } .tile .l { font-size:12px; color:var(--muted) }
  .tile .n { font-size:22px; font-weight:650; font-variant-numeric:tabular-nums } .vs { font-size:13px; font-weight:400; color:var(--muted) }
  .n.bad { color:var(--bad) } .n.good { color:var(--good) }
  .chart svg { width:100%; height:auto; display:block } .lost { margin:8px 0 0; font-size:14px; color:var(--fg2) }
  .leyenda { font-size:14px; color:var(--fg2); margin:0 0 18px } .leyenda b { color:var(--fg) }
</style>
</head>
<body><main>
<h1>Canary de modelo barato: ¿pierde ventas?</h1>
<p class="sub">${control.length} conversaciones reales difíciles, repetidas en el simulador con gpt-5.5 (control) y con gpt-5.4-mini en cada pieza · juez gpt-5.5 · ${new Date().toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" })}</p>
<p class="leyenda">Cada punto es un caso: <b>nota con el modelo barato menos nota del control</b> (escala 1–10). La franja gris son los límites de control: dentro de ella es ruido del propio bot (dos corridas iguales tampoco dan la misma nota). Un punto <b>por debajo del límite inferior</b> es una pérdida real.</p>
${series.map(bloque).join("\n")}
<section class="card">
  <h2 style="color:var(--fg)">Control (gpt-5.5)</h2>
  <div class="tiles">
    <div class="tile"><div class="l">Nota media</div><div class="n">${f1(total.nota)}</div></div>
    <div class="tile"><div class="l">Casos con nota ≤ 4</div><div class="n">${total.bajas}<span class="vs"> de ${total.casos}</span></div></div>
    <div class="tile"><div class="l">Turnos con falla técnica</div><div class="n">${total.tecnicos}<span class="vs"> de ${total.turnos}</span></div></div>
    <div class="tile"><div class="l">Cotizaciones · visitas</div><div class="n">${total.cotizaciones} · ${total.visitas}</div></div>
    <div class="tile"><div class="l">Costo del lote</div><div class="n">$${f2(total.usd)}</div></div>
  </div>
</section>
</main></body></html>
`);
