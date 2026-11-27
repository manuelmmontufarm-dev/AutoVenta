/**
 * Clasificador de etapa: rearma 50 entradas reales (producción, SOLO LECTURA) y
 * corre el MISMO prompt de `agent/classifier.ts` con gpt-5.4-mini y Haiku 5.5.
 *   node scripts/haiku-resto/clasificador.mjs <dir-salida> [N=50]
 */
import "./env.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const [dir, N = "50"] = process.argv.slice(2);
process.env.AI_CLAUDE_RESPALDO_MODEL = "off";
const { sql } = await import("../../dist/db/client.js");
const { completarChat } = await import("../../dist/agent/chat.js");
const OpenAI = (await import("openai")).default;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const fuente = readFileSync(new URL("../../src/agent/classifier.ts", import.meta.url), "utf8");
const plantilla = /content: `(Clasifica la SECCIÓN[\s\S]*?)`,\n/.exec(fuente)[1];
const armar = (etapa, cliente, bot) => plantilla.replace("${conversation.stage}", etapa).replace("${userText}", cliente).replace("${assistantText}", bot);
// Estratificado por etapa, como llega a producción.
const filas = await sql`
  select r.id, r.conversation_id, r.stage, r.created_at from ai_runs r
  where r.call_type='classifier' and r.created_at>='2026-11-25T01:41Z' order by random() limit ${Number(N) * 2}`;
const casos = [];
for (const f of filas) {
  if (casos.length >= Number(N)) break;
  const msgs = await sql`select direction, author_kind, content, created_at from messages where conversation_id=${f.conversation_id}
    and created_at <= ${f.created_at} order by created_at desc limit 12`;
  const bot = []; let i = 0;
  while (i < msgs.length && msgs[i].direction !== "inbound") { if (msgs[i].author_kind === "bot") bot.unshift(msgs[i].content); i++; }
  const cliente = []; while (i < msgs.length && msgs[i].direction === "inbound") { cliente.unshift(msgs[i].content); i++; }
  if (!cliente.length || !bot.length) continue;
  casos.push({ id: Number(f.id), conv: Number(f.conversation_id), etapa: f.stage, cliente: cliente.join("\n"), bot: bot.join("\n") });
}
const precios = { "gpt-5.4-mini": [0.75, 0.075, 4.5], "claude-haiku-5-5": [0.1, 0.01, 0.5] };
let usd = { "gpt-5.4-mini": 0, "claude-haiku-5-5": 0 };
async function clasificar(modelo, c) {
  const t0 = Date.now();
  const r = await completarChat(openai, { model: modelo, max_completion_tokens: 128, response_format: { type: "json_object" },
    messages: [{ role: "user", content: armar(c.etapa, c.cliente, c.bot) }] }, { esfuerzo: "low" });
  const u = r.usage; const [pi, pc, po] = precios[modelo]; const cach = u.prompt_tokens_details?.cached_tokens ?? 0;
  const costo = ((u.prompt_tokens - cach) * pi + cach * pc + u.completion_tokens * po) / 1e6; usd[modelo] += costo;
  let etapa = null; try { etapa = JSON.parse(r.choices[0].message.content).stage; } catch { etapa = "json_roto"; }
  return { etapa, entrada: u.prompt_tokens, salida: u.completion_tokens, costo, ms: Date.now() - t0 };
}
for (let i = 0; i < casos.length; i += 5) await Promise.all(casos.slice(i, i + 5).map(async (c) => {
  for (const m of ["gpt-5.4-mini", "claude-haiku-5-5"]) { try { c[m] = await clasificar(m, c); } catch (e) { c[m] = { error: String(e.message ?? e) }; } }
}));
writeFileSync(`${dir}/clasificador.json`, JSON.stringify(casos, null, 1));
const acuerdo = casos.filter((c) => c["gpt-5.4-mini"].etapa === c["claude-haiku-5-5"].etapa).length;
console.log("casos", casos.length, "acuerdo", acuerdo, "USD", JSON.stringify(usd));
await sql.end();
