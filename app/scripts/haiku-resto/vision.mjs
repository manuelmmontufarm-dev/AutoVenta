/**
 * Visión: misma petición que `describirFotoDeLlanta` (mismo SYSTEM, misma forma),
 * pasada por `completarChat` para que Claude vaya por la traducción del bot.
 *   node scripts/haiku-resto/vision.mjs <carpeta-fotos> <modelo> [esfuerzo]
 */
import "./env.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const [dir, modelo, esfuerzo = "low"] = process.argv.slice(2);
const { completarChat } = await import("../../dist/agent/chat.js");
const OpenAI = (await import("openai")).default;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
process.env.AI_CLAUDE_RESPALDO_MODEL = "off";
const fuente = readFileSync(new URL("../../src/services/vision.ts", import.meta.url), "utf8");
const SYSTEM = eval(/const SYSTEM =\s*("(?:[^"\\]|\\.)*")/s.exec(fuente)[1]) + (process.env.SYSTEM_EXTRA ? " " + process.env.SYSTEM_EXTRA : "");
const ETIQUETA = process.env.SYSTEM_EXTRA ? "-prompt2" : "";
const man = JSON.parse(readFileSync(`${dir}/manifiesto.json`, "utf8"));
const precios = { "claude-haiku-5-5": [0.1, 0.5], "claude-sonnet-5-5": [2, 10], "gpt-5.5": [5, 30] };
const salida = []; let usd = 0;
async function una(f) {
  const bytes = readFileSync(`${dir}/${f.archivo}`);
  const contenido = [{ type: "image_url", image_url: { url: `data:${f.mime || "image/jpeg"};base64,${bytes.toString("base64")}`, detail: "auto" } },
    ...(f.caption ? [{ type: "text", text: `El cliente escribió junto a la foto: ${f.caption}` }] : [])];
  const t0 = Date.now();
  try {
    const r = await completarChat(openai, { model: modelo, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: contenido }],
      max_completion_tokens: 400, ...(modelo.startsWith("gpt-5") ? { reasoning_effort: "low", verbosity: "low" } : {}) }, { esfuerzo });
    const u = r.usage; const [pi, po] = precios[modelo];
    const costo = ((u.prompt_tokens) * pi + u.completion_tokens * po) / 1e6; usd += costo;
    salida.push({ id: f.id, texto: r.choices[0]?.message?.content?.trim() ?? "", entrada: u.prompt_tokens, salida: u.completion_tokens, costo, ms: Date.now() - t0 });
  } catch (e) { salida.push({ id: f.id, error: String(e.message ?? e), ms: Date.now() - t0 }); }
}
for (let i = 0; i < man.length; i += 4) await Promise.all(man.slice(i, i + 4).map(una));
writeFileSync(`${dir}/../vision-${modelo}-${esfuerzo}${ETIQUETA}.json`, JSON.stringify(salida, null, 1));
console.log(modelo, esfuerzo, "fotos", salida.length, "errores", salida.filter((s) => s.error).length, "USD", usd.toFixed(4));
