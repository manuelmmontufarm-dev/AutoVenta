/**
 * Orquestador de la prueba de carga: 50 clientes simultáneos.
 *
 * Levanta todo aislado —base efímera, stub de Meta, stub de OpenAI, bot y
 * worker como procesos hijos—, corre los cinco escenarios, mide, y emite el
 * veredicto contra los 12 criterios. No toca staging ni producción: si
 * GRAPH_BASE_URL no apuntara al stub, ningún mensaje sintético llegaría a Meta
 * igualmente porque el token es falso, pero el stub lo hace explícito.
 *
 * Uso: node scripts/loadtest/run.mjs [--clientes 50] [--escenarios A,B,C,D,E]
 */
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { crearClientes, escenarioA, escenarioB, escenarioC, RANGOS } from "./scenarios.mjs";
import { verificar } from "./verify.mjs";
import { sleep, buildInboundPayload, deliverWebhook, makeWamid } from "./lib/meta.mjs";

const aquí = dirname(fileURLToPath(import.meta.url));
const raízApp = resolve(aquí, "../..");

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, l) => {
  if (v.startsWith("--")) acc.push([v.slice(2), l[i + 1]]);
  return acc;
}, []));

const CLIENTES = Number(args.clientes ?? 50);
const ESCENARIOS = (args.escenarios ?? "A,B,C,D,E").split(",").map((s) => s.trim().toUpperCase());
const RUN_ID = String(process.pid);
const PUERTO_APP = 3100;
const PUERTO_GRAPH = 4610;
const PUERTO_OPENAI = 4611;
const DB = `autoventa_carga_${RUN_ID}`;
const APP_SECRET = "loadtest_app_secret_no_es_real";
const ADMIN_KEY = `loadtest_${RUN_ID}`;
const PHONE_ID = "STUBPHONEID";
const BASE_URL = `http://127.0.0.1:${PUERTO_APP}`;
const DEBOUNCE_MS = Number(args.debounce ?? 5_000);
// Latencia del stub del modelo y tasa de errores transitorios de Meta: un stub
// que responde en 1 ms esconde justo los timeouts que se vienen a buscar.
const LATENCIA_MODELO = String(args.latency ?? 150);
const CAOS_GRAPH = String(args.chaos ?? 0);
// --real-model usa la API de OpenAI de verdad en vez del stub. Cuesta dinero
// (del orden de $0,30 la corrida completa) y sirve para confirmar que el stub
// no escondió nada: latencias reales, tool-calls reales, rechazos reales.
const MODELO_REAL = process.argv.includes("--real-model");
if (MODELO_REAL && !process.env.OPENAI_API_KEY) {
  console.error("--real-model necesita OPENAI_API_KEY en el entorno. Defínela y vuelve a correr.");
  process.exit(2);
}

const salida = resolve(aquí, "reports", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(salida, { recursive: true });
const artefactos = {
  graphLog: resolve(salida, "graph-sends.jsonl"),
  openaiLog: resolve(salida, "openai-calls.jsonl"),
  appLog: resolve(salida, "app.log"),
  workerLog: resolve(salida, "worker.log"),
};

const log = (msg) => {
  const linea = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log(linea);
  appendFileSync(resolve(salida, "run.log"), `${linea}\n`);
};

const procesos = [];
const consolaApp = [];

function lanzar(nombre, comando, argumentos, env, archivoLog) {
  const hijo = spawn(comando, argumentos, { cwd: raízApp, env: { ...process.env, ...env } });
  writeFileSync(archivoLog, "");
  for (const stream of [hijo.stdout, hijo.stderr]) {
    stream.on("data", (chunk) => {
      const texto = chunk.toString();
      appendFileSync(archivoLog, texto);
      if (nombre === "app" || nombre === "worker") consolaApp.push(...texto.split("\n").filter(Boolean));
    });
  }
  hijo.on("exit", (code, signal) => log(`⏹  ${nombre} terminó (code=${code} signal=${signal})`));
  procesos.push({ nombre, hijo });
  return hijo;
}

const envBot = () => ({
  DATABASE_URL: `postgresql://manue@localhost/${DB}`,
  PORT: String(PUERTO_APP),
  OPENAI_API_KEY: MODELO_REAL ? process.env.OPENAI_API_KEY : "stub-key",
  ...(MODELO_REAL ? {} : { OPENAI_BASE_URL: `http://127.0.0.1:${PUERTO_OPENAI}/v1` }),
  GRAPH_BASE_URL: `http://127.0.0.1:${PUERTO_GRAPH}`,
  WHATSAPP_TOKEN: "stub-token",
  WHATSAPP_APP_SECRET: APP_SECRET,
  WHATSAPP_VERIFY_TOKEN: "stub-verify",
  WHATSAPP_PHONE_ID: PHONE_ID,
  SELLER_PHONE: "593999000000",
  ADMIN_KEY,
  PHASES_DEFAULT: "all",
  DEBOUNCE_MS: String(DEBOUNCE_MS),
  FOLLOW_UP_POLL_MS: "1000",
  NODE_ENV: "loadtest",
});

async function esperarSalud(intentos = 60) {
  for (let i = 0; i < intentos; i += 1) {
    try {
      const r = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2_000) });
      if (r.ok) return true;
    } catch { /* todavía arrancando */ }
    await sleep(1_000);
  }
  return false;
}

function rssDe(pid) {
  try {
    return Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)]).toString().trim()) * 1024;
  } catch { return 0; }
}

/** Sondea el panel mientras corre la carga: el asesor tiene que poder trabajar. */
function arrancarSondeoApi(latencias, parar) {
  (async () => {
    while (!parar.detenido) {
      for (const ruta of ["/api/hub/follow-ups", "/api/hub/metrics?days=7", "/api/hub/tickets"]) {
        const t0 = performance.now();
        try {
          await fetch(`${BASE_URL}${ruta}`, {
            headers: { "x-admin-key": ADMIN_KEY }, signal: AbortSignal.timeout(10_000),
          });
          latencias.push(performance.now() - t0);
        } catch { latencias.push(10_000); }
      }
      await sleep(2_000);
    }
  })();
}

async function main() {
  const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
  log(`📦 Creando base efímera ${DB}`);
  await admin.unsafe(`drop database if exists ${DB}`);
  await admin.unsafe(`create database ${DB}`);

  log("🧱 Compilando (tsc)");
  execFileSync("npm", ["run", "build"], { cwd: raízApp, stdio: "pipe" });

  log(MODELO_REAL ? "🎭 Stub de Meta (modelo: API REAL de OpenAI)" : "🎭 Levantando stubs de Meta y OpenAI");
  lanzar("stub-graph", "node", [resolve(aquí, "stub-graph.mjs"), "--port", String(PUERTO_GRAPH), "--log", artefactos.graphLog, "--chaos", CAOS_GRAPH], {}, resolve(salida, "stub-graph.log"));
  lanzar("stub-openai", "node", [resolve(aquí, "stub-openai.mjs"), "--port", String(PUERTO_OPENAI), "--log", artefactos.openaiLog, "--latency", LATENCIA_MODELO], {}, resolve(salida, "stub-openai.log"));
  await sleep(1_000);

  log("🤖 Arrancando bot y worker");
  const app = lanzar("app", "node", ["dist/index.js"], envBot(), artefactos.appLog);
  lanzar("worker", "node", ["dist/worker.js"], envBot(), artefactos.workerLog);

  if (!await esperarSalud()) throw new Error("el bot no respondió /health a tiempo — revisa app.log");
  log("✅ Bot arriba");
  const memoriaInicial = rssDe(app.pid);

  const sql = postgres(`postgresql://manue@localhost/${DB}`, { prepare: false, max: 5 });
  const ctx = { baseUrl: BASE_URL, appSecret: APP_SECRET, phoneId: PHONE_ID, debounceMs: DEBOUNCE_MS, acks: [] };
  const clientes = crearClientes(CLIENTES, RUN_ID, RANGOS.A);
  const apiLatencias = [];
  const parar = { detenido: false };
  arrancarSondeoApi(apiLatencias, parar);
  const resultados = {};

  if (ESCENARIOS.includes("A")) {
    log(`🔥 Escenario A — ráfaga fría con ${CLIENTES} clientes × 4 turnos`);
    const t0 = Date.now();
    resultados.A = { ...await escenarioA(ctx, clientes), segundos: Math.round((Date.now() - t0) / 1000) };
    log(`   A listo en ${resultados.A.segundos}s`);
  }

  if (ESCENARIOS.includes("B")) {
    log("👯 Escenario B — duplicados de Meta (at-least-once)");
    const clientesB = crearClientes(CLIENTES, `${RUN_ID}b`, RANGOS.B);
    resultados.B = await escenarioB(ctx, clientesB);
    log(`   B listo: ${resultados.B.duplicadosEnviados} reenvíos`);
  }

  if (ESCENARIOS.includes("C")) {
    log("💬 Escenario C — ráfaga del mismo usuario bajo el debounce");
    const clientesC = crearClientes(10, `${RUN_ID}c`, RANGOS.C);
    resultados.C = await escenarioC(ctx, clientesC);
    log("   C listo");
  }

  if (ESCENARIOS.includes("D")) {
    log("⏰ Escenario D — presión sobre el worker (2 réplicas, seguimientos vencidos)");
    // La etapa del payload tiene que ser la REAL de la conversación: si no,
    // el portón `stage_changed` cancela los 50 y el escenario no llega a probar
    // el envío, que es justo lo que viene a medir.
    const conversaciones = await sql`
      select id, current_cycle, stage from conversations where phone like '59399%' limit 50
    `;
    for (const conv of conversaciones) {
      await sql`
        insert into follow_up_jobs (conversation_id, cycle, type, channel, due_at, window_closes_at, idempotency_key, payload)
        values (${conv.id}, ${conv.current_cycle}, 'in_window_first', 'whatsapp',
          now() - interval '1 minute', now() + interval '20 hours',
          ${`carga:${RUN_ID}:${conv.id}`},
          ${sql.json({ preview: "Borrador determinístico de carga", stage: conv.stage, aiPending: true })})
        on conflict (idempotency_key) do nothing
      `;
    }
    lanzar("worker2", "node", ["dist/worker.js"], envBot(), resolve(salida, "worker2.log"));
    await sleep(25_000);
    resultados.D = { seguimientosSembrados: conversaciones.length };
    log(`   D listo: ${conversaciones.length} seguimientos sembrados con 2 workers`);
  }

  if (ESCENARIOS.includes("E")) {
    log("💥 Escenario E — reinicio del bot a media carga");
    const clientesE = crearClientes(20, `${RUN_ID}e`, RANGOS.E);
    // Mensajes en vuelo: se mandan y se mata el proceso ANTES de que venza el debounce.
    const enVuelo = clientesE.map((c) => ({
      cliente: c,
      waMessageId: makeWamid(c.runId, c.index, 0),
    }));
    await Promise.all(enVuelo.map(({ cliente, waMessageId }) => deliverWebhook({
      baseUrl: BASE_URL, appSecret: APP_SECRET,
      payload: buildInboundPayload({
        from: cliente.phone, name: cliente.name, text: cliente.guion[0],
        waMessageId, phoneId: PHONE_ID,
      }),
    }).then((r) => ctx.acks.push({ waMessageId, phone: cliente.phone, texto: cliente.guion[0], ...r }))));
    await sleep(1_000);
    log("   matando el bot con mensajes en el buffer…");
    app.kill("SIGKILL");
    await sleep(2_000);
    const app2 = lanzar("app", "node", ["dist/index.js"], envBot(), resolve(salida, "app-reinicio.log"));
    if (!await esperarSalud()) throw new Error("el bot no volvió tras el reinicio");
    const perdidosEnReinicio = await sql`
      select count(*)::int as n from (values ${sql(enVuelo.map((e) => [e.waMessageId]))}) as t(id)
      where not exists (select 1 from messages m where m.wa_message_id = t.id)
    `;
    resultados.E = {
      mensajesEnVuelo: enVuelo.length,
      perdidosTrasReinicio: perdidosEnReinicio[0].n,
      pidNuevo: app2.pid,
    };
    log(`   E listo: ${perdidosEnReinicio[0].n}/${enVuelo.length} mensajes perdidos por el reinicio`);
  }

  parar.detenido = true;
  await sleep(6_000); // deja que el worker termine lo que quedó pendiente

  const memoriaFinal = rssDe(procesos.filter((p) => p.nombre === "app").at(-1).hijo.pid);

  log("🔎 Capturas del panel");
  let panelErrores = [];
  let capturas = [];
  try {
    const { capturarPanel } = await import("./screenshots.mjs");
    const r = await capturarPanel({ baseUrl: BASE_URL, adminKey: ADMIN_KEY, salida });
    panelErrores = r.errores;
    capturas = r.capturas;
  } catch (error) {
    log(`   ⚠️ capturas omitidas: ${error.message}`);
    panelErrores = [`capturas no ejecutadas: ${error.message}`];
  }

  log("⚖️  Evaluando los criterios de aceptación");
  const consola = Object.assign([...consolaApp], { panelErrores });
  const veredicto = await verificar({
    sql, artefactos, acks: ctx.acks, apiLatencias, consola,
    memoria: { inicial: memoriaInicial, final: memoriaFinal },
  });

  const reporte = { runId: RUN_ID, clientes: CLIENTES, escenarios: resultados, capturas, ...veredicto };
  writeFileSync(resolve(salida, "reporte.json"), JSON.stringify(reporte, null, 2));

  console.log(`\n${"─".repeat(78)}`);
  console.log(`VEREDICTO: ${veredicto.verde ? "✅ VERDE" : "❌ ROJO"}   (${veredicto.criterios.filter((c) => c.ok).length}/${veredicto.criterios.length} criterios)`);
  console.log("─".repeat(78));
  for (const c of veredicto.criterios) {
    console.log(`${c.ok ? "✅" : "❌"} ${String(c.id).padStart(2)} · ${c.nombre.padEnd(46)} esperado ${String(c.esperado).padEnd(12)} obtuvo ${c.obtenido}`);
    if (!c.ok && c.evidencia) console.log(`      evidencia: ${JSON.stringify(c.evidencia).slice(0, 300)}`);
  }
  console.log("─".repeat(78));
  console.log(JSON.stringify(veredicto.resumen, null, 2));
  console.log(`\n📁 ${salida}\n`);

  await sql.end();
  if (!process.argv.includes("--keep-db")) {
    await admin.unsafe(`drop database if exists ${DB}`).catch(() => {});
  } else {
    log(`🗄  Base conservada para inspección: ${DB}`);
  }
  await admin.end();
  return veredicto.verde;
}

async function limpiar() {
  for (const { hijo } of procesos) { try { hijo.kill("SIGKILL"); } catch { /* ya murió */ } }
}

main()
  .then(async (verde) => { await limpiar(); process.exit(verde ? 0 : 1); })
  .catch(async (error) => {
    console.error("💥 La corrida falló:", error);
    await limpiar();
    process.exit(2);
  });
