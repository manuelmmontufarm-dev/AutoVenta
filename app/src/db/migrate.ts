/** Migración manual (opcional — el bot también aplica el esquema al arrancar). */
import { sql } from "./client.js";
import { ensureSchema } from "./schema.js";

await ensureSchema();
console.log("✅ Esquema aplicado");
await sql.end();
