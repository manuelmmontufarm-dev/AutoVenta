/**
 * Corre el Guardián (rúbrica y esquema reales de dist/) sobre casos armados por
 * casos-guardian.mjs, en varias variantes, y guarda veredicto + uso + costo.
 *   node scripts/haiku-resto/correr-guardian.mjs <casos.json> <variante> <reps> <salida.json>
 * Variantes: low (producción), medium, sinrazonar (thinking disabled), fijo (hechos fijos al caché),
 *            fijo-sinrazonar
 */
import "./env.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
const [archCasos, variante, reps = "1", archSalida] = process.argv.slice(2);
const g = await import("../../dist/services/guardian.js");
const { aPeticionClaude } = await import("../../dist/agent/chatClaude.js");
const datos = JSON.parse(readFileSync(new URL("./datos/contextos.json", import.meta.url), "utf8"));
const VARIABLES = new Set(["== HECHOS REGISTRADOS ==", "Visita registrada: (ninguna)", "Compromiso de visita en palabras del cliente: (ninguno)", "== CONVERSACIÓN (vieja → nueva) ==", "== SEGUIMIENTO QUE EL BOT QUIERE ENVIAR =="]);
const FIJAS = new Set([...datos.fijas, ...datos.fijasSeg].filter((l) => !VARIABLES.has(l) && !l.startsWith("== CATÁLOGO DE HOY")));
const casos = JSON.parse(readFileSync(archCasos, "utf8"));
const cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 3, timeout: 60000 });
const esfuerzo = variante === "medium" ? "medium" : "low";
const sinRazonar = variante.includes("sinrazonar");
const fijo = variante.startsWith("fijo");
function mensajes(ctx) {
  if (!fijo) return [{ role: "system", content: g.INSTRUCCIONES }, { role: "user", content: ctx }];
  const lineas = ctx.split("\n");
  const fijas = lineas.filter((l) => FIJAS.has(l));
  const resto = lineas.filter((l) => !FIJAS.has(l));
  return [{ role: "system", content: g.INSTRUCCIONES },
    { role: "system", content: "== HECHOS FIJOS DEL NEGOCIO (valen para todas las conversaciones; son parte de los HECHOS) ==\n" + fijas.join("\n") },
    { role: "user", content: resto.join("\n") }];
}
const salida = []; let usd = 0;
async function una(caso, rep) {
  const { cuerpo } = aPeticionClaude({ model: "claude-haiku-5-5", messages: mensajes(caso.contexto), response_format: g.ESQUEMA_SALIDA, max_completion_tokens: 2000, stream: false }, { esfuerzo });
  if (sinRazonar) cuerpo.thinking = { type: "disabled" };
  const t0 = Date.now();
  try {
    const r = await cliente.beta.messages.create(cuerpo);
    const u = r.usage;
    const costo = (u.input_tokens * 0.1 + (u.cache_read_input_tokens ?? 0) * 0.01 + (u.cache_creation_input_tokens ?? 0) * 0.125 + u.output_tokens * 0.5) / 1e6;
    usd += costo;
    const texto = r.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    let rev; try { rev = g.aplicarVeredicto(caso.borrador, JSON.parse(texto)); } catch { rev = { veredicto: "json_roto", hallazgos: [] }; }
    salida.push({ id: caso.id, rep, veredicto: rev.veredicto, hallazgos: rev.hallazgos, corregido: rev.veredicto === "corregir" ? rev.texto : null,
      uso: { entrada: u.input_tokens, leido: u.cache_read_input_tokens ?? 0, escrito: u.cache_creation_input_tokens ?? 0, salida: u.output_tokens }, costo, ms: Date.now() - t0 });
  } catch (e) { salida.push({ id: caso.id, rep, error: String(e.message ?? e) }); }
}
// Calienta el caché con una sola llamada antes de abrir en paralelo.
const trabajos = []; for (let rep = 0; rep < Number(reps); rep++) for (const c of casos) trabajos.push([c, rep]);
await una(...trabajos.shift());
for (let i = 0; i < trabajos.length; i += 4) await Promise.all(trabajos.slice(i, i + 4).map((t) => una(...t)));
writeFileSync(archSalida, JSON.stringify(salida, null, 1));
const ok = salida.filter((s) => !s.error); const m = (k) => Math.round(ok.reduce((a, s) => a + s.uso[k], 0) / ok.length);
console.log(variante, "llamadas", salida.length, "errores", salida.length - ok.length, "corrige%", (100 * ok.filter((s) => s.veredicto === "corregir").length / ok.length).toFixed(1),
  "entrada", m("entrada"), "leído", m("leido"), "escrito", m("escrito"), "salida", m("salida"), "USD", usd.toFixed(4), "USD/llamada", (usd / ok.length).toFixed(5));
