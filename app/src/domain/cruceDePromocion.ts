/**
 * CRUCE DE UNA LISTA DE PROMOCIÓN CON EL INVENTARIO — puro, sin base.
 *
 * Competimotor, 20-nov-2026: Carlos Romero mandó «LLANTAS BLACK FRIDAY.xlsx»
 * con una fila por llanta («185/65R14 · TOWNHALL TH161 · $42»). La lista la
 * escribe una persona: la medida se hereda de la fila de arriba, la marca
 * viene con tipeos («LINLGLONG») y el modelo a medias («KENDA 608», «FALKEN
 * AT»). Para que el bot cotice ese precio hay que saber a QUÉ código de Fénix
 * corresponde cada fila, y Manuel fue claro: «no hay cómo cagarla con los
 * precios». Por eso este cruce NO ADIVINA:
 *
 *   - la medida tiene que ser la misma (canónica, la del bot);
 *   - la marca tiene que ser la misma (o un tipeo listado a mano en `ALIAS`);
 *   - cada palabra del modelo tiene que estar en el nombre del artículo;
 *   - y tiene que quedar UNA sola llanta. Dos o más es «ambigua» y cero es «sin
 *     artículo»: las dos van a la lista de «sin cruzar», que lee una persona.
 *
 * Una llanta que dos filas reclaman tampoco cruza (no se sabe cuál precio vale).
 */
import { medidaCanonica } from "./tireSize.js";

/** Tipeos de marca de la lista de Black Friday (20-nov) → la marca del inventario. */
export const ALIAS_DE_MARCA: Record<string, string> = {
  LINLONG: "LINGLONG",
  LINLGLONG: "LINGLONG",
};

export interface FilaDePromocion {
  /** Fila del Excel, para poder ir a mirarla. */
  fila: number;
  seccion: string;
  /** La medida tal como quedó (heredada si la celda estaba vacía). */
  medida: string;
  /** «TOWNHALL TH161»: marca y modelo, como lo escribieron. */
  texto: string;
  /** El precio de la promoción por llanta, tal cual viene. */
  precio: number;
}

export interface ArticuloParaCruzar {
  code: string;
  name: string;
  brand: string;
  sizeLabel: string | null;
}

export type ResultadoDelCruce<A extends ArticuloParaCruzar> =
  | { fila: FilaDePromocion; estado: "cruzo"; articulo: A; medidaCanonica: string; aliasDeMarca: string | null }
  | {
      fila: FilaDePromocion;
      estado: "sin_cruzar";
      motivo: "medida_no_reconocida" | "sin_marca_en_la_medida" | "sin_articulo" | "ambigua" | "codigo_repetido";
      detalle: string;
      candidatos: A[];
      medidaCanonica: string | null;
    };

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Las palabras de un nombre como se comparan: mayúsculas, sin tildes, «A/T» =
 * «AT», «TH-161» = «TH161». La medida y lo que no tiene letras ni números sale.
 */
export function palabrasDelNombre(texto: string): string[] {
  return sinTildes(texto.toUpperCase())
    .replace(/\b([AMRH])\/T\b/g, "$1T")
    .replace(/(\p{L})-(\d)/gu, "$1$2")
    .split(/[^A-Z0-9.]+/)
    .map((p) => p.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
}

/** «700R15» (como la escriben) → «7.00R15» (como la lee el bot). Lo demás, tal cual. */
export function medidaDeLaLista(medida: string): string | null {
  const limpia = medida.trim().toUpperCase().replace(/\s+/g, "");
  const camion = /^(\d)(\d{2})R(\d{2})$/.exec(limpia);
  return medidaCanonica(camion ? `${camion[1]}.${camion[2]}R${camion[3]}` : limpia);
}

/**
 * ¿Esta palabra del modelo está en el nombre? Igual, o una de estas tres:
 *  - el nombre la trae con una letra de versión al final («ZE310» → «ZE310R»),
 *    solo si la palabra tiene 4+ caracteres y algún número;
 *  - solo el número del modelo («608» → «KR608»), si son 3+ dígitos;
 *  - partida en dos palabras seguidas («HT2» → «HT 2»).
 */
export function palabraEnElNombre(palabra: string, nombre: readonly string[]): boolean {
  if (nombre.includes(palabra)) return true;
  const conNumero = /\d/.test(palabra);
  if (conNumero && palabra.length >= 4 && nombre.some((n) => n.length === palabra.length + 1 && n.startsWith(palabra) && /[A-Z]$/.test(n))) return true;
  if (/^\d{3,}$/.test(palabra) && nombre.some((n) => new RegExp(`^[A-Z]{1,3}${palabra}$`).test(n))) return true;
  for (let i = 0; i + 1 < nombre.length; i++) if (nombre[i] + nombre[i + 1] === palabra) return true;
  return false;
}

/** Cruza cada fila de la lista con UN artículo, o la deja en «sin cruzar» con el porqué. */
export function cruzarPromocion<A extends ArticuloParaCruzar>(
  filas: readonly FilaDePromocion[],
  articulos: readonly A[],
): ResultadoDelCruce<A>[] {
  const primero = filas.map((fila): ResultadoDelCruce<A> => {
    const canon = medidaDeLaLista(fila.medida);
    if (!canon) {
      return { fila, estado: "sin_cruzar", motivo: "medida_no_reconocida", detalle: `«${fila.medida}» no se lee como medida`, candidatos: [], medidaCanonica: null };
    }
    const [marcaEscrita, ...modelo] = palabrasDelNombre(fila.texto);
    const alias = ALIAS_DE_MARCA[marcaEscrita] ?? null;
    const marca = alias ?? marcaEscrita;
    const enLaMedida = articulos.filter((a) => a.sizeLabel === canon);
    const deLaMarca = enLaMedida.filter((a) => palabrasDelNombre(a.brand)[0] === marca);
    if (!deLaMarca.length) {
      return {
        fila, estado: "sin_cruzar", motivo: "sin_marca_en_la_medida",
        detalle: `no hay ${marca} en ${canon} (en esa medida hay: ${[...new Set(enLaMedida.map((a) => a.brand))].join(", ") || "nada"})`,
        candidatos: enLaMedida, medidaCanonica: canon,
      };
    }
    const calzan = deLaMarca.filter((a) => {
      const nombre = palabrasDelNombre(a.name);
      return modelo.every((p) => palabraEnElNombre(p, nombre));
    });
    if (calzan.length === 1) return { fila, estado: "cruzo", articulo: calzan[0], medidaCanonica: canon, aliasDeMarca: alias ? marcaEscrita : null };
    if (!calzan.length) {
      return {
        fila, estado: "sin_cruzar", motivo: "sin_articulo",
        detalle: `ningún ${marca} ${canon} trae «${modelo.join(" ")}» (hay: ${deLaMarca.map((a) => a.name).join(" | ")})`,
        candidatos: deLaMarca, medidaCanonica: canon,
      };
    }
    return {
      fila, estado: "sin_cruzar", motivo: "ambigua",
      detalle: `«${fila.texto}» calza con ${calzan.length}: ${calzan.map((a) => a.name).join(" | ")}`,
      candidatos: calzan, medidaCanonica: canon,
    };
  });
  // Un código que reclaman dos filas no se sabe con qué precio va: ninguna cruza.
  const cuenta = new Map<string, number>();
  for (const r of primero) if (r.estado === "cruzo") cuenta.set(r.articulo.code, (cuenta.get(r.articulo.code) ?? 0) + 1);
  return primero.map((r) => r.estado === "cruzo" && (cuenta.get(r.articulo.code) ?? 0) > 1
    ? {
        fila: r.fila, estado: "sin_cruzar", motivo: "codigo_repetido",
        detalle: `${r.articulo.name} lo reclaman ${cuenta.get(r.articulo.code)} filas de la lista`,
        candidatos: [r.articulo], medidaCanonica: r.medidaCanonica,
      }
    : r);
}

/**
 * Las filas de la hoja tal como vienen (columna B medida, C marca/modelo, H
 * precio). La medida vacía hereda la de arriba; «R13» solo, «MEDIDAS» y los
 * títulos no son llantas. Una fila con marca y sin precio numérico no entra.
 */
export function filasDeLaHoja(
  celdas: ReadonlyArray<{ fila: number; b: unknown; c: unknown; h: unknown }>,
): FilaDePromocion[] {
  const out: FilaDePromocion[] = [];
  let medida = "";
  let seccion = "";
  for (const { fila, b, c, h } of celdas) {
    const tb = String(b ?? "").trim();
    const tc = String(c ?? "").trim();
    if (/^MEDIDAS$/i.test(tb)) { seccion = tc; continue; }
    if (/^R\d{2}$/i.test(tb) && !tc) continue;
    if (tb) medida = tb;
    const precio = typeof h === "number" ? h : Number(String(h ?? "").replace(/[$,\s]/g, ""));
    if (!tc || !medida || !Number.isFinite(precio) || precio <= 0) continue;
    out.push({ fila, seccion, medida, texto: tc.replace(/\s+/g, " "), precio });
  }
  return out;
}
