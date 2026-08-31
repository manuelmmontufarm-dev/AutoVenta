#!/usr/bin/env node
/**
 * Las 10 conversaciones REALES de producción, con veredicto automático.
 *
 * Los mensajes del cliente salen de `messages` de producción, sin editar
 * (ver datos/historicas-10.json). Cada comprobación nace de una falla que se
 * midió el 30-ago-2026 contra `main` 0a83522; si vuelve a fallar, volvió el bug.
 *
 *   node scripts/sim/pruebas-10.mjs --rapido        # 0 tokens, ~1 s
 *   node scripts/sim/pruebas-10.mjs                 # las 10 (necesita npm run sim)
 *   node scripts/sim/pruebas-10.mjs --conv 8318     # una sola
 *   node scripts/sim/pruebas-10.mjs --base linea-base.json   # compara contra una corrida vieja
 *   node scripts/sim/pruebas-10.mjs --desde corrida.json     # re-juzga una corrida guardada (0 tokens)
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const AQUI = dirname(fileURLToPath(import.meta.url));
const UI = process.env.SIM_UI_URL ?? "http://127.0.0.1:3210";
const APP = process.env.SIM_APP_URL ?? "http://127.0.0.1:3205";
const DB = process.env.SIM_DATABASE_URL ?? "postgresql://manue@localhost/autoventa_sim";

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const tiene = (n) => process.argv.includes(n);
const SOLO = arg("--conv") ? Number(arg("--conv")) : null;
const BASE = arg("--base");
const DESDE = arg("--desde");
const SALIDA = arg("--salida") ?? join(AQUI, "pruebas-10-resultado.json");

// ───────────────────────────────────────────────────────────────────
// PARTE 1 · Comprobaciones que no gastan un token
// ───────────────────────────────────────────────────────────────────

/** Formatos que clientes reales escribieron. El lector de medidas del bot los lee todos. */
const MEDIDAS_REALES = [
  "235/75/15", "195/50/16", "205/55/16", "165/80/R13", "205 55 16", "255 70 R16",
  "225/65R17", "185/70R14", "195/55R15", "265/65R17", "33x12.50r17", "31X10.5R15",
  "205/55 rin 16", "255 70 r 16",
];

/** Toda fase tiene que poder derivar a un humano y poder mostrar una llanta. */
const BUSQUEDA = ["buscar_llanta", "buscar_catalogo", "buscar_por_aro_y_tipo", "preparar_opciones"];
const FASES_VENTA = ["nuevo", "medida_confirmada", "seleccionando", "cotizacion_enviada", "seguimiento_venta"];

async function preflight() {
  const fallos = [];
  const dist = join(AQUI, "../../dist");
  let fase, tire;
  try {
    fase = await import(`${dist}/agent/faseOperativa.js`);
    tire = await import(`${dist}/domain/tireSize.js`);
  } catch {
    console.log("⚠️  Falta compilar (`npm run build`) — me salto las comprobaciones rápidas.\n");
    return { fallos: [], saltado: true };
  }

  // A · El selector de fase entiende las medidas que el bot ya sabe leer.
  const noReconocidas = MEDIDAS_REALES.filter((m) => {
    const laLee = tire.extractTireSizes(m).length > 0;
    const f = fase.elegirFaseOperativa({ etapaGuardada: "nuevo", texto: m, tieneCotizacion: false });
    return laLee && f !== "medida_confirmada";
  });
  if (noReconocidas.length) {
    fallos.push(`A · el selector no reconoce ${noReconocidas.length}/${MEDIDAS_REALES.length} medidas que el lector real sí lee: ${noReconocidas.join(", ")}`);
  }

  // B · Ninguna fase de venta puede quedar sin cómo derivar ni cómo buscar (dead-state).
  if (fase.herramientasParaElTurno) {
    const todas = [...BUSQUEDA, "notificar_vendedor", "generar_cotizacion", "reenviar_cotizacion",
      "enviar_comparacion", "respaldo_marcas", "local_mas_cercano", "ubicacion_locales",
      "agendar_visita", "guia_medida", "opciones_sin_medida", "tipos_de_llanta", "fitment_vehiculo"];
    for (const f of FASES_VENTA) {
      const t = fase.herramientasParaElTurno(f, todas);
      if (!t.includes("notificar_vendedor")) fallos.push(`B · fase "${f}" no puede avisar a un asesor (sin notificar_vendedor)`);
      if (!BUSQUEDA.some((b) => t.includes(b))) fallos.push(`B · fase "${f}" no puede mostrar una llanta (sin herramientas de búsqueda)`);
    }
  }

  // C · Frases reales que no deben desviar la fase.
  const TRAMPAS = [
    ["nuevo", "es una camioneta que me van a entregar el día jueves de esta semana", "seguimiento_venta", "un día de la semana no es pedir una visita"],
    ["medida_confirmada", "Voy a revisar, con éste precio, no me alcanza el presupuesto", "cotizacion_enviada", "una queja de precio no es pedir que cotices"],
    ["seguimiento_venta", "ya tengo una oferta de llantas 195/50/16", "nuevo", "«tengo una oferta» no es un vehículo"],
  ];
  for (const [etapa, texto, malo, porque] of TRAMPAS) {
    const f = fase.elegirFaseOperativa({ etapaGuardada: etapa, texto, tieneCotizacion: true });
    if (f === malo) fallos.push(`C · «${texto.slice(0, 45)}…» manda a "${malo}" — ${porque}`);
  }
  return { fallos, saltado: false };
}

// ───────────────────────────────────────────────────────────────────
// PARTE 2 · Las 10 conversaciones contra el bot de verdad
// ───────────────────────────────────────────────────────────────────

const LOCAL_Q = /¿\s*a cu[áa]l local|¿le queda mejor\s+\*?cumbay|cumbay[áa]\s*\*?\s*o\s*\*?\s*quito sur\s*\*?\s*\?/i;
const PROMETE_ASESOR = /(?:asesor|vendedor)[^.]{0,60}(?:revis|confirm|ayud|contact|respond)|le aviso a (?:un|el) asesor|dej[éo] el caso con/i;
const NIEGA_DATO = /no (?:lo )?tengo (?:el |un |ese )?(?:dato|precio|horario|confirmad)|no me aparece confirmad/i;

/** Una comprobación mira los turnos ya corridos y devuelve null (pasó) o el motivo. */
const CASOS = {
  8318: {
    titulo: "Dio la medida como 235/75/15 después de elegir local",
    checks: [
      ["muestra llantas cuando el cliente da la medida", (t) => {
        const i = t.findIndex((x) => /235\/75\/15/.test(x.cliente));
        if (i < 0) return "no encontré el turno de la medida";
        const usa = (t[i].herramientas ?? []).some((h) => BUSQUEDA.includes(h));
        return usa ? null : `turno ${i + 1}: no usó ninguna herramienta de búsqueda (usó: ${(t[i].herramientas ?? []).join(",") || "ninguna"})`;
      }],
      ["no afirma stock sin haberlo consultado", (t) => {
        for (const [i, x] of t.entries()) {
          const dice = x.bot.some((b) => /s[íi],? (?:tenemos|tengo) la medida/i.test(b.texto));
          if (dice && !(x.herramientas ?? []).some((h) => BUSQUEDA.includes(h))) return `turno ${i + 1}: dijo "sí tenemos la medida" sin consultar catálogo`;
        }
        return null;
      }],
      ["llega a mostrar opciones o cotizar", (t, e) => (e.quotes.length || t.some((x) => x.bot.some((b) => b.tipo !== "text"))) ? null : "12 turnos sin una sola pieza ni cotización"],
    ],
  },
  8288: {
    titulo: "Quiere UNA llanta 165/80R13, que no hay",
    checks: [
      ["si promete asesor, lo avisa de verdad", (t) => {
        const promete = t.findIndex((x) => x.bot.some((b) => PROMETE_ASESOR.test(b.texto)));
        if (promete < 0) return null;
        const aviso = t.some((x) => (x.herramientas ?? []).includes("notificar_vendedor"));
        return aviso ? null : `promete asesor desde el turno ${promete + 1} y nunca llama notificar_vendedor`;
      }],
      ["no repite el mismo mensaje una y otra vez", (t) => repetido(t, 4)],
    ],
  },
  9887: {
    titulo: "Cotizó y se fue a comparar a Ibarra; termina con «Ya compre»",
    checks: [
      ["no pregunta el local después de «No gracias»", (t) => trasDe(t, /^no gracias/i, LOCAL_Q, "la pregunta del local")],
      ["no pregunta el local después de «Ya compre»", (t) => trasDe(t, /ya compre/i, LOCAL_Q, "la pregunta del local")],
      ["no repite la pregunta del local en turnos seguidos", (t) => seguidos(t, LOCAL_Q, "la pregunta del local")],
    ],
  },
  11274: {
    titulo: "Pidió Falken y preguntó fabricación y frenado en mojado",
    checks: [
      ["contesta si hay Falken o no", (t) => {
        const i = t.findIndex((x) => /en falken/i.test(x.cliente));
        if (i < 0) return null;
        return /falken/i.test(t[i].bot.map((b) => b.texto).join(" ")) ? null : `turno ${i + 1}: pidió Falken explícitamente y la respuesta ni la nombra`;
      }],
      ["responde las preguntas técnicas", (t) => {
        const malos = [];
        for (const [i, x] of t.entries()) {
          if (!/fabricaci[óo]n|frenado en mojado|dura m[áa]s|garant[íi]a/i.test(x.cliente)) continue;
          const texto = x.bot.map((b) => b.texto).join(" ");
          const uso = (x.herramientas ?? []).some((h) => ["respaldo_marcas", "enviar_comparacion"].includes(h));
          if (!uso && NIEGA_DATO.test(texto)) malos.push(`turno ${i + 1} («${x.cliente.slice(0, 32)}»)`);
        }
        return malos.length ? `dijo "no tengo el dato" sin usar respaldo_marcas en ${malos.join(", ")}` : null;
      }],
    ],
  },
  11620: {
    titulo: "Peugeot 206: descartó la 205 por roce y el perfil bajo por los baches",
    checks: [
      ["no vuelve a ofrecer la 205 que ya rechazó", (t) => {
        const i = t.findIndex((x) => /205 muy ancha/i.test(x.cliente));
        if (i < 0) return null;
        const reincide = t.slice(i + 1).findIndex((x) => x.bot.some((b) => /\b205\/5[05]\s*R?16\b/i.test(b.texto) && !/no le recomend|no conviene|ya comprob|rozan/i.test(b.texto)));
        return reincide < 0 ? null : `turno ${i + 2 + reincide}: vuelve a ofrecer la 205 después del rechazo`;
      }],
      ["no repite la misma pieza de opciones", (t) => repetido(t, 3)],
    ],
  },
  12682: {
    titulo: "Preguntó por un cambio de aceite (no vende eso)",
    checks: [
      ["no afirma que hacen cambio de aceite", (t) => {
        for (const [i, x] of t.entries()) {
          const txt = x.bot.map((b) => b.texto).join(" ");
          if (/s[íi],? (?:le )?(?:podemos|hacemos|realizamos)[^.]{0,40}(?:cambio de aceite|aceite)/i.test(txt)) return `turno ${i + 1}: afirma el servicio`;
          if (/s[íi],? puede llevar su (?:propio )?aceite/i.test(txt)) return `turno ${i + 1}: afirma que puede llevar su aceite`;
        }
        return null;
      }],
      ["no inventa horarios", (t) => {
        const hay = t.some((x) => (x.guardian ?? []).some((g) => (g.findings ?? []).some((f) => /horario/i.test(f.detalle ?? ""))));
        return hay ? "el guardián marcó los horarios (revisar si son ciertos y si él los recibe)" : null;
      }],
    ],
  },
  10002: {
    titulo: "No quería comprar: quería que le recibieran sus llantas nuevas",
    checks: [["no promete recibir llantas usadas", (t) => {
      for (const [i, x] of t.entries()) if (x.bot.some((b) => /s[íi],? (?:le )?(?:recibimos|aceptamos|tomamos)[^.]{0,30}llantas/i.test(b.texto))) return `turno ${i + 1}: promete recompra`;
      return null;
    }]],
  },
  7946: {
    titulo: "Cambió de medida tres veces y terminó en «No gracias»",
    checks: [
      ["no pregunta el local después de «No gracias»", (t) => trasDe(t, /^no gracias/i, LOCAL_Q, "la pregunta del local")],
      ["atiende el cambio de medida en vez de seguir cerrando", (t) => {
        const i = t.findIndex((x) => /185\/70R15/i.test(x.cliente));
        if (i < 0) return null;
        return (t[i].herramientas ?? []).some((h) => BUSQUEDA.includes(h)) ? null : `turno ${i + 1}: pidió otra medida y no buscó`;
      }],
    ],
  },
  9684: {
    titulo: "Camino feliz: aro 15 → foto → medida → cotización → visita",
    checks: [
      ["cierra la venta", (t, e) => e.quotes.length ? null : "no llegó a cotizar"],
      ["no reabre la venta después de «ya compré»", (t) => trasDe(t, /ya compr[ée]/i, /¿qu[ée] d[íi]a|a cu[áa]l local|le cotizo/i, "un empuje comercial")],
    ],
  },
  10859: {
    titulo: "Llantas industriales de montacargas, nueve fotos",
    checks: [
      ["no cotiza una llanta industrial", (t, e) => e.quotes.length ? `cotizó ${e.quotes[0].quote_number} y ninguna de estas medidas es del catálogo` : null],
      ["deriva el caso a un asesor", (t) => t.some((x) => (x.herramientas ?? []).includes("notificar_vendedor")) ? null : "nunca llamó notificar_vendedor"],
    ],
  },
};

// ── ayudantes de comprobación ──────────────────────────────────────
const textoDe = (x) => x.bot.map((b) => b.texto).join("\n");

/** ¿El bot hizo `re` en el turno donde el cliente dijo `dijo`? */
function trasDe(turnos, dijo, re, queCosa) {
  const i = turnos.findIndex((x) => dijo.test(x.cliente.trim()));
  if (i < 0) return null;
  return re.test(textoDe(turnos[i])) ? `turno ${i + 1}: después de «${turnos[i].cliente.slice(0, 30)}» sale ${queCosa}` : null;
}

/** ¿`re` aparece en dos turnos seguidos? */
function seguidos(turnos, re, queCosa) {
  for (let i = 1; i < turnos.length; i += 1) {
    if (re.test(textoDe(turnos[i])) && re.test(textoDe(turnos[i - 1]))) return `turnos ${i} y ${i + 1}: ${queCosa} dos veces seguidas`;
  }
  return null;
}

/** ¿Algún mensaje del bot se repite casi igual `n` veces o más? */
function repetido(turnos, n) {
  const huella = (s) => s.toLowerCase().replace(/[^a-záéíóúñ0-9 ]/g, "").split(/\s+/).slice(0, 14).join(" ");
  const cuenta = new Map();
  for (const t of turnos) for (const b of t.bot) { if (b.tipo !== "text" || b.texto.length < 40) continue; const h = huella(b.texto); cuenta.set(h, (cuenta.get(h) ?? 0) + 1); }
  for (const [h, c] of cuenta) if (c >= n) return `repitió ${c} veces casi el mismo mensaje: «${h.slice(0, 60)}…»`;
  return null;
}

/** Comprobaciones que corren en TODAS las conversaciones. */
const GLOBALES = [
  ["ningún turno se queda sin respuesta", (t) => { const i = t.findIndex((x) => x.sinRespuesta); return i < 0 ? null : `turno ${i + 1} sin respuesta`; }],
  ["ninguna corrida de IA con error", (t) => { const i = t.findIndex((x) => x.errores?.length); return i < 0 ? null : `turno ${i + 1}: ${JSON.stringify(t[i].errores)}`; }],
  ["el guardián no marca insistencia tras rechazo", (t) => {
    const malos = t.map((x, i) => (x.guardian ?? []).some((g) => (g.findings ?? []).some((f) => f.categoria === "insiste_tras_rechazo")) ? i + 1 : null).filter(Boolean);
    return malos.length ? `turnos ${malos.join(", ")}` : null;
  }],
];

// ───────────────────────────────────────────────────────────────────
// Motor: manda los mensajes y espera a que el turno cierre
// ───────────────────────────────────────────────────────────────────
const sql = postgres(DB, { prepare: false, max: 1 });
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(url, options) {
  const r = await fetch(url, options);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(body)}`);
  return body;
}
const activarBot = () => json(`${APP}/api/bot-power`, {
  method: "PUT", headers: { "Content-Type": "application/json", "x-admin-key": "sim" },
  body: JSON.stringify({ activo: true, motivo: "lote de 10 conversaciones históricas" }),
});
const reiniciar = async () => { await json(`${UI}/api/reiniciar`, { method: "POST" }); await pausa(200); };

async function snapshot() {
  const [conv] = await sql`select id, stage, tire_size, selected_quantity, nearest_store, visit_date, status
    from conversations order by id desc limit 1`;
  if (!conv) return { conv: null, mensajes: [], runs: [], guardian: [], quotes: [], alertas: [] };
  const [mensajes, runs, guardian, quotes, alertas] = await Promise.all([
    sql`select id, author_kind, content, type from messages where conversation_id=${conv.id} order by id`,
    sql`select id, stage, model, tools, error from ai_runs where conversation_id=${conv.id} order by id`,
    sql`select id, verdict, findings, original_text, corrected_text from guardian_reviews where conversation_id=${conv.id} order by id`,
    sql`select id, quote_number, total from quotes where conversation_id=${conv.id} order by id`,
    sql`select id, type, priority, summary from bot_alerts where conversation_id=${conv.id} order by id`,
  ]);
  return { conv, mensajes, runs, guardian, quotes, alertas };
}

async function mandar(texto) {
  const antes = await snapshot();
  const maxBot = Math.max(0, ...antes.mensajes.filter((m) => m.author_kind === "bot").map((m) => Number(m.id)));
  const nRuns = antes.runs.length, nGuard = antes.guardian.length;
  await json(`${UI}/api/enviar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
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
  const tools = runs.flatMap((r) => Array.isArray(r.tools) ? r.tools : []).map(String);
  return {
    cliente: texto,
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

// ───────────────────────────────────────────────────────────────────
const V = { ok: "\x1b[32m", mal: "\x1b[31m", gris: "\x1b[90m", neg: "\x1b[1m", fin: "\x1b[0m" };
const c = (k, s) => `${V[k]}${s}${V.fin}`;

console.log(c("neg", "\n  Las 10 conversaciones reales de Depot Tire\n"));

const pre = await preflight();
if (!pre.saltado) {
  console.log(c("neg", "  Comprobaciones rápidas (0 tokens)"));
  if (!pre.fallos.length) console.log("  " + c("ok", "✓") + " el selector de fase entiende las medidas, ninguna fase queda sin herramientas, y las frases trampa no la desvían");
  else for (const f of pre.fallos) console.log("  " + c("mal", "✗") + " " + f);
  console.log();
}
if (tiene("--rapido")) { await sql.end(); process.exit(pre.fallos.length ? 1 : 0); }

const casos = JSON.parse(await readFile(join(AQUI, "datos/historicas-10.json"), "utf8")).filter((x) => !SOLO || x.conv === SOLO);
const base = BASE ? JSON.parse(await readFile(BASE, "utf8")) : null;

// Re-juzgar una corrida guardada: mismas comprobaciones, sin tocar el simulador.
// Sirve para sacar la línea base de una corrida vieja sin volver a gastar tokens.
const guardada = DESDE
  ? new Map(JSON.parse(await readFile(DESDE, "utf8")).map((c) => [c.conv, c]))
  : null;

if (!guardada) await activarBot();
const salida = [];
let totalOk = 0, totalNo = 0, sinRev = 0, corr = 0, turnos = 0;

for (const caso of casos) {
  const meta = CASOS[caso.conv] ?? { titulo: "", checks: [] };
  process.stdout.write(`  ${c("neg", "conv " + caso.conv)} ${c("gris", meta.titulo)}\n`);
  let t, estado;
  if (guardada) {
    const g = guardada.get(caso.conv);
    if (!g) { console.log(c("gris", "    (no está en la corrida guardada)\n")); continue; }
    t = g.turnos;
    const r = g.resultadoSimulador ?? g.estadoFinal ?? {};
    estado = { conv: { stage: r.stage, tire_size: r.medida }, quotes: r.cotizaciones ?? [], alertas: [] };
    console.log(c("gris", `    (re-juzgando ${t.length} turnos guardados)`));
  } else {
    await reiniciar(); await activarBot();
    t = [];
    for (const texto of caso.mensajes) {
      process.stdout.write(c("gris", `    · ${texto.slice(0, 44).replace(/\n/g, " ")}`));
      let turno;
      try { turno = await mandar(texto); }
      catch (e) { turno = { cliente: texto, bot: [], errores: [String(e)], sinRespuesta: true, guardian: [], herramientas: [], fase: [] }; }
      process.stdout.write(c("gris", ` → ${turno.bot.length}\n`));
      t.push(turno);
    }
    estado = t.at(-1)?._estado ?? await snapshot();
  }
  turnos += t.length;
  for (const x of t) for (const g of x.guardian ?? []) { if (g.verdict === "sin_revision") sinRev++; if (g.verdict === "corregir") corr++; }

  const res = [];
  for (const [nombre, fn] of [...GLOBALES, ...meta.checks]) {
    let motivo = null;
    try { motivo = fn(t, estado); } catch (e) { motivo = `la comprobación reventó: ${e.message}`; }
    res.push({ nombre, ok: !motivo, motivo });
    console.log(`      ${motivo ? c("mal", "✗") : c("ok", "✓")} ${nombre}${motivo ? c("mal", " — " + motivo) : ""}`);
    motivo ? totalNo++ : totalOk++;
  }
  const antes = base?.find((b) => b.conv === caso.conv);
  if (antes) {
    const arreglados = res.filter((r) => r.ok && antes.checks.find((a) => a.nombre === r.nombre && !a.ok)).map((r) => r.nombre);
    const rotos = res.filter((r) => !r.ok && antes.checks.find((a) => a.nombre === r.nombre && a.ok)).map((r) => r.nombre);
    if (arreglados.length) console.log("      " + c("ok", "▲ se arregló: ") + arreglados.join(" · "));
    if (rotos.length) console.log("      " + c("mal", "▼ se rompió: ") + rotos.join(" · "));
  }
  salida.push({ conv: caso.conv, titulo: meta.titulo, checks: res, turnos: t.map(({ _estado, ...r }) => r),
    estadoFinal: { stage: estado.conv?.stage, medida: estado.conv?.tire_size, cotizaciones: estado.quotes.length,
      alertas: estado.alertas.map((a) => `${a.type}/${a.priority}`) } });
  await writeFile(SALIDA, JSON.stringify(salida, null, 2));
  console.log();
}

console.log(c("neg", "  ─────────────────────────────────────────"));
console.log(`  comprobaciones: ${c("ok", totalOk + " pasaron")}${totalNo ? " · " + c("mal", totalNo + " fallaron") : ""}`);
console.log(c("gris", `  ${turnos} turnos · guardián: ${corr} correcciones, ${sinRev} sin revisar (${Math.round(100 * sinRev / turnos)}%)`));
console.log(c("gris", `  detalle → ${SALIDA}\n`));
await sql.end();
process.exit(totalNo || pre.fallos.length ? 1 : 0);
