// Gasto en Anthropic (y OpenAI) de todos los lotes del barrido, leído de
// mediciones/canary-bm-*.json (costo.porModelo de cada conversación).
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(import.meta.dirname, "../mediciones");
let claude = 0;
let openai = 0;
const por = {};
for (const f of readdirSync(dir).filter((f) => /^canary-bm-.*\.json$/.test(f))) {
  const d = JSON.parse(readFileSync(resolve(dir, f), "utf8"));
  for (const c of d.casos ?? []) {
    for (const [k, v] of Object.entries(c.costo?.porModelo ?? {})) {
      // El rescate/cierre de cadena (`tool_chain_finalized`, `rescue`) lo escribe
      // OPENAI_ESCALATION_MODEL, pero la fila SUMA las rondas previas de Claude y
      // las cobra a tarifa del último modelo. Para el tope se cuenta entera como
      // Anthropic (cota superior: gpt-5.5 es más caro que Sonnet).
      const mixta = /tool_chain_finalized|rescue/.test(v.ruta ?? "");
      if (k.startsWith("claude-") || mixta) {
        claude += v.usd;
        por[f] = (por[f] ?? 0) + v.usd;
      } else openai += v.usd;
    }
  }
}
if (process.argv.includes("--total")) console.log(claude.toFixed(4));
else {
  console.log(JSON.stringify({
    anthropic: +claude.toFixed(3),
    openai: +openai.toFixed(3),
    porLote: Object.fromEntries(Object.entries(por).map(([k, v]) => [k, +v.toFixed(3)])),
  }, null, 1));
}
