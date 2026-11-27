/**
 * ¿EL BOT COTIZA EL P2? — la cuenta que firma la cotización, llanta por llanta.
 *
 *   NEGOCIO=mundillantas OPENAI_API_KEY=x DATABASE_URL=postgres://localhost/x \
 *     npx tsx scripts/competimotor/verificar-precios.ts <INV_NOV.XLS> [ISO del instante] > precios-bot.json
 *
 * Lee el Excel con el MISMO lector del panel, arma el catálogo como
 * `syncCatalog` (lector + precios especiales en ese instante) y, para cada
 * llanta, hace lo mismo que `generar_cotizacion` (tools.ts): el precio de hoy,
 * el tachado, `buildQuote` con 4 llantas y el bloque de precios por pago con
 * la pregunta «en efectivo cuánto?». Imprime JSON; la comparación contra el
 * Excel la hace `verificar-precios.py`, que lee el archivo por su cuenta.
 */
import { readFileSync } from "node:fs";
import { filasDelArchivo, normalizarCatalogoSubido, MAPEO_CATALOGO_DEFECTO } from "../../src/services/fuentes/archivo.js";
import { normalizarFilaDeCatalogo } from "../../src/services/fuentes/sheets.js";
import { aplicarPreciosEspeciales } from "../../src/domain/preciosEspeciales.js";
import { efectivoDeLaLlanta, mensajeDePreciosPorPago, mensajeDeUnPago, type LineaPorPago } from "../../src/domain/preciosPorPago.js";
import { buildQuote } from "../../src/services/quotePdf.js";
import { business } from "../../src/config.js";
import { politica } from "../../src/negocio/politica.js";
import type { CatalogItem } from "../../src/domain/catalog.js";

const [ruta, instante] = process.argv.slice(2);
const ahora = instante ? new Date(instante) : new Date();
const columnas = Object.values(MAPEO_CATALOGO_DEFECTO.columnas).filter((c): c is string => typeof c === "string");
const crudas = await filasDelArchivo(ruta, readFileSync(ruta), columnas);
const subido = normalizarCatalogoSubido(ruta.split("/").pop()!, crudas, MAPEO_CATALOGO_DEFECTO, ahora);
const items: CatalogItem[] = [];
const descartadas: Array<{ codigo: string; motivo: string }> = [];
for (const f of subido.filas) {
  const { item, motivo } = normalizarFilaDeCatalogo(f.cruda, "archivo", f.precios, politica.precioDeCotizacion);
  if (item) items.push(item);
  else descartadas.push({ codigo: f.cruda.codigo, motivo: motivo ?? "?" });
}
for (const d of subido.descartadas) descartadas.push({ codigo: `fila ${d.fila}`, motivo: d.motivo });
const promo = aplicarPreciosEspeciales(items, politica.preciosEspeciales, ahora);

const salida = items.map((p) => {
  const cantidad = 4;
  // generar_cotizacion (tools.ts): sin Interbot, el de hoy y el tachado del catálogo.
  const hoyConIva = p.minimumPriceWithTax;
  const antesConIva = p.customerPriceWithTax;
  const quote = buildQuote([{
    code: p.code, description: p.name, quantity: cantidad,
    unitPrice: hoyConIva / (1 + business.taxRate),
    listPriceWithTax: antesConIva > hoyConIva ? antesConIva : hoyConIva, salePriceWithTax: hoyConIva,
  }], "Prueba", "593900000101");
  // services/preciosPorPago.ts, rama «cotiza con tarjeta».
  const tarjeta = p.preciosPorPago ? Math.min(p.preciosPorPago.tarjetaConIva, p.minimumPriceWithTax) : null;
  const linea: LineaPorPago = {
    nombre: `${p.brand} ${p.design} ${p.sizeLabel}`, cantidad, normal: null, tarjeta,
    efectivo: tarjeta !== null && p.preciosPorPago ? Math.min(p.preciosPorPago.efectivoConIva, tarjeta) : null,
    promocion: p.promocionDePrecio ? `${p.promocionDePrecio.nombre} ${p.promocionDePrecio.vigenciaCorta}` : null,
  };
  return {
    codigo: p.code,
    nombre: p.name,
    medida: p.sizeLabel,
    marca: p.brand,
    stock: p.stock,
    cotizaPorLlanta: hoyConIva,
    tachadoPorLlanta: antesConIva > hoyConIva ? antesConIva : null,
    totalDe4: quote.total,
    cuota6De4: Math.round((quote.total / 6) * 100) / 100,
    promocion: p.promocionDePrecio?.nombre ?? null,
    efectivoPorLlanta: linea.efectivo,
    // Sprint 2: el efectivo que imprime la LISTA de opciones (`efectivoDeLaLlanta`) tiene que ser este mismo.
    efectivoEnLaLista: efectivoDeLaLlanta(p),
    textoPagos: mensajeDePreciosPorPago([linea]),
    textoEfectivo: mensajeDeUnPago([linea], "efectivo"),
  };
});
// Sprint 2: la lista de opciones y el bloque de precios por pago dicen el mismo efectivo, al centavo.
const distintas = salida.filter((x) => politica.ventaConDosPrecios && x.efectivoEnLaLista !== x.efectivoPorLlanta);
console.error(`Lista con dos precios: ${salida.length - distintas.length}/${salida.length} llantas con el mismo efectivo que el bloque de precios.`);
for (const x of distintas.slice(0, 10)) console.error(`  ✗ ${x.codigo}: lista ${x.efectivoEnLaLista} · bloque ${x.efectivoPorLlanta}`);
console.log(JSON.stringify({ instante: ahora.toISOString(), aplicadasBlackFriday: promo.aplicadas, omitidasBlackFriday: promo.omitidas, descartadas, items: salida }, null, 1));
process.exit(0);
