/**
 * Gráfico p del % de borradores que el Guardián corrige por día (producción, SOLO LECTURA).
 * Fase I: Guardián gpt-5.5 (9 al 24-nov). Fase II: Guardián Haiku 5.5 (desde el 25-nov).
 *   node scripts/haiku-resto/grafico-guardian.mjs <salida.svg>
 */
import "./env.mjs";
import { writeFileSync } from "node:fs";
const [salida] = process.argv.slice(2);
const { sql } = await import("../../dist/db/client.js");
const filas = await sql`
  select (created_at at time zone 'America/Guayaquil')::date::text dia, model, count(*)::int n, sum((verdict='corregir')::int)::int c
  from guardian_reviews where created_at >= '2026-11-09T05:00Z' and verdict in ('aprobar','corregir')
    and ((model='gpt-5.5' and created_at < '2026-11-25T01:41Z') or (model='claude-haiku-5-5' and created_at >= '2026-11-25T01:41Z'))
  group by 1,2 order by 1`;
await sql.end();
const f1 = filas.filter((f) => f.model === "gpt-5.5"), f2 = filas.filter((f) => f.model !== "gpt-5.5");
const pbar = f1.reduce((a, f) => a + f.c, 0) / f1.reduce((a, f) => a + f.n, 0);
const puntos = filas.map((f) => ({ ...f, p: f.c / f.n, lcs: pbar + 3 * Math.sqrt(pbar * (1 - pbar) / f.n), lci: Math.max(0, pbar - 3 * Math.sqrt(pbar * (1 - pbar) / f.n)) }));
const W = 760, H = 320, M = { l: 50, r: 20, t: 40, b: 60 };
const x = (i) => M.l + (i * (W - M.l - M.r)) / Math.max(1, puntos.length - 1);
const y = (p) => M.t + (1 - p / 0.7) * (H - M.t - M.b);
const linea = (k) => puntos.map((pt, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(pt[k]).toFixed(1)}`).join(" ");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui,sans-serif" font-size="11">
<rect width="${W}" height="${H}" fill="#fff"/>
<text x="${M.l}" y="18" font-size="14" font-weight="600">% de borradores que el Guardián corrige, por día (gráfico p)</text>
<text x="${M.l}" y="32" fill="#555">Fase I: gpt-5.5 (línea central ${(100 * pbar).toFixed(1)} %, límites ±3σ) · Fase II: Haiku 5.5 desde el 25-nov</text>
${[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((p) => `<line x1="${M.l}" x2="${W - M.r}" y1="${y(p)}" y2="${y(p)}" stroke="#eee"/><text x="${M.l - 6}" y="${y(p) + 4}" text-anchor="end" fill="#777">${p * 100}%</text>`).join("")}
<line x1="${M.l}" x2="${W - M.r}" y1="${y(pbar)}" y2="${y(pbar)}" stroke="#2a7" stroke-width="1.5"/>
<path d="${linea("lcs")}" fill="none" stroke="#c33" stroke-dasharray="4 3"/><path d="${linea("lci")}" fill="none" stroke="#c33" stroke-dasharray="4 3"/>
<line x1="${(x(f1.length - 1) + x(f1.length)) / 2}" x2="${(x(f1.length - 1) + x(f1.length)) / 2}" y1="${M.t}" y2="${H - M.b}" stroke="#999" stroke-dasharray="2 2"/>
<path d="${linea("p")}" fill="none" stroke="#335" stroke-width="1.5"/>
${puntos.map((pt, i) => { const fuera = pt.p > pt.lcs || pt.p < pt.lci; return `<circle cx="${x(i)}" cy="${y(pt.p)}" r="4" fill="${fuera ? "#c33" : pt.model === "gpt-5.5" ? "#335" : "#e80"}"/><text x="${x(i)}" y="${H - M.b + 14}" text-anchor="end" transform="rotate(-45 ${x(i)} ${H - M.b + 14})" fill="#555">${pt.dia.slice(5)} (${pt.n})</text>`; }).join("")}
</svg>`;
writeFileSync(salida, svg);
for (const pt of puntos) console.log(pt.dia, pt.model, pt.n, (100 * pt.p).toFixed(1), pt.p > pt.lcs ? "SEÑAL ↑" : pt.p < pt.lci ? "SEÑAL ↓" : "");
console.log("p̄ fase I", (100 * pbar).toFixed(1));
