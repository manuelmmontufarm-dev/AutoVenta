/**
 * LA PROMOCIÓN DE TEMPORADA COMO HECHO — lo que el vendedor y el guardián
 * saben del Black Friday (Depot, noviembre 2026), en un solo lugar.
 *
 * Por qué existe (la regla de `docs/COMO-ARREGLAR-EL-BOT.md`, paso 4): «todo
 * dato que el guardián deba dejar pasar tiene que estar en sus HECHOS, o lo
 * borra». Sin este bloque el vendedor no puede decir «$20 la alineación» y,
 * si lo dice, el revisor lo tacha por inventado; y al revés, nada le impide
 * prometer el 60 % en una Winrun o en las cuatro llantas.
 *
 * Los datos salen de la política (`politica.promocionDeTemporada`) y las
 * cifras de `domain/promocionDeTemporada.ts`: acá no se recalcula ningún
 * precio, solo se escribe. Fuera de fechas, o en un cliente sin promo
 * (Mundillantas, ejemplo), todo devuelve null y nada de esto existe.
 */
import { REGLAS_DE_PROMOCION_DE_TEMPORADA } from "../agent/compactPlaybook.js";
import {
  consultaDeServicioDeTemporada,
  serviciosNombrados,
  type ConsultaDeTemporada,
} from "../domain/alcanceComercial.js";
import {
  hastaEnPalabras,
  productosEnPromocion,
  promocionVigente,
  serviciosEnPromocion,
  type PromocionDeTemporada,
} from "../domain/promocionDeTemporada.js";
import { politica } from "../negocio/politica.js";

export interface OpcionesDeTemporada {
  /** La promo de la política; por defecto la del cliente cargado. */
  promo?: PromocionDeTemporada | null;
  ahora?: Date;
  /** Los textos de la tabla `benefits` vigentes (INCLUIDO CON LA COMPRA). */
  beneficios?: readonly string[];
  /**
   * ¿Va la lista de aceites con sus precios? Son 22 filas (~600 tokens): viajan
   * solo cuando en el chat se habla de aceite. Sin ella queda el porcentaje.
   */
  conAceites?: boolean;
}

const dinero = (n: number) => `$${n.toFixed(2)}`;
/** «FALKEN» → «Falken»: las marcas de la política vienen en mayúsculas. */
const marcaEnPalabras = (marca: string) => marca.charAt(0).toUpperCase() + marca.slice(1).toLowerCase();
function unidos(lista: readonly string[], conector: "y" | "o" | "ni"): string {
  if (lista.length <= 1) return lista.join("");
  return `${lista.slice(0, -1).join(", ")} ${conector} ${lista.at(-1)}`;
}
const sinRepetir = <T>(lista: readonly T[]) => [...new Set(lista)];

/** La promo, solo si corre hoy. */
function vigente(opciones: OpcionesDeTemporada): PromocionDeTemporada | null {
  const promo = opciones.promo === undefined ? politica.promocionDeTemporada : opciones.promo;
  return promocionVigente(promo, opciones.ahora ?? new Date()) ? promo : null;
}

/** Los nombres de servicio de la promo, sin repetir («Alineación», «Balanceo»…). */
function nombresDeServicios(promo: PromocionDeTemporada): string[] {
  return sinRepetir((promo.servicios?.lista ?? []).map((s) => s.servicio));
}

/**
 * ¿Qué servicios de la promo ya van INCLUIDOS al comprar llantas? Los que la
 * tabla de beneficios nombra («alineación y balanceo incluidos»). Es la tabla
 * la que manda: si mañana el balanceo deja de ir incluido, deja de salir acá.
 */
export function incluidosConLaLlanta(promo: PromocionDeTemporada, beneficios: readonly string[]): string[] {
  const nombres = nombresDeServicios(promo);
  return sinRepetir(beneficios.flatMap((texto) => serviciosNombrados(texto, nombres)));
}

// ===========================================================================
// El bloque de hechos (vendedor y guardián)
// ===========================================================================

function lineasDeLaPromo(
  promo: PromocionDeTemporada,
  ahora: Date,
  beneficios: readonly string[],
  conAceites: boolean,
): string[] {
  const lineas: string[] = [];
  if (promo.segundaLlanta) {
    const marcas = unidos(promo.segundaLlanta.marcas.map(marcaEnPalabras), "y");
    lineas.push(
      `- Llantas: ${promo.segundaLlanta.porcentaje} % de descuento en la SEGUNDA llanta sobre el precio de LISTA (solo ese ${promo.segundaLlanta.porcentaje} %, NO encima del descuento del catálogo) — `
      + `cada llanta par de la cotización (la 2.ª y la 4.ª de un juego de 4 llantas; las impares van a precio de hoy). `
      + `SOLO marcas ${marcas}; cualquier otra marca NO lo lleva. Una sola llanta no lleva nada. `
      + `NO es el ${promo.segundaLlanta.porcentaje} % en todas las llantas.`,
    );
  }
  const servicios = serviciosEnPromocion(promo, ahora);
  if (servicios.length) {
    const porServicio = nombresDeServicios(promo).map((nombre) => {
      const precios = servicios
        .filter((s) => s.servicio === nombre)
        .map((s) => `${s.vehiculo} ${dinero(s.precioNormalConIva)} → ${dinero(s.precioPromoConIva)}`);
      return `${nombre}: ${precios.join(", ")}`;
    });
    lineas.push(
      `- Servicios al ${servicios[0].porcentaje} % (precio con IVA, normal → ${promo.nombre}): ${porServicio.join(" · ")}. `
      + "Ningún otro servicio está en promoción.",
    );
  }
  const incluidos = incluidosConLaLlanta(promo, beneficios);
  if (incluidos.length) {
    lineas.push(
      `- OJO: ${unidos(incluidos, "y").toLowerCase()} ya van INCLUIDOS sin costo con la compra de llantas. `
      + "El descuento de servicios es solo para quien viene únicamente por el servicio.",
    );
  }
  const aceites = lineaDeAceites(promo, ahora, conAceites);
  if (aceites) lineas.push(aceites);
  for (const regalo of promo.gratis) lineas.push(`- ${regalo}.`);
  return lineas;
}

/** La línea del aceite: con la lista y sus precios, o solo el porcentaje. */
function lineaDeAceites(promo: PromocionDeTemporada, ahora: Date, conLista: boolean): string | null {
  const productos = productosEnPromocion(promo, ahora);
  if (!productos.length || !promo.productos) return null;
  const categoria = `${promo.productos.categoria.charAt(0).toUpperCase()}${promo.productos.categoria.slice(1)}`;
  if (!conLista) {
    return `- ${categoria}: ${productos[0].porcentaje} % de descuento sobre el PVP con IVA de ${productos.length} aceites `
      + "de la lista. Cuál le sirve a su vehículo lo confirma el asesor; sus precios llegan cuando se habla de aceite.";
  }
  return `- ${categoria}: ${productos[0].porcentaje} % de descuento sobre el PVP con IVA, SOLO estos aceites (PVP → ${promo.nombre}): `
    + productos.map((p) => `${p.nombre} ${dinero(p.pvpConIva)} → ${dinero(p.precioPromoConIva)}`).join(" · ")
    + ". Cuál le sirve a su vehículo lo confirma el asesor.";
}

function encabezado(promo: PromocionDeTemporada): string {
  return `PROMOCIÓN DE TEMPORADA VIGENTE (fuente determinística): ${promo.nombre}, `
    + `hasta el ${hastaEnPalabras(promo)}. «${promo.lema}». Esto es TODO lo que tiene la promo:`;
}

/** El hecho del vendedor: la promo entera y cómo se habla de ella. Null si no corre. */
export function hechoDeTemporadaParaElVendedor(opciones: OpcionesDeTemporada = {}): string | null {
  const promo = vigente(opciones);
  if (!promo) return null;
  const ahora = opciones.ahora ?? new Date();
  return [
    encabezado(promo),
    ...lineasDeLaPromo(promo, ahora, opciones.beneficios ?? [], Boolean(opciones.conAceites)),
    REGLAS_DE_PROMOCION_DE_TEMPORADA,
  ].join("\n");
}

/**
 * El mismo hecho para el guardián, con lo que tiene que dejar pasar y lo que
 * tiene que tachar. Va en sus HECHOS (no en la rúbrica) para que exista solo
 * mientras la promo corre y solo en el cliente que la tiene.
 */
export function hechoDeTemporadaParaElGuardian(opciones: OpcionesDeTemporada = {}): string | null {
  const promo = vigente(opciones);
  if (!promo) return null;
  const ahora = opciones.ahora ?? new Date();
  const pct = promo.segundaLlanta?.porcentaje;
  const marcas = promo.segundaLlanta ? unidos(promo.segundaLlanta.marcas.map(marcaEnPalabras), "y") : null;
  const servicios = serviciosEnPromocion(promo, ahora);
  const productos = productosEnPromocion(promo, ahora);
  const incluidos = incluidosConLaLlanta(promo, opciones.beneficios ?? []);
  const vale = [
    pct != null ? `el ${pct} % en la 2.ª (y 4.ª) llanta ${marcas}` : null,
    servicios.length ? `el ${servicios[0].porcentaje} % y los precios de servicios de esta tabla` : null,
    productos.length ? `el ${productos[0].porcentaje} % y los precios de aceite de esta lista` : null,
    ...promo.gratis.map((g) => `«${g}»`),
    `«hasta el ${hastaEnPalabras(promo)}»`,
  ].filter(Boolean);
  const tacha = [
    pct != null ? `el ${pct} % en otra marca que no sea ${marcas}` : null,
    pct != null ? `el ${pct} % en todas las llantas, en las 4 o en una sola llanta` : null,
    servicios.length ? `un descuento o precio de un servicio que no está en la tabla, o un precio distinto al de la tabla` : null,
    productos.length ? "un precio de aceite que no está en la lista, o un aceite elegido por el modelo del vehículo" : null,
    incluidos.length
      ? `ofrecerle el descuento o el precio de ${unidos(incluidos, "o").toLowerCase()} a quien compra llantas (le van incluidos)`
      : null,
  ].filter(Boolean);
  return [
    encabezado(promo),
    ...lineasDeLaPromo(promo, ahora, opciones.beneficios ?? [], Boolean(opciones.conAceites)),
    `PARA EL REVISOR: NO taches como inventado ${unidos(vale as string[], "ni")}: son hechos.`,
    `SÍ es **hecho_comercial_inventado** (alta): ${unidos(tacha as string[], "o")}. Corrige con la cifra de esta lista o quitándola.`,
  ].join("\n");
}

// ===========================================================================
// Servicios y aceite: la orden del turno
// ===========================================================================

/** La consulta de servicio de este turno, con la promo y la tabla de beneficios resueltas. */
export function consultaDeTemporadaDelTurno(
  textosCronologicos: readonly string[],
  opciones: OpcionesDeTemporada = {},
): ConsultaDeTemporada | null {
  const promo = vigente(opciones);
  if (!promo) return null;
  return consultaDeServicioDeTemporada(textosCronologicos, {
    serviciosDeLaPromo: nombresDeServicios(promo),
    hayAceiteEnPromo: Boolean(promo.productos?.lista.length),
    incluidosConLaLlanta: incluidosConLaLlanta(promo, opciones.beneficios ?? []),
  });
}

/**
 * Lo que el vendedor tiene que hacer con la consulta. Reemplaza al
 * ORDEN_FUERA_DE_CATALOGO mientras la promo corre: antes el bot no podía
 * afirmar nada del aceite; ahora dice la promo y deriva al asesor igual.
 */
export function ordenDeServicioDeTemporada(
  consulta: ConsultaDeTemporada,
  opciones: OpcionesDeTemporada = {},
): string | null {
  const promo = vigente(opciones);
  if (!promo) return null;
  const ahora = opciones.ahora ?? new Date();
  if (consulta.tipo === "incluido_con_la_llanta") {
    return `COMPRA LLANTAS Y PREGUNTA POR ${unidos(consulta.servicios, "y").toUpperCase()} (fuente determinística): `
      + "con la compra de sus llantas eso ya va INCLUIDO, sin costo. Afírmalo así. PROHIBIDO ofrecerle el descuento "
      + `de servicios del ${promo.nombre} o su precio: ese es para quien viene solo por el servicio. Sigue con su compra de llantas.`;
  }
  const partes: string[] = [
    `CONSULTA DE SERVICIO EN PROMOCIÓN (fuente determinística, ${promo.nombre} hasta el ${hastaEnPalabras(promo)}): `
    + "el cliente pregunta por un servicio del taller, no por llantas. No busques ni cotices llantas.",
  ];
  const servicios = serviciosEnPromocion(promo, ahora).filter((s) => consulta.servicios.includes(s.servicio));
  if (servicios.length) {
    const delVehiculo = consulta.vehiculo ? servicios.filter((s) => s.vehiculo === consulta.vehiculo) : [];
    if (delVehiculo.length) {
      partes.push(
        `Su vehículo es ${consulta.vehiculo}: `
        + delVehiculo.map((s) => `${s.servicio} ${dinero(s.precioPromoConIva)} (normal ${dinero(s.precioNormalConIva)})`).join(", ")
        + ` con el ${servicios[0].porcentaje} % del ${promo.nombre}, IVA incluido. Dale ese precio.`,
      );
    } else {
      partes.push(
        `El precio depende de si es auto o camioneta y no lo sabes: dile que tiene el ${servicios[0].porcentaje} % `
        + "y pregúntale si es auto o camioneta para darle el precio exacto. PROHIBIDO adivinarlo por el modelo.",
      );
    }
  }
  if (consulta.aceite && promo.productos) {
    partes.push(
      `Aceite: el ${promo.productos.categoria} tiene ${promo.productos.porcentaje} % `
      + "de descuento sobre el PVP de los aceites de la lista. Qué aceite le corresponde a su vehículo lo confirma el asesor: "
      + "PROHIBIDO elegirlo tú por el modelo del vehículo. Solo das un precio si nombró un aceite de la lista.",
    );
    const lista = lineaDeAceites(promo, ahora, true);
    if (lista) partes.push(lista.replace(/^- /, ""));
  }
  if (promo.gratis.length) partes.push(`Puedes sumar que además tiene ${unidos(promo.gratis.map((g) => `«${g}»`), "y")}.`);
  partes.push(
    "Invítalo a agendar la visita (local y día) y llama notificar_vendedor UNA VEZ con el resumen (servicio y vehículo) "
    + "para que el asesor le dé seguimiento.",
  );
  return partes.join(" ");
}

/** La orden de derivar sin aviso todavía, en su versión de temporada. */
export const ORDEN_DE_DERIVAR_SERVICIO_DE_TEMPORADA =
  "SERVICIO EN PROMOCIÓN SIN DERIVAR (fuente determinística): llama notificar_vendedor UNA VEZ en este turno "
  + "con el resumen (servicio, vehículo y lo que preguntó). En el texto SÍ contestas con la promo y el precio de los "
  + "hechos; el asesor confirma el aceite y la visita. No lo interrogues.";

// ===========================================================================
// «¿Tienen promociones?»: la respuesta corta
// ===========================================================================

/**
 * Las promos en dos líneas, para quien pregunta si hay promociones o por el
 * Black Friday. Sin «¿»/«¡» de apertura, sin viñetas ni negritas: es un
 * mensaje de WhatsApp de una persona, no un folleto. Null si no corre.
 */
export function resumenDeLaPromocion(opciones: OpcionesDeTemporada = {}): string | null {
  const promo = vigente(opciones);
  if (!promo) return null;
  const ahora = opciones.ahora ?? new Date();
  const partes: string[] = [];
  if (promo.segundaLlanta) {
    partes.push(
      `${promo.segundaLlanta.porcentaje} % de descuento en la segunda llanta `
      + `${unidos(promo.segundaLlanta.marcas.map(marcaEnPalabras), "o")}`,
    );
  }
  const servicios = serviciosEnPromocion(promo, ahora);
  if (servicios.length) {
    const nombres = nombresDeServicios(promo).map((n) => (/^[A-Z]{2,}/.test(n) ? n : n.toLowerCase()));
    partes.push(`${servicios[0].porcentaje} % en ${unidos(nombres, "y")}`);
  }
  const productos = productosEnPromocion(promo, ahora);
  if (productos.length && promo.productos) partes.push(`${productos[0].porcentaje} % en el ${promo.productos.categoria}`);
  for (const regalo of promo.gratis) partes.push(regalo.charAt(0).toLowerCase() + regalo.slice(1).replace(/\bGRATIS\b/, "gratis"));
  return `Sí, hasta el ${hastaEnPalabras(promo)} tenemos ${promo.nombre}: ${unidos(partes, "y")}.`;
}

/**
 * ¿Pregunta por UN servicio o por el aceite («¿la alineación entra en la
 * promo?»)? Entonces no va el resumen: esa pregunta la contesta el vendedor
 * con su orden del turno, y al que compra llantas el resumen le diría «50 % en
 * alineación» cuando la suya va incluida.
 */
export function nombraUnServicioDeLaPromo(texto: string | null | undefined, opciones: OpcionesDeTemporada = {}): boolean {
  const promo = vigente(opciones);
  if (!promo || !texto) return false;
  return consultaDeServicioDeTemporada([texto], {
    serviciosDeLaPromo: nombresDeServicios(promo),
    hayAceiteEnPromo: Boolean(promo.productos?.lista.length),
    incluidosConLaLlanta: [],
  }) !== null;
}

const ASENTIMIENTO_SUELTO =
  /^\s*(?:s[ií]|claro|as[ií] es|exacto|correcto|por supuesto|con gusto)[\s.!,:;]*$/iu;

/**
 * Lo que queda del borrador después de quitarle sus frases sobre la promo,
 * sin la línea que quedó en «Sí.» (simulador, 5-nov: «…revisión de 7 puntos
 * gratis.» y debajo un «Sí.» solo). El resumen ya empieza con «Sí,».
 */
export function sinAsentimientoSuelto(texto: string): string {
  return texto
    .split("\n")
    .filter((linea) => !ASENTIMIENTO_SUELTO.test(linea))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+/, "");
}

/** ¿El resumen ya salió en este ciclo? Lo reconoce por su arranque. */
export function yaSalioElResumenDeLaPromocion(
  mensajesDelBot: readonly (string | null | undefined)[],
  opciones: OpcionesDeTemporada = {},
): boolean {
  const promo = vigente(opciones);
  if (!promo) return false;
  const huella = `tenemos ${promo.nombre}:`.toLowerCase();
  return mensajesDelBot.some((m) => Boolean(m) && m!.toLowerCase().includes(huella));
}
