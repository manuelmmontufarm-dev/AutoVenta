import postgres from "postgres";
import { config } from "../config.js";

// Supabase free requiere SSL; `prepare: false` por el pooler (pgbouncer modo transaction).
export const sql = postgres(config.databaseUrl, {
  ssl: "require",
  prepare: false,
  max: 5,
});

export type Sql = typeof sql;
