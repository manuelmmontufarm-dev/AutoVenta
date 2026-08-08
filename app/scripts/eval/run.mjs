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
    // Ticket 2150 (8-ago): el cliente pidió cotización sin dar medida, ni aro,
    // ni vehículo, y el bot le contestó tres turnos seguidos que le mandara la
    // foto del costado, sin ofrecer nada. El dueño terminó mandando las opciones
    // de rin 13 a mano.
    //
    // Los tres turnos son el punto: el primero puede pedir el dato, pero para el
    // TERCERO el cliente ya pidió opciones dos veces sin darlo, y ahí
    // `opciones_sin_medida` obliga a mostrarle stock real e invitarlo al local.
    // Un turno que solo vuelve a pedir la foto reprueba en `pide_sin_ofrecer`.
    id: "pide_cotizacion_sin_nada",
    turnos: [
      { texto: "Buenas, necesito una cotización de llantas", espera: { etapa: "nuevo", clienteDioMedida: false } },
      { texto: "Xfavor ya le envío y q me ayude con una cotización", espera: { clienteDioMedida: false } },
      { texto: "no sé cuál es, solo deme las opciones que tengan porfa", espera: { clienteDioMedida: false } },
    ],
  },
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

/**
 * Espera a que el catálogo termine de sincronizar y dice si quedó con stock.
 *
 * `esperarSalud` solo prueba que el puerto responde; el catálogo entra después,
 * por su cuenta. Sin esta espera el primer caso corría contra un bot sin nada
 * que ofrecer y salía vacío — un fallo del arnés que se leía como fallo del bot.
 */
async function esperarCatalogo() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const d = await (await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) })).json();
      const items = Number(d?.catalog?.items ?? 0);
      if (items > 0) {
        log(`📚 Catálogo listo: ${items} ítems (${d?.catalog?.source ?? "sin fuente"})\n`);
        return true;
      }
    } catch { /* sigue arrancando */ }
    await sleep(1500);
  }
  log("📚 Sin catálogo: el bot no podrá ofrecer llantas reales (¿faltan credenciales de Contífico?)\n");
  return false;
}

/**
 * Espera a que el bot termine de hablar en este turno.
 *
 * Dos fases: primero que diga ALGO (hasta `techo`), y después que se quede
 * callado un rato (`silencio`), porque contesta en varios bloques con pausas
 * entre ellos y cortar al primero partiría la respuesta a la mitad.
 */
async function esperarRespuesta(sql, phone, desdeId, stub) {
  const techo = stub ? 15_000 : 75_000;
  const silencio = stub ? 1_500 : 6_000;
  const paso = 750;
  let esperado = 0;
  let ultimoConteo = 0;
  let quieto = 0;

  while (esperado < techo) {
    await sleep(paso);
    esperado += paso;
    const [{ n }] = await sql`
      select count(*)::int as n from messages m join conversations c on c.id = m.conversation_id
      where c.phone = ${phone} and m.direction = 'outbound' and m.id > ${desdeId}
    `;
    if (n !== ultimoConteo) { ultimoConteo = n; quieto = 0; continue; }
    if (n > 0) {
      quieto += paso;
      if (quieto >= silencio) return;
    }
  }
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

  // ¿El bot arrancó con catálogo de verdad? Cambia lo que se le puede reprochar:
  // con stock real, decir que hay disponibilidad no es inventar. Corriendo con
  // `railway run` las credenciales de Contífico llegan y esto da true; con un
  // `OPENAI_API_KEY=...` pelado, false.
  //
  // Hay que ESPERARLO: /health responde en cuanto el puerto está arriba, pero el
  // catálogo sincroniza aparte y tarda. Medirlo de una daba 0 ítems mientras el
  // app.log decía «368 llantas», y de paso el primer caso arrancaba en frío y se
  // quedaba sin respuesta.
  const catalogoConItems = await esperarCatalogo();

  for (const [indice, caso] of CASOS.entries()) {
    const phone = `59397${String(700000 + indice).padStart(6, "0")}`;
    // Marca de agua para leer lo que salió en cada turno: cada caso arranca en 0
    // porque es una conversación nueva.
    let ultimoIdVisto = 0;
    for (const [t, turno] of caso.turnos.entries()) {
      await deliverWebhook({
        baseUrl: BASE_URL, appSecret: APP_SECRET,
        payload: buildInboundPayload({
          from: phone, name: `Eval ${indice}`, text: turno.texto,
          waMessageId: `wamid.EVAL_${RUN_ID}_${indice}_${t}`, phoneId: PHONE_ID,
        }),
      });
      // Espera adaptativa en vez de dormir un rato fijo. Un turno que solo
      // contesta texto tarda segundos; uno que renderiza y manda una pieza tarda
      // bastante más, y con los 9 s fijos el eval leía ANTES de que el bot
      // hablara y anotaba «vacio» — un fallo del arnés que se leía como mudez
      // del bot. Se espera a que aparezca algo y luego a que deje de aparecer.
      await esperarRespuesta(sql, phone, ultimoIdVisto, USA_STUB);

      // TODO lo que el bot dijo en ESTE turno, no solo el último mensaje.
      //
      // El bot contesta en varios bloques separados por '---', y cada bloque sale
      // como un mensaje aparte. Leer solo el último hacía que la rúbrica calificara
      // la coletilla —«¿Necesita alguna recomendación?»— en vez de la respuesta:
      // reglas como `sin_pregunta`, `demasiado_largo` o `no_pide_medida` estaban
      // juzgando un fragmento, y varios turnos salían «sin fallos» por eso.
      const salientes = await sql`
        select m.id, m.content, m.type from messages m join conversations c on c.id = m.conversation_id
        where c.phone = ${phone} and m.direction = 'outbound' and m.id > ${ultimoIdVisto}
        order by m.id asc
      `;
      if (salientes.length) ultimoIdVisto = salientes[salientes.length - 1].id;
      const respuesta = salientes
        .filter((m) => m.type === "text")
        .map((m) => m.content)
        .join("\n")
        .trim();

      // ¿Salió una pieza en ESTE turno? Una imagen de opciones o la guía de la
      // medida ya es algo concreto, así que el texto puede limitarse a pedir el
      // dato sin que eso sea dejar al cliente con las manos vacías.
      const mandoPieza = salientes.some((m) => m.type === "image");

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
        // Antes iba `false` fijo, con la nota «sin Contífico conectado». Dejó de
        // ser cierto: el hijo hereda process.env, así que corriendo con
        // `railway run` las credenciales llegan y el catálogo sincroniza de
        // verdad. Con stock real, afirmar disponibilidad no es inventar.
        tieneStock: catalogoConItems,
        mandoPieza,
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
