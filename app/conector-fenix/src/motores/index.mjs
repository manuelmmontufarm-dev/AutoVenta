/**
 * Un «motor» es la base de datos donde Fénix guarda sus datos. Todavía no
 * sabemos cuál usa cada cliente (lo dice `windows/diagnostico.ps1`), así que
 * el conector no depende de ninguno: cada motor es un archivo chico con la
 * misma forma, y agregar otro (SQL Server, MySQL, Firebird) es escribir ese
 * archivo y sumarlo acá.
 *
 * La forma de un motor:
 *   abrir(conexion) → {
 *     consultar(sql)  → { columnas: string[], filas: unknown[][] }
 *     tablas()        → [{ esquema, tabla, filas, columnas: [{ nombre, tipo }] }]
 *     cerrar()
 *   }
 * `consultar` devuelve las fechas y los números como TEXTO, tal cual los
 * guarda la base: así un día no se corre por la zona horaria y un precio no
 * pierde decimales en el camino.
 */
import * as postgres from "./postgres.mjs";

export const MOTORES = {
  postgres,
};

export async function abrirMotor(config) {
  const motor = MOTORES[config.motor];
  if (!motor) throw new Error(`Motor desconocido: ${config.motor}`);
  return motor.abrir(config.conexion);
}
