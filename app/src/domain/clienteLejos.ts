/**
 * «ESTÁ MUY LEJOS», «NO PUEDO IR»: el cliente dice que no puede venir aunque no
 * nombre ninguna ciudad. Fuente única del hecho (auditoría 9-nov, familia 7):
 * la leen `dondeEstaElCliente` (para no pegarle «¿A cuál local…?») y
 * `sinSeguimiento` (para no escribirle más).
 *
 *   38924 · «Está muy lejos le agradezco»
 *   39597 · «aya chuta esta lejos donde estoy yo bueno muchas gracias x su tiempo»
 *           «esq soy de bolivar esta muy aledado muchas gracias»
 *   18535 · «Muy dificel ir a Quito»
 *
 * Solo el patrón: si el MISMO mensaje sigue vendiendo («está lejos de mi casa
 * pero voy el sábado») lo decide quien llama con `mantieneLaVenta`.
 * Recibe texto ya normalizado o crudo: no distingue tildes ni mayúsculas.
 */
const normalizar = (t: string): string =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** «está (muy) lejos», «me queda lejos», «es demasiado lejos», «está muy alejado/aledado». No «no está lejos». */
const ESTA_LEJOS =
  /(?<!\bno\s)\b(?:esta|estamos|estoy|queda|me\s+queda|nos\s+queda|es|sale|me\s+sale)\s+(?:muy\s+|demasiado\s+|bastante\s+|tan\s+|re\s+|lejisimos\s+)?(?:lejos|lejisimos|alejad[oa]s?|aledad[oa]s?)\b/;

/** «no puedo ir», «no me es posible ir», «imposible ir», «(muy) difícil ir». */
const NO_PUEDE_IR =
  /\b(?:no\s+(?:puedo|podemos|podria|podriamos|alcanzo|alcanzamos)|no\s+(?:me|nos)\s+es\s+posible|imposible|dif[ií]cil|dificel|complicado)\s+(?:ir|venir|pasar|llegar|subir|viajar|acercarme|acercarnos|movilizarme)\b/;

export function diceQueEstaLejos(texto: string | null | undefined): boolean {
  return ESTA_LEJOS.test(normalizar(texto ?? ""));
}

export function diceQueNoPuedeIr(texto: string | null | undefined): boolean {
  return NO_PUEDE_IR.test(normalizar(texto ?? ""));
}
