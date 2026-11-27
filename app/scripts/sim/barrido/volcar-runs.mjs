// Vuelca ai_runs del simulador (latencia por llamada) antes de que la base se borre.
import postgres from "postgres";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = postgres(process.env.SIM_DATABASE_URL, { max: 1 });
const filas = await sql`select conversation_id, model, call_type, route, latency_ms, input_tokens,
  cached_input_tokens, cache_write_tokens, output_tokens, error, created_at from ai_runs order by id`;
writeFileSync(resolve(import.meta.dirname, `../mediciones/runs-${process.argv[2]}.json`), JSON.stringify(filas));
console.log(`runs volcados: ${filas.length}`);
await sql.end();
