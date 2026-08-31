const normalizar = (texto: string) =>
  (texto ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// «no me gusta» y «ya no quiero» entraron el 31-ago (conv 3 c20, producción):
// el cliente escribió «esta muy ya no 185 no me gusta que otras tiene» y el
// patrón no lo reconoció — el turno siguiente le reenvió dos 185. El rechazo
// con gusto («no me gusta») pesa igual que el rechazo con calce.
const RECHAZA_POR_CALCE =
  /\b(?:muy\s+anch\w*|prefiero\s+(?:un\s+poco\s+)?mas\s+delgad\w*|prefiero\s+(?:un\s+poco\s+)?mas\s+angost\w*|roz\w*|no\s+(?:la\s+)?(?:quiero|deseo)|no\s+(?:me\s+)?gusta\w*|ya\s+no\s+(?:quiero|la\s+quiero|me\s+gusta\w*)|ya\s+no\s+(?=\d)|no\s+(?:me\s+)?(?:sirve|conviene|recomiend\w*)|evitar\s+(?:mayor\s+)?consumo)\b/;

/**
 * EL PERFIL RECHAZADO TAMBIÉN SE RECUERDA.
 *
 * «No quiero perfil tan bajo por los baches» rechaza el 50 de 205/50R16, no el
 * ancho 205 — y la memoria solo guardaba anchos. Medido el 31-ago-2026 (corpus
 * T115, escenario O07, dos corridas seguidas): el cliente rechazó el perfil
 * bajo y el turno siguiente le mandó la pieza de opciones de esa misma
 * 205/50R16 «desde $85.72 c/u». Es el mismo defecto de la conv 11620 de
 * producción, por el otro eje de la medida.
 */
const RECHAZA_PERFIL_BAJO =
  /\bperfil\s+(?:tan|muy|demasiado)\s+baj\w*|\bno\s+(?:quiero|me\s+gusta\w*|me\s+sirve)\s+(?:el\s+|un\s+)?perfil\s+(?:tan\s+|muy\s+)?baj\w*|\bmuy\s+baj\w*\s+(?:el\s+)?perfil\b|\b(?:mas|subir)\s+(?:el\s+)?perfil\b|\bperfil\s+mas\s+alto\b/;

/** Una medida completa dicha por el cliente: «205/50R16», «205 50 16». */
const MEDIDA_EN_TEXTO = /\b(1[5-9]\d|2\d\d|3\d\d)\s*[\/ -]\s*(\d{2})\s*[\/ -]?\s*r?\s*(\d{2})\b/;

const REHABILITA_ANCHO =
  /\b(?:si\s+(?:quiero|me\s+sirve)|esta\s+bien|deme|dame|quiero|prefiero|acepto|vamos\s+con|me\s+quedo\s+con)\b/;

export interface RestriccionesDeLlanta {
  anchosRechazados: number[];
  /** El perfil rechazado por bajo: todo perfil MENOR a este queda vetado.
   *  `null` cuando el cliente nunca se quejó del perfil. */
  perfilMinimo: number | null;
}

export function restriccionesDeLlanta(textosCronologicos: readonly string[]): RestriccionesDeLlanta {
  const anchos = new Set<number>();
  let perfilMinimo: number | null = null;
  // El perfil se rechaza sin nombrarlo («no quiero perfil tan bajo»): el número
  // sale de la última medida completa que el cliente puso sobre la mesa.
  let perfilVigente: number | null = null;
  for (const texto of textosCronologicos) {
    const n = normalizar(texto);
    const medida = n.match(MEDIDA_EN_TEXTO);
    if (medida) perfilVigente = Number(medida[2]);
    const mencionados = [...n.matchAll(/\b(1[5-9]\d|2\d\d|3\d\d)(?:\s*\/|\b)/g)]
      .map((match) => Number(match[1]));
    if (RECHAZA_PERFIL_BAJO.test(n) && perfilVigente != null) {
      // Rechazó ESE perfil: de aquí en más hace falta uno más alto.
      perfilMinimo = Math.max(perfilMinimo ?? 0, perfilVigente + 1);
    }
    if (RECHAZA_POR_CALCE.test(n)) {
      for (const ancho of mencionados) anchos.add(ancho);
    } else if (REHABILITA_ANCHO.test(n)) {
      // La memoria no puede convertirse en una condena eterna: si más tarde
      // el cliente cambia de opinión de forma explícita, su última decisión
      // manda.
      for (const ancho of mencionados) anchos.delete(ancho);
      // Y si vuelve a pedir una medida con el perfil que había rechazado, el
      // veto del perfil también se levanta: lo pidió él.
      if (medida && perfilMinimo != null && Number(medida[2]) < perfilMinimo) perfilMinimo = null;
    }
  }
  return { anchosRechazados: [...anchos], perfilMinimo };
}

export function anchoDeMedida(etiqueta: string | null | undefined): number | null {
  const match = etiqueta?.match(/\b(1[5-9]\d|2\d\d|3\d\d)\s*\//);
  return match ? Number(match[1]) : null;
}

export function perfilDeMedida(etiqueta: string | null | undefined): number | null {
  // Sin `\b` al final: en «205/50R16» el 0 y la R son los dos caracteres de
  // palabra, así que ahí NO hay borde. El lookahead es lo que corta.
  const match = etiqueta?.match(/\b(?:1[5-9]\d|2\d\d|3\d\d)\s*\/\s*(\d{2})(?!\d)/);
  return match ? Number(match[1]) : null;
}

export function violaRestriccionesDeLlanta(
  etiqueta: string | null | undefined,
  restricciones: RestriccionesDeLlanta,
): boolean {
  const ancho = anchoDeMedida(etiqueta);
  if (ancho != null && restricciones.anchosRechazados.includes(ancho)) return true;
  const perfil = perfilDeMedida(etiqueta);
  return restricciones.perfilMinimo != null && perfil != null && perfil < restricciones.perfilMinimo;
}

export function hechosDeRestricciones(restricciones: RestriccionesDeLlanta): string | null {
  const partes: string[] = [];
  if (restricciones.anchosRechazados.length) {
    partes.push(`rechazó los anchos ${restricciones.anchosRechazados.join(", ")} por calce/roce/consumo`);
  }
  if (restricciones.perfilMinimo != null) {
    partes.push(`rechazó el perfil bajo: solo sirven perfiles de ${restricciones.perfilMinimo} en adelante`);
  }
  if (!partes.length) return null;
  return `RESTRICCIONES DEL CLIENTE (fuente determinística): ${partes.join(" y ")}. PROHIBIDO volver a mostrarlos, recomendarlos o cotizarlos.`;
}
