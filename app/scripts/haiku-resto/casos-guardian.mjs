/**
 * Arma casos REALES del Guardián Haiku (producción, SOLO LECTURA): borrador tal cual,
 * veredicto de producción y el contexto rearmado al momento de la revisión
 * (entrantes cortados con `enElTurno`; lo que el bot mandó después se quita).
 * Aproximación: los datos de la ficha (conversations) son los de hoy.
 *   node scripts/haiku-resto/casos-guardian.mjs <salida.json> [porVeredicto=20]
 */
import "./env.mjs";
import { writeFileSync } from "node:fs";
const [archivo, porVeredicto = "20"] = process.argv.slice(2);
const { sql } = await import("../../dist/db/client.js");
const g = await import("../../dist/services/guardian.js");
const { enElTurno } = await import("../../dist/pipeline/corteDelTurno.js");
await (await import("../../dist/services/catalog.js")).ensureCatalogReady();
const filas = await sql`
  with r as (
    select distinct on (gr.conversation_id) gr.*, (select a.route from ai_runs a where a.conversation_id=gr.conversation_id and a.call_type='guardian'
        and a.created_at between gr.created_at - interval '20 seconds' and gr.created_at + interval '5 seconds' order by abs(extract(epoch from a.created_at-gr.created_at)) limit 1) as ruta
    from guardian_reviews gr where gr.model='claude-haiku-5-5' and gr.created_at>='2026-11-25T02:00Z' and gr.verdict in ('aprobar','corregir')
    order by gr.conversation_id, random())
  (select * from r where verdict='corregir' order by random() limit ${Number(porVeredicto)})
  union all (select * from r where verdict='aprobar' order by random() limit ${Number(porVeredicto)})`;
const casos = [];
for (const f of filas) {
  const [ult] = await sql`select max(id) id from messages where conversation_id=${f.conversation_id} and direction='inbound' and created_at <= ${f.created_at}`;
  const despues = await sql`select content from messages where conversation_id=${f.conversation_id} and cycle=${f.cycle} and direction<>'inbound' and created_at > ${new Date(f.created_at.getTime() - 15000)}`;
  const tipo = String(f.ruta ?? "").startsWith("guardian_seguimiento") ? "seguimiento" : undefined;
  let ctx = await enElTurno(ult?.id ? Number(ult.id) : null, () => g.armarContexto(Number(f.conversation_id), f.cycle, f.original_text, [], tipo ? { tipo } : {}));
  const quitar = new Set(despues.map((m) => `${(m.content ?? "").slice(0, 380)}`));
  ctx = ctx.split("\n").filter((l) => !(/^(BOT|ASESOR): /.test(l) && quitar.has(l.replace(/^(BOT|ASESOR): /, "")))).join("\n");
  casos.push({ id: Number(f.id), conv: Number(f.conversation_id), tipo: tipo ?? "turno", prod: { veredicto: f.verdict, hallazgos: f.findings, corregido: f.corrected_text },
    borrador: f.original_text, contexto: ctx });
}
writeFileSync(archivo, JSON.stringify(casos, null, 1));
console.log(casos.length, "casos;", casos.filter((c) => c.tipo === "seguimiento").length, "seguimientos");
await sql.end();
