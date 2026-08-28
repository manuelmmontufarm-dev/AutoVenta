import { normalizeCatalogText } from "./catalog.js";

export interface ProductoIdentificable {
  code: string;
  brand: string;
  design: string;
}

export type MotivoFrenoGuardian = "precio_nuevo" | "producto_nuevo" | "juego_incompleto";

export interface ResultadoFrenoGuardian {
  texto: string;
  bloqueado: boolean;
  motivos: MotivoFrenoGuardian[];
}

function contieneFrase(textoNormalizado: string, frase: string): boolean {
  const termino = normalizeCatalogText(frase);
  return termino.length > 0 && ` ${textoNormalizado} `.includes(` ${termino} `);
}

/**
 * ¿Este producto del catálogo está nombrado en el texto?
 *
 * El diseño cuenta solo desde cuatro caracteres compactos: modelos como KR20
 * sí identifican una llanta; un diseño corto como «A/T» es lenguaje común y
 * marcarlo solo llenaría el candado de falsos positivos.
 */
export function mencionaProducto(texto: string, producto: ProductoIdentificable): boolean {
  const normalizado = normalizeCatalogText(texto);
  const diseno = normalizeCatalogText(producto.design);
  const codigo = normalizeCatalogText(producto.code);
  const compacto = (valor: string): string => valor.replace(/[^a-z0-9]/g, "");
  return contieneFrase(normalizado, `${producto.brand} ${producto.design}`)
    || (compacto(diseno).length >= 4 && contieneFrase(normalizado, diseno))
    || (compacto(codigo).length >= 4 && contieneFrase(normalizado, codigo));
}

function tienePrecio(texto: string): boolean {
  return /\$\s*\d+(?:[.,]\d{1,2})?|\b\d+[.,]\d{2}\s*(?:c\s*\/\s*u|con\s+iva|d[oó]lares?)\b/i.test(texto);
}

function ofreceJuegoIncompleto(texto: string): boolean {
  const normalizado = normalizeCatalogText(texto);
  return /\b(?:tengo|hay|quedan|cuento\s+con|disponible(?:s)?|ofrezco|ofrecer\w*|cotizo|cotizar\w*|vendo|vender\w*)\b.{0,64}\b[1-3]\s+(?:llantas?|unidad(?:es)?)\b/.test(normalizado)
    || /\b[1-3]\s+(?:llantas?|unidad(?:es)?)\b.{0,64}\b(?:disponible(?:s)?|ofrezco|ofrecer\w*|cotizo|cotizar\w*|vendo|vender\w*)\b/.test(normalizado);
}

/**
 * ÚLTIMO CANDADO DEL ÁNGEL GUARDIÁN: revisar no es vender.
 *
 * Conv 11986, 27-ago-2026: el borrador era un menú sin modelos ni precios y la
 * corrección inventó una vitrina, incluida FALKEN WILDPEAK M/T a $282.10.
 * Conv 11972, la misma noche: el borrador decía que no había stock vendible y
 * la corrección ofreció 1 KENDA KR20 a $82.42. El catálogo era un hecho duro
 * para AUDITAR; el guardián lo convirtió en permiso para vender por su cuenta.
 *
 * La rúbrica intenta prevenirlo, pero quien reescribe es una IA. Este candado
 * corre después: si la corrección agrega un precio donde no había ninguno, un
 * producto que el borrador no nombraba o una oferta parcial de 1–3 unidades,
 * gana el borrador original. No se intenta «arreglar la corrección»: eso sería
 * inventar una tercera redacción sobre dinero real.
 */
export function frenarHechosNuevosDelGuardian(
  borrador: string,
  correccion: string,
  productos: readonly ProductoIdentificable[],
): ResultadoFrenoGuardian {
  if (correccion.trim() === borrador.trim()) {
    return { texto: correccion, bloqueado: false, motivos: [] };
  }

  const motivos: MotivoFrenoGuardian[] = [];
  if (!tienePrecio(borrador) && tienePrecio(correccion)) motivos.push("precio_nuevo");

  const productoNuevo = productos.some(
    (producto) => mencionaProducto(correccion, producto) && !mencionaProducto(borrador, producto),
  );
  if (productoNuevo) motivos.push("producto_nuevo");
  if (ofreceJuegoIncompleto(correccion)) motivos.push("juego_incompleto");

  return motivos.length
    ? { texto: borrador, bloqueado: true, motivos }
    : { texto: correccion, bloqueado: false, motivos: [] };
}
