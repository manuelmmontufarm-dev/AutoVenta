/**
 * LA APERTURA CORTA DE COMPETIMOTOR (Sprint 3, familia F-04, auditoría del
 * 26-nov-2026). Todo lo de acá corre solo con `politica.aperturaCorta`; con el
 * perfil de Depot no se llama nunca.
 *
 * Lo que se midió en la base de Competimotor (17 al 26-nov, primer mensaje del
 * bot en el ciclo 1, cliente sin medida todavía):
 *   · apertura corta («Puede mandarme la medida escrita, una foto… o decirme su
 *     vehículo.» + «¿Qué medida usa? Ej: 225/65R17»): 73 chats, 53 dieron
 *     medida o foto (73 %), 61 contestaron algo (84 %).
 *   · apertura larga (guía + «Lo que más necesito es el *aro*… Sin ese dato no
 *     le puedo asegurar que la llanta entre.»): 38 chats, 22 dieron medida o
 *     foto (58 %), 29 contestaron (76 %).
 *
 * Y qué decidía cuál salía (ai_runs + metadata): la larga salió SOLO cuando
 * algo se metía antes del bot — la auto-respuesta de WhatsApp Business
 * (`metadata.automatica`, 40 de 40 hasta el 22-nov) dejaba un saliente
 * «humano» y la ruta de primer contacto se apagaba — o cuando el texto del
 * anuncio no era «¡Hola! Quiero más información» sino las otras dos frases que
 * pone Meta («Hola. ¿Puedes darme más información sobre esto?», «¡Hola! Me
 * gustaría conseguir más información sobre esto.»), que el detector de saludo
 * no conocía. En los dos casos contestaba el agente con `opciones_sin_medida` →
 * `guia_medida`.
 */

/** Sin tildes, sin puntuación, en minúsculas y con los espacios normalizados. */
function normalizar(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Las palabras con que Meta arma el mensaje del botón del anuncio («Enviar
 * mensaje») y las variantes que la gente le escribe encima. Ninguna es un dato
 * de venta: con cualquiera otra (un número, una marca, un vehículo) el mensaje
 * ya no es el del anuncio y lo contesta el agente.
 */
const PALABRAS_DEL_ANUNCIO = new Set([
  "hola", "holaa", "buenas", "buenos", "buen", "dias", "dia", "tardes", "noches",
  "puedes", "puede", "podrias", "podria", "me", "darme", "dar", "dame", "deme",
  "conseguir", "obtener", "recibir", "tener", "enviar", "enviarme", "mandar", "mandarme",
  "mas", "informacion", "info", "sobre", "esto", "este", "eso", "esta", "de", "del",
  "gustaria", "quiero", "quisiera", "interesa", "interesado", "interesada",
  "por", "favor", "porfa", "gracias", "la", "el", "una", "un", "y", "acerca",
]);

/**
 * ¿Es el texto que Meta pone en el botón del anuncio, sin ningún dato?
 * «Hola. ¿Puedes darme más información sobre esto?» → true.
 * «¿Puedes darme más información sobre la 265/65R17?» → false (trae medida).
 */
export function esPedidoDeInformacionDelAnuncio(texto: string | null | undefined): boolean {
  const n = normalizar(texto);
  if (!n || /\d/.test(n)) return false;
  const palabras = n.split(" ");
  if (!palabras.some((p) => p === "informacion" || p === "info" || p === "interesa")) return false;
  return palabras.every((p) => PALABRAS_DEL_ANUNCIO.has(p));
}

/**
 * ¿El saliente guardado es la auto-respuesta del celular de WhatsApp Business?
 * `wa/echoes.ts` la marca con `metadata.automatica` al guardarla: es un hecho,
 * no se lee el texto.
 */
export function esRespuestaAutomaticaGuardada(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === "object" && (metadata as { automatica?: unknown }).automatica === true);
}

/**
 * «¿Dónde las consigo?», «¿dónde están?»: el primer mensaje pregunta por el
 * local. Conv 902 (21-nov): «En Sto dgo. Donde las consigo gracias» recibió la
 * guía de medida y nunca la dirección. `pideUbicacion` (domain/ubicacionPedida)
 * cubre «dónde están / quedan / la ubicación»; esto suma «dónde las consigo /
 * compro / venden», que es como se pregunta al llegar de un anuncio.
 */
export function preguntaDondeConseguirlas(texto: string | null | undefined): boolean {
  const n = normalizar(texto);
  return /\bdonde\s+(?:las?|los?)\s+(?:consigo|compro|encuentro|venden|puedo\s+(?:conseguir|comprar|encontrar))\b/.test(n)
    || /\bdonde\s+(?:las|los)\s+(?:tienen|venden)\b/.test(n);
}

/**
 * La segunda vez que el cliente pide precio u opciones sin dar medida, aro ni
 * vehículo (1063: «Precio.», 1112: «Q medias tiene»). Antes salía una muestra
 * de tres llantas de tres medidas y tres aros distintos con «⚠️ Ojo…» y «¿Le
 * cotizo la 1, la 2 o la 3?». Ahora una sola pregunta con las tres vías y la
 * guía ofrecida para quien no la encuentra (sin mandarla de entrada).
 */
export const PEDIDO_DE_MEDIDA_CON_LAS_TRES_VIAS =
  "Para darle el precio exacto necesito saber qué llanta usa: ¿me escribe la medida del costado (ej. 225/65R17), me manda una foto de ese costado o me dice su vehículo? Si no la encuentra, le explico dónde mirar.";

/** Un ejemplo de medida común por aro, para que el «ej.» se parezca a lo suyo. */
const EJEMPLO_POR_ARO: Record<number, string> = {
  13: "175/70R13", 14: "185/65R14", 15: "195/65R15", 16: "205/55R16", 17: "225/65R17",
  18: "265/60R18", 19: "235/55R19", 20: "275/55R20", 21: "275/45R21", 22: "285/45R22",
};

/**
 * Con SOLO el aro («rin 16», «R17»): no se manda una lámina de tres medidas
 * distintas con totales ×4 (1051, 1724: «⚠️ Ojo: estas opciones son de
 * *medidas distintas*…» + «¿Le cotizo la 1, la 2 o la 3?» sobre llantas que no
 * se sabe si le calzan). Se pregunta lo que falta para cerrar la medida.
 */
export function preguntaParaCerrarLaMedida(aro: number): string {
  const ejemplo = EJEMPLO_POR_ARO[aro] ?? `225/65R${aro}`;
  return `En rin ${aro} hay varias medidas y cada una tiene su precio. ¿Me dice los números que van antes del ${aro} en el costado de la llanta (ej. ${ejemplo}), me manda una foto de ese costado o me dice su vehículo?`;
}

/**
 * El cierre de la lámina cuando la medida la dedujo el bot y el cliente NO dijo
 * su vehículo: sin «Estas son las que más se usan en su vehículo» (1063, 1112,
 * 1283, 1437: nadie había nombrado un vehículo).
 */
export const CIERRE_PIDE_MEDIDA_SIN_VEHICULO =
  "Para cotizarle con seguridad necesito la medida exacta. ¿Me escribe la que dice el filo de la llanta (ej. 225/65R17), o me manda una foto del costado? 📸";

/** Lo que `guia_medida` le contesta al modelo cuando la manda sin que el cliente la pida. */
export const ERROR_GUIA_SIN_PEDIRLA =
  "No mandes la guía de medida: el cliente no dijo que no sabe su medida ni que no la encuentra. Pregúntale en UNA línea por la medida del costado (ej. 225/65R17), una foto de ese costado o su vehículo — sin «sin ese dato no le puedo asegurar que la llanta entre». Si ya dio la medida o el vehículo, trabaja con eso. Si dice que no la encuentra, ahí sí vuelve a llamarme.";

/** Después del mapa (902): la pregunta de la medida, con las tres vías, en una sola línea. */
export const PEDIDO_TRAS_LA_UBICACION =
  "Para darle precio, ¿me dice la medida de su llanta (ej. 225/65R17), me manda una foto del costado o me dice su vehículo?";
