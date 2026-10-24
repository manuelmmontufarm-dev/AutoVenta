#!/usr/bin/env node
/**
 * Gráficos de control del canary en PRODUCCIÓN (Six Sigma, fase I / fase II).
 *
 * Desde el 24-oct-2026 los teléfonos que terminan en dígito PAR atienden con
 * vendedor gpt-5.4 + Guardián gpt-5.4-mini (grupo «canary»); los IMPARES siguen
 * con gpt-5.5 (grupo «control»). Este script lee la base de producción en modo
 * solo lectura y dibuja, día por día y por grupo:
 *
 *   1. Costo de IA por conversación (gráfico I, individuos)
 *   2. Ahorro acumulado en dólares (lo que habría costado con gpt-5.5 − lo pagado)
 *   3. % de chats con cotización (gráfico p)
 *   4. % de chats con día de visita acordado (gráfico p)
 *   5. % de borradores que el Guardián tuvo que corregir (gráfico p)
 *   6. Fallas técnicas por cada 100 corridas del vendedor (gráfico u)
 *   7. Ventas comprobadas contra facturas de Contífico por semana (gráfico c)
 *
 * Fase I = días ANTES del canary (los dos grupos corrían igual: es una prueba
 * A/A que mide el ruido natural). Sus datos fijan la línea central y los
 * límites de ±3σ. Fase II = días con el canary: cada punto se juzga contra
 * esos límites. Reglas de señal: un punto fuera de ±3σ, u 8 puntos seguidos
 * del mismo lado de la línea central.
 *
 *   node scripts/canary/control-charts.mjs            # escribe el HTML y dice dónde
 *   node scripts/canary/control-charts.mjs --salida ruta.html
 *
 * Necesita DATABASE_URL de producción en app/.env y, para las ventas, ADMIN_KEY
 * (variable de entorno o la lee del servicio con el CLI de Railway).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import postgres from "postgres";

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const APP = resolve(import.meta.dirname, "../..");
const env = Object.fromEntries(readFileSync(resolve(APP, ".env"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const DB = process.env.PROD_DATABASE_URL ?? env.DATABASE_URL;
const TZ = "America/Guayaquil";

/** El canary 50/50 se prendió el 24-oct-2026 a media mañana (commit 6d483ce): ese día es de TRANSICIÓN
 *  (mitad con el bot viejo) y no cuenta ni para los límites ni como señal. La fase II arranca el 25. */
const TRANSICION = arg("transicion", "2026-10-24");
const INICIO_CANARY = arg("inicio", "2026-10-25");
/** Fase I: desde que se prendieron los anuncios de octubre, para comparar tráfico parecido. */
const INICIO_BASE = arg("base", "2026-10-13");
/** Los últimos días no han madurado: una cotización o un día de visita llegan hasta 48 h después. */
const DIAS_INMADUROS = 2;

const TARIFAS = {
  "gpt-5.5": { input: 5, cached: 0.5, output: 30 },
  "gpt-5.4": { input: 2.5, cached: 0.25, output: 15 },
  "gpt-5.4-mini": { input: 0.75, cached: 0.075, output: 4.5 },
  "gpt-4o-transcribe": { input: 2.5, cached: 2.5, output: 10 },
};
const tarifa = (m) => TARIFAS[m] ?? TARIFAS[Object.keys(TARIFAS).find((k) => m?.startsWith(k))] ?? TARIFAS["gpt-5.5"];
const costo = (m, inp, cached, out) => { const t = tarifa(m); const c = Math.min(cached, inp); return ((inp - c) * t.input + c * t.cached + out * t.output) / 1e6; };

const sql = postgres(DB, { prepare: false, max: 1, ssl: "prefer", connection: { options: "-c default_transaction_read_only=on" } });
const grupoSQL = sql`case when right(regexp_replace(c.phone, '\\D', '', 'g'), 1) in ('0','2','4','6','8') then 'canary' else 'control' end`;

// ── Datos ──────────────────────────────────────────────────────────────────
const runs = await sql`
  select (r.created_at at time zone ${TZ})::date::text as dia, ${grupoSQL} as grupo, r.conversation_id as conv,
         r.model, r.route, r.call_type, coalesce(r.input_tokens,0)::int as inp, coalesce(r.cached_input_tokens,0)::int as cached,
         coalesce(r.output_tokens,0)::int as outp, r.error
  from ai_runs r join conversations c on c.id = r.conversation_id
  where r.created_at >= ${INICIO_BASE}::date`;
const chats = await sql`
  select (c.created_at at time zone ${TZ})::date::text as dia, ${grupoSQL} as grupo,
         exists (select 1 from quotes q where q.conversation_id = c.id) as cotizo,
         (c.visit_date is not null) as dia_visita
  from conversations c where c.created_at >= ${INICIO_BASE}::date`;
const revisiones = await sql`
  select (g.created_at at time zone ${TZ})::date::text as dia, ${grupoSQL} as grupo, g.verdict
  from guardian_reviews g join conversations c on c.id = g.conversation_id
  where g.created_at >= ${INICIO_BASE}::date and g.verdict in ('aprobar','corregir')`;
await sql.end();

let ventas = null;
try {
  let key = process.env.ADMIN_KEY;
  if (!key) key = JSON.parse(execFileSync("railway", ["variables", "--environment", "Depot_Tire", "--service", "AutoVenta", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 25_000 })).ADMIN_KEY;
  const r = await fetch("https://autoventa-depottire.up.railway.app/api/hub/metrics?mes=todos", { headers: { "x-admin-key": key } });
  const j = await r.json();
  ventas = (j.metrics?.ventasConfirmadas?.detalle ?? []).map((v) => ({ dia: v.dia, grupo: /[02468]$/.test(String(v.telefono).replace(/\D/g, "")) ? "canary" : "control", total: v.total }));
} catch (e) { console.warn("Sin ventas de Contífico:", e.message); }

// ── Agregados por día ─────────────────────────────────────────────────────
const hoy = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const dias = [];
for (let d = new Date(`${INICIO_BASE}T12:00:00Z`); d.toISOString().slice(0, 10) <= hoy; d.setUTCDate(d.getUTCDate() + 1)) dias.push(d.toISOString().slice(0, 10));
// El día de hoy está a medias: se dibuja hueco y no se juzga.
const fase = (d) => (d < TRANSICION ? "I" : d < INICIO_CANARY || d === hoy ? "T" : "II");
const GRUPOS = ["control", "canary"];

const porDia = (filas, fn) => Object.fromEntries(GRUPOS.map((g) => [g, dias.map((d) => fn(filas.filter((f) => f.dia === d && f.grupo === g), d))]));

const costoConv = porDia(runs, (fs) => {
  const convs = new Set(fs.map((f) => f.conv)).size;
  const usd = fs.reduce((a, f) => a + costo(f.model, f.inp, f.cached, f.outp), 0);
  return convs >= 5 ? { y: usd / convs, n: convs, usd } : { y: null, n: convs, usd };
});
const RUTAS_QUE_CAMBIAN = /^(commercial|tool_chain_finalized|guardian|guardian_seguimiento)\+canary$/;
const ahorroDia = dias.map((d) => runs.filter((f) => f.dia === d && RUTAS_QUE_CAMBIAN.test(f.route ?? "") && f.model !== "gpt-5.5")
  .reduce((a, f) => a + costo("gpt-5.5", f.inp, f.cached, f.outp) - costo(f.model, f.inp, f.cached, f.outp), 0));
const prop = (filas, campo) => porDia(filas, (fs, d) => ({ x: fs.filter((f) => f[campo]).length, n: fs.length, inmaduro: dias.indexOf(d) >= dias.length - DIAS_INMADUROS }));
const cotiz = prop(chats, "cotizo");
const visita = prop(chats, "dia_visita");
const correcciones = porDia(revisiones, (fs) => ({ x: fs.filter((f) => f.verdict === "corregir").length, n: fs.length }));
const fallas = porDia(runs.filter((f) => f.call_type === "chat"), (fs) => ({ x: fs.filter((f) => f.error || /^(failed|rescue)/.test(f.route ?? "")).length, n: fs.length }));

// Semanas (lunes) para las ventas.
const lunes = (d) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const semanas = [...new Set(dias.map(lunes))];
const ventasSem = ventas && Object.fromEntries(GRUPOS.map((g) => [g, semanas.map((s) => ventas.filter((v) => v.grupo === g && lunes(v.dia) === s).length)]));

// ── Límites ───────────────────────────────────────────────────────────────
const idxI = dias.map((d, i) => (fase(d) === "I" ? i : -1)).filter((i) => i >= 0);
function limitesI(serie) {
  const base = idxI.map((i) => serie[i]?.y).filter((y) => y != null);
  if (base.length < 3) return null;
  const media = base.reduce((a, b) => a + b, 0) / base.length;
  const mr = base.slice(1).map((y, i) => Math.abs(y - base[i]));
  const s = (mr.reduce((a, b) => a + b, 0) / Math.max(1, mr.length)) / 1.128;
  return { centro: media, ucl: () => media + 3 * s, lcl: () => Math.max(0, media - 3 * s) };
}
function limitesP(series) {
  // Fase I con los DOS grupos juntos: antes del canary eran el mismo bot.
  let x = 0, n = 0;
  for (const g of GRUPOS) for (const i of idxI) { const p = series[g][i]; if (p && !p.inmaduro) { x += p.x; n += p.n; } }
  if (!n) return null;
  const pb = x / n;
  return { centro: pb, ucl: (ni) => Math.min(1, pb + 3 * Math.sqrt((pb * (1 - pb)) / Math.max(1, ni))), lcl: (ni) => Math.max(0, pb - 3 * Math.sqrt((pb * (1 - pb)) / Math.max(1, ni))) };
}
function limitesC(series) {
  const base = semanas.map((s, i) => (s < lunes(TRANSICION) ? i : -1)).filter((i) => i >= 0);
  let tot = 0, k = 0;
  for (const g of GRUPOS) for (const i of base) { tot += series[g][i]; k += 1; }
  if (!k) return null;
  const cb = tot / k;
  return { centro: cb, ucl: () => cb + 3 * Math.sqrt(cb), lcl: () => Math.max(0, cb - 3 * Math.sqrt(cb)) };
}

/** Señales de fase II: punto fuera de límites, u 8 seguidos del mismo lado. */
function senales(puntos, lim) {
  const out = [];
  let racha = 0, lado = 0;
  for (const p of puntos) {
    if (p.y == null || p.fase !== "II" || p.inmaduro) continue;
    const u = lim.ucl(p.n), l = lim.lcl(p.n);
    if (p.y > u) out.push({ dia: p.x, tipo: "arriba" });
    if (p.y < l) out.push({ dia: p.x, tipo: "abajo" });
    const s = Math.sign(p.y - lim.centro);
    racha = s === lado ? racha + 1 : 1; lado = s;
    if (racha === 8) out.push({ dia: p.x, tipo: s > 0 ? "racha_arriba" : "racha_abajo" });
  }
  return out;
}

// ── SVG ───────────────────────────────────────────────────────────────────
const COLOR = { control: "var(--control)", canary: "var(--canary)" };
const NOMBRE = { control: "Impares · gpt-5.5 (control)", canary: "Pares · gpt-5.4 + Guardián mini (canary)" };
function grafico({ xs, series, lim, formato, yMaxMin = 0, inicio = TRANSICION }) {
  const W = 860, H = 250, m = { l: 52, r: 14, t: 12, b: 26 };
  const todos = GRUPOS.flatMap((g) => series[g].map((p) => p.y)).filter((y) => y != null);
  const ucls = lim ? GRUPOS.flatMap((g) => series[g].map((p) => lim.ucl(p.n))) : [];
  const yMax = Math.max(yMaxMin, ...todos, ...ucls.filter(Number.isFinite)) * 1.08 || 1;
  const x = (i) => m.l + (i / Math.max(1, xs.length - 1)) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - v / yMax) * (H - m.t - m.b);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (let k = 0; k <= 4; k++) { const v = (yMax * k) / 4; s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" class="t">${formato(v)}</text>`; }
  const ic = xs.findIndex((d) => d >= inicio);
  if (ic >= 0) s += `<rect x="${x(ic) - 4}" y="${m.t}" width="${W - m.r - x(ic) + 4}" height="${H - m.t - m.b}" fill="var(--fase2)"/><text x="${x(ic)}" y="${m.t + 11}" class="t">canary →</text>`;
  if (lim) {
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(lim.centro)}" y2="${y(lim.centro)}" stroke="var(--fg2)" stroke-dasharray="5 4"/>`;
    // En los gráficos p los límites dependen de n: se dibujan con el n del canary (cada punto se juzga con el suyo).
    const paso = (f) => xs.map((_, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(f(series.canary[i]?.n || series.control[i]?.n || 1)).toFixed(1)}`).join(" ");
    s += `<path d="${paso(lim.ucl)}" fill="none" stroke="var(--limite)" stroke-dasharray="2 3"/><path d="${paso(lim.lcl)}" fill="none" stroke="var(--limite)" stroke-dasharray="2 3"/>`;
  }
  for (const g of GRUPOS) {
    const pts = series[g].map((p, i) => ({ ...p, i })).filter((p) => p.y != null);
    s += `<path d="${pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ")}" fill="none" stroke="${COLOR[g]}" stroke-width="2"/>`;
    for (const p of pts) {
      const fuera = lim && p.fase === "II" && !p.inmaduro && (p.y > lim.ucl(p.n) || p.y < lim.lcl(p.n));
      s += `<circle cx="${x(p.i)}" cy="${y(p.y)}" r="${fuera ? 5.5 : 3.5}" fill="${fuera ? COLOR[g] : p.inmaduro ? "var(--bg)" : "var(--card)"}" stroke="${COLOR[g]}" stroke-width="2" ${p.inmaduro ? 'stroke-dasharray="2 2"' : ""}><title>${xs[p.i]} · ${NOMBRE[g]} · ${formato(p.y)}${p.n != null ? ` · n=${p.n}` : ""}</title></circle>`;
    }
  }
  const cada = Math.max(1, Math.ceil(xs.length / 8));
  xs.forEach((d, i) => { if (i % cada === 0 || i === xs.length - 1) s += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="t">${d.slice(5).replace("-", "/")}</text>`; });
  return s + "</svg>";
}

const ptsP = (serie, g) => serie[g].map((p, i) => ({ y: p.n ? p.x / p.n : null, n: p.n, x: dias[i], fase: fase(dias[i]), inmaduro: p.inmaduro || fase(dias[i]) === "T" }));
const ptsI = (serie, g) => serie[g].map((p, i) => ({ y: p.y, n: p.n, x: dias[i], fase: fase(dias[i]), inmaduro: fase(dias[i]) === "T" }));
const pct = (v) => `${(v * 100).toFixed(0)} %`;
const pct1 = (v) => `${(v * 100).toFixed(1)} %`;
const usd = (v) => `$${v.toFixed(v < 1 ? 3 : 0)}`;
const resumenFase2 = (pts) => { const xs = pts.filter((p) => p.fase === "II" && !p.inmaduro && p.y != null); return xs.length ? { media: xs.reduce((a, p) => a + p.y * (p.n || 1), 0) / xs.reduce((a, p) => a + (p.n || 1), 0), dias: xs.length } : null; };
const unidad = (k, porSemana) => `${k} ${porSemana ? (k === 1 ? "semana" : "semanas") : (k === 1 ? "día" : "días")}`;

const bloques = [];
function bloque({ titulo, que, mejor, series, lim, formato, nota = "", inicio = TRANSICION, porSemana = false }) {
  const sen = lim ? GRUPOS.map((g) => ({ g, s: senales(series[g], lim) })) : [];
  const can = sen.find((x) => x.g === "canary")?.s ?? [];
  const ctl = sen.find((x) => x.g === "control")?.s ?? [];
  const r2 = { canary: resumenFase2(series.canary), control: resumenFase2(series.control) };
  let estado = "Esperando datos del canary";
  let clase = "gris";
  if (r2.canary) {
    const malo = can.some((x) => x.tipo.includes(mejor === "abajo" ? "arriba" : "abajo"));
    const bueno = can.some((x) => x.tipo.includes(mejor));
    if (malo) { estado = "Señal en contra: el canary se salió del lado malo"; clase = "malo"; }
    else if (bueno) { estado = "Señal a favor: el canary mejoró más allá del ruido"; clase = "bueno"; }
    else { estado = "Sin señal: el canary se comporta igual que antes (ruido)"; clase = "neutro"; }
  }
  const linea = GRUPOS.map((g) => r2[g] ? `${g === "canary" ? "Canary" : "Control"}: ${formato(r2[g].media)} en ${unidad(r2[g].dias, porSemana)}` : null).filter(Boolean).join(" · ");
  bloques.push(`<section class="card"><div class="cab"><h2>${titulo}</h2><span class="chip ${clase}">${estado}</span></div>
  <p class="que">${que}</p>${grafico({ xs: series.xs ?? dias, series, lim, formato, inicio })}
  <p class="pie">${lim ? `Línea central ${formato(lim.centro)} (fase I) · límites ±3σ punteados.` : ""} ${linea}${ctl.length ? ` · El control también tuvo ${ctl.length} señal(es): algo cambió para todos, no solo el canary.` : ""} ${nota}</p></section>`);
}

const serieCosto = { control: ptsI(costoConv, "control"), canary: ptsI(costoConv, "canary") };
bloque({ titulo: "1 · Costo de IA por conversación", que: "Cuánto cuesta en dólares atender un chat en un día. Aquí <b>esperamos</b> que el canary caiga bajo el límite inferior: esa es la señal del ahorro.", mejor: "abajo", series: serieCosto, lim: limitesI(serieCosto.control), formato: usd });

let acum = 0;
const serieAhorro = { control: dias.map((d) => ({ y: null, x: d, fase: fase(d) })), canary: dias.map((d, i) => { acum += ahorroDia[i]; return { y: acum, x: d, fase: fase(d) }; }) };
const diasCanary = dias.filter((d) => d >= TRANSICION).length;
const ahorroMes = diasCanary ? (acum / diasCanary) * 30 : 0;
bloques.push(`<section class="card"><div class="cab"><h2>2 · Ahorro acumulado</h2><span class="chip ${acum > 0 ? "bueno" : "gris"}">$${acum.toFixed(2)} en ${diasCanary} días · ≈ $${ahorroMes.toFixed(0)}/mes con la mitad de los clientes</span></div>
<p class="que">Lo que habrían costado con gpt-5.5 las respuestas del canary, menos lo que costaron de verdad. Es una línea que sube: no tiene límites de control porque no mide un proceso sino una suma. Con el 100 % de los clientes el ahorro sería aproximadamente el doble.</p>
${grafico({ xs: dias, series: serieAhorro, lim: null, formato: (v) => `$${v.toFixed(0)}` })}</section>`);

for (const [titulo, que, serie, mejor] of [
  ["3 · Chats que reciben cotización", "De los chats que empezaron ese día, qué porcentaje recibió al menos una cotización. Si el canary cae bajo el límite inferior, el modelo nuevo está cotizando menos.", cotiz, "arriba"],
  ["4 · Chats con día de visita acordado", "El predictor de venta más fuerte (con día compran 20× más). Si el canary cae bajo el límite, el modelo nuevo cierra peor.", visita, "arriba"],
  ["5 · Borradores que el Guardián corrige", "Qué porcentaje de las respuestas el Guardián tuvo que reescribir. Si sube, el vendedor nuevo redacta peor o el Guardián mini corrige de más.", correcciones, "abajo"],
  ["6 · Fallas técnicas del vendedor", "Corridas del vendedor que terminaron en error o en rescate (el cliente ve «tengo un problema técnico»). Por cada 100 corridas.", fallas, "abajo"],
]) {
  const s = { control: ptsP(serie, "control"), canary: ptsP(serie, "canary") };
  bloque({ titulo, que, mejor, series: s, lim: limitesP(serie), formato: serie === fallas ? pct1 : pct, nota: serie === cotiz || serie === visita ? `Los últimos ${DIAS_INMADUROS} días (círculos punteados) todavía no maduran y no cuentan como señal.` : "" });
}

if (ventasSem) {
  const s = { xs: semanas, control: ventasSem.control.map((v, i) => ({ y: v, n: 1, x: semanas[i], fase: semanas[i] < lunes(TRANSICION) ? "I" : "II", inmaduro: semanas[i] === lunes(hoy) })), canary: ventasSem.canary.map((v, i) => ({ y: v, n: 1, x: semanas[i], fase: semanas[i] < lunes(TRANSICION) ? "I" : "II", inmaduro: semanas[i] === lunes(hoy) })) };
  bloque({ titulo: "7 · Ventas comprobadas por semana", que: "Facturas de Contífico cruzadas con el teléfono del chat, por semana de la factura. Es el resultado final, pero llega con rezago (la mitad de las ventas tarda 4–5 días) y son pocas por semana: la señal aquí tarda más.", mejor: "arriba", series: s, lim: limitesC(ventasSem), formato: (v) => v.toFixed(0), inicio: lunes(TRANSICION), porSemana: true });
}


// ── Vista de campana (curva normal) y nivel sigma ─────────────────────────
const dens = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
/** Histograma de la fase I con su curva normal, y la fase II de cada grupo marcada debajo del eje. */
function campana({ titulo, que, base, centro, sigma, fase2, formato }) {
  if (!base.length || !sigma) return "";
  const W = 860, H = 230, m = { l: 24, r: 24, t: 14, b: 58 };
  const lo = centro - 4 * sigma, hi = centro + 4 * sigma;
  const x = (v) => m.l + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (W - m.l - m.r);
  const nb = 16, ancho = (hi - lo) / nb;
  const cuenta = Array.from({ length: nb }, (_, i) => base.filter((v) => v >= lo + i * ancho && v < lo + (i + 1) * ancho).length);
  const maxC = Math.max(1, ...cuenta), escalaCurva = base.length * ancho / sigma;
  const yMax = Math.max(maxC, escalaCurva * dens(0)) * 1.1;
  const y = (c) => m.t + (1 - c / yMax) * (H - m.t - m.b);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (const k of [-3, -2, -1, 1, 2, 3]) {
    s += `<line x1="${x(centro + k * sigma)}" x2="${x(centro + k * sigma)}" y1="${m.t}" y2="${H - m.b}" stroke="var(--grid)" ${Math.abs(k) === 3 ? 'stroke-dasharray="2 3" stroke="var(--limite)"' : ""}/>`;
    s += `<text x="${x(centro + k * sigma)}" y="${H - m.b + 14}" text-anchor="middle" class="t">${k > 0 ? "+" : ""}${k}σ</text>`;
  }
  s += `<text x="${x(centro)}" y="${H - m.b + 14}" text-anchor="middle" class="t">media ${formato(centro)}</text>`;
  cuenta.forEach((c, i) => { if (c) s += `<rect x="${x(lo + i * ancho) + 1}" y="${y(c)}" width="${(W - m.l - m.r) / nb - 2}" height="${y(0) - y(c)}" fill="var(--barra)"/>`; });
  const curva = Array.from({ length: 121 }, (_, i) => { const v = lo + (i / 120) * (hi - lo); return `${i ? "L" : "M"}${x(v).toFixed(1)},${y(escalaCurva * dens((v - centro) / sigma)).toFixed(1)}`; }).join(" ");
  s += `<path d="${curva}" fill="none" stroke="var(--fg2)" stroke-width="1.5"/>`;
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--fg2)"/>`;
  GRUPOS.forEach((g, k) => {
    const yy = H - m.b + 30 + k * 13;
    s += `<text x="${m.l}" y="${yy + 4}" class="t">${g === "canary" ? "canary" : "control"}</text>`;
    for (const v of fase2[g]) s += `<circle cx="${x(v)}" cy="${yy}" r="4" fill="${COLOR[g]}" opacity=".75"><title>${formato(v)} · ${((v - centro) / sigma).toFixed(1)}σ</title></circle>`;
  });
  return s + "</svg>";
}
const sigmaI = (vals) => { if (vals.length < 3) return 0; const mr = vals.slice(1).map((v, i) => Math.abs(v - vals[i])); return (mr.reduce((a, b) => a + b, 0) / mr.length) / 1.128; };
const campanas = [];
{
  const base = idxI.map((i) => costoConv.control[i]?.y).concat(idxI.map((i) => costoConv.canary[i]?.y)).filter((v) => v != null);
  const centro = base.reduce((a, b) => a + b, 0) / Math.max(1, base.length);
  const sigma = sigmaI(idxI.map((i) => costoConv.control[i]?.y).filter((v) => v != null));
  const f2 = Object.fromEntries(GRUPOS.map((g) => [g, serieCosto[g].filter((p) => p.fase === "II" && !p.inmaduro && p.y != null).map((p) => p.y)]));
  campanas.push(`<section class="card"><div class="cab"><h2>Campana · costo por conversación</h2></div><p class="que">Las barras grises son los días de la fase I: así se reparte el costo cuando nada cambia, y la curva es la normal que mejor les calza. Debajo, cada punto de color es un día de la fase II. Si los puntos del canary caen a la izquierda de −3σ, el ahorro es real; si caen dentro de la campana, todavía es ruido.</p>${campana({ base, centro, sigma, fase2: f2, formato: usd })}</section>`);
}
{
  let x = 0, n = 0; const base = [];
  for (const g of GRUPOS) for (const i of idxI) { const p = correcciones[g][i]; if (p?.n) { x += p.x; n += p.n; base.push(p.x / p.n); } }
  const pb = n ? x / n : 0, nMedio = n / Math.max(1, base.length), sigma = Math.sqrt(pb * (1 - pb) / Math.max(1, nMedio));
  const f2 = Object.fromEntries(GRUPOS.map((g) => [g, ptsP(correcciones, g).filter((p) => p.fase === "II" && !p.inmaduro && p.y != null).map((p) => p.y)]));
  campanas.push(`<section class="card"><div class="cab"><h2>Campana · borradores que el Guardián corrige</h2></div><p class="que">Lo mismo para el porcentaje de respuestas que el Guardián reescribe. Aquí lo malo es irse a la <b>derecha</b> de +3σ.</p>${campana({ base, centro: pb, sigma, fase2: f2, formato: pct })}</section>`);
}

// Nivel sigma (DPMO con el corrimiento de 1,5σ de la convención Six Sigma).
const invNorm = (p) => { // Acklam
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const q = p < 0.02425 ? Math.sqrt(-2 * Math.log(p)) : p > 1 - 0.02425 ? Math.sqrt(-2 * Math.log(1 - p)) : null;
  if (q !== null && p < 0.5) return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (q !== null) return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  const r = p - 0.5, t = r * r;
  return (((((a[0] * t + a[1]) * t + a[2]) * t + a[3]) * t + a[4]) * t + a[5]) * r / (((((b[0] * t + b[1]) * t + b[2]) * t + b[3]) * t + b[4]) * t + 1);
};
const nivel = (def, opp) => { if (!opp) return null; const p = Math.min(Math.max(def / opp, 1e-9), 1 - 1e-9); return { dpmo: p * 1e6, sigma: invNorm(1 - p) + 1.5, def, opp }; };
const suma = (serie, g, f) => serie[g].reduce((acc, p, i) => (f(dias[i]) ? { x: acc.x + (p?.x ?? 0), n: acc.n + (p?.n ?? 0) } : acc), { x: 0, n: 0 });
const filasSigma = [["Respuesta que el Guardián tuvo que corregir", correcciones], ["Corrida del vendedor con falla técnica", fallas]].map(([nombre, serie]) => {
  const celdas = [["control", (d) => fase(d) === "I"], ["canary", (d) => fase(d) === "I"], ["control", (d) => fase(d) === "II"], ["canary", (d) => fase(d) === "II"]]
    .map(([g, f]) => { const t = suma(serie, g, f); const r = nivel(t.x, t.n); return r ? `<td class="num">${r.sigma.toFixed(1)}σ<br><span class="mini">${Math.round(r.dpmo).toLocaleString("es-EC")} DPMO · ${t.x}/${t.n}</span></td>` : `<td class="num mini">sin datos</td>`; });
  return `<tr><td>${nombre}</td>${celdas.join("")}</tr>`;
});
const seccionSigma = `<section class="card"><div class="cab"><h2>Nivel sigma</h2></div>
<p class="que">Cuántos defectos por millón de oportunidades (DPMO) tiene cada proceso, traducido a la escala Six Sigma: 6σ son 3,4 por millón, 4σ son 6.210, 3σ son 66.807 y 2σ son 308.538. Se usa el corrimiento de 1,5σ de la convención.</p>
<div class="tabla"><table><tr><th>Defecto</th><th>Control · fase I</th><th>Canary · fase I</th><th>Control · fase II</th><th>Canary · fase II</th></tr>${filasSigma.join("")}</table></div></section>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Canary en producción</title>
<style>
:root{--bg:#f7f7f4;--card:#fff;--fg:#1c1c1a;--fg2:#5b5b55;--muted:#85857e;--grid:#ecebe5;--line:#e2e1db;--fase2:#f3f1ea;--limite:#9a998f;--control:#2a78d6;--canary:#eb6834;--barra:#d9d7cf;--bueno:#15803d;--malo:#c2410c;--neutro:#5b5b55}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#1f1f1d;--fg:#ecebe7;--fg2:#bdbcb5;--muted:#8f8e87;--grid:#2b2b28;--line:#33332f;--fase2:#232320;--limite:#77766f;--control:#3987e5;--canary:#d95926;--barra:#3a3a36;--bueno:#4ade80;--malo:#fb923c;--neutro:#bdbcb5}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:900px;margin:0 auto;padding:24px 16px 56px}h1{font-size:23px;margin:0 0 4px}h2{font-size:16px;margin:0}
.sub{color:var(--muted);margin:0 0 16px;font-size:14px}.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin:0 0 14px}
.cab{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;margin-bottom:4px}.chip{font-size:12px;border-radius:999px;padding:2px 10px;border:1px solid currentColor}
.chip.bueno{color:var(--bueno)}.chip.malo{color:var(--malo)}.chip.neutro{color:var(--neutro)}.chip.gris{color:var(--muted)}
.que{margin:0 0 6px;color:var(--fg2);font-size:14px}.pie{margin:4px 0 0;color:var(--muted);font-size:13px}svg{width:100%;height:auto;display:block}.t{font-size:11px;fill:var(--muted)}
.guia{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin:0 0 16px;font-size:14px}.guia ul{margin:6px 0 0;padding-left:18px}.guia li{margin:3px 0}
.tabla{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-weight:500;font-size:12px}.num{font-variant-numeric:tabular-nums;white-space:nowrap}.mini{color:var(--muted);font-size:11px}
.ley{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;margin-top:8px}.ley i{display:inline-block;width:14px;height:3px;vertical-align:middle;margin-right:6px}
</style></head><body><main>
<h1>Canary de modelos en producción</h1>
<p class="sub">Depot Tire · actualizado ${new Date().toLocaleString("es-EC", { timeZone: TZ, dateStyle: "long", timeStyle: "short" })} · fase I desde ${INICIO_BASE}, canary prendido el ${TRANSICION} (día de transición), fase II desde ${INICIO_CANARY}</p>
<div class="guia"><b>Qué estás viendo.</b> Cada gráfico es un <b>gráfico de control</b>: una línea por grupo, día por día.
<ul><li>La <b>zona blanca</b> es la fase I: antes del canary los dos grupos usaban el mismo bot. De ahí salen la línea central (raya) y los límites (punteado) que marcan cuánto se mueve el número solo por azar.</li>
<li>La <b>zona sombreada</b> es la fase II: desde que prendimos el canary. Cada punto se juzga contra esos límites.</li>
<li>Un <b>punto relleno</b> se salió de los límites: eso es una <b>señal</b>, un cambio real y no ruido. También es señal tener 8 días seguidos del mismo lado de la línea central.</li>
<li>La <b>campana</b> es la misma información vista de lado: si giras un gráfico de control 90°, los días de la fase I se amontonan en forma de curva normal. ±3σ deja dentro el 99,7 % de los días cuando nada cambió; por eso un punto afuera es una señal.</li>
<li>Lo que queremos ver: el costo del canary <b>baja con señal</b> y los demás gráficos <b>no tienen señal en contra</b>. Si eso se cumple dos semanas, el canary pasa al 100 %.</li></ul>
<div class="ley"><span><i style="background:var(--control)"></i>${NOMBRE.control}</span><span><i style="background:var(--canary)"></i>${NOMBRE.canary}</span></div></div>
${bloques.join("\n")}
${campanas.join("\n")}
${seccionSigma}
</main></body></html>`;

const salida = arg("salida", resolve(APP, "..", "docs", "reportes-historicos", `canary-produccion-${hoy}.html`));
writeFileSync(salida, html);
console.log(salida);
console.log(`ahorro acumulado $${acum.toFixed(2)} en ${diasCanary} días de canary`);
