#!/usr/bin/env node
/**
 * ¿SIGUE SIENDO ESTÁNDAR LA CONVERSACIÓN ESTÁNDAR?
 *
 * Saca de producción el perfil de la conversación promedio (mensajes del
 * cliente, corridas del guardián, costo, caminos) y lista las conversaciones
 * reales más parecidas a ese promedio. Con esto se eligió la conv 18588 el
 * 12-sep-2026; hay que volver a correrlo cuando el negocio cambie de forma
 * (otro anuncio, otro tipo de cliente) o cada trimestre, y si el camino
 * dominante o la media se movieron, elegir otra y subir `version` en
 * `conversacion-estandar.json`.
 *
 *   DATABASE_URL='postgresql://…' node scripts/sim/estandar/perfil-historico.mjs --dias 30
 *
 * SOLO LECTURA: la conexión se abre con default_transaction_read_only.
 */
import postgres from "postgres";

const argv = process.argv.slice(2);
const i = argv.indexOf("--dias");
const DIAS = Number(i >= 0 ? argv[i + 1] : 30);
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL (la de producción, se usa solo para leer).");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, {
  prepare: false, max: 2, connection: { default_transaction_read_only: "on", statement_timeout: 120000 },
});

// Tarifas por millón de gpt-5.5 y gpt-5.4-mini (services/billing.ts). Los
// teléfonos 5939000… son del simulador y quedan fuera.
const filas = await sql`
with ventana as (select now() - make_interval(days => ${DIAS}) desde),
m as (
  select conversation_id id,
    count(*) filter (where role = 'user') n_cli,
    count(*) filter (where author_kind = 'owner') n_owner,
    count(distinct cycle) ciclos
  from messages, ventana where created_at > desde group by 1
),
r as (
  select conversation_id id,
    count(*) filter (where call_type = 'guardian') guard_runs,
    count(*) filter (where call_type = 'vision') vision_runs,
    sum((greatest(coalesce(input_tokens,0) - coalesce(cached_input_tokens,0), 0)
           * case model when 'gpt-5.4-mini' then 0.75 when 'gpt-5.4' then 2.5 else 5 end
         + coalesce(cached_input_tokens,0) * case model when 'gpt-5.4-mini' then 0.075 when 'gpt-5.4' then 0.25 else 0.5 end
         + coalesce(output_tokens,0) * case model when 'gpt-5.4-mini' then 4.5 when 'gpt-5.4' then 15 else 30 end) / 1e6) usd,
    sum((greatest(coalesce(input_tokens,0) - coalesce(cached_input_tokens,0), 0) * 5
         + coalesce(cached_input_tokens,0) * 0.5 + coalesce(output_tokens,0) * 30) / 1e6)
      filter (where call_type = 'guardian') usd_guard
  from ai_runs, ventana where created_at > desde group by 1
),
h as (
  select conversation_id id, array_agg(distinct t) herramientas
  from ai_runs, ventana, jsonb_array_elements_text(case when jsonb_typeof(tools) = 'array' then tools else '[]'::jsonb end) t
  where created_at > desde group by 1
),
q as (select conversation_id id, count(*) cotizaciones from quotes, ventana where created_at > desde group by 1)
select m.id, m.n_cli, m.n_owner, m.ciclos, coalesce(r.guard_runs,0) guard_runs, coalesce(r.vision_runs,0) vision_runs,
  coalesce(r.usd,0)::float usd, coalesce(r.usd_guard,0)::float usd_guard, coalesce(h.herramientas,'{}') herramientas,
  coalesce(q.cotizaciones,0) cotizaciones
from m join conversations c on c.id = m.id
left join r on r.id = m.id left join h on h.id = m.id left join q on q.id = m.id
where m.n_cli > 0 and c.phone not like '5939000%'`;

const convs = filas.map((f) => ({ ...f, id: Number(f.id), n_cli: Number(f.n_cli), n_owner: Number(f.n_owner),
  ciclos: Number(f.ciclos), guard_runs: Number(f.guard_runs), vision_runs: Number(f.vision_runs), cotizaciones: Number(f.cotizaciones) }));
const media = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const total = convs.reduce((a, c) => a + c.usd, 0);
const tiene = (c, t) => c.herramientas.includes(t);

console.log(`\n== ${DIAS} días · ${convs.length} conversaciones reales · $${(total / convs.length).toFixed(4)} por conversación · guardián ${(100 * convs.reduce((a, c) => a + c.usd_guard, 0) / total).toFixed(1)} % del costo`);
console.table(["n_cli", "guard_runs", "usd"].map((k) => {
  const v = convs.map((c) => c[k]);
  return { campo: k, media: +media(v).toFixed(3), p25: pct(v, 0.25), p50: pct(v, 0.5), p75: pct(v, 0.75) };
}));

const caminos = {
  "sin opciones": (c) => !tiene(c, "preparar_opciones") && c.cotizaciones === 0,
  "opciones, sin cotización": (c) => tiene(c, "preparar_opciones") && c.cotizaciones === 0,
  "con cotización": (c) => c.cotizaciones > 0,
};
console.table(Object.fromEntries(Object.entries(caminos).map(([k, fn]) => {
  const s = convs.filter(fn);
  return [k, { pct_convs: +(100 * s.length / convs.length).toFixed(1), pct_costo: +(100 * s.reduce((a, c) => a + c.usd, 0) / total).toFixed(1),
    usd_medio: +media(s.map((c) => c.usd)).toFixed(4), n_cli: +media(s.map((c) => c.n_cli)).toFixed(1), guardian: +media(s.map((c) => c.guard_runs)).toFixed(1) }];
})));

const mCli = media(convs.map((c) => c.n_cli)), mGuard = media(convs.map((c) => c.guard_runs)), mUsd = total / convs.length;
console.log(`\n== candidatas (sin asesor, sin fotos, un ciclo, con opciones), más cerca de la media`);
console.table(convs
  .filter((c) => c.n_owner === 0 && c.vision_runs === 0 && c.ciclos === 1 && tiene(c, "preparar_opciones"))
  .map((c) => ({ id: c.id, n_cli: c.n_cli, guardian: c.guard_runs, cotizaciones: c.cotizaciones, usd: +c.usd.toFixed(4),
    distancia: +(Math.abs(c.n_cli - mCli) / mCli + Math.abs(c.guard_runs - mGuard) / mGuard + Math.abs(c.usd - mUsd) / mUsd).toFixed(2) }))
  .sort((a, b) => a.distancia - b.distancia)
  .slice(0, 12));
await sql.end();
