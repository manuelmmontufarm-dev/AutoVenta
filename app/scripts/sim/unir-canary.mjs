#!/usr/bin/env node
/**
 * Une las partes de un lote corrido en varios simuladores a la vez
 * (mediciones/canary-<etiqueta>-r<desde>-<hasta>.json) con el archivo
 * principal mediciones/canary-<etiqueta>.json. Las partes mandan sobre el
 * principal cuando repiten un caso. Las partes quedan en disco.
 *
 *   node scripts/sim/unir-canary.mjs control mini-guardian mini-vendedor
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const dir = resolve(import.meta.dirname, "mediciones");
for (const etiqueta of process.argv.slice(2)) {
  const principal = resolve(dir, `canary-${etiqueta}.json`);
  const base = JSON.parse(await readFile(principal, "utf8").catch(() => `{"etiqueta":"${etiqueta}","casos":[]}`));
  const porN = new Map(base.casos.map((c) => [c.n, c]));
  const partes = (await readdir(dir)).filter((f) => f.startsWith(`canary-${etiqueta}-r`) && f.endsWith(".json")).sort();
  for (const f of partes) {
    const p = JSON.parse(await readFile(resolve(dir, f), "utf8"));
    for (const c of p.casos ?? []) porN.set(c.n, c);
  }
  base.casos = [...porN.values()].sort((a, b) => a.n - b.n);
  base.generado = new Date().toISOString();
  await writeFile(principal, JSON.stringify(base, null, 1));
  console.log(`${etiqueta}: ${base.casos.length} casos (${partes.length} partes unidas) · n: ${base.casos.map((c) => c.n).join(",")}`);
}
