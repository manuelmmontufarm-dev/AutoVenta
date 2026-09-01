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

/**
 * Techo de seguridad: la consulta de tools.ts ya se limita a las piezas que
 * salieron DESPUÉS del último mensaje del cliente (o sea, en este turno); un
 * turno no dura más que esto.
 *
 * Hasta el 1-sep-2026 acá había un candado de 120 minutos: «el cliente ya la
 * tiene en pantalla, PROHIBIDO reenviarla, contéstale en texto». Manuel lo
 * quitó viendo el chat de las 16:02: el cliente pidió una recomendación con la
 * medida ya confirmada, la pieza estaba bloqueada, y la recomendación salió en
 * cuatro burbujas de texto repetido. La pieza ES la respuesta; si la piden,
 * sale, aunque haya salido hace diez minutos. La ráfaga que motivó el candado
 * (31-ago, tres vitrinas seguidas) la resuelve el agrupador de entrada, que
 * mete los mensajes que llegan durante un turno en el turno siguiente.
 */
export const MINUTOS_MISMO_TURNO = 10;

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
 * Solo si la MISMA pieza acaba de salir en este mismo turno (menos de un
 * minuto) y el cliente no está diciendo que no le llegó. Fuera de eso, nunca.
 */
export function debeBloquearReenvio(
  previo: { sizeLabel: string | null; minutos: number; codes?: string[] } | null,
  sizeActual: string | null,
  textoCliente: string,
  codesActuales?: string[],
): boolean {
  if (!previo) return false;
  if (previo.minutos >= MINUTOS_MISMO_TURNO) return false;
  if (PIDE_REENVIO.test(textoCliente ?? "")) return false;
  if (previo.codes?.length && codesActuales?.length) {
    const before = [...previo.codes].map((code) => code.toLowerCase()).sort().join("|");
    const after = [...codesActuales].map((code) => code.toLowerCase()).sort().join("|");
    if (before !== after) return false;
    // Los códigos son una identidad más fuerte que el rótulo de medida. Las
    // piezas antiguas no siempre guardaron `sizeLabel`; si el mismo conjunto
    // reaparece dentro de la ventana, sigue siendo el mismo reenvío.
    return true;
  }
  return mismaMedida(previo.sizeLabel, sizeActual);
}

/**
 * El juego completo es el default comercial de Depot: cuatro.
 *
 * Joaquín, 26-ago-2026: «que ya no dé de opción si tiene menos de 4 llantas, y
 * que no pregunte cuántas quiere sino que solo cotice 4 de una — nos ahorramos
 * un mensaje; si responden "no, yo quiero 8, 2, 3", ahí se vuelve a mandar con
 * el número que dicen».
 */
export const JUEGO_COMPLETO = 4;

/**
 * Las opciones que se pueden ENSEÑAR: solo las que alcanzan para la compra.
 *
 * Enseñar una llanta de la que hay dos, cuando el cliente viene por cuatro, es
 * vender un problema: elige esa, se cotiza, y el aviso de stock corto tiene que
 * salir a desdecir la pieza que acaba de verse. Es exactamente el «hay una
 * medida con UNA unidad y el bot cotiza las 4 llantas de esa unidad» del 25-ago,
 * atacado un paso antes — en la vitrina y no en la caja.
 *
 * La salida de emergencia que bajaba el listón fue retirada el 27-ago-2026.
 * Antes devolvía lo que tuviera 2–3 aunque el pedido fuera 4: la pieza lo
 * recomendaba, el cliente aceptaba y la caja recién entonces decía que no.
 * Conv 11818: recomendó KENDA KR203, preguntó «¿Le cotizo el juego de 4?», el
 * cliente dijo «Ok» y el turno siguiente negó stock. Compró en Ibarra 50 s
 * después. Una vitrina que no completa la compra no es una vitrina vendible.
 *
 * La salida anterior incluso devolvía TODO cuando no quedaba ninguna, y ahí se
 * colaba el cero. Producción, 27-ago-2026,
 * conv 11302 (Enrique Molina, 195/55R15): a las 21:01 la KENDA KR20 alcanzaba y
 * la pieza salió con ESA SOLA, correcto. Para las 14:02 el stock había bajado
 * de cuatro, el filtro quedó vacío, y la red de emergencia devolvió las tres —
 * dos rotuladas *Sin stock* en la propia imagen. Una vitrina de lo que no se
 * puede comprar. Manuel: «¿por qué mandaría eso? va en contra de toda la
 * lógica».
 *
 * El stock desfasado se escala al asesor; no se resuelve prometiéndole al
 * cliente un juego que el dato duro no completa. Si no queda ninguna, la lista
 * vuelve VACÍA a propósito y el llamador ofrece pedido o alternativa.
 */
export function opcionesQueAlcanzan<T extends { stock?: number | null }>(
  productos: readonly T[],
  cantidadPedida: number = JUEGO_COMPLETO,
): T[] {
  const minimo = Math.max(1, Math.round(cantidadPedida));
  return productos.filter((p) => Number(p.stock ?? 0) >= minimo);
}
