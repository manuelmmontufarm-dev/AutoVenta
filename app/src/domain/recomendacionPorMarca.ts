/**
 * QUÉ LLANTAS SE MUESTRAN PRIMERO, POR MARCA (Competimotor, reunión 18-nov-2026).
 *
 * Venden unas 45 marcas y hasta hoy el bot elegía las tres de la lámina por
 * precio. El cliente pidió (acta `docs/reuniones/2026-11-18-competimotor-cierre.md`,
 * min. 00:00–01:46):
 *
 *  1. La PRIMERA lámina de una medida: sus marcas de mayor margen y con garantía
 *     (Falken, Winrun, Kenda), una opción por marca, MÁS una opción extra: la de
 *     MAYOR INVENTARIO en esa medida entre las demás marcas. Esa cuarta cambia
 *     sola cada día porque el stock llega con el Excel diario de Fénix.
 *  2. Si el cliente pide MÁS («qué más tiene», «otra marca», «algo más barato»):
 *     el resto de lo que hay en esa medida, con un tope de ~10 opciones en total.
 *
 * Es una selección DETERMINISTA sobre el catálogo cargado: el modelo recibe las
 * opciones ya elegidas y `preparar_opciones` las vuelve a calcular con estas
 * mismas funciones, así que el modelo no puede cambiar el conjunto.
 *
 * La regla es de ESE cliente: vive en su política (`politica.recomendacionPorMarca`).
 * Sin ella (Depot) nada de esto corre y la escalera de siempre queda idéntica.
 *
 * Lo que este módulo NO decide (ya tiene dueño):
 *  · Cuánto stock alcanza: quien llama filtra ANTES con `opcionesQueAlcanzan`
 *    (la regla de siempre: con menos unidades que las pedidas, no se ofrece).
 *  · El tipo pedido o el uso declarado: quien llama filtra ANTES.
 *  · El orden de la lámina y de la lista: de menor a mayor precio (`ordenDeLaLista`).
 */
import type { ReglaDeRecomendacion } from "../negocio/politica.js";

export type { ReglaDeRecomendacion } from "../negocio/politica.js";

/** Lo mínimo que hace falta de una llanta para elegirla. */
export interface LlantaElegible {
  code: string;
  brand: string;
  stock: number;
  minimumPriceWithTax: number;
}

const marcaDe = (p: { brand: string }) => p.brand.trim().toUpperCase();

/**
 * Más unidades primero; empate, la más barata; empate, el código (para que el
 * resultado no dependa del orden en que llegó el Excel).
 */
function porInventario<T extends LlantaElegible>(a: T, b: T): number {
  if (b.stock !== a.stock) return b.stock - a.stock;
  if (a.minimumPriceWithTax !== b.minimumPriceWithTax) return a.minimumPriceWithTax - b.minimumPriceWithTax;
  return a.code.localeCompare(b.code);
}

/**
 * UNA opción por marca: el modelo con MÁS stock en la medida (empate: el más
 * barato). Se eligió el stock y no el precio medio porque es el mismo criterio
 * de la cuarta opción (el cliente quiere mover inventario), no depende de
 * cuántos modelos haya y es el que más probablemente completa el juego.
 */
function mejorDeLaMarca<T extends LlantaElegible>(productos: readonly T[], marca: string): T | null {
  return [...productos].filter((p) => marcaDe(p) === marca).sort(porInventario)[0] ?? null;
}

/**
 * La primera lámina: una por cada marca de la casa que tenga lo pedido, en el
 * orden de la política, y después las extras de mayor inventario entre las
 * DEMÁS marcas (una por marca).
 *
 * Una marca de la casa sin stock en esa medida no se nombra y su lugar NO se
 * rellena: la lámina sale con menos opciones. «Qué más tiene» trae el resto.
 */
export function primeraRecomendacion<T extends LlantaElegible>(vendibles: readonly T[], regla: ReglaDeRecomendacion): T[] {
  const casa = new Set(regla.marcasPrimero.map((m) => m.toUpperCase()));
  const deLaCasa = regla.marcasPrimero
    .map((m) => mejorDeLaMarca(vendibles, m.toUpperCase()))
    .filter((p): p is T => p !== null);
  const extras: T[] = [];
  const marcasExtra = new Set<string>();
  for (const p of [...vendibles].filter((x) => !casa.has(marcaDe(x))).sort(porInventario)) {
    if (extras.length >= regla.extrasPorInventario) break;
    if (marcasExtra.has(marcaDe(p))) continue;
    marcasExtra.add(marcaDe(p));
    extras.push(p);
  }
  return [...deLaCasa, ...extras];
}

/**
 * «Qué más tiene»: lo que el cliente todavía NO vio en esa medida, de mayor a
 * menor inventario (el mismo criterio de la cuarta), sin pasar del tope total
 * (lo ya mostrado + lo nuevo ≤ `topeConMasOpciones`) ni de lo que cabe en una
 * lámina (`porLamina`). Todas las marcas y todos los modelos entran: es «el
 * resto de lo que hay». Con «algo más barato», las más baratas primero.
 */
export function masOpciones<T extends LlantaElegible>(
  vendibles: readonly T[],
  regla: ReglaDeRecomendacion,
  yaMostrados: ReadonlySet<string>,
  orden: "inventario" | "precio" = "inventario",
): T[] {
  const vistos = new Set([...yaMostrados].map((c) => c.toLowerCase()));
  // Lo ya mostrado cuenta para el tope aunque hoy ya no alcance: el cliente lo vio.
  const cupo = Math.max(0, Math.min(regla.porLamina, regla.topeConMasOpciones - vistos.size));
  const porPrecio = (a: T, b: T) => a.minimumPriceWithTax - b.minimumPriceWithTax || porInventario(a, b);
  return vendibles
    .filter((p) => !vistos.has(p.code.toLowerCase()))
    .sort(orden === "precio" ? porPrecio : porInventario)
    .slice(0, cupo);
}

/**
 * La marca que el cliente nombró, si está ENTRE las de esa medida (palabra
 * entera: «toyo» no casa con «toyota»). Con una marca nombrada se le contesta
 * esa marca; la regla de las tres no la tapa.
 */
export function marcaNombradaEnLaMedida(texto: string | null | undefined, productos: readonly { brand: string }[]): string | null {
  const t = ` ${(texto ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, " ")} `;
  const marcas = [...new Set(productos.map(marcaDe).filter(Boolean))]
    // La más larga primero: «BF GOODRICH» antes que «GOODRICH».
    .sort((a, b) => b.length - a.length);
  return marcas.find((m) => t.includes(` ${m.replace(/[^A-Z0-9]+/g, " ").trim()} `)) ?? null;
}

/**
 * LAS MARCAS QUE EL CLIENTE RECHAZÓ EN ESTA VISITA (simulador Competimotor,
 * 18-nov, CM27): «no quiero haida, se me gastaron rapido» y después «mas
 * modelos» → la lámina nueva la arma esta regla y traía la HAIDA RUNSPIRIT; el
 * Guardián lo marcó `insiste_tras_rechazo` en las tres corridas. Lo rechazado
 * no se vuelve a ofrecer, salvo que el cliente la pida de nuevo con su nombre.
 * Lista cerrada de formas de decir que no, cada una de un mensaje real.
 */
export function marcasRechazadas(
  textosDelCliente: readonly (string | null | undefined)[],
  productos: readonly { brand: string }[],
): Set<string> {
  const marcas = [...new Set(productos.map(marcaDe).filter(Boolean))];
  const rechazadas = new Set<string>();
  for (const texto of textosDelCliente) {
    const t = (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ");
    for (const m of marcas) {
      const marca = m.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!marca) continue;
      const antes = new RegExp(
        `\\b(?:no\\s+(?:quiero|deseo|me\\s+gusta\\w*|me\\s+sirve\\w*|me\\s+interesa\\w*|me\\s+ofrezca\\w*|me\\s+de\\w*)|nada\\s+de|menos)\\s+(?:(?:la|las|el|los|una|unas|esa|esas)\\s+)?(?:marca\\s+)?${marca}\\b`,
      );
      const despues = new RegExp(`\\b${marca}\\s+no\\s+(?:gracias|me\\s+gusta\\w*|quiero|por\\s+favor)\\b`);
      if (antes.test(t) || despues.test(t)) rechazadas.add(m);
    }
  }
  return rechazadas;
}

/**
 * ¿El cliente pide ver MÁS de lo que ya tiene en pantalla? «qué más tiene»,
 * «otras opciones», «otra marca», «algo más barato», «más opciones», «qué otras
 * hay». Elegir del menú («la más barata», «la 2») NO es pedir más.
 */
export function pideMasOpciones(texto: string | null | undefined): boolean {
  const n = (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  if (!n) return false;
  if (/\bla\s+mas\s+(?:economic\w*|[bv]arat\w*|car\w*)\b/.test(n) && !/\b(?:otra|otras|unas?|algo)\b/.test(n)) return false;
  return /\bque\s+(?:mas|otras?|otros?)\b[^.?!]{0,20}\b(?:tiene[ns]?|hay|maneja[ns]?|opcion\w*|marcas?|llantas?)\b/.test(n)
    || /\bque\s+mas\s*(?:hay|tiene[ns]?)?\s*[?¿!.]*$/.test(n)
    || /\b(?:otra|otras|mas|demas)\s+(?:opcion\w*|alternativ\w*|marcas?|modelos?|llantas?)\b/.test(n)
    || /\b(?:otra|alguna|algo|unas?|otras?|tiene[ns]?|hay)\s+(?:\w+\s+){0,2}?mas\s+(?:economic\w*|[bv]arat\w*)\b/.test(n)
    || /^(?:y\s+)?(?:algo\s+)?mas\s+(?:economic\w*|[bv]arat\w*)/.test(n)
    || /\bque\s+otr[ao]s?\b/.test(n)
    || /\b(?:las|los)\s+demas\b/.test(n)
    || /\btodas?\s+las\s+(?:opcion\w*|marcas?|que\s+(?:tiene|hay))\b/.test(n);
}

/** ¿El pedido de más es «más barato»? Entonces lo nuevo va de la más barata a la más cara. */
export function pideMasBarato(texto: string | null | undefined): boolean {
  const n = (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return /\bmas\s+(?:economic\w*|[bv]arat\w*)\b/.test(n);
}

export type ModoDeRecomendacion = "primera" | "mas" | "marca";

/**
 * EL ÚNICO PUNTO DE ENTRADA (lo usan `buscar_llanta` y `preparar_opciones`):
 * qué opciones de UNA medida se muestran en este turno.
 *
 * `vendibles` = las de la medida con stock para la cantidad pedida, ya
 * filtradas por tipo o uso si los hubo. `yaMostrados` = los códigos de esa
 * medida que el cliente ya vio en este ciclo.
 */
export function recomendacionDeLaMedida<T extends LlantaElegible>(
  vendibles: readonly T[],
  regla: ReglaDeRecomendacion,
  entrada: { texto: string | null | undefined; yaMostrados?: ReadonlySet<string> },
): { modo: ModoDeRecomendacion; opciones: T[]; marca?: string } {
  const yaMostrados = entrada.yaMostrados ?? new Set<string>();
  const marca = marcaNombradaEnLaMedida(entrada.texto, vendibles);
  if (marca) {
    // La marca que pidió, todos sus modelos con stock (hasta lo que cabe en la lámina).
    const deLaMarca = vendibles.filter((p) => marcaDe(p) === marca).sort(porInventario).slice(0, regla.porLamina);
    return { modo: "marca", opciones: deLaMarca, marca };
  }
  if (yaMostrados.size && pideMasOpciones(entrada.texto)) {
    return {
      modo: "mas",
      opciones: masOpciones(vendibles, regla, yaMostrados, pideMasBarato(entrada.texto) ? "precio" : "inventario"),
    };
  }
  return { modo: "primera", opciones: primeraRecomendacion(vendibles, regla) };
}

/**
 * El escalón de cada opción DENTRO del conjunto que se muestra, por precio: la
 * más cara es «premium», la más barata «economica» y todas las del medio
 * «equilibrio». Con cuatro opciones el tercil daba DOS premium (0,0,1,2) y el
 * mismo turno decía «premium es solo la de mayor precio»: dos cosas distintas.
 * Es la misma lectura de `escalonesDeOpciones` (premium = max, económica = min).
 */
export function escalonesDelConjunto<T extends { code: string; minimumPriceWithTax: number }>(
  productos: readonly T[],
): Map<string, "premium" | "equilibrio" | "economica"> {
  const precios = productos.map((p) => p.minimumPriceWithTax);
  const max = Math.max(...precios);
  const min = Math.min(...precios);
  return new Map(productos.map((p) => [
    p.code,
    max === min ? "equilibrio" : p.minimumPriceWithTax === max ? "premium" : p.minimumPriceWithTax === min ? "economica" : "equilibrio",
  ]));
}
