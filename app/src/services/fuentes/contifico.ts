/**
 * Fuente Contífico: el adaptador de lo que ya existía.
 *
 * El código de catálogo vivía en `services/catalog.ts:128-182` y el de
 * facturas en `services/ventasConfirmadas.ts`; se movió acá SIN cambiar lo que
 * producen (hay prueba de equivalencia con un fixture del snapshot real). Todo
 * lo que es de Depot —la serie 001/002 → local, la llave de facturas— se queda
 * en este adaptador: las otras fuentes no lo heredan.
 */
import { config } from "../../config.js";
import {
  normalizeContificoProduct,
  type CatalogItem,
  type ContificoProductWire,
} from "../../domain/catalog.js";
import type {
  FacturaVenta,
  FuenteDeCatalogo,
  FuenteDeFacturas,
  LecturaDeFacturas,
  ReporteDeCatalogo,
} from "./tipos.js";

// ── Catálogo ─────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: URL, apiKey: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, {
      headers: { Authorization: apiKey, Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Contífico agotó el tiempo de respuesta");
    }
    throw new Error("No se pudo conectar con Contífico");
  } finally {
    clearTimeout(timeout);
  }
}

async function sincronizarCatalogo(): Promise<{ items: CatalogItem[]; report: ReporteDeCatalogo }> {
  if (!config.contifico) throw new Error("Contífico no configurado");
  const next: CatalogItem[] = [];
  const skipped: ReporteDeCatalogo["skipped"] = [];
  let page = 1;
  let loaded = 0;
  let total: number | null = null;

  while (page <= 100) {
    const url = new URL(`${config.contifico.baseUrl}/producto/`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("estado", "A");
    const response = await fetchWithTimeout(url, config.contifico.apiKey);
    if (!response.ok) {
      throw new Error(`Contífico respondió HTTP ${response.status} al leer productos`);
    }
    const payload = (await response.json()) as
      | ContificoProductWire[]
      | { count?: unknown; next?: unknown; results?: ContificoProductWire[] };
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.results)
        ? payload.results
        : [];
    if (!Array.isArray(payload) && typeof payload.count === "number") total = payload.count;

    rows.forEach((row, index) => {
      const item = normalizeContificoProduct(row, config.contifico!.customerPriceTier, {
        customerDivisor: config.contifico!.customerPriceDivisor,
        minimumDivisor: config.contifico!.minimumPriceDivisor,
      });
      if (item?.sizeLabel) next.push(item);
      else {
        skipped.push({
          row: loaded + index + 1,
          reason: item ? `producto sin medida reconocible: "${item.name}"` : "producto inválido o sin precio",
        });
      }
    });

    loaded += rows.length;
    if (rows.length === 0) break;
    if (total !== null && loaded >= total) break;
    if (!Array.isArray(payload) && !payload.next && rows.length < 100) break;
    if (Array.isArray(payload) && rows.length < 100) break;
    page += 1;
  }

  if (next.length === 0) throw new Error("Contífico no devolvió llantas cotizables");
  return {
    items: next,
    report: { ok: next.length, skipped, at: new Date(), source: "contifico" },
  };
}

export const fuenteContificoCatalogo: FuenteDeCatalogo = {
  id: "contifico",
  async sincronizar() {
    const { items, report } = await sincronizarCatalogo();
    return { items, aros: [], report };
  },
};

// ── Facturas ─────────────────────────────────────────────────────────────────

const MAX_PAGINAS = 25;
/** 205/55R16, LT265/70R17, 255/50ZR19, 31X10.50R15, 33X12.5R17, 7.00R15. */
export const LLANTA =
  /\d{2,3}\s*\/\s*\d{2}\s*Z?R\s*\d{2}|\d{2}\s*X\s*\d{1,2}(?:[.,]\d{1,2})?\s*R\s*\d{2}|\b\d{1,2}[.,]\d{2}\s*R\s*\d{2}/i;

export const tel9 = (s: unknown): string | null => {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
};

/**
 * La serie del documento dice el local — REGLA DE DEPOT: vive en este
 * adaptador y no en el cruce, para que las facturas de otra fuente traigan su
 * propio local (o ninguno).
 */
export const local = (documento: string) =>
  documento.startsWith("002-") ? "Cumbayá" : documento.startsWith("001-") ? "Quito Sur" : "—";

function diaDeContifico(s: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** "16:33:49" → 16. */
function horaDeContifico(s: unknown): number | null {
  const m = /^(\d{1,2}):\d{2}/.exec(String(s ?? "").trim());
  const h = m ? Number(m[1]) : NaN;
  return h >= 0 && h <= 23 ? h : null;
}

export interface DocumentoWire {
  tipo_documento?: string;
  anulado?: boolean;
  documento?: string;
  fecha_emision?: string;
  hora_emision?: string | null;
  total?: string | number;
  subtotal?: string | number | null;
  iva?: string | number | null;
  cliente?: { razon_social?: string | null; telefonos?: string | null } | null;
  detalles?: Array<{
    producto_nombre?: string | null;
    cantidad?: string | number;
    precio?: string | number;
    porcentaje_descuento?: string | number;
  }> | null;
}

export function normalizarFactura(doc: DocumentoWire): FacturaVenta | null {
  if (doc.tipo_documento !== "FAC" || doc.anulado) return null;
  const dia = diaDeContifico(doc.fecha_emision);
  if (!dia || !doc.documento) return null;
  const telefonos = [...new Set(String(doc.cliente?.telefonos ?? "").split(/[^\d]+/).map(tel9).filter((t): t is string => Boolean(t)))];
  const total = Number(doc.total) || 0;
  const subtotal = doc.subtotal != null && doc.subtotal !== "" ? Number(doc.subtotal) || 0 : total - (Number(doc.iva) || 0);
  return {
    documento: doc.documento,
    dia,
    hora: horaDeContifico(doc.hora_emision),
    total,
    subtotal,
    cliente: (doc.cliente?.razon_social ?? "").trim(),
    telefonos,
    llantas: (doc.detalles ?? [])
      .filter((l) => LLANTA.test(l.producto_nombre ?? ""))
      // El precio que se cobró, no el de lista: una garantía viene con la
      // llanta a $261 y 100 % de descuento (Dani R., 7-sep).
      .map((l) => ({
        nombre: (l.producto_nombre ?? "").trim(),
        cantidad: Number(l.cantidad) || 0,
        precio: (Number(l.precio) || 0) * (1 - (Number(l.porcentaje_descuento) || 0) / 100),
      })),
    local: local(doc.documento),
  };
}

/** ¿Ya no hace falta seguir? Solo cuando la página ENTERA es anterior al primer chat. */
export function paginaEnteraAnterior(dias: Array<string | null>, desde: string): boolean {
  const masNueva = dias.reduce<string | null>((a, d) => (d && (!a || d > a) ? d : a), null);
  return masNueva !== null && masNueva < desde;
}

const llave = () => config.contifico!.facturasApiKey || config.contifico!.apiKey;

async function traerPagina(pagina: number): Promise<{ results: DocumentoWire[]; next: unknown }> {
  const url = new URL(`${config.contifico!.baseUrl}/documento/`);
  url.searchParams.set("tipo_registro", "CLI");
  url.searchParams.set("page", String(pagina));
  const ctrl = new AbortController();
  const corte = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(url, { headers: { Authorization: llave(), Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Contífico respondió HTTP ${res.status} al leer facturas`);
    const cuerpo = (await res.json()) as { results?: DocumentoWire[]; next?: unknown } | DocumentoWire[];
    return Array.isArray(cuerpo) ? { results: cuerpo, next: null } : { results: cuerpo.results ?? [], next: cuerpo.next };
  } finally {
    clearTimeout(corte);
  }
}

export const fuenteContificoFacturas: FuenteDeFacturas = {
  id: "contifico",
  async sincronizar(desde) {
    const facturas: FacturaVenta[] = [];
    let paginas = 0;
    let documentos = 0;
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
      const { results, next } = await traerPagina(pagina);
      paginas = pagina;
      documentos += results.length;
      for (const doc of results) {
        const f = normalizarFactura(doc);
        if (f && f.dia >= desde) facturas.push(f);
      }
      const dias = results.map((doc) => diaDeContifico(doc.fecha_emision));
      if (!next || !results.length || paginaEnteraAnterior(dias, desde)) break;
    }
    const diasLeidos = facturas.map((f) => f.dia).sort();
    const lectura: LecturaDeFacturas = {
      paginas,
      documentos,
      facturas: facturas.length,
      conTelefono: facturas.filter((f) => f.telefonos.length).length,
      primerDia: diasLeidos[0] ?? null,
      ultimoDia: diasLeidos.at(-1) ?? null,
      llave: config.contifico!.facturasApiKey ? "facturas" : "catalogo",
    };
    return { facturas, lectura };
  },
};
