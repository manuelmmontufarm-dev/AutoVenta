/**
 * EL PRECIO DE VENTA DE DEPOT, DE UNA SOLA FUENTE (24-nov-2026).
 *
 * Por qué existe. Joaquín: «dos clientes vienen con la proforma a menos
 * precio». La KENDA KR628 265/70R17 salía a $246,42 c/u en la proforma y a
 * $219,70 + IVA = $252,66 en la factura: el Interbot no tenía el código y el
 * bot caía a una fórmula sobre el costo. Al revisar resultó que:
 *   - el precio con que Depot factura está en el pvp1 de la OTRA empresa de
 *     Contífico (la de `CONTIFICO_FACTURAS_API_KEY`; la del catálogo trae el
 *     costo);
 *   - el Interbot es una copia de esos precios que se refresca una vez por
 *     semana (coincide en 397 de 402 llantas; las 5 que no, son atraso);
 *   - el −25 % que el bot daba siempre no estaba en Contífico: venía del
 *     «precio mínimo» del Interbot, escondido en el precio.
 *
 * Desde ahora, para cada llanta:
 *   1. el precio de LISTA sale de Contífico (empresa que factura), si existe y
 *      tiene sentido contra el costo (entre 1,2 y 3,5 veces; en el catálogo
 *      real va de 1,41 a 2,41);
 *   2. si no, del Interbot (lo que tenga el último barrido);
 *   3. si tampoco, queda la fórmula vieja del catálogo y el log lo dice.
 * El precio de HOY es la lista menos el «Descuento de siempre», que es una
 * promoción del panel con interruptor (`descuentoDeSiempre`). Las promociones
 * del panel se cuentan sobre ese precio de hoy, como antes.
 *
 * Todas las puertas leen de acá: el catálogo (`applyInterbotPrices`), la pieza
 * de opciones y `generar_cotizacion` (que confirman el precio en el momento) y
 * el seguimiento que no repite precios viejos. Solo Depot: sin Interbot
 * (Competimotor) no hace nada.
 */
import { config } from "../config.js";
import { politica } from "../negocio/politica.js";
import {
  getInterbotPrice,
  interbotDisponible,
  refreshPriceForSize,
  type InterbotPrice,
} from "./interbotPrices.js";

const TTL_MS = 60 * 60_000;
const REINTENTO_TRAS_FALLO_MS = 5 * 60_000;
const TIMEOUT_MS = 30_000;
/** Precio de lista ÷ costo (sin IVA) que se acepta como «tiene sentido». */
export const MARGEN_MINIMO = 1.2;
export const MARGEN_MAXIMO = 3.5;

export interface PrecioDeVenta extends InterbotPrice {
  /** De dónde salió el precio de lista. */
  fuente: "contifico" | "interbot";
}

/** pvp1 (sin IVA) e IVA (%) de la empresa que factura, por código. */
let lista = new Map<string, { pvp1: number; iva: number }>();
let leidaEn = 0;
let proximoIntento = 0;
let enCurso: Promise<void> | null = null;
let descuento = politica.descuentoDeSiempre?.porcentaje ?? 0;

const clave = (codigo: string) => codigo.trim().toLowerCase();

function round2(n: number): number {
  // +1e-9: 219.70 × 1.15 = 252.65499… tiene que dar 252.66, como la factura.
  return Math.round(n * 100 + 1e-9) / 100;
}

/** ¿Este despliegue lee precios de la empresa que factura? (Depot con su llave). */
export function preciosDeFacturacionActivos(): boolean {
  return interbotDisponible() && Boolean(config.contifico?.facturasApiKey);
}

/** El % del «Descuento de siempre» que rige hoy (lo fija cada sincronización del catálogo). */
export function fijarDescuentoDeSiempre(porcentaje: number): void {
  descuento = Number.isFinite(porcentaje) && porcentaje > 0 && porcentaje < 100 ? porcentaje : 0;
}

export function descuentoDeSiempre(): number {
  return descuento;
}

/** El precio de hoy a partir del de lista: lista − Descuento de siempre. */
export function precioDeHoy(listaConIva: number): number {
  return round2(listaConIva * (1 - descuento / 100));
}

async function leerListaCompleta(): Promise<Map<string, { pvp1: number; iva: number }>> {
  const apiKey = config.contifico!.facturasApiKey!;
  const base = config.contifico!.baseUrl;
  const nueva = new Map<string, { pvp1: number; iva: number }>();
  for (let pagina = 1; pagina <= 100; pagina += 1) {
    const url = new URL(`${base}/producto/`);
    url.searchParams.set("page", String(pagina));
    url.searchParams.set("estado", "A");
    const res = await fetch(url, {
      headers: { Authorization: apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en la página ${pagina}`);
    const json = (await res.json()) as unknown;
    const filas = (Array.isArray(json)
      ? json
      : ((json as { results?: unknown[] } | null)?.results ?? [])) as Array<Record<string, unknown>>;
    for (const f of filas) {
      const codigo = String(f.codigo ?? "").trim();
      const pvp1 = Number(f.pvp1);
      if (!codigo || !(pvp1 > 0) || String(f.estado ?? "A").toUpperCase() === "I") continue;
      const iva = Number(f.porcentaje_iva);
      nueva.set(clave(codigo), { pvp1, iva: Number.isFinite(iva) ? iva : 15 });
    }
    const hayMas = Array.isArray(json) ? filas.length >= 100 : Boolean((json as { next?: unknown }).next);
    if (!filas.length || !hayMas) break;
  }
  if (!nueva.size) throw new Error("la empresa que factura devolvió 0 productos");
  return nueva;
}

/**
 * Lee la lista de la empresa que factura si tiene más de una hora. Nunca lanza:
 * si Contífico no contesta queda la última lista leída (o el Interbot, si nunca
 * se leyó). Se espera solo la primera vez; después refresca en segundo plano.
 */
export async function asegurarPreciosDeFacturacion(): Promise<void> {
  if (!preciosDeFacturacionActivos()) return;
  const ahora = Date.now();
  if (ahora - leidaEn < TTL_MS || ahora < proximoIntento) return;
  if (!enCurso) {
    enCurso = leerListaCompleta()
      .then((nueva) => {
        const habia = lista.size;
        const cambios = [...nueva].filter(([k, v]) => lista.get(k)?.pvp1 !== v.pvp1).length;
        lista = nueva;
        leidaEn = Date.now();
        console.log(`💲 Precios de Contífico (empresa que factura): ${nueva.size} productos${habia ? `, ${cambios} nuevos o cambiados` : ""}`);
      })
      .catch((error) => {
        proximoIntento = Date.now() + REINTENTO_TRAS_FALLO_MS;
        console.warn(
          `⚠️ No se pudieron leer los precios de Contífico (empresa que factura): ${error instanceof Error ? error.message : error}`
            + (lista.size ? "; quedan los de la última lectura" : "; quedan los del Interbot"),
        );
      })
      .finally(() => {
        enCurso = null;
      });
  }
  if (!leidaEn) await enCurso;
}

/**
 * El precio que se cotiza de una llanta: lista (Contífico → Interbot) y hoy
 * (lista − Descuento de siempre). Null = ninguna fuente lo tiene y queda la
 * fórmula del catálogo.
 *
 * `costoSinIva` es el pvp1 del Contífico del catálogo (el costo): con él se
 * descarta un precio de Contífico que no tiene sentido (un tipeo, un cero).
 */
export function precioDeVenta(codigo: string, costoSinIva?: number | null): PrecioDeVenta | null {
  if (!interbotDisponible()) return null;
  const ib = getInterbotPrice(codigo);
  const pos = lista.get(clave(codigo));
  const costo = typeof costoSinIva === "number" && costoSinIva > 0 ? costoSinIva : null;
  const tieneSentido = pos
    && (costo === null || (pos.pvp1 >= costo * MARGEN_MINIMO && pos.pvp1 <= costo * MARGEN_MAXIMO));
  if (pos && tieneSentido) {
    const full = round2(pos.pvp1 * (1 + pos.iva / 100));
    return {
      fuente: "contifico",
      marca: ib?.marca ?? "",
      medida: ib?.medida ?? "",
      costoConIva: costo !== null ? round2(costo * (1 + pos.iva / 100)) : (ib?.costoConIva ?? 0),
      pvpFullConIva: full,
      pvpMinConIva: precioDeHoy(full),
      precioPromoConIva: null,
      tienePromo: false,
    };
  }
  if (!ib) return null;
  // El Interbot trae lista y «mínimo» (= lista × 0,75); el −25 % ya no se
  // toma de ahí sino del interruptor, para que apagarlo valga en todas.
  // Si su lista viene mal cargada (menor que el mínimo), se rehace como
  // mínimo ÷ 0,75, que es como el Interbot arma todas las demás: el precio de
  // hoy queda donde estaba.
  const full = ib.pvpFullConIva >= ib.pvpMinConIva ? ib.pvpFullConIva : round2(ib.pvpMinConIva / 0.75);
  return {
    ...ib,
    fuente: "interbot",
    pvpFullConIva: full,
    pvpMinConIva: precioDeHoy(full),
  };
}

/**
 * Confirma el precio de una medida justo antes de mostrarlo o firmarlo. Con la
 * empresa que factura, basta con que su lista tenga menos de una hora; el
 * Interbot se sigue preguntando por la medida para que el respaldo esté al día.
 */
export async function confirmarPrecioDeMedida(medida: string): Promise<void> {
  await Promise.all([asegurarPreciosDeFacturacion(), refreshPriceForSize(medida)]);
}

/** Solo para pruebas. */
export function __fijarListaDeFacturacion(filas: Record<string, { pvp1: number; iva?: number }> | null): void {
  lista = new Map(Object.entries(filas ?? {}).map(([k, v]) => [clave(k), { pvp1: v.pvp1, iva: v.iva ?? 15 }]));
  leidaEn = filas ? Date.now() : 0;
  proximoIntento = 0;
}
