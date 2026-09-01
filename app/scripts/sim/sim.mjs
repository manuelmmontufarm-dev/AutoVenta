#!/usr/bin/env node
/**
 * EL SIMULADOR — WhatsApp de mentira, bot de verdad.
 *
 * Probar un arreglo escribiéndole al número de Depot desde el celular tiene
 * tres problemas: le llega a un cliente real si uno se equivoca de chat, no se
 * puede repetir el caso (el stock de Contífico cambió mientras tanto), y no se
 * ve nada de lo que pasó por dentro — qué herramienta se llamó, qué dijo el
 * guardián, qué alerta se abrió.
 *
 * Esto levanta el bot ENTERO —el de `src/`, sin un solo mock dentro— contra:
 *   · una base Postgres local y desechable, con la CONFIGURACIÓN de producción
 *     copiada (prompts por etapa, beneficios, guardián, cupón, fases): si en
 *     prod el guardián está prendido, aquí también;
 *   · una Graph API de mentira que guarda las piezas en vez de mandarlas;
 *   · una FOTO del catálogo real, con el stock editable desde la pantalla.
 *
 * Lo único que es de verdad y cuesta plata son las llamadas a OpenAI: el
 * vendedor, el clasificador y el guardián son los modelos que estén
 * configurados en `.env`. Eso es a propósito — un simulador con el modelo
 * mockeado no prueba nada de lo que falla en producción.
 *
 * Uso:
 *   npm run sim
 *   npm run sim -- --copiar-conv 11061     # arranca con una conversación real
 *   npm run sim -- --catalogo-fresco       # vuelve a bajar la foto del catálogo
 *   npm run sim -- --sin-prod              # config por defecto, sin tocar prod
 */
import { createServer } from "node:http";
import { createServer as crearServidorTcp } from "node:net";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { levantarGraphSim } from "./lib/graph-sim.mjs";
import { levantarContificoSim } from "./lib/contifico-sim.mjs";
import { variablesDeProduccion } from "./lib/entorno-prod.mjs";
import { TABLAS_CONFIG } from "./lib/tablas.mjs";
import { buildInboundPayload, deliverWebhook } from "../loadtest/lib/meta.mjs";

const aquí = dirname(fileURLToPath(import.meta.url));
const raízApp = resolve(aquí, "../..");
const dirDatos = resolve(aquí, "datos");

const argv = process.argv.slice(2);
const bandera = (nombre) => argv.includes(`--${nombre}`);
const valor = (nombre, porDefecto = null) => {
  const i = argv.indexOf(`--${nombre}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : porDefecto;
};

const PUERTO_UI = Number(valor("puerto", "3210"));
const PUERTO_APP = Number(valor("puerto-bot", "3205"));
const PUERTO_GRAPH = Number(valor("puerto-graph", "4720"));
const PUERTO_CONTIFICO = Number(valor("puerto-contifico", "4721"));
const DB = valor("db", "autoventa_sim");
const APP_SECRET = "sim_app_secret";
const PHONE_ID = "SIMPHONEID";
/** Rango NO asignado en Ecuador: aunque algo se escapara, no hay a quién llamar. */
const TELEFONO_CLIENTE = valor("telefono", "593900000101");
const TELEFONO_ASESOR = "593900000900";

if (!/^[a-z_][a-z0-9_]*$/i.test(DB)) throw new Error(`--db inválida: ${DB}`);

// ─────────────────────────────────────────────────────────────────────────────
// .env del bot (sin pisar lo que ya venga del entorno)
// ─────────────────────────────────────────────────────────────────────────────
const env = entornoDelBot(resolve(raízApp, ".env"));
const claveOpenAI = claveDePruebas();

/**
 * La clave de OpenAI del simulador NO es la de Depot.
 *
 * Depot paga los tokens del bot ($80/mes + IVA + tokens). Las pruebas de
 * desarrollo son nuestras, y con una sola clave no hay forma de separarlas en
 * la factura: llegan mezcladas en el mismo consumo y terminan cobradas al
 * cliente. La separación no puede depender de acordarse — se exige acá.
 *
 * Se lee `OPENAI_API_KEY` de `app/.env.sim` (archivo aparte, ignorado por git).
 * Lo natural es que sea la clave de un PROYECTO distinto de la misma cuenta:
 * OpenAI reporta el consumo por proyecto, así que la factura queda partida
 * sola, sin llevar la cuenta a mano.
 */
function claveDePruebas() {
  // El humo no habla con OpenAI: corre contra un doble local. Exigirle una
  // clave sería pedir una credencial para no usarla, y eso deja la prueba
  // fuera del alcance de una máquina de integración continua.
  if (bandera("humo") || bandera("stub")) return "humo";
  const archivo = leerEnv(resolve(raízApp, ".env.sim"));
  const clave = process.env.OPENAI_API_KEY_SIM ?? archivo.OPENAI_API_KEY ?? archivo.OPENAI_API_KEY_SIM ?? null;
  if (clave) {
    // Con clave propia, el resto de `.env.sim` también manda: sirve para
    // probar con otro modelo sin tocar el `.env` del bot.
    Object.assign(env, archivo, { OPENAI_API_KEY: clave });
    return clave;
  }
  if (bandera("con-clave-de-produccion")) {
    if (!env.OPENAI_API_KEY) {
      console.error("Ni clave de pruebas ni OPENAI_API_KEY en app/.env.");
      process.exit(2);
    }
    console.warn("⚠️  Corriendo con la clave de PRODUCCIÓN: estos tokens le van a llegar a Depot en la factura.");
    return env.OPENAI_API_KEY;
  }
  console.error(`
  ❌  Falta la clave de OpenAI de PRUEBAS.

      El simulador gasta tokens de verdad, y con la clave de Depot esas
      pruebas terminan cobradas al cliente. Creá una clave aparte:

        1. platform.openai.com → Settings → Projects → crear «AutoVenta · pruebas»
        2. Dentro de ese proyecto: API keys → Create secret key
        3. Guardala en app/.env.sim (una línea, y ese archivo no se versiona):

             OPENAI_API_KEY=sk-proj-…

      Así el consumo de las pruebas sale separado en el panel de OpenAI y no
      hay que descontarlo a mano de la factura de Depot.

      Para saltarse esto a propósito: --con-clave-de-produccion
`);
  process.exit(2);
}

const URL_SIM = `postgresql://${process.env.PGUSER ?? process.env.USER}@localhost/${DB}`;
if (!/@localhost\/|@127\.0\.0\.1\//.test(URL_SIM)) throw new Error("El simulador solo trabaja contra Postgres local.");

const MODO_HUMO = bandera("humo");
// --stub: los mismos dobles del humo (OpenAI y Contífico de mentira, cero
// tokens) pero el simulador SE QUEDA SIRVIENDO. Es el nivel 1 del corpus
// T115: correr las 115 conversaciones de plomería sin gastar un centavo.
const MODO_STUB = bandera("stub");
const CON_DOBLES = MODO_HUMO || MODO_STUB;
const PUERTO_STUB = Number(valor("puerto-stub", "4722"));
let stubHumo = null;
let modelosAlineados = {};
let app = null;
let graph = null;
let contifico = null;
let sql = null;
let ui = null;

// ─────────────────────────────────────────────────────────────────────────────
// Arranque
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(dirDatos, { recursive: true });

  await comprobarLaClave();
  await comprobarLosPuertos();

  console.log("🧹 Base local desechable…");
  const admin = postgres(`postgresql://${process.env.PGUSER ?? process.env.USER}@localhost/postgres`, { prepare: false, max: 1 });
  await admin.unsafe(`drop database if exists ${DB}`);
  await admin.unsafe(`create database ${DB}`);
  await admin.end();

  if (!bandera("sin-build")) {
    console.log("🔨 Compilando el bot (npm run build)…");
    execFileSync("npm", ["run", "build"], { cwd: raízApp, stdio: "inherit" });
  }

  console.log("📐 Esquema…");
  execFileSync("npx", ["tsx", "src/db/migrate.ts"], {
    cwd: raízApp, stdio: "pipe",
    env: { ...env, DATABASE_URL: URL_SIM, PGSSL: "" },
  });

  sql = postgres(URL_SIM, { prepare: false, max: 5 });

  if (bandera("sin-prod")) {
    console.log("⚙️  Configuración por defecto (--sin-prod): sembrando prompts y fases…");
    execFileSync("npx", ["tsx", "src/db/seed-depot.ts"], {
      cwd: raízApp, stdio: "pipe",
      env: { ...env, DATABASE_URL: URL_SIM, PGSSL: "" },
    });
  } else {
    // Si producción no se puede leer (sin red, sin credenciales), el simulador
    // arranca igual y lo dice: mejor una copia parcial anunciada que no poder
    // probar nada.
    // Si esto falla, el simulador NO arranca.
    //
    // La primera versión seguía adelante con un aviso, y así corrió una prueba
    // entera: la copia se había roto, el bot quedó con la configuración por
    // defecto —fase 1 en vez de la de Depot, sin guardián, sin cupón— y la
    // prueba de humo igual dio casi todo verde. Un simulador que se degrada
    // solo es peor que uno que no arranca: el que no arranca se arregla, el
    // degradado se usa para decidir.
    try {
      await copiarConfiguracionDeProduccion(env.DATABASE_URL);
    } catch (error) {
      throw new Error(
        `No se pudo copiar la configuración de producción: ${error?.message ?? error}\n` +
        "   Sin ella el bot del simulador se comporta distinto al de Depot.\n" +
        "   Para correr igual con la configuración por defecto, a sabiendas: --sin-prod",
      );
    }
    await verificarLaCopia();
  }

  // CANDADO: pase lo que pase, el canal guardado en la base del simulador
  // apunta a credenciales de mentira. Copiar la configuración de producción
  // trae el token real de Meta; si alguien mañana arranca esto sin
  // GRAPH_BASE_URL, ese token no puede mandar nada porque ya no está aquí.
  await sql`
    insert into settings (key, value) values ('channel_config', ${sql.json({
      token: "sim", phoneId: PHONE_ID, verifyToken: "sim", appSecret: APP_SECRET,
    })})
    on conflict (key) do update set value = excluded.value
  `;

  // El 29-ago producción estaba apagada por una emergencia. El humo copió ese
  // interruptor y recibió el webhook, pero obedeció el apagado antes de llamar
  // al agente: cuatro checks fallaron aunque el simulador estaba sano. El humo
  // tiene que probar el recorrido completo; por eso lo encendemos SOLO en su
  // base desechable. El simulador normal conserva el estado real de Depot.
  CON_DOBLES && await encenderBotParaElHumo();

  const conv = valor("copiar-conv", null);
  if (conv) await copiarConversacion(env.DATABASE_URL, Number(conv));

  console.log("📞 Graph API de mentira…");
  graph = await levantarGraphSim({ puerto: PUERTO_GRAPH, dirPiezas: resolve(dirDatos, "piezas") });

  if (CON_DOBLES) {
    const stub = await import("../eval/lib/stub-eval.mjs");
    stubHumo = await stub.levantar({ port: PUERTO_STUB });
    console.log(`🚬 Modo humo: OpenAI y Contífico de mentira en :${PUERTO_STUB} (cero tokens)`);
  }

  console.log("📦 Catálogo…");
  contifico = await levantarContificoSim({
    puerto: PUERTO_CONTIFICO,
    snapshot: resolve(dirDatos, "catalogo.json"),
    apiKey: env.CONTIFICO_API_KEY ?? null,
    urlReal: env.CONTIFICO_BASE_URL ?? "https://api.contifico.com/sistema/api/v2",
    refrescar: bandera("catalogo-fresco"),
  });

  modelosAlineados = bandera("sin-alinear") ? {} : await copiarConfiguracionDelServicio(env.DATABASE_URL);

  if (valor("debounce", null)) {
    console.warn(`⚠️  Debounce en ${valor("debounce")} ms (producción usa ${env.DEBOUNCE_MS ?? 12000}): los mensajes seguidos se van a agrupar distinto.`);
  }

  console.log("🤖 Levantando el bot…");
  app = spawn("node", ["dist/index.js"], {
    cwd: raízApp,
    env: {
      ...env,
      ...modelosAlineados,
      DATABASE_URL: URL_SIM,
      PGSSL: "",
      PORT: String(PUERTO_APP),
      OPENAI_API_KEY: claveOpenAI,
      GRAPH_BASE_URL: `http://127.0.0.1:${PUERTO_GRAPH}`,
      CONTIFICO_BASE_URL: CON_DOBLES
        ? `http://127.0.0.1:${PUERTO_STUB}/contifico`
        : `http://127.0.0.1:${PUERTO_CONTIFICO}`,
      ...(CON_DOBLES ? { OPENAI_BASE_URL: `http://127.0.0.1:${PUERTO_STUB}/v1` } : {}),
      // El checkpoint MINI del T115 fuerza modelos SIN perder las banderas de
      // producción: la alineación con Railway corre igual y solo los modelos
      // nombrados aquí se pisan al final. JSON: {"OPENAI_MODEL":"gpt-5.4-mini"}.
      ...(process.env.SIM_MODELOS_FORZADOS ? JSON.parse(process.env.SIM_MODELOS_FORZADOS) : {}),
      // Que el stock que se fuerza desde la pantalla entre en segundos.
      CONTIFICO_CATALOG_SYNC_INTERVAL_MS: "8000",
      WHATSAPP_TOKEN: "sim",
      WHATSAPP_APP_SECRET: APP_SECRET,
      WHATSAPP_VERIFY_TOKEN: "sim",
      WHATSAPP_PHONE_ID: PHONE_ID,
      SELLER_PHONE: TELEFONO_ASESOR,
      ADMIN_KEY: "sim",
      // OJO: ni PHASES_DEFAULT ni DEBOUNCE_MS se fuerzan.
      //
      // Las fases salen de `settings.phase_config`, que se copió de producción;
      // poner "all" acá solo cambiaría algo si allá NO hubiera registro — y
      // entonces el simulador tendría herramientas que el cliente no tiene.
      //
      // El debounce agrupa los mensajes seguidos del cliente en UN turno. En
      // producción son 12 s; acortarlo hace que tres mensajes rápidos se
      // contesten como tres turnos, que es otro comportamiento. Se puede
      // acortar a propósito con --debounce, y se avisa.
      ...(valor("debounce", null) ? { DEBOUNCE_MS: valor("debounce") } : {}),
      // El Interbot es una integración externa viva; en el simulador el precio
      // sale de la foto del catálogo, que es reproducible.
      INTERBOT_USERNAME: "",
      INTERBOT_PASSWORD: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const registroBot = [];
  const anotar = (linea) => {
    registroBot.push({ en: new Date().toISOString(), linea });
    if (registroBot.length > 800) registroBot.shift();
    if (bandera("verboso")) process.stdout.write(`   │ ${linea}\n`);
  };
  app.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(anotar));
  app.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(anotar));

  // Si el proceso del bot se cae, no tiene sentido seguir esperando un
  // `/health` que podría estar contestando otro. `esperarSalud` mira las dos
  // cosas: que el puerto responda y que NUESTRO hijo siga vivo.
  let botMurio = null;
  app.once("exit", (code, señal) => { botMurio = señal ?? `código ${code}`; });

  if (!(await esperarSalud(() => botMurio))) {
    const cola = registroBot.slice(-12).map((l) => `      ${l.linea}`).join("\n");
    throw new Error(
      (botMurio ? `el bot se murió al arrancar (${botMurio})` : "el bot no arrancó a tiempo") +
      `\n${cola}`,
    );
  }
  const items = await esperarCatalogo();
  console.log(`📋 Catálogo cargado en el bot: ${items} llantas`);

  ui = await levantarUI({ registroBot });

  if (MODO_HUMO) return pruebaDeHumo();

  console.log(`\n  ✅  Simulador listo → http://localhost:${PUERTO_UI}\n`);
  console.log(`      cliente ${TELEFONO_CLIENTE} · base ${DB} · piezas en scripts/sim/datos/piezas`);
  console.log("      Ctrl-C para cerrar (la base se borra sola).\n");
}

async function encenderBotParaElHumo() {
  await sql`
    insert into settings (key, value) values (
      'bot_power',
      ${sql.json({ activo: true, apagadoAt: null, motivo: "Prueba de humo" })}
    )
    on conflict (key) do update set value = excluded.value
  `;
}

/**
 * Que los puertos estén libres ANTES de arrancar.
 *
 * Sin esto, un simulador de una corrida anterior que quedó vivo se roba el
 * papel: el bot nuevo muere con EADDRINUSE, `/health` responde igual —lo
 * contesta el VIEJO, enganchado a una base que ya se borró— y el simulador
 * anuncia «listo». Después los mensajes entran a un bot fantasma y en pantalla
 * no pasa nada. Medido el 26-ago: media conversación tirada al vacío antes de
 * entender que el proceso que contestaba no era el que se acababa de compilar.
 */
async function comprobarLosPuertos() {
  const puertos = [
    [PUERTO_UI, "la pantalla"],
    [PUERTO_APP, "el bot"],
    [PUERTO_GRAPH, "la Graph de mentira"],
    [PUERTO_CONTIFICO, "el catálogo"],
    ...(CON_DOBLES ? [[PUERTO_STUB, "el doble de OpenAI"]] : []),
  ];
  const ocupados = [];
  for (const [puerto, quién] of puertos) {
    if (await estáOcupado(puerto)) ocupados.push(`${puerto} (${quién})`);
  }
  if (ocupados.length) {
    throw new Error(
      `Estos puertos ya están ocupados: ${ocupados.join(", ")}.\n` +
      "   Lo más probable es que haya otro simulador corriendo. Cerralo con Ctrl-C, o:\n" +
      "     pkill -f scripts/sim/sim.mjs\n" +
      "   (o corré este con --puerto / --puerto-bot para no chocar).",
    );
  }
}

function estáOcupado(puerto) {
  return new Promise((ok) => {
    const prueba = crearServidorTcp();
    prueba.once("error", () => ok(true));
    prueba.once("listening", () => prueba.close(() => ok(false)));
    prueba.listen(puerto, "127.0.0.1");
  });
}

/**
 * Que la clave sirva ANTES de montar todo.
 *
 * Sin esto, una clave mal pegada se descubre dos minutos después —base creada,
 * catálogo cargado, bot arriba— y en forma de silencio: el turno se cae dentro
 * del agente y en la pantalla parece que el bot no contesta. `GET /v1/models`
 * no gasta tokens y responde en un segundo.
 */
async function comprobarLaClave() {
  if (CON_DOBLES) return;
  try {
    const base = (env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const r = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${claveOpenAI}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 401) {
      throw new Error("OpenAI la rechazó (401). Revisá que esté completa y sin espacios en app/.env.sim");
    }
    if (!r.ok) throw new Error(`OpenAI respondió HTTP ${r.status}`);
    console.log("🔑 Clave de OpenAI verificada.");
  } catch (error) {
    if (error?.name === "TimeoutError") {
      console.warn("⚠️  No se pudo verificar la clave (OpenAI no respondió a tiempo). Se sigue igual.");
      return;
    }
    throw new Error(`La clave de OpenAI no sirve: ${error?.message ?? error}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Copias desde producción (solo lectura)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Las columnas jsonb, por tabla.
 *
 * postgres.js infiere el tipo del valor de JavaScript, y un jsonb con `true`
 * adentro vuelve como boolean: al insertarlo manda un boolean contra una
 * columna jsonb y Postgres lo rechaza. Con la lista de columnas se vuelve a
 * envolver en `sql.json` lo que salió de jsonb, y solo eso.
 */
async function columnasJson(tabla) {
  const filas = await sql`
    select column_name from information_schema.columns
    where table_schema='public' and table_name=${tabla} and data_type in ('json','jsonb')
  `;
  return new Set(filas.map((f) => f.column_name));
}

const paraInsertar = (fila, json) =>
  Object.fromEntries(Object.entries(fila).map(([k, v]) =>
    [k, json.has(k) && v !== null ? sql.json(v) : v]));

async function copiarConfiguracionDeProduccion(urlProd) {
  if (!urlProd) {
    console.warn("⚠️  Sin DATABASE_URL en .env: no se puede copiar la configuración de producción.");
    return;
  }
  console.log("⚙️  Copiando la configuración de producción (solo lectura)…");
  const prod = postgres(urlProd, {
    prepare: false, max: 1, ssl: "prefer",
    connection: { options: "-c default_transaction_read_only=on" },
  });
  try {
    for (const tabla of TABLAS_CONFIG) {
      const filas = await prod`select * from ${prod(tabla)}`.catch(() => null);
      if (!filas) { console.warn(`   · ${tabla}: no existe allá, se salta`); continue; }
      if (!filas.length) { console.log(`   · ${tabla}: vacía`); continue; }
      const json = await columnasJson(tabla);
      await sql`delete from ${sql(tabla)}`;
      for (const fila of filas) await sql`insert into ${sql(tabla)} ${sql(paraInsertar(fila, json))}`;
      console.log(`   · ${tabla}: ${filas.length}`);
    }
  } finally {
    await prod.end();
  }
}

/**
 * ¿La copia dejó de verdad la configuración que hace al bot ser el de Depot?
 *
 * Contar filas no alcanza: lo que importa es que estén las llaves que cambian
 * el comportamiento. Si el guardián o las fases no llegaron, el simulador
 * responde igual de rápido y de convincente, pero es otro bot.
 */
const AJUSTES_QUE_IMPORTAN = ["guardian_config", "ai_config", "pieces_config", "store_hours"];

async function verificarLaCopia() {
  const faltan = [];
  for (const clave of AJUSTES_QUE_IMPORTAN) {
    const [fila] = await sql`select 1 as hay from settings where key=${clave}`;
    if (!fila) faltan.push(clave);
  }
  const [prompts] = await sql`select count(*)::int as n from stage_prompt_versions`;
  if (prompts.n === 0) faltan.push("stage_prompt_versions (los prompts por etapa)");
  if (faltan.length) {
    throw new Error(`La copia de producción quedó incompleta: falta ${faltan.join(", ")}.`);
  }
}

/** Trae una conversación real para poder seguirla desde donde se cortó. */
async function copiarConversacion(urlProd, id) {
  if (!urlProd) throw new Error("--copiar-conv necesita la DATABASE_URL de producción en .env");
  console.log(`💬 Copiando la conversación ${id} de producción…`);
  const prod = postgres(urlProd, {
    prepare: false, max: 1, ssl: "prefer",
    connection: { options: "-c default_transaction_read_only=on" },
  });
  try {
    const [conv] = await prod`select * from conversations where id=${id}`;
    if (!conv) throw new Error(`la conversación ${id} no existe en producción`);
    const mensajes = await prod`select * from messages where conversation_id=${id} order by created_at`;
    const cotizaciones = await prod`select * from quotes where conversation_id=${id} order by created_at`;

    const [jsonConv, jsonMsg, jsonQuote] = await Promise.all([
      columnasJson("conversations"), columnasJson("messages"), columnasJson("quotes"),
    ]);
    const { id: _viejo, phone: _tel, ...resto } = conv;
    const [nueva] = await sql`
      insert into conversations ${sql(paraInsertar({ ...resto, phone: TELEFONO_CLIENTE }, jsonConv))} returning id
    `;
    for (const m of mensajes) {
      const { id: _mid, conversation_id: _cid, ...campos } = m;
      await sql`insert into messages ${sql(paraInsertar({ ...campos, conversation_id: nueva.id }, jsonMsg))}`;
    }
    for (const q of cotizaciones) {
      const { id: _qid, conversation_id: _qcid, ...campos } = q;
      await sql`insert into quotes ${sql(paraInsertar({ ...campos, conversation_id: nueva.id }, jsonQuote))}`.catch(() => {});
    }
    console.log(`   · ${mensajes.length} mensajes y ${cotizaciones.length} cotizaciones → conversación ${nueva.id}`);
  } finally {
    await prod.end();
  }
}

/**
 * Que el simulador corra con la MISMA configuración que producción.
 *
 * Dos fuentes, en orden de fidelidad:
 *
 *  1. Las variables del servicio en Railway (`lib/entorno-prod.mjs`). Es la
 *     verdad: no solo los modelos, también los interruptores que cambian el
 *     comportamiento — `AI_COMPACT_PROMPT_ENABLED` reemplaza el prompt entero
 *     del vendedor, `AI_HISTORY_LIMIT` decide cuánta conversación ve.
 *
 *  2. Si el CLI de Railway no está a mano, se deduce de `ai_runs`: cada turno
 *     de producción deja escrito qué modelo atendió qué ruta. Da los modelos,
 *     pero NO los interruptores — así que se dice en voz alta que la copia es
 *     parcial, en vez de simular fidelidad que no se tiene.
 */
const RUTA_A_VARIABLE = {
  commercial: "OPENAI_MODEL",
  routine_stage: "OPENAI_ROUTINE_MODEL",
  guardian: "OPENAI_GUARDIAN_MODEL",
  post_turn_stage: "OPENAI_CLASSIFIER_MODEL",
};

async function copiarConfiguracionDelServicio(urlProd) {
  const desdeRailway = variablesDeProduccion({
    entorno: valor("entorno-prod", "Depot_Tire"),
    servicio: valor("servicio-prod", "AutoVenta"),
  });

  if (desdeRailway.ok) {
    console.log("🎯 Configuración del servicio de producción (Railway):");
    for (const [clave, val] of Object.entries(desdeRailway.variables).sort()) {
      const local = env[clave];
      const igual = local === val;
      console.log(`   · ${clave.padEnd(34)} ${val}${igual ? "  ✓" : `  ← se alinea (acá había ${local ?? "nada"})`}`);
    }
    if (desdeRailway.deriva.length) {
      console.warn(`   ⚠️  Variables nuevas en producción que el simulador no sabe si copiar: ${desdeRailway.deriva.join(", ")}`);
      console.warn("      Si alguna cambia el comportamiento del bot, agregala a LISTA_BLANCA en lib/entorno-prod.mjs.");
    }
    return aplicarForzadosDeCanary(desdeRailway.variables);
  }

  console.warn(`⚠️  No se pudieron leer las variables de Railway (${desdeRailway.motivo}).`);
  console.warn("   Se deducen los MODELOS de ai_runs; los interruptores (AI_*) quedan como en .env.");
  return aplicarForzadosDeCanary(await modelosSegunAiRuns(urlProd));
}

function aplicarForzadosDeCanary(base) {
  const forzadoExacto = valor("exact-tool-model", null);
  if (!forzadoExacto) return base;
  return { ...base, OPENAI_EXACT_TOOL_MODEL: forzadoExacto, AI_EXACT_TOOL_ROLLOUT: valor("rollout", "100") };
}

async function modelosSegunAiRuns(urlProd) {
  if (!urlProd) return {};
  const prod = postgres(urlProd, {
    prepare: false, max: 1, ssl: "prefer",
    connection: { options: "-c default_transaction_read_only=on" },
  });
  try {
    const filas = await prod`
      select route, model, count(*)::int as n
      from ai_runs
      where created_at > now() - interval '48 hours' and error is null
      group by route, model order by n desc
    `;
    if (!filas.length) {
      console.warn("⚠️  Producción no tuvo turnos en 48 h: los modelos quedan como en .env");
      return {};
    }
    const mejorPorRuta = new Map();
    for (const f of filas) if (!mejorPorRuta.has(f.route)) mejorPorRuta.set(f.route, f);

    const alineado = {};
    for (const [ruta, variable] of Object.entries(RUTA_A_VARIABLE)) {
      const enProd = mejorPorRuta.get(ruta);
      if (!enProd) continue;
      const local = env[variable] ?? env.OPENAI_MODEL ?? "(sin definir)";
      alineado[variable] = enProd.model;
      console.log(`   · ${ruta.padEnd(16)} prod ${enProd.model}${local === enProd.model ? "  ✓" : `  ← se alinea (acá había ${local})`}`);
    }
    return alineado;
  } catch (error) {
    console.warn(`⚠️  No se pudo leer ai_runs (${error?.message ?? error}); manda .env`);
    return {};
  } finally {
    await prod.end();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// La pantalla
// ─────────────────────────────────────────────────────────────────────────────
async function levantarUI({ registroBot }) {
  const html = () => readFileSync(resolve(aquí, "ui/index.html"), "utf8");

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PUERTO_UI}`);
    try {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(html());
      }

      if (url.pathname === "/api/estado") {
        const desde = Number(url.searchParams.get("desde") ?? "0");
        return json(res, 200, await estado(desde, registroBot));
      }

      if (url.pathname === "/api/enviar" && req.method === "POST") {
        const { texto, adjunto, ubicacion, boton } = await cuerpoJson(req);
        if (!String(texto ?? "").trim() && !adjunto && !ubicacion && !boton?.id) {
          return json(res, 400, { error: "no hay nada que mandar" });
        }
        const r = await deliverWebhook({
          baseUrl: `http://127.0.0.1:${PUERTO_APP}`,
          appSecret: APP_SECRET,
          payload: payloadEntrante({ texto, adjunto, ubicacion, boton }),
        });
        return json(res, 200, { ok: r.status === 200, status: r.status, ackMs: Math.round(r.ackMs), error: r.error ?? null });
      }

      if (url.pathname.startsWith("/api/pieza/")) {
        const pieza = graph.piezaDe(decodeURIComponent(url.pathname.slice("/api/pieza/".length)));
        if (!pieza) return json(res, 404, { error: "pieza desconocida" });
        res.writeHead(200, { "Content-Type": pieza.mime, "Cache-Control": "no-store" });
        return res.end(pieza.bytes);
      }

      if (url.pathname === "/api/catalogo") {
        return json(res, 200, contifico.buscar(url.searchParams.get("q") ?? ""));
      }

      if (url.pathname === "/api/stock" && req.method === "POST") {
        const { codigo, cantidad } = await cuerpoJson(req);
        contifico.forzarStock(String(codigo), cantidad === null || cantidad === "" ? null : Number(cantidad));
        return json(res, 200, { ok: true, forzados: contifico.forzados(), aviso: "el bot lo toma en ≤8 s (resync del catálogo)" });
      }

      if (url.pathname === "/api/reiniciar" && req.method === "POST") {
        // Conversación nueva de cero: se borra el hilo, no la configuración.
        await sql`delete from conversations where phone=${TELEFONO_CLIENTE}`;
        graph.reset();
        return json(res, 200, { ok: true });
      }

      return json(res, 404, { error: "ruta desconocida" });
    } catch (error) {
      return json(res, 500, { error: String(error?.message ?? error) });
    }
  });

  await new Promise((ok) => server.listen(PUERTO_UI, "127.0.0.1", ok));
  return server;
}

/**
 * El webhook entrante, con la forma exacta que manda Meta.
 *
 * El texto reusa el generador de la prueba de carga; la foto, el audio y la
 * ubicación se arman acá porque aquel solo sabe de texto.
 *
 * La foto y el audio NO se falsean: los bytes quedan registrados en la Graph
 * de mentira y el bot los baja con su `downloadMedia` de siempre, así que la
 * visión y la transcripción corren de verdad sobre lo que se adjuntó. Sin eso,
 * media conversación de Depot —la que empieza con la foto del costado— no se
 * podría probar acá.
 */
function payloadEntrante({ texto, adjunto, ubicacion, boton }) {
  const base = buildInboundPayload({
    from: TELEFONO_CLIENTE,
    name: valor("nombre", "Cliente Sim"),
    text: String(texto ?? ""),
    waMessageId: `wamid.SIM_IN_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    phoneId: PHONE_ID,
  });
  const mensaje = base.entry[0].changes[0].value.messages[0];

  // Tocar un botón NO es escribir su título: Meta manda un `interactive` con el
  // id exacto, y el bot lo traduce con `textoDeBoton`. El simulador arma ese
  // mismo payload para que se pruebe el camino de verdad y no un atajo — si
  // aquí se mandara texto, el `case "interactive"` de index.ts no se probaría
  // nunca y el error aparecería recién en el teléfono del cliente.
  if (boton?.id) {
    delete mensaje.text;
    mensaje.type = "interactive";
    mensaje.interactive = {
      type: "button_reply",
      button_reply: { id: String(boton.id), title: String(boton.titulo ?? "") },
    };
    return base;
  }

  if (ubicacion) {
    delete mensaje.text;
    mensaje.type = "location";
    mensaje.location = { latitude: Number(ubicacion.lat), longitude: Number(ubicacion.lng) };
    return base;
  }

  if (adjunto?.base64) {
    const bytes = Buffer.from(adjunto.base64, "base64");
    const mime = adjunto.mime || "application/octet-stream";
    const mediaId = graph.registrarEntrante(bytes, mime);
    delete mensaje.text;
    if (mime.startsWith("audio/")) {
      mensaje.type = "audio";
      mensaje.audio = { id: mediaId, mime_type: mime };
    } else {
      mensaje.type = "image";
      mensaje.image = { id: mediaId, mime_type: mime, ...(texto ? { caption: String(texto) } : {}) };
    }
    return base;
  }

  return base;
}

/** Todo lo que la pantalla necesita para pintarse: el chat y los rayos X. */
async function estado(desde, registroBot) {
  const salientes = graph.desde(desde);
  const [conv] = await sql`
    select id, phone, name, status, stage, current_cycle, tire_size, vehicle,
           selected_quantity, selected_product_code, nearest_store, customer_commitment
    from conversations where phone=${TELEFONO_CLIENTE} order by id desc limit 1
  `;
  if (!conv) {
    return { cliente: TELEFONO_CLIENTE, salientes, conv: null, entrantes: [], corridas: [], guardian: [], alertas: [], cotizaciones: [], registro: registroBot.slice(-40) };
  }
  const [entrantes, corridas, guardian, alertas, cotizaciones] = await Promise.all([
    sql`select id, content, created_at from messages
        where conversation_id=${conv.id} and direction='inbound' order by created_at`,
    sql`select model, route, tools, iterations, input_tokens, output_tokens, latency_ms, error, created_at
        from ai_runs where conversation_id=${conv.id} order by created_at desc limit 12`,
    sql`select verdict, findings, original_text, corrected_text, latency_ms, created_at
        from guardian_reviews where conversation_id=${conv.id} order by created_at desc limit 12`,
    sql`select type, priority, summary, exact_reason, created_at
        from bot_alerts where conversation_id=${conv.id} order by created_at desc limit 12`,
    sql`select quote_number, total, items, created_at
        from quotes where conversation_id=${conv.id} order by created_at desc limit 5`,
  ]);
  return {
    cliente: TELEFONO_CLIENTE,
    salientes, conv, entrantes, corridas, guardian, alertas, cotizaciones,
    forzados: contifico.forzados(),
    registro: registroBot.slice(-40),
  };
}

/**
 * PRUEBA DE HUMO — ¿el simulador todavía sirve?
 *
 * Levanta todo, le manda un mensaje al bot y comprueba que el turno completo
 * ocurrió: que contestó, que la respuesta salió por la Graph, que el guardián
 * la revisó y que ningún turno se cayó. Contra un doble local de OpenAI, así
 * que no gasta un centavo y corre en cualquier máquina.
 *
 * Es lo que hay que ejecutar después de tocar producción: la prueba de deriva
 * (`test/simuladorFidelidad.test.ts`) avisa si el simulador se quedó atrás en
 * configuración; esta avisa si directamente dejó de andar.
 *
 * Sale con código 1 si algo falló, para que sirva en integración continua.
 */
async function pruebaDeHumo() {
  console.log("\n🚬 Prueba de humo…\n");
  const fallos = [];
  const revisar = (bien, qué) => {
    console.log(`   ${bien ? "✅" : "❌"} ${qué}`);
    if (!bien) fallos.push(qué);
  };

  const entrega = await deliverWebhook({
    baseUrl: `http://127.0.0.1:${PUERTO_APP}`,
    appSecret: APP_SECRET,
    payload: payloadEntrante({ texto: "Buenas, necesito llantas 195/65R15" }),
  });
  revisar(entrega.status === 200, `el webhook firmado entra (HTTP ${entrega.status})`);

  // El turno tarda: el debounce agrupa, el agente da vueltas y las piezas se
  // renderizan. Se espera a que aparezca algo y luego a que deje de aparecer.
  let quieto = 0;
  for (let i = 0; i < 90 && quieto < 6; i += 1) {
    await new Promise((ok) => setTimeout(ok, 1000));
    const antes = graph.enviados().length;
    await new Promise((ok) => setTimeout(ok, 500));
    quieto = graph.enviados().length === antes && antes > 0 ? quieto + 1 : 0;
  }

  const alCliente = graph.enviados().filter((e) => e.para === TELEFONO_CLIENTE);
  // `interactive` cuenta como respuesta: desde los botones, el turno que cierra
  // con una pregunta cerrada (la escalera, el local, el día) sale como
  // interactivo y no como texto. Contando solo `text`, el humo daba al bot por
  // mudo justo cuando había contestado bien.
  const textos = alCliente.filter((e) => e.tipo === "text" || e.tipo === "interactive");
  revisar(textos.length > 0, `el bot le contestó al cliente (${textos.length} mensajes al cliente)`);

  const [ajustes] = await sql`select count(*)::int as n from settings where key = any(${AJUSTES_QUE_IMPORTAN})`;
  revisar(
    bandera("sin-prod") || ajustes.n === AJUSTES_QUE_IMPORTAN.length,
    `la configuración de Depot está puesta (${ajustes.n}/${AJUSTES_QUE_IMPORTAN.length} ajustes)`,
  );

  const [conv] = await sql`select id, stage from conversations where phone=${TELEFONO_CLIENTE}`;
  revisar(Boolean(conv), "la conversación quedó registrada en la base");

  if (conv) {
    const corridas = await sql`select route, model, error from ai_runs where conversation_id=${conv.id}`;
    revisar(corridas.length > 0, `el agente corrió (${corridas.length} llamadas al modelo)`);
    revisar(!corridas.some((r) => r.error), "ningún turno se cayó");
    const revisiones = await sql`select verdict from guardian_reviews where conversation_id=${conv.id}`;
    revisar(revisiones.length > 0, `el guardián revisó la respuesta (${revisiones.length} revisiones)`);
    const guardados = await sql`
      select count(*)::int as n from messages where conversation_id=${conv.id} and direction='outbound'
    `;
    revisar(guardados[0].n > 0, "los mensajes quedaron guardados como en producción");
  }

  if (textos.length) console.log(`\n   El bot dijo: «${(textos[0].texto ?? "").slice(0, 120)}…»`);
  console.log(`\n${fallos.length ? `❌ ${fallos.length} fallo(s)` : "✅ El simulador funciona"}\n`);
  await cerrar(fallos.length ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────
/**
 * El entorno con el que corre el bot dentro del simulador.
 *
 * Manda lo que ya esté exportado en la terminal (así `railway run npm run sim`
 * corre con las variables REALES del servicio) y `.env` rellena lo que falte.
 *
 * Con una excepción que no es negociable: `OPENAI_BASE_URL`. El SDK de OpenAI
 * la lee solo, y si en la terminal hay un proxy —cualquiera— el bot le habla a
 * ese proxy y no a OpenAI. Medido: la primera corrida de este simulador salió
 * contra un proxy local heredado del shell y las respuestas NO eran del modelo
 * configurado. Un simulador que miente sobre quién contestó no sirve para
 * nada, así que la variable se borra salvo que se pida a mano.
 */
function heredadaProhibida(clave) {
  return clave === "OPENAI_BASE_URL" || clave === "OPENAI_ORG_ID"
    || clave.startsWith("CLAUDE") || clave.startsWith("ANTHROPIC");
}

function entornoDelBot(ruta) {
  const archivo = leerEnv(ruta);
  const heredado = Object.fromEntries(
    Object.entries(process.env).filter(([k, v]) => v !== undefined && !heredadaProhibida(k)),
  );
  const mezcla = { ...archivo, ...heredado };
  const forzada = valor("openai-base-url", null);
  if (forzada) mezcla.OPENAI_BASE_URL = forzada;
  else delete mezcla.OPENAI_BASE_URL;
  return mezcla;
}

function leerEnv(ruta) {
  if (!existsSync(ruta)) return {};
  const salida = {};
  for (const línea of readFileSync(ruta, "utf8").split("\n")) {
    const limpia = línea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const i = limpia.indexOf("=");
    if (i < 0) continue;
    salida[limpia.slice(0, i).trim()] = limpia.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return salida;
}

async function esperarSalud(murió = () => null) {
  for (let i = 0; i < 60; i += 1) {
    if (murió()) return false;
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO_APP}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch { /* todavía no */ }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  return false;
}

/** El catálogo sincroniza DESPUÉS de que /health responde; sin esperarlo, el primer turno sale en frío. */
async function esperarCatalogo() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO_APP}/api/catalog/status`, {
        headers: { "x-admin-key": "sim" }, signal: AbortSignal.timeout(2000),
      });
      if (r.ok) {
        const d = await r.json();
        // La respuesta viene envuelta: { ok, catalog: { items, … } }.
        const items = Number(d?.catalog?.items ?? d?.items ?? 0);
        if (items > 0) return items;
      }
    } catch { /* todavía no */ }
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  return 0;
}

function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

function cuerpoJson(req) {
  return new Promise((ok, fail) => {
    let crudo = "";
    req.on("data", (t) => { crudo += t; });
    req.on("end", () => { try { ok(JSON.parse(crudo || "{}")); } catch (e) { fail(e); } });
    req.on("error", fail);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cierre limpio
// ─────────────────────────────────────────────────────────────────────────────
let cerrando = false;
async function cerrar(code = 0) {
  if (cerrando) return;
  cerrando = true;
  console.log("\n🧹 Cerrando…");
  try { app?.kill("SIGTERM"); } catch { /* ya estaba muerto */ }
  try { ui?.close(); } catch { /* ya estaba cerrado */ }
  await graph?.cerrar().catch(() => {});
  try { stubHumo?.close?.(); } catch { /* ya estaba cerrado */ }
  await contifico?.cerrar().catch(() => {});
  await sql?.end({ timeout: 3 }).catch(() => {});
  if (!bandera("conservar-db")) {
    try {
      const admin = postgres(`postgresql://${process.env.PGUSER ?? process.env.USER}@localhost/postgres`, { prepare: false, max: 1 });
      await admin.unsafe(`drop database if exists ${DB}`);
      await admin.end();
    } catch { /* que no impida salir */ }
  }
  try { rmSync(resolve(dirDatos, "piezas"), { recursive: true, force: true }); } catch { /* da igual */ }
  process.exit(code);
}

for (const señal of ["SIGINT", "SIGTERM"]) process.once(señal, () => cerrar(0));

main().catch(async (error) => {
  console.error(`\n❌ ${error?.message ?? error}`);
  await cerrar(1);
});
