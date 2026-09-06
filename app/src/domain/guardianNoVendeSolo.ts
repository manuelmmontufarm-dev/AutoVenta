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

/** Los importes que nombra un texto, normalizados («$111.36», «111,36 c/u» → 111.36). */
function preciosEn(texto: string): Set<string> {
  const precios = new Set<string>();
  const patron = /\$\s*(\d+(?:[.,]\d{1,2})?)|\b(\d+[.,]\d{2})\s*(?:c\s*\/\s*u|con\s+iva|d[oó]lares?)\b/gi;
  for (const m of texto.matchAll(patron)) {
    const crudo = (m[1] ?? m[2] ?? "").replace(",", ".");
    if (crudo) precios.add(Number(crudo).toFixed(2));
  }
  return precios;
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
/**
 * LO QUE YA SALIÓ EN EL CICLO NO ES UN HECHO NUEVO (auditoría 2-6 sep, familia B).
 *
 * Este candado comparaba contra el BORRADOR y nada más. Pero la plantilla de
 * seguimiento nunca nombra la llanta, y un borrador vago del modelo tampoco:
 * cada vez que el guardián concretaba «la Falken ZE310R a $111.36 que le
 * mostré» —dato que el bot ya había dicho el día anterior (conv 15193)— el
 * candado lo leía como una venta nueva, tiraba la corrección y salía el
 * borrador malo. En 4,6 días fueron 105 bloqueos, 51 sobre seguimientos, y
 * detrás de la mitad de las re-preguntas y contradicciones que vieron los
 * clientes estaba este freno.
 *
 * `yaDichoEnElCiclo` es el texto de lo que el bot ya mandó en el ciclo (con las
 * piezas de opciones y sus precios). Un producto o un importe que aparece ahí
 * no abre nada: el cliente ya lo vio. Lo que no está ni en el borrador ni en
 * el ciclo sigue frenándose igual que antes.
 */
export function frenarHechosNuevosDelGuardian(
  borrador: string,
  correccion: string,
  productos: readonly ProductoIdentificable[],
  yaDichoEnElCiclo = "",
): ResultadoFrenoGuardian {
  if (correccion.trim() === borrador.trim()) {
    return { texto: correccion, bloqueado: false, motivos: [] };
  }

  const motivos: MotivoFrenoGuardian[] = [];
  if (!tienePrecio(borrador) && tienePrecio(correccion)) {
    const conocidos = preciosEn(`${borrador}\n${yaDichoEnElCiclo}`);
    const nuevos = [...preciosEn(correccion)].filter((p) => !conocidos.has(p));
    if (nuevos.length) motivos.push("precio_nuevo");
  }

  const productoNuevo = productos.some(
    (producto) =>
      mencionaProducto(correccion, producto)
      && !mencionaProducto(borrador, producto)
      && !(yaDichoEnElCiclo && mencionaProducto(yaDichoEnElCiclo, producto)),
  );
  if (productoNuevo) motivos.push("producto_nuevo");
  if (ofreceJuegoIncompleto(correccion)) motivos.push("juego_incompleto");

  return motivos.length
    ? { texto: borrador, bloqueado: true, motivos }
    : { texto: correccion, bloqueado: false, motivos: [] };
}
