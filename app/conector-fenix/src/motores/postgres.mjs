/** PostgreSQL. */
import postgres from "postgres";

import { numeroComoTexto } from "../csv.mjs";

// Fechas y horas llegan como el texto que guarda la base (date, time, timestamp…).
const FECHAS = [1082, 1083, 1114, 1184, 1266];
// NUMERIC, REAL y DOUBLE: ver `numeroComoTexto`.
const NUMEROS = [1700, 700, 701];

export async function abrir(conexion) {
  const sql = postgres({
    host: conexion.host ?? "localhost",
    port: Number(conexion.puerto ?? 5432),
    database: conexion.base,
    username: conexion.usuario,
    password: conexion.clave ?? "",
    ssl: conexion.ssl ? "prefer" : false,
    max: 1,
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 5,
    onnotice: () => undefined,
    types: {
      fecha: { to: 25, from: FECHAS, serialize: (x) => x, parse: (x) => x },
      numero: { to: 1700, from: NUMEROS, serialize: (x) => x, parse: numeroComoTexto },
    },
    // Segundo candado: la propia base rechaza cualquier escritura de esta conexión.
    connection: { default_transaction_read_only: "on", statement_timeout: "120000", application_name: "autoventa-conector" },
  });

  async function consultar(texto) {
    const resultado = await sql.unsafe(texto).values();
    return { columnas: resultado.columns.map((c) => c.name), filas: resultado.map((fila) => [...fila]) };
  }

  async function tablas() {
    const columnas = await consultar(`
      select c.table_schema, c.table_name, c.column_name, c.data_type
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
      where t.table_type = 'BASE TABLE' and c.table_schema not in ('information_schema', 'pg_catalog')
      order by c.table_schema, c.table_name, c.ordinal_position
    `);
    const conteos = await consultar(`
      select n.nspname, c.relname, case when c.reltuples < 0 then null else c.reltuples::bigint end
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r'
    `);
    // Sin conteo (la base nunca analizó esa tabla) queda en null y se muestra «?».
    const filasDe = new Map(conteos.filas.map(([esquema, tabla, n]) => [`${esquema}.${tabla}`, n === null ? null : Number(n)]));
    const porTabla = new Map();
    for (const [esquema, tabla, nombre, tipo] of columnas.filas) {
      const llave = `${esquema}.${tabla}`;
      if (!porTabla.has(llave)) porTabla.set(llave, { esquema, tabla, filas: filasDe.get(llave) ?? null, columnas: [] });
      porTabla.get(llave).columnas.push({ nombre, tipo });
    }
    return [...porTabla.values()];
  }

  return {
    consultar,
    tablas,
    nombreDeTabla: (esquema, tabla) => `"${esquema.replace(/"/g, '""')}"."${tabla.replace(/"/g, '""')}"`,
    nombreDeColumna: (columna) => `"${columna.replace(/"/g, '""')}"`,
    /** Cómo se compara una columna cualquiera, como texto y sin mayúsculas. */
    contiene: (columna, valor) => `cast(${columna} as text) ilike '%${valor.replace(/'/g, "''").replace(/[%_\\]/g, "\\$&")}%'`,
    limite: (sqlTexto, n) => `${sqlTexto} limit ${n}`,
    cerrar: () => sql.end({ timeout: 5 }),
  };
}
