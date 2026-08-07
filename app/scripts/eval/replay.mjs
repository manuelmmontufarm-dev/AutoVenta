#!/usr/bin/env node
/**
 * Le vuelve a servir al bot NUEVO, mensaje por mensaje y en orden, todo lo que
 * los clientes reales escribieron. Guarda lo que contestó al lado de lo que
 * contestó el bot viejo aquel día.
 *
 * ── Las tres garantías de este archivo ──────────────────────────────────────
 *
 * 1. NADIE recibe un WhatsApp. `src/wa/client.ts` no se carga: el loader de
 *    lib/loader.mjs lo sustituye por lib/wa-stub.mjs en el resolver de Node,
 *    antes de que exista el módulo. Además, al arrancar se comprueba que el
 *    módulo cargado sea el stub y si no lo es, el proceso se niega a seguir.
 *    Los teléfonos también se reescriben a un rango inventado, así que ni
 *    devolviendo el cliente real habría a quién escribirle.
 *
 * 2. La base de producción NO se toca. Todo el estado se reconstruye en una
 *    base LOCAL que este script crea y borra (patrón de test/echoesWiring).
 *    Si DATABASE_URL local no apunta a localhost, aborta.
 *
 * 3. Se puede retomar. Cada conversación terminada queda escrita en el
 *    checkpoint; `--retomar` salta las que ya se pagaron.
 *
 * ── Qué es "el estado" que se reconstruye ───────────────────────────────────
 * Modo `fiel` (por defecto): el historial que ve el bot nuevo en el turno N son
 * los mensajes REALES anteriores —incluidas las respuestas del bot viejo—. Los
 * dos bots contestan con el mismo contexto exacto, que es lo único que hace
 * comparable turno contra turno. Modo `autonomo`: se encadenan las respuestas
 * nuevas y la conversación se bifurca; se lee más natural pero ya no compara.
 *
 * Uso:
 *   node scripts/eval/replay.mjs --dry             # sin claves, con fixtures
 *   node scripts/eval/replay.mjs                   # corrida real
 *   node scripts/eval/replay.mjs --retomar         # continúa una corrida cortada
 *   node scripts/eval/replay.mjs --max 20 --concurrencia 3
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { userInfo } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  APP, EVAL, Checkpoint, avisoDry, cargarEnv, conReintentos, dormir, enParalelo,
  escribirJson, exigirLocal, flags, identificadorPg, leerJson, ruta, titulo,
} from "./lib/comun.mjs";
import { exigirSincronia } from "./lib/detectores.mjs";
import { esPiezaOpciones, fusionarSalidas } from "./lib/medicion.mjs";

const ESTE = fileURLToPath(import.meta.url);
const f = flags();

// ── Relanzamiento con tsx + el loader que neutraliza WhatsApp ────────────────
// El harness importa TypeScript de src/ y necesita el loader puesto ANTES de
// que se resuelva el primer módulo. En vez de obligar a recordar la línea
// larga, el script se relanza solo: `node scripts/eval/replay.mjs --dry` basta.
if (!process.env.EVAL_REPLAY_HIJO) {
  const loader = new URL("./lib/loader.mjs", import.meta.url).href;
  const hijo = spawnSync(
    process.execPath,
    ["--import", "tsx", "--import", loader, ESTE, ...process.argv.slice(2)],
    { cwd: APP, stdio: "inherit", env: { ...process.env, EVAL_REPLAY_HIJO: "1" } },
  );
  process.exit(hijo.status ?? 1);
}

const MODO = f.valor("modo", "fiel");
const CONCURRENCIA = f.numero("concurrencia", 3);
const MAX_CONV = f.numero("max", null);
const RETOMAR = f.tiene("retomar");
const SIN_CLASIFICADOR = f.tiene("sin-clasificador");
const USUARIO_PG = f.valor("usuario", process.env.PGUSER ?? userInfo().username);
const ENTRADA = f.valor("entrada", f.dry ? resolve(EVAL, "fixtures/historial.json") : ruta("historial.json"));
const SALIDA = f.valor("salida", ruta(f.dry ? "replay.dry.json" : "replay.json"));
const PUERTO_STUB = f.numero("puerto-stub", 4699);

if (!["fiel", "autonomo"].includes(MODO)) {
  console.error(`--modo debe ser 'fiel' o 'autonomo' (llegó '${MODO}')`);
  process.exit(2);
}

// `--db` y `--admin` son lo único que entra a SQL crudo (Postgres no acepta
// parámetros en `create database`). Se validan ANTES de construir ninguna URL.
let NOMBRE_DB, ADMIN_URL, LOCAL_URL;
try {
  NOMBRE_DB = identificadorPg(f.valor("db", f.dry ? "autoventa_eval_dry" : "autoventa_eval"), "--db");
  ADMIN_URL = exigirLocal(f.valor("admin", `postgresql://${USUARIO_PG}@localhost/postgres`), "--admin");
  LOCAL_URL = exigirLocal(`postgresql://${USUARIO_PG}@localhost/${NOMBRE_DB}`, "la base del replay");
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(2);
}

/**
 * El checkpoint pertenece a UNOS parámetros, no al script.
 *
 * Reproducido antes de este arreglo: `--modo autonomo` a medias + `--modo fiel
 * --retomar` daba «0 por correr (8 ya estaban)» y escribía `modo: "fiel"` sobre
 * turnos generados en `autonomo`. `fiel` vs `autonomo` ES la decisión
 * metodológica del informe; un archivo que miente sobre cuál usó reclama una
 * comparabilidad que no tiene. Lo mismo con `--entrada` y `--max`.
 */
const FIRMA = { modo: MODO, entrada: ENTRADA, max: MAX_CONV ?? null, dry: f.dry };
const CHECKPOINT = f.valor("checkpoint", ruta(
  f.dry ? `replay.dry.${MODO}.jsonl` : `replay.${MODO}.jsonl`,
));

/**
 * Teléfono de replay: rango 5939000xxxxxx, que no está asignado en Ecuador.
 * Aunque alguien cambiara el stub por el cliente real mañana, el mensaje no
 * llegaría a ninguna persona. Cinturón además del tirante.
 */
const telefonoEval = (id) => `5939000${String(id).padStart(6, "0")}`;

/** El texto que el bot nuevo recibe por un mensaje histórico. */
function textoDelMensaje(m) {
  const contenido = (m.content ?? "").trim();
  if (contenido) return { texto: contenido, recuperable: true };
  // Las fotos y audios viejos NO se pueden rebajar: el media_id de Meta caduca
  // en días y el histórico tiene semanas. Se entrega el mismo texto que el bot
  // produce hoy cuando una descarga falla — el camino real, no uno inventado.
  if (m.type === "image") {
    return {
      texto: "[El cliente mandó una foto que no se pudo leer. Pídele con amabilidad que escriba lo que dice el costado de la llanta.]",
      recuperable: false,
    };
  }
  if (m.type === "audio") {
    return {
      texto: "[El cliente mandó un audio que no se pudo escuchar. Pídele con amabilidad que escriba su consulta o mande la medida escrita.]",
      recuperable: false,
    };
  }
  return { texto: "", recuperable: true };
}

/** Agrupa mensajes seguidos del cliente en un solo turno, como el debounce. */
function turnosDe(conv) {
  const turnos = [];
  let actual = null;
  for (const m of conv.mensajes ?? []) {
    const esCliente = m.direction === "inbound";
    const esBot = m.direction === "outbound" && (m.author_kind ?? "bot") !== "system";
    if (esCliente) {
      if (!actual || actual.cerrado) { actual = { entradas: [], viejas: [], cerrado: false }; turnos.push(actual); }
      actual.entradas.push(m);
    } else if (esBot && actual) {
      actual.viejas.push(m);
      actual.cerrado = true;
    }
  }
  return turnos.filter((t) => t.entradas.length > 0);
}

// Un solo criterio de "esto es la pieza de opciones" para los dos lados: el que
// usan los detectores (lib/medicion.mjs). Tener dos copias era la forma más
// barata de que el «antes» y el «después» acabaran midiendo cosas distintas.

// ── Arranque de la base local ────────────────────────────────────────────────

async function prepararBase() {
  const { default: postgres } = await import("postgres");
  const admin = postgres(ADMIN_URL, { prepare: false, max: 1 });
  const existe = await admin`select 1 from pg_database where datname = ${NOMBRE_DB}`;
  if (!RETOMAR || existe.length === 0) {
    if (existe.length > 0) {
      // Cortar sesiones colgadas de una corrida anterior: si no, el drop se queda esperando.
      await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${NOMBRE_DB}`.catch(() => {});
      await admin.unsafe(`drop database if exists ${NOMBRE_DB}`);
    }
    await admin.unsafe(`create database ${NOMBRE_DB}`);
  }
  await admin.end();
}

/**
 * La siembra corre en un proceso aparte a propósito: `src/db/seed-depot.ts` es
 * un script que ejecuta `main()` al importarlo y cierra el pool con `sql.end()`
 * al terminar. Importarlo aquí dejaría al harness sin conexión desde el primer
 * turno.
 */
function sembrar(env) {
  const r = spawnSync(process.execPath, ["--import", "tsx", resolve(APP, "src/db/seed-depot.ts")], {
    cwd: APP, env, stdio: "pipe", encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`la siembra falló:\n${r.stdout ?? ""}\n${r.stderr ?? ""}`);
  }
}

/**
 * El doble de `--dry`. Sirve OpenAI y Contífico a la vez (ver lib/stub-eval.mjs).
 * Corre en ESTE proceso: así el guion vive en un solo archivo y no hay que
 * sincronizar dos procesos para saber si el bot llegó a llamar una tool.
 */
async function levantarStubEval() {
  const { levantar } = await import(new URL("./lib/stub-eval.mjs", import.meta.url).href);
  const servidor = await levantar({ port: PUERTO_STUB, log: ruta("dry-modelo.jsonl") });
  for (let i = 0; i < 50; i += 1) {
    try {
      await fetch(`http://127.0.0.1:${PUERTO_STUB}/v1/chat/completions`, {
        method: "POST", body: "{}", signal: AbortSignal.timeout(500),
      });
      return servidor;
    } catch { await dormir(100); }
  }
  throw new Error("el stub de evaluación no levantó");
}

// ── Programa ─────────────────────────────────────────────────────────────────

async function main() {
  titulo("REPLAY DEL HISTORIAL CONTRA EL BOT NUEVO", f.dry ? "dry" : `real · ${MODO}`);
  exigirSincronia();

  if (!existsSync(ENTRADA)) {
    console.error(`No existe ${ENTRADA}. Corre antes:\n  node scripts/eval/extraer.mjs${f.dry ? " --dry" : ""}`);
    process.exit(1);
  }

  const historial = leerJson(ENTRADA);

  /**
   * Una corrida real jamás debe alimentarse de fixtures.
   *
   * Antes, `extraer.mjs --dry` escribía sobre el MISMO `datos/historial.json`
   * que la extracción real. Secuencia realista: extraer de producción → alguien
   * prueba el cableado con `--dry` → `replay` real. Resultado: se paga el modelo
   * caro por 8 conversaciones sintéticas y el informe las presenta como clientes
   * de Depot. `extraer.mjs` ya separa los archivos; esto es el cinturón.
   */
  const historialSintetico = historial.dry === true || historial.fuente === "fixtures";
  if (historialSintetico && !f.dry) {
    console.error(
      `❌ ${ENTRADA} son conversaciones SINTÉTICAS (fuente "${historial.fuente ?? "?"}").\n` +
      "   Una corrida real sobre fixtures gasta dinero y produce un informe que\n" +
      "   presenta datos inventados como clientes de Depot.\n\n" +
      "   Extrae el historial de verdad:  node scripts/eval/extraer.mjs",
    );
    process.exit(1);
  }


  let stub = null;
  if (f.dry) {
    avisoDry("el bot corre de verdad, pero el modelo y el catálogo son dobles locales.");
    // En --dry NO se lee .env: la promesa es que corre sin claves, y leerlas
    // "por si acaso" abriría la puerta a gastar dinero sin querer.
    process.env.OPENAI_API_KEY = "stub";
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${PUERTO_STUB}/v1`;
    for (const v of ["OPENAI_MODEL", "OPENAI_CLASSIFIER_MODEL", "OPENAI_RESEARCH_MODEL",
      "OPENAI_VISION_MODEL", "OPENAI_ESCALATION_MODEL"]) process.env[v] = "stub-model";
    // Catálogo de mentira, pero por la MISMA ruta de código que el real: sin él
    // `ensureCatalogReady()` lanza, ninguna tool escribe un mensaje y los
    // detectores que viven de lo que escriben las tools no se ejercitan nunca.
    process.env.CONTIFICO_API_KEY = "stub";
    process.env.CONTIFICO_BASE_URL = `http://127.0.0.1:${PUERTO_STUB}/contifico`;
    stub = await levantarStubEval();
  } else {
    cargarEnv(resolve(APP, ".env"));
    if (!process.env.OPENAI_API_KEY) {
      console.error("Falta OPENAI_API_KEY (en .env o el entorno). Con --dry no hace falta.");
      process.exit(1);
    }
  }

  // La base de trabajo SIEMPRE es la local (validado arriba con exigirLocal).
  // Se fija antes de importar nada de src/, porque config.ts la lee al cargarse.
  const dbProduccion = process.env.DATABASE_URL;
  process.env.DATABASE_URL = LOCAL_URL;
  process.env.WHATSAPP_TOKEN ??= "replay";
  process.env.WHATSAPP_APP_SECRET ??= "replay";
  process.env.WHATSAPP_VERIFY_TOKEN ??= "replay";
  process.env.WHATSAPP_PHONE_ID ??= "replay";
  if (dbProduccion && dbProduccion === LOCAL_URL) {
    console.error("DATABASE_URL de producción coincide con la base local del replay. Aborto.");
    process.exit(1);
  }

  console.log(`🗄️  base local: ${LOCAL_URL}`);
  await prepararBase();
  const entorno = { ...process.env, DATABASE_URL: LOCAL_URL };

  const { ensureSchema } = await import(pathToFileURL(resolve(APP, "src/db/schema.ts")).href);
  await ensureSchema();
  sembrar(entorno);
  console.log("🌱 esquema y semilla listos");

  // ── El candado: si lo cargado NO es el stub, aquí se acaba la corrida ──────
  const wa = await import(pathToFileURL(resolve(APP, "src/wa/client.ts")).href);
  if (typeof wa._eval_enviados !== "function" || typeof wa._eval_enContexto !== "function") {
    console.error(
      "❌ src/wa/client.ts se cargó DE VERDAD (no el stub).\n" +
      "   Sin el loader, este script le escribiría por WhatsApp a clientes reales.\n" +
      "   Corre `node scripts/eval/replay.mjs …` (se relanza solo con el loader).",
    );
    process.exit(1);
  }
  console.log("📵 WhatsApp neutralizado: wa/client.ts sustituido por wa-stub.mjs");

  // Si src/ está a medio editar, el import revienta con un error de módulo que
  // no dice nada del harness. Se traduce: el replay corre el bot DE VERDAD, así
  // que un src/ roto es un "arregla el bot", no un "arregla el evaluador".
  let config, runAgent, classifyStage, applyOutboundGuard, conversaciones, sql,
    extractTireSizes, extractFlotationSizes, formatTireSize, formatFlotationSize,
    extractExplicitQuantity, extractVehicleYear;
  try {
    ({ config } = await import(pathToFileURL(resolve(APP, "src/config.ts")).href));
    ({ runAgent } = await import(pathToFileURL(resolve(APP, "src/agent/agent.ts")).href));
    ({ classifyStage } = await import(pathToFileURL(resolve(APP, "src/agent/classifier.ts")).href));
    ({ applyOutboundGuard } = await import(pathToFileURL(resolve(APP, "src/services/outboundGuard.ts")).href));
    conversaciones = await import(pathToFileURL(resolve(APP, "src/services/conversations.ts")).href);
    ({ sql } = await import(pathToFileURL(resolve(APP, "src/db/client.ts")).href));
    ({ extractTireSizes, extractFlotationSizes, formatTireSize, formatFlotationSize } =
      await import(pathToFileURL(resolve(APP, "src/domain/tireSize.ts")).href));
    ({ extractExplicitQuantity, extractVehicleYear } =
      await import(pathToFileURL(resolve(APP, "src/domain/salesIntent.ts")).href));
  } catch (error) {
    console.error(
      "❌ No se pudo cargar el bot desde src/.\n" +
      `   ${String(error?.message ?? error).split("\n")[0]}\n\n` +
      "   El replay ejecuta el bot real: si src/ no compila, no hay nada que medir.\n" +
      "   Comprueba con `npx tsc --noEmit` y vuelve a correr.",
    );
    if (stub) stub.close();
    process.exit(1);
  }

  const capacidades = {
    catalogo: Boolean(config.contifico || config.catalog),
    // El catálogo de `--dry` responde igual que Contífico pero es de mentira.
    // Que `catalogo:true` no se lea nunca como "corrió contra el catálogo real".
    catalogoStub: f.dry,
    interbotEnVivo: Boolean(config.interbot?.username ?? config.interbot),
    modelo: config.openai.model,
    modeloEscalacion: config.openai.escalationModel,
    modeloClasificador: config.openai.classifierModel,
    modeloVision: config.openai.visionModel,
    modeloInvestigacion: config.openai.researchModel,
    modeloTranscripcion: config.openai.transcribeModel,
  };
  console.log(`🧠 modelos: loop ${capacidades.modelo} · rescate ${capacidades.modeloEscalacion} · clasificador ${capacidades.modeloClasificador}`);
  if (!capacidades.catalogo) {
    console.log("⚠️  catálogo NO configurado (sin CONTIFICO_API_KEY): las tools de búsqueda y cotización van a fallar.");
  } else if (capacidades.catalogoStub) {
    console.log(`🧰 catálogo: doble local de lib/stub-eval.mjs (NO es el catálogo de Depot)`);
  }

  let lista = (historial.conversaciones ?? []).filter((c) => turnosDe(c).length > 0);
  if (MAX_CONV) lista = lista.slice(0, MAX_CONV);

  const checkpoint = new Checkpoint(CHECKPOINT, (fila) => `${fila.conversacion}#${fila.indiceTurno}`, { firma: FIRMA });
  if (RETOMAR) {
    const { ok, motivo } = checkpoint.cargar();
    if (!ok) {
      console.error(
        `❌ --retomar no puede continuar ${CHECKPOINT}: ${motivo}\n\n` +
        "   Mezclar turnos de dos corridas distintas produce un archivo que miente\n" +
        "   sobre su propia procedencia. Corre sin --retomar para empezar de cero,\n" +
        "   o vuelve a los parámetros de la corrida original.",
      );
      if (stub) stub.close();
      process.exit(1);
    }
  } else checkpoint.limpiar();
  // La reanudación es por conversación entera: retomar a mitad exigiría volver
  // a ejecutar las tools de los turnos previos (cotizaciones, descuentos) para
  // que el estado calce, y eso ya cuesta casi lo mismo que rehacer el turno.
  const conversacionesHechas = new Set(checkpoint.filas.map((r) => r.conversacion));
  const pendientes = lista.filter((c) => !conversacionesHechas.has(c.id));
  console.log(`🎞️  ${lista.length} conversaciones · ${pendientes.length} por correr${RETOMAR ? ` (${conversacionesHechas.size} ya estaban)` : ""}\n`);

  let hechos = 0;
  let erroresClasificador = 0;
  let etapasMovidas = 0;
  const errores = [];

  /**
   * El único canal por el que un clasificador caído se delata.
   *
   * `classifyStage` (src/agent/classifier.ts) termina en un `catch` que solo
   * hace `console.error("⚠️ Clasificador de etapa falló:", err)` y devuelve
   * `void`: nunca rechaza, así que ningún `.catch` del harness se entera.
   * Medido: con el clasificador devolviendo texto no-JSON, el conteo de etapas
   * movidas bajó de 7/7 a 1/7 — sugestivo, pero no concluyente, porque hay
   * caminos que mueven la etapa sin el modelo. Contar su línea de consola sí es
   * exacto. Se envuelve, no se silencia: el mensaje original se sigue viendo.
   */
  const consolaOriginal = console.error;
  console.error = (...args) => {
    if (/Clasificador de etapa fall/.test(String(args[0] ?? ""))) erroresClasificador += 1;
    consolaOriginal(...args);
  };

  async function correrConversacion(conv) {
    const phone = telefonoEval(conv.id);
    let conversacion = await conversaciones.getOrCreateConversation(phone, conv.name ?? undefined);
    const turnos = turnosDe(conv);

    for (const [indiceTurno, turno] of turnos.entries()) {
      const partes = turno.entradas.map(textoDelMensaje);
      const texto = partes.map((p) => p.texto).filter(Boolean).join("\n");
      if (!texto) continue;
      const recuperable = partes.every((p) => p.recuperable);

      // Lo mismo que hace el pipeline antes de llamar al agente: sin esto, el
      // bot nuevo arrancaría cada turno sin la medida y el detector
      // «pregunta_teniendo_medida» no tendría contra qué comparar.
      const medida = extractTireSizes(texto)[0];
      const flotacion = medida ? null : extractFlotationSizes(texto)[0];
      const cantidad = extractExplicitQuantity(texto);
      const anio = extractVehicleYear(texto);
      await conversaciones.updateConversationFacts(conversacion.id, {
        ...(medida ? { tireSize: formatTireSize(medida) } : {}),
        ...(flotacion ? { tireSize: formatFlotationSize(flotacion) } : {}),
        ...(cantidad ? { selectedQuantity: cantidad } : {}),
        ...(anio ? { vehicleYear: anio } : {}),
      });

      for (const [i, m] of turno.entradas.entries()) {
        await conversaciones.appendMessage(
          conversacion.id, "user", partes[i].texto,
          `wamid.REPLAY_${conv.id}_${indiceTurno}_${i}`,
          { type: m.type === "note" ? "text" : (m.type ?? "text"), occurredAt: new Date(m.created_at) },
        );
      }

      wa._eval_reset();
      // Marca para recuperar lo que las TOOLS escriban durante el turno (la
      // imagen de opciones, el texto de la cotización con su COT-). El cliente
      // recibe eso además del texto final del agente, y varios detectores
      // —cotización duplicada, opciones reenviadas— viven justamente ahí.
      const [{ tope }] = await sql`
        select coalesce(max(id), 0)::int as tope from messages
        where conversation_id = ${conversacion.id}
      `;
      const t0 = Date.now();
      let respuesta = "";
      let error = null;
      try {
        respuesta = await conReintentos(
          () => runAgent({
            conversation: conversacion, customerPhone: phone,
            customerName: conv.name ?? undefined, currentUserText: texto,
          }, texto),
          { etiqueta: `conv ${conv.id} turno ${indiceTurno + 1}`, aviso: (m) => console.log(m) },
        );
      } catch (e) {
        error = String(e?.message ?? e);
      }
      const ms = Date.now() - t0;

      // Lo que el cliente habría recibido de verdad: el guardián corre después
      // del agente en producción, así que también corre aquí.
      let entregado = respuesta;
      let bloqueadoPor = [];
      if (respuesta) {
        const vetted = await applyOutboundGuard(conversacion.id, respuesta);
        entregado = vetted.text ?? "";
        bloqueadoPor = vetted.issues ?? [];
      }

      const [corrida] = await sql`
        select model, latency_ms, input_tokens, output_tokens, tools, error
        from ai_runs where conversation_id = ${conversacion.id}
        order by created_at desc, id desc limit 1
      `;
      const piezas = wa._eval_enviados();
      const deTools = await sql`
        select content, type, metadata, cycle, created_at from messages
        where conversation_id = ${conversacion.id} and id > ${tope}
          and direction = 'outbound' and author_kind = 'bot'
        order by id
      `;

      const fila = {
        conversacion: conv.id,
        cliente: conv.name ?? conv.phone,
        indiceTurno,
        mensaje: texto,
        respuesta_vieja: turno.viejas.map((m) => m.content ?? "").filter(Boolean).join("\n"),
        respuesta_nueva: entregado,
        respuesta_nueva_cruda: respuesta,
        bloqueado_por_guardian: bloqueadoPor,
        modelo: corrida?.model ?? null,
        modelo_viejo: (conv.modelosViejos ?? [])[0] ?? null,
        tokens: {
          entrada: corrida?.input_tokens ?? 0,
          salida: corrida?.output_tokens ?? 0,
        },
        ms,
        tools_usadas: Array.isArray(corrida?.tools) ? corrida.tools : [],
        error: error ?? corrida?.error ?? null,
        // getOrCreateConversation no devuelve tire_size; se lee de la tabla, que
        // es de donde sale también en la auditoría.
        medida_conocida: (await sql`
          select tire_size from conversations where id = ${conversacion.id}
        `)[0]?.tire_size ?? null,
        medios_no_recuperables: !recuperable,
        piezas: piezas.map((p) => ({ tipo: p.tipo, bytes: p.bytes, filename: p.filename })),
        piezas_viejas: turno.viejas.filter(esPiezaOpciones).length,
        // Todo lo que el cliente habría recibido en este turno, en orden: lo que
        // escribieron las tools y al final el texto del agente. Es la entrada de
        // los detectores del lado "nuevo", espejo de `viejas` del lado "viejo".
        // `cuando` va por mensaje y no por turno: el detector de cotizaciones
        // duplicadas mide los minutos que separan a dos COT-, y con la marca del
        // turno dos cotizaciones emitidas con 13 s de diferencia parecerían
        // separadas por los minutos que el cliente tardó en escribir. Quien
        // respeta esa marca al leerla es lib/medicion.mjs (`salidasDeTurno`).
        salidas_nuevas: fusionarSalidas(deTools, entregado
          ? { texto: entregado, ciclo: conversacion.current_cycle ?? 0, cuando: new Date().toISOString() }
          : null),
        salidas_viejas: turno.viejas.map((m) => ({
          texto: m.content ?? "", tipo: m.type, metadata: m.metadata ?? null,
          ciclo: m.cycle ?? 0, cuando: m.created_at,
        })),
        cuando: new Date(conv.mensajes ? turno.entradas[0].created_at : Date.now()).toISOString(),
      };
      // Continuidad del hilo. En `fiel` se anotan las respuestas VIEJAS: el
      // turno siguiente debe encontrar el mismo contexto que encontró el bot
      // viejo, o se estarían comparando dos conversaciones distintas.
      const aAnotar = MODO === "fiel"
        ? turno.viejas.map((m) => ({ texto: m.content ?? "", tipo: m.type, meta: m.metadata }))
        : (entregado ? [{ texto: entregado, tipo: "text", meta: { replay: true } }] : []);
      for (const [i, a] of aAnotar.entries()) {
        if (!a.texto) continue;
        await conversaciones.appendMessage(conversacion.id, "assistant", a.texto,
          `wamid.REPLAYOUT_${conv.id}_${indiceTurno}_${i}`,
          { type: a.tipo === "note" ? "text" : (a.tipo ?? "text"), authorKind: "bot", status: "sent" });
      }

      /**
       * Un clasificador caído NO puede parecerse a uno sano.
       *
       * Antes esto era `.catch(() => {})`, pero el `.catch` tampoco bastaba:
       * `classifyStage` se traga sus propios errores (`agent/classifier.ts`
       * termina en un `catch` que solo escribe en consola), así que nunca
       * rechaza y el harness no puede enterarse por ahí. Lo que sí es
       * observable es su EFECTO: se guarda la etapa antes y después, y al final
       * de la corrida se avisa si no movió ninguna en todo el historial —lo que
       * con conversaciones reales solo pasa si está caído—. El `.catch` se
       * queda para lo que sí escapa (un fallo de `setStage` contra la base).
       */
      if (!SIN_CLASIFICADOR && entregado) {
        fila.etapa_antes = conversacion.stage ?? null;
        const fallosAntes = erroresClasificador;
        await classifyStage(conversacion, texto, entregado).catch((e) => {
          fila.error_clasificador = String(e?.message ?? e).slice(0, 200);
          erroresClasificador += 1;
        });
        if (erroresClasificador > fallosAntes) fila.error_clasificador ??= "classifyStage falló (ver consola)";
      }
      conversacion = await conversaciones.getOrCreateConversation(phone);
      if (fila.etapa_antes !== undefined) {
        fila.etapa_despues = conversacion.stage ?? null;
        if (fila.etapa_antes !== fila.etapa_despues) etapasMovidas += 1;
      }
      // Se anota al FINAL: si se anotara antes, ni el fallo del clasificador ni
      // la etapa resultante —que se conocen después— llegarían al archivo.
      checkpoint.anotar(fila);
    }

    hechos += 1;
    const marca = `${String(hechos).padStart(3)}/${pendientes.length}`;
    console.log(`   ✅ ${marca} conv ${conv.id} (${conv.name ?? conv.phone}) · ${turnos.length} turnos`);
  }

  await enParalelo(pendientes, CONCURRENCIA, async (conv) => {
    try {
      // Cada conversación con su propio registro de piezas. Con un array de
      // módulo y --concurrencia 3, el `_eval_reset()` de una borraba lo que
      // otra acababa de enviar: reproducido, 3 piezas enviadas → 8 atribuidas.
      await wa._eval_enContexto(() => correrConversacion(conv));
    } catch (e) {
      errores.push({ conversacion: conv.id, error: String(e?.message ?? e) });
      console.log(`   ❌ conv ${conv.id}: ${String(e?.message ?? e).slice(0, 160)}`);
    }
  });

  console.error = consolaOriginal;

  // Ordenadas por conversación y turno: la concurrencia las termina
  // entremezcladas y un archivo que cambia de orden entre corridas es imposible
  // de diferenciar a ojo.
  const turnos = [...checkpoint.filas].sort(
    (a, b) => a.conversacion - b.conversacion || a.indiceTurno - b.indiceTurno,
  );
  const salida = {
    generadoEn: new Date().toISOString(),
    dry: f.dry,
    modo: MODO,
    firma: FIRMA,
    checkpoint: CHECKPOINT,
    entrada: ENTRADA,
    // Procedencia del historial, para que el informe no pueda presentar
    // conversaciones sintéticas como clientes de Depot.
    fuenteHistorial: historial.fuente ?? null,
    historialSintetico,
    commitBotViejo: historial.commitBot ?? null,
    capacidades,
    totales: {
      conversaciones: new Set(turnos.map((t) => t.conversacion)).size,
      turnos: turnos.length,
      conError: turnos.filter((t) => t.error).length,
      conErrorDeClasificador: turnos.filter((t) => t.error_clasificador).length,
      turnosConClasificador: turnos.filter((t) => t.etapa_antes !== undefined).length,
      etapasMovidas: turnos.filter((t) => t.etapa_antes !== undefined && t.etapa_antes !== t.etapa_despues).length,
      // Lo que el bot habría MANDADO por WhatsApp (imágenes, PDFs, textos).
      // Con el buffer global este número mezclaba conversaciones; ahora cada
      // una tiene el suyo y el total se puede leer sin asteriscos.
      piezasPorTipo: turnos.reduce((acc, t) => {
        for (const p of t.piezas ?? []) acc[p.tipo] = (acc[p.tipo] ?? 0) + 1;
        return acc;
      }, {}),
      turnosConTools: turnos.filter((t) => (t.tools_usadas ?? []).length > 0).length,
      toolsUsadas: turnos.reduce((acc, t) => {
        for (const x of t.tools_usadas ?? []) acc[x] = (acc[x] ?? 0) + 1;
        return acc;
      }, {}),
      sinRespuesta: turnos.filter((t) => !t.respuesta_nueva).length,
      mediosNoRecuperables: turnos.filter((t) => t.medios_no_recuperables).length,
      tokensEntrada: turnos.reduce((s, t) => s + (t.tokens?.entrada ?? 0), 0),
      tokensSalida: turnos.reduce((s, t) => s + (t.tokens?.salida ?? 0), 0),
      msMediana: (() => {
        const xs = turnos.map((t) => t.ms).filter(Boolean).sort((a, b) => a - b);
        return xs.length ? xs[Math.floor(xs.length / 2)] : null;
      })(),
      porModelo: turnos.reduce((acc, t) => {
        const k = t.modelo ?? "(sin ai_run)";
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    },
    erroresDeCorrida: errores,
    turnos,
  };
  escribirJson(SALIDA, salida);

  console.log(`\n📊 ${salida.totales.turnos} turnos · ${salida.totales.conError} con error · mediana ${salida.totales.msMediana ?? "—"} ms`);
  console.log(`   modelos por respuesta: ${JSON.stringify(salida.totales.porModelo)}`);
  console.log(`   tools: ${salida.totales.turnosConTools} turnos las usaron · ${JSON.stringify(salida.totales.toolsUsadas)}`);
  console.log(`   piezas que habría mandado por WhatsApp: ${JSON.stringify(salida.totales.piezasPorTipo)}`);
  const conClasificador = salida.totales.turnosConClasificador;
  console.log(`   clasificador: falló ${erroresClasificador} veces · movió la etapa en ${salida.totales.etapasMovidas} de ${conClasificador} turnos`);
  if (erroresClasificador) {
    console.log(
      "   ⚠️  El clasificador de etapa está fallando. No tumba el replay —se traga sus\n" +
      "      propios errores— pero el embudo del informe queda sin valor. Revisa el\n" +
      "      modelo, la cuota y el formato JSON antes de leer las etapas.",
    );
  }
  console.log(`📁 ${SALIDA}\n`);

  await sql.end();
  if (stub) stub.close();
}

main().catch((e) => { console.error("💥", e); process.exit(1); });
