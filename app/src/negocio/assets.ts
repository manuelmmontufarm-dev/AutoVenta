/**
 * LOS ARCHIVOS DE CADA CLIENTE (logos, escalera, conocimiento de marcas,
 * tipos de llanta): `app/assets/<id>/<archivo>` si existe, si no el común
 * `app/assets/<archivo>`.
 *
 * Existe para que la escalera y el conocimiento de marcas de Depot no se le
 * cuelen a otro cliente: hasta el 4-nov-2026 `domain/escalera.ts`,
 * `domain/respaldoMarcas.ts` y `domain/tireTypes.ts` cargaban los JSON
 * globales de `app/assets/`, que son datos comerciales de Depot.
 *
 * OJO: este módulo usa `node:fs`, así que NO lo puede importar nada de la
 * cadena que empaqueta el panel (`negocio/index.ts`, `negocio/perfil.ts`,
 * `negocio/politica.ts`, `politicas/*`, `negocios/*`). Lo importan los
 * cargadores del dominio, que ya leen archivos.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { negocio } from "./index.js";

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");

/** La ruta del archivo del negocio activo, con respaldo al común. */
export function rutaDeAsset(nombre: string): string {
  const propia = path.join(ASSETS, negocio.id, nombre);
  return existsSync(propia) ? propia : path.join(ASSETS, nombre);
}
