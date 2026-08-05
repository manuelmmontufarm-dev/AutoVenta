/**
 * Vista previa de las piezas para el tab de Ajustes.
 *
 * Renderiza con los valores que se están probando, no con los guardados: el
 * negocio ve el cambio antes de aplicarlo. Usa productos reales del catálogo
 * cuando hay, y un ejemplo cuando no — la pantalla de ajustes tiene que
 * funcionar aunque Contífico esté caído.
 */
import { ensureCatalogReady, searchByText } from "../services/catalog.js";
import { normalizeContificoProduct, type CatalogItem } from "../domain/catalog.js";
import { brandProfilesForRender } from "../services/brandProfiles.js";
import { renderCompareImage, renderOptionsImage, renderQuoteImage, toRenderLine } from "./quoteImage.js";

export interface PreviewOptions {
  pieza: string;
  paleta?: string;
  fuente?: string;
  beneficios?: readonly string[];
}

/** Ejemplo de respaldo: una marca por fila, precios y stock verosímiles. */
const EJEMPLO: CatalogItem[] = [
  ["FK510-2055516", "205/55R16 91W AZENIS FK510", "FALKEN", 118.2, 6],
  ["KR203-2055516", "205/55R16 91V KOMET PLUS KR203", "KENDA", 74.6, 14],
  ["R380-2055516", "205/55R16 91V R380 WINRUN", "WINRUN", 54.9, 9],
]
  .map(([codigo, nombre, marca, pvp, stock]) =>
    normalizeContificoProduct(
      {
        id: String(codigo), codigo: String(codigo), nombre: String(nombre),
        marca_nombre: String(marca), estado: "A", tipo: "P",
        pvp1: Number(pvp), porcentaje_iva: 15, cantidad_stock: Number(stock),
      },
      "pvp1",
    ))
  .filter((item): item is CatalogItem => Boolean(item));

/** Hasta 3 productos de marcas distintas, para que la pieza se vea completa. */
async function muestra(): Promise<CatalogItem[]> {
  try {
    await ensureCatalogReady();
    const porMarca = new Map<string, CatalogItem>();
    for (const item of searchByText("R16", 40)) {
      const marca = item.brand.trim().toUpperCase();
      if (!porMarca.has(marca)) porMarca.set(marca, item);
      if (porMarca.size === 3) break;
    }
    if (porMarca.size >= 2) return [...porMarca.values()];
  } catch {
    // Catálogo caído: el ejemplo alcanza para ver colores y tipografía.
  }
  return EJEMPLO;
}

export async function renderPreviewPiece(options: PreviewOptions): Promise<Buffer> {
  const productos = await muestra();
  const tema = {
    paleta: options.paleta,
    fuente: options.fuente,
    brandProfiles: await brandProfilesForRender(),
  };
  const fecha = new Date().toLocaleDateString("es-EC", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Guayaquil",
  });

  if (options.pieza === "comparativa") {
    return renderCompareImage({
      dateLabel: fecha,
      sizeLabel: productos[0]?.sizeLabel ?? null,
      products: await Promise.all(productos.slice(0, 3).map((p) => toRenderLine(p))),
      ...tema,
    });
  }

  if (options.pieza === "opciones") {
    return renderOptionsImage({
      dateLabel: fecha,
      sizeLabel: productos[0]?.sizeLabel ?? null,
      products: await Promise.all(productos.map((p) => toRenderLine(p))),
      ...tema,
    });
  }

  // Cotización: 4 unidades del primer producto, con un descuento de ejemplo
  // para que se vea la franja dorada y la insignia de ahorro.
  const producto = productos[0];
  const cantidad = 4;
  const total = producto.minimumPriceWithTax * cantidad;
  return renderQuoteImage({
    number: "COT-EJEMPLO",
    dateLabel: fecha,
    lines: [await toRenderLine(producto, cantidad)],
    subtotal: total / (1 + producto.taxRate),
    iva: total - total / (1 + producto.taxRate),
    total,
    benefits: options.beneficios,
    ...tema,
  });
}
