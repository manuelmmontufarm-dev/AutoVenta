/** Guardas deterministas del flujo: el LLM no puede saltárselas. */

export function isComparisonRequest(text: string): boolean {
  const normalized = normalize(text);
  return /\b(compar|diferencia|cual es mejor|cu[aá]l conviene|mejor entre)\w*/.test(normalized);
}

export function isExplicitPurchaseConfirmation(text: string): boolean {
  const normalized = normalize(text);
  return /\b(ya (?:las? )?compr[eé]|acabo de comprar|ya pagu[eé]|compra (?:hecha|realizada)|pago realizado)\b/.test(
    normalized,
  );
}

/**
 * Negativa clara = lo ÚNICO que frena la cotización cuando el bot ya preguntó.
 * Regla de venta (6-ago): si no es un NO, es un sí. Rodrigo dijo «Si», «Pero
 * quiero cambiar las 5» y «La de emergencia también» y el bot le pidió
 * confirmar CUATRO veces porque buscaba un sí con formato de máquina.
 */
export function isNegativeResponse(text: string): boolean {
  const normalized = normalize(text);
  return /\b(?:no(?:\s+gracias)?|todavia no|aun no|ahorita no|por ahora no|mejor no|dejeme pensar(?:lo)?|dejame pensar(?:lo)?|lo pienso|voy a pensar|solo (?:estoy )?pregunt\w*|solo (?:era|es) (?:una )?consulta|despues le aviso|luego le aviso|mas tarde le aviso|otro dia|cancel\w*)\b/.test(
    normalized,
  ) && !/\bno\s+(?:hay\s+)?problema\b/.test(normalized);
}

export function hasExplicitQuantity(text: string): boolean {
  return extractExplicitQuantity(text) !== null;
}

export function extractExplicitQuantity(text: string): number | null {
  const normalized = normalize(text);
  if (/^[1-8]$/.test(normalized)) return Number(normalized);
  const words: Record<string, number> = {
    un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4,
    cinco: 5, seis: 6, siete: 7, ocho: 8,
  };
  // «Juego de llantas» = 4 en toda llantera del Ecuador. 18 mensajes en 15
  // chats lo usaron en dos semanas y el bot respondía pidiendo "la cantidad
  // exacta" (caso Wilson Gómez, 6-ago). Solo si no viene un número explícito
  // al lado («juego de 4», «juego de 5 con emergencia») que diga otra cosa.
  const juego = /\bjuego\b/.test(normalized);
  const match = normalized.match(
    // El lookbehind «(?<!a )» evita leer «paso a las 3» (una hora de visita)
    // como si fueran 3 llantas.
    /\b([1-8]|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho)\s+(?:llantas?|unidades?)\b|\b(?:quiero|necesito|deme|dame|cotiza(?:me)?|llevo|cambiar|cambio|serian|serían|son)\s+(?:las?\s+|los\s+)?([1-8]|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho)\b|\bjuego\s+de\s+([1-8]|cuatro|cinco)\b|(?<!\ba\s)(?<!\bde\s)\b(?:las|los)\s+([1-8]|dos|tres|cuatro|cinco|seis|siete|ocho)\b/,
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3] ?? match?.[4];
  if (value) return /^\d$/.test(value) ? Number(value) : words[value] ?? null;
  if (juego) return 4;
  // Número suelto al inicio o al final del mensaje: el agrupador de entrada
  // pega mensajes seguidos («Las son para mi carro» + «4» → un solo texto) y
  // el «4» del cliente quedaba invisible (caso J.F.R.C, 6-ago). Solo en los
  // extremos para no confundirse con medidas o años dentro de la frase.
  // Las HORAS se quitan antes: «paso a las 3» es una visita, no 3 llantas.
  const sinHoras = normalized.replace(/\b(?:a\s+(?:eso\s+de\s+)?(?:las?\s+)?|tipo\s+|(?:hasta|desde)\s+las?\s+)[0-9]{1,2}(?:\s*(?:h|am|pm|de la (?:mañana|tarde|noche)))?\b/g, " ").replace(/\s+/g, " ").trim();
  const suelto = sinHoras.match(/^([1-8])\s|\s([1-8])$/);
  const borde = suelto?.[1] ?? suelto?.[2];
  return borde ? Number(borde) : null;
}

export function extractVehicleYear(text: string): number | null {
  const match = normalize(text).match(/\b(19[5-9]\d|20[0-2]\d|2030)\b/);
  return match ? Number(match[1]) : null;
}

/**
 * Candado de generar_cotizacion. Antes exigía que el ÚLTIMO mensaje trajera
 * una cantidad con verbo («quiero 4»); un «Si», un «4» suelto o un «juego»
 * rebotaban y el modelo volvía a pedir confirmación — así se perdió a Rodrigo
 * (4 confirmaciones) y a J.F.R.C (escribió «4» dos veces). Regla nueva:
 * cotizar es lo correcto salvo que el cliente esté comparando o haya dicho
 * que NO. La cantidad sale del texto, del hecho guardado o del juego de 4.
 */
export function canGenerateFinalQuote(
  text: string,
  comparedThisTurn = false,
  confirmedQuantity = false,
): boolean {
  if (comparedThisTurn || isComparisonRequest(text)) return false;
  if (isNegativeResponse(text)) return false;
  return hasExplicitQuantity(text) || confirmedQuantity;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9áéíóúñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
