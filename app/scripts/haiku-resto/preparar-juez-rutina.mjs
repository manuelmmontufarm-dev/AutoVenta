// Pares ciegos (A/B al azar) de la rutina para el juez: historia real antes del corte + lo que escribió el cliente + dos respuestas.
import "./env.mjs";
import fs from "node:fs";
const [archCasos, archMini, archHaiku, dir] = process.argv.slice(2);
const { sql } = await import("../../dist/db/client.js");
const casos = JSON.parse(fs.readFileSync(archCasos, "utf8"));
const mini = JSON.parse(fs.readFileSync(archMini, "utf8")), haiku = JSON.parse(fs.readFileSync(archHaiku, "utf8"));
const pares = [], llave = {};
for (const c of casos) {
  const m = mini.find((x) => x.conv === c.conv), h = haiku.find((x) => x.conv === c.conv);
  if (!m?.respuesta || !h?.respuesta) continue;
  const hist = (await sql`select direction, author_kind, content from messages where conversation_id=${c.conv} and created_at < ${c.hasta}
    order by created_at desc limit 14`).reverse().map((x) => `${x.direction === "inbound" ? "CLIENTE" : x.author_kind === "bot" ? "BOT" : "ASESOR"}: ${x.content}`);
  const aEsMini = Math.random() < 0.5;
  llave[c.conv] = aEsMini ? "A=mini" : "A=haiku";
  pares.push({ conv: c.conv, etapa: c.etapa, historia: hist.join("\n"), cliente_ahora: c.cliente.join("\n"),
    respuesta_A: (aEsMini ? m : h).respuesta.join("\n---\n"), respuesta_B: (aEsMini ? h : m).respuesta.join("\n---\n") });
}
fs.writeFileSync(`${dir}/rutina-pares.json`, JSON.stringify(pares, null, 1));
fs.writeFileSync(`${dir}/../rutina-llave.json`, JSON.stringify(llave, null, 1));
console.log(pares.length, "pares");
await sql.end();
