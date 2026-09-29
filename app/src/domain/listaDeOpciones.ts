/**
 * LA LISTA ESCRITA DE LAS OPCIONES, CON PRECIO.
 *
 * Familia: «el cliente vio la imagen de opciones y nunca vio un precio escrito;
 * el bot y sus seguimientos siguen preguntando qué prioriza». Unos 25 chats en
 * una semana (caso +593 99 571 0785, D-Max 255/70R16): el cliente escribió
 * «¿qué precio tiene?», llegó la lámina con tres tarjetas y el menú
 * «1) Costo 2) Equilibrio 3) Premium», y de ahí en adelante ni el turno ni los
 * seguimientos automáticos le dijeron un número: le repitieron «¿qué prioriza:
 * duración, comodidad o precio?». Preguntar el criterio a quien pidió el precio
 * es devolverle su pregunta.
 *
 * La lista y la pregunta viven AQUÍ, en una sola fuente pura, y de aquí las
 * leen los tres que las necesitan: el texto que acompaña la lámina
 * (`buildCierreOpciones`), los seguimientos (`followUpMessages`) y los hechos
 * del guardián — que si no ven estas cifras, las borra.
 *
 * El orden es de MENOR a MAYOR precio a propósito: así «la 1 / la 2 / la 3» que
 * escribe el cliente coincide con Costo / Equilibrio / Premium, que es lo que
 * `respuestaDePreferencia` ya entiende por «1», «2» y «3».
 */

export interface OpcionConPrecio {
  /** «KENDA KR20» — marca y modelo, tal como sale en la lámina. */
  nombre: string;
  /** Precio unitario con IVA, el mismo que imprime la lámina y firma la cotización. */
  precio: number;
  /** Para deduplicar (tres escalones con el mismo código son una sola opción). */
  codigo?: string | null;
}

export interface LineaDeLista {
  n: number;
  nombre: string;
  precio: number;
  total: number;
}

const dinero = (v: number) => `$${v.toFixed(2)}`;
const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * Las opciones ordenadas de menor a mayor precio y con el total del juego.
 * `null` si no hay dos o tres opciones con precio: con una sola no hay nada
 * que elegir (esa ruta es otra) y sin precio no hay lista que valga.
 */
export function armarLista(
  opciones: readonly OpcionConPrecio[],
  cantidad: number,
): LineaDeLista[] | null {
  const vistos = new Set<string>();
  const unicas = opciones.filter((o) => {
    const llave = (o.codigo ?? o.nombre).toLowerCase();
    if (vistos.has(llave)) return false;
    vistos.add(llave);
    return true;
  });
  if (unicas.length < 2 || unicas.length > 3) return null;
  if (unicas.some((o) => !Number.isFinite(o.precio) || o.precio <= 0)) return null;
  const c = Number.isInteger(cantidad) && cantidad >= 1 ? cantidad : 4;
  return [...unicas]
    .sort((a, b) => a.precio - b.precio)
    .map((o, i) => ({
      n: i + 1,
      nombre: o.nombre.trim(),
      precio: centavos(o.precio),
      total: centavos(o.precio * c),
    }));
}

/** `1 · KENDA KR20 — $80.50 c/u · 4 = $322.00` */
export function lineaDeLista(l: LineaDeLista, cantidad: number): string {
  return `${l.n} · ${l.nombre} — ${dinero(l.precio)} c/u · ${cantidad} = ${dinero(l.total)}`;
}

/** «¿Le cotizo la 1, la 2 o la 3?» — o «la 1 o la 2» con dos. */
export function preguntaDeLaLista(cuantas: number): string {
  const numeros = Array.from({ length: cuantas }, (_, i) => `la ${i + 1}`);
  const cola = numeros.pop();
  return `¿Le cotizo ${numeros.length ? `${numeros.join(", ")} o ` : ""}${cola}?`;
}

/** El bloque completo: una línea por opción y UNA pregunta al final. */
export function textoDeLaLista(lista: readonly LineaDeLista[], cantidad: number): string {
  return [
    ...lista.map((l) => lineaDeLista(l, cantidad)),
    "",
    preguntaDeLaLista(lista.length),
  ].join("\n");
}

/** La lista tal como el cliente la vio, desde lo que la pieza dejó guardado. */
export function listaDeLaPieza(
  metadata: { escalones?: unknown; cantidad?: unknown } | null | undefined,
): { lista: LineaDeLista[]; cantidad: number } | null {
  const esc = metadata?.escalones as
    Record<string, { codigo?: string; nombre?: string; precio_con_iva?: number } | null> | null | undefined;
  if (!esc) return null;
  const opciones: OpcionConPrecio[] = ["economica", "equilibrada", "premium"]
    .map((k) => esc[k])
    .filter((o): o is NonNullable<typeof o> => Boolean(o?.nombre) && Number.isFinite(Number(o?.precio_con_iva)))
    .map((o) => ({ nombre: o.nombre!, precio: Number(o.precio_con_iva), codigo: o.codigo ?? null }));
  const cantidad = Number.isInteger(metadata?.cantidad) && Number(metadata?.cantidad) >= 1
    ? Number(metadata?.cantidad)
    : 4;
  const lista = armarLista(opciones, cantidad);
  return lista ? { lista, cantidad } : null;
}

/**
 * El hecho para el guardián. Sin él, el revisor no encuentra los totales «4 = $X»
 * en ninguna cotización ni en el catálogo y los borra por `precio_incorrecto`, y
 * la pregunta «¿Le cotizo la 1, la 2 o la 3?» le parece un permiso de más.
 */
export function hechoDeLaLista(lista: readonly LineaDeLista[], cantidad: number): string {
  return `LISTA DE OPCIONES CON PRECIOS EN PANTALLA (fuente determinística, salió con la lámina): ${
    lista.map((l) => lineaDeLista(l, cantidad)).join(" | ")
  }. Cada total es unitario × ${cantidad}, ya calculado: son datos duros, el bot PUEDE decirlos y NO se corrigen. `
    + `Cerrar con «${preguntaDeLaLista(lista.length)}» es la pregunta correcta de ese turno (elegir entre las opciones, NO pedir permiso por la cantidad): `
    + "se conserva y NO es pregunta_de_mas. Lo que sí está prohibido es volver a preguntar qué prioriza el cliente.";
}
