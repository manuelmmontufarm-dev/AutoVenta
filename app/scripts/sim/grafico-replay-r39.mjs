#!/usr/bin/env node
/**
 * GRÁFICO DE CONTROL DEL REPLAY R-39 (release multicliente).
 *
 * Fase I = el `main` previo (dc50dab): sus corridas fijan la línea central y
 * los límites de control de individuos (media ± 2,66 × rango móvil medio, el
 * mismo criterio que grafico-canary.mjs). Fase II = la rama del release,
 * juzgada contra esos límites. Dentro de límites es ruido del propio bot —dos
 * corridas del mismo modelo no dan la misma nota—, no «mejor» ni «peor». Una
 * señal es un punto fuera de límites u 8 seguidos del mismo lado.
 *
 *   node scripts/sim/grafico-replay-r39.mjs > ../docs/reportes-historicos/<fecha>-replay-r39.html
 *
 * Lee mediciones/replay-fase1-r{1,2,3}.json y replay-fase2-r{1,2,3}.json, que
 * escribe lote-canary.mjs con --salida. Las corridas sin nota (el juez falló)
 * se descartan: no se inventa un punto que no se midió.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(import.meta.dirname, "mediciones");

async function leerFase(fase) {
  const corridas = [];
  for (const r of [1, 2, 3]) {
    const ruta = resolve(dir, "replay-" + fase + "-r" + r + ".json");
    if (!existsSync(ruta)) continue;
    const { casos } = JSON.parse(await readFile(ruta, "utf8"));
    for (const c of casos) {
      if (c.juez && c.juez.nota) corridas.push({ conv: c.conv ?? c.n, corrida: r, nota: c.juez.nota });
    }
  }
  return corridas;
}

const fase1 = await leerFase("fase1");
const fase2 = await leerFase("fase2");
if (!fase1.length || !fase2.length) {
  console.error("Faltan mediciones: fase I tiene " + fase1.length + " y fase II " + fase2.length);
  process.exit(1);
}

/**
 * La serie es la DIFERENCIA por conversación, no la nota suelta: mismo criterio
 * que grafico-canary.mjs. Una nota de 8 en un chat fácil y de 4 en uno difícil
 * no se pueden poner en la misma serie — su rango móvil mediría la diferencia
 * entre chats, no el ruido del bot, y los límites saturarían en 1 y 10.
 */
const promedio = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const porConv = (corridas) => {
  const m = new Map();
  for (const c of corridas) m.set(c.conv, [...(m.get(c.conv) ?? []), c.nota]);
  return m;
};
const n1 = porConv(fase1), n2 = porConv(fase2);
const serie = [...n1.keys()]
  .filter((conv) => n2.has(conv))
  .map((conv) => ({
    conv,
    fase1: promedio(n1.get(conv)),
    fase2: promedio(n2.get(conv)),
    corridas1: n1.get(conv).length,
    corridas2: n2.get(conv).length,
  }))
  .map((d) => ({ ...d, dif: d.fase2 - d.fase1 }));

const difs = serie.map((d) => d.dif);
const media = promedio(difs);
const rangos = difs.slice(1).map((n, i) => Math.abs(n - difs[i]));
const mrMedio = rangos.length ? promedio(rangos) : 0;
const lci = media - 2.66 * mrMedio;
const lcs = media + 2.66 * mrMedio;
const media1 = promedio(fase1.map((c) => c.nota));
const media2 = promedio(fase2.map((c) => c.nota));

const fuera = serie.filter((d) => d.dif < lci || d.dif > lcs);
let racha = 0, maxRacha = 0, lado = 0;
for (const d of serie) {
  const l = Math.sign(d.dif - media);
  if (l !== 0 && l === lado) racha += 1; else { racha = 1; lado = l; }
  if (racha > maxRacha) maxRacha = racha;
}
const senal = fuera.length > 0 || maxRacha >= 8;
const veredicto = senal
  ? "hay señal — " + fuera.length + " punto(s) fuera de límites"
    + (maxRacha >= 8 ? " y una racha de " + maxRacha : "")
    + ". Se explica o se arregla antes de mergear."
  : "sin señal — el release se comporta como el main de antes.";

const W = 900, H = 360, PAD = 50;
const tope = Math.max(2.5, ...serie.map((d) => Math.abs(d.dif)), Math.abs(lci), Math.abs(lcs)) * 1.15;
const x = (i) => PAD + (i * (W - 2 * PAD)) / Math.max(1, serie.length - 1);
const y = (v) => (H - PAD + PAD / 2) / 2 - (v * (H - 2 * PAD)) / (2 * tope);

const linea = (altura, color, extra) =>
  '<line x1="' + PAD + '" y1="' + altura + '" x2="' + (W - PAD) + '" y2="' + altura
  + '" stroke="' + color + '" ' + extra + "/>";
const texto = (px, py, color, t) =>
  '<text x="' + px + '" y="' + py + '" fill="' + color + '" font-size="12">' + t + "</text>";

const puntos = serie.map((d, i) => {
  const malo = d.dif < lci || d.dif > lcs;
  const circulo = '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(d.dif).toFixed(1) + '" r="4" fill="'
    + (malo ? "#d92626" : "#1baf7a") + '"><title>conv ' + d.conv + ": fase I " + d.fase1.toFixed(2)
    + " (" + d.corridas1 + " corridas) vs fase II " + d.fase2.toFixed(2) + " (" + d.corridas2
    + " corridas) = " + (d.dif >= 0 ? "+" : "") + d.dif.toFixed(2) + "</title></circle>";
  const etiqueta = texto((x(i) - 16).toFixed(1), (H - PAD + 16).toFixed(1), "var(--sub)", d.conv);
  return circulo + "\n" + etiqueta;
}).join("\n");
const trazo = '<polyline fill="none" stroke="#1baf7a" stroke-width="1" opacity="0.5" points="'
  + serie.map((d, i) => x(i).toFixed(1) + "," + y(d.dif).toFixed(1)).join(" ") + '"/>';


const partes = [
  '<!doctype html><html lang="es"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  "<title>Replay R-39</title>",
  "<style>",
  ":root { --bg:#fff; --texto:#1c1b19; --sub:#666; }",
  '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#191918; --texto:#eee; --sub:#aaa; } }',
  ':root[data-theme="dark"] { --bg:#191918; --texto:#eee; --sub:#aaa; }',
  "body { background:var(--bg); color:var(--texto); font:15px/1.6 -apple-system, system-ui, sans-serif;",
  "  max-width:960px; margin:2rem auto; padding:0 16px; }",
  "table { border-collapse:collapse; width:100%; margin-top:1.5rem; font-size:14px; }",
  "th, td { text-align:right; padding:6px 10px; border-bottom:1px solid var(--sub); }",
  "th:first-child, td:first-child { text-align:left; }",
  "</style></head><body>",
  "<h1>Depot no cambió: 10 chats reales, 3 corridas en cada versión</h1>",
  "<p><strong>Qué estás viendo.</strong> Se tomaron los 10 chats más recientes de Depot en producción y se",
  " repitieron 3 veces contra el <em>main</em> de antes del release (fase I) y 3 veces contra el release",
  " (fase II), con un juez que le pone nota de 1 a 10 a cada corrida. Cada punto es <strong>un chat</strong>:",
  " cuánto subió o bajó su nota promedio del release respecto del main. Cero es «igual que antes».",
  " Las rayas rojas son los límites de control (la media de las diferencias ± 2,66 × el rango móvil medio):",
  " un punto dentro es ruido del propio bot, porque dos corridas del mismo modelo nunca dan la misma nota.",
  " Una señal —lo que habría que explicar o arreglar— es un punto fuera de las rayas u 8 seguidos del mismo",
  " lado de la línea central.</p>",
  "<p><strong>Veredicto: " + veredicto + "</strong> La nota media de todas las corridas fue "
    + media1.toFixed(2) + " en el main y " + media2.toFixed(2) + " en el release; la diferencia media por",
  " chat es " + (media >= 0 ? "+" : "") + media.toFixed(2) + " puntos.</p>",
  '<svg viewBox="0 0 ' + W + " " + H + '" role="img" style="width:100%">',
  linea(y(0).toFixed(1), "var(--sub)", 'stroke-dasharray="2 4"'),
  linea(y(media).toFixed(1), "#2a78d6", 'stroke-width="1.5"'),
  linea(y(lci).toFixed(1), "#d92626", 'stroke-dasharray="6 4"'),
  linea(y(lcs).toFixed(1), "#d92626", 'stroke-dasharray="6 4"'),
  texto(W - PAD - 150, (y(media) - 6).toFixed(1), "#2a78d6", "línea central " + media.toFixed(2)),
  texto(W - PAD - 150, (y(lci) + 14).toFixed(1), "#d92626", "límite inferior " + lci.toFixed(2)),
  texto(W - PAD - 150, (y(lcs) - 6).toFixed(1), "#d92626", "límite superior " + lcs.toFixed(2)),
  texto(PAD, (y(0) - 6).toFixed(1), "var(--sub)", "0 = igual que el main"),
  trazo,
  puntos,
  "</svg>",
  "<table><thead><tr><th>Chat</th><th>Main (fase I)</th><th>Release (fase II)</th><th>Diferencia</th></tr></thead><tbody>",
  ...serie.map((d) => "<tr><td>conv " + d.conv + "</td><td>" + d.fase1.toFixed(2) + " (" + d.corridas1
    + ")</td><td>" + d.fase2.toFixed(2) + " (" + d.corridas2 + ")</td><td>" + (d.dif >= 0 ? "+" : "")
    + d.dif.toFixed(2) + "</td></tr>"),
  "</tbody></table>",
  '<p style="color:var(--sub)">Entre paréntesis, cuántas de las 3 corridas recibieron nota del juez (las que',
  " el juez no pudo puntuar se descartan en vez de inventarles un valor). Fase I: " + fase1.length,
  " corridas con nota · fase II: " + fase2.length + " corridas con nota.</p>",
  "</body></html>",
];
process.stdout.write(partes.join("\n") + "\n");
