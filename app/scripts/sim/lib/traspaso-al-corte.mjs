/**
 * Quién tenía el chat en el instante del corte (`--copiar-conv N --hasta ISO`).
 *
 * La copia con corte devolvía SIEMPRE el chat al bot sin pausa. Para casi todo
 * eso alcanza, pero deja afuera justo la familia de los chats mudos (auditoría
 * del 19-oct, familia 4): un chat pausado por un `advisor_review`, o con la
 * última palabra de una persona, se copiaba como un chat del bot y el bot
 * contestaba en el simulador lo que en producción calló. El error
 * «desaparecía» sin tocar una línea.
 *
 * Se reconstruye desde los hechos que sí quedan con fecha, en orden:
 *
 *  · un saliente de una persona (`owner`/`advisor`) → el eco o el panel pasan
 *    el chat a humano con la pausa de `BOT_PAUSE_HOURS` desde ese instante;
 *  · un `advisor_review` ejecutado → humano, pausa desde que corrió. Antes del
 *    arreglo del 28-sep (fc771df, publicado el 29) esa pausa era 'infinity',
 *    y ese valor heredado es el que hizo tirar el webhook el 14-oct;
 *  · un saliente del bot → el chat era del bot (nadie habla con el chat pausado).
 *
 * Es una reconstrucción, no una copia: lo que no deja rastro con fecha (un
 * «devolver al bot» desde el panel, por ejemplo) no se ve. Se imprime para que
 * quien prueba sepa con qué estado arrancó.
 */
const PAUSA_FINITA_DESDE = new Date("2026-09-29T00:00:00Z");
const AUTORES_HUMANOS = new Set(["owner", "advisor"]);

export function traspasoAlCorte({ mensajes, jobs, corte, horasDePausa = 6 }) {
  const eventos = [];
  for (const m of mensajes) {
    if (m.direction !== "outbound" || m.type === "note") continue;
    const t = new Date(m.created_at);
    if (t >= corte) continue;
    if (AUTORES_HUMANOS.has(m.author_kind)) eventos.push({ t, tipo: "persona" });
    else if (m.author_kind === "bot") eventos.push({ t, tipo: "bot" });
  }
  for (const j of jobs) {
    if (j.type !== "advisor_review" || j.status !== "sent" || !j.executed_at) continue;
    const t = new Date(j.executed_at);
    if (t < corte) eventos.push({ t, tipo: "revision" });
  }
  eventos.sort((a, b) => a.t - b.t);
  let estado = { assigned_to: "bot", bot_paused_until: null, bot_paused_reason: null };
  const horas = (t) => new Date(t.getTime() + horasDePausa * 3_600_000);
  for (const e of eventos) {
    if (e.tipo === "bot") estado = { assigned_to: "bot", bot_paused_until: null, bot_paused_reason: null };
    else if (e.tipo === "persona") estado = { assigned_to: "human", bot_paused_until: horas(e.t), bot_paused_reason: "persona_escribio" };
    else estado = {
      assigned_to: "human",
      bot_paused_until: e.t < PAUSA_FINITA_DESDE ? "infinity" : horas(e.t),
      bot_paused_reason: "revision_automatica",
    };
  }
  return estado;
}

/**
 * Los seguimientos tal como estaban en el corte: los creados después no
 * existían; los que se ejecutaron o cancelaron después todavía estaban
 * agendados. Sin ellos el worker del simulador veía un chat sin plan y le
 * creaba un `advisor_review` al arrancar, cosa que en producción no pasó.
 */
export function jobsAlCorte(jobs, corte) {
  return jobs
    .filter((j) => new Date(j.created_at) < corte)
    .map((j) => {
      const ejecutado = j.executed_at ? new Date(j.executed_at) : null;
      if (!ejecutado || ejecutado < corte) return j;
      return { ...j, status: "scheduled", executed_at: null, cancel_reason: null, locked_at: null, locked_by: null };
    });
}
