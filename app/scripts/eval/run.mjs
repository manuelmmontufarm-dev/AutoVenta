/**
 * Evaluación de calidad comercial del bot.
 *
 * Es lo que la prueba de carga NO mide: allá el modelo está mockeado y solo se
 * comprueba que el sistema aguante; aquí se juzga lo que el bot realmente dice.
 *
 * Dos capas, a propósito:
 *  1. Reglas duras (rubrica.mjs) — determinísticas, gratis, y son las que
 *     atrapan lo que arruina una venta: precios, stock o descuentos inventados.
 *  2. Juez LLM — solo para lo que las reglas no pueden ver (tono, utilidad).
 *     Opina; por eso nunca decide solo. Un fallo crítico de la capa 1 reprueba
 *     aunque el juez ponga 5.
 *
 * Uso:
 *   OPENAI_API_KEY=... node scripts/eval/run.mjs            # bot y juez reales
 *   node scripts/eval/run.mjs --stub                        # solo prueba el cableado
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { evaluarReglas, PROMPT_JUEZ } from "./rubrica.mjs";
import { buildInboundPayload, deliverWebhook, sleep } from "../loadtest/lib/meta.mjs";

const aquí = dirname(fileURLToPath(import.meta.url));
const raízApp = resolve(aquí, "../..");
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, l) => {
  if (v.startsWith("--")) a.push([v.slice(2), l[i + 1]]);
  return a;
}, []));

const USA_STUB = process.argv.includes("--stub");
if (!USA_STUB && !process.env.OPENAI_API_KEY) {
  console.error("Falta OPENAI_API_KEY. Defínela en el entorno, o usa --stub para probar solo el cableado.");
  process.exit(2);
}

const RUN_ID = String(process.pid);
const DB = `autoventa_eval_${RUN_ID}`;
const PUERTO_APP = 3200;
const PUERTO_GRAPH = 4620;
const PUERTO_OPENAI = 4621;
const APP_SECRET = "eval_app_secret";
const PHONE_ID = "EVALPHONEID";
const BASE_URL = `http://127.0.0.1:${PUERTO_APP}`;
const MODELO_JUEZ = process.env.EVAL_JUDGE_MODEL ?? "gpt-4o-mini";

const salida = resolve(aquí, "reports", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(salida, { recursive: true });
const graphLog = resolve(salida, "respuestas.jsonl");
const log = (m) => { console.log(m); appendFileSync(resolve(salida, "run.log"), `${m}\n`); };

/** Conversaciones de prueba: cada turno declara qué se le puede exigir a la respuesta. */
const CASOS = [
  {
    id: "pide_medida",
    turnos: [
      { texto: "Hola, necesito llantas para mi carro", espera: { etapa: "nuevo", clienteDioMedida: false } },
      { texto: "Es un Corolla 2018", espera: { etapa: "nuevo", clienteDioMedida: false } },
    ],
  },
  {
    id: "medida_directa",
    turnos: [
      { texto: "Buenas, quiero cotizar 205/55R16", espera: { clienteDioMedida: true } },
      { texto: "¿Cuál me recomiendas para ciudad?", espera: { clienteDioMedida: true } },
    ],
  },
  {
    id: "presion_de_precio",
    turnos: [
      { texto: "Hola, cuánto cuestan unas llantas 205/55R16", espera: { clienteDioMedida: true } },
      // Trampa: pide descuento sin que haya ninguno autorizado.
      { texto: "¿Me haces un descuento si llevo las 4?", espera: { clienteDioMedida: true } },
    ],
  },
  {
    id: "pregunta_stock",
    turnos: [
      { texto: "necesito 4 llantas 205/55R16", espera: { clienteDioMedida: true } },
      { texto: "¿tienen en stock ahorita mismo?", espera: { clienteDioMedida: true } },
    ],
  },
  {
    id: "cliente_apurado",
    turnos: [
      { texto: "necesito llantas YA, 205/55R16", espera: { clienteDioMedida: true } },
      { texto: "¿me las pueden entregar hoy?", espera: { clienteDioMedida: true } },
    ],
  },
  {
    // Caso Chevrolet Orlando (5-ago): el cliente dio la MEDIDA y su carro, y el
    // bot en vez de cotizar pidió versión y una foto de la etiqueta. Con medida
    // en mano, el vehículo es contexto, no un requisito.
    id: "medida_manda_sobre_vehiculo",
    turnos: [
      { texto: "Buenas, necesito llantas 225/65 r17", espera: { clienteDioMedida: true } },
      { texto: "Es para un Chevrolet Orlando", espera: { clienteDioMedida: true } },
    ],
  },
  {
    // Caso KLEVER (5-ago): «son todo terreno» es lo que el cliente BUSCA, no
    // una afirmación a verificar. La respuesta mala fue «no tengo una ficha
    // técnica verificada… ¿me da la versión de su auto?».
    id: "tipo_es_lo_que_busca",
    turnos: [
      { texto: "Quiero 4 llantas 225/60R17", espera: { clienteDioMedida: true } },
      { texto: "que sean todo terreno", espera: { clienteDioMedida: true } },
    ],
  },
];

const procesos = [];
function lanzar(nombre, cmd, argv, env, archivo) {
  const hijo = spawn(cmd, argv, { cwd: raízApp, env: { ...process.env, ...env } });
  writeFileSync(archivo, "");
  for (const s of [hijo.stdout, hijo.stderr]) s.on("data", (c) => appendFileSync(archivo, c.toString()));
  procesos.push(hijo);
  return hijo;
}

async function esperarSalud() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok) return true; } catch { /* arrancando */ }
    await sleep(1000);
  }
  return false;
}

/** Pide al juez que califique una respuesta. Si falla, se reporta, no se inventa. */
async function juzgar(turnoCliente, respuesta) {
  const base = USA_STUB ? `http://127.0.0.1:${PUERTO_OPENAI}/v1` : "https://api.openai.com/v1";
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${USA_STUB ? "stub" : process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODELO_JUEZ,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PROMPT_JUEZ },
          { role: "user", content: `Cliente: ${turnoCliente}\nAsesor: ${respuesta}` },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await r.json();
    return JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

async function main() {
  const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
  await admin.unsafe(`drop database if exists ${DB}`);
  await admin.unsafe(`create database ${DB}`);
  execFileSync("npm", ["run", "build"], { cwd: raízApp, stdio: "pipe" });

  lanzar("graph", "node", [resolve(aquí, "../loadtest/stub-graph.mjs"), "--port", String(PUERTO_GRAPH), "--log", graphLog], {}, resolve(salida, "graph.log"));
  if (USA_STUB) {
    lanzar("openai", "node", [resolve(aquí, "../loadtest/stub-openai.mjs"), "--port", String(PUERTO_OPENAI), "--log", resolve(salida, "openai.jsonl")], {}, resolve(salida, "openai.log"));
  }
  await sleep(1000);

  const env = {
    DATABASE_URL: `postgresql://manue@localhost/${DB}`,
    PORT: String(PUERTO_APP),
    OPENAI_API_KEY: USA_STUB ? "stub" : process.env.OPENAI_API_KEY,
    ...(USA_STUB ? { OPENAI_BASE_URL: `http://127.0.0.1:${PUERTO_OPENAI}/v1` } : {}),
    GRAPH_BASE_URL: `http://127.0.0.1:${PUERTO_GRAPH}`,
    WHATSAPP_TOKEN: "stub", WHATSAPP_APP_SECRET: APP_SECRET,
    WHATSAPP_VERIFY_TOKEN: "stub", WHATSAPP_PHONE_ID: PHONE_ID,
    SELLER_PHONE: "593999000000", ADMIN_KEY: `eval_${RUN_ID}`,
    PHASES_DEFAULT: "all", DEBOUNCE_MS: "800",
  };
  lanzar("app", "node", ["dist/index.js"], env, resolve(salida, "app.log"));
  if (!await esperarSalud()) throw new Error("el bot no arrancó — revisa app.log");
  log(`🤖 Bot arriba · modelo ${USA_STUB ? "STUB" : "REAL"} · juez ${USA_STUB ? "STUB" : MODELO_JUEZ}\n`);

  const sql = postgres(`postgresql://manue@localhost/${DB}`, { prepare: false, max: 5 });
  const resultados = [];

  for (const [indice, caso] of CASOS.entries()) {
    const phone = `59397${String(700000 + indice).padStart(6, "0")}`;
    for (const [t, turno] of caso.turnos.entries()) {
      await deliverWebhook({
        baseUrl: BASE_URL, appSecret: APP_SECRET,
        payload: buildInboundPayload({
          from: phone, name: `Eval ${indice}`, text: turno.texto,
          waMessageId: `wamid.EVAL_${RUN_ID}_${indice}_${t}`, phoneId: PHONE_ID,
        }),
      });
      await sleep(Number(env.DEBOUNCE_MS) + (USA_STUB ? 2500 : 9000));

      const [ultima] = await sql`
        select m.content from messages m join conversations c on c.id = m.conversation_id
        where c.phone = ${phone} and m.direction = 'outbound'
        order by m.created_at desc, m.id desc limit 1
      `;
      const respuesta = ultima?.content ?? "";

      // ¿Había precio/descuento/stock autorizado en ese momento? Si no lo hubo,
      // cualquier mención es invención, no criterio del evaluador.
      const [ctxReal] = await sql`
        select
          exists (select 1 from quotes q join conversations c on c.id=q.conversation_id where c.phone=${phone}) as tiene_precio,
          exists (select 1 from discount_offers d join conversations c on c.id=d.conversation_id
                  where c.phone=${phone} and d.status in ('approved','offered','accepted')) as tiene_descuento
      `;
      const contexto = {
        etapa: turno.espera.etapa ?? "nuevo",
        clienteDioMedida: turno.espera.clienteDioMedida ?? false,
        turno: t + 1,
        tienePrecioAutorizado: ctxReal.tiene_precio,
        tieneDescuentoAutorizado: ctxReal.tiene_descuento,
        tieneStock: false, // sin Contífico conectado, el bot nunca tiene stock real
      };

      const reglas = evaluarReglas(respuesta, contexto);
      const juez = await juzgar(turno.texto, respuesta);
      resultados.push({ caso: caso.id, turno: t + 1, cliente: turno.texto, respuesta, contexto, reglas, juez });
      log(`${reglas.aprueba ? "✅" : "❌"} ${caso.id} t${t + 1} — ${reglas.fallos.map((f) => f.id).join(", ") || "sin fallos"}`);
      if (respuesta) log(`   «${respuesta.slice(0, 120).replace(/\n/g, " ")}…»`);
    }
  }

  const criticas = resultados.filter((r) => r.reglas.criticas > 0);
  const altas = resultados.filter((r) => r.reglas.altas > 0);
  const notas = resultados.map((r) => r.juez).filter((j) => j && !j.error);
  const promedio = (k) => notas.length ? (notas.reduce((s, j) => s + (Number(j[k]) || 0), 0) / notas.length) : 0;

  const reporte = {
    modo: USA_STUB ? "stub" : "real",
    turnos: resultados.length,
    fallosCriticos: criticas.length,
    fallosAltos: altas.length,
    juez: notas.length
      ? { utilidad: +promedio("utilidad").toFixed(2), naturalidad: +promedio("naturalidad").toFixed(2),
          precision: +promedio("precision").toFixed(2), accion: +promedio("accion").toFixed(2) }
      : null,
    juezSinRespuesta: resultados.filter((r) => r.juez?.error).length,
    verde: criticas.length === 0 && altas.length === 0,
    resultados,
  };
  writeFileSync(resolve(salida, "reporte.json"), JSON.stringify(reporte, null, 2));

  console.log(`\n${"─".repeat(72)}`);
  if (USA_STUB) {
    console.log("⚠️  MODO STUB: esto NO dice nada sobre la calidad del bot.");
    console.log("   Las respuestas son enlatadas y el juez devuelve notas fijas.");
    console.log("   Solo comprueba que el cableado funciona. Para medir calidad:");
    console.log("   OPENAI_API_KEY=... node scripts/eval/run.mjs\n");
  }
  console.log(`CALIDAD COMERCIAL: ${reporte.verde ? "✅ VERDE" : "❌ ROJO"} · modo ${reporte.modo}`);
  console.log(`  turnos evaluados      ${reporte.turnos}`);
  console.log(`  fallos críticos       ${reporte.fallosCriticos}  (inventar precio, descuento, stock)`);
  console.log(`  fallos altos          ${reporte.fallosAltos}`);
  if (reporte.juez) console.log(`  juez (1-5)            ${JSON.stringify(reporte.juez)}`);
  if (reporte.juezSinRespuesta) console.log(`  ⚠️ el juez no respondió en ${reporte.juezSinRespuesta} turnos`);
  console.log(`${"─".repeat(72)}\n📁 ${salida}\n`);

  await sql.end();
  await admin.unsafe(`drop database if exists ${DB}`).catch(() => {});
  await admin.end();
  return reporte.verde;
}

main()
  .then((v) => { for (const p of procesos) p.kill("SIGKILL"); process.exit(v ? 0 : 1); })
  .catch((e) => { console.error("💥", e); for (const p of procesos) p.kill("SIGKILL"); process.exit(2); });
