/**
 * Cuánta plata se está ahorrando el cliente con la cotización que ya tiene.
 *
 * Joaquín, 26-ago-2026: «que le pregunte qué día cree que va a poder ir para
 * aplicarle el descuento y contactar al asesor, el del 25 % mostrado en la
 * cotización, y que calcule ese monto y lo muestre. Un mensaje corto pero
 * valioso, porque es más probable que lo den si pueden ver el número de plata».
 *
 * No cambia ninguna regla comercial: el descuento es el mismo con o sin día de
 * visita —ya está dentro del precio que la pieza imprime—. Lo único que cambia
 * es que el número se dice en vez de quedarse dibujado en la imagen.
 *
 * Puro y sin base ni catálogo: sale de los `items` que la cotización ya guardó,
 * que son los mismos que se imprimieron. Leerlo de otro lado sería arriesgarse a
 * anunciar un ahorro que la pieza no muestra.
 */

import { fraseDeSegundaLlanta, paresEnPalabras, seMuestraComo3x4, type ModoPromocion } from "./promocion.js";
import type { SegundaLlanta } from "./promocionDeTemporada.js";

export interface LineaCotizada {
  quantity?: number | null;
  /** Precio de lista con IVA: el «antes» tachado en la pieza. */
  listPriceWithTax?: number | null;
  /** Precio de venta con IVA: el que el cliente paga. */
  salePriceWithTax?: number | null;
  /** Black Friday (nov-2026): las pares con el 60 %; se guarda dentro de los `items`. */
  segundaLlanta?: SegundaLlanta | null;
}

export interface AhorroDeLaCotizacion {
  /** Lo que deja de pagar en TODA la compra, no por llanta. */
  monto: number;
  /** El mismo porcentaje que la pieza muestra en su sello. */
  porcentaje: number;
  cantidad: number;
  /** Lo que deja de pagar por cada llanta: el «ahorras $X c/u» de la pieza. */
  porLlanta: number;
  /** El precio por llanta que paga, con el descuento ya aplicado. */
  precioConDescuento: number;
  /** El precio de lista por llanta: el «antes» tachado. */
  precioAntes: number;
  /**
   * Cómo se nombra la rebaja (Ajustes → Piezas, 26-oct). Opcional: quien no
   * lo llena sigue diciendo el porcentaje, como siempre. Ver `domain/promocion.ts`.
   */
  modo?: ModoPromocion;
  /**
   * Black Friday (nov-2026): las llantas pares con el 60 % sobre el precio de
   * hoy. Con ella `monto` = catálogo + promo, y el precio por llanta deja de
   * ser uno solo: las pares cuestan `segundaLlanta.precioConIva`.
   */
  segundaLlanta?: SegundaLlanta | null;
  /** Lo que se ahorra solo por el precio de hoy contra el de lista (sin la promo). */
  montoCatalogo?: number;
}

/** ¿La promo guardada en los `items` tiene cifras con sentido? (viene de un JSON de la base). */
function segundaLlantaValida(s: SegundaLlanta | null | undefined): SegundaLlanta | null {
  if (!s || typeof s !== "object") return null;
  const ok = [s.unidades, s.precioConIva, s.precioNormalConIva, s.ahorroConIva, s.totalConIva, s.porcentaje]
    .every((n) => typeof n === "number" && Number.isFinite(n) && n > 0);
  return ok ? s : null;
}

/**
 * `null` cuando no hay nada que presumir: sin cotización, sin precio de lista
 * más alto, o con un redondeo que daría «0 %». Anunciar un ahorro de cero
 * —o de un centavo— desperdicia el mensaje y le resta credibilidad al resto.
 */
export function ahorroDeLaCotizacion(
  items: readonly LineaCotizada[] | null | undefined,
): AhorroDeLaCotizacion | null {
  const linea = (items ?? [])[0];
  if (!linea) return null;
  const lista = Number(linea.listPriceWithTax ?? 0);
  const venta = Number(linea.salePriceWithTax ?? 0);
  const cantidad = Math.max(1, Math.round(Number(linea.quantity ?? 1)));
  if (!Number.isFinite(lista) || !Number.isFinite(venta)) return null;
  const segundaLlanta = segundaLlantaValida(linea.segundaLlanta);
  if (segundaLlanta && venta > 0) {
    // Con el Black Friday hay ahorro aunque el catálogo no tenga rebaja: el
    // 60 % de las pares. El de lista se suma solo si existe.
    const conCatalogo = lista > venta;
    const porLlanta = conCatalogo ? Math.round((lista - venta) * 100) / 100 : 0;
    const montoCatalogo = Math.round(porLlanta * cantidad * 100) / 100;
    return {
      monto: Math.round((montoCatalogo + segundaLlanta.ahorroConIva) * 100) / 100,
      porcentaje: conCatalogo ? Math.round((1 - venta / lista) * 100) : 0,
      cantidad,
      porLlanta,
      precioConDescuento: venta,
      precioAntes: conCatalogo ? lista : venta,
      segundaLlanta,
      montoCatalogo,
    };
  }
  if (lista <= 0 || venta <= 0 || venta >= lista) return null;

  const monto = Math.round((lista - venta) * cantidad * 100) / 100;
  const porcentaje = Math.round((1 - venta / lista) * 100);
  if (monto < 1 || porcentaje < 1) return null;
  const porLlanta = Math.round((lista - venta) * 100) / 100;
  return { monto, porcentaje, cantidad, porLlanta, precioConDescuento: venta, precioAntes: lista };
}

/** ¿Además del Black Friday hay rebaja de catálogo que valga la pena nombrar? */
function conRebajaDeCatalogo(ahorro: Pick<AhorroDeLaCotizacion, "porcentaje" | "montoCatalogo">): boolean {
  return ahorro.porcentaje >= 1 && (ahorro.montoCatalogo ?? 0) >= 1;
}

/**
 * «*25 %* de descuento ya aplicado, *$277.44* menos» — la mitad de la frase que se le dice
 * al cliente. Quien llama pone el resto según el turno, porque no es lo mismo
 * pedirle el día que confirmarle la visita.
 *
 * Punto decimal y no coma, igual que la pieza y que la cotización: el formato
 * es-EC («$277,44») fue 4 de los 8 `precio_incorrecto` ALTA del informe del
 * guardián del 15-ago, porque el revisor lee dos números distintos.
 */
export function fraseDeAhorro(
  ahorro: Pick<AhorroDeLaCotizacion, "porcentaje" | "monto" | "modo">
    & Partial<Pick<AhorroDeLaCotizacion, "segundaLlanta" | "montoCatalogo">>
    & { cantidad?: number | null },
): string {
  // Black Friday: gana sobre el 4x3 (no se apilan rótulos) y se dice con sus
  // cifras, que son las que el cliente ve en la pieza.
  if (ahorro.segundaLlanta) {
    const promo = fraseDeSegundaLlanta(ahorro.segundaLlanta, ahorro.cantidad);
    return conRebajaDeCatalogo(ahorro)
      ? `${promo}, además del *${ahorro.porcentaje} %* de descuento ya aplicado — en total *$${ahorro.monto.toFixed(2)}* menos`
      : promo;
  }
  // En 3x4 la misma plata con el nombre que trae la pieza (26-oct, feriado).
  // Con 2 llantas no: «paga 3 lleva 4» prometería una cuarta que no está.
  if (seMuestraComo3x4(ahorro.modo ?? "porcentaje", ahorro.porcentaje, ahorro.cantidad)) {
    return `*4 llantas por el precio de 3*, *$${ahorro.monto.toFixed(2)}* menos`;
  }
  return `*${ahorro.porcentaje} %* de descuento ya aplicado, *$${ahorro.monto.toFixed(2)}* menos`;
}

/**
 * ¿El cliente habla del descuento de SU cotización?
 *
 * Caso 1 de las pruebas del 12-sep (conv 3, 17:16): «La promoción del 25% q son
 * 103$.64 menos» recibió el local recomendado, «¿qué día podría pasar?» y el
 * mapa. Nadie le contestó lo que dijo. Pide cifras o una pregunta sobre el
 * descuento: «¿tienen alguna promoción?» es otra cosa (`preguntaPorBeneficios`).
 */
export function hablaDelDescuento(texto: string | null | undefined): boolean {
  const n = (texto ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Black Friday (nov-2026): «el 60%», «la segunda a $30», «el black friday
  // ya está?» hablan del descuento sin nombrarlo.
  if (/\bblack\s*friday\b/.test(n) && /\d|%|\bcuanto\b|\baplica\w*\b|\bincluid\w*\b|\bya\b/.test(n)) return true;
  // Un porcentaje suelto es del descuento si nombra la llanta o es corto
  // («y el 60%?»); el del IVA, la tarjeta o el interés es otra cosa.
  if (/\b\d{1,3}\s*%/.test(n) && !/\b(?:iva|interes\w*|tarjeta|recargo|comision\w*|financ\w*)\b/.test(n)
    && (/\b(?:llantas?|segunda|2\s*(?:da|\.?\s*[aª])|menos)\b/.test(n) || n.trim().split(/\s+/).length <= 8)) return true;
  if (/\b(?:segunda|2\s*(?:da|\.?\s*[aª]))\b[^\d]{0,25}\d/.test(n)) return true;
  if (!/\bdescuentos?\b|\bpromo(?:cion)?\b|\brebaja\b|\bahorr\w*\b/.test(n)) return false;
  return /\d|%|\bcuanto\b|\bmenos\b|\baplica\w*\b|\bincluid\w*\b|\bdescontad\w*\b/.test(n);
}

/** ¿El texto ya dice el porcentaje y que está descontado? */
export function respondeElDescuento(texto: string, ahorro: AhorroDeLaCotizacion): boolean {
  const n = texto.toLowerCase();
  const dice = (p: number) => n.includes(`${p} %`) || n.includes(`${p}%`);
  const s = ahorro.segundaLlanta;
  // Black Friday: dice el 60 % y a qué llanta (o el nombre de la promo).
  if (s && dice(s.porcentaje) && (n.includes(s.nombre.toLowerCase()) || /llanta/.test(n))) return true;
  return dice(ahorro.porcentaje) && /aplicad|incluid|descontad/.test(n);
}

/**
 * Las cifras que escribió el cliente: los montos y los porcentajes, aparte.
 * «103$.64» (conv 16982) es 103.64: el signo pegado en medio no parte la cifra.
 */
export function cifrasDelCliente(texto: string | null | undefined): { montos: number[]; porcentajes: number[] } {
  // «3x4» es el nombre de la promoción, no $3 y $4 (revisión del 26-oct): leído
  // como montos, «¿la promo 3x4 ya está aplicada?» arrancaba con «Le aclaro:»,
  // como si el cliente hubiera dicho una cifra equivocada.
  // «la 2da», «la 2.ª», «4ta» y «las 4 llantas» cuentan llantas, no plata
  // (Black Friday: «la 2da a $30» es $30, no $2 y $30).
  const t = (texto ?? "")
    .replace(/\b\d+\s*(?:\.\s*)?(?:[ªº°]|(?:da|do|ra|ro|er|ta|to|va|vo)\b)/gi, " ")
    .replace(/\b\d+\s+llantas?\b/gi, " ")
    .replace(/\b\d\s*x\s*\d\b/gi, " ").replace(/(\d)\s*\$\s*([.,]\d)/g, "$1$2").replace(/\$/g, " ");
  const porcentajes = [...t.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g)].map((m) => Number(m[1].replace(",", ".")));
  const sinPorcentajes = t.replace(/\d{1,3}(?:[.,]\d+)?\s*%/g, " ");
  const montos = [...sinPorcentajes.matchAll(/(?<![\d/])(\d+(?:[.,]\d{1,2})?)(?![\d/])/g)]
    .map((m) => Number(m[1].replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n >= 1);
  return { montos, porcentajes };
}

const cerca = (dicho: number, real: number) => Math.abs(dicho - real) <= Math.max(0.6, real * 0.02);
const dinero = (n: number) => `*$${n.toFixed(2)}*`;

/**
 * LA RESPUESTA SOBRE EL DESCUENTO, CONTRA LA CIFRA QUE DIJO EL CLIENTE.
 *
 * Manuel, 12-sep 21:42 (conv 3): 4 × WINRUN R330 a $58.25, antes $77.66. Él
 * escribió «La promoción del 25% q son 58 menos» y el bot contestó «Así es:
 * … $77.64 menos». Dos errores: confirmó una cifra que no es el descuento
 * ($58.25 es lo que paga por llanta) y dio solo el total de las cuatro, que se
 * confunde con el precio de antes. La pieza dice «ahorras $19.41 c/u»: la
 * respuesta tiene que hablar en esa misma unidad, y además dar el total.
 *
 * Solo dice «Así es» cuando la cifra del cliente ES el descuento. Si es el
 * precio o el total a pagar, lo aclara con todas las letras.
 */
export function respuestaDelDescuento(ahorro: AhorroDeLaCotizacion, textoDelCliente?: string | null): string {
  if (ahorro.segundaLlanta) return respuestaDeSegundaLlanta(ahorro, ahorro.segundaLlanta, textoDelCliente);
  const cuanto = ahorro.cantidad > 1
    ? `${dinero(ahorro.porLlanta)} por llanta, ${dinero(ahorro.monto)} en las ${ahorro.cantidad} llantas`
    : dinero(ahorro.monto);
  // En 3x4 se nombra la promoción y se dice que equivale al 25 %: el cliente
  // que vio «25 %» en otro lado no tiene que pensar que son dos rebajas. Fijo
  // en 25 y no el redondeo de la llanta: con −24 % «paga 3 lleva 4, que es el
  // mismo 24 %» se contradice solo (el candado ya garantiza 24–26).
  const tres = seMuestraComo3x4(ahorro.modo ?? "porcentaje", ahorro.porcentaje, ahorro.cantidad);
  const nombre = tres
    ? "la promoción de *4 llantas por el precio de 3* (que equivale al *25 %* de descuento)"
    : `el *${ahorro.porcentaje} %* de descuento`;
  const base = `su cotización ya trae ${nombre}, que son ${cuanto}. `
    + "Ya está descontado del total que le envié; no se resta otra vez.";
  const { montos, porcentajes } = cifrasDelCliente(textoDelCliente);
  const otroPorcentaje = porcentajes.some((p) => Math.abs(p - ahorro.porcentaje) >= 1);
  const totalAPagar = Math.round(ahorro.precioConDescuento * ahorro.cantidad * 100) / 100;
  const esElPrecio = montos.find((n) => cerca(n, ahorro.precioConDescuento));
  const esElTotal = montos.find((n) => cerca(n, totalAPagar));
  // Nombrar la 3x4 es hablar del descuento: «¿la promo 3x4 ya está aplicada?»
  // se confirma («Así es»), no se «aclara». Solo si su cotización de verdad
  // va como 3x4; si va en porcentaje, «3x4» es algo que hay que aclarar.
  const nombra3x4 = /\b\d\s*x\s*\d\b/i.test(textoDelCliente ?? "");
  const esElDescuento = (montos.length > 0 || (nombra3x4 && tres))
    && montos.every((n) => cerca(n, ahorro.monto) || cerca(n, ahorro.porLlanta));
  if (esElPrecio !== undefined) {
    return `Le aclaro: ${dinero(ahorro.precioConDescuento)} es el precio por llanta, ya con el descuento `
      + `(antes ${dinero(ahorro.precioAntes)}). El descuento del *${ahorro.porcentaje} %* son ${cuanto}. `
      + "Ya está descontado del total que le envié; no se resta otra vez.";
  }
  if (esElTotal !== undefined) {
    return `Le aclaro: ${dinero(totalAPagar)} es el total a pagar, ya con el descuento. Y ${base}`;
  }
  if (esElDescuento && !otroPorcentaje) return `Así es: ${base}`;
  if (montos.length || otroPorcentaje || nombra3x4) return `Le aclaro: ${base}`;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * LA MISMA RESPUESTA CON EL BLACK FRIDAY (nov-2026).
 *
 * Con la promo de la 2.ª llanta hay dos precios por llanta y dos porcentajes,
 * y los dos son ciertos: «el 60 %» o «la segunda a $30» se confirman («Así
 * es»), no se «aclaran». Lo que se aclara es lo de siempre: llamar descuento
 * al precio de la llanta o al total a pagar. Sin 4x3 aunque esté encendido:
 * gana la promo de temporada y no se apilan rótulos.
 */
function respuestaDeSegundaLlanta(
  ahorro: AhorroDeLaCotizacion,
  s: SegundaLlanta,
  textoDelCliente?: string | null,
): string {
  const catalogo = conRebajaDeCatalogo(ahorro);
  const normales = Math.max(0, ahorro.cantidad - s.unidades);
  const promo = `el *${s.nombre}*: *${s.porcentaje} %* menos en su ${paresEnPalabras(s.unidades)} llanta — `
    + `${normales} a ${dinero(s.precioNormalConIva)} y ${s.unidades} a ${dinero(s.precioConIva)}, ${dinero(s.ahorroConIva)} menos`;
  const base = catalogo
    ? `su cotización ya trae el *${ahorro.porcentaje} %* de descuento (${dinero(ahorro.porLlanta)} por llanta) y ${promo}; `
      + `en total ${dinero(ahorro.monto)} menos. Ya está descontado del total que le envié (${dinero(s.totalConIva)}); no se resta otra vez.`
    : `su cotización ya trae ${promo}. Ya está descontado del total que le envié (${dinero(s.totalConIva)}); no se resta otra vez.`;
  const { montos, porcentajes } = cifrasDelCliente(textoDelCliente);
  const porcentajesBuenos = [s.porcentaje, ...(catalogo ? [ahorro.porcentaje] : [])];
  const otroPorcentaje = porcentajes.some((p) => porcentajesBuenos.every((b) => Math.abs(p - b) >= 1));
  const porPar = Math.round((s.precioNormalConIva - s.precioConIva) * 100) / 100;
  // Cifras de la promo que el cliente puede decir y son ciertas como descuento.
  const deLaPromo = [s.precioConIva, s.ahorroConIva, porPar, ahorro.monto, ...(catalogo ? [ahorro.porLlanta, ahorro.montoCatalogo ?? 0] : [])];
  const esDeLaPromo = (n: number) => deLaPromo.some((v) => v > 0 && cerca(n, v));
  const esElPrecio = (n: number) => cerca(n, s.precioNormalConIva);
  const esElTotal = montos.find((n) => cerca(n, s.totalConIva));
  // «la 1.ª a $75 y la 2.ª a $30»: el precio normal junto a la par rebajada es la cuenta, no un error.
  const conLaPar = montos.some((n) => cerca(n, s.precioConIva));
  const preciosSueltos = montos.filter((n) => esElPrecio(n) && !esDeLaPromo(n));
  if (preciosSueltos.length && !conLaPar) {
    const impares = Array.from({ length: Math.max(1, normales) }, (_, i) => `${i * 2 + 1}.ª`);
    const lasImpares = impares.length === 1 ? impares[0] : `${impares.slice(0, -1).join(", ")} y ${impares[impares.length - 1]}`;
    return `Le aclaro: ${dinero(s.precioNormalConIva)} es el precio de hoy por llanta, el que paga${impares.length > 1 ? "n" : ""} la ${lasImpares}; `
      + `la ${paresEnPalabras(s.unidades)} ${s.unidades > 1 ? "van" : "va"} a ${dinero(s.precioConIva)} por el ${s.nombre}. Y ${base}`;
  }
  if (esElTotal !== undefined && !esDeLaPromo(esElTotal)) {
    return `Le aclaro: ${dinero(s.totalConIva)} es el total a pagar, ya con el descuento. Y ${base}`;
  }
  const nombraLaPromo = porcentajes.length > 0 || /\bblack\s*friday\b/i.test(textoDelCliente ?? "");
  const todoCierto = montos.every((n) => esDeLaPromo(n) || (conLaPar && esElPrecio(n)));
  if ((montos.length > 0 || nombraLaPromo) && todoCierto && !otroPorcentaje) return `Así es: ${base}`;
  if (montos.length || otroPorcentaje) return `Le aclaro: ${base}`;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * ¿Esta frase del borrador habla del descuento? Para quitarla cuando el turno
 * ya lleva la respuesta de arriba: «Sí, esa es la idea: el precio ya le quedó
 * en $58.25 c/u…» (21:42) no nombra el descuento, pero confirma una cifra.
 */
export function esFraseDelDescuento(frase: string): boolean {
  const n = frase.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\bdescuent|\bpromo|\bahorr|\brebaja|\bdescontad|\baplicad/.test(n)
    || /\$\s*\d|\d\s*\$|(?<![\d.,])\d+[.,]\d{2}(?![\d.,])/.test(frase)
    || /^(?:as[ii] es|exacto|correcto|si, esa es la idea|esa es la idea)\b/.test(n);
}
