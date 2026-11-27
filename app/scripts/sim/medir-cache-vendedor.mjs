#!/usr/bin/env node
/**
 * EL CACHÉ DEL VENDEDOR EN CLAUDE, MEDIDO EN EL SIMULADOR (27-nov-2026).
 *
 * Corre N veces los mensajes de la conversación estándar
 * (`estandar/conversacion-estandar.json`, solo los de texto) con una PAUSA
 * entre conversación y conversación, y por cada turno del vendedor deja: lo
 * leído del caché, lo escrito (y la parte de 1 hora, si la columna existe), las
 * rondas y el costo con las tarifas de Claude. La pausa es lo que importa: en
 * producción el siguiente chat de la misma fase llega casi siempre entre 5 y 60
 * minutos después, que es justo donde el caché de 5 minutos ya venció.
 *
 * AISLAMIENTO DEL CACHÉ. El simulador usa la misma clave de Anthropic que
 * producción y copia sus prompts, así que leería el caché que deja el tráfico
 * real (o el del otro simulador). `--marca X` escribe una indicación inocua en
 * los prompts de fase de ESTA base («Sesión de prueba X.»): el prefijo queda
 * único y solo se lee lo que este simulador escribió.
 *
 * Uso (simulador ya corriendo, con el vendedor en Claude):
 *   SIM_UI_URL=http://127.0.0.1:3610 SIM_APP_URL=http://127.0.0.1:3605 \
 *   SIM_DATABASE_URL=postgresql://manue@localhost/autoventa_sim_cache_b \
 *   node scripts/sim/medir-cache-vendedor.mjs --etiqueta despues --marca B --conversaciones 3 --pausa-min 6.5
 *
 * `--textos "hola|225/70R15 por favor|¿y para carretera?"` usa esos mensajes en vez de los del estándar.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql, pausa, activarBot, reiniciar } from "./lib/corredor-t115.mjs";

const aquí = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const valor = (nombre, porDefecto = null) => {
  const i = argv.indexOf(`--${nombre}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : porDefecto;
};
const UI = process.env.SIM_UI_URL ?? "http://127.0.0.1:3210";
const ETIQUETA = valor("etiqueta", "medicion");
const MARCA = valor("marca");
const N = Number(valor("conversaciones", "3"));
const PAUSA_MIN = Number(valor("pausa-min", "6.5"));
const TOPE_USD = Number(valor("tope-usd", "2.5"));
const ESTABLE_MS = 6_000;
const LIMITE_TURNO_MS = 180_000;

// Tarifas por millón (services/billing.ts). Escribir 1 h = 2× la entrada.
const TARIFA = {
  "claude-sonnet-5-5": { input: 2, read: 0.1, write: 2.5 },
  "claude-haiku-5-5": { input: 0.1, read: 0.01, write: 0.125 },
  "claude-opus-5-5": { input: 4, read: 0.2, write: 5 },
  "gpt-5.5": { input: 5, read: 0.5, write: 5, output: 30 },
  "gpt-5.4-mini": { input: 0.75, read: 0.075, write: 0.75, output: 4.5 },
};
const SALIDA = { "claude-sonnet-5-5": 10, "claude-haiku-5-5": 0.5, "claude-opus-5-5": 20 };

const estandar = JSON.parse(readFileSync(resolve(aquí, "estandar/conversacion-estandar.json"), "utf8"));
// `--textos "a|b|c"` cambia los mensajes (p. ej. varias preguntas seguidas para
// ver si el turno siguiente relee el historial).
const textos = valor("textos")?.split("|") ?? estandar.turnos.filter((t) => t.tipo === "texto").map((t) => t.texto);

const [{ existe: hay1h }] = await sql`
  select exists (select 1 from information_schema.columns
    where table_name = 'ai_runs' and column_name = 'cache_write_1h_tokens') as existe`;

function costo(r) {
  const t = TARIFA[r.model] ?? TARIFA["claude-sonnet-5-5"];
  const inp = Number(r.input_tokens);
  const rd = Math.min(Number(r.cached_input_tokens), inp);
  const wr = Math.min(Number(r.cache_write_tokens ?? 0), inp - rd);
  const wr1h = Math.min(Number(r.wr1h ?? 0), wr);
  const salida = SALIDA[r.model] ?? t.output ?? 10;
  return ((inp - rd - wr) * t.input + rd * t.read + (wr - wr1h) * t.write + wr1h * t.input * 2
    + Number(r.output_tokens) * salida) / 1e6;
}

async function enviar(texto) {
  const r = await fetch(`${UI}/api/enviar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.ok === false) throw new Error(`/api/enviar ${r.status} ${JSON.stringify(body)}`);
}
async function convActual() {
  const [c] = await sql`select id from conversations order by id desc limit 1`;
  return c ? Number(c.id) : null;
}
async function firma(id) {
  if (!id) return { bot: 0, texto: "" };
  const [c] = await sql`select
    (select count(*) from messages where conversation_id = ${id} and author_kind = 'bot')::int bot,
    (select count(*) from messages where conversation_id = ${id})::int msgs,
    (select count(*) from ai_runs where conversation_id = ${id})::int runs`;
  return { bot: c.bot, texto: `${c.msgs}|${c.runs}` };
}
async function esperarTurno(botAntes) {
  const limite = Date.now() + LIMITE_TURNO_MS;
  let ultima = "";
  let desde = Date.now();
  while (Date.now() < limite) {
    const f = await firma(await convActual());
    if (f.texto !== ultima) { ultima = f.texto; desde = Date.now(); }
    else if (f.bot > botAntes && Date.now() - desde >= ESTABLE_MS) return true;
    await pausa(500);
  }
  return false;
}

async function gastoDeLaBase() {
  const filas = await sql`select model, input_tokens, cached_input_tokens, cache_write_tokens, output_tokens,
    ${hay1h ? sql`cache_write_1h_tokens` : sql`0`} as wr1h from ai_runs`;
  return filas.reduce((s, r) => s + costo(r), 0);
}

if (MARCA) {
  await sql`update stage_prompt_versions set prompt = ${`Sesión de prueba ${MARCA}.`} where status = 'published'`;
}

const conversaciones = [];
for (let n = 0; n < N; n++) {
  if (n > 0) {
    console.log(`  … pausa de ${PAUSA_MIN} min (el caché de 5 min vence)`);
    await pausa(PAUSA_MIN * 60_000);
  }
  const gastado = await gastoDeLaBase();
  if (gastado > TOPE_USD) { console.log(`■ Tope de $${TOPE_USD} alcanzado ($${gastado.toFixed(3)}); paro.`); break; }
  await reiniciar();
  await activarBot();
  if (MARCA) await sql`update stage_prompt_versions set prompt = ${`Sesión de prueba ${MARCA}.`} where status = 'published'`;
  const turnos = [];
  for (const texto of textos) {
    const id = await convActual();
    const { bot } = await firma(id);
    await enviar(texto);
    turnos.push(await esperarTurno(bot));
  }
  const id = await convActual();
  const runs = await sql`select call_type, route, model, stage, iterations, input_tokens, cached_input_tokens,
      cache_write_tokens, output_tokens, ${hay1h ? sql`cache_write_1h_tokens` : sql`0`} as wr1h, tools, created_at
    from ai_runs where conversation_id = ${id} order by id`;
  const mensajes = await sql`select author_kind, type, content from messages where conversation_id = ${id} order by id`;
  const chat = runs.filter((r) => r.call_type === "chat");
  const fila = {
    n: n + 1, conversacion: id, turnosOk: turnos.filter(Boolean).length,
    vendedor: chat.map((r) => ({
      fase: String(JSON.stringify(r.tools)).match(/fase_operativa:([a-z_]+)/)?.[1] ?? r.stage,
      rondas: r.iterations, entrada: r.input_tokens, leido: r.cached_input_tokens, escrito: r.cache_write_tokens,
      escrito1h: Number(r.wr1h), salida: r.output_tokens, usd: Number(costo(r).toFixed(5)), modelo: r.model,
    })),
    usdVendedor: chat.reduce((s, r) => s + costo(r), 0),
    usdTotal: runs.reduce((s, r) => s + costo(r), 0),
    transcripcion: mensajes.map((m) => `${m.author_kind === "customer" ? "CLIENTE" : String(m.author_kind).toUpperCase()}: ${m.type === "text" ? "" : `[${m.type}] `}${m.content}`),
  };
  conversaciones.push(fila);
  console.log(`conv ${fila.n} (#${id}) vendedor $${fila.usdVendedor.toFixed(4)} · todo $${fila.usdTotal.toFixed(4)} · turnos ok ${fila.turnosOk}/${textos.length}`);
  for (const v of fila.vendedor) {
    console.log(`   ${v.modelo} ${v.fase.padEnd(18)} rondas ${v.rondas} entrada ${v.entrada} leído ${v.leido} escrito ${v.escrito} (1h ${v.escrito1h}) $${v.usd}`);
  }
}

mkdirSync(resolve(aquí, "mediciones"), { recursive: true });
const archivo = resolve(aquí, "mediciones", `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}-cache-${ETIQUETA}.json`);
writeFileSync(archivo, JSON.stringify({ etiqueta: ETIQUETA, marca: MARCA, pausaMin: PAUSA_MIN, conversaciones, gastoBase: await gastoDeLaBase() }, null, 2));
console.log(`■ ${archivo}`);
await sql.end();
