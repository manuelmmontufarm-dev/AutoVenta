/**
 * Qué fuente manda, decidida EN CADA sincronización — subir un catálogo en el
 * panel no pide reinicio, y quitarle la clave de Contífico a un servicio lo
 * pasa al archivo en el próximo sync.
 *
 * Orden del catálogo: Contífico si hay `CONTIFICO_API_KEY`; si no, el archivo
 * subido si existe; si no, Sheets si hay `CATALOG_SHEET_ID`. Facturas: Contífico
 * si hay clave; si no, las importadas por archivo si hay alguna.
 */
import { config } from "../../config.js";
import {
  fuenteArchivoCatalogo,
  fuenteArchivoFacturas,
  hayCatalogoArchivo,
  hayFacturasImportadas,
} from "./archivo.js";
import { fuenteContificoCatalogo, fuenteContificoFacturas } from "./contifico.js";
import { fuenteSheetsCatalogo } from "./sheets.js";
import type { FuenteDeCatalogo, FuenteDeFacturas } from "./tipos.js";

export type { FacturaVenta, FuenteDeCatalogo, FuenteDeFacturas, IdFuente, LecturaDeFacturas, ReporteDeCatalogo, ResultadoDeCatalogo } from "./tipos.js";

export async function fuenteDeCatalogo(): Promise<FuenteDeCatalogo | null> {
  if (config.contifico) return fuenteContificoCatalogo;
  if (await hayCatalogoArchivo()) return fuenteArchivoCatalogo;
  if (config.catalog) return fuenteSheetsCatalogo;
  return null;
}

export async function fuenteDeFacturas(): Promise<FuenteDeFacturas | null> {
  if (config.contifico) return fuenteContificoFacturas;
  if (await hayFacturasImportadas()) return fuenteArchivoFacturas;
  return null;
}
