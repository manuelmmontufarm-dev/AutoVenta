/**
 * Rearma, con la base de producción en SOLO LECTURA, el contexto que el Guardián
 * recibió en sus últimas corridas con Haiku, y mide (count_tokens, gratis) qué
 * parte se repite igual en todas: eso es lo que podría ir al caché.
 *   node scripts/haiku-resto/contextos-guardian.mjs [N]
 * Escribe scripts/haiku-resto/datos/contextos.json (no versionar: trae chats).
 */
import "./env.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
const N = Number(process.argv[2] ?? 60);
const { sql } = await import("../../dist/db/client.js");
const g = await import("../../dist/services/guardian.js");
const cat = await import("../../dist/services/catalog.js");
try { await cat.ensureCatalogReady(); console.log("catálogo listo"); } catch (e) { console.log("catálogo NO:", e.message); }
const filas = await sql`
  select r.conversation_id, r.route, r.created_at, r.input_tokens, r.cached_input_tokens, c.current_cycle, c.stage,
    (select gr.original_text from guardian_reviews gr where gr.conversation_id=r.conversation_id
       and gr.created_at between r.created_at - interval '5 seconds' and r.created_at + interval '20 seconds'
       order by gr.created_at limit 1) as borrador,
    (select gr.cycle from guardian_reviews gr where gr.conversation_id=r.conversation_id
       and gr.created_at between r.created_at - interval '5 seconds' and r.created_at + interval '20 seconds'
       order by gr.created_at limit 1) as ciclo
  from ai_runs r join conversations c on c.id=r.conversation_id
  where r.call_type='guardian' and r.model='claude-haiku-5-5' and r.created_at>='2026-11-25T01:41Z'
  order by random() limit ${N}`;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const contar = async (system, user) => (await anthropic.messages.countTokens({
  model: "claude-haiku-5-5", ...(system ? { system } : {}), messages: [{ role: "user", content: user }] })).input_tokens;
const base = await contar(null, "x");
const tokSys = (await contar(g.INSTRUCCIONES, "x")) - base;
const salida = [];
for (const f of filas) {
  if (!f.borrador) continue;
  const tipo = f.route.startsWith("guardian_seguimiento") ? "seguimiento" : undefined;
  let ctx;
  try { ctx = await g.armarContexto(Number(f.conversation_id), f.ciclo ?? f.current_cycle, f.borrador, [], tipo ? { tipo } : {}); }
  catch (e) { console.log("falló", f.conversation_id, e.message); continue; }
  salida.push({ conv: Number(f.conversation_id), ruta: f.route, prodEntrada: f.input_tokens, prodCache: f.cached_input_tokens, ctx, tok: (await contar(null, ctx)) - base });
}
// Líneas que se repiten iguales en ≥90 % de los contextos
const freq = new Map();
for (const s of salida) for (const l of new Set(s.ctx.split("\n"))) if (l.trim()) freq.set(l, (freq.get(l) ?? 0) + 1);
const fijas = [...freq].filter(([, n]) => n >= 0.9 * salida.length).map(([l]) => l);
const tokFijas = fijas.length ? (await contar(null, fijas.join("\n"))) - base : 0;
const fijasSeg = (() => { const s = salida.filter((x) => x.ruta.startsWith("guardian_seguimiento")); const fr = new Map();
  for (const x of s) for (const l of new Set(x.ctx.split("\n"))) if (l.trim()) fr.set(l, (fr.get(l) ?? 0) + 1);
  return [...fr].filter(([l, n]) => n >= 0.9 * s.length && !fijas.includes(l)).map(([l]) => l); })();
const tokFijasSeg = fijasSeg.length ? (await contar(null, fijasSeg.join("\n"))) - base : 0;
const media = (a) => a.reduce((x, y) => x + y, 0) / a.length;
mkdirSync(new URL("./datos/", import.meta.url), { recursive: true });
writeFileSync(new URL("./datos/contextos.json", import.meta.url), JSON.stringify({ tokSys, fijas, fijasSeg, salida }, null, 1));
console.log({ contextos: salida.length, tokRubrica: tokSys, tokContextoMedio: Math.round(media(salida.map((s) => s.tok))),
  prodEntradaMedia: Math.round(media(salida.map((s) => s.prodEntrada))), prodCacheMedio: Math.round(media(salida.map((s) => s.prodCache))),
  lineasFijas: fijas.length, tokFijas, lineasFijasSoloSeguimiento: fijasSeg.length, tokFijasSeg });
await sql.end();
