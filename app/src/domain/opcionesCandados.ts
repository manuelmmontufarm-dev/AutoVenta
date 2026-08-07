/**
 * Candados deterministas de la pieza de opciones.
 *
 * Nacen de dos fallas reales del 6-ago-2026 que el dueño vio en producción:
 *  · Tickets 1288 y 1415: el bot reenvió LA MISMA pieza de opciones (misma
 *    medida) hasta 4 veces en la misma conversación. El cliente ya la tenía en
 *    pantalla; lo que pedía era precio, no otra imagen.
 *  · Ticket 1286: el cliente pidió «265/70/17 AT» y el bot mandó un M/T y una
 *    económica sin tipo verificado — dos de tres opciones no eran del tipo pedido.
 *
 * La lógica vive aquí y no en tools.ts porque es pura (sin base ni catálogo) y
 * así se puede probar sin levantar nada.
 */
import { normalizarTipo } from "./tireTypes.js";

/** Ventana en la que se considera que el cliente todavía tiene la pieza a mano. */
export const MINUTOS_PIEZA_VIGENTE = 120;

/** El cliente dice explícitamente que no le llegó o que la quiere de nuevo. */
const PIDE_REENVIO = /de nuevo|otra vez|reenv[ií]|no me lleg|no las veo|mand[ae]me?las/i;

/**
 * Tokens de tipo tal como los escribe la gente. `normalizarTipo` resuelve
 * "at"/"a/t"/"all terrain", pero devuelve "" para el español coloquial
 * ("todo terreno", "lodo"), que es justo como escriben los clientes de Quito.
 */
const SINONIMOS_TIPO: Array<[RegExp, string]> = [
  [/^(todo\s?terreno|todoterreno|all\s?terrain|a\s?\/?\s?t)$/i, "A/T"],
  [/^(mud(\s?terrain)?|lodo|m\s?\/?\s?t)$/i, "M/T"],
  [/^(h\s?\/?\s?t|highway)$/i, "H/T"],
  [/^(r\s?\/?\s?t|rugged(\s?terrain)?)$/i, "R/T"],
];

const TOKEN_TIPO =
  /\b(a\/?t|m\/?t|h\/?t|r\/?t|todo\s?terreno|todoterreno|all\s?terrain|mud|lodo)\b/gi;

/** Un token suelto → clave canónica de tipo ("A/T", "M/T"…) o null. */
export function tipoDeToken(token: string): string | null {
  for (const [patron, tipo] of SINONIMOS_TIPO) if (patron.test(token.trim())) return tipo;
  const normalizado = normalizarTipo(token);
  return normalizado || null;
}

/**
 * Último tipo que pidió el cliente. `textos` viene ordenado del más reciente al
 * más viejo (igual que el `order by created_at desc` de la consulta), así que el
 * primer token que aparece manda: si cambió de opinión, vale lo último dicho.
 */
export function tipoSolicitadoEn(textos: readonly string[]): string | null {
  for (const texto of textos) {
    if (!texto) continue;
    const tokens = texto.match(TOKEN_TIPO);
    if (!tokens) continue;
    // Dentro de un mismo mensaje, el último token es el que califica la medida
    // ("265/70/17 AT"), no el primero.
    for (const token of [...tokens].reverse()) {
      const tipo = tipoDeToken(token);
      if (tipo) return tipo;
    }
  }
  return null;
}

/** "265/75R16" y "265/75 r16" son la misma medida para comparar. */
export function mismaMedida(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const limpiar = (s: string) => s.trim().toUpperCase().replace(/[\s./-]/g, "");
  return limpiar(a) === limpiar(b);
}

/** Medida de un caption viejo que no guardó sizeLabel en metadata. */
export function medidaDesdeContenido(content: string | null | undefined): string | null {
  const m = content?.match(/ en (\S+)/);
  return m ? m[1] : null;
}

/**
 * ¿Hay que bloquear el reenvío de la pieza de opciones?
 * Solo si ya salió una de la MISMA medida, sigue vigente, y el cliente no está
 * pidiendo explícitamente que se la vuelvan a mandar.
 */
export function debeBloquearReenvio(
  previo: { sizeLabel: string | null; minutos: number } | null,
  sizeActual: string | null,
  textoCliente: string,
): boolean {
  if (!previo) return false;
  if (previo.minutos >= MINUTOS_PIEZA_VIGENTE) return false;
  if (PIDE_REENVIO.test(textoCliente ?? "")) return false;
  return mismaMedida(previo.sizeLabel, sizeActual);
}
