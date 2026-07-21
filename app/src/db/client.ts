import postgres from "postgres";
import { config } from "../config.js";

// Railway Postgres (red interna) no usa SSL. Supabase/proxy público sí → PGSSL=require.
// `prepare: false` es seguro con poolers en modo transacción (pgbouncer).
export const sql = postgres(config.databaseUrl, {
  ssl: config.pgSsl ? "require" : false,
  prepare: false,
  max: 5,
  // El esquema es deliberadamente idempotente y se aplica al arrancar HTTP y
  // worker. PostgreSQL emite un NOTICE por cada columna/índice existente; no
  // aporta señal y puede saturar el límite de logs de Railway.
  onnotice: () => {},
});

export type Sql = typeof sql;
