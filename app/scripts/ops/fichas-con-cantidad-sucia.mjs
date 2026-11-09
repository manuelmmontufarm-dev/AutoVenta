#!/usr/bin/env node
/**
 * Lista, SOLO LEYENDO, las fichas (`conversations.selected_quantity`) cuya cantidad no parece una
 * compra: más de 8 llantas, fuera de 1..100, o igual a un ancho de medida válido (125–355 de 5 en 5).
 *
 * Nacieron de leer el ancho de la medida como cantidad (auditoría 9-nov-2026, bloque 3.2: 185, 205,
 * 103, 16, 97, 235, 235). Estas filas NO se limpian: el lector único (`cantidadValidaDeLaFicha`) las
 * ignora al leerlas y el candado de escritura (`updateConversationFacts`) evita que se creen más.
 *
 * Uso:  cd app && node scripts/ops/fichas-con-cantidad-sucia.mjs
 * Usa DATABASE_URL de .env. Corre dentro de una transacción `read only`: no puede escribir.
 * No imprime mensajes ni datos del cliente, solo id, cantidad y medida de la ficha.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const env = Object.fromEntries(readFileSync(resolve(APP, ".env"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const url = process.env.PROD_DATABASE_URL ?? env.DATABASE_URL;
if (!url) { console.error("Falta DATABASE_URL en .env"); process.exit(1); }
const sql = postgres(url, { max: 1, prepare: false });
try {
  const filas = await sql.begin("read only", (tx) => tx`
    select id, selected_quantity, tire_size, updated_at
    from conversations
    where selected_quantity is not null
      and (selected_quantity > 8 or selected_quantity < 1
           or (selected_quantity between 125 and 355 and selected_quantity % 5 = 0))
    order by selected_quantity desc, id
  `);
  console.log(`${filas.length} ficha(s) con cantidad que no parece una compra:`);
  for (const f of filas) {
    console.log(`  conv ${f.id} · cantidad ${f.selected_quantity} · medida ${f.tire_size ?? "—"} · ${new Date(f.updated_at).toISOString()}`);
  }
} finally {
  await sql.end();
}
