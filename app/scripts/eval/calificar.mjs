#!/usr/bin/env node
/**
 * Califica el replay en dos capas que se vigilan entre sí.
 *
 *  (a) DETECTORES DETERMINÍSTICOS — los mismos de scripts/auditoria/extraer.mjs,
 *      importados de lib/detectores.mjs (que verifica estar en sincronía con el
 *      original antes de dejar correr nada). Se aplican a las respuestas NUEVAS
 *      y también a las VIEJAS del mismo periodo: así el "antes" y el "después"
 *      se miden con la misma vara y sobre las mismas conversaciones, que es lo
 *      que el censo del 5-ago —hecho a mano desde el panel— no podía garantizar.
 *
 *  (b) JUEZ LLM — para lo que ninguna expresión regular ve: si la respuesta
 *      VENDE. Opina, y por eso nunca decide solo: sus notas van al lado de los
 *      detectores, no encima.
 *
 * Con `--dry` la capa (b) NO existe: el juez simulado devuelve ruido derivado
 * de un hash, para ejercitar el cableado y la validación del JSON. No mira los
 * detectores —hacerlo convertiría las dos capas en una sola disfrazada de dos—
 * y sus veredictos no significan nada. El informe y la consola lo dicen.
 *
 * Reclasificación obligatoria: `pide_foto_que_no_puede_leer` medía una falla que
 * ya NO lo es (la visión está activa desde el 7-ago). Se sigue contando —porque
 * borrarlo escondería un cambio de criterio— pero sale APARTE, y el titular de
 * conversaciones afectadas del bot nuevo se calcula sin él.
 *
 * Uso:
 *   node scripts/eval/calificar.mjs --dry        # sin claves, juez simulado
 *   node scripts/eval/calificar.mjs              # juez real (OPENAI_EVAL_MODEL)
 *   node scripts/eval/calificar.mjs --retomar
 *   node scripts/eval/calificar.mjs --sin-juez   # solo detectores, gratis
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  APP, Checkpoint, avisoDry, cargarEnv, conReintentos, enParalelo, escribirJson,
  flags, leerJson, ruta, titulo,
} from "./lib/comun.mjs";
import {
  ETIQUETAS, TAXONOMIA, TAXONOMIA_CON_LINEA_BASE,
  conversacionesAfectadas, exigirSincronia, pct, resumirFallas,
} from "./lib/detectores.mjs";
import { coberturaDeDetectores, detectar } from "./lib/medicion.mjs";

const f = flags();
const ENTRADA = f.valor("entrada", ruta(f.dry ? "replay.dry.json" : "replay.json"));
const SALIDA = f.valor("salida", ruta(f.dry ? "calificaciones.dry.json" : "calificaciones.json"));
const CHECKPOINT = ruta(f.dry ? "juez.dry.jsonl" : "juez.jsonl");
const CONCURRENCIA = f.numero("concurrencia", 3);
const SIN_JUEZ = f.tiene("sin-juez");
const RETOMAR = f.tiene("retomar");
const MAX_ITEMS = f.numero("max", null);

// ── El juez ──────────────────────────────────────────────────────────────────

/** Vocabulario cerrado: si cada juicio inventa su etiqueta, no hay gráfico posible. */
export const FALLAS_DEL_JUEZ = [
  "repite_pregunta_ya_respondida",
  "pide_dato_que_ya_tiene",
  "no_da_precio_pedido",
  "no_ofrece_nada_concreto",
  "no_avanza_al_cierre",
  "pide_foto_innecesaria",
  "respuesta_generica",
  "tono_robotico",
  "demasiado_largo",
  "inventa_dato",
  "abandona_al_cliente",
];

export const PROMPT_JUEZ = `Eres un vendedor de llantas ecuatoriano con veinte años de mostrador en Quito. Has cerrado miles de ventas por WhatsApp y sabes exactamente en qué mensaje se enfría un cliente.

Te doy el hilo de una conversación real, el mensaje que escribió el cliente, y DOS respuestas al mismo mensaje: la que dio el asistente ANTES y la que da AHORA. Tu trabajo es decir cuál vende mejor.

CRITERIO: VENTA PRIMERO. En este orden:
1. ¿Ofrece algo CONCRETO? (una medida, opciones reales, un precio, una cita, una dirección). Una respuesta amable que no ofrece nada es una respuesta mala.
2. ¿Repite algo que el cliente YA respondió? Volver a pedir la medida, el vehículo, la cantidad o una foto cuando ya está en el hilo es el error más caro que existe: el cliente se va.
3. ¿Da el precio cuando se lo piden? Si el cliente pregunta cuánto cuesta y la respuesta no trae un número ni una cotización, es una falla grave. "Déjame consultar" no es dar precio.
4. ¿Avanza hacia el cierre? Cada mensaje debería dejar al cliente un paso más cerca de comprar: elegir modelo, confirmar cantidad, cuadrar la visita.
5. Recién después: tono natural ecuatoriano, brevedad de WhatsApp, cero relleno.

REGLAS DE CALIFICACIÓN:
- Notas de 1 a 10. 1 = ahuyenta al cliente. 5 = no daña pero no vende. 8 = un buen vendedor humano. 10 = cierra la venta.
- "igual" es un veredicto legítimo y frecuente. Si las dos respuestas hacen lo mismo con otras palabras, es "igual". No premies la respuesta más larga ni la más adornada.
- Juzga SOLO lo que está escrito. Si una respuesta menciona un precio, asume que salió del catálogo; no es tu trabajo verificarlo.
- Si una respuesta viene vacía, su nota es 1 y es peor que cualquier texto.
- El veredicto es sobre la respuesta de AHORA comparada con la de ANTES: "mejor", "igual" o "peor".

Devuelve SOLO un objeto JSON, sin texto alrededor, con esta forma exacta:
{
  "veredicto": "mejor" | "igual" | "peor",
  "fallas": [],
  "nota_nueva": 1-10,
  "nota_vieja": 1-10,
  "comentario": "una frase, máximo 25 palabras, en español"
}

En "fallas" pon SOLO fallas de la respuesta de AHORA, usando exclusivamente estas etiquetas: ${FALLAS_DEL_JUEZ.join(", ")}. Si no tiene ninguna, deja la lista vacía.`;

export const HASH_PROMPT = createHash("sha256").update(PROMPT_JUEZ).digest("hex").slice(0, 12);

const recorte = (t, n) => {
  const s = (t ?? "").trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

function mensajeParaElJuez(item, historial) {
  const conv = historial.get(item.conversacion);
  const previos = (conv?.mensajes ?? [])
    .filter((m) => new Date(m.created_at) < new Date(item.cuando))
    .slice(-6)
    .map((m) => `${m.direction === "inbound" ? "CLIENTE" : "ASISTENTE"}: ${recorte(m.content, 300)}`)
    .join("\n");
  return [
    `HILO PREVIO:\n${previos || "(este es el primer mensaje)"}`,
    `\nMENSAJE DEL CLIENTE AHORA:\n${recorte(item.mensaje, 900)}`,
    `\nRESPUESTA ANTES:\n${recorte(item.respuesta_vieja, 1500) || "(no respondió)"}`,
    `\nRESPUESTA AHORA:\n${recorte(item.respuesta_nueva, 1500) || "(no respondió)"}`,
  ].join("\n");
}

/** Valida y normaliza; nunca deja pasar un juicio a medias disfrazado de bueno. */
function validarJuicio(crudo) {
  const j = typeof crudo === "string" ? JSON.parse(crudo) : crudo;
  const veredicto = String(j.veredicto ?? "").toLowerCase();
  if (!["mejor", "igual", "peor"].includes(veredicto)) {
    throw new Error(`veredicto inválido: ${JSON.stringify(j.veredicto)}`);
  }
  const nota = (v) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < 1 || n > 10) throw new Error(`nota fuera de rango: ${v}`);
    return n;
  };
  const fallas = (Array.isArray(j.fallas) ? j.fallas : [])
    .map((x) => String(x).trim().toLowerCase())
    .filter((x) => FALLAS_DEL_JUEZ.includes(x));
  return {
    veredicto,
    fallas,
    nota_nueva: nota(j.nota_nueva),
    nota_vieja: nota(j.nota_vieja),
    comentario: String(j.comentario ?? "").slice(0, 300),
    fallas_descartadas: (Array.isArray(j.fallas) ? j.fallas : [])
      .map((x) => String(x).trim().toLowerCase())
      .filter((x) => !FALLAS_DEL_JUEZ.includes(x)),
  };
}

/**
 * Juez simulado del modo --dry: NO llama a nadie y NO opina.
 *
 * Antes derivaba veredicto y notas de `analizarConversacion`, o sea de los
 * mismos detectores que la capa (a). Las "dos capas que se vigilan entre sí"
 * eran una sola, y un `mejor 9 · igual 4 · peor 4` sacado de ahí parecía una
 * segunda opinión sin serlo. Ahora sale de un hash del turno: es ruido
 * reproducible, imposible de confundir con una medición. Lo único que prueba
 * —y lo único que tiene que probar— es que el cableado y `validarJuicio()`
 * aguantan el JSON que devolvería el modelo real.
 */
function juezSimulado(item) {
  const semilla = createHash("sha256")
    .update(`${HASH_PROMPT}|${item.conversacion}#${item.indiceTurno}`)
    .digest();
  const veredicto = ["mejor", "igual", "peor"][semilla[0] % 3];
  // Única señal no aleatoria, y solo porque el prompt real la fija como regla
  // dura: una respuesta vacía vale 1. No mira detectores ni contenido.
  const nota = (i, texto) => ((texto ?? "").trim() ? 1 + (semilla[i] % 10) : 1);
  return JSON.stringify({
    veredicto,
    fallas: [],
    nota_nueva: nota(1, item.respuesta_nueva),
    nota_vieja: nota(2, item.respuesta_vieja),
    comentario: "juez simulado (--dry): ruido reproducible, NO una opinión sobre el bot",
  });
}

async function llamarJuez(item, historial, modelo, apiKey, baseUrl) {
  const cuerpo = {
    model: modelo,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PROMPT_JUEZ },
      { role: "user", content: mensajeParaElJuez(item, historial) },
    ],
  };
  const pedir = async (body) => {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) {
      const texto = await r.text();
      const error = new Error(`OpenAI ${r.status}: ${texto.slice(0, 300)}`);
      error.status = r.status;
      error.cuerpo = texto;
      throw error;
    }
    return r.json();
  };
  const datos = await conReintentos(async () => {
    try {
      return await pedir(cuerpo);
    } catch (error) {
      // Algunos modelos nuevos solo aceptan la temperatura por defecto. Se
      // reintenta sin ella una vez: es eso o perder el juicio entero.
      if (error.status === 400 && /temperature/i.test(error.cuerpo ?? "")) {
        const { temperature: _t, ...sinTemp } = cuerpo;
        return pedir(sinTemp);
      }
      throw error;
    }
  }, { etiqueta: `juez conv ${item.conversacion}`, aviso: (m) => console.log(m) });

  const contenido = datos.choices?.[0]?.message?.content ?? "";
  return { juicio: validarJuicio(contenido), uso: datos.usage ?? null, modelo: datos.model ?? modelo };
}

// ── Programa ─────────────────────────────────────────────────────────────────
// Los detectores y la lectura de las salidas viven en lib/medicion.mjs: son
// funciones puras y así se pueden probar con datos (test/evalMedicion.test.ts)
// en vez de depender de que una corrida --dry pase por ellas.

async function main() {
  titulo("CALIFICACIÓN DEL REPLAY", f.dry ? "dry" : "real");
  exigirSincronia();
  // Antes de nada: el modelo del juez sale de .env y entra en la firma del
  // checkpoint. Leerlo después haría que la firma dijera "gpt-5.5" en una
  // corrida que en realidad usó otro modelo.
  if (!f.dry) cargarEnv(resolve(APP, ".env"));

  if (!existsSync(ENTRADA)) {
    console.error(`No existe ${ENTRADA}. Corre antes:\n  node scripts/eval/replay.mjs${f.dry ? " --dry" : ""}`);
    process.exit(1);
  }
  const replay = leerJson(ENTRADA);
  let items = replay.turnos ?? [];
  if (MAX_ITEMS) items = items.slice(0, MAX_ITEMS);

  const rutaHistorial = ruta("historial.json");
  const historial = new Map();
  if (existsSync(rutaHistorial)) {
    for (const c of leerJson(rutaHistorial).conversaciones ?? []) historial.set(c.id, c);
  }

  // ── (a) Detectores ─────────────────────────────────────────────────────────
  const nuevas = detectar(items, "nuevas");
  const viejas = detectar(items, "viejas");
  const totalConv = Math.max(nuevas.conversaciones, viejas.conversaciones, 1);

  // La reclasificación: pide_foto ya no es falla, pero se muestra, no se borra.
  const sinFoto = (hs) => hs.filter((h) => h.detector !== "pide_foto_que_no_puede_leer");
  const deterministico = {
    conversaciones: totalConv,
    turnos: items.length,
    nuevas: {
      fallas: resumirFallas(nuevas.hallazgos, totalConv),
      conversacionesAfectadas: conversacionesAfectadas(sinFoto(nuevas.hallazgos)),
      conversacionesAfectadasConFoto: conversacionesAfectadas(nuevas.hallazgos),
      hallazgos: nuevas.hallazgos,
    },
    viejas: {
      fallas: resumirFallas(viejas.hallazgos, totalConv),
      conversacionesAfectadas: conversacionesAfectadas(sinFoto(viejas.hallazgos)),
      conversacionesAfectadasConFoto: conversacionesAfectadas(viejas.hallazgos),
      hallazgos: viejas.hallazgos,
    },
    reclasificados: {
      pide_foto_que_no_puede_leer: {
        motivo: "La visión está activa desde el 7-ago (services/vision.ts): pedir una foto ya no deja la conversación en un callejón sin salida. Se sigue contando para no esconder el cambio de criterio, pero NO cuenta como falla del bot nuevo.",
        antes: viejas.hallazgos.filter((h) => h.detector === "pide_foto_que_no_puede_leer").length,
        ahora: nuevas.hallazgos.filter((h) => h.detector === "pide_foto_que_no_puede_leer").length,
      },
    },
  };
  deterministico.nuevas.pctAfectadas = pct(deterministico.nuevas.conversacionesAfectadas, totalConv);
  deterministico.viejas.pctAfectadas = pct(deterministico.viejas.conversacionesAfectadas, totalConv);

  console.log(`🔍 detectores · ${totalConv} conversaciones · ${items.length} turnos`);
  for (const d of TAXONOMIA) {
    const a = deterministico.viejas.fallas[d].incidencias;
    const b = deterministico.nuevas.fallas[d].incidencias;
    if (a === 0 && b === 0) continue;
    const flecha = b < a ? "↓" : b > a ? "↑" : "=";
    const nota = d === "pide_foto_que_no_puede_leer" ? "  (reclasificado: ya no es falla)" : "";
    console.log(`   ${flecha} ${ETIQUETAS[d].padEnd(42)} ${String(a).padStart(3)} → ${String(b).padStart(3)}${nota}`);
  }
  console.log(`   conversaciones afectadas (sin pide_foto): ${deterministico.viejas.conversacionesAfectadas} → ${deterministico.nuevas.conversacionesAfectadas}`);

  /**
   * Un 0 → 0 tiene dos lecturas contrarias: "no encontró la falla" o "el
   * detector no llegó a ejecutarse". `cotizacion_duplicada` y
   * `opciones_reenviadas` solo pueden disparar si en las salidas hubo
   * cotizaciones o piezas de opciones; si no las hubo, su cero no es un dato y
   * decirlo es obligación, no cortesía.
   */
  const cobertura = coberturaDeDetectores(items);
  deterministico.cobertura = cobertura;
  if (cobertura.sinEjercitar.length) {
    console.log(
      `   ⚠️  sin material para ejercitarse (su 0 NO es un dato): ${cobertura.sinEjercitar.join(", ")}\n` +
      `      salidas con COT-: ${cobertura.cotizaciones} · piezas de opciones: ${cobertura.piezasOpciones}`,
    );
  }

  // ── (b) Juez ───────────────────────────────────────────────────────────────
  const modeloJuez = f.dry ? "simulado" : (process.env.OPENAI_EVAL_MODEL ?? "gpt-5.5");
  const checkpoint = new Checkpoint(CHECKPOINT, (r) => `${r.conversacion}#${r.indiceTurno}`, {
    // El juicio depende del prompt, del modelo y de QUÉ replay se está juzgando.
    firma: { prompt: HASH_PROMPT, modelo: modeloJuez, entrada: ENTRADA, max: MAX_ITEMS ?? null, dry: f.dry },
    // Un 429 que sobrevivió a los 5 reintentos NO puede quedar cacheado para
    // siempre: con `hechas` incluyendo las filas con `error`, `--retomar`
    // respondía «0 juicios por pedir» y la única salida era borrar el JSONL y
    // volver a pagar los 164 juicios — exactamente lo que el checkpoint evita.
    valida: (r) => !r.error,
  });
  // Con --sin-juez SIEMPRE se carga y nunca se borra: los juicios ya pagados no
  // se tiran a la basura porque alguien quiso volver a mirar los detectores.
  if (RETOMAR || SIN_JUEZ) {
    const { ok, motivo } = checkpoint.cargar();
    if (!ok && !SIN_JUEZ) {
      console.error(
        `❌ ${CHECKPOINT}: ${motivo}\n\n` +
        "   Esos juicios se pidieron con otro prompt, otro modelo u otro replay.\n" +
        "   Mezclarlos con los de ahora produce un promedio que no significa nada.\n" +
        "   Corre sin --retomar para volver a juzgar desde cero.",
      );
      process.exit(1);
    }
    if (!ok) {
      // Con --sin-juez no se aborta: nadie va a pedir juicios nuevos, y borrar
      // el archivo tiraría a la basura juicios ya pagados. Se ignoran y se dice.
      console.log(`\n⚠️  ${CHECKPOINT} pertenece a otra corrida: sus juicios NO se usan.\n   (${motivo.split("\n")[0]})`);
      checkpoint.hechas.clear();
      checkpoint.filas = [];
    } else if (checkpoint.reintentables) {
      console.log(`\n♻️  ${checkpoint.reintentables} juicios habían fallado: se vuelven a pedir.`);
    }
  } else checkpoint.limpiar();

  if (!SIN_JUEZ) {
    let apiKey = "dry";
    let baseUrl = "http://127.0.0.1:0/v1";
    let modelo = modeloJuez;
    if (!f.dry) {
      apiKey = process.env.OPENAI_API_KEY;
      baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
      if (!apiKey) {
        console.error("Falta OPENAI_API_KEY. Usa --dry (juez simulado) o --sin-juez (solo detectores).");
        process.exit(1);
      }
    } else {
      modelo = "simulado";
      avisoDry("el juez NO llama a ningún modelo; sus notas son ruido reproducible (hash del turno).");
    }
    console.log(`\n⚖️  juez: ${modelo} · temperatura 0 · prompt ${HASH_PROMPT} · concurrencia ${CONCURRENCIA}`);

    const pendientes = items.filter((it) => !checkpoint.ya(`${it.conversacion}#${it.indiceTurno}`));
    console.log(`   ${pendientes.length} juicios por pedir${RETOMAR ? ` (${checkpoint.filas.length} ya estaban)` : ""}`);
    let listos = 0;
    await enParalelo(pendientes, CONCURRENCIA, async (item) => {
      const llave = { conversacion: item.conversacion, indiceTurno: item.indiceTurno };
      try {
        const r = f.dry
          ? { juicio: validarJuicio(juezSimulado(item)), uso: null, modelo: "simulado" }
          : await llamarJuez(item, historial, modelo, apiKey, baseUrl);
        checkpoint.anotar({ ...llave, ...r.juicio, modelo_juez: r.modelo, uso: r.uso });
      } catch (error) {
        checkpoint.anotar({ ...llave, error: String(error?.message ?? error).slice(0, 300) });
      }
      listos += 1;
      if (listos % 25 === 0 || listos === pendientes.length) {
        console.log(`   ⚖️  ${listos}/${pendientes.length}`);
      }
    });
  }

  // `finales()` y no `filas`: un turno que falló y luego se reintentó con éxito
  // aparece dos veces en el JSONL, y sin deduplicar se contaría a la vez como
  // juicio bueno y como juicio perdido.
  const definitivos = checkpoint.finales();
  const juicios = definitivos.filter((r) => !r.error);
  const fallidos = definitivos.filter((r) => r.error);
  const promedio = (k) => (juicios.length
    ? Number((juicios.reduce((s, j) => s + (j[k] ?? 0), 0) / juicios.length).toFixed(2)) : null);
  const cuentaVeredictos = { mejor: 0, igual: 0, peor: 0 };
  for (const j of juicios) cuentaVeredictos[j.veredicto] = (cuentaVeredictos[j.veredicto] ?? 0) + 1;
  const histograma = (k) => {
    const h = Array.from({ length: 10 }, () => 0);
    for (const j of juicios) h[(j[k] ?? 1) - 1] += 1;
    return h;
  };
  const fallasJuez = {};
  for (const j of juicios) for (const x of j.fallas ?? []) fallasJuez[x] = (fallasJuez[x] ?? 0) + 1;

  const porTurno = new Map(definitivos.map((r) => [`${r.conversacion}#${r.indiceTurno}`, r]));

  const salida = {
    generadoEn: new Date().toISOString(),
    dry: f.dry,
    entrada: ENTRADA,
    replayGeneradoEn: replay.generadoEn ?? null,
    modo: replay.modo ?? null,
    // La procedencia viaja con el dato: el informe no puede presentar
    // conversaciones sintéticas como clientes de Depot solo porque el paso de
    // calificación se corrió sin --dry.
    replayDry: replay.dry ?? null,
    fuenteHistorial: replay.fuenteHistorial ?? null,
    historialSintetico: replay.historialSintetico ?? null,
    capacidades: replay.capacidades ?? null,
    totalesReplay: replay.totales ?? null,
    juezModelo: SIN_JUEZ ? null : modeloJuez,
    juezSimulado: !SIN_JUEZ && f.dry,
    juezPromptHash: HASH_PROMPT,
    juezPrompt: PROMPT_JUEZ,
    deterministico,
    juez: {
      juzgados: juicios.length,
      sinRespuesta: fallidos.length,
      veredictos: cuentaVeredictos,
      notaNuevaPromedio: promedio("nota_nueva"),
      notaViejaPromedio: promedio("nota_vieja"),
      histogramaNueva: histograma("nota_nueva"),
      histogramaVieja: histograma("nota_vieja"),
      fallas: fallasJuez,
      tokens: juicios.reduce((s, j) => s + (j.uso?.total_tokens ?? 0), 0),
    },
    lineaBaseTaxonomia: TAXONOMIA_CON_LINEA_BASE,
    items: items.map((it) => ({
      conversacion: it.conversacion,
      cliente: it.cliente,
      indiceTurno: it.indiceTurno,
      mensaje: it.mensaje,
      respuesta_vieja: it.respuesta_vieja,
      respuesta_nueva: it.respuesta_nueva,
      modelo: it.modelo,
      modelo_viejo: it.modelo_viejo,
      tokens: it.tokens,
      ms: it.ms,
      tools_usadas: it.tools_usadas,
      medios_no_recuperables: it.medios_no_recuperables,
      error: it.error,
      juicio: porTurno.get(`${it.conversacion}#${it.indiceTurno}`) ?? null,
    })),
  };
  escribirJson(SALIDA, salida);

  if (!SIN_JUEZ) {
    const marca = f.dry ? "   (juez SIMULADO: ruido reproducible, no dice nada del bot)" : "";
    console.log(`\n⚖️  veredictos · mejor ${cuentaVeredictos.mejor} · igual ${cuentaVeredictos.igual} · peor ${cuentaVeredictos.peor}${marca}`);
    console.log(`   notas: vieja ${salida.juez.notaViejaPromedio} → nueva ${salida.juez.notaNuevaPromedio}`);
    if (fallidos.length) console.log(`   ⚠️ el juez no respondió en ${fallidos.length} turnos`);
  }
  console.log(`📁 ${SALIDA}\n`);
}

// Solo corre si se lo invoca directo: el archivo también exporta el prompt y el
// vocabulario del juez, y un `import` no debería arrancar una corrida.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error("💥", e); process.exit(1); });
}
