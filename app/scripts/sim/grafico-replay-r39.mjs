#!/usr/bin/env node
/**
 * GRÁFICO DE CONTROL DEL REPLAY R-39 (release multicliente).
 *
 * Fase I = `main` previo (dc50dab): sus corridas fijan la línea central y los
 * límites ±3σ (individuos: media ± 2,66 × rango móvil medio, como
 * grafico-canary.mjs). Fase II = la rama del release, juzgada contra esos
 * límites. Dentro de límites = ruido del propio bot; una señal (punto fuera o
 * 8 seguidos del mismo lado) se explica o se arregla antes de mergear.
 *
 *   node scripts/sim/grafico-replay-r39.mjs > salida.html
 *
 * Lee mediciones/replay-fase1-r{1..3}.json y replay-fase2-r{1..3}.json
 * (los escribe lote-canary.mjs con --salida).
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const dir = resolve(import.meta.dirname, "mediciones");
async function leerFase(fase) {
  const corridas = [];
  for (const r of [1, 2, 3]) {
    const casos = JSON.parse(await readFile(resolve(dir, `replay-${fase}-r${r}.json`), "utf8")).casos;
    for (const c of casos) corridas.push({ conv: c.conv ?? c.n, corrida: r, nota: c.juez?.nota ?? null, titulo: c.titulo ?? "" });
  }
  return corridas.filter((c) => c.nota != null);
}

const fase1 = await leerFase("fase1");
const fase2 = await leerFase("fase2");

const notas1 = fase1.map((c) => c.nota);
const media = notas1.reduce((a, b) => a + b, 0) / notas1.length;
const rangos = notas1.slice(1).map((n, i) => Math.abs(n - notas1[i]));
const mrMedio = rangos.reduce((a, b) => a + b, 0) / rangos.length;
const lci = Math.max(1, media - 2.66 * mrMedio);
const lcs = Math.min(10, media + 2.66 * mrMedio);

const fuera = fase2.filter((c) => c.nota < lci || c.nota > lcs);
let racha = 0, maxRacha = 0, lado = 0;
for (const c of fase2) {
  const l = Math.sign(c.nota - media);
  if (l !== 0 && l === lado) racha++; else { racha = 1; lado = l; }
  maxRacha = Math.max(maxRacha, racha);
}
const senal = fuera.length > 0 || maxRacha >= 8;

const W = 900, H = 360, PAD = 50;
const todos = [...fase1.map((c, i) => ({ ...c, fase: 1, i })), ...fase2.map((c, i) => ({ ...c, fase: 2, i: fase1.length + i }))];
const x = (i) => PAD + (i * (W - 2 * PAD)) / Math.max(1, todos.length - 1);
const y = (n) => H - PAD - ((n - 0) * (H - 2 * PAD)) / 10;
const puntos = todos.map((c) => {
  const color = c.fase === 1 ? "#8a8a8a" : (c.nota < lci || c.nota > lcs ? "#d92626" : "#1baf7a");
  return `<circle cx="${x(c.i).toFixed(1)}" cy="${y(c.nota).toFixed(1)}" r="4" fill="${color}"><title>conv ${c.conv} corrida ${c.corrida}: nota ${c.nota}</title></circle>`;
}).join("\n");
const xDiv = x(fase1.length - 0.5);

process.stdout.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Replay R-39</title>
<style>
:root { --bg:#ffffff; --texto:#1c1b19; --sub:#666; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#191918; --texto:#eee; --sub:#aaa; } }
:root[data-theme="dark"] { --bg:#191918; --texto:#eee; --sub:#aaa; }
body { background:var(--bg); color:var(--texto); font:15px/1.5 -apple-system, sans-serif; max-width:960px; margin:2rem auto; padding:0 16px; }
</style></head><body>
<h1>Replay de 10 chats reales × 3 corridas — R-39</h1>
<p><strong>Qué estás viendo.</strong> Cada punto es la nota del juez (1–10) de una corrida de un chat real
de Depot en el simulador. Los grises son la <strong>fase I</strong> (`main` en dc50dab, antes del release): fijan la
línea central (${media.toFixed(2)}) y los límites de control (${lci.toFixed(2)} – ${lcs.toFixed(2)}, media ± 2,66 × rango móvil medio).
Los de color son la <strong>fase II</strong> (el release multicliente). Dentro de límites es ruido del propio bot
—dos corridas del mismo modelo no dan la misma nota—, no «mejor» ni «peor». Una señal es un punto
fuera de límites o 8 seguidos del mismo lado de la línea central.</p>
<p><strong>Veredicto: ${senal ? `⚠️ HAY SEÑAL — ${fuera.length} punto(s) fuera de límites${maxRacha >= 8 ? ` y una racha de ${maxRacha}` : ""}. Se explica o se arregla antes de mergear.` : "sin señal — el release se comporta como el main de antes."}</strong></p>
<svg viewBox="0 0 ${W} ${H}" role="img" style="width:100%">
<line x1="${PAD}" y1="${y(media)}" x2="${W - PAD}" y2="${y(media)}" stroke="#2a78d6" stroke-width="1.5"/>
<line x1="${PAD}" y1="${y(lci)}" x2="${W - PAD}" y2="${y(lci)}" stroke="#d92626" stroke-dasharray="6 4"/>
<line x1="${PAD}" y1="${y(lcs)}" x2="${W - PAD}" y2="${y(lcs)}" stroke="#d92626" stroke-dasharray="6 4"/>
<line x1="${xDiv}" y1="${PAD / 2}" x2="${xDiv}" y2="${H - PAD}" stroke="var(--sub)" stroke-dasharray="2 4"/>
<text x="${PAD}" y="${y(media) - 6}" fill="#2a78d6" font-size="12">media fase I ${media.toFixed(2)}</text>
<text x="${PAD}" y="${y(lci) + 14}" fill="#d92626" font-size="12">LCI ${lci.toFixed(2)}</text>
<text x="${PAD}" y="${y(lcs) - 6}" fill="#d92626" font-size="12">LCS ${lcs.toFixed(2)}</text>
<text x="${xDiv - 60}" y="${PAD / 2 + 12}" fill="var(--sub)" font-size="12">fase I</text>
<text x="${xDiv + 12}" y="${PAD / 2 + 12}" fill="var(--sub)" font-size="12">fase II</text>
${puntos}
</svg>
<p style="color:var(--sub)">Fase I: ${fase1.length} corridas · Fase II: ${fase2.length} corridas · chats ${[...new Set(fase1.map((c) => c.conv))].join(", ")}</p>
</body></html>
`);
