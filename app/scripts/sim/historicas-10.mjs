#!/usr/bin/env node
/**
 * Repite 10 conversaciones REALES de producción contra `npm run sim`.
 * No inventa mensajes: los textos salen tal cual de `messages` (inbound).
 * Guarda la transcripción entera —cliente y bot, en orden— más la fase
 * operativa elegida por turno, las herramientas, el Guardián y las alertas.
 */
import { readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";

const UI = "http://127.0.0.1:3210";
const APP = "http://127.0.0.1:3205";
const DB = "postgresql://manue@localhost/autoventa_sim";
const sql = postgres(DB, { prepare: false, max: 1 });

const ENTRADA = process.argv[2];
const SALIDA = process.argv[3];
const SOLO = process.argv[4] ? process.argv[4].split(",").map(Number) : null;

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url, options) {
  const r = await fetch(url, options);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(body)}`);
  return body;
}

async function activarBot() {
  await json(`${APP}/api/bot-power`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-admin-key": "sim" },
    body: JSON.stringify({ activo: true, motivo: "lote de 10 conversaciones históricas" }),
  });
}

const reiniciar = async () => { await json(`${UI}/api/reiniciar`, { method: "POST" }); await pausa(200); };

async function snapshot() {
  const [conv] = await sql`select id, stage, tire_size, selected_quantity, nearest_store,
    visit_date, status from conversations order by id desc limit 1`;
  if (!conv) return { conv: null, mensajes: [], runs: [], guardian: [], quotes: [], alertas: [] };
  const [mensajes, runs, guardian, quotes, alertas] = await Promise.all([
    sql`select id, author_kind, direction, content, type from messages where conversation_id=${conv.id} order by id`,
    sql`select id, stage, model, route, tools, error from ai_runs where conversation_id=${conv.id} order by id`,
    sql`select id, verdict, findings, original_text, corrected_text from guardian_reviews where conversation_id=${conv.id} order by id`,
    sql`select id, quote_number, total, items from quotes where conversation_id=${conv.id} order by id`,
    sql`select id, type, priority, summary from bot_alerts where conversation_id=${conv.id} order by id`,
  ]);
  return { conv, mensajes, runs, guardian, quotes, alertas };
}

async function mandar(texto) {
  const antes = await snapshot();
  const maxBot = Math.max(0, ...antes.mensajes.filter((m) => m.author_kind === "bot").map((m) => Number(m.id)));
  const runsAntes = antes.runs.length;
  const guardianAntes = antes.guardian.length;
  await json(`${UI}/api/enviar`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto }),
  });
  const limite = Date.now() + 120_000;
  let ultimo = null, firma = "", estable = 0;
  while (Date.now() < limite) {
    ultimo = await snapshot();
    const nuevos = ultimo.mensajes.filter((m) => m.author_kind === "bot" && Number(m.id) > maxBot);
    const nuevaFirma = JSON.stringify([
      nuevos.map((m) => [String(m.id), m.content]),
      ultimo.runs.map((r) => [String(r.id), r.error, r.tools]),
      ultimo.guardian.map((g) => String(g.id)),
    ]);
    const completo = nuevos.length && ultimo.runs.length > runsAntes && ultimo.guardian.length > guardianAntes;
    if (completo && nuevaFirma === firma) {
      if (!estable) estable = Date.now();
      if (Date.now() - estable >= 2_000) break;
    } else { firma = nuevaFirma; estable = Date.now(); }
    await pausa(400);
  }
  if (!ultimo) ultimo = await snapshot();
  const nuevos = ultimo.mensajes.filter((m) => m.author_kind === "bot" && Number(m.id) > maxBot);
  const runsTurno = ultimo.runs.slice(runsAntes);
  const tools = runsTurno.flatMap((r) => Array.isArray(r.tools) ? r.tools : []).map(String);
  return {
    cliente: texto,
    bot: nuevos.map((m) => ({ texto: m.content, tipo: m.type })),
    fase: tools.filter((t) => t.startsWith("fase_operativa:")).map((t) => t.slice(15)),
    herramientas: tools.filter((t) => !t.startsWith("fase_operativa:")),
    modelos: [...new Set(runsTurno.map((r) => r.model))],
    etapaRun: [...new Set(runsTurno.map((r) => r.stage))],
    errores: runsTurno.filter((r) => r.error).map((r) => r.error),
    sinRespuesta: nuevos.length === 0,
    guardian: ultimo.guardian.slice(guardianAntes).map((g) => ({
      verdict: g.verdict, findings: g.findings,
      reescribio: g.corrected_text && g.corrected_text !== g.original_text,
      original: g.original_text, corregido: g.corrected_text,
    })),
    estado: ultimo,
  };
}

const casos = JSON.parse(await readFile(ENTRADA, "utf8"))
  .filter((c) => !SOLO || SOLO.includes(c.conv));

await activarBot();
const salida = [];
for (const caso of casos) {
  process.stdout.write(`\n▶ conv ${caso.conv} · ${caso.mensajes.length} mensajes\n`);
  await reiniciar();
  await activarBot();
  const turnos = [];
  for (const texto of caso.mensajes) {
    process.stdout.write(`   · «${texto.slice(0, 50)}»`);
    let turno;
    try { turno = await mandar(texto); }
    catch (e) { turno = { cliente: texto, bot: [], error: String(e), sinRespuesta: true, guardian: [], herramientas: [], fase: [] }; }
    process.stdout.write(` → ${turno.bot?.length ?? 0} resp${turno.sinRespuesta ? " ⚠️ SIN RESPUESTA" : ""}\n`);
    turnos.push({ ...turno, estado: undefined });
    if (turno.estado) caso._final = turno.estado;
  }
  const fin = caso._final ?? await snapshot();
  salida.push({
    conv: caso.conv,
    esperadoProduccion: {
      stage: caso.stage_real, medida: caso.medida_real, cantidad: caso.cantidad_real,
      local: caso.local_real, visita: caso.visita_real,
    },
    resultadoSimulador: {
      stage: fin.conv?.stage, medida: fin.conv?.tire_size, cantidad: fin.conv?.selected_quantity,
      local: fin.conv?.nearest_store, visita: fin.conv?.visit_date, status: fin.conv?.status,

      cotizaciones: fin.quotes.map((q) => ({ n: q.quote_number, total: q.total, items: q.items })),
      alertas: fin.alertas.map((a) => `${a.type}/${a.priority}: ${a.summary}`),
    },
    turnos,
  });
  await writeFile(SALIDA, JSON.stringify(salida, null, 2));
}
await sql.end();
console.log(`\n✅ ${salida.length} conversaciones → ${SALIDA}`);
