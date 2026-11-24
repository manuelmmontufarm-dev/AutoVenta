/**
 * Catálogo compartido por el Hub y el bot.
 *
 * La fuente la decide `fuentes/` EN CADA sincronización: Contífico (como
 * siempre), el archivo subido en el panel (Mundillantas: Fénix sin API) o
 * Google Sheets como respaldo de instalaciones antiguas. El catálogo se
 * normaliza una vez y se consulta desde memoria; una sincronización fallida
 * nunca borra el último snapshot válido.
 */
import { config } from "../config.js";
import {
  buscarConEscalera,
  buscarPorAro,
  resolveCatalogCandidates,
  searchCatalog,
  type CatalogItem,
  type ResultadoEscalera,
} from "../domain/catalog.js";
import { cargarArosDelCatalogo } from "../domain/aroProducto.js";
import { ordenarPorCercania, type Direccion } from "../domain/equivalencia.js";
import { mencionaProducto } from "../domain/guardianNoVendeSolo.js";
import { formatTireSize, type TireSize } from "../domain/tireSize.js";
import { aplicarPreciosEspeciales, msHastaElProximoCambio } from "../domain/preciosEspeciales.js";
import { aplicarPromociones, msHastaElProximoCambioDePromociones, preciosBaseDe, type PrecioBase, type Promocion } from "../domain/promociones.js";
import { promocionesParaElCatalogo } from "./promociones.js";
import { fijarTemporadaDelPanel } from "../domain/promocionDeTemporada.js";
import { politica } from "../negocio/politica.js";
import { fuenteDeCatalogo, type IdFuente } from "./fuentes/index.js";
import {
  ensureInterbotPricesFresh,
  interbotDisponible,
  interbotPricesState,
} from "./interbotPrices.js";
import { asegurarPreciosDeFacturacion, descuentoDeSiempre, fijarDescuentoDeSiempre, precioDeHoy, precioDeVenta } from "./precioDeVenta.js";

export type { CatalogItem } from "../domain/catalog.js";

export interface SyncReport {
  ok: number;
  skipped: { row: number; reason: string }[];
  at: Date;
  source: IdFuente;
  archivo?: { nombre: string; subidoEn: string; aros: number };
}

let items: CatalogItem[] = [];
let lastReport: SyncReport | null = null;
let lastError: string | null = null;
let syncInFlight: Promise<SyncReport> | null = null;

/**
 * EL PRECIO DE CADA LLANTA DE DEPOT (nombre histórico: antes era solo el
 * Interbot). Desde el 24-nov-2026 la lista sale de Contífico —la empresa que
 * factura—, con el Interbot de respaldo para lo que falte o no tenga sentido,
 * y el precio de hoy es la lista menos el «Descuento de siempre» del panel.
 * Ver `services/precioDeVenta.ts`.
 *
 * Lo que ninguna fuente tiene se queda con la fórmula de divisores (acierta el
 * 27 %), con el precio de hoy también según el interruptor, y el log lo nombra.
 *
 * Solo Depot (quien tiene el snapshot del Interbot en `assets/<negocio>/`):
 * otro cliente no hereda sus precios aunque un código coincida (R-23).
 */
export function applyInterbotPrices(list: CatalogItem[], opciones: { conPromociones?: boolean } = {}): number {
  if (!interbotDisponible()) return 0;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  let applied = 0;
  let deContifico = 0;
  const sinPrecio: string[] = [];
  for (const item of list) {
    const pv = precioDeVenta(item.code, item.sourcePrice);
    if (!pv) {
      // Último recurso: la fórmula del catálogo, con el descuento del interruptor.
      item.minimumPriceWithTax = precioDeHoy(item.customerPriceWithTax);
      sinPrecio.push(item.code);
      continue;
    }
    // Precio hoy = lista − Descuento de siempre; si el Interbot trae una promo suya, la promo.
    const hoy = pv.tienePromo && pv.precioPromoConIva ? pv.precioPromoConIva : pv.pvpMinConIva;
    item.minimumPriceWithTax = hoy;
    // El tachado solo vale si de verdad es mayor; si no, sin tachado engañoso.
    item.customerPriceWithTax = pv.pvpFullConIva > hoy ? pv.pvpFullConIva : hoy;
    item.price = round2(item.customerPriceWithTax / (1 + item.taxRate));
    applied += 1;
    if (pv.fuente === "contifico") deContifico += 1;
  }
  const st = interbotPricesState();
  console.log(
    `💲 Precios: ${deContifico} de Contífico, ${applied - deContifico} del Interbot (${st.source}${st.at ? `, ${st.at.toISOString()}` : ""})`
      + ` de ${list.length} · Descuento de siempre ${descuentoDeSiempre()} %`
      + (sinPrecio.length ? ` · ⚠️ SIN PRECIO CONFIRMADO (queda la fórmula): ${sinPrecio.slice(0, 10).join(", ")}` : ""),
  );
  // Cuando se vuelve a poner precio a unas llantas fuera de la sincronización
  // (la pieza de opciones lo confirma en el momento), las promociones del
  // panel se montan otra vez encima: antes la pieza las perdía.
  if (opciones.conPromociones && promosDelCatalogo.length) {
    aplicarPromociones(list, promosDelCatalogo, new Date(), preciosBaseDe(list));
  }
  return applied;
}

let promosDelCatalogo: Promocion[] = [];

export async function syncCatalog(): Promise<SyncReport> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    try {
      const fuente = await fuenteDeCatalogo();
      if (!fuente) throw new Error("Catálogo no configurado");
      if (fuente.id === "contifico") {
        // Nunca lanza: si el Interbot no responde, quedan el último barrido
        // bueno o el snapshot de assets/, y el catálogo sigue sincronizando.
        await ensureInterbotPricesFresh();
      }
      const resultado = await fuente.sincronizar();
      // Las promociones se leen ANTES de poner precios: el «Descuento de
      // siempre» (−25 % de Depot) es parte del precio de hoy de cada llanta.
      const { promos, politicaSembrada, descuentoDeSiempre: descuento, temporada } = await promocionesParaElCatalogo();
      fijarDescuentoDeSiempre(descuento);
      // El Black Friday (promo de temporada) lo prende y le pone fechas el panel.
      fijarTemporadaDelPanel(politica.promocionDeTemporada, temporada);
      if (fuente.id === "contifico") {
        await asegurarPreciosDeFacturacion();
        applyInterbotPrices(resultado.items);
      }
      // La foto de precios ANTES de toda promoción: de aquí sale el Excel que
      // el negocio baja en la pestaña Promociones y la base de sus cuentas.
      const bases = preciosBaseDe(resultado.items);
      // Precios de promoción por código escritos en el código (Black Friday de
      // Competimotor, 20-nov-2026). Desde el 24-nov esa lista se siembra en la
      // tabla `promociones` y la maneja el negocio; acá solo se aplica directo
      // mientras no esté sembrada (o si la base no contesta). Cada
      // sincronización arma el catálogo de cero, así que vencida desaparece.
      if (politica.preciosEspeciales && !politicaSembrada) {
        const promo = aplicarPreciosEspeciales(resultado.items, politica.preciosEspeciales);
        if (promo.aplicadas || promo.omitidas.length) {
          console.log(`🖤 ${politica.preciosEspeciales.nombre}: ${promo.aplicadas} llantas con precio especial`
            + (promo.omitidas.length ? `, ${promo.omitidas.length} sin aplicar (${promo.omitidas.slice(0, 5).map((o) => `${o.codigo}: ${o.motivo}`).join("; ")})` : ""));
        }
      }
      // Las promociones que el negocio arma en el panel (pestaña Promociones).
      for (const informe of aplicarPromociones(resultado.items, promos, new Date(), bases)) {
        const firma = `${informe.promocionId}:${informe.aplicadas}:${informe.omitidas.length}`;
        if (firmasDePromociones.get(informe.promocionId) === firma) continue;
        firmasDePromociones.set(informe.promocionId, firma);
        console.log(`🏷️ Promoción «${informe.nombre}»: ${informe.aplicadas} llantas`
          + (informe.omitidas.length ? `, ${informe.omitidas.length} sin aplicar (${informe.omitidas.slice(0, 5).map((o) => `${o.codigo}: ${o.motivo}`).join("; ")})` : ""));
      }
      programarCambioDePrecios(promos, politicaSembrada);
      promosDelCatalogo = promos;
      preciosBase = bases;
      items = resultado.items;
      cargarArosDelCatalogo(resultado.aros);
      lastReport = resultado.report;
      lastError = null;
      return lastReport;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Error de sincronización";
      throw error;
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}

/**
 * EL PRECIO ESPECIAL SE APAGA EN EL INSTANTE JUSTO. La sincronización corre
 * cada 5 minutos; sin esto, una cotización a las 00:03 del 1-dic todavía
 * saldría con Black Friday. Un solo temporizador, para el próximo cambio.
 */
let cambioProgramado: ReturnType<typeof setTimeout> | null = null;
function programarCambioDePrecios(promos: readonly Promocion[], politicaSembrada: boolean): void {
  // Se reprograma en cada sincronización: las promociones del panel cambian
  // de fechas sin reiniciar el proceso.
  if (cambioProgramado) clearTimeout(cambioProgramado);
  cambioProgramado = null;
  const candidatos = [
    politicaSembrada ? null : msHastaElProximoCambio(politica.preciosEspeciales),
    msHastaElProximoCambioDePromociones(promos),
  ].filter((ms): ms is number => ms !== null);
  if (!candidatos.length) return;
  const ms = Math.min(...candidatos);
  // setTimeout no acepta más de ~24,8 días: si falta más, lo reprograma la
  // sincronización de cada 5 minutos cuando ya quepa.
  if (ms > 2_000_000_000) return;
  cambioProgramado = setTimeout(() => {
    cambioProgramado = null;
    console.log("🏷️ Cambio de vigencia de una promoción: se vuelve a armar el catálogo.");
    void syncCatalog().catch(() => undefined);
  }, ms);
  cambioProgramado.unref?.();
}

/** Lo que cada promoción aplicó la última vez, para no repetir el log cada 5 minutos. */
const firmasDePromociones = new Map<number, string>();
/** Los precios de hoy antes de toda promoción (ver `syncCatalog`). */
let preciosBase: ReadonlyMap<string, PrecioBase> = new Map();

/** Las llantas de hoy y sus precios sin promociones: lo que necesita la pestaña Promociones. */
export function catalogoParaPromociones(): { items: readonly CatalogItem[]; bases: ReadonlyMap<string, PrecioBase> } {
  return { items, bases: preciosBase };
}

export async function ensureCatalogReady(): Promise<SyncReport> {
  if (items.length > 0 && lastReport) return lastReport;
  return syncCatalog();
}

export function startCatalogSync(): void {
  const intervalMs =
    config.contifico?.syncIntervalMs ?? config.catalog?.syncIntervalMs ?? 5 * 60_000;
  if (!config.contifico && !config.catalog) {
    // Puede haber (o llegar) un catálogo subido en el panel: no se sale
    // temprano. Si tampoco hay archivo, cada intento lo dice en el log.
    console.warn("⚠️ Sin Contífico ni Sheets: el catálogo saldrá del archivo subido en el panel.");
  }
  const run = () =>
    syncCatalog()
      .then((r) => {
        console.log(`📋 Catálogo ${r.source}: ${r.ok} llantas (${r.skipped.length} omitidas)`);
      })
      .catch((err) =>
        console.error(
          "❌ Error sincronizando catálogo:",
          err instanceof Error ? err.message : "error desconocido",
        ),
      );
  run();
  setInterval(run, intervalMs).unref();
}

/** Búsqueda exacta por medida (con o sin stock, el agente decide qué decir). */
export function searchBySize(size: TireSize): CatalogItem[] {
  return items.filter(
    (item) =>
      item.size !== null &&
      item.size.width === size.width &&
      item.size.rim === size.rim &&
      (size.aspect === null || item.size.aspect === size.aspect),
  );
}

/** Búsqueda estilo Interbot: medida, código, marca, diseño o combinación. */
export function searchByText(query: string, limit = 40): CatalogItem[] {
  return searchCatalog(items, query, limit);
}

/**
 * TODO el aro, sin tope: la única forma de no esconder stock.
 *
 * `searchByText("R17", 60)` parecía servir para esto y no servía — puntúa,
 * ordena y corta, así que en los aros grandes dejaba fuera decenas de llantas,
 * y las medidas en pulgadas no entraban nunca. Ver `domain/catalog.ts`.
 */
export function searchByRim(aro: number): CatalogItem[] {
  return buscarPorAro(items, aro);
}

/**
 * Productos reales que aparecen nombrados en un texto.
 *
 * Nació por las correcciones de las convs 11986 y 11972 (27-ago-2026): el
 * Ángel Guardián leyó el catálogo y agregó modelos que el borrador no traía.
 * El candado posterior necesita comparar contra el catálogo completo —no solo
 * contra la medida pedida— porque inventar una llanta de otra medida también
 * tiene que frenarse.
 */
export function productosDelCatalogoMencionados(texto: string): CatalogItem[] {
  return items.filter((item) => mencionaProducto(texto, item));
}

/** Búsqueda en escalera sobre el catálogo cargado (ver domain/catalog.ts). */
export function searchWithLadder(query: string, limit = 8): ResultadoEscalera {
  return buscarConEscalera(items, query, limit);
}

/**
 * Alternativas para cuando no hay la medida exacta: las que DE VERDAD le montan.
 *
 * Era «mismo aro y ancho ±10 mm», y el ancho solo no alcanza: una 225/40R18
 * está a 10 mm de una 235/45R18 y tiene 4,8 % menos de diámetro exterior —
 * otra llanta. Conv 18100 (9-sep): el cliente pidió 235/45R18 y en la misma
 * imagen recibió una 225/40R18 y una 225/55R18, una 5 % más baja y la otra 5 %
 * más alta, las dos presentadas como «equivalentes de su aro».
 *
 * Ahora el corte es el del taller: el diámetro dentro del 3 % (ver
 * `domain/equivalencia.ts`), y salen ordenadas de la más parecida a la menos,
 * no de la más barata a la más cara.
 */
export function searchAlternatives(size: TireSize, direccion: Direccion | null = null): CatalogItem[] {
  const pedida = formatTireSize(size);
  const mismoAro = items.filter(
    (item) =>
      item.size !== null &&
      item.size.rim === size.rim &&
      !(item.size.width === size.width && item.size.aspect === size.aspect) &&
      item.stock > 0,
  );
  // Con dirección («más ancha», conv 22975) solo quedan las que van para ese lado.
  return ordenarPorCercania(mismoAro, pedida, direccion);
}

/** ¿Alguna llanta del catálogo trae precio con tarjeta y en efectivo? (Depot: nunca.) */
export function catalogoConPreciosPorPago(): boolean {
  return items.some((item) => Boolean(item.preciosPorPago));
}

export function findByCode(code: string): CatalogItem | undefined {
  return items.find((item) => item.code.toLowerCase() === code.toLowerCase());
}

/**
 * Resuelve la referencia que el agente conserva de una opción. Meta/LLM puede
 * devolver el código Contífico, el id o el diseño visible (p. ej. "KR203").
 *
 * Devuelve la LISTA de candidatos, no uno solo: ver `resolveCatalogCandidates`.
 * Quien llama distingue «no existe» (vacío) de «¿cuál de estas?» (varios), que
 * son dos respuestas muy distintas para el cliente.
 */
export function catalogCandidates(reference: string, sizeLabel?: string | null): CatalogItem[] {
  return resolveCatalogCandidates(items, reference, sizeLabel);
}

/** La referencia resuelta a UNA llanta, o undefined si no es inequívoca. */
export function resolveCatalogReference(
  reference: string,
  sizeLabel?: string | null,
): CatalogItem | undefined {
  const candidatos = catalogCandidates(reference, sizeLabel);
  return candidatos.length === 1 ? candidatos[0] : undefined;
}

export function findById(id: string): CatalogItem | undefined {
  return items.find((item) => item.id === id);
}

export function catalogStatus(): {
  items: number;
  lastSync: Date | null;
  source: IdFuente | null;
  error: string | null;
  /** Filas que la última sincronización dejó fuera, con su motivo (R-22). */
  descartadas: { row: number; reason: string }[];
  /** Con la fuente `archivo`: nombre, fecha de subida y aros del último subido. */
  archivo: { nombre: string; subidoEn: string; aros: number } | null;
} {
  return {
    items: items.length,
    lastSync: lastReport?.at ?? null,
    source: lastReport?.source ?? null,
    error: lastError,
    descartadas: lastReport?.skipped ?? [],
    archivo: lastReport?.archivo ?? null,
  };
}

export function catalogInventoryMetrics() {
  const available = items.filter((item) => item.availability === "available").length;
  const check = items.filter((item) => item.availability === "check").length;
  const out = items.filter((item) => item.availability === "out").length;
  const withImage = items.filter((item) => Boolean(item.imageUrl)).length;
  return {
    total: items.length,
    available,
    check,
    out,
    withImage,
    imageCoverage: items.length ? Math.round((withImage / items.length) * 100) : 0,
    brands: new Set(items.map((item) => item.brand).filter(Boolean)).size,
    source: lastReport?.source ?? null,
    lastSync: lastReport?.at?.toISOString() ?? null,
  };
}

export function catalogMediaReport() {
  const designs = new Map<
    string,
    {
      brand: string;
      design: string;
      products: number;
      activeProducts: number;
      imageUrl: string | null;
      imageSource: string | null;
    }
  >();

  for (const item of items) {
    const key = `${item.brand.trim().toLowerCase()}:${item.design.trim().toLowerCase()}`;
    const current = designs.get(key);
    if (current) {
      current.products += 1;
      if (item.availability !== "out") current.activeProducts += 1;
      current.imageUrl ||= item.imageUrl;
      current.imageSource ||= item.imageSource;
      continue;
    }
    designs.set(key, {
      brand: item.brand,
      design: item.design,
      products: 1,
      activeProducts: item.availability === "out" ? 0 : 1,
      imageUrl: item.imageUrl,
      imageSource: item.imageSource,
    });
  }

  const rows = [...designs.values()].sort((a, b) =>
    `${a.brand} ${a.design}`.localeCompare(`${b.brand} ${b.design}`, "es"),
  );
  const active = rows.filter((row) => row.activeProducts > 0);
  const missing = active.filter((row) => !row.imageUrl);
  return {
    designs: rows.length,
    activeDesigns: active.length,
    coveredActiveDesigns: active.length - missing.length,
    coverage: active.length
      ? Math.round(((active.length - missing.length) / active.length) * 100)
      : 0,
    missing,
    items: rows,
  };
}
