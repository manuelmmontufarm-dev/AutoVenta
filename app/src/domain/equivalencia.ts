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
 *
 * ES EL ÚNICO JUEZ (familia 1-B, 22-24 sep-2026). La lámina de opciones, la
 * regla de `generar_cotizacion`, las alternativas de `buscar_llanta` y de
 * fitment y el candado del
 * texto final (`equivalenciaEnTexto.ts`) preguntan aquí con `esEquivalente` /
 * `equivaleAAlguna`, y la dirección que pidió el cliente («más ancha», «más
 * alta») también vive aquí (`direccionPedida`, `respetaDireccion`).
 */
import { extractFlotationSizes, extractTireSizes } from "./tireSize.js";

/** Una pulgada, en milímetros. El aro se dice en pulgadas y el resto en mm. */
const PULGADA_MM = 25.4;

/** Fuera de esto el carro lo nota: no es equivalente, es otra llanta. */
export const TOLERANCIA_DIAMETRO = 0.03;

/** Más de esto de diferencia de ancho ya se ve y se siente distinto. */
const ANCHO_CERCANO_MM = 10;

/**
 * Más de esto de diferencia de ancho ya no monta en el mismo rin.
 *
 * Conv 22492 (22-sep): pidió 225/55R14 («ancho 225 para arriba hasta 235») y
 * recibió tres 175/70R14 como «equivalentes de su aro». El diámetro cuadraba
 * (600,6 mm contra 603,1) pero son 5 cm menos de sección: una 225 va en un rin
 * de 7″ y una 175 en uno de 5″. Dos pasos de ancho (±20 mm) es lo que admite un
 * mismo rin; la 245/75R16 del chat 18225, 2 cm más angosta que la 265/70R16,
 * sigue siendo equivalente.
 */
const ANCHO_MAXIMO_MM = 20;

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

  // Sin ancho comparable (una de pulgadas contra una métrica rara) manda el
  // diámetro, como siempre; con ancho, tiene que caber en el mismo rin.
  const anchoQueMonta = !Number.isFinite(deltaAncho) || deltaAncho <= ANCHO_MAXIMO_MM;
  const aceptable = mismoAro && deltaDiametro <= TOLERANCIA_DIAMETRO && anchoQueMonta;
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
  direccion: Direccion | null = null,
): T[] {
  if (!medidaPedida) return [...candidatas];
  // La dirección que pidió el cliente descarta ANTES de medir cercanía: la
  // más parecida que va para el otro lado no es una respuesta a «más ancha».
  const enSuDireccion = direccion
    ? candidatas.filter((item) => item.sizeLabel !== null && respetaDireccion(medidaPedida, item.sizeLabel, direccion))
    : candidatas;
  const conCercania = enSuDireccion.map((item) => ({ item, cercania: cercaniaDeMedida(medidaPedida, item.sizeLabel) }));
  const comparables = conCercania.filter((c) => c.cercania !== null);
  // Sin ninguna comparable no hay nada que filtrar: pasa todo, sin reordenar.
  if (!comparables.length) return [...enSuDireccion];
  return conCercania
    .filter((c) => c.cercania === null || c.cercania.aceptable)
    .sort((a, b) => (b.cercania?.puntaje ?? -Infinity) - (a.cercania?.puntaje ?? -Infinity))
    .map((c) => c.item);
}

/**
 * ¿Se le puede decir «equivalente» / «le entra» / «de su aro» a esta medida?
 *
 * La única respuesta del sistema a esa pregunta. La lámina de opciones, la
 * regla de `generar_cotizacion`, las equivalentes que quedan cotizables y el
 * candado del texto final preguntan AQUÍ; antes cada uno decidía a su manera
 * —o no decidía— y por eso la misma familia salió por cinco puertas
 * (auditoría 22-24 sep: convs 22533, 22975, 23021, 22492, 23080, 15644).
 *
 * «No se puede comparar» (una medida sin perfil, `165R14`) es NO: la
 * equivalencia se afirma cuando se sabe, no cuando no se sabe que no.
 */
export function esEquivalente(pedida: string | null | undefined, candidata: string | null | undefined): boolean {
  return cercaniaDeMedida(pedida, candidata)?.aceptable === true;
}

/** Equivale a por lo menos una de las medidas del cliente. Sin medidas, no equivale a nada. */
export function equivaleAAlguna(pedidas: readonly string[], candidata: string | null | undefined): boolean {
  return pedidas.some((pedida) => esEquivalente(pedida, candidata));
}

/** Hacia dónde pidió moverse el cliente respecto de su medida. */
export type Direccion = "mas_ancha" | "mas_angosta" | "mas_alta" | "mas_baja";

/**
 * «Me gustaría un poco más ancha» (conv 22975), «si me gustaría más alto»
 * (conv 23021). Null si el texto no pide moverse.
 *
 * «Más grande» es más alta: lo que el cliente ve crecer es la rueda entera.
 * Se ignora cuando lo que es «más alto» es el precio.
 */
export function direccionPedida(texto: string | null | undefined): Direccion | null {
  const n = (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const m = n.match(/\bmas\s+(anch|angost|delgad|finit|alt|grand|baj|pequen|chic)[a-z]*/);
  if (!m) return null;
  if (/\b(precio|caro|cara|costo|valor)\b/.test(n.slice(Math.max(0, (m.index ?? 0) - 25), (m.index ?? 0) + m[0].length + 25))) {
    return null;
  }
  switch (m[1]) {
    case "anch": return "mas_ancha";
    case "angost": case "delgad": case "finit": return "mas_angosta";
    case "alt": case "grand": return "mas_alta";
    default: return "mas_baja";
  }
}

/**
 * ¿La candidata va hacia donde pidió el cliente, partiendo de `base`?
 *
 * Más ancha = más sección. Más alta = más diámetro exterior (más perfil o más
 * aro). Si falta el dato para medirlo (una medida sin perfil), no se puede
 * afirmar que vaya para ese lado: es no.
 */
export function respetaDireccion(base: string, candidata: string, direccion: Direccion): boolean {
  if (direccion === "mas_ancha" || direccion === "mas_angosta") {
    const a = anchoMm(base);
    const b = anchoMm(candidata);
    if (a === null || b === null) return false;
    return direccion === "mas_ancha" ? b > a : b < a;
  }
  const a = diametroExteriorMm(base);
  const b = diametroExteriorMm(candidata);
  if (a === null || b === null) return false;
  return direccion === "mas_alta" ? b > a : b < a;
}
