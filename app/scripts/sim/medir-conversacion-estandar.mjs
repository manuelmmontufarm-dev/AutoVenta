#!/usr/bin/env node
/**
 * CUÁNTO CUESTA UNA CONVERSACIÓN — SIEMPRE LA MISMA.
 *
 * Corre la conversación estándar (`estandar/conversacion-estandar.json`, la
 * conversación promedio de producción) contra un simulador ya levantado, N
 * veces, y deja escrito cuántos tokens gastó cada pieza del bot: vendedor,
 * clasificador y guardián, con su parte cacheada y su salida.
 *
 * Sirve para dos cosas:
 *   1. Un número de costo por conversación que se puede seguir en el tiempo
 *      (`mediciones/historial.jsonl`): si un cambio lo sube, se ve.
 *   2. Comparar dos árboles de código (antes/después) con la MISMA
 *      conversación, corriendo dos simuladores a la vez.
 *
 * Lo que NO sirve para medir: el ahorro exacto de recortar texto de un prompt.
 * El vendedor no contesta igual dos veces, así que el guardián recibe borradores
 * distintos y el ruido tapa diferencias chicas. Para eso está
 * `scripts/guardian/contar-tokens-rubrica.mjs`. Ver docs/COMO-MEDIR-TOKENS.md.
 *
 * Dos cosas del simulador que difieren de producción, y cómo se tratan:
 *   · El caché arranca frío y la clave es otra → la primera repetición se
 *     descarta (calentamiento) y además se informa un costo NORMALIZADO con la
 *     parte cacheada que producción tiene de verdad en cada tipo de llamada.
 *   · El seguimiento sale 3 h después y solo en horario → se adelanta su
 *     `due_at` y se abre el horario, SOLO en la base desechable del simulador.
 *
 * Uso (con un simulador ya corriendo):
 *   SIM_UI_URL=http://127.0.0.1:3410 SIM_APP_URL=http://127.0.0.1:3405 \
 *   SIM_DATABASE_URL=postgresql://manue@localhost/autoventa_sim_n1 \
 *   node scripts/sim/medir-conversacion-estandar.mjs --etiqueta nivel1 --arbol ../.. --repeticiones 3
 *
 * El simulador tiene que arrancar con `--nombre Mario` (el perfil de la conversación real).
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql, pausa, activarBot, reiniciar } from "./lib/corredor-t115.mjs";

const aquí = dirname(fileURLToPath(import.meta.url));
const raízApp = resolve(aquí, "../..");
const argv = process.argv.slice(2);
const valor = (nombre, porDefecto = null) => {
  const i = argv.indexOf(`--${nombre}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : porDefecto;
};

const UI = process.env.SIM_UI_URL ?? "http://127.0.0.1:3210";
const ETIQUETA = valor("etiqueta");
const REPETICIONES = Number(valor("repeticiones", "3"));
const CALENTAMIENTO = Number(valor("calentamiento", "1"));
const ARBOL = resolve(valor("arbol", resolve(raízApp, "..")));
const FIXTURE = resolve(aquí, valor("fixture", "estandar/conversacion-estandar.json"));
const DIR_SALIDA = resolve(aquí, "mediciones");
const ESTABLE_MS = 6_000;
const LIMITE_TURNO_MS = 180_000;

if (!ETIQUETA) {
  console.error("Falta --etiqueta (por ejemplo: base, nivel1).");
  process.exit(1);
}

const estandar = JSON.parse(readFileSync(FIXTURE, "utf8"));

/** Tarifas por millón: se leen de services/billing.ts para no tener dos fuentes. */
function tarifas() {
  const fuente = readFileSync(resolve(raízApp, "src/services/billing.ts"), "utf8");
  const t = {};
  for (const m of fuente.matchAll(/"([\w.-]+)":\s*\{\s*input:\s*([\d.]+),\s*cachedInput:\s*([\d.]+),\s*output:\s*([\d.]+)\s*\}/g)) {
    t[m[1]] = { input: Number(m[2]), cachedInput: Number(m[3]), output: Number(m[4]) };
  }
  if (!t["gpt-5.5"]) throw new Error("No se pudieron leer las tarifas de services/billing.ts");
  return t;
}
const TARIFAS = tarifas();

function commitDelArbol() {
  try {
    const commit = execFileSync("git", ["-C", ARBOL, "rev-parse", "--short", "HEAD"]).toString().trim();
    const sucio = execFileSync("git", ["-C", ARBOL, "status", "--porcelain", "--", "app/src"]).toString().trim() !== "";
    return { commit, srcSinCommitear: sucio };
  } catch {
    return { commit: null, srcSinCommitear: null };
  }
}

async function enviar(cuerpo) {
  const r = await fetch(`${UI}/api/enviar`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.ok === false) throw new Error(`/api/enviar ${r.status} ${JSON.stringify(body)}`);
}

async function conversacionActual() {
  const [conv] = await sql`select id from conversations order by id desc limit 1`;
  return conv ? Number(conv.id) : null;
}

async function firma(convId) {
  if (!convId) return { bot: 0, texto: "" };
  const [c] = await sql`select
      (select count(*) from messages where conversation_id = ${convId} and author_kind = 'bot')::int bot,
      (select count(*) from messages where conversation_id = ${convId})::int msgs,
      (select count(*) from ai_runs where conversation_id = ${convId})::int runs,
      (select count(*) from guardian_reviews where conversation_id = ${convId})::int guard,
      (select count(*) from follow_up_jobs where conversation_id = ${convId} and status = 'processing')::int procesando`;
  return { bot: c.bot, procesando: c.procesando, texto: `${c.msgs}|${c.runs}|${c.guard}|${c.procesando}` };
}

/** Espera a que el turno cierre: hay respuesta nueva y nada cambia durante ESTABLE_MS. */
async function esperarTurno(botAntes) {
  const limite = Date.now() + LIMITE_TURNO_MS;
  let ultima = "", desde = Date.now();
  while (Date.now() < limite) {
    const convId = await conversacionActual();
    const f = await firma(convId);
    if (f.texto !== ultima) { ultima = f.texto; desde = Date.now(); }
    else if (f.bot > botAntes && f.procesando === 0 && Date.now() - desde >= ESTABLE_MS) return { ok: true, convId };
    await pausa(500);
  }
  return { ok: false, convId: await conversacionActual() };
}

async function correrTurno(turno) {
  const convAntes = await conversacionActual();
  const { bot: botAntes } = await firma(convAntes);

  if (turno.tipo === "texto") await enviar({ texto: turno.texto });
  else if (turno.tipo === "sticker") await enviar({ sticker: true });
  else if (turno.tipo === "seguimiento") {
    if (!convAntes) return { tipo: turno.tipo, ok: false, motivo: "no hay conversación" };
    // Solo en la base del simulador: el seguimiento real sale horas después y
    // solo en horario de atención. Adelantarlo es lo que permite medirlo.
    await sql`update follow_up_policies set never_outside_hours = false where policy_key = 'default'`;
    const adelantados = await sql`
      update follow_up_jobs set due_at = now()
      where conversation_id = ${convAntes} and type = ${turno.trabajo} and status = 'scheduled'
      returning id`;
    if (!adelantados.length) {
      return { tipo: turno.tipo, ok: false, motivo: `no había seguimiento ${turno.trabajo} agendado` };
    }
  } else throw new Error(`tipo de turno desconocido: ${turno.tipo}`);

  const r = await esperarTurno(botAntes);
  return { tipo: turno.tipo, ok: r.ok, motivo: r.ok ? null : "sin respuesta estable a tiempo" };
}

function costo(run, parteCacheada) {
  const t = TARIFAS[run.model] ?? TARIFAS["gpt-5.5"];
  const inp = Number(run.input_tokens ?? 0);
  const cached = Math.min(Number(run.cached_input_tokens ?? 0), inp);
  const out = Number(run.output_tokens ?? 0);
  const medido = ((inp - cached) * t.input + cached * t.cachedInput + out * t.output) / 1e6;
  const p = parteCacheada ?? (inp ? cached / inp : 0);
  const normalizado = (inp * (p * t.cachedInput + (1 - p) * t.input) + out * t.output) / 1e6;
  return { medido, normalizado };
}

async function medirConversacion(convId) {
  const runs = await sql`
    select call_type, route, model, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, error
    from ai_runs where conversation_id = ${convId} order by id`;
  const revisiones = await sql`
    select verdict, findings from guardian_reviews where conversation_id = ${convId} order by id`;
  const mensajes = await sql`
    select author_kind, type, content from messages where conversation_id = ${convId} order by id`;

  const porClase = {};
  let usdMedido = 0, usdNormalizado = 0;
  for (const run of runs) {
    const clave = `${run.call_type}|${run.route}|${run.model}`;
    const c = costo(run, estandar.cacheDeProduccion?.[clave]);
    usdMedido += c.medido; usdNormalizado += c.normalizado;
    const acc = (porClase[clave] ??= { llamadas: 0, entrada: 0, cacheada: 0, salida: 0, razonamiento: 0, usdMedido: 0, usdNormalizado: 0, errores: 0 });
    acc.llamadas += 1;
    acc.entrada += Number(run.input_tokens ?? 0);
    acc.cacheada += Number(run.cached_input_tokens ?? 0);
    acc.salida += Number(run.output_tokens ?? 0);
    acc.razonamiento += Number(run.reasoning_tokens ?? 0);
    acc.usdMedido += c.medido; acc.usdNormalizado += c.normalizado;
    if (run.error) acc.errores += 1;
  }
  const guardian = runs.filter((r) => r.call_type === "guardian");
  return {
    usdMedido, usdNormalizado,
    llamadas: Object.fromEntries(["chat", "classifier", "guardian", "vision"].map((k) => [k, runs.filter((r) => r.call_type === k).length])),
    guardian: {
      llamadas: guardian.length,
      entradaMedia: guardian.length ? Math.round(guardian.reduce((a, r) => a + Number(r.input_tokens), 0) / guardian.length) : 0,
      cacheadaMedia: guardian.length ? Math.round(guardian.reduce((a, r) => a + Number(r.cached_input_tokens), 0) / guardian.length) : 0,
      salidaMedia: guardian.length ? Math.round(guardian.reduce((a, r) => a + Number(r.output_tokens), 0) / guardian.length) : 0,
      veredictos: revisiones.map((g) => g.verdict),
      categorias: revisiones.flatMap((g) => (Array.isArray(g.findings) ? g.findings : []).map((h) => h.categoria)),
    },
    porClase,
    // Lo que el cliente habría leído: para mirar que la calidad no se rompió.
    transcripcion: mensajes.map((m) =>
      `${m.author_kind === "customer" ? "CLIENTE" : String(m.author_kind).toUpperCase()}: ${m.type === "text" ? "" : `[${m.type}] `}${m.content}`),
  };
}

const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// ─────────────────────────────────────────────────────────────────────────────
const inicio = new Date();
const origen = commitDelArbol();
console.log(`▶ Conversación estándar v${estandar.version} · «${ETIQUETA}» · ${origen.commit ?? "?"}${origen.srcSinCommitear ? " (src sin commitear)" : ""}`);
console.log(`  ${CALENTAMIENTO} de calentamiento + ${REPETICIONES} medidas contra ${UI}`);

const repeticiones = [];
for (let i = 0; i < CALENTAMIENTO + REPETICIONES; i++) {
  const descartada = i < CALENTAMIENTO;
  await reiniciar();
  await activarBot();
  const turnos = [];
  for (const turno of estandar.turnos) turnos.push(await correrTurno(turno));
  const convId = await conversacionActual();
  const medida = await medirConversacion(convId);
  repeticiones.push({ n: i + 1, descartada, conversacion: convId, turnos, ...medida });
  const fallidos = turnos.filter((t) => !t.ok);
  console.log(
    `  ${descartada ? "calentamiento" : `medida ${i + 1 - CALENTAMIENTO}`}: $${medida.usdMedido.toFixed(4)} medido · ` +
    `$${medida.usdNormalizado.toFixed(4)} normalizado · guardián ${medida.guardian.llamadas}× ` +
    `(${medida.guardian.entradaMedia} entrada, ${medida.guardian.cacheadaMedia} cacheada, ${medida.guardian.salidaMedia} salida)` +
    (fallidos.length ? ` · ⚠ ${fallidos.map((t) => `${t.tipo}: ${t.motivo}`).join("; ")}` : ""),
  );
}

const validas = repeticiones.filter((r) => !r.descartada);
const resumen = {
  usdMedido: mediana(validas.map((r) => r.usdMedido)),
  usdNormalizado: mediana(validas.map((r) => r.usdNormalizado)),
  usdNormalizadoMin: Math.min(...validas.map((r) => r.usdNormalizado)),
  usdNormalizadoMax: Math.max(...validas.map((r) => r.usdNormalizado)),
  guardianLlamadas: mediana(validas.map((r) => r.guardian.llamadas)),
  guardianEntradaMedia: mediana(validas.map((r) => r.guardian.entradaMedia)),
  guardianCacheadaMedia: mediana(validas.map((r) => r.guardian.cacheadaMedia)),
  guardianSalidaMedia: mediana(validas.map((r) => r.guardian.salidaMedia)),
  chatLlamadas: mediana(validas.map((r) => r.llamadas.chat)),
  turnosFallidos: validas.reduce((a, r) => a + r.turnos.filter((t) => !t.ok).length, 0),
};

const registro = {
  fecha: inicio.toISOString(),
  etiqueta: ETIQUETA,
  ...origen,
  estandar: { nombre: estandar.nombre, version: estandar.version },
  repeticiones: REPETICIONES,
  calentamiento: CALENTAMIENTO,
  resumen,
};

mkdirSync(DIR_SALIDA, { recursive: true });
const sello = inicio.toISOString().slice(0, 16).replace(/[-:T]/g, "");
const archivo = resolve(DIR_SALIDA, `${sello}-${ETIQUETA}.json`);
writeFileSync(archivo, JSON.stringify({ ...registro, detalle: repeticiones }, null, 2));
appendFileSync(resolve(DIR_SALIDA, "historial.jsonl"), `${JSON.stringify(registro)}\n`);

console.log(`\n■ «${ETIQUETA}»: $${resumen.usdNormalizado.toFixed(4)} por conversación (normalizado, mediana; ` +
  `rango $${resumen.usdNormalizadoMin.toFixed(4)}–$${resumen.usdNormalizadoMax.toFixed(4)}) · medido $${resumen.usdMedido.toFixed(4)}`);
console.log(`  guardián: ${resumen.guardianLlamadas} llamadas, ${resumen.guardianEntradaMedia} tokens de entrada por llamada`);
console.log(`  referencia de producción (conv ${estandar.fuente.conversacion}): $${estandar.referenciaProduccion.usd}`);
console.log(`  detalle: ${archivo}`);
await sql.end();
