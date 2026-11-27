// Baja (solo lectura) las fotos que mandaron los clientes y la lectura que hizo gpt-5.5 en producción.
import "./env.mjs";
import { writeFileSync } from "node:fs";
const dir = process.argv[2];
const { sql } = await import("../../dist/db/client.js");
const filas = await sql`
  select mm.id, mm.mime, mm.bytes, m.content, m.conversation_id from message_media mm
  join messages m on m.wa_message_id=mm.wa_message_id
  where mm.kind='image' and m.direction='inbound' and m.author_kind='customer' order by mm.id`;
const manifiesto = [];
for (const f of filas) {
  const ext = /png/.test(f.mime ?? "") ? "png" : /webp/.test(f.mime ?? "") ? "webp" : "jpg";
  writeFileSync(`${dir}/${f.id}.${ext}`, f.bytes);
  const lectura = /Se lee: ([^\]]*)\]/.exec(f.content)?.[1] ?? (/no se pudo leer/.test(f.content) ? "FOTO_SIN_DATOS" : null);
  const caption = f.content.replace(/^\[[^\]]*\]\s*/, "").trim();
  manifiesto.push({ id: f.id, archivo: `${f.id}.${ext}`, mime: f.mime, conv: Number(f.conversation_id), caption, prod_gpt55: lectura });
}
writeFileSync(`${dir}/manifiesto.json`, JSON.stringify(manifiesto, null, 1));
console.log(manifiesto.length, "fotos");
await sql.end();
