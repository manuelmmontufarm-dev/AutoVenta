#!/usr/bin/env node
/**
 * Cruza dos corridas de lote-canary.mjs (misma lista de casos, dos
 * configuraciones del simulador) y da el veredicto A contra B por caso y en
 * total: nota del juez, costo, invariantes rotos, banderas, reescrituras del
 * Guardián, cotizaciones y visitas.
 *
 *   node scripts/sim/comparar-canary.mjs mediciones/canary-mini-ambos.json mediciones/canary-control.json
 */
import { readFile } from "node:fs/promises";

const [a, b] = await Promise.all(process.argv.slice(2, 4).map(async (p) => JSON.parse(await readFile(p, "utf8"))));
const porN = (x) => new Map(x.casos.map((c) => [c.n, c]));
const A = porN(a), B = porN(b);
const comunes = [...A.keys()].filter((n) => B.has(n)).sort((x, y) => x - y);

const fmt = (v, d = 2) => (v == null ? "—" : Number(v).toFixed(d));
const suma = (xs, f) => xs.reduce((acc, x) => acc + (f(x) ?? 0), 0);

console.log(`A = «${a.etiqueta}» · B = «${b.etiqueta}» · ${comunes.length} casos en común\n`);
console.log("  n  familia            notaA notaB  $A     $B     invA invB  🚩A 🚩B  guardA guardB  cotA cotB  visA visB");
let mejor = 0, peor = 0, igual = 0;
const peores = [];
for (const n of comunes) {
  const x = A.get(n), y = B.get(n);
  const na = x.juez?.nota, nb = y.juez?.nota;
  if (na != null && nb != null) { if (na > nb + 1) mejor += 1; else if (na < nb - 1) peor += 1; else igual += 1; }
  if (na != null && nb != null && na < nb - 1) peores.push({ n, x, y });
  console.log(
    `${String(n).padStart(3)}  ${(x.familia ?? "").padEnd(18)} ${String(na ?? "—").padStart(4)}  ${String(nb ?? "—").padStart(4)}  ` +
    `${fmt(x.costo?.usd, 3).padStart(5)}  ${fmt(y.costo?.usd, 3).padStart(5)}  ` +
    `${String(x.invariantes?.length ?? 0).padStart(4)} ${String(y.invariantes?.length ?? 0).padStart(4)}  ` +
    `${String(x.banderas?.length ?? 0).padStart(3)} ${String(y.banderas?.length ?? 0).padStart(3)}  ` +
    `${String(x.reescrituras_guardian ?? 0).padStart(6)} ${String(y.reescrituras_guardian ?? 0).padStart(6)}  ` +
    `${String(x.cotizaciones ?? 0).padStart(4)} ${String(y.cotizaciones ?? 0).padStart(4)}  ` +
    `${x.visita ? "sí" : "no"}   ${y.visita ? "sí" : "no"}`,
  );
}
const casosA = comunes.map((n) => A.get(n)), casosB = comunes.map((n) => B.get(n));
const media = (xs) => { const c = xs.filter((x) => x.juez?.nota); return c.length ? suma(c, (x) => x.juez.nota) / c.length : null; };
// El otro juez (lotes desde el 22-nov-2026): si los dos coinciden en quién gana, no es gusto de la casa.
const mediaClaude = (xs) => { const c = xs.filter((x) => x.juez_claude?.nota); return c.length ? suma(c, (x) => x.juez_claude.nota) / c.length : null; };
const hayJuezClaude = [...casosA, ...casosB].some((x) => x.juez_claude?.nota);
console.log(`
RESUMEN
  nota media        A ${fmt(media(casosA))}   B ${fmt(media(casosB))}${hayJuezClaude ? `
  nota juez Claude  A ${fmt(mediaClaude(casosA))}   B ${fmt(mediaClaude(casosB))}` : ""}
  A peor que B (>1 punto): ${peor} · igual: ${igual} · A mejor: ${mejor}
  nota ≤4           A ${casosA.filter((x) => (x.juez?.nota ?? 10) <= 4).length}   B ${casosB.filter((x) => (x.juez?.nota ?? 10) <= 4).length}
  invariantes rotos A ${casosA.filter((x) => x.invariantes?.length).length}   B ${casosB.filter((x) => x.invariantes?.length).length}
  banderas          A ${suma(casosA, (x) => x.banderas?.length)}   B ${suma(casosB, (x) => x.banderas?.length)}
  reescrituras guardián A ${suma(casosA, (x) => x.reescrituras_guardian)}   B ${suma(casosB, (x) => x.reescrituras_guardian)}
  cotizaciones      A ${suma(casosA, (x) => x.cotizaciones)}   B ${suma(casosB, (x) => x.cotizaciones)}
  visitas acordadas A ${casosA.filter((x) => x.visita).length}   B ${casosB.filter((x) => x.visita).length}
  costo total       A $${fmt(suma(casosA, (x) => x.costo?.usd))}   B $${fmt(suma(casosB, (x) => x.costo?.usd))}  (A/B = ${fmt(suma(casosA, (x) => x.costo?.usd) / Math.max(1e-9, suma(casosB, (x) => x.costo?.usd)))})
  segundos por caso A ${fmt(suma(casosA, (x) => x.segundos) / Math.max(1, casosA.length), 0)}   B ${fmt(suma(casosB, (x) => x.segundos) / Math.max(1, casosB.length), 0)}
`);
// DE DÓNDE SALE EL COSTO: tokens y latencia por modelo y pieza (lotes desde el 22-nov-2026).
const piezas = (xs) => {
  const m = new Map();
  for (const x of xs) for (const [k, p] of Object.entries(x.costo?.porModelo ?? {})) {
    if (p.entrada == null) continue;
    const t = m.get(k) ?? { runs: 0, usd: 0, entrada: 0, en_cache: 0, escritos: 0, salida: 0, razonamiento: 0, msPorRun: 0 };
    t.msPorRun = (t.msPorRun * t.runs + p.ms * p.runs) / (t.runs + p.runs);
    for (const c of ["runs", "usd", "entrada", "en_cache", "escritos", "salida", "razonamiento"]) t[c] += p[c] ?? 0;
    m.set(k, t);
  }
  return [...m.entries()].sort((p, q) => q[1].usd - p[1].usd);
};
for (const [nombre, xs] of [["A", casosA], ["B", casosB]]) {
  const filas = piezas(xs);
  if (!filas.length) continue;
  console.log(`DETALLE ${nombre}  (modelo·pieza: corridas · $ · entrada · % leído de caché · % escrito a caché · salida · de eso razonamiento · seg/llamada)`);
  for (const [k, t] of filas) {
    console.log(`  ${k.padEnd(30)} ${String(t.runs).padStart(4)} · $${fmt(t.usd, 3)} · ${Math.round(t.entrada / 1000)}k · ${Math.round(100 * t.en_cache / Math.max(1, t.entrada))}% · ${Math.round(100 * t.escritos / Math.max(1, t.entrada))}% · ${Math.round(t.salida / 1000)}k · ${Math.round(t.razonamiento / 1000)}k · ${fmt(t.msPorRun / 1000, 1)}`);
  }
}
const fallas = (xs) => { const m = new Map(); for (const x of xs) for (const f of x.juez?.fallas ?? []) m.set(f, (m.get(f) ?? 0) + 1); return [...m.entries()].sort((p, q) => q[1] - p[1]); };
console.log("FALLAS DEL JUEZ   A:", fallas(casosA).map(([f, n]) => `${f}×${n}`).join(", ") || "ninguna");
console.log("                  B:", fallas(casosB).map(([f, n]) => `${f}×${n}`).join(", ") || "ninguna");
if (peores.length) {
  console.log("\nDONDE A PIERDE");
  for (const { n, x, y } of peores) {
    console.log(`  ${n}. ${x.titulo}\n     A (${x.juez.nota}): ${x.juez.comentario}\n     B (${y.juez.nota}): ${y.juez.comentario}`);
  }
}
