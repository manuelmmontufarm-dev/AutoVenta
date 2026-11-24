/**
 * Vista previa de las piezas para la pantalla Promociones del panel.
 *
 * Renderiza con los valores que se están probando, no con los guardados: el
 * negocio ve el cambio antes de aplicarlo. Usa productos reales del catálogo
 * cuando hay, y un ejemplo cuando no — la pantalla de ajustes tiene que
 * funcionar aunque Contífico esté caído.
 */
import type { ConfigDeTema } from "../domain/temaDePieza.js";
import { ensureCatalogReady, searchByText } from "../services/catalog.js";
import { normalizeContificoProduct, type CatalogItem } from "../domain/catalog.js";
import { brandProfilesForRender } from "../services/brandProfiles.js";
import { segundaLlantaDe } from "../domain/promocionDeTemporada.js";
import { politica } from "../negocio/politica.js";
import { anchoDeVistaPrevia, renderCompareImage, renderOptionsImage, renderQuoteImage, toRenderLine } from "./quoteImage.js";

export interface PreviewOptions {
  pieza: string;
  paleta?: string;
  fuente?: string;
  /** «clasica» o «diaNoche»; sin valor, la clásica. */
  plantilla?: string;
  /** Solo para «diaNoche»: auto, dia o noche. */
  modo?: string;
  /** «porcentaje» o «3x4»: cómo se nombra la rebaja (26-oct). */
  promocion?: string;
  beneficios?: readonly string[];
  /** La marca comercial de la muestra (id de identidad); sin ella, la de la presentación. */
  identidad?: string;
  /** El tema que se está eligiendo en Ajustes (cinta de Navidad, personalizada…). */
  tema?: Partial<ConfigDeTema> | null;
  /**
   * A cuántos píxeles de ancho se pasa la imagen. El panel pide el ancho de su
   * recuadro (×2 en pantallas retina): la vista previa llega en una fracción
   * del tiempo. Sin valor, el tamaño real de la pieza.
   */
  ancho?: number;
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

/**
 * Hasta 3 productos de marcas distintas, para que la pieza se vea completa.
 *
 * Si el negocio tiene promo de temporada, va primero una marca que entra en
 * ella —esté prendida o no—: la cotización de muestra es la del primer
 * producto, y quien prende o apaga el Black Friday en el panel tiene que VER el
 * cambio sobre la MISMA llanta (antes salía la primera marca del catálogo, que
 * podía no llevar la promo, y la vista previa no se movía).
 */
async function muestra(): Promise<CatalogItem[]> {
  try {
    await ensureCatalogReady();
    const porMarca = new Map<string, CatalogItem>();
    for (const item of searchByText("R16", 40)) {
      const marca = item.brand.trim().toUpperCase();
      if (!porMarca.has(marca)) porMarca.set(marca, item);
    }
    const deTemporada = politica.promocionDeTemporada?.segundaLlanta?.marcas ?? [];
    const conPromo = (item: CatalogItem) => deTemporada.includes(item.brand.trim().toUpperCase());
    const ordenados = [...porMarca.values()].sort((a, b) => Number(conPromo(b)) - Number(conPromo(a)));
    if (ordenados.length >= 2) return ordenados.slice(0, 3);
  } catch {
    // Catálogo caído: el ejemplo alcanza para ver colores y tipografía.
  }
  return EJEMPLO;
}

/**
 * El descuento de la llanta que sale en la cotización de ejemplo. Ajustes lo
 * usa para avisar que, con 3x4, esa llanta saldría como porcentaje (R-07).
 */
export async function descuentoDeLaMuestra(): Promise<number | null> {
  const producto = (await muestra())[0];
  if (!producto || producto.customerPriceWithTax <= producto.minimumPriceWithTax) return null;
  return Math.round((1 - producto.minimumPriceWithTax / producto.customerPriceWithTax) * 100);
}

export async function renderPreviewPiece(options: PreviewOptions): Promise<Buffer> {
  const ancho = Number(options.ancho);
  if (!Number.isFinite(ancho) || ancho <= 0) return dibujar(options);
  return anchoDeVistaPrevia.run(Math.round(Math.min(2400, Math.max(320, ancho))), () => dibujar(options));
}

async function dibujar(options: PreviewOptions): Promise<Buffer> {
  const productos = await muestra();
  const tema = {
    paleta: options.paleta,
    fuente: options.fuente,
    plantilla: options.plantilla,
    modo: options.modo,
    promocion: { modo: options.promocion ?? null },
    brandProfiles: await brandProfilesForRender(),
    identidad: options.identidad,
    tema: options.tema ?? null,
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
      // Como en el chat: juego de 4 y la del medio como recomendada.
      cantidad: 4,
      codigoRecomendado: productos.length >= 3 ? productos[1].code : null,
      ...tema,
    });
  }

  // Cotización: 4 unidades del primer producto, con un descuento de ejemplo
  // para que se vea la franja dorada y la insignia de ahorro.
  // Con la promo de temporada vigente y una marca que entra, la muestra sale
  // como la cotización real: con la 2.ª llanta y su total.
  const producto = productos[0];
  const cantidad = 4;
  const linea = await toRenderLine(producto, cantidad);
  linea.segundaLlanta = segundaLlantaDe(politica.promocionDeTemporada, producto.brand, cantidad,
    { hoyConIva: producto.minimumPriceWithTax, listaConIva: producto.customerPriceWithTax });
  // Como la cotización real: con Black Friday la línea va a precio de lista.
  if (linea.segundaLlanta) linea.unitConIva = linea.segundaLlanta.precioNormalConIva;
  const total = linea.segundaLlanta?.totalConIva ?? producto.minimumPriceWithTax * cantidad;
  return renderQuoteImage({
    number: "COT-EJEMPLO",
    dateLabel: fecha,
    lines: [linea],
    subtotal: total / (1 + producto.taxRate),
    iva: total - total / (1 + producto.taxRate),
    total,
    benefits: options.beneficios,
    ...tema,
  });
}
