// Turnos REALES que atendió la rutina (gpt-5.4-mini) en producción: conv, corte y lo que escribió el cliente.
import "./env.mjs";
import { writeFileSync } from "node:fs";
const [archivo, N = "15"] = process.argv.slice(2);
const { sql } = await import("../../dist/db/client.js");
const runs = await sql`
  select distinct on (r.conversation_id) r.conversation_id, r.created_at, r.stage, r.tools from ai_runs r
  where r.route like 'routine_stage%' and r.model='gpt-5.4-mini' and r.created_at>='2026-11-25T01:41Z'
  order by r.conversation_id, random()`;
const casos = [];
for (const r of runs.sort(() => Math.random() - 0.5)) {
  if (casos.length >= Number(N)) break;
  const msgs = await sql`select id, direction, author_kind, content, type, created_at from messages where conversation_id=${r.conversation_id}
    and created_at <= ${r.created_at} order by created_at desc limit 10`;
  const turno = []; for (const m of msgs) { if (m.direction !== "inbound") break; turno.unshift(m); }
  if (!turno.length || turno.some((m) => m.type !== "text" || /^\[El cliente mandó/.test(m.content))) continue;
  const [resp] = await sql`select string_agg(content, E'\n---\n' order by created_at) t from messages where conversation_id=${r.conversation_id}
    and direction='outbound' and author_kind='bot' and created_at > ${r.created_at} and created_at < ${new Date(r.created_at.getTime() + 90000)}`;
  casos.push({ conv: Number(r.conversation_id), etapa: r.stage, hasta: new Date(turno[0].created_at.getTime() - 1000).toISOString(),
    cliente: turno.map((m) => m.content), respuestaProd: resp?.t ?? null, toolsProd: r.tools });
}
writeFileSync(archivo, JSON.stringify(casos, null, 1));
console.log(casos.length, casos.map((c) => `${c.conv}:${c.etapa}:${c.cliente.join(" / ").slice(0, 50)}`).join("\n"));
await sql.end();
