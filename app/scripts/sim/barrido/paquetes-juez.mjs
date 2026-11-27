// Arma los paquetes A CIEGAS para los jueces (subagentes de Claude Code).
// Por cada caso, todas las variantes que lo corrieron, barajadas con letras
// que cambian de caso a caso. La clave (letra → lote) va a un archivo aparte
// que el juez no lee.
//
// uso: node paquetes-juez.mjs <dir-salida> bm-a bm-c bm-d ... [--casos 1-10] [--semilla N]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// `--casos 1-10,21-40` limita los casos; `--semilla N` cambia el barajado.
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const filtro = opt("casos");
const semillaArg = opt("semilla");
const [dirSalida, ...lotes] = argv;
const enFiltro = (n) => !filtro || filtro.split(",").some((t) => { const [a, b = a] = t.split("-").map(Number); return n >= a && n <= b; });
const med = resolve(import.meta.dirname, "../mediciones");
const casos = JSON.parse(readFileSync(resolve(import.meta.dirname, "../datos/dificiles-50.json"), "utf8"));
const datos = Object.fromEntries(lotes.map((l) => [l, JSON.parse(readFileSync(resolve(med, `canary-${l}.json`), "utf8")).casos]));
const textoDe = (t) => (t?.bot ?? []).map((b) => b.texto ?? "").filter(Boolean).join("\n");

// Pseudoaleatorio con semilla: el reparto se puede reconstruir.
let semilla = Number(semillaArg ?? 20261127);
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

mkdirSync(resolve(dirSalida, "paquetes"), { recursive: true });
const clave = {};
const ns = [...new Set(Object.values(datos).flatMap((cs) => cs.map((c) => c.n)))].filter(enFiltro).sort((a, b) => a - b);
for (const n of ns) {
  const variantes = lotes.map((l) => ({ l, c: datos[l].find((c) => c.n === n && c.turnos) })).filter((v) => v.c);
  for (let i = variantes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(azar() * (i + 1));
    [variantes[i], variantes[j]] = [variantes[j], variantes[i]];
  }
  const letras = "PQRSTUVW";
  clave[n] = {};
  let md = `# Caso ${n}\n\nLo que hizo difícil este caso en la vida real (el asistente no lo sabe): ${casos[n - 1].titulo}\n\n`;
  variantes.forEach((v, i) => {
    const letra = letras[i];
    clave[n][letra] = v.l;
    md += `\n---\n\n## Conversación ${letra}\n\n`;
    v.c.turnos.forEach((t, k) => {
      md += `**TURNO ${k + 1}**\n\nCLIENTE: ${t.cliente}\n\nASISTENTE: ${textoDe(t) || "(no respondió)"}\n\n`;
    });
  });
  writeFileSync(resolve(dirSalida, "paquetes", `caso-${String(n).padStart(2, "0")}.md`), md);
}
writeFileSync(resolve(dirSalida, "clave-NO-LEER.json"), JSON.stringify(clave, null, 1));
console.log(`${ns.length} paquetes en ${dirSalida}/paquetes`);
