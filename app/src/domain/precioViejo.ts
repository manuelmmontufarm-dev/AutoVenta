/**
 * EL PRECIO DE LA COTIZACIÓN DE AYER NO SE REPITE SI EL EXCEL LO CAMBIÓ HOY.
 *
 * Simulador Competimotor, 20-nov-2026 (caso s12 de seguimientos): el cliente
 * cotizó el jueves 4 KENDA KR203 a $104,65 c/u ($418,60). El viernes a las 8
 * entró el Excel de Fénix con la llanta a $112,99, y el seguimiento de la 1 de
 * la tarde —reescrito por el Guardián, que leyó la cotización en el hilo— dijo
 * «su cotización por 4 KENDA KR203 — $418.60 total». En el local esa cifra ya
 * no existe.
 *
 * Aquí solo lo puro: qué montos de la cotización quedaron viejos y cómo se
 * quitan del texto. La lectura de la cotización y del catálogo vive en
 * `services/precioViejo.ts`.
 */

export interface LineaFirmada {
  code?: string;
  quantity?: number;
  salePriceWithTax?: number | string;
  /** La línea con la promo de la 2.ª llanta se firma a lista: no se compara. */
  segundaLlanta?: unknown;
  precioSinPromoConIva?: number;
}

export interface CotizacionFirmada {
  total: number | string;
  subtotal?: number | string | null;
  items: LineaFirmada[] | null;
}

/**
 * Los precios con IVA que valen HOY para un código: el mínimo y la lista del
 * catálogo y, donde hay precio vivo (Interbot de Depot), los suyos. Si el
 * firmado es cualquiera de ellos, la cotización sigue al día.
 */
export type PreciosDeHoy = Array<number | null | undefined>;

const centavos = (v: number) => Math.round(v * 100);

/**
 * Los montos (en centavos) que la cotización afirmó y que hoy ya no valen:
 * el unitario, la línea y el total de cada línea cuyo precio firmado no es
 * ninguno de los precios del catálogo de hoy. Vacío si nada cambió, si el
 * producto ya no está en el catálogo (no hay con qué comparar) o si la línea
 * lleva promo (se firma a lista y la cuenta es otra).
 */
export function montosViejosDeLaCotizacion(
  cotizacion: CotizacionFirmada | null | undefined,
  precioDeHoy: (codigo: string) => PreciosDeHoy | null,
): number[] {
  if (!cotizacion) return [];
  const viejos = new Set<number>();
  for (const linea of cotizacion.items ?? []) {
    if (!linea?.code || linea.segundaLlanta || linea.precioSinPromoConIva != null) continue;
    const firmado = Number(linea.salePriceWithTax);
    if (!Number.isFinite(firmado) || firmado <= 0) continue;
    const hoy = precioDeHoy(linea.code);
    if (!hoy) continue;
    const vigentes = hoy.filter((v): v is number => typeof v === "number" && v > 0).map(centavos);
    if (!vigentes.length || vigentes.includes(centavos(firmado))) continue;
    const cantidad = Number(linea.quantity) || 1;
    viejos.add(centavos(firmado));
    viejos.add(centavos(firmado * cantidad));
    for (const v of [cotizacion.total, cotizacion.subtotal]) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) viejos.add(centavos(n));
    }
  }
  return [...viejos];
}

/** «418.60», «418,60», «1,234.56», «1.234,56» → centavos. */
function aCentavos(cifra: string): number | null {
  let s = cifra.trim();
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? centavos(n) : null;
}

// Un monto con lo que lo acompaña: el conector de antes («—», «por», «de»,
// «por un total de»), la negrita y lo que lo explica después («c/u», «total»,
// «con IVA»).
const MONTO = new RegExp(
  String.raw`(\s*(?:—|–|-|,|:|\bpor\s+un\s+total\s+de|\bpor|\bde)?\s*)`
  + String.raw`(\*?)\$\s?(\d[\d.,]*\d|\d)((?:\s+(?:c\/u|total|con\s+IVA|IVA\s+incluido|incluido\s+IVA))*)(\*?)`,
  "giu",
);

/**
 * El texto sin los montos viejos. Quita el monto con su conector y su
 * negrita; la línea que queda vacía (o solo con puntuación) se va.
 */
export function sinMontosViejos(texto: string, viejosEnCentavos: number[]): { texto: string; quitados: string[] } {
  if (!viejosEnCentavos.length) return { texto, quitados: [] };
  const viejos = new Set(viejosEnCentavos);
  const quitados: string[] = [];
  const lineas: string[] = [];
  for (const linea of texto.split("\n")) {
    const cambiada = linea.replace(MONTO, (todo, _antes: string, _n1: string, cifra: string) => {
      const c = aCentavos(cifra);
      if (c === null || !viejos.has(c)) return todo;
      quitados.push(`$${cifra}`);
      return "";
    });
    if (cambiada === linea) { lineas.push(linea); continue; }
    const pulida = cambiada.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").replace(/[ \t]+$/g, "");
    // Solo se va la línea que ESTE paso dejó sin palabras («*$418.60*» sola).
    if (/[\p{L}\p{N}]/u.test(pulida)) lineas.push(pulida);
  }
  if (!quitados.length) return { texto, quitados };
  const final = lineas.join("\n").trim();
  return { texto: final, quitados };
}
