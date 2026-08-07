/**
 * Los detectores determinísticos de la auditoría, aplicables a las respuestas
 * del replay.
 *
 * ── Por qué este archivo existe y no un `import` ────────────────────────────
 * La consigna era reusar los detectores de `scripts/auditoria/extraer.mjs`, no
 * inventar otra taxonomía. Ese archivo, sin embargo, no exporta nada: es un
 * script que al importarlo exige DATABASE_URL y hace `process.exit(1)`. No hay
 * forma de importarlo sin ejecutarlo.
 *
 * La salida no es copiar y rezar. Las expresiones de abajo son las MISMAS, y
 * `verificarSincronia()` lee el archivo de la auditoría como texto y comprueba
 * que cada una siga apareciendo ahí literal. Si alguien afina un detector en la
 * auditoría y no lo trae aquí, el harness se niega a correr y dice cuál cambió.
 * Sin eso, los dos conteos se irían separando en silencio y el "antes vs
 * después" del informe mediría dos varas distintas — que es justo el error que
 * el censo del 5-ago se cuidó de no cometer.
 *
 * NO renombrar los `id`: son la llave con la que se comparan las corridas.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const AUDITORIA_EXTRAER = fileURLToPath(
  new URL("../../auditoria/extraer.mjs", import.meta.url),
);

// ── Expresiones (espejo exacto de scripts/auditoria/extraer.mjs) ─────────────

export const ERROR_PROCESAMIENTO = /tuve un problema procesando tu mensaje|¿me repites por favor\?/i;
export const PIDE_FOTO = /(mánd|mand|enví|envi|compárt|adjunt|pued[ae]s?\s+(?:enviar|mandar)|podr[íi]as?\s+(?:enviar|mandar))[^.?!]{0,50}(foto|imagen)|foto de la etiqueta|foto del costado|foto de la puerta|una foto de/i;
export const SALUDO_INICIAL = /^\s*(?:¡\s*)?(?:hola|buen[oa]s(?:\s+(?:d[íi]as|tardes|noches))?)\s*[!.,]/i;
export const PIEZA_FALLIDA = /no se pudo volver a dibujar la pieza|no pude generar la imagen|no logr[ée] enviar la imagen/i;
export const ES_COTIZACION = /COT-[A-Z0-9]+/;
export const SIN_FICHA = /no tengo una ficha t[ée]cnica verificada|no tengo una medida verificada/i;
export const PIDE_CONFIRMAR_CANTIDAD = /confirm\w*[^.?!]{0,40}cantidad|cu[áa]ntas llantas (?:desea|necesita|le gustar[íi]a)|cantidad exacta/i;

/**
 * Los umbrales del detector — tan parte de la vara como las expresiones.
 *
 * Van aquí arriba y NO en línea a propósito: `verificarSincronia()` comprueba
 * que cada uno siga escrito igual en el extractor de la auditoría. Una regex
 * idéntica con `>= 0.75` en un lado y `>= 0.6` en el otro mide dos cosas
 * distintas, y ese desvío es invisible si la guardia solo mira las expresiones.
 */
export const UMBRAL_SIMILITUD = 0.6;
/** Ventana en minutos para considerar duplicada una segunda cotización. */
export const VENTANA_COTIZACION_MIN = 10;
/** Palabras de menos de este largo no cuentan para la similitud. */
export const LARGO_MINIMO_PALABRA = 3;
/** Extracción del número de cotización dentro de un texto. */
export const NUMERO_COTIZACION = /COT-[A-Z0-9]+/;

/** Orden y nombres del censo: así se alinean las barras del informe. */
export const TAXONOMIA = [
  "error_procesamiento",
  "pide_foto_que_no_puede_leer",
  "pregunta_teniendo_medida",
  "pregunta_repetida",
  "mensaje_duplicado",
  "disculpas_seguidas",
  "saludo_repetido",
  "cotizacion_duplicada",
  "con_medida_sin_cotizar",
  "sin_ficha_verificada",
  "pieza_fallida",
  "abandono_tras_pregunta",
  "sin_respuesta_del_bot",
  "pide_confirmar_cantidad",
  "opciones_reenviadas",
];

/** Los 7 que el censo del 5-ago llegó a medir: el resto no tiene "antes". */
export const TAXONOMIA_CON_LINEA_BASE = [
  "pide_foto_que_no_puede_leer",
  "error_procesamiento",
  "saludo_repetido",
  "disculpas_seguidas",
  "mensaje_duplicado",
  "cotizacion_duplicada",
  "pregunta_teniendo_medida",
];

export const ETIQUETAS = {
  error_procesamiento: "«Tuve un problema procesando tu mensaje»",
  pide_foto_que_no_puede_leer: "Pidió una foto que no puede leer",
  pregunta_teniendo_medida: "Preguntó teniendo ya la medida",
  pregunta_repetida: "Repitió la misma pregunta",
  mensaje_duplicado: "Mensaje idéntico repetido",
  disculpas_seguidas: "Disculpa tras disculpa",
  saludo_repetido: "Volvió a saludar a mitad del hilo",
  cotizacion_duplicada: "Dos cotizaciones para la misma compra",
  con_medida_sin_cotizar: "Tenía la medida y nunca cotizó",
  sin_ficha_verificada: "Dijo no tener ficha verificada",
  pieza_fallida: "No logró dibujar/enviar la pieza",
  abandono_tras_pregunta: "Terminó en pregunta sin respuesta",
  sin_respuesta_del_bot: "El cliente escribió y no hubo respuesta",
  pide_confirmar_cantidad: "Volvió a pedir confirmar la cantidad",
  opciones_reenviadas: "Reenvió las mismas opciones en el ciclo",
};

// ── Utilidades (idénticas a la auditoría) ────────────────────────────────────

export const esPregunta = (texto) => /\?/.test(texto ?? "");

/** Similitud barata por palabras — para detectar la MISMA pregunta repetida. */
export function similitud(a, b) {
  const norm = (t) => new Set(
    t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > LARGO_MINIMO_PALABRA),
  );
  const A = norm(a), B = norm(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes += 1;
  return comunes / Math.min(A.size, B.size);
}

/** "$1.173,15" y "$1,173.15" y "$638.59" → centavos enteros. */
export function montoEnCentavos(texto) {
  const bruto = (texto ?? "").match(/\$\s?([\d.,]+)/)?.[1];
  if (!bruto) return null;
  const sinMiles = bruto.replace(/[.,](?=\d{3}\b)/g, "");
  return Math.round(Number(sinMiles.replace(",", ".")) * 100);
}

export const mediana = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const pct = (n, d) => (d ? Number(((n / d) * 100).toFixed(1)) : 0);

// ── Guardia de sincronía ─────────────────────────────────────────────────────

/**
 * Comprueba que cada expresión de arriba siga viva, literal, en el extractor de
 * la auditoría. Devuelve la lista de las que ya no aparecen (vacía = en sync).
 *
 * Compara el `source` del regex, no el literal completo, porque aquí llevan
 * `export` delante. Se normalizan los escapes Unicode: este archivo escribe
 * `[̀-ͯ]` donde el original tiene los combinantes crudos.
 */
export function verificarSincronia() {
  let fuente;
  try {
    fuente = readFileSync(AUDITORIA_EXTRAER, "utf8");
  } catch (error) {
    return [{ nombre: "(archivo)", motivo: `no se pudo leer ${AUDITORIA_EXTRAER}: ${error.message}` }];
  }
  const crudo = fuente.normalize("NFC");
  const desviadas = [];
  const aComparar = {
    ERROR_PROCESAMIENTO, PIDE_FOTO, SALUDO_INICIAL, PIEZA_FALLIDA,
    ES_COTIZACION, SIN_FICHA, PIDE_CONFIRMAR_CANTIDAD, NUMERO_COTIZACION,
  };
  for (const [nombre, regex] of Object.entries(aComparar)) {
    // El original escribe los combinantes crudos dentro de la clase; aquí van
    // escapados. Se comparan ambas formas para que las dos pasen.
    const variantes = [
      regex.source,
      regex.source.replace(/\\u0300-\\u036f/g, "̀-ͯ"),
    ];
    if (!variantes.some((v) => crudo.includes(v.normalize("NFC")))) {
      desviadas.push({ nombre, motivo: "ya no aparece literal en la auditoría" });
    }
  }

  // Los umbrales: un detector es su expresión Y su número de corte. Se busca el
  // fragmento tal como lo escribe la auditoría; si alguien lo afina allá, aquí
  // deja de aparecer y el harness se niega a correr.
  const fragmentos = {
    UMBRAL_SIMILITUD: `>= ${UMBRAL_SIMILITUD}`,
    VENTANA_COTIZACION_MIN: `minutos <= ${VENTANA_COTIZACION_MIN}`,
    LARGO_MINIMO_PALABRA: `w.length > ${LARGO_MINIMO_PALABRA}`,
  };
  for (const [nombre, fragmento] of Object.entries(fragmentos)) {
    if (!crudo.includes(fragmento)) {
      desviadas.push({ nombre, motivo: `el umbral \`${fragmento}\` ya no aparece en la auditoría` });
    }
  }
  return desviadas;
}

/** Aborta con un mensaje accionable si los detectores se separaron. */
export function exigirSincronia() {
  const desviadas = verificarSincronia();
  if (desviadas.length === 0) return;
  console.error(
    "❌ Los detectores de scripts/eval/lib/detectores.mjs ya NO coinciden con\n" +
    `   ${AUDITORIA_EXTRAER}\n\n` +
    desviadas.map((d) => `   · ${d.nombre}: ${d.motivo}`).join("\n") +
    "\n\n   Copia la versión nueva a lib/detectores.mjs antes de seguir. Si los dos\n" +
    "   lados miden distinto, el «antes vs después» del informe compara peras\n" +
    "   con manzanas y el número deja de significar nada.",
  );
  process.exit(1);
}

// ── El análisis ──────────────────────────────────────────────────────────────

/**
 * Corre los detectores sobre UNA conversación replayada.
 *
 * @param {object} conv
 * @param {number|string} conv.conversationId
 * @param {string} conv.cliente
 * @param {string|null} conv.medida        tire_size conocida en la conversación
 * @param {number} conv.mensajesCliente    cuántos inbound tuvo el cliente
 * @param {{texto: string, cuando: string, ciclo?: number, esPiezaOpciones?: boolean}[]} conv.respuestas
 *        Las respuestas del bot EN ORDEN. En el replay son las nuevas; en una
 *        corrida sobre el histórico serían las viejas — el detector es el mismo.
 * @returns {{detector: string, conversationId: any, cliente: string, cuando: string, extracto: string}[]}
 */
export function analizarConversacion(conv) {
  const hallazgos = [];
  const bot = conv.respuestas ?? [];
  const marcar = (detector, r, extra = {}) => hallazgos.push({
    detector,
    conversationId: conv.conversationId,
    cliente: conv.cliente,
    cuando: r?.cuando ?? null,
    extracto: (r?.texto ?? "").slice(0, 220),
    ...extra,
  });

  const indiceCotizacion = bot.findIndex((r) => ES_COTIZACION.test(r.texto ?? ""));
  const cotizo = indiceCotizacion >= 0;

  for (const [i, r] of bot.entries()) {
    const texto = r.texto ?? "";

    if (ERROR_PROCESAMIENTO.test(texto)) marcar("error_procesamiento", r);
    if (PIEZA_FALLIDA.test(texto)) marcar("pieza_fallida", r);
    if (SIN_FICHA.test(texto)) marcar("sin_ficha_verificada", r);
    if (PIDE_FOTO.test(texto)) marcar("pide_foto_que_no_puede_leer", r);
    if (PIDE_CONFIRMAR_CANTIDAD.test(texto)) marcar("pide_confirmar_cantidad", r);

    // Preguntar teniendo ya la medida = fricción pura: podía cotizar.
    if (conv.medida && esPregunta(texto) && !ES_COTIZACION.test(texto)
        && (!cotizo || i < indiceCotizacion)) {
      marcar("pregunta_teniendo_medida", r, { medida: conv.medida });
    }

    const previa = bot[i - 1]?.texto ?? "";
    if (previa && esPregunta(texto) && similitud(texto, previa) >= UMBRAL_SIMILITUD) {
      marcar("pregunta_repetida", r);
    }
    if (previa && texto.trim().toLowerCase() === previa.trim().toLowerCase()) {
      marcar("mensaje_duplicado", r);
    }
    if (ERROR_PROCESAMIENTO.test(texto) && ERROR_PROCESAMIENTO.test(previa)) {
      marcar("disculpas_seguidas", r);
    }
    if (i > 0 && SALUDO_INICIAL.test(texto)) {
      marcar("saludo_repetido", r);
    }
  }

  // Dos COT- distintas con el mismo monto en < 10 min. Una entrada por número.
  const cotizaciones = [];
  for (const r of bot) {
    const cot = (r.texto ?? "").match(NUMERO_COTIZACION)?.[0];
    if (!cot || cotizaciones.some((x) => x.cot === cot)) continue;
    cotizaciones.push({ r, cot, monto: montoEnCentavos(r.texto) });
  }
  for (let i = 1; i < cotizaciones.length; i += 1) {
    const a = cotizaciones[i - 1], b = cotizaciones[i];
    const minutos = (new Date(b.r.cuando) - new Date(a.r.cuando)) / 60_000;
    if (a.cot !== b.cot && a.monto === b.monto && minutos <= VENTANA_COTIZACION_MIN) {
      marcar("cotizacion_duplicada", b.r, {
        previa: a.cot, duplicada: b.cot, minutos: Number(minutos.toFixed(1)),
      });
    }
  }

  // La pieza de opciones reenviada dentro del MISMO ciclo.
  const piezasPorCiclo = new Map();
  for (const r of bot) {
    if (!r.esPiezaOpciones) continue;
    const ciclo = r.ciclo ?? 0;
    const vistas = (piezasPorCiclo.get(ciclo) ?? 0) + 1;
    piezasPorCiclo.set(ciclo, vistas);
    if (vistas > 1) marcar("opciones_reenviadas", r, { ciclo, vecesEnElCiclo: vistas });
  }

  if ((conv.mensajesCliente ?? 0) > 0 && bot.length === 0) {
    marcar("sin_respuesta_del_bot", null, { mensajesCliente: conv.mensajesCliente });
  }
  if (conv.medida && !cotizo) {
    marcar("con_medida_sin_cotizar", bot.at(-1), { medida: conv.medida });
  }

  return hallazgos;
}

/**
 * Agrega los hallazgos de varias conversaciones a la MISMA forma que
 * `metricas.fallas` del censo, para que el informe compare 1:1.
 */
export function resumirFallas(hallazgos, totalConversaciones) {
  const cuenta = (d) => hallazgos.filter((h) => h.detector === d).length;
  const chatsAfectados = (d) =>
    new Set(hallazgos.filter((h) => h.detector === d).map((h) => h.conversationId)).size;
  return Object.fromEntries(TAXONOMIA.map((d) => [d, {
    incidencias: cuenta(d),
    chatsAfectados: chatsAfectados(d),
    pctChats: pct(chatsAfectados(d), totalConversaciones),
  }]));
}

/** Conversaciones con al menos una falla — el número titular del censo. */
export function conversacionesAfectadas(hallazgos) {
  return new Set(hallazgos.map((h) => h.conversationId)).size;
}
