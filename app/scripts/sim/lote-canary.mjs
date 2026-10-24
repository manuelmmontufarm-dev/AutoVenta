#!/usr/bin/env node
/**
 * LOTE DEL CANARY DE MODELO BARATO (23-oct-2026).
 *
 * Repite conversaciones REALES difíciles (datos/dificiles-50.json, textos de
 * cliente tal cual salieron de producción) contra un simulador ya levantado, y
 * deja por conversación: la transcripción, qué modelo atendió cada corrida,
 * qué hizo el Guardián, cuánto costó en tokens, los invariantes globales del
 * T115 y la nota de un juez (gpt-5.5) sobre la conversación entera.
 *
 * Se corre UNA vez por configuración del simulador, con etiqueta:
 *
 *   # simulador A: npm run sim -- --canary-model gpt-5.5-mini --debounce 1500
 *   node scripts/sim/lote-canary.mjs --etiqueta mini-ambos --rango 1-25
 *
 *   # simulador B (control) en otros puertos:
 *   SIM_UI_URL=http://127.0.0.1:3240 SIM_APP_URL=http://127.0.0.1:3245 \
 *   SIM_DATABASE_URL=postgresql://manue@localhost/autoventa_sim_b \
 *   node scripts/sim/lote-canary.mjs --etiqueta control --rango 1-25
 *
 * Escribe mediciones/canary-<etiqueta>.json después de CADA conversación, así
 * que una caída no pierde nada; con --continuar salta las que ya están.
 * `comparar-canary.mjs` cruza dos archivos de estos y da el veredicto A/B.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import OpenAI from "openai";
import { correrEscenario, invariantesGlobales, sql, textoDe } from "./lib/corredor-t115.mjs";

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const tiene = (n) => process.argv.includes(`--${n}`);

const ETIQUETA = arg("etiqueta", "sin-etiqueta");
const DATOS = resolve(import.meta.dirname, arg("datos", "datos/dificiles-50.json"));
const SALIDA = resolve(import.meta.dirname, arg("salida", `mediciones/canary-${ETIQUETA}.json`));
const [DESDE, HASTA] = (arg("rango", "1-50")).split("-").map(Number);
const SIN_JUEZ = tiene("sin-juez");
const JUEZ_MODEL = process.env.OPENAI_EVAL_MODEL ?? "gpt-5.5";

/** Tarifas USD por millón, mismas que src/services/billing.ts. */
const TARIFAS = {
  "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
  "gpt-5.5-mini": { input: 1, cachedInput: 0.1, output: 6 },
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
};
const tarifa = (m) => TARIFAS[m] ?? TARIFAS[Object.keys(TARIFAS).find((k) => m.startsWith(k))] ?? TARIFAS["gpt-5.5"];

// La clave del juez es la del simulador (app/.env.sim), nunca la de Depot.
function claveDePruebas() {
  const linea = readFileSync(resolve(import.meta.dirname, "../../.env.sim"), "utf8").split("\n").find((l) => l.startsWith("OPENAI_API_KEY="));
  return linea?.slice("OPENAI_API_KEY=".length).trim();
}
const openai = SIN_JUEZ ? null : new OpenAI({ apiKey: claveDePruebas(), timeout: 120_000, maxRetries: 1 });

const FALLAS = ["repite_pregunta_ya_respondida", "pide_dato_que_ya_tiene", "no_da_precio_pedido", "no_ofrece_nada_concreto",
  "no_avanza_al_cierre", "pide_foto_innecesaria", "respuesta_generica", "tono_robotico", "demasiado_largo", "inventa_dato",
  "abandona_al_cliente", "no_entendio_lo_que_pidio", "contradice_turno_anterior"];

const PROMPT_JUEZ = `Eres un vendedor de llantas ecuatoriano con veinte años de mostrador en Quito y has cerrado miles de ventas por WhatsApp.

Te doy una conversación completa entre un cliente real y un asistente de ventas (cada turno: lo que escribió el cliente y lo que respondió el asistente). Califica al ASISTENTE en la conversación ENTERA.

CRITERIO: VENTA PRIMERO.
1. ¿Entendió lo que el cliente pidió (medida, cantidad, cambio de opinión, ciudad)? Contestar a otra cosa es la falla más grave.
2. ¿Ofrece algo CONCRETO (opciones reales, precio, cotización, local, cita)? Amable sin ofrecer nada = malo.
3. ¿Repite algo que el cliente YA dijo (medida, vehículo, cantidad, foto)? El cliente se va.
4. ¿Se contradice o inventa (precios, stock, promesas, recargos)?
5. ¿Avanza al cierre (elegir llanta, cotizar, local, día de visita)?
6. Recién después: tono ecuatoriano natural, brevedad de WhatsApp.

Notas de 1 a 10: 1 = ahuyenta al cliente, 5 = no daña pero no vende, 8 = buen vendedor humano, 10 = cierra. Juzga SOLO lo escrito; un precio mencionado asume que salió del catálogo. Un turno sin respuesta del asistente baja la nota a 3 o menos.

Devuelve SOLO JSON: {"nota": 1-10, "fallas": [], "peor_turno": <número de turno o null>, "comentario": "una frase, máximo 25 palabras, en español"}
En "fallas" usa exclusivamente: ${FALLAS.join(", ")}.`;

async function juzgar(caso, r) {
  if (!openai) return null;
  const hilo = r.turnos.map((t, i) => `TURNO ${i + 1}\nCLIENTE: ${t.cliente}\nASISTENTE: ${textoDe(t) || "(no respondió)"}`).join("\n\n");
  const contexto = `Lo que hizo difícil este caso en la vida real (no lo sabe el asistente): ${caso.titulo}\n\n${hilo}`;
  for (let intento = 0; intento < 2; intento += 1) {
    try {
      const resp = await openai.chat.completions.create({
        model: JUEZ_MODEL,
        messages: [{ role: "system", content: PROMPT_JUEZ }, { role: "user", content: contexto }],
        response_format: { type: "json_object" },
        // gpt-5.5 razona antes de escribir: con 600 el JSON salía vacío (9 de 25 casos, 23-oct).
        max_completion_tokens: 4000,
      });
      const j = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
      const nota = Math.round(Number(j.nota));
      if (!(nota >= 1 && nota <= 10)) throw new Error("nota fuera de rango");
      return {
        nota,
        fallas: (Array.isArray(j.fallas) ? j.fallas : []).map(String).filter((f) => FALLAS.includes(f)),
        peor_turno: Number.isFinite(Number(j.peor_turno)) ? Number(j.peor_turno) : null,
        comentario: String(j.comentario ?? "").slice(0, 200),
        modelo: JUEZ_MODEL,
      };
    } catch (e) { if (intento) return { error: String(e) }; }
  }
  return null;
}

/** Tokens y costo de la última conversación del simulador, por modelo y pieza. */
async function costoDeLaConversacion() {
  const [conv] = await sql`select id from conversations order by id desc limit 1`;
  if (!conv) return { usd: 0, porModelo: {} };
  const filas = await sql`select model, call_type, route, count(*)::int as runs, sum(input_tokens)::int as inp,
      sum(cached_input_tokens)::int as cached, sum(output_tokens)::int as outp
    from ai_runs where conversation_id=${conv.id} group by model, call_type, route`;
  let usd = 0; const porModelo = {};
  for (const f of filas) {
    const t = tarifa(f.model);
    const cached = Math.min(f.cached ?? 0, f.inp ?? 0);
    const u = ((f.inp - cached) * t.input + cached * t.cachedInput + f.outp * t.output) / 1e6;
    usd += u;
    const k = `${f.model}·${f.call_type}`;
    porModelo[k] = { runs: (porModelo[k]?.runs ?? 0) + f.runs, usd: +((porModelo[k]?.usd ?? 0) + u).toFixed(4), ruta: f.route };
  }
  return { usd: +usd.toFixed(4), porModelo, convId: conv.id };
}

/** Señales determinísticas, además de los invariantes del T115. */
function banderas(r) {
  const b = [];
  const todo = r.turnos.map(textoDe).join(" ⇒ ");
  if (/\b\d{8}\b/.test(todo)) b.push("sku_crudo_al_cliente");
  if (/cu[aá]ntas (llantas|unidades|necesita)/i.test(todo)) b.push("pregunta_cantidad_prohibida");
  if (/COT-\d+/.test(todo)) b.push("numero_de_cotizacion_al_cliente");
  if (/\{"|\}\s*$|"mensaje_para_enviar"/.test(todo)) b.push("json_crudo");
  const reescrituras = r.turnos.flatMap((t) => t.guardian ?? []).filter((g) => g.corregido && g.corregido !== g.original).length;
  const cots = r.estadoFinal?.cotizaciones?.length ?? 0;
  return { banderas: b, reescrituras_guardian: reescrituras, cotizaciones: cots, visita: r.estadoFinal?.visit_date ?? null,
    alertas: r.estadoFinal?.alertas?.length ?? 0, avisos_asesor: r.estadoFinal?.avisos_asesor ?? 0 };
}

const casos = JSON.parse(await readFile(DATOS, "utf8"));

// --rejuzgar: vuelve a pedir la nota del juez SOLO a los casos sin nota de un
// archivo ya corrido, sin tocar el simulador ni gastar tokens del bot.
if (tiene("rejuzgar")) {
  const archivo = JSON.parse(await readFile(SALIDA, "utf8"));
  let n = 0;
  for (const c of archivo.casos) {
    if (c.juez?.nota || !c.turnos) continue;
    c.juez = await juzgar(casos[c.n - 1], { turnos: c.turnos });
    n += 1;
    process.stdout.write(`   ${c.n}. ${c.juez?.nota ? `nota ${c.juez.nota} · ${c.juez.comentario}` : `sin nota: ${JSON.stringify(c.juez)}`}\n`);
  }
  await writeFile(SALIDA, JSON.stringify(archivo, null, 1));
  process.stdout.write(`== «${ETIQUETA}»: ${n} casos rejuzgados\n`);
  await sql.end();
  process.exit(0);
}
await mkdir(resolve(import.meta.dirname, "mediciones"), { recursive: true });
const previos = tiene("continuar") && existsSync(SALIDA) ? (JSON.parse(await readFile(SALIDA, "utf8")).casos ?? []) : [];
const hechos = new Set(previos.map((p) => p.n));
const resultados = [...previos];

const guardar = () => writeFile(SALIDA, JSON.stringify({ etiqueta: ETIQUETA, generado: new Date().toISOString(), casos: resultados }, null, 1));

process.stdout.write(`Lote «${ETIQUETA}» · casos ${DESDE}–${HASTA} de ${casos.length} · juez ${SIN_JUEZ ? "apagado" : JUEZ_MODEL}\n`);
for (let n = DESDE; n <= Math.min(HASTA, casos.length); n += 1) {
  if (hechos.has(n)) continue;
  const caso = casos[n - 1];
  const inicio = Date.now();
  process.stdout.write(`\n▶ ${n}. conv ${caso.conv} · ${caso.familia} · ${caso.titulo}\n`);
  let r;
  try {
    r = await correrEscenario({ id: `C${n}`, familia: caso.familia, titulo: caso.titulo, mensajes: caso.mensajes });
  } catch (e) {
    process.stdout.write(`   💥 ${String(e).slice(0, 200)}\n`);
    resultados.push({ n, conv: caso.conv, familia: caso.familia, titulo: caso.titulo, error: String(e) });
    await guardar();
    continue;
  }
  const costo = await costoDeLaConversacion();
  const inv = invariantesGlobales(r).map(([regla, detalle]) => `${regla}: ${detalle}`);
  const det = banderas(r);
  const juez = await juzgar(caso, r);
  const modelos = [...new Set(r.turnos.flatMap((t) => t.modelos ?? []))];
  for (const t of r.turnos) process.stdout.write(`   «${t.cliente.slice(0, 70)}»\n      → ${(textoDe(t) || "(sin respuesta)").slice(0, 200)}\n`);
  process.stdout.write(`   ${juez?.nota ? `nota ${juez.nota}` : "sin juez"} · $${costo.usd.toFixed(3)} · ${modelos.join(",")} · guardián reescribió ${det.reescrituras_guardian}` +
    `${inv.length ? ` · ❌ ${inv.join(" · ")}` : ""}${det.banderas.length ? ` · 🚩 ${det.banderas.join(",")}` : ""}` +
    `${juez?.fallas?.length ? ` · juez: ${juez.fallas.join(",")}` : ""}\n   ${juez?.comentario ?? ""}\n`);
  resultados.push({ n, conv: caso.conv, familia: caso.familia, titulo: caso.titulo, segundos: Math.round((Date.now() - inicio) / 1000),
    modelos, costo, invariantes: inv, ...det, juez, turnos: r.turnos, estadoFinal: r.estadoFinal });
  await guardar();
}

const conNota = resultados.filter((r) => r.juez?.nota);
const prom = conNota.length ? (conNota.reduce((a, r) => a + r.juez.nota, 0) / conNota.length).toFixed(2) : "—";
const usd = resultados.reduce((a, r) => a + (r.costo?.usd ?? 0), 0);
process.stdout.write(`\n== «${ETIQUETA}»: ${resultados.length} casos · nota media ${prom} · $${usd.toFixed(2)} · ` +
  `${resultados.filter((r) => r.invariantes?.length).length} con invariantes rotos · ${resultados.filter((r) => (r.juez?.nota ?? 10) <= 4).length} con nota ≤4\n`);
await sql.end();
