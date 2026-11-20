/**
 * El motor de la flota de Competimotor (perfil `mundillantas`).
 *
 * Igual que `corredor-t115.mjs` (que no se toca: es el de Depot), pero:
 *
 *  - Es un OBJETO POR CARRIL, no un módulo con una base fija: la flota corre
 *    varios carriles en el mismo proceso, cada uno contra su simulador y su
 *    base desechable.
 *  - El turno se da por cerrado LEYENDO HECHOS DE LA BASE, no con pausas
 *    fijas: el último mensaje del cliente quedó guardado, hay una corrida de IA
 *    y un saliente del bot POSTERIORES a él, y nada nuevo apareció durante una
 *    ventana corta (las piezas salen con ~900 ms entre bloques).
 *  - Sabe GUARDAR el estado de la base después del prefijo y RESTAURARLO para
 *    cada variante y repetición (con los relojes corridos al presente, para
 *    que el bot vea la conversación «recién pasada» y no de hace 10 minutos).
 *  - Mide tokens y costo desde `ai_runs`, con la tabla de tarifas de
 *    `src/services/billing.ts` (copiada: este archivo no importa el bot).
 *
 * Regla de Manuel: el estado se lee como HECHO de la base (`conversations`,
 * `quotes`, `ai_runs`, `bot_alerts`, `advisor_notifications`,
 * `guardian_reviews`), nunca parseando el texto del bot.
 */
import postgres from "postgres";
import { TABLAS_DATOS } from "./tablas.mjs";

export const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tarifas USD por millón de tokens — copia de src/services/billing.ts (ago-2026). */
const TARIFAS = {
  "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
  "gpt-5.5-mini": { input: 1, cachedInput: 0.1, output: 6 },
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10 },
  "gpt-4o-transcribe": { input: 2.5, cachedInput: 2.5, output: 10 },
};
function tarifaDe(model) {
  if (TARIFAS[model]) return TARIFAS[model];
  const base = Object.keys(TARIFAS).find((k) => String(model).startsWith(k));
  return base ? TARIFAS[base] : TARIFAS["gpt-5.5"]; // desconocido: el más caro
}

/** Tokens y USD de un conjunto de corridas (OpenAI cuenta los cacheados dentro del input). */
export function costoDe(runs) {
  const t = { corridas: runs.length, input: 0, cacheados: 0, output: 0, razonamiento: 0, usd: 0, porModelo: {} };
  for (const r of runs) {
    const inp = Number(r.input_tokens ?? 0);
    const cached = Math.min(Number(r.cached_input_tokens ?? 0), inp);
    const out = Number(r.output_tokens ?? 0);
    const tf = tarifaDe(r.model);
    const usd = ((inp - cached) * tf.input + cached * tf.cachedInput + out * tf.output) / 1_000_000;
    t.input += inp; t.cacheados += cached; t.output += out; t.razonamiento += Number(r.reasoning_tokens ?? 0); t.usd += usd;
    const m = (t.porModelo[r.model] ??= { corridas: 0, usd: 0 });
    m.corridas += 1; m.usd += usd;
  }
  t.usd = Math.round(t.usd * 10000) / 10000;
  for (const m of Object.values(t.porModelo)) m.usd = Math.round(m.usd * 10000) / 10000;
  return t;
}

/**
 * Las tablas que forman «el estado de una conversación». Todas las de datos
 * menos las que no cuelgan de un chat (migraciones, meses de facturación,
 * sesiones del panel, facturas importadas). El catálogo NO vive en tablas:
 * lo tiene el bot en memoria desde el Excel, y restaurar no lo toca.
 */
export const TABLAS_ESTADO = TABLAS_DATOS.filter((t) =>
  !["schema_migrations", "billing_months", "hub_sessions", "facturas_importadas"].includes(t));

/** Un turno escrito por el escenario → lista de partes que se mandan + pausas. */
export function normalizarTurno(item) {
  if (typeof item === "string") return { partes: [{ texto: item }], pausaEntreMs: null, pausaAntesMs: null };
  if (Array.isArray(item)) return { partes: item.map((p) => (typeof p === "string" ? { texto: p } : p)), pausaEntreMs: null, pausaAntesMs: null };
  if (item && typeof item === "object") {
    const { textos, pausaEntreMs = null, pausaAntesMs = null, ...resto } = item;
    if (Array.isArray(textos)) return { partes: textos.map((p) => (typeof p === "string" ? { texto: p } : p)), pausaEntreMs, pausaAntesMs };
    return { partes: [resto], pausaEntreMs, pausaAntesMs };
  }
  throw new Error(`turno con forma desconocida: ${JSON.stringify(item)}`);
}

const etiquetaParte = (p) => p.texto ?? (p.boton ? `[botón ${p.boton.titulo ?? p.boton.id}]` : p.ubicacion ? "[ubicación]" : p.adjunto ? "[adjunto]" : p.sticker ? "[sticker]" : "[?]");

export class Carril {
  /**
   * @param {{ id:number, ui:string, app:string, db:string, modo:'rapido'|'real', gapMs:number }} o
   */
  constructor({ id, ui, app, db, modo, gapMs, debounceMs }) {
    // debounceMs = la espera del agrupador de ESTE simulador (1500 en los rápidos,
    // 12 000 en los reales). El bot no puede contestar un mensaje antes de que venza.
    Object.assign(this, { id, ui, app, db, modo, gapMs, debounceMs: debounceMs ?? 12_000 });
    this.ultimoEnvio = 0;
    this.sql = postgres(db, { prepare: false, max: 2, onnotice: () => {} });
  }

  async json(url, options) {
    const r = await fetch(url, { signal: AbortSignal.timeout(180_000), ...options });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(body)}`);
    return body;
  }

  /** Producción de Competimotor tiene el bot APAGADO (BOT_POWER_DEFAULT=off, salvo el número de Manuel):
   *  en la base desechable se prende por la misma ruta del panel. */
  activarBot() {
    return this.json(`${this.app}/api/bot-power`, {
      method: "PUT", headers: { "Content-Type": "application/json", "x-admin-key": "sim" },
      // R-44: con «faltantes de arranque» en el perfil, el panel exige confirmar
      // (409 si no). Es lo que haría Manuel al encenderlo; la lista queda en el log.
      body: JSON.stringify({ activo: true, motivo: "flota Competimotor", confirmarFaltantes: true }),
    });
  }

  /**
   * Espera a que el bot no tenga nada pendiente de ESTE teléfono antes de borrar
   * o restaurar la base. El agrupador vive en memoria y agrupa POR TELÉFONO: un
   * mensaje que todavía estaba en su espera cuando se reinició caía en la
   * conversación siguiente (18-nov, lote 1: el «no gracias ya no» de CM40 terminó
   * dentro de CM36). Se exige: venció la espera desde el último envío + 1 s, y
   * 3 s sin filas nuevas. Tope de 90 s.
   */
  async esperarQuieto() {
    const tope = Date.now() + 90_000;
    let firma = "", desde = Date.now();
    while (Date.now() < tope) {
      const [f] = await this.sql`select (select count(*) from messages)::int m, (select count(*) from ai_runs)::int r,
                                        (select count(*) from guardian_reviews)::int g`;
      const k = `${f.m}|${f.r}|${f.g}`;
      if (k !== firma) { firma = k; desde = Date.now(); }
      if (Date.now() >= this.ultimoEnvio + this.debounceMs + 1000 && Date.now() - desde >= 3000) return;
      await pausa(500);
    }
  }

  async reiniciar() {
    await this.esperarQuieto();
    await this.json(`${this.ui}/api/reiniciar`, { method: "POST" });
    // /api/reiniciar borra la conversación; las corridas de IA quedan huérfanas
    // (on delete set null). Se vacía todo el estado para empezar de cero de verdad.
    await this.vaciarEstado();
  }

  /** Vacía las tablas de estado. DELETE y no TRUNCATE: `pending_discount_rules` es
   *  CONFIGURACIÓN y tiene llave foránea a `conversations`; un TRUNCATE ... CASCADE la
   *  borraría. Con `session_replication_role = replica` (solo en esta transacción) los
   *  DELETE no disparan las llaves foráneas ni sus cascadas. */
  async vaciarEstado(tx = null) {
    const borrar = async (q) => {
      await q.unsafe("set local session_replication_role = replica");
      for (const t of TABLAS_ESTADO) await q.unsafe(`delete from "${t}"`);
    };
    if (tx) return borrar(tx);
    await this.sql.begin(borrar);
  }

  /** Foto de la última conversación (hechos de la base). */
  async foto() {
    const sql = this.sql;
    const [conv] = await sql`select * from conversations order by id desc limit 1`;
    if (!conv) return { conv: null, mensajes: [], runs: [], guardian: [], quotes: [], alertas: [], avisos: [], seguimientos: [] };
    const [mensajes, runs, guardian, quotes, alertas, avisos, seguimientos] = await Promise.all([
      sql`select id, direction, author_kind, content, type, cycle, wa_message_id, created_at from messages where conversation_id=${conv.id} order by id`,
      sql`select id, stage, model, route, call_type, tools, error, latency_ms, input_tokens, output_tokens,
                 cached_input_tokens, reasoning_tokens, iterations, created_at
          from ai_runs where conversation_id=${conv.id} order by id`,
      sql`select id, verdict, findings, original_text, corrected_text, created_at from guardian_reviews where conversation_id=${conv.id} order by id`,
      sql`select id, quote_number, total, items, cycle, created_at from quotes where conversation_id=${conv.id} order by id`,
      sql`select id, type, priority, summary, created_at from bot_alerts where conversation_id=${conv.id} order by id`,
      sql`select id, status, cycle, created_at from advisor_notifications where conversation_id=${conv.id} order by id`,
      // Los seguimientos del ciclo (19-nov): «no gracias» los cancela aunque la etapa no cambie.
      sql`select id, type, status, cancel_reason, cycle from follow_up_jobs where conversation_id=${conv.id} order by id`.catch(() => []),
    ]);
    return { conv, mensajes, runs, guardian, quotes, alertas, avisos, seguimientos };
  }

  /** Corridas de IA de TODA la base (incluye las que no se pudieron atar a la conversación). */
  async todasLasCorridas(desdeId = 0) {
    return this.sql`select id, conversation_id, model, route, call_type, error, input_tokens, output_tokens,
                           cached_input_tokens, reasoning_tokens, created_at
                    from ai_runs where id > ${desdeId} order by id`;
  }

  async maxRunId() {
    const [f] = await this.sql`select coalesce(max(id),0)::bigint as n from ai_runs`;
    return Number(f.n);
  }

  async enviar(parte) {
    const r = await this.json(`${this.ui}/api/enviar`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parte),
    });
    if (!r.ok) throw new Error(`el webhook no entró: ${JSON.stringify(r)}`);
    this.ultimoEnvio = Date.now();
  }

  /** Manda las partes de un turno. `gap` = ms entre partes. */
  async mandarPartes(turno, gap) {
    for (let i = 0; i < turno.partes.length; i++) {
      if (i) await pausa(turno.pausaEntreMs ?? gap);
      await this.enviar(turno.partes[i]);
    }
  }

  /**
   * Espera a que el turno cierre, leyendo hechos:
   *   1. el último entrante del cliente está guardado (`messages`),
   *   2. hay un saliente del bot creado DESPUÉS de mi último envío + la espera del
   *      agrupador: antes de eso el bot no puede estar contestando el último mensaje
   *      (lo que llegue antes es la respuesta a una parte anterior todavía en vuelo —
   *      18-nov, lote 1: CM37/CM39/CM40 cerraban 1–6 s después de la última parte),
   *   3. nada nuevo (salientes, corridas, revisiones del guardián, cotizaciones,
   *      alertas) durante: 2,5 s si el guardián ya revisó; 15 s si hubo corrida de
   *      IA pero todavía no revisión (el texto puede venir 8+ s detrás de la pieza:
   *      CM26 r2) o si no hubo corrida (la pieza sale antes de que se escriba la corrida).
   * Devuelve también por qué cerró, para que quede en la salida.
   */
  async esperarCierre({ nEntrantesEsperados, limiteMs = 180_000 }) {
    const inicio = Date.now();
    let firma = "", desde = Date.now(), ultimo = null;
    while (Date.now() - inicio < limiteMs) {
      ultimo = await this.foto();
      const entrantes = ultimo.mensajes.filter((m) => m.direction === "inbound");
      const ultimoEntrante = entrantes.at(-1);
      if (ultimoEntrante && entrantes.length >= nEntrantesEsperados) {
        // Lo que contesta al último mensaje no puede existir antes de que venza el
        // agrupador desde mi último envío (200 ms de holgura por relojes/escrituras).
        const piso = this.ultimoEnvio + this.debounceMs - 200;
        const tras = (x) => new Date(x.created_at).getTime() >= piso;
        const salidas = ultimo.mensajes.filter((m) => m.direction === "outbound" && Number(m.id) > Number(ultimoEntrante.id) && tras(m));
        const runs = ultimo.runs.filter(tras);
        const guard = ultimo.guardian.filter(tras);
        const f = JSON.stringify([ultimo.mensajes.length, ultimo.runs.length, ultimo.guardian.length, ultimo.quotes.length, ultimo.alertas.length, ultimo.avisos.length, ultimo.conv?.stage]);
        if (f !== firma) { firma = f; desde = Date.now(); }
        const conRespuesta = salidas.length > 0;
        const quieto = Date.now() - desde;
        // Sin revisión del guardián, 15 s: el agente manda la PIEZA a mitad de su
        // corrida y la fila de `ai_runs` se escribe al terminar (CM27 r1: la imagen a
        // +3 s, el texto a +13 s, sin corrida registrada en el medio).
        const hace = guard.length ? 2500 : 15_000;
        if (conRespuesta && quieto >= hace) {
          const que = guard.length ? "corrida+saliente+guardián, 2,5 s quieto" : runs.length ? "corrida+saliente sin guardián, 15 s quieto" : "saliente sin corrida de IA, 15 s quieto";
          return { foto: ultimo, cierre: `hechos: ${que}`, ms: Date.now() - inicio };
        }
        // El bot puede decidir no contestar (acuse sobre venta cerrada, bot pausado
        // por asesor…): sin saliente ni corrida tras 25 s quieto, se acepta el silencio.
        if (!conRespuesta && quieto >= 25_000 && Date.now() - inicio > 25_000) {
          return { foto: ultimo, cierre: "silencio: ni corrida ni saliente en 25 s", ms: Date.now() - inicio };
        }
      }
      await pausa(400);
    }
    return { foto: ultimo ?? (await this.foto()), cierre: `límite de ${limiteMs / 1000} s`, ms: Date.now() - inicio, agotado: true };
  }

  /**
   * Corre una lista de turnos y devuelve los turnos con lo que el bot hizo en
   * cada uno. `tiempo: true` respeta `pausaAntesMs` (manda sin esperar el
   * cierre del turno anterior) y `pausaEntreMs`; en modo rápido se ignoran.
   */
  async correrTurnos(items, { tiempo = false } = {}) {
    const turnos = [];
    let i = 0;
    while (i < items.length) {
      // Un «grupo de cierre»: el turno i más los siguientes que traen pausaAntesMs
      // (solo en modo tiempo: el cliente escribe sin esperar al bot).
      const grupo = [normalizarTurno(items[i])];
      let j = i + 1;
      while (tiempo && j < items.length && normalizarTurno(items[j]).pausaAntesMs != null) { grupo.push(normalizarTurno(items[j])); j++; }
      const antes = await this.foto();
      const maxMsg = Math.max(0, ...antes.mensajes.map((m) => Number(m.id)));
      const nRuns = antes.runs.length, nGuard = antes.guardian.length, nQuotes = antes.quotes.length, nAlertas = antes.alertas.length, nAvisos = antes.avisos.length;
      const nEntrantes = antes.mensajes.filter((m) => m.direction === "inbound").length;
      const t0 = Date.now();
      let partes = 0;
      for (const [k, turno] of grupo.entries()) {
        // k=0: pausa tras el cierre del turno anterior; k>0: desde el envío anterior.
        if (tiempo && turno.pausaAntesMs) await pausa(turno.pausaAntesMs);
        await this.mandarPartes(tiempo ? turno : { ...turno, pausaEntreMs: null }, this.gapMs);
        partes += turno.partes.length;
      }
      const { foto, cierre, ms, agotado } = await this.esperarCierre({ nEntrantesEsperados: nEntrantes + partes });
      const nuevos = foto.mensajes.filter((m) => Number(m.id) > maxMsg);
      const runs = foto.runs.slice(nRuns);
      const tools = runs.flatMap((r) => (Array.isArray(r.tools) ? r.tools : [])).map(String);
      turnos.push({
        cliente: grupo.flatMap((g) => g.partes.map(etiquetaParte)).join(" ⧸ "),
        bot: nuevos.filter((m) => m.direction === "outbound").map((m) => ({ texto: m.content, tipo: m.type, autor: m.author_kind })),
        fase: tools.filter((t) => t.startsWith("fase_operativa:")).map((t) => t.slice(15)),
        herramientas: tools.filter((t) => !t.startsWith("fase_operativa:") && !t.startsWith("escalado_a_cerebro")),
        modelos: [...new Set(runs.map((r) => r.model))],
        errores: runs.filter((r) => r.error).map((r) => r.error),
        sinRespuesta: !nuevos.some((m) => m.direction === "outbound"),
        guardian: foto.guardian.slice(nGuard).map((g) => ({ verdict: g.verdict, findings: g.findings, original: g.original_text, corregido: g.corrected_text })),
        cotizacionesNuevas: foto.quotes.length - nQuotes,
        alertasNuevas: foto.alertas.slice(nAlertas).map((a) => ({ tipo: a.type, prioridad: a.priority, resumen: a.summary })),
        avisosNuevos: foto.avisos.length - nAvisos,
        etapa: foto.conv?.stage ?? null,
        cierre, cierreMs: ms, relojMs: Date.now() - t0, ...(agotado ? { agotado: true } : {}),
      });
      i = j;
    }
    return turnos;
  }

  /** `estadoFinal` para los jueces: las llaves de T115 + unas cuantas más. */
  async estadoFinal() {
    const f = await this.foto();
    if (!f.conv) return null;
    const c = f.conv;
    return {
      stage: c.stage, status: c.status, tire_size: c.tire_size, selected_quantity: c.selected_quantity,
      selected_product_code: c.selected_product_code, nearest_store: c.nearest_store,
      visit_date: c.visit_date, visit_time_label: c.visit_time_label, current_cycle: c.current_cycle,
      cotizaciones: f.quotes.map((q) => ({ numero: q.quote_number, total: Number(q.total), items: q.items, cycle: q.cycle })),
      alertas: f.alertas.map((a) => ({ tipo: a.type, prioridad: a.priority, resumen: a.summary })),
      avisos_asesor: f.avisos.length,
      seguimientos: (f.seguimientos ?? []).map((j) => ({ tipo: j.type, estado: j.status, motivo: j.cancel_reason, cycle: j.cycle })),
      sin_revision: f.guardian.filter((g) => g.verdict === "sin_revision").length,
      guardian: f.guardian.map((g) => ({ verdict: g.verdict, findings: g.findings })),
      conversacion: Object.fromEntries(Object.entries(c).filter(([k]) => !/phone|name/.test(k))),
    };
  }

  /** La transcripción completa, como quedó guardada. */
  async transcripcion() {
    const f = await this.foto();
    return f.mensajes.map((m) => ({ id: Number(m.id), de: m.author_kind ?? m.direction, tipo: m.type, texto: m.content, ciclo: m.cycle, en: m.created_at }));
  }

  // ───────────────────────── guardar / restaurar ─────────────────────────

  /** Copia en memoria de todas las tablas de estado. Se puede restaurar en CUALQUIER carril
   *  (todas las bases copian la misma configuración con los mismos ids). */
  async guardarEstado() {
    const tablas = {};
    for (const t of TABLAS_ESTADO) {
      const filas = await this.sql.unsafe(`select * from "${t}" order by 1`);
      tablas[t] = filas.map((f) => ({ ...f }));
    }
    const cols = await this.sql`select table_name, column_name, data_type from information_schema.columns
      where table_schema='public' and table_name = any(${TABLAS_ESTADO})`;
    const tipos = {};
    for (const c of cols) (tipos[c.table_name] ??= {})[c.column_name] = c.data_type;
    return { guardadoEn: Date.now(), tablas, tipos, maxRun: await this.maxRunId() };
  }

  /**
   * Restaura el estado guardado: vacía las tablas de estado (DELETE) y reinserta todo,
   * con los triggers de llaves foráneas apagados SOLO en esa transacción
   * (`session_replication_role = replica`: el orden de inserción deja de
   * importar). Los relojes (`timestamptz`) se corren al presente: la
   * conversación queda tan «reciente» como cuando se guardó. Devuelve el
   * conteo por tabla, que se compara contra lo guardado.
   */
  async restaurarEstado(estado) {
    await this.esperarQuieto();
    const corrimientoMs = Date.now() - estado.guardadoEn;
    await this.sql.begin(async (tx) => {
      await this.vaciarEstado(tx); // deja replica puesta para los inserts

      for (const [t, filas] of Object.entries(estado.tablas)) {
        const tipos = estado.tipos[t] ?? {};
        for (const fila of filas) {
          const lista = Object.fromEntries(Object.entries(fila).map(([k, v]) => {
            const tp = tipos[k];
            if (v === null || v === undefined) return [k, null];
            if (tp === "json" || tp === "jsonb") return [k, tx.json(v)];
            if (tp?.startsWith("timestamp") && v instanceof Date) return [k, new Date(v.getTime() + corrimientoMs)];
            return [k, v];
          }));
          await tx`insert into ${tx(t)} ${tx(lista)}`;
        }
        // Solo las tablas con columna id (conversation_summaries no tiene): un error de
        // pg_get_serial_sequence dentro de la transacción la abortaría entera.
        if (!tipos.id) continue;
        const [s] = await tx`select pg_get_serial_sequence(${t}, 'id') as seq`;
        if (s?.seq) await tx.unsafe(`select setval($1, greatest(coalesce((select max(id) from "${t}"),0),1))`, [s.seq]);
      }
    });
    const conteo = {};
    for (const t of TABLAS_ESTADO) {
      const [f] = await this.sql.unsafe(`select count(*)::int as n from "${t}"`);
      conteo[t] = f.n;
    }
    const distintas = Object.entries(estado.tablas).filter(([t, filas]) => conteo[t] !== filas.length).map(([t, filas]) => `${t}: ${conteo[t]} ≠ ${filas.length}`);
    if (distintas.length) throw new Error(`la restauración no quedó igual a lo guardado (${distintas.join(", ")})`);
    return { conteo, corrimientoMs };
  }

  async cerrar() { await this.sql.end({ timeout: 3 }).catch(() => {}); }
}

/**
 * ¿El estado tras el prefijo es el que el escenario declara?
 * Acepta función, lista de [nombre, fn] u objeto de hechos (ver la nota de formato).
 * Devuelve la lista de fallas (vacía = se cumple).
 */
export function verificarEstadoEsperado(esperado, estado) {
  if (esperado == null) return [];
  const fallas = [];
  const correr = (nombre, fn) => {
    let m = null;
    try { m = fn(estado); } catch (e) { m = `el verificador reventó: ${e.message}`; }
    if (m) fallas.push(`${nombre}: ${m}`);
  };
  if (typeof esperado === "function") { correr("estadoEsperadoPrefijo", esperado); return fallas; }
  if (Array.isArray(esperado)) { for (const [n, fn] of esperado) correr(n, fn); return fallas; }
  if (!estado) return ["no hay conversación en la base"];
  const plano = { ...(estado.conversacion ?? {}), ...estado };
  for (const [campo, quiero] of Object.entries(esperado)) {
    const hay = plano[campo];
    if (typeof quiero === "function") { correr(campo, () => quiero(hay, estado)); continue; }
    if (quiero instanceof RegExp) { if (!quiero.test(String(hay ?? ""))) fallas.push(`${campo}: ${JSON.stringify(hay)} no calza con ${quiero}`); continue; }
    if (quiero === true) { if (hay == null || (Array.isArray(hay) && !hay.length)) fallas.push(`${campo}: vacío`); continue; }
    if (typeof quiero === "number" && Array.isArray(hay)) { if (hay.length < quiero) fallas.push(`${campo}: ${hay.length} < ${quiero}`); continue; }
    if (Array.isArray(quiero)) { if (!quiero.map(String).includes(String(hay))) fallas.push(`${campo}: ${JSON.stringify(hay)} no es ninguno de ${JSON.stringify(quiero)}`); continue; }
    if (String(hay) !== String(quiero)) fallas.push(`${campo}: es ${JSON.stringify(hay)}, se esperaba ${JSON.stringify(quiero)}`);
  }
  return fallas;
}
