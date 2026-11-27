// Quita del historial de cada caso los mensajes del bot/asesor que salieron DESPUÉS del borrador
// (bloques multilínea: se borra la cadena exacta «BOT: <contenido[0..380]>»).
import "./env.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const [archivo] = process.argv.slice(2);
const { sql } = await import("../../dist/db/client.js");
const casos = JSON.parse(readFileSync(archivo, "utf8"));
let quitados = 0;
for (const c of casos) {
  const [gr] = await sql`select created_at, cycle from guardian_reviews where id=${c.id}`;
  const despues = await sql`select author_kind, content from messages where conversation_id=${c.conv} and cycle=${gr.cycle}
    and direction<>'inbound' and created_at > ${new Date(gr.created_at.getTime() - 15000)}`;
  const [cab, cola] = c.contexto.split("\n== BORRADOR QUE EL BOT QUIERE ENVIAR ==");
  let [antes, conv] = (cab.includes("== CONVERSACIÓN (vieja → nueva) ==\n") ? cab.split("== CONVERSACIÓN (vieja → nueva) ==\n") : [cab, ""]);
  for (const m of despues) {
    const quien = m.author_kind === "bot" ? "BOT" : "ASESOR";
    const bloque = `${quien}: ${(m.content ?? "").slice(0, 380)}`;
    if (conv.includes(bloque)) { conv = conv.replace(bloque + "\n", "").replace(bloque, ""); quitados++; }
  }
  c.contexto = (conv ? `${antes}== CONVERSACIÓN (vieja → nueva) ==\n${conv}` : antes) + (cola !== undefined ? "\n== BORRADOR QUE EL BOT QUIERE ENVIAR ==" + cola : "");
}
writeFileSync(archivo.replace(/\.json$/, "-limpio.json"), JSON.stringify(casos, null, 1));
console.log("bloques quitados", quitados);
await sql.end();
