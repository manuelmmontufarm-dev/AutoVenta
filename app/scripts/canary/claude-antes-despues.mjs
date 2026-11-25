#!/usr/bin/env node
/**
 * DEPOT EN CLAUDE: ANTES Y DESPUÉS (gráficos de control de producción).
 *
 * El 24-nov-2026 Manuel pasó TODO Depot a vendedor Claude Sonnet 5.5 + Guardián
 * Claude Haiku 5.5. Ya no hay grupo de control (todos los teléfonos van con
 * Claude), así que lo que se puede medir es antes contra después:
 *
 *   Fase I  = del 7 al 23 de noviembre (vendedor gpt-5.5, Guardián gpt-5.5 en
 *             los pares y gpt-5.4-mini en los impares, Black Friday ya activo).
 *             Fija la línea central y los límites de ±3σ.
 *   Fase II = desde el cambio. Cada día se juzga contra esos límites. Señal =
 *             un punto fuera de límites u 8 seguidos del mismo lado.
 *
 * Lee la base de producción en modo SOLO LECTURA (DATABASE_URL de app/.env o
 * PROD_DATABASE_URL). No escribe nada en producción.
 *
 *   node scripts/canary/claude-antes-despues.mjs --cambio 2026-11-25T01:10:00Z [--salida ruta.html]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const APP = resolve(import.meta.dirname, "../..");
const env = Object.fromEntries(readFileSync(resolve(APP, ".env"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const DB = process.env.PROD_DATABASE_URL ?? env.DATABASE_URL;
const TZ = "America/Guayaquil";
const BASE = arg("base", "2026-11-07");
/** Momento del cambio (UTC). Sin él, todo es fase I: sirve para ver la línea de base. */
const CAMBIO = arg("cambio", null);
const SALIDA = arg("salida", resolve(APP, "../docs/reportes-historicos/claude-depot-antes-despues.html"));

/** USD por millón, las de src/services/billing.ts. `escritura` = lo que Claude cobra por escribir al caché. */
const TARIFAS = {
  "claude-sonnet-5-5": { input: 2, cached: 0.1, output: 10, escritura: 2.5 },
  "claude-haiku-5-5": { input: 0.1, cached: 0.01, output: 0.5, escritura: 0.125 },
  "claude-opus-5-5": { input: 4, cached: 0.2, output: 20, escritura: 5 },
  "claude-fable-5-2": { input: 8, cached: 0.2, output: 40, escritura: 10 },
  "gpt-5.5": { input: 5, cached: 0.5, output: 30 },
  "gpt-5.4-mini": { input: 0.75, cached: 0.075, output: 4.5 },
  "gpt-5.4": { input: 2.5, cached: 0.25, output: 15 },
};
const tarifa = (m) => TARIFAS[m] ?? TARIFAS[Object.keys(TARIFAS).find((k) => m?.startsWith(k))] ?? TARIFAS[m?.startsWith("claude-") ? "claude-sonnet-5-5" : "gpt-5.5"];
const costo = (f) => {
  const t = tarifa(f.model); const c = Math.min(f.cached, f.inp); const e = Math.min(f.escritos, f.inp - c);
  return ((f.inp - c - e) * t.input + c * t.cached + e * (t.escritura ?? t.input) + f.outp * t.output) / 1e6;
};

const sql = postgres(DB, { ssl: "require", prepare: false, max: 2, connection: { default_transaction_read_only: true } });
const runs = await sql`
  select (r.created_at at time zone ${TZ})::date::text as dia, r.conversation_id as conv, r.model, r.call_type,
         coalesce(r.input_tokens,0)::int as inp, coalesce(r.cached_input_tokens,0)::int as cached,
         coalesce(r.cache_write_tokens,0)::int as escritos, coalesce(r.output_tokens,0)::int as outp,
         (r.error is not null) as fallo, r.created_at as t
  from ai_runs r where r.created_at >= ${BASE}::date`;
const chats = await sql`
  select (c.created_at at time zone ${TZ})::date::text as dia,
         exists (select 1 from quotes q where q.conversation_id = c.id) as cotizo, (c.visit_date is not null) as visita
  from conversations c where c.created_at >= ${BASE}::date`;
const revisiones = await sql`
  select (g.created_at at time zone ${TZ})::date::text as dia, g.verdict
  from guardian_reviews g where g.created_at >= ${BASE}::date and g.verdict in ('aprobar','corregir')`;
const respuestas = await sql`
  with op as (
    select distinct on (r.conversation_id) r.conversation_id, r.created_at as t
    from ai_runs r where r.created_at >= ${BASE}::date and r.tools::text like '%preparar_opciones%'
    order by r.conversation_id, r.created_at)
  select (c.created_at at time zone ${TZ})::date::text as dia,
         exists (select 1 from quotes q where q.conversation_id = c.id) as cotizo
  from op join conversations c on c.id = op.conversation_id
  where c.created_at >= ${BASE}::date
    and exists (select 1 from messages m where m.conversation_id = c.id and m.role = 'user' and m.created_at > op.t + interval '5 seconds')`;
await sql.end();

// ── Días y fases ──────────────────────────────────────────────────────────
const diaDe = (d) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const hoy = diaDe(new Date());
const diaCambio = CAMBIO ? diaDe(new Date(CAMBIO)) : null;
const dias = [];
for (let d = new Date(`${BASE}T12:00:00Z`); d.toISOString().slice(0, 10) <= hoy; d.setUTCDate(d.getUTCDate() + 1)) dias.push(d.toISOString().slice(0, 10));
/** I = antes · T = día del cambio u hoy (incompletos, no cuentan) · II = después. Los domingos Depot cierra. */
const fase = (d) => (d === hoy || d === diaCambio ? "T" : diaCambio && d > diaCambio ? "II" : "I");

const porDia = (filas, fn) => dias.map((d) => fn(filas.filter((f) => f.dia === d)));
const sCosto = porDia(runs, (fs) => { const n = new Set(fs.map((f) => f.conv)).size; return { y: n >= 5 ? fs.reduce((a, f) => a + costo(f), 0) / n : null, n }; });
const prop = (filas, ok, min = 5) => porDia(filas, (fs) => ({ x: fs.filter(ok).length, n: fs.length })).map((p) => ({ ...p, y: p.n >= min ? p.x / p.n : null }));
const sCotiza = prop(chats, (f) => f.cotizo);
const sVisita = prop(chats, (f) => f.visita);
const sCorrige = prop(revisiones, (f) => f.verdict === "corregir", 20);
const sFalla = prop(runs.filter((f) => f.call_type !== "guardian" && f.call_type !== "classifier"), (f) => f.fallo, 20);
const sTrasOpc = prop(respuestas, (f) => f.cotizo);

const idx = (f) => dias.map((d, i) => (fase(d) === f ? i : -1)).filter((i) => i >= 0);
function limitesI(serie) {
  const base = idx("I").map((i) => serie[i].y).filter((y) => y != null);
  if (base.length < 3) return null;
  const media = base.reduce((a, b) => a + b, 0) / base.length;
  const mr = base.slice(1).map((y, i) => Math.abs(y - base[i]));
  const s = mr.reduce((a, b) => a + b, 0) / Math.max(1, mr.length) / 1.128;
  return { centro: media, ucl: () => media + 3 * s, lcl: () => Math.max(0, media - 3 * s) };
}
function limitesP(serie) {
  let x = 0, n = 0; for (const i of idx("I")) { x += serie[i].x; n += serie[i].n; }
  if (!n) return null;
  const p = x / n;
  return { centro: p, ucl: (ni) => Math.min(1, p + 3 * Math.sqrt((p * (1 - p)) / Math.max(1, ni))), lcl: (ni) => Math.max(0, p - 3 * Math.sqrt((p * (1 - p)) / Math.max(1, ni))) };
}
function senales(serie, lim) {
  if (!lim) return [];
  const out = []; let racha = 0, lado = 0;
  dias.forEach((d, i) => {
    const p = serie[i]; if (fase(d) !== "II" || p.y == null) return;
    if (p.y > lim.ucl(p.n) || p.y < lim.lcl(p.n)) out.push(`${d.slice(5)} fuera de límites`);
    const l = Math.sign(p.y - lim.centro); racha = l === lado ? racha + 1 : 1; lado = l;
    if (racha === 8) out.push(`8 días seguidos ${l > 0 ? "arriba" : "abajo"} de la línea (hasta ${d.slice(5)})`);
  });
  return out;
}
const mediaFase = (serie, f, pesada) => {
  const ps = idx(f).map((i) => serie[i]).filter((p) => p.y != null);
  if (!ps.length) return null;
  return pesada ? ps.reduce((a, p) => a + p.x, 0) / ps.reduce((a, p) => a + p.n, 0) : ps.reduce((a, p) => a + p.y, 0) / ps.length;
};

// ── Dibujo ────────────────────────────────────────────────────────────────
const W = 860, H = 230, m = { l: 52, r: 14, t: 14, b: 26 };
const pct = (v) => `${(100 * v).toFixed(0)} %`, usd = (v) => `$${v.toFixed(3)}`;
function grafico(titulo, que, serie, lim, fmt, pesada, mejorBajo) {
  const ys = serie.map((p) => p.y).filter((y) => y != null);
  const tope = Math.max(...ys, lim ? Math.max(...serie.map((p) => (p.y != null ? lim.ucl(p.n) : 0))) : 0, 1e-9) * 1.12;
  const x = (i) => m.l + (i / Math.max(1, dias.length - 1)) * (W - m.l - m.r), y = (v) => H - m.b - (v / tope) * (H - m.t - m.b);
  let s = "";
  const iC = diaCambio ? dias.indexOf(diaCambio) : -1;
  if (iC >= 0) s += `<rect x="${x(iC)}" y="${m.t}" width="${W - m.r - x(iC)}" height="${H - m.t - m.b}" class="zona"/><text x="${x(iC) + 5}" y="${m.t + 12}" class="eje">Claude →</text>`;
  for (const k of [0, 0.5, 1]) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(tope * k)}" y2="${y(tope * k)}" class="rej"/><text x="${m.l - 6}" y="${y(tope * k) + 4}" text-anchor="end" class="eje">${fmt(tope * k)}</text>`;
  dias.forEach((d, i) => { if (i % 3 === 0) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="eje">${d.slice(8)}/${d.slice(5, 7)}</text>`; });
  if (lim) {
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(lim.centro)}" y2="${y(lim.centro)}" class="centro"/>`;
    for (const k of ["ucl", "lcl"]) s += `<path d="${serie.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(Math.min(tope, lim[k](p.n || 30)))}`).join(" ")}" class="lim"/>`;
  }
  let d = "", abierto = false;
  serie.forEach((p, i) => { if (p.y == null) { abierto = false; return; } d += `${abierto ? "L" : "M"}${x(i)},${y(p.y)} `; abierto = true; });
  s += `<path d="${d}" class="serie"/>`;
  serie.forEach((p, i) => {
    if (p.y == null) return;
    const f = fase(dias[i]), fuera = lim && f === "II" && (p.y > lim.ucl(p.n) || p.y < lim.lcl(p.n));
    s += `<circle cx="${x(i)}" cy="${y(p.y)}" r="${fuera ? 5 : 3.2}" class="${fuera ? "fuera" : f === "II" ? "p2" : f === "T" ? "pt" : "p1"}"><title>${dias[i]} · ${fmt(p.y)} · n=${p.n}</title></circle>`;
  });
  const a = mediaFase(serie, "I", pesada), b = mediaFase(serie, "II", pesada), sen = senales(serie, lim);
  const nII = idx("II").filter((i) => serie[i].y != null).length;
  const estado = !diaCambio || !nII ? ["gris", "Esperando días con Claude"] : sen.length ? [(b < a) === mejorBajo ? "bueno" : "malo", `Señal: ${sen[0]}`] : ["gris", `Sin señal en ${nII} día${nII > 1 ? "s" : ""}: dentro del ruido normal`];
  return `<section class="card"><div class="cab"><h2>${titulo}</h2><span class="chip ${estado[0]}">${estado[1]}</span></div><p class="que">${que}</p>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${titulo}">${s}</svg>
<p class="pie">Antes (7–23 nov): <b>${a == null ? "–" : fmt(a)}</b> · Con Claude: <b>${b == null ? "todavía sin días completos" : fmt(b)}</b>${lim ? ` · línea central y límites ±3σ de antes del cambio` : ""}</p></section>`;
}

// ── Quién contestó desde el cambio ────────────────────────────────────────
const desde = CAMBIO ? runs.filter((r) => new Date(r.t) >= new Date(CAMBIO)) : [];
const cuenta = {};
for (const r of desde) { const pieza = r.call_type === "guardian" ? "Guardián" : r.call_type === "classifier" ? "Clasificador" : "Vendedor"; const k = `${pieza}|${r.model}`; cuenta[k] ??= { n: 0, usd: 0, fallos: 0 }; cuenta[k].n += 1; cuenta[k].usd += costo(r); cuenta[k].fallos += r.fallo ? 1 : 0; }
const totalDesde = (pieza) => Object.entries(cuenta).filter(([k]) => k.startsWith(pieza)).reduce((a, [, v]) => a + v.n, 0);
const respaldo = (pieza, esperado) => { const t = totalDesde(pieza); return t ? 1 - (Object.entries(cuenta).filter(([k]) => k.startsWith(pieza) && k.includes(esperado)).reduce((a, [, v]) => a + v.n, 0)) / t : null; };
const rv = respaldo("Vendedor", "claude-sonnet"), rg = respaldo("Guardián", "claude-haiku");
const convsDesde = new Set(desde.map((r) => r.conv)).size, usdDesde = desde.reduce((a, r) => a + costo(r), 0);
const tablaModelos = !CAMBIO ? "" : `<section class="card"><div class="cab"><h2>Quién contestó desde el cambio</h2><span class="chip ${desde.length ? (Math.max(rv ?? 0, rg ?? 0) > 0.1 ? "malo" : "bueno") : "gris"}">${desde.length ? `${desde.length} corridas · ${convsDesde} conversaciones · $${usdDesde.toFixed(2)}` : "Todavía sin corridas"}</span></div>
<p class="que">Cada corrida guarda el modelo que la atendió de verdad. Si Claude falla, el bot contesta con gpt-5.5 (el respaldo): acá se ve cuántas veces pasó. Parte del vendedor usa siempre gpt-5.4-mini (rutinas y respuestas de herramienta exacta): eso no es respaldo.</p>
<div class="tabla"><table><tr><th>Pieza</th><th>Modelo</th><th>Corridas</th><th>Con error</th><th>Costo</th></tr>${Object.entries(cuenta).sort().map(([k, v]) => `<tr><td>${k.split("|")[0]}</td><td>${k.split("|")[1]}</td><td>${v.n}</td><td>${v.fallos}</td><td>$${v.usd.toFixed(2)}</td></tr>`).join("")}</table></div>
<p class="pie">Corridas del Guardián que NO atendió Haiku: <b>${rg == null ? "–" : pct(rg)}</b> · corridas del vendedor que no atendió Sonnet (incluye las de gpt-5.4-mini de siempre): <b>${rv == null ? "–" : pct(rv)}</b></p></section>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Depot en Claude</title>
<style>
  :root { --bg:#f7f6f3; --card:#fff; --fg:#1b1a18; --fg2:#5c5953; --line:#e2dfd8; --serie:#2a78d6; --p1:#8a8780; --ok:#1b8f63; --bad:#c8102e; --zona:rgba(42,120,214,.07) }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#151412; --card:#1e1d1a; --fg:#f0eee9; --fg2:#a8a49c; --line:#34322d; --serie:#5b9cf0; --p1:#8f8b83; --ok:#35b888; --bad:#ff5a6e; --zona:rgba(91,156,240,.10); color-scheme:dark } }
  :root[data-theme="dark"] { --bg:#151412; --card:#1e1d1a; --fg:#f0eee9; --fg2:#a8a49c; --line:#34322d; --serie:#5b9cf0; --p1:#8f8b83; --ok:#35b888; --bad:#ff5a6e; --zona:rgba(91,156,240,.10); color-scheme:dark }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 -apple-system,system-ui,sans-serif; font-variant-numeric:tabular-nums }
  main { max-width:900px; margin:0 auto; padding-block:26px 52px; padding-left:max(16px, env(safe-area-inset-left, 0px)); padding-right:max(16px, env(safe-area-inset-right, 0px)) }
  h1 { font-size:24px; margin:0 0 4px; text-wrap:balance } .sub { color:var(--fg2); margin:0 0 18px; font-size:14px }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:14px }
  .cab { display:flex; flex-wrap:wrap; gap:8px; justify-content:space-between; align-items:center } h2 { font-size:16px; margin:0 }
  .chip { font-size:12px; padding:2px 9px; border-radius:99px; border:1px solid currentColor } .gris { color:var(--fg2) } .bueno { color:var(--ok) } .malo { color:var(--bad) }
  .que { font-size:13.5px; color:var(--fg2); margin:6px 0 8px } .pie { font-size:13.5px; color:var(--fg2); margin:8px 0 0 } .pie b { color:var(--fg) }
  svg { width:100%; height:auto; display:block } .eje { font-size:11px; fill:var(--fg2) } .rej { stroke:var(--line) } .zona { fill:var(--zona) }
  .centro { stroke:var(--fg2); stroke-width:1.2 } .lim { fill:none; stroke:var(--fg2); stroke-dasharray:4 4; stroke-width:1 } .serie { fill:none; stroke:var(--serie); stroke-width:1.6 }
  .p1 { fill:var(--p1) } .p2 { fill:var(--serie) } .pt { fill:var(--card); stroke:var(--p1); stroke-width:1.5 } .fuera { fill:var(--bad) }
  .tabla { overflow-x:auto } table { border-collapse:collapse; width:100%; font-size:14px } th,td { text-align:right; padding:6px 8px; border-bottom:1px solid var(--line); white-space:nowrap } th:first-child,td:first-child,th:nth-child(2),td:nth-child(2) { text-align:left } th { font-size:12px; color:var(--fg2); font-weight:500 }
</style></head><body><main>
<h1>Depot en Claude: antes y después</h1>
<p class="sub">Producción de Depot Tire, día por día · ${CAMBIO ? `cambio a Sonnet 5.5 + Haiku 5.5 el ${new Date(CAMBIO).toLocaleString("es-EC", { timeZone: TZ, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` : "todavía sin cambio: solo línea de base"} · generado ${new Date().toLocaleString("es-EC", { timeZone: TZ, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
<section class="card"><h2>Qué estás viendo</h2><p class="que" style="margin-bottom:0">Cada punto es un día de Depot. Los puntos grises son de antes del cambio (7–23 nov, con gpt-5.5 y Black Friday ya activo): con ellos se calcula la línea del centro y los límites punteados (±3σ). Los puntos azules son días con Claude. Mientras caigan dentro de los límites, la diferencia es ruido normal, no «mejor» ni «peor». Una señal es un punto rojo fuera de límites u 8 días seguidos del mismo lado. Los círculos vacíos son días incompletos (el del cambio y hoy) y no cuentan. Ojo: ya no hay grupo de control, así que un cambio en los clientes (fin del Black Friday el 30-nov, diciembre) también movería estos gráficos.</p></section>
${tablaModelos}
${grafico("1 · Costo de IA por conversación", "Todo lo que gastó la IA ese día dividido para las conversaciones atendidas. Es lo que se quiere bajar.", sCosto, limitesI(sCosto), usd, false, true)}
${grafico("2 · Chats que llegan a cotización", "De los chats que empezaron ese día, cuántos terminaron con una cotización firmada. Es lo que no puede bajar.", sCotiza, limitesP(sCotiza), pct, true, false)}
${grafico("3 · Chats que acuerdan día de visita", "De los chats que empezaron ese día, cuántos dejaron un día de visita acordado.", sVisita, limitesP(sVisita), pct, true, false)}
${grafico("4 · Cotizan después de contestar las opciones", "De los chats que vieron las opciones y le contestaron al bot, cuántos llegaron a cotización. Aquí perdió ventas el vendedor gpt-5.4 en octubre.", sTrasOpc, limitesP(sTrasOpc), pct, true, false)}
${grafico("5 · Borradores que el Guardián corrigió", "De las respuestas que revisó el Guardián, cuántas mandó a corregir. Si sube mucho, el vendedor se equivoca más o el Guardián nuevo es más estricto; si baja mucho, puede estar dejando pasar errores.", sCorrige, limitesP(sCorrige), pct, true, true)}
${grafico("6 · Corridas del vendedor con error", "De las corridas del vendedor, cuántas terminaron con error técnico.", sFalla, limitesP(sFalla), pct, true, true)}
</main></body></html>`;
writeFileSync(SALIDA, html);
const r = (s, p) => { const a = mediaFase(s, "I", p), b = mediaFase(s, "II", p); return `${a == null ? "–" : a.toFixed(3)} → ${b == null ? "–" : b.toFixed(3)}`; };
console.log(`Escrito ${SALIDA}\ncosto/conv ${r(sCosto, false)} · cotiza ${r(sCotiza, true)} · visita ${r(sVisita, true)} · tras opciones ${r(sTrasOpc, true)} · corrige ${r(sCorrige, true)} · error ${r(sFalla, true)}`);
if (CAMBIO) console.log(`desde el cambio: ${desde.length} corridas, ${convsDesde} conv, $${usdDesde.toFixed(2)} · ${Object.entries(cuenta).map(([k, v]) => `${k}=${v.n}`).join(" · ")}`);
