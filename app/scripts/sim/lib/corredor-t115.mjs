/**
 * El motor del corpus T115: manda mensajes de cliente al simulador, espera a
 * que el turno cierre de verdad (mensajes + corridas de IA + guardián
 * estables) y fotografía la base para que los jueces trabajen sobre hechos.
 *
 * Nace del motor de `pruebas-10.mjs` (30-ago-2026), que ya corrió cinco lotes
 * completos sin perder un turno. Se extrae acá para que las 115 no dupliquen
 * el código que las 10 históricas ya probaron. `pruebas-10.mjs` NO se toca:
 * es el arnés congelado del 51/51.
 *
 * Todo se parametriza por entorno, porque la flota paralela corre varios
 * simuladores a la vez:
 *   SIM_UI_URL   panel del simulador (default http://127.0.0.1:3210)
 *   SIM_APP_URL  el bot (default http://127.0.0.1:3205)
 *   SIM_DATABASE_URL  la base desechable de ESE simulador
 */
import postgres from "postgres";

const UI = process.env.SIM_UI_URL ?? "http://127.0.0.1:3210";
const APP = process.env.SIM_APP_URL ?? "http://127.0.0.1:3205";
const DB = process.env.SIM_DATABASE_URL ?? "postgresql://manue@localhost/autoventa_sim";

export const sql = postgres(DB, { prepare: false, max: 1 });
export const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url, options) {
  const r = await fetch(url, options);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(body)}`);
  return body;
}

export const activarBot = () => json(`${APP}/api/bot-power`, {
  method: "PUT", headers: { "Content-Type": "application/json", "x-admin-key": "sim" },
  body: JSON.stringify({ activo: true, motivo: "corpus T115" }),
});

/** Conversación nueva y limpia. Entre escenario y escenario, siempre. */
export const reiniciar = async () => { await json(`${UI}/api/reiniciar`, { method: "POST" }); await pausa(200); };

/**
 * Fotografía completa de la última conversación. Los jueces del T115 miran
 * más que los de las 10: también los avisos al asesor y las revisiones del
 * guardián, porque el corpus exige «cero avisos duplicados» y «cero turnos
 * comerciales sin revisar».
 */
export async function snapshot() {
  const [conv] = await sql`select id, current_cycle, stage, tire_size, selected_quantity,
      selected_product_code, nearest_store, visit_date, visit_time_label, status
    from conversations order by id desc limit 1`;
  if (!conv) return { conv: null, mensajes: [], runs: [], guardian: [], quotes: [], alertas: [], avisos: [] };
  const [mensajes, runs, guardian, quotes, alertas, avisos] = await Promise.all([
    sql`select id, author_kind, content, type, cycle from messages where conversation_id=${conv.id} order by id`,
    sql`select id, stage, model, tools, error, route from ai_runs where conversation_id=${conv.id} order by id`,
    sql`select id, verdict, findings, original_text, corrected_text from guardian_reviews where conversation_id=${conv.id} order by id`,
    sql`select id, quote_number, total, items, cycle from quotes where conversation_id=${conv.id} order by id`,
    sql`select id, type, priority, summary from bot_alerts where conversation_id=${conv.id} order by id`,
    sql`select id, status, cycle from advisor_notifications where conversation_id=${conv.id} order by id`,
  ]);
  return { conv, mensajes, runs, guardian, quotes, alertas, avisos };
}

/**
 * Manda uno o varios mensajes del cliente y espera el turno completo.
 *
 * `textos` como array manda los mensajes casi juntos (caso R05: dos mensajes
 * que llegan al webhook seguidos y deben producir UNA sola trayectoria).
 */
export async function mandar(textos) {
  const lista = Array.isArray(textos) ? textos : [textos];
  const antes = await snapshot();
  const maxBot = Math.max(0, ...antes.mensajes.filter((m) => m.author_kind === "bot").map((m) => Number(m.id)));
  const nRuns = antes.runs.length, nGuard = antes.guardian.length;
  for (const texto of lista) {
    await json(`${UI}/api/enviar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
    if (lista.length > 1) await pausa(150);
  }
  const limite = Date.now() + 120_000;
  let ultimo = null, firma = "", estable = 0;
  while (Date.now() < limite) {
    ultimo = await snapshot();
    const nuevos = ultimo.mensajes.filter((m) => m.author_kind === "bot" && Number(m.id) > maxBot);
    const f = JSON.stringify([nuevos.map((m) => [String(m.id), m.content]), ultimo.runs.map((r) => [String(r.id), r.error, r.tools]), ultimo.guardian.map((g) => String(g.id))]);
    const completo = nuevos.length && ultimo.runs.length > nRuns && ultimo.guardian.length > nGuard;
    if (completo && f === firma) { if (!estable) estable = Date.now(); if (Date.now() - estable >= 2000) break; }
    else { firma = f; estable = Date.now(); }
    await pausa(400);
  }
  if (!ultimo) ultimo = await snapshot();
  const nuevos = ultimo.mensajes.filter((m) => m.author_kind === "bot" && Number(m.id) > maxBot);
  const runs = ultimo.runs.slice(nRuns);
  const tools = runs.flatMap((r) => (Array.isArray(r.tools) ? r.tools : [])).map(String);
  return {
    cliente: lista.join(" ⧸ "),
    bot: nuevos.map((m) => ({ texto: m.content, tipo: m.type })),
    fase: tools.filter((t) => t.startsWith("fase_operativa:")).map((t) => t.slice(15)),
    herramientas: tools.filter((t) => !t.startsWith("fase_operativa:") && !t.startsWith("escalado_a_cerebro")),
    modelos: [...new Set(runs.map((r) => r.model))],
    errores: runs.filter((r) => r.error).map((r) => r.error),
    sinRespuesta: nuevos.length === 0,
    guardian: ultimo.guardian.slice(nGuard).map((g) => ({ verdict: g.verdict, findings: g.findings, original: g.original_text, corregido: g.corrected_text })),
    _estado: ultimo,
  };
}

/**
 * Corre un escenario completo: reinicia, ejecuta la preparación si la hay,
 * manda los mensajes en orden y devuelve turnos + estado final para juzgar.
 */
export async function correrEscenario(escenario) {
  await reiniciar();
  await activarBot();
  if (escenario.preparar) await escenario.preparar({ sql, mandar, snapshot });
  const turnos = [];
  for (const mensaje of escenario.mensajes) {
    turnos.push(await mandar(mensaje));
  }
  const final = await snapshot();
  return {
    id: escenario.id,
    familia: escenario.familia,
    titulo: escenario.titulo,
    turnos: turnos.map(({ _estado, ...t }) => t),
    estadoFinal: final.conv
      ? {
          stage: final.conv.stage, status: final.conv.status,
          tire_size: final.conv.tire_size, selected_quantity: final.conv.selected_quantity,
          nearest_store: final.conv.nearest_store, visit_date: final.conv.visit_date,
          current_cycle: final.conv.current_cycle,
          cotizaciones: final.quotes.map((q) => ({ numero: q.quote_number, total: Number(q.total), items: q.items, cycle: q.cycle })),
          alertas: final.alertas.map((a) => ({ tipo: a.type, prioridad: a.priority, resumen: a.summary })),
          avisos_asesor: final.avisos.length,
          sin_revision: final.guardian.filter((g) => g.verdict === "sin_revision").length,
        }
      : null,
  };
}

// ───────────────────────────────────────────────────────────────────
// Ayudas para escribir jueces sin repetirse
// ───────────────────────────────────────────────────────────────────

export const textoDe = (turno) => (turno?.bot ?? []).map((b) => b.texto ?? "").join(" § ");
export const textoDeTodos = (turnos) => turnos.map(textoDe).join(" ⇒ ");
export const usaHerramienta = (turno, nombre) => (turno?.herramientas ?? []).includes(nombre);
export const algunTurnoUsa = (turnos, nombre) => turnos.some((t) => usaHerramienta(t, nombre));
export const norm = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Los invariantes que TODA conversación del corpus debe cumplir, del contrato
 * global del documento. `plomeria: true` (nivel 1, OpenAI de mentira) omite
 * los que dependen del juicio del modelo real.
 */
export function invariantesGlobales(resultado, { plomeria = false } = {}) {
  const t = resultado.turnos;
  const fallas = [];
  const sinRespuesta = t.findIndex((x) => x.sinRespuesta);
  if (sinRespuesta >= 0) fallas.push(["ningún turno se queda sin respuesta", `turno ${sinRespuesta + 1} quedó mudo`]);
  const conError = t.findIndex((x) => x.errores?.length);
  if (conError >= 0) fallas.push(["ninguna corrida de IA con error", `turno ${conError + 1}: ${JSON.stringify(t[conError].errores)}`]);
  if (!plomeria) {
    const insiste = t.map((x, i) => (x.guardian ?? []).some((g) => (g.findings ?? []).some((f) => f.categoria === "insiste_tras_rechazo")) ? i + 1 : null).filter(Boolean);
    if (insiste.length) fallas.push(["el guardián no marca insistencia tras rechazo", `turnos ${insiste.join(", ")}`]);
    if ((resultado.estadoFinal?.sin_revision ?? 0) > 0) {
      fallas.push(["cero turnos comerciales sin revisar", `${resultado.estadoFinal.sin_revision} revisiones quedaron en sin_revision`]);
    }
  }
  if (plomeria) return fallas;
  // Piezas calcadas: el mismo mensaje sustantivo 3+ veces es el bucle de 8288.
  // Solo con modelo real: el doble del stub repite su guion a propósito y
  // este invariante lo mediría a él (medido 31-ago, X01/X04 en plomería).
  const vistos = new Map();
  for (const x of t) for (const b of x.bot ?? []) {
    const clave = norm(b.texto).replace(/[^a-z0-9 ]/g, "").slice(0, 90);
    if (clave.length < 25) continue;
    vistos.set(clave, (vistos.get(clave) ?? 0) + 1);
  }
  const calcado = [...vistos.entries()].find(([, n]) => n >= 3);
  if (calcado) fallas.push(["no repite el mismo mensaje una y otra vez", `un mensaje salió ${calcado[1]} veces: «${calcado[0].slice(0, 50)}…»`]);
  return fallas;
}
