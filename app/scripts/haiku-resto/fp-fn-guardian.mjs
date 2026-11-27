// Falsos positivos (corrige lo que estaba bien) y negativos (deja pasar lo que había que corregir) del Guardián,
// contra el veredicto de jueces a ciegas (subagentes de Claude Code). Media ± σ entre repeticiones.
import { readFileSync } from "node:fs";
const [archCasos, archJuezA, archJuezB, ...corridas] = process.argv.slice(2);
const casos = JSON.parse(readFileSync(archCasos, "utf8"));
const oro = { ...JSON.parse(readFileSync(archJuezA, "utf8")), ...JSON.parse(readFileSync(archJuezB, "utf8")) };
const pos = casos.filter((c) => oro[c.id].necesita_correccion).map((c) => c.id);
const neg = casos.filter((c) => !oro[c.id].necesita_correccion).map((c) => c.id);
const graves = casos.filter((c) => oro[c.id].grave).map((c) => c.id);
console.log(`oro: ${pos.length} necesitan corrección (${graves.length} graves), ${neg.length} estaban bien`);
const tasas = (veredicto) => ({
  fp: neg.filter((id) => veredicto(id) === "corregir").length / neg.length,
  fn: pos.filter((id) => veredicto(id) !== "corregir").length / pos.length,
  fnGrave: graves.filter((id) => veredicto(id) !== "corregir").length / graves.length,
});
const fmt = (xs, k) => { const m = xs.reduce((a, x) => a + x[k], 0) / xs.length; const s = Math.sqrt(xs.reduce((a, x) => a + (x[k] - m) ** 2, 0) / Math.max(1, xs.length - 1)); return `${(100 * m).toFixed(0)}%${xs.length > 1 ? ` ±${(100 * s).toFixed(0)}` : ""}`; };
const prod = tasas((id) => casos.find((c) => c.id === id).prod.veredicto);
console.log(`producción (Haiku low, 1 corrida): FP ${fmt([prod], "fp")} · FN ${fmt([prod], "fn")} · FN graves ${fmt([prod], "fnGrave")}`);
for (const a of corridas) {
  const d = JSON.parse(readFileSync(a, "utf8")).filter((x) => !x.error);
  const reps = [...new Set(d.map((x) => x.rep))].map((r) => tasas((id) => d.find((x) => x.id === id && x.rep === r)?.veredicto));
  const tibias = d.slice(1); const costo = tibias.reduce((s, x) => s + x.costo, 0) / tibias.length;
  console.log(`${a.split("/").pop().padEnd(16)} reps ${reps.length}: FP ${fmt(reps, "fp")} · FN ${fmt(reps, "fn")} · FN graves ${fmt(reps, "fnGrave")} · $/llamada ${costo.toFixed(5)} · salida ${Math.round(d.reduce((s, x) => s + x.uso.salida, 0) / d.length)} tk`);
}
