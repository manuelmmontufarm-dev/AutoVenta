// Resume las corridas del Guardián: tasa de corrección, acuerdo entre repeticiones y con producción, costo.
import { readFileSync } from "node:fs";
const [archCasos, ...corridas] = process.argv.slice(2);
const casos = new Map(JSON.parse(readFileSync(archCasos, "utf8")).map((c) => [c.id, c]));
for (const a of corridas) {
  const d = JSON.parse(readFileSync(a, "utf8")).filter((x) => !x.error);
  const porCaso = new Map(); for (const x of d) (porCaso.get(x.id) ?? porCaso.set(x.id, []).get(x.id)).push(x);
  let estables = 0, conProd = 0, n = 0;
  for (const [id, xs] of porCaso) { n++; const v = xs.map((x) => x.veredicto); if (new Set(v).size === 1) estables++;
    const may = v.filter((y) => y === "corregir").length * 2 > v.length ? "corregir" : "aprobar"; if (may === casos.get(id).prod.veredicto) conProd++; }
  const tibias = d.slice(1); const costo = tibias.reduce((s, x) => s + x.costo, 0) / tibias.length;
  const altas = d.filter((x) => x.veredicto === "corregir" && x.hallazgos.some((h) => h.severidad === "alta")).length;
  console.log(`${a.split("/").pop()}: n=${d.length} corrige=${(100 * d.filter((x) => x.veredicto === "corregir").length / d.length).toFixed(0)}% (alta ${(100 * altas / d.length).toFixed(0)}%) | mismo veredicto en todas las reps ${estables}/${n} | mayoría = prod ${conProd}/${n} | $/llamada ${costo.toFixed(5)} | salida media ${Math.round(d.reduce((s, x) => s + x.uso.salida, 0) / d.length)} | ms mediana ${d.map((x) => x.ms).sort((p, q) => p - q)[d.length >> 1]}`);
}
