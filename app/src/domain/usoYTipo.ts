/**
 * DUEÑO ÚNICO de «qué TIPOS de llanta le sirven a este USO».
 *
 * Familia (semana del 21-sep-2026, 10 chats): el menú costo / equilibrio /
 * premium se armaba por PRECIO y MARCA, sin mirar para qué la quería el
 * cliente. Resultado: una Kenda KR29 (M/T, la de barro) como «la económica»
 * de quien pidió ciudad y dijo «NO todoterreno» (Traverse 245/70R17,
 * Pathfinder, «2 llantas para ciudad»); una touring para quien pidió «camino
 * mixto»; una A/T para una furgoneta. La regla 1 de `escalera-precio.json` ya
 * lo decía —«primero se define el TIPO según el uso, recién después se arma la
 * escalera de precio dentro de ese tipo»— pero solo vivía en el prompt.
 *
 * Aquí viven tres cosas, y nada de esto se copia en otro archivo:
 *   1. leer el uso de lo que escribió el cliente (`usoDeLosTextos`);
 *   2. qué tipos le sirven a cada uso (`TIPOS_POR_USO`, en orden de preferencia);
 *   3. partir una lista de productos en «los que le sirven» y «el resto», con
 *      el aviso explícito cuando hay que salirse del uso (`separarPorUso`).
 *
 * Lo que NO hace: ocultar tipos. `recorteConEscalera` sigue garantizando que
 * ningún tipo con stock desaparezca de lo que ve el modelo (conv 13645); esto
 * decide solo QUÉ SE ARMA COMO MENÚ.
 *
 * Puro: sin base ni catálogo. El tipo de cada producto lo resuelve quien llama.
 */

export type UsoDeclarado = "agarre" | "pavimento" | "mixto" | "tierra" | "lodo" | "carga";

const normalizar = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Lo que el cliente NIEGA no es su uso: «NO todoterreno», «no es para lodo».
 * Antes «NO todoterreno» contaba como mixto y el menú salía con A/T y M/T.
 */
const NEGADO =
  /\bno\s+(?:es\s+|quiero\s+|necesito\s+|busco\s+|uso\s+|voy\s+a\s+usar\s+)?(?:para\s+|de\s+)?(?:llantas?\s+)?(?:todo\s?terreno|mixto|lodo|barro|fango|4x4|tierra|off\s?road|a\s?[/-]\s?t|m\s?[/-]\s?t)\b/g;

/**
 * Qué uso contó el cliente en UN mensaje. El más exigente manda si nombra
 * varios («ciudad y a veces finca» es mixto, no pavimento).
 */
export function usoDeclarado(texto: string): UsoDeclarado | null {
  const n = normalizar(texto ?? "").replace(NEGADO, " ");
  if (/\b(?:lodo|barro|fango|pantano|pantanos\w*|pantaner\w*|cantera|trocha|mina|mineria|obra|m\s?[/-]\s?t|mud)\b/.test(n)) return "lodo";
  if (/\b(?:camino\s+mixto|caminos\s+mixtos|asfalto\s+y\s+(?:tierra|lastre|ripio))\b/.test(n)) return "mixto";
  if (/\b(?:ripio|lastre|piedra|tierra|destapad\w*|monta[nñ]a|finca|campo|oriente)\b/.test(n)) return "tierra";
  if (/\b(?:mixto|todo\s?terreno|doble\s+proposito|4x4|a\s?[/-]\s?t)\b/.test(n)) return "mixto";
  // «trabajo» a secas NO: «voy al trabajo» es ciudad. Solo el trabajo de carga.
  if (/\b(?:carga|reparto|trabajo\s+(?:pesado|duro)|pesado|camion|furgon\w*|comercial|comerciales)\b/.test(n)) return "carga";
  if (/\b(?:agarre|adhier\w*|adier\w*|adherencia|derrap\w*|mojado|lluvia|frenad\w*)\b/.test(n)) return "agarre";
  if (/\b(?:pavimento|asfalto|carretera|ciudad|calle|calles|autopista|urbano|viaj\w*|h\s?[/-]\s?t|turismo)\b/.test(n)) return "pavimento";
  return null;
}

/**
 * El uso vigente de una conversación. `textos` viene del MÁS RECIENTE al más
 * viejo (como los `order by created_at desc` de las consultas): si cambió de
 * opinión, vale lo último que dijo.
 */
export function usoDeLosTextos(textos: readonly (string | null | undefined)[]): UsoDeclarado | null {
  for (const t of textos) {
    if (!t) continue;
    const uso = usoDeclarado(t);
    if (uso) return uso;
  }
  return null;
}

/**
 * Tipos que le sirven a cada uso, del más al menos indicado (el orden también
 * lo usa `recomendacionPorUso` para elegir la recomendada).
 */
export const TIPOS_POR_USO: Record<UsoDeclarado, readonly string[]> = {
  agarre: ["TURISMO UHP", "TURISMO", "TURISMO SUV", "H/T"],
  pavimento: ["H/T", "TURISMO", "TURISMO SUV", "TURISMO UHP"],
  mixto: ["A/T", "R/T", "H/T"],
  tierra: ["R/T", "A/T", "H/T"],
  lodo: ["M/T", "R/T"],
  carga: ["COMERCIAL", "H/T"],
};

/**
 * Los tipos que SON el uso; el resto de `TIPOS_POR_USO` sirve pero solo entra
 * cuando los principales no alcanzan para un menú. Sin esto, «camino mixto»
 * recibía tres H/T porque eran las más baratas de cada escalón. Los usos que no
 * aparecen aquí no distinguen: todos sus tipos compiten (un sedán de ciudad
 * pide TURISMO, un SUV pide H/T).
 */
const PRINCIPALES: Partial<Record<UsoDeclarado, readonly string[]>> = {
  mixto: ["A/T", "R/T"],
  tierra: ["R/T", "A/T"],
  carga: ["COMERCIAL"],
};

/**
 * Tipos que NUNCA se ofrecen para ese uso, ni siquiera de relleno: una llanta
 * de barro no es «la económica» de quien maneja en ciudad.
 */
const NUNCA_PARA: Partial<Record<UsoDeclarado, readonly string[]>> = {
  agarre: ["M/T", "R/T"],
  pavimento: ["M/T", "R/T"],
  carga: ["M/T"],
};

export function tiposCompatibles(uso: UsoDeclarado | null): readonly string[] | null {
  return uso ? TIPOS_POR_USO[uso] : null;
}

const NOMBRE_DEL_USO: Record<UsoDeclarado, string> = {
  agarre: "agarre en pavimento",
  pavimento: "ciudad / carretera",
  mixto: "camino mixto",
  tierra: "camino de tierra",
  lodo: "lodo",
  carga: "carga / trabajo",
};

export interface SeparadoPorUso<T> {
  /** Los que le sirven a su uso, con o sin stock (la escalera prefiere lo disponible). */
  compatibles: T[];
  /**
   * Relleno permitido SOLO si `avisoTipo` no es null: otros tipos, sin los que
   * nunca van para ese uso. Vacío cuando los compatibles alcanzan.
   */
  otros: T[];
  /** Texto para el modelo y el guardián cuando se salió del uso. Null = sin salirse. */
  avisoTipo: string | null;
  /** La misma advertencia, en una línea para el cliente (va horneada en el mensaje). */
  avisoAlCliente: string | null;
  uso: UsoDeclarado | null;
}

/**
 * Parte los productos según el uso declarado. Con al menos DOS compatibles
 * vendibles (stock > 0) el menú se arma solo con ellos. Con menos, se completa
 * con otros tipos —menos los que nunca van para ese uso— y el aviso lo dice.
 * Sin uso declarado, todo es compatible y no hay aviso.
 */
export function separarPorUso<T extends { stock: number }>(
  productos: readonly T[],
  uso: UsoDeclarado | null,
  tipoDe: (p: T) => string | null | undefined,
): SeparadoPorUso<T> {
  if (!uso) return { compatibles: [...productos], otros: [], avisoTipo: null, avisoAlCliente: null, uso: null };
  const buenos = TIPOS_POR_USO[uso];
  const vetados = NUNCA_PARA[uso] ?? [];
  const esBueno = (p: T) => buenos.includes(tipoDe(p) ?? "");
  const vendibles = (l: readonly T[]) => l.filter((p) => p.stock > 0).length;
  // Primero los que SON el uso; si con ellos hay menú, los que solo «sirven» quedan fuera.
  const principales = PRINCIPALES[uso];
  if (principales) {
    const soloEsos = productos.filter((p) => principales.includes(tipoDe(p) ?? ""));
    if (vendibles(soloEsos) >= 2) return { compatibles: soloEsos, otros: [], avisoTipo: null, avisoAlCliente: null, uso };
  }
  const compatibles = productos.filter(esBueno);
  if (vendibles(compatibles) >= 2) {
    return { compatibles, otros: [], avisoTipo: null, avisoAlCliente: null, uso };
  }
  const resto = productos.filter((p) => !esBueno(p));
  const admitidos = resto.filter((p) => !vetados.includes(tipoDe(p) ?? ""));
  // Si solo queda lo vetado y tampoco hay compatibles, no se inventa un menú
  // vacío: se devuelve el resto tal cual, y el aviso lo dice con todas las letras.
  const otros = admitidos.length || compatibles.length ? admitidos : resto;
  const tiposOtros = [...new Set(otros.map((p) => tipoDe(p)).filter(Boolean))] as string[];
  const avisoTipo =
    `Para su uso (${NOMBRE_DEL_USO[uso]}) le sirven ${buenos.join(" / ")} y entre lo que hay solo quedan ` +
    `${compatibles.filter((p) => p.stock > 0).length} vendible(s) de esos tipos, así que se incluyó ` +
    `${tiposOtros.length ? tiposOtros.join(" / ") : "otro tipo"}. Díselo en una línea: ` +
    "«no me queda de ese tipo en su medida, esta es la más cercana»; NUNCA la presentes como el tipo que necesita.";
  const avisoAlCliente =
    `⚠️ Ojo: para ${NOMBRE_DEL_USO[uso]} lo ideal es ${buenos.join(" / ")}, pero en esta medida no me alcanza el stock de esos; ` +
    `incluí ${tiposOtros.length ? tiposOtros.join(" / ") : "otro tipo"} como la más cercana.`;
  return { compatibles, otros, avisoTipo, avisoAlCliente, uso };
}
