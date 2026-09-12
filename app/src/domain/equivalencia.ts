/**
 * QUÉ LLANTA LE MONTA DE VERDAD.
 *
 * Cuando en la medida del cliente no hay stock, el bot ofrece «equivalentes de
 * su aro». Hasta hoy esa lista la armaba la escalera de marcas, que dentro de
 * cada marca elige la más barata con stock — y en un aro la más barata es casi
 * siempre la más angosta, o sea lo más lejano a lo que el cliente pidió.
 *
 * Cuatro casos de la auditoría del 8 al 11-sep-2026:
 *
 *  · conv 18225: pidió 265/70R16 M/T y recibió una KENDA KR29 en 245/75R16.
 *    Contestó «Buen día pero es llanta es muy baja». Había M/T en 265/75R16,
 *    con 8 y 4 unidades: mismo ancho, medio centímetro de diámetro de
 *    diferencia. La barata ganó.
 *  · conv 17831: pidió 285/75R16 A/T y recibió 215/65R16, 245/70R16 y
 *    235/70R16 — hasta 7 cm más angostas, una con 18 % menos de diámetro.
 *  · conv 18100: pidió 235/45R18 y en la MISMA imagen recibió 225/40R18
 *    (−4,7 % de diámetro) y 225/55R18 (+5,4 %). Ni equivalen entre sí.
 *  · conv 18407: pidió 205R14 para una Kia Pregio y recibió una 195/60R14 de
 *    auto, «se confirma el calce al montar».
 *
 * El criterio es el del taller, y son dos cosas distintas:
 *
 *  1. EL DIÁMETRO EXTERIOR manda, porque es lo que el carro nota: velocímetro,
 *     caja, ABS, y si roza. Fuera de ±3 % no es una equivalente, es otra
 *     llanta. Ese 3 % es el número que usan las tablas de equivalencia y el
 *     que Depot aplica en el local.
 *  2. EL ANCHO, después. Con el diámetro dentro del rango, la que respeta el
 *     ancho se siente igual; una más angosta cambia el agarre y se ve distinta,
 *     que es exactamente lo que el cliente del 18225 vio de un vistazo.
 *
 * Puro y sin catálogo: entra una etiqueta de medida y sale un número. Quien
 * ordena o descarta es quien llama, con estas piezas.
 */
import { extractFlotationSizes, extractTireSizes } from "./tireSize.js";

/** Una pulgada, en milímetros. El aro se dice en pulgadas y el resto en mm. */
const PULGADA_MM = 25.4;

/** Fuera de esto el carro lo nota: no es equivalente, es otra llanta. */
export const TOLERANCIA_DIAMETRO = 0.03;

/** Más de esto de diferencia de ancho ya se ve y se siente distinto. */
const ANCHO_CERCANO_MM = 10;

/**
 * El diámetro exterior en milímetros, o `null` si la etiqueta no alcanza para
 * calcularlo.
 *
 * Métrica: el aro más dos flancos. `265/70R16` → 16 × 25,4 + 2 × (265 × 0,70).
 * Pulgadas: el diámetro ES el primer número, ya viene dado. `33X12.5R15` → 33″.
 * Sin perfil (`205R14`, la de furgoneta del 18407) no se puede: el flanco es
 * justo el dato que falta, y suponerlo es cómo se ofreció una llanta de auto.
 */
export function diametroExteriorMm(etiqueta: string | null | undefined): number | null {
  if (!etiqueta) return null;
  const flotacion = extractFlotationSizes(etiqueta)[0];
  if (flotacion) return flotacion.diameter * PULGADA_MM;
  const metrica = extractTireSizes(etiqueta)[0];
  if (!metrica || metrica.aspect === null) return null;
  return metrica.rim * PULGADA_MM + 2 * metrica.width * (metrica.aspect / 100);
}

/** El ancho de sección en milímetros, venga de una métrica o de una en pulgadas. */
function anchoMm(etiqueta: string | null | undefined): number | null {
  if (!etiqueta) return null;
  const flotacion = extractFlotationSizes(etiqueta)[0];
  if (flotacion) return flotacion.section * PULGADA_MM;
  return extractTireSizes(etiqueta)[0]?.width ?? null;
}

/** El aro, de cualquiera de las dos formas de escribir una medida. */
function aro(etiqueta: string | null | undefined): number | null {
  if (!etiqueta) return null;
  return extractTireSizes(etiqueta)[0]?.rim ?? extractFlotationSizes(etiqueta)[0]?.rim ?? null;
}

export interface Cercania {
  /** ¿Se le puede ofrecer como equivalente sin mentir? */
  aceptable: boolean;
  /** Mismo ancho de sección: se siente y se ve igual. */
  mismoAncho: boolean;
  /** Diferencia de diámetro exterior, en tanto por uno. 0 = idéntico. */
  deltaDiametro: number;
  /** Diferencia de ancho en mm. */
  deltaAncho: number;
  /** Para ordenar: más alto es más parecido. */
  puntaje: number;
}

/**
 * Cuánto se le parece `candidata` a lo que el cliente pidió.
 *
 * `null` cuando no se puede comparar (una de las dos no tiene diámetro
 * calculable). No se puede comparar NO es «sí»: quien llama tiene que tratarlo
 * como lo que es, una medida que hay que confirmar con el asesor.
 */
export function cercaniaDeMedida(
  pedida: string | null | undefined,
  candidata: string | null | undefined,
): Cercania | null {
  const dPedida = diametroExteriorMm(pedida);
  const dCandidata = diametroExteriorMm(candidata);
  if (dPedida === null || dCandidata === null || dPedida <= 0) return null;

  // Otro aro no es una equivalente: es cambiar de rines.
  const aroPedido = aro(pedida);
  const aroCandidato = aro(candidata);
  const mismoAro = aroPedido !== null && aroPedido === aroCandidato;

  const deltaDiametro = Math.abs(dCandidata - dPedida) / dPedida;
  const anchoPedido = anchoMm(pedida);
  const anchoCandidato = anchoMm(candidata);
  const deltaAncho =
    anchoPedido !== null && anchoCandidato !== null ? Math.abs(anchoCandidato - anchoPedido) : Infinity;
  const mismoAncho = deltaAncho === 0;

  const aceptable = mismoAro && deltaDiametro <= TOLERANCIA_DIAMETRO;
  // El diámetro pesa 100 veces más que el ancho: es el que decide si monta.
  // El ancho desempata entre las que ya montan.
  const puntaje = -(deltaDiametro * 10_000) - (Number.isFinite(deltaAncho) ? deltaAncho : 1_000);

  return { aceptable, mismoAncho, deltaDiametro, deltaAncho, puntaje };
}

/**
 * Las candidatas que de verdad le montan, de la más parecida a la menos.
 *
 * Descarta las que no equivalen. Sin medida pedida devuelve la lista tal cual:
 * sin referencia no hay cercanía que medir, y reordenar por gusto sería peor
 * que no hacer nada.
 *
 * Las que no se pueden comparar (sin perfil, como `205R14`) se conservan al
 * final: existen y pueden ser lo único que hay, pero no se presentan como
 * equivalentes confirmadas.
 */
export function ordenarPorCercania<T extends { sizeLabel: string | null }>(
  candidatas: readonly T[],
  medidaPedida: string | null | undefined,
): T[] {
  if (!medidaPedida) return [...candidatas];
  const conCercania = candidatas.map((item) => ({ item, cercania: cercaniaDeMedida(medidaPedida, item.sizeLabel) }));
  const comparables = conCercania.filter((c) => c.cercania !== null);
  // Sin ninguna comparable no hay nada que filtrar: pasa todo, sin reordenar.
  if (!comparables.length) return [...candidatas];
  return conCercania
    .filter((c) => c.cercania === null || c.cercania.aceptable)
    .sort((a, b) => (b.cercania?.puntaje ?? -Infinity) - (a.cercania?.puntaje ?? -Infinity))
    .map((c) => c.item);
}
