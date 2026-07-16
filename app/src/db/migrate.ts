/** Aplica schema.sql (idempotente — todo es `create if not exists`). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "./client.js";

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, "schema.sql"), "utf8");

await sql.unsafe(schema);
console.log("✅ Esquema aplicado");
await sql.end();
