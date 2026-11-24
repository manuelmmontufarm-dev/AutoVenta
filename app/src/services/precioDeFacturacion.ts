/**
 * PRECIO DEL POS PARA LAS LLANTAS QUE EL INTERBOT NO CONOCE (24-nov-2026).
 *
 * Por qué existe: Joaquín reclamó que dos clientes llegaron con la proforma
 * más barata que la factura. La KENDA KR628 265/70R17 (K557B738) salía en la
 * cotización a $246,42 c/u y en el sistema de facturación a $219,70 + IVA =
 * $252,66. El Interbot no tiene ese código, así que el bot caía a la fórmula
 * de divisores (÷0,5625 sobre el pvp1 del Contífico del catálogo, que es el
 * costo), y esa fórmula se sabe errada desde el 7-ago (acierta el 27 %).
 *
 * El 24-nov eran 6 llantas en esa situación y las 6 salían mal (de −$16,46 a
 * +$3,90 por llanta). El precio bueno sí existe: el pvp1 del Contífico donde
 * Depot FACTURA (la llave `CONTIFICO_FACTURAS_API_KEY`), que coincide con el
 * Interbot en 397 de 402 llantas. Así que, para las que el Interbot no tiene,
 * se lee ese pvp1 en vez de inventarlo.
 *
 * Solo pregunta por los códigos que faltan (una petición por código, a la API
 * v1, que sí filtra por código) y guarda el resultado una hora: la
 * sincronización corre cada 5 minutos y no hace falta preguntar en cada una.
 * Si Contífico no responde, queda el último precio leído; si nunca se leyó,
 * queda la fórmula y el log dice qué códigos están sin precio confirmado.
 */
import { config } from "../config.js";
import type { CatalogItem } from "../domain/catalog.js";

const TTL_MS = 60 * 60_000;
const TIMEOUT_MS = 15_000;

/** pvp1 (sin IVA) por código; `null` = Contífico respondió y no lo tiene. */
const leidos = new Map<string, { pvp1: number | null; at: number }>();

function round2(n: number): number {
  // El +1e-9 evita que 219.70 × 1.15 = 252.65499… redondee a 252.65 cuando
  // el POS (y la factura) dicen 252.66.
  return Math.round(n * 100 + 1e-9) / 100;
}

function baseV1(baseUrl: string): string {
  return baseUrl.replace(/\/v\d+$/, "/v1");
}

async function leerPvp1(codigo: string, apiKey: string, baseUrl: string): Promise<number | null> {
  const url = new URL(`${baseV1(baseUrl)}/producto/`);
  url.searchParams.set("codigo", codigo);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: apiKey, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    const filas = (Array.isArray(json)
      ? json
      : ((json as { results?: unknown[] } | null)?.results ?? [])) as Array<Record<string, unknown>>;
    // El filtro de la API no se toma por bueno: solo vale la fila con el mismo código.
    const fila = filas.find(
      (f) => String(f.codigo ?? "") === codigo && String(f.estado ?? "A").toUpperCase() !== "I",
    );
    const pvp1 = Number(fila?.pvp1);
    return Number.isFinite(pvp1) && pvp1 > 0 ? pvp1 : null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pone en cada llanta el precio del POS (pvp1 de la empresa que factura) y
 * devuelve cuántas quedaron con precio confirmado y cuáles no. Nunca lanza.
 */
export async function completarConPrecioDeFacturacion(
  sinPrecioReal: CatalogItem[],
  leer: (codigo: string) => Promise<number | null> = (codigo) =>
    leerPvp1(codigo, config.contifico!.facturasApiKey!, config.contifico!.baseUrl),
  ahora: number = Date.now(),
): Promise<{ aplicadas: number; sinConfirmar: string[] }> {
  const sinConfirmar: string[] = [];
  if (!sinPrecioReal.length) return { aplicadas: 0, sinConfirmar };

  const porLeer = [...new Set(sinPrecioReal.map((i) => i.code))].filter((codigo) => {
    const visto = leidos.get(codigo);
    return !visto || ahora - visto.at >= TTL_MS;
  });
  await Promise.all(
    porLeer.map(async (codigo) => {
      try {
        leidos.set(codigo, { pvp1: await leer(codigo), at: ahora });
      } catch (error) {
        // Se queda lo último leído (si lo hay); se reintenta en la próxima sincronización.
        console.warn(
          `⚠️ No se pudo leer el precio de facturación de ${codigo}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }),
  );

  // Mínimo (el «precio hoy» del vendedor) sobre el lleno: el mismo 0,75 que
  // trae el Interbot en sus 406 llantas.
  const minimoSobreLleno = config.contifico
    ? config.contifico.customerPriceDivisor / config.contifico.minimumPriceDivisor
    : 0.75;

  let aplicadas = 0;
  for (const item of sinPrecioReal) {
    const pvp1 = leidos.get(item.code)?.pvp1 ?? null;
    if (pvp1 === null) {
      sinConfirmar.push(item.code);
      continue;
    }
    item.customerPriceWithTax = round2(pvp1 * (1 + item.taxRate));
    item.minimumPriceWithTax = round2(item.customerPriceWithTax * minimoSobreLleno);
    item.price = round2(pvp1);
    aplicadas += 1;
  }
  return { aplicadas, sinConfirmar };
}

/** Solo para pruebas: olvida lo leído. */
export function __olvidarPreciosDeFacturacion(): void {
  leidos.clear();
}
