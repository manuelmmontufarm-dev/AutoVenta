/**
 * `config.json`: lo único que cambia de un cliente a otro. Vive al lado del
 * programa, en el servidor del cliente. Ver `config.ejemplo.json`.
 */
import { readFileSync } from "node:fs";
import { validarSoloLectura } from "./consultas.mjs";
import { MOTORES } from "./motores/index.mjs";

const texto = (v) => (typeof v === "string" ? v.trim() : "");

/** Valida y devuelve la configuración lista para usar. Lanza con una frase clara. */
export function validarConfig(cruda) {
  const errores = [];
  const servidor = texto(cruda?.servidor).replace(/\/+$/, "");
  if (!/^https?:\/\//.test(servidor)) errores.push("«servidor» tiene que ser la dirección del bot (https://…).");
  if (/^http:\/\//.test(servidor) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(servidor)) {
    errores.push("«servidor» tiene que ser https: la clave y las facturas no viajan sin cifrar.");
  }
  const clave = texto(cruda?.clave);
  if (clave.length < 20) errores.push("«clave» es la CONECTOR_KEY del servicio (20 caracteres o más).");

  const motor = texto(cruda?.motor).toLowerCase();
  if (!MOTORES[motor]) errores.push(`«motor» tiene que ser uno de: ${Object.keys(MOTORES).join(", ")}.`);
  const conexion = cruda?.conexion && typeof cruda.conexion === "object" ? cruda.conexion : null;
  if (!conexion) errores.push("Falta «conexion» (host, puerto, base, usuario, clave).");

  const seccion = (nombre) => {
    const s = cruda?.[nombre];
    if (!s || s.activo === false) return null;
    try {
      return { ...s, sql: validarSoloLectura(s.sql, `La consulta de ${nombre}`) };
    } catch (error) {
      errores.push(error.message);
      return null;
    }
  };
  const inventario = seccion("inventario");
  const facturas = seccion("facturas");
  if (facturas && !facturas.sql.includes("{desde}")) {
    errores.push("La consulta de facturas tiene que filtrar por fecha con {desde} (ej.: where f.fecha >= {desde}).");
  }
  if (!inventario && !facturas && !errores.length) errores.push("No hay nada que leer: faltan «inventario» y «facturas».");

  if (errores.length) throw new Error(`config.json:\n  - ${errores.join("\n  - ")}`);
  return {
    servidor,
    clave,
    motor,
    conexion,
    inventario,
    facturas: facturas && {
      ...facturas,
      // Cuántos días hacia atrás se vuelven a leer en cada pasada: una factura
      // corregida o anulada dentro de esa ventana se actualiza sola.
      dias: Number.isFinite(Number(facturas.dias)) && Number(facturas.dias) > 0 ? Math.floor(Number(facturas.dias)) : 3,
      columnaDocumento: texto(facturas.columnaDocumento) || "num factura",
    },
  };
}

export function leerConfig(ruta) {
  let cruda;
  try {
    cruda = JSON.parse(readFileSync(ruta, "utf8").replace(/^﻿/, ""));
  } catch (error) {
    throw new Error(`No pude leer ${ruta}: ${error.message}`);
  }
  return validarConfig(cruda);
}
