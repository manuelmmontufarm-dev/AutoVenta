/**
 * TRES CANDADOS DE TEXTO PURO (auditoría 2-6 sep-2026, familias E y G).
 *
 * 1. `sinTelefonoPropio` — el bot mandó cuatro veces su propio número de
 *    WhatsApp «para ubicación directa» (conv 14976: «No tengo aquí la
 *    dirección exacta del local, pero puede escribirnos o llamar al +593 98
 *    280 1766»). El cliente YA está escribiendo a ese número. La frase que lo
 *    trae se quita entera; el mapa lo pone `ubicacion_cuando_la_piden`.
 *
 * 2. `conMapasCanonicos` — el modelo escribió el link de Maps a mano y salió
 *    vacío: «https://maps.app.goo.gl/» (conv 15555; el cliente pensó horas
 *    después que la tienda estaba en otra ciudad). Los links solo salen del
 *    bloque canónico del negocio: cualquier URL de Maps que no sea una de las
 *    reales se reemplaza por ese bloque.
 *
 * 3. `quitarMenuDePreferencia` — el menú Costo/Equilibrio/Premium pegado al
 *    final de otra respuesta (conv 14976, tras la dirección) o escrito sobre
 *    una sola opción (conv 7794: «única opción… ¿qué prefiere priorizar?»).
 *    Se quita el bloque del menú y queda el resto; quién decide cuándo, en
 *    `prepararSalida`.
 */

const SEPARADOR = /\n\s*-{3,}\s*\n/;

export interface TextoRecortado {
  texto: string;
  quitado: boolean;
}

/** Solo los dígitos, para comparar «+593 98 280 1766», «0982801766» y «098 280 1766». */
function digitos(t: string): string {
  return t.replace(/\D/g, "");
}

export function sinTelefonoPropio(texto: string, telefonoPropio: string | null | undefined): TextoRecortado {
  const propio = digitos(telefonoPropio ?? "");
  if (propio.length < 7) return { texto, quitado: false };
  // Con o sin el 593: «0982801766» y «+593982801766» son el mismo número.
  const local = propio.replace(/^593/, "");
  const trae = (frase: string) => {
    const d = digitos(frase);
    return d.includes(propio) || (local.length >= 8 && d.includes(local));
  };
  let quitado = false;
  const bloques = texto.split(SEPARADOR).map((bloque) => {
    const frases = bloque.split(/(?<=[.!?])\s+|\n/);
    const limpias = frases.filter((f) => {
      if (trae(f)) { quitado = true; return false; }
      return true;
    });
    return limpias.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }).filter(Boolean);
  return { texto: bloques.join("\n---\n"), quitado };
}

export function conMapasCanonicos(
  texto: string,
  urlsCanonicas: readonly string[],
  bloqueCanonico: string,
): { texto: string; corregido: boolean } {
  const urls = texto.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com|www\.google\.com\/maps)[^\s)]*/gi) ?? [];
  const ajenas = urls.filter((u) => !urlsCanonicas.includes(u.replace(/[.,;)]+$/, "")));
  if (!ajenas.length) return { texto, corregido: false };
  // Se quitan las líneas que traían el link malo; el bloque real va donde
  // estaba la primera, para no perder la respuesta que lo rodeaba.
  const lineas = texto.split("\n");
  let insertado = false;
  const salida: string[] = [];
  for (const linea of lineas) {
    if (ajenas.some((u) => linea.includes(u))) {
      if (!insertado) { salida.push(bloqueCanonico); insertado = true; }
      continue;
    }
    salida.push(linea);
  }
  return { texto: salida.join("\n").replace(/\n{3,}/g, "\n\n").trim(), corregido: true };
}

/** Las formas reales en que salió el menú: la frase canónica y la corta del modelo. */
const ARRANQUE_DEL_MENU =
  /(?:para\s+afinar(?:le)?\s+la\s+recomendaci[oó]n[^\n]*|¿\s*qu[eé]\s+prioriza\s+usted\s*\?|¿\s*qu[eé]\s+prefiere\s+priorizar[^\n]*\?|dígame\s+qu[eé]\s+prioriza[^\n]*|d[ií]game\s+qu[eé]\s+prioriza[^\n]*)/i;
const OPCION_DEL_MENU = /^\s*[123]\)\s*\*?(?:costo|equilibrio|premium)\*?/i;
const CIERRE_DEL_MENU = /^\s*con\s+eso\s+le\s+(?:dejo|digo)/i;
const MENU_CORTO = /¿[^?]*\bcosto\b[^?]*\bequilibri\w*\b[^?]*\bpremium\b[^?]*\?/i;

/** Una línea que es un ítem del menú: «1) *Costo* — …», «- *Equilibrio*: …», «• Premium». */
const ITEM_DEL_MENU = /^\s*(?:[-•▪*·]|\d[).]|\(\d\))?\s*\*?(?:costo|equilibrio|premium)\*?\b/i;
/** La línea que presenta la lista: termina en «:» o pregunta qué prefiere/prioriza. */
const INTRO_DEL_MENU = /(?:prefiere|prioriza|priorizar|elegir|opci[oó]n)[^\n]*:\s*$|(?:prefiere|prioriza)[^\n]*\?\s*$/i;

/**
 * El menú escrito como LISTA, en cualquier forma (simulador 6-sep: «Para
 * avanzar, puede decirme cuál prefiere: - *Costo* … - *Equilibrio* … -
 * *Premium* …»): dos o más líneas que son ítems del menú, más la línea que las
 * presenta. Devuelve el bloque sin ellas, o null si no había lista.
 */
function sinListaDeEscalones(bloque: string): string | null {
  const lineas = bloque.split("\n");
  const items = lineas.filter((l) => ITEM_DEL_MENU.test(l));
  if (items.length < 2) return null;
  const salida: string[] = [];
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (ITEM_DEL_MENU.test(linea)) continue;
    const siguiente = lineas.slice(i + 1).find((l) => l.trim());
    if (siguiente && ITEM_DEL_MENU.test(siguiente) && INTRO_DEL_MENU.test(linea)) continue;
    if (CIERRE_DEL_MENU.test(linea)) continue;
    salida.push(linea);
  }
  return salida.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function quitarMenuDePreferencia(texto: string): TextoRecortado {
  let quitado = false;
  const bloques = texto.split(SEPARADOR).map((bloque) => {
    const sinLista = sinListaDeEscalones(bloque);
    if (sinLista !== null) {
      quitado = true;
      bloque = sinLista;
      if (!bloque) return bloque;
    }
    if (MENU_CORTO.test(bloque)) {
      quitado = true;
      const resto = bloque.replace(MENU_CORTO, "").replace(/\s*😊\s*$/, "").trim();
      return resto;
    }
    if (!ARRANQUE_DEL_MENU.test(bloque) && !OPCION_DEL_MENU.test(bloque)) return bloque;
    const lineas = bloque.split("\n");
    const salida: string[] = [];
    let dentro = false;
    for (const linea of lineas) {
      if (!dentro && ARRANQUE_DEL_MENU.test(linea)) {
        dentro = true; quitado = true;
        // Lo que viene antes del arranque en la misma línea se conserva
        // («Sobre las opciones que le envié, para afinarle…» → nada útil; se va).
        continue;
      }
      if (dentro && (OPCION_DEL_MENU.test(linea) || CIERRE_DEL_MENU.test(linea) || !linea.trim())) continue;
      if (dentro && !OPCION_DEL_MENU.test(linea)) dentro = false;
      salida.push(linea);
    }
    return salida.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }).filter(Boolean);
  return { texto: bloques.join("\n---\n"), quitado };
}
