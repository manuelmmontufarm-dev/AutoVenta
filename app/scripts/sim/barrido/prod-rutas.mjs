// Producción, SOLO LECTURA: qué modelo atiende cada ruta del vendedor desde que
// Depot pasó a Claude (24-nov-2026 20:41 UTC), con latencia y tokens medios.
import postgres from "postgres";
import { readFileSync } from "node:fs";

const url = readFileSync("/Users/manue/AutoVenta/app/.env", "utf8").split("\n")
  .find((l) => l.startsWith("DATABASE_URL=")).slice("DATABASE_URL=".length).trim();
const sql = postgres(url, { max: 1, ssl: "prefer", prepare: false, connection: { options: "-c default_transaction_read_only=on" } });
const desde = process.argv[2] ?? "2026-11-24T20:41:00Z";
const filas = await sql`
  select split_part(route, '+', 1) as ruta, model, count(*)::int as n,
    round(avg(latency_ms))::int as ms_media,
    percentile_disc(0.5) within group (order by latency_ms) as ms_p50,
    percentile_disc(0.9) within group (order by latency_ms) as ms_p90,
    round(avg(input_tokens))::int as entrada, round(avg(output_tokens))::int as salida
  from ai_runs
  where created_at > ${desde}::timestamptz and call_type = 'chat'
  group by 1, 2 order by n desc`;
console.table(filas);
const [conv] = await sql`select count(distinct conversation_id)::int as convs from ai_runs where created_at > ${desde}::timestamptz`;
console.log("conversaciones con IA desde", desde, conv.convs);
await sql.end();
