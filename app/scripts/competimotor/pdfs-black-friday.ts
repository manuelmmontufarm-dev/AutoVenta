/**
 * UN PDF DE COTIZACIÓN POR CADA LLANTA DE BLACK FRIDAY (Competimotor, 20-nov-2026).
 *
 *   NEGOCIO=mundillantas OPENAI_API_KEY=x DATABASE_URL=<base de Mundillantas, solo lectura> \
 *     npx tsx scripts/competimotor/pdfs-black-friday.ts <INV_NOV.XLS> "<carpeta de salida>"
 *
 * El mismo camino que `generar_cotizacion` cuando la foto sale: el catálogo
 * armado como `syncCatalog` (lector del panel + precios especiales vigentes),
 * `toRenderLine` → `renderQuoteImage` (plantilla «día y noche» de Ajustes, en
 * modo día para que se imprima bien) → `pngToQuotePdf`. Juego de 4 llantas.
 * La base solo se LEE (beneficios y perfiles de marca, como la pieza real).
 * Nombre: «<medida> <marca modelo>.pdf», con «/» cambiada por «-».
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { filasDelArchivo, normalizarCatalogoSubido, MAPEO_CATALOGO_DEFECTO } from "../../src/services/fuentes/archivo.js";
import { normalizarFilaDeCatalogo } from "../../src/services/fuentes/sheets.js";
import { aplicarPreciosEspeciales } from "../../src/domain/preciosEspeciales.js";
import { renderQuoteImage, toRenderLine } from "../../src/render/quoteImage.js";
import { buildQuote, pngToQuotePdf } from "../../src/services/quotePdf.js";
import { applicableBenefitTexts } from "../../src/services/benefits.js";
import { brandProfilesForRender } from "../../src/services/brandProfiles.js";
import { business } from "../../src/config.js";
import { politica } from "../../src/negocio/politica.js";
import { negocio } from "../../src/negocio/index.js";
import { sql } from "../../src/db/client.js";
import type { CatalogItem } from "../../src/domain/catalog.js";

const [ruta, salida] = process.argv.slice(2);
if (!ruta || !salida) {
  console.error("Uso: pdfs-black-friday.ts <inventario.xls> <carpeta>");
  process.exit(1);
}
const columnas = Object.values(MAPEO_CATALOGO_DEFECTO.columnas).filter((c): c is string => typeof c === "string");
const crudas = await filasDelArchivo(ruta, readFileSync(ruta), columnas);
const subido = normalizarCatalogoSubido(path.basename(ruta), crudas, MAPEO_CATALOGO_DEFECTO);
const items: CatalogItem[] = [];
for (const f of subido.filas) {
  const { item } = normalizarFilaDeCatalogo(f.cruda, "archivo", f.precios, politica.precioDeCotizacion);
  if (item) items.push(item);
}
const ahora = new Date();
const promo = aplicarPreciosEspeciales(items, politica.preciosEspeciales, ahora);
if (!promo.aplicadas) throw new Error("Black Friday no está vigente en este instante: no hay nada que dibujar");
const listaPorCodigo = new Map((politica.preciosEspeciales?.llantas ?? []).map((l) => [l.codigo, l]));
const brandProfiles = await brandProfilesForRender();
const fecha = ahora.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Guayaquil" });
mkdirSync(salida, { recursive: true });

const hechos: string[] = [];
const cantidad = 4;
for (const product of items.filter((p) => p.promocionDePrecio)) {
  const hoyConIva = product.minimumPriceWithTax;
  const quote = buildQuote([{
    code: product.code, description: `Llanta ${product.brand} ${product.design} ${product.sizeLabel}`, quantity: cantidad,
    unitPrice: hoyConIva / (1 + business.taxRate), listPriceWithTax: product.customerPriceWithTax, salePriceWithTax: hoyConIva,
  }], "", "");
  const png = await renderQuoteImage({
    number: "COTIZACIÓN",
    dateLabel: fecha,
    identidad: negocio.identidadPorDefecto,
    plantilla: "diaNoche",
    modo: "dia",
    paleta: "rojo",
    fuente: "archivo",
    promocion: { modo: "porcentaje" },
    brandProfiles,
    benefits: await applicableBenefitTexts({ brands: [product.brand], quantity: cantidad }),
    lines: [await toRenderLine(product, cantidad)],
    subtotal: quote.subtotal,
    iva: quote.tax,
    total: quote.total,
  });
  const lista = listaPorCodigo.get(product.code);
  const nombre = `${product.sizeLabel} ${lista?.lista ?? `${product.brand} ${product.design}`}`.replace(/[\\/]/g, "-").replace(/\s+/g, " ").trim();
  writeFileSync(path.join(salida, `${nombre}.pdf`), await pngToQuotePdf(png));
  hechos.push(`${nombre}.pdf\t${product.code}\tP2 $${product.customerPriceWithTax.toFixed(2)}\tBF $${hoyConIva.toFixed(2)}\t4 = $${quote.total.toFixed(2)}`);
}
writeFileSync(path.join(salida, "_indice.tsv"), ["archivo\tcódigo\tprecio real\tBlack Friday\tjuego de 4", ...hechos].join("\n") + "\n");
console.log(`📄 ${hechos.length} PDFs en ${salida}`);
await sql.end({ timeout: 2 }).catch(() => undefined);
process.exit(0);
