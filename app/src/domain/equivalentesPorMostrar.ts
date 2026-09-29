/**
 * SIN STOCK EXACTO Y CON EQUIVALENTES DE VERDAD: SE MUESTRAN EN ESE TURNO.
 *
 * Verificación en vivo de la familia 1-B (28-sep, V3a): «Grand Vitara 5p, uso
 * 265/65R16», sin stock en esa medida. `buscar_llanta` devolvió la KENDA KR608
 * 245/70R16 (−0,2 % de diámetro). Una corrida llamó preparar_opciones; la otra
 * escribió «¿Le muestro las opciones equivalentes?» y retuvo la llanta. El
 * guardián lo marcó, pero su reescritura nombraba la KR608 y el freno la podó
 * como «producto nuevo»: salió el texto flojo. Mostrar o no mostrar quedaba al
 * azar del modelo.
 *
 * Un solo dueño para las tres piezas de esa regla:
 *  · QUÉ se muestra: las alternativas con stock que el juez
 *    (`domain/equivalencia.ts`) aprueba, y solo si en la medida exacta no hay
 *    nada vendible — viajan en el resultado de la herramienta en
 *    `CAMPO_EQUIVALENTES`, primero, para sobrevivir al recorte de la huella;
 *  · la OBLIGACIÓN del turno: si el modelo contesta sin preparar_opciones, el
 *    agente le da una vuelta forzada con esos códigos (`agent.ts`);
 *  · que son HECHOS del turno: el freno del guardián no las poda y el guardián
 *    las recibe en sus hechos duros.
 */
import { esEquivalente } from "./equivalencia.js";

/** El campo del resultado de la herramienta con las que hay que mostrar ya. */
export const CAMPO_EQUIVALENTES = "mostrar_equivalentes_ahora";

/** Lo mínimo para identificar la llanta, en el formato que leen el guardián y el freno. */
export interface EquivalenteAMostrar {
  code: string;
  marca: string;
  diseno: string;
  medida: string;
  precio_con_iva?: number;
}

/**
 * Las que hay que mostrar ya. Vacío si en su medida hay algo vendible (ahí la
 * respuesta es su medida) o si ninguna alternativa equivale de verdad (ahí no
 * se empuja nada: la 215/65R16 del aro no es una respuesta a una 265/65R16).
 */
export function equivalentesAMostrar(
  alternativas: readonly { code: string; brand: string; design: string; sizeLabel: string | null; stock: number; minimumPriceWithTax?: number }[],
  medidaPedida: string,
  hayStockExacto: boolean,
  tope = 3,
): EquivalenteAMostrar[] {
  if (hayStockExacto) return [];
  return alternativas
    .filter((a) => a.stock > 0 && esEquivalente(medidaPedida, a.sizeLabel))
    .slice(0, tope)
    .map((a) => ({
      code: a.code,
      marca: a.brand,
      diseno: a.design,
      medida: a.sizeLabel ?? "",
      ...(a.minimumPriceWithTax ? { precio_con_iva: Number(a.minimumPriceWithTax.toFixed(2)) } : {}),
    }));
}

/** La orden que acompaña al campo en el resultado de la herramienta. */
export function reglaDeMostrarEquivalentes(medidaPedida: string): string {
  return `OBLIGATORIO EN ESTE MISMO TURNO: en *${medidaPedida}* no hay stock exacto y las de '${CAMPO_EQUIVALENTES}' SÍ le calzan `
    + "(mismo aro, diámetro ±3 %). Llama preparar_opciones AHORA con esos códigos: la lámina ya le dice «en su medida exacta "
    + "no me queda; estas son equivalentes de su aro». PROHIBIDO preguntar «¿le muestro las opciones?» o retenerlas: "
    + "mostrarlas no necesita permiso, cotizarlas sí.";
}

function leerCampo(resultado: string): EquivalenteAMostrar[] {
  try {
    const json = JSON.parse(resultado) as Record<string, unknown>;
    const lista = json[CAMPO_EQUIVALENTES];
    return Array.isArray(lista) ? (lista as EquivalenteAMostrar[]).filter((e) => typeof e?.code === "string") : [];
  } catch {
    return [];
  }
}

/**
 * ¿Quedó pendiente mostrar equivalentes en este turno? Mira las llamadas en
 * orden: la última que trajo el campo manda, y un preparar_opciones posterior
 * la da por cumplida. Devuelve los códigos y el recordatorio para la vuelta
 * forzada, o null.
 */
export function obligacionDeMostrarEquivalentes(
  llamadas: readonly { herramienta: string; resultado: string }[],
): { codigos: string[]; recordatorio: string } | null {
  let pendientes: EquivalenteAMostrar[] = [];
  for (const llamada of llamadas) {
    if (llamada.herramienta === "preparar_opciones") {
      pendientes = [];
      continue;
    }
    const campo = leerCampo(llamada.resultado);
    if (campo.length) pendientes = campo;
  }
  if (!pendientes.length) return null;
  const codigos = pendientes.map((e) => e.code);
  return {
    codigos,
    recordatorio:
      "TE FALTÓ LA OBLIGACIÓN DEL TURNO: en la medida del cliente no hay stock exacto y la herramienta devolvió "
      + `equivalentes de verdad (${pendientes.map((e) => `${e.marca} ${e.diseno} ${e.medida}`).join(", ")}). `
      + `Llama preparar_opciones AHORA con los códigos ${codigos.join(", ")}. No escribas texto final sin la lámina `
      + "y no preguntes si las quiere ver.",
  };
}

/**
 * Las equivalentes que las herramientas devolvieron en este turno, como texto
 * que el freno del guardián reconoce (marca, diseño y `"precio_con_iva":X`).
 * Nombrarlas no es vender por su cuenta: son datos del turno.
 */
export function equivalentesDevueltos(huella: readonly { herramienta: string; resultado: string }[]): string {
  const todas = huella.flatMap((h) => extraerDelRecorte(h.resultado));
  return todas.map((e) => JSON.stringify(e) + ` ${e.marca} ${e.diseno} ${e.medida}`).join("\n");
}

/** El hecho duro para el guardián, o null si no hubo. */
export function hechoDeEquivalentesDevueltos(huella: readonly { herramienta: string; resultado: string }[]): string | null {
  const todas = huella.flatMap((h) => extraerDelRecorte(h.resultado));
  if (!todas.length) return null;
  return "EQUIVALENTES DE VERDAD DEVUELTAS ESTE TURNO (sin stock en la medida exacta; mismo aro y diámetro ±3 %): "
    + todas.map((e) => `${e.marca} ${e.diseno} ${e.medida}${e.precio_con_iva ? ` $${e.precio_con_iva.toFixed(2)}` : ""}`).join("; ")
    + ". Son datos de la herramienta, no inventos: tu corrección PUEDE nombrarlas. Un borrador que las retiene con «¿le muestro las opciones?» es **pregunta_de_mas** ALTA.";
}

/**
 * La huella del guardián corta el resultado a 500 caracteres, así que el JSON
 * puede llegar roto: se lee el campo aunque el cierre del objeto no esté.
 */
function extraerDelRecorte(resultado: string): EquivalenteAMostrar[] {
  const entero = leerCampo(resultado);
  if (entero.length) return entero;
  const inicio = resultado.indexOf(`"${CAMPO_EQUIVALENTES}":[`);
  if (inicio < 0) return [];
  const fin = resultado.indexOf("]", inicio);
  const cuerpo = resultado.slice(inicio + CAMPO_EQUIVALENTES.length + 3, fin < 0 ? undefined : fin);
  const objetos = cuerpo.match(/\{[^{}]*\}/g) ?? [];
  return objetos.flatMap((o) => {
    try {
      const e = JSON.parse(o) as EquivalenteAMostrar;
      return typeof e.code === "string" ? [e] : [];
    } catch {
      return [];
    }
  });
}
