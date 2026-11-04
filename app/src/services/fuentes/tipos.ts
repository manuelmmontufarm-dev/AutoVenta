/**
 * Fuentes de datos del negocio: de dónde salen el catálogo y las facturas.
 *
 * Hasta el 4-nov el catálogo era un `if Contífico / else Sheets` dentro de
 * `services/catalog.ts` y las facturas eran solo Contífico. Mundillantas usa
 * Fénix en un servidor local sin API: su inventario y sus facturas llegan como
 * un Excel subido en el panel. La interfaz de acá deja que `syncCatalog` y
 * `sincronizarFacturas` no sepan de dónde vienen los datos; la fuente se
 * decide EN CADA sincronización (subir un catálogo no pide reinicio).
 */
import type { CatalogItem } from "../../domain/catalog.js";
import type { AroProducto } from "../../domain/aroProducto.js";

export type IdFuente = "contifico" | "sheets" | "archivo";

export interface ReporteDeCatalogo {
  ok: number;
  skipped: { row: number; reason: string }[];
  at: Date;
  source: IdFuente;
}

export interface ResultadoDeCatalogo {
  items: CatalogItem[];
  /** Aros como producto (solo los trae la fuente `archivo`; ver R-24). */
  aros: AroProducto[];
  report: ReporteDeCatalogo;
}

export interface FuenteDeCatalogo {
  id: IdFuente;
  sincronizar(): Promise<ResultadoDeCatalogo>;
}

/**
 * Una factura de venta, venga de donde venga. Es la forma que siempre tuvo
 * `FacturaContifico`, más el `local`: la regla «serie 001/002 → local» es de
 * Depot y vive en el adaptador de Contífico, no en el cruce.
 */
export interface FacturaVenta {
  documento: string;
  /** "YYYY-MM-DD", día de emisión. */
  dia: string;
  /** Hora (0–23) de emisión, la del local. Null si la fuente no la trae. */
  hora: number | null;
  total: number;
  /** Sin IVA. Si la fuente no lo trae, `total − iva`. */
  subtotal: number;
  cliente: string;
  telefonos: string[];
  llantas: Array<{ nombre: string; cantidad: number; precio: number }>;
  /** Nombre del local que facturó, si la fuente lo sabe. */
  local?: string;
}

/** Qué se leyó en la última bajada de facturas, para diagnosticar números raros. */
export interface LecturaDeFacturas {
  paginas: number;
  documentos: number;
  facturas: number;
  conTelefono: number;
  primerDia: string | null;
  ultimoDia: string | null;
  llave: "facturas" | "catalogo" | "archivo";
}

export interface FuenteDeFacturas {
  id: IdFuente;
  /** Facturas desde `desde` (YYYY-MM-DD, el primer chat del bot). */
  sincronizar(desde: string): Promise<{ facturas: FacturaVenta[]; lectura: LecturaDeFacturas }>;
}
