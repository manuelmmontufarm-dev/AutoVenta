// Pone las notas de los jueces a ciegas (subagentes) en el campo `juez` de cada
// lote, para que `grafico-canary.mjs` y `comparar-canary.mjs` las lean como
// siempre. uso: node inyectar-notas.mjs <dir-jueces> [<dir-jueces> ...]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const med = resolve(import.meta.dirname, "../mediciones");
const porLote = {};
for (const dir of process.argv.slice(2)) {
  const clave = JSON.parse(readFileSync(resolve(dir, "clave-NO-LEER.json"), "utf8"));
  for (const f of readdirSync(resolve(dir, "notas")).filter((f) => f.endsWith(".json"))) {
    const j = JSON.parse(readFileSync(resolve(dir, "notas", f), "utf8"));
    for (const [n, porLetra] of Object.entries(j)) {
      for (const [letra, v] of Object.entries(porLetra)) {
        const lote = clave[n]?.[letra];
        if (lote) (porLote[lote] ??= {})[n] = { ...v, modelo: "subagente Claude Code (a ciegas)" };
      }
    }
  }
}
for (const [lote, notas] of Object.entries(porLote)) {
  const ruta = resolve(med, `canary-${lote}.json`);
  const d = JSON.parse(readFileSync(ruta, "utf8"));
  let k = 0;
  for (const c of d.casos) if (notas[c.n]) { c.juez = notas[c.n]; k += 1; }
  writeFileSync(ruta, JSON.stringify(d, null, 1));
  console.log(`${lote}: ${k} notas`);
}
