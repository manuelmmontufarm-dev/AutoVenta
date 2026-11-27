/**
 * Rutina: cada caso arranca un simulador con la conversación REAL cortada antes
 * del turno (--copiar-conv --hasta), le manda lo que el cliente escribió de
 * verdad y guarda la respuesta, el modelo que la atendió, herramientas, Guardián y costo.
 *   node scripts/haiku-resto/rutina.mjs <casos.json> <modelo-rutina> <carril 0..2> <salida.json> [desde] [hasta]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import postgres from "postgres";
const [archCasos, modelo, carril = "0", archSalida, desde = "0", hasta = "999"] = process.argv.slice(2);
const L = Number(carril);
const P = { ui: 3500 + L * 20, bot: 3501 + L * 20, graph: 3502 + L * 20, conti: 3503 + L * 20, stub: 3504 + L * 20 };
const DB = `autoventa_sim_hk${L}`;
const UI = `http://127.0.0.1:${P.ui}`, APP = `http://127.0.0.1:${P.bot}`;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const casos = JSON.parse(readFileSync(archCasos, "utf8")).slice(Number(desde), Number(hasta));
const salida = existsSync(archSalida) ? JSON.parse(readFileSync(archSalida, "utf8")) : [];
async function json(url, opciones) { const r = await fetch(url, opciones); const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(b)}`); return b; }
for (const caso of casos) {
  if (salida.some((s) => s.conv === caso.conv)) continue;
  const t0 = Date.now();
  const sim = spawn("node", ["scripts/sim/sim.mjs", "--sin-build", "--copiar-conv", String(caso.conv), "--hasta", caso.hasta,
    "--routine-model", modelo,
    // Como producción hoy (Railway, 27-nov): vendedor Sonnet 5.5 y Guardián Haiku 5.5 para todos.
    "--canary-model", "claude-haiku-5-5", "--canary-model-vendedor", "claude-sonnet-5-5", "--canary-model-guardian", "claude-haiku-5-5", "--puerto", String(P.ui), "--puerto-bot", String(P.bot), "--puerto-graph", String(P.graph),
    "--puerto-contifico", String(P.conti), "--puerto-stub", String(P.stub), "--db", DB], { stdio: ["ignore", "pipe", "pipe"], detached: true });
  let log = ""; sim.stdout.on("data", (d) => { log += d; }); sim.stderr.on("data", (d) => { log += d; });
  const resultado = { conv: caso.conv, modelo, error: null };
  try {
    let listo = false;
    for (let i = 0; i < 150 && !listo; i++) { await pausa(1000); try { await json(`${UI}/api/estado`); listo = true; } catch { if (sim.exitCode !== null) throw new Error("el simulador se cerró:\n" + log.slice(-1500)); } }
    if (!listo) throw new Error("el simulador no levantó en 150 s");
    await json(`${APP}/api/bot-power`, { method: "PUT", headers: { "Content-Type": "application/json", "x-admin-key": "sim" }, body: JSON.stringify({ activo: true, motivo: "prueba rutina" }) }).catch(() => {});
    const sql = postgres(`postgresql://manue@localhost/${DB}`, { prepare: false, max: 1, onnotice: () => {} });
    const [conv] = await sql`select id from conversations order by id desc limit 1`;
    const [{ m: maxId }] = await sql`select coalesce(max(id),0) m from messages where conversation_id=${conv.id}`;
    for (const t of caso.cliente) { await json(`${UI}/api/enviar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: t }) }); await pausa(400); }
    // Espera: respuesta del bot y 15 s sin novedades (máximo 150 s).
    let ultimo = 0, quieto = 0;
    for (let i = 0; i < 150; i++) {
      await pausa(1000);
      const [{ n }] = await sql`select count(*)::int n from messages where conversation_id=${conv.id} and id>${maxId} and direction='outbound'`;
      const [{ r }] = await sql`select count(*)::int r from ai_runs where conversation_id=${conv.id}`;
      const marca = n * 1000 + r; if (marca === ultimo && n > 0) quieto++; else { quieto = 0; ultimo = marca; }
      if (quieto >= 15) break;
    }
    resultado.respuesta = (await sql`select content from messages where conversation_id=${conv.id} and id>${maxId} and direction='outbound' order by id`).map((m) => m.content);
    resultado.runs = await sql`select model, route, call_type, input_tokens, cached_input_tokens, cache_write_tokens, output_tokens, tools, iterations, latency_ms from ai_runs where conversation_id=${conv.id} order by id`;
    resultado.guardian = await sql`select verdict, findings, corrected_text from guardian_reviews where conversation_id=${conv.id} order by id`;
    resultado.etapaFinal = (await sql`select stage from conversations where id=${conv.id}`)[0]?.stage;
    await sql.end();
  } catch (e) { resultado.error = String(e.message ?? e); }
  try { process.kill(-sim.pid, "SIGINT"); } catch {}
  for (let i = 0; i < 20 && sim.exitCode === null; i++) await pausa(500);
  try { process.kill(-sim.pid, "SIGKILL"); } catch {}
  resultado.segundos = Math.round((Date.now() - t0) / 1000);
  salida.push(resultado); writeFileSync(archSalida, JSON.stringify(salida, null, 1));
  console.log(`${caso.conv} ${modelo} ${resultado.error ? "ERROR " + resultado.error.slice(0, 200) : `ok ${resultado.respuesta?.length} msj, ${resultado.runs?.length} runs`} ${resultado.segundos}s`);
}
