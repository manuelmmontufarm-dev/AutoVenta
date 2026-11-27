// ¿Cuánto ruido mete el juez? Las MISMAS transcripciones calificadas en dos
// rondas a ciegas (otro barajado, otro subagente). uso: node confiabilidad-juez.mjs <dir1> <dir2>
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const leer = (dir) => {
  const clave = JSON.parse(readFileSync(resolve(dir, "clave-NO-LEER.json"), "utf8"));
  const out = {};
  for (const f of readdirSync(resolve(dir, "notas"))) {
    const j = JSON.parse(readFileSync(resolve(dir, "notas", f), "utf8"));
    for (const [n, o] of Object.entries(j)) for (const [l, v] of Object.entries(o)) out[`${clave[n][l]}#${n}`] = v.nota;
  }
  return out;
};
const [x, y] = process.argv.slice(2).map(leer);
const comunes = Object.keys(x).filter((k) => k in y);
const d = comunes.map((k) => y[k] - x[k]);
const m = d.reduce((a, b) => a + b, 0) / d.length;
const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (d.length - 1));
const iguales = d.filter((v) => v === 0).length;
const a1 = d.filter((v) => Math.abs(v) <= 1).length;
console.log(JSON.stringify({ pares: comunes.length, sesgo_media: +m.toFixed(2), sd_dif: +sd.toFixed(2), sd_juez_por_nota: +(sd / Math.SQRT2).toFixed(2), iguales, a_1_punto: a1 }));
