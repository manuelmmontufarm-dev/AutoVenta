/**
 * La recomendada se reelige según el uso que el cliente acaba de contar.
 *
 * Manuel, 1-sep-2026: la ruta directa `recomendarConLaPieza` entregaba la
 * recomendada que la pieza guardó al salir — elegida por el modelo ANTES de
 * saber para qué la quería el cliente. En el simulador recomendó la Kenda
 * «de precio intermedio» a quien acababa de decir «que se adhiera al
 * pavimento». Acá el uso declarado se traduce a un orden de tipos (la tabla
 * de tipos de Depot: H/T para asfalto, A/T para mixto, M/T para lodo…) y se
 * elige, de las opciones que el cliente YA tiene en pantalla, la que mejor
 * calza. Nunca se agrega una opción nueva: la pieza es la misma.
 *
 * Puro, sin base ni catálogo: recibe los tipos ya resueltos.
 */

export type UsoDeclarado = "agarre" | "pavimento" | "mixto" | "tierra" | "lodo" | "carga";

const normalizar = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Qué uso contó el cliente. El más exigente manda si nombra varios («ciudad
 * y a veces finca» es mixto, no pavimento).
 */
export function usoDeclarado(texto: string): UsoDeclarado | null {
  const n = normalizar(texto ?? "");
  if (/\b(?:lodo|barro|cantera|trocha|mina|mineria|obra)\b/.test(n)) return "lodo";
  if (/\b(?:ripio|lastre|piedra|tierra|destapad\w*|monta[nñ]a|finca|campo|oriente)\b/.test(n)) return "tierra";
  if (/\b(?:mixto|todo\s?terreno|doble\s+proposito|4x4)\b/.test(n)) return "mixto";
  if (/\b(?:carga|reparto|trabajo|pesado|camion)\b/.test(n)) return "carga";
  if (/\b(?:agarre|adhier\w*|adier\w*|adherencia|derrap\w*|mojado|lluvia|frenad\w*)\b/.test(n)) return "agarre";
  if (/\b(?:pavimento|asfalto|carretera|ciudad|autopista|urbano|viaj\w*)\b/.test(n)) return "pavimento";
  return null;
}

/** Orden de tipos por uso: el primero que aparezca en la pieza gana. */
const TIPOS_POR_USO: Record<UsoDeclarado, string[]> = {
  agarre: ["TURISMO UHP", "TURISMO", "TURISMO SUV", "H/T", "A/T"],
  pavimento: ["H/T", "TURISMO", "TURISMO SUV", "TURISMO UHP", "A/T"],
  mixto: ["A/T", "R/T", "H/T", "M/T"],
  tierra: ["R/T", "A/T", "M/T"],
  lodo: ["M/T", "R/T", "A/T"],
  carga: ["COMERCIAL", "H/T", "A/T"],
};

const MOTIVO_POR_USO: Record<UsoDeclarado, string> = {
  agarre: "para agarre y frenado en pavimento es la de mejor desempeño de las que le mostré",
  pavimento: "para ciudad y carretera es la de mejor confort y duración de las que le mostré",
  mixto: "para uso mixto es la que mejor combina asfalto y tierra de las que le mostré",
  tierra: "para tierra y piedra es la más robusta de las que le mostré",
  lodo: "para lodo es la de mayor tracción de las que le mostré",
  carga: "para carga y trabajo es la de mayor capacidad de las que le mostré",
};

export interface OpcionConTipo {
  codigo: string;
  /** Tipo del catálogo de Depot (H/T, A/T, TURISMO…); null si no se sabe. */
  tipo: string | null;
  precioConIva: number | null;
}

/**
 * De las opciones en pantalla, la que mejor calza con el uso. Empates dentro
 * del mismo tipo: la recomendada original si está entre ellas; si no, la más
 * cara para «agarre» (el cliente pide desempeño) y la del medio para el resto.
 * Si ninguna tiene tipo conocido, null: se queda la recomendada original.
 */
export function elegirRecomendadaPorUso(
  uso: UsoDeclarado,
  opciones: readonly OpcionConTipo[],
  recomendadaOriginal: string | null,
): { codigo: string; motivo: string } | null {
  const orden = TIPOS_POR_USO[uso];
  const conTipo = opciones.filter((o) => o.tipo && orden.includes(o.tipo));
  if (!conTipo.length) return null;
  const mejorIndice = Math.min(...conTipo.map((o) => orden.indexOf(o.tipo!)));
  const empatadas = conTipo.filter((o) => orden.indexOf(o.tipo!) === mejorIndice);
  const motivo = MOTIVO_POR_USO[uso];
  const original = empatadas.find((o) => o.codigo === recomendadaOriginal);
  if (original) return { codigo: original.codigo, motivo };
  const porPrecio = [...empatadas].sort((a, b) => (b.precioConIva ?? 0) - (a.precioConIva ?? 0));
  const elegida = uso === "agarre" ? porPrecio[0] : porPrecio[Math.floor((porPrecio.length - 1) / 2)];
  return { codigo: elegida.codigo, motivo };
}
