/**
 * Piezas puras de la investigación de fitment por vehículo.
 *
 * Viven separadas del servicio (services/vehicleFitmentResearch.ts) porque no
 * tocan red: son el prompt, el parseo de lo que vuelve y el filtro por aro.
 * Así se prueban sin mockear OpenAI, que es exactamente lo que faltaba el 7-ago
 * cuando la investigación de la Creta 2027 falló en silencio.
 */
import { extractTireSizes, formatTireSize, parseTireSize } from "./tireSize.js";

const SIZE_RE = /\b\d{3}\/\d{2}R\d{2}\b/gi;

export function extractTireSizesFromUnknown(value: unknown): string[] {
  const seen = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node === "string") for (const match of node.match(SIZE_RE) ?? []) seen.add(match.toUpperCase());
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") Object.values(node as Record<string, unknown>).forEach(walk);
  };
  walk(value);
  return [...seen].slice(0, 12);
}

/**
 * La doble vía para conseguir la medida: escrita O foto del costado.
 *
 * Hasta el 6-ago el bot no leía imágenes y pedir una foto dejaba al cliente en
 * un callejón sin salida (chat del Chevrolet Orlando, 5-ago). Con vision.ts la
 * foto ya entra como texto por el mismo camino que un mensaje escrito, así que
 * dejó de ser una trampa: ahora se ofrecen LAS DOS vías y el cliente toma la
 * que tenga más a mano. La que menos fricción tenga es la que termina en
 * cotización.
 */
export const PREGUNTA_MEDIDA_ESCRITA =
  "¿Me escribe la medida que dice el filo de la llanta (ej. 225/65R17), o me manda una foto del costado? Con cualquiera de las dos le cotizo de una.";

/**
 * Repara la pregunta huérfana: la que pide SOLO una foto.
 *
 * Ya no se trata de borrar la palabra «foto» — el bot lee fotos y pedirla es
 * legítimo. Lo único que no puede salir es una pregunta que ofrezca la foto
 * como única salida: si el cliente está manejando, o la llanta está sucia, o no
 * sabe qué lado fotografiar, la conversación se para ahí. En ese caso se
 * reemplaza por la doble vía. Todo lo demás se respeta tal cual: una pregunta
 * que pide la versión o el motor es un discriminante bueno y borrarla sería
 * perder información.
 */
export function conDobleVia(pregunta: string | null | undefined): string | null {
  if (!pregunta) return null;
  const pideFoto = /foto|imagen|selfie|captura/i.test(pregunta);
  const ofreceMedida = /medida|\d{3}\s*\/\s*\d{2}\s*R\s*\d{2}/i.test(pregunta);
  return pideFoto && !ofreceMedida ? PREGUNTA_MEDIDA_ESCRITA : pregunta;
}

/**
 * Deja solo las medidas que calzan con el aro que dijo el cliente.
 *
 * El aro es el discriminante barato que el 7-ago se estaba tirando a la basura:
 * una Creta tiene versiones en 16, 17 y 19, y saber que el cliente anda en 19
 * descarta las otras dos sin preguntarle nada. Se parsea con el parser del
 * catálogo (tireSize.ts) para no inventar un segundo criterio de qué es un aro.
 * Sin aro devuelve todo — filtrar por un dato que no existe sería borrar datos.
 */
export function medidasDelAro(sizes: readonly string[], aro: number | null | undefined): string[] {
  if (!aro) return [...sizes];
  return sizes.filter((size) => parseTireSize(size)?.rim === aro);
}

export type ConfianzaFitment = "alta" | "media" | "baja";

/** Una medida propuesta por la investigación, con qué tan respaldada está. */
export interface CandidatoFitment {
  /** Medida canónica, ej. "235/45R19". */
  medida: string;
  confianza: ConfianzaFitment;
  /** De dónde sale, en una línea que el vendedor pueda leer. */
  porque: string;
}

/**
 * Esquema de salida estructurada de la investigación (Responses API,
 * `text.format`). Verificado el 7-ago contra la API real: gpt-5.5 lo acepta
 * junto con la herramienta `web_search` y devuelve JSON válido.
 *
 * `strict: true` obliga al modelo a llenar los tres campos de cada candidato,
 * y ese es justamente el punto: con el formato libre anterior el modelo escribía
 * la medida en la prosa de "note" y dejaba el arreglo vacío, que para el código
 * era indistinguible de "no existe".
 */
export const ESQUEMA_CANDIDATOS = {
  type: "json_schema",
  name: "fitment_candidatos",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["candidatos", "nota", "siguiente_pregunta"],
    properties: {
      candidatos: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["medida", "confianza", "porque"],
          properties: {
            medida: { type: "string", description: "Medida en formato 235/45R19" },
            confianza: { type: "string", enum: ["alta", "media", "baja"] },
            porque: { type: "string", description: "De dónde sale la medida, en una línea" },
          },
        },
      },
      nota: { type: "string" },
      siguiente_pregunta: { type: "string" },
    },
  },
} as const;

/**
 * Prompt de la investigación web.
 *
 * Rediseñado el 7-ago después de medir el prompt anterior contra la API con el
 * caso que falló en producción (Creta 2027, aro 19 → 235/45R19). El prompt viejo
 * decía «No adivines», «prioriza el manual del fabricante» y «si cambia la
 * versión, status ambiguous». Resultado medido: gpt-5.5 ENCONTRABA la medida y
 * la escribía en la prosa de "note", pero devolvía el arreglo vacío; gpt-5.4 y
 * gpt-4o igual. El modelo no fallaba en buscar — se autocensuraba al reportar,
 * porque el prompt premiaba el silencio sobre la respuesta imperfecta. Subir de
 * modelo no arreglaba nada (gpt-4o-mini incluso alucinó la generación anterior).
 *
 * Por eso ahora se invierte el incentivo: la lista vacía se declara la PEOR
 * respuesta, y la incertidumbre tiene dónde expresarse sin borrar el dato — el
 * campo `confianza`. El vendedor prefiere «esta es probablemente la medida, hay
 * que confirmarla» antes que «no sé»; con lo primero vende y confirma en el
 * local, con lo segundo el chat se muere.
 *
 * Vive afuera del servicio para poder verificar en un test que el aro del
 * cliente viaja de verdad hasta acá: esa era la falla #1 del caso Creta 2027 —
 * ChatGPT acertó con el mismo vehículo justamente porque le dieron el aro.
 */
export function promptCandidatosFitment(vehicle: string, aro: number | null | undefined): string {
  const pistaAro = aro
    ? `El cliente dice que usa ARO ${aro}: es el dato más fuerte que tienes. Úsalo para identificar la generación y la versión, y pon PRIMERO los candidatos de aro ${aro}. Solo si ese vehículo no tiene ninguna medida de aro ${aro}, devuelve las de otros aros y dilo en "porque". `
    : "";
  return (
    `Eres el asesor técnico de una llantera en Quito, Ecuador. Un cliente quiere comprar llantas para su ${vehicle}. ` +
    pistaAro +
    `Busca en la web la medida de llantas de fábrica (OEM) de ese vehículo. ` +
    `SIEMPRE devuelve al menos un candidato si existe cualquier medida plausible; marca su confianza. ` +
    `Devolver lista vacía es la peor respuesta posible: deja al vendedor sin nada que ofrecer. ` +
    `Si no hallas la ficha exacta, razona por analogía (misma generación, gemelo mecánico, año contiguo, otro mercado) ` +
    `y devuelve ese candidato con confianza "baja" explicando en "porque" de dónde lo sacaste. ` +
    `Niveles: "alta" = ficha oficial del fabricante para ese año y esa versión; ` +
    `"media" = fuente secundaria confiable, o ficha oficial de una versión que no confirmaste que sea la del cliente; ` +
    `"baja" = inferido por analogía. ` +
    `Escribe cada medida en formato 235/45R19. Máximo 4 candidatos, ordenados de más a menos probable para ESTE cliente. ` +
    `"nota" = una línea con el límite de lo que sabes, redactada para que el vendedor se la diga al cliente tal cual. ` +
    `"siguiente_pregunta" = UNA sola pregunta que discrimine entre los candidatos (versión, motor). ` +
    `Déjala vacía ("") solo si un único candidato de confianza alta ya resuelve el caso.`
  );
}

export interface RespuestaInvestigacion {
  candidatos?: unknown;
  nota?: unknown;
  siguiente_pregunta?: unknown;
  /** Forma vieja del contrato; se sigue leyendo por si el modelo la imita. */
  sizes?: unknown;
}

/**
 * Rescata el JSON de la investigación aunque venga sucio.
 *
 * El modelo devuelve texto libre: a veces JSON limpio, a veces envuelto en
 * ```json, a veces con una frase de cortesía antes o después. Hasta el 7-ago un
 * JSON.parse fallido dejaba `parsed = {}` sin una sola línea de log, así que una
 * investigación muerta se veía IGUAL que un vehículo que no existe — el bot
 * respondía «no tengo una medida verificada» sin que nadie supiera por qué.
 * Ahora se intenta el texto pelado y luego el primer objeto {...} que aparezca;
 * si ni así, queda escrito en el log con un extracto y se devuelve null (que es
 * distinto de «vino vacío»).
 */
export function parseRespuestaInvestigacion(texto: string | null | undefined): RespuestaInvestigacion | null {
  const limpio = (texto ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!limpio) {
    console.warn("⚠️ Investigación fitment: respuesta no parseable", "(respuesta vacía)");
    return null;
  }
  const candidatos = [limpio];
  const abre = limpio.indexOf("{");
  const cierra = limpio.lastIndexOf("}");
  if (abre >= 0 && cierra > abre) candidatos.push(limpio.slice(abre, cierra + 1));
  for (const candidato of candidatos) {
    try {
      const valor: unknown = JSON.parse(candidato);
      if (valor && typeof valor === "object" && !Array.isArray(valor)) return valor as RespuestaInvestigacion;
    } catch {
      /* se prueba el siguiente candidato */
    }
  }
  console.warn("⚠️ Investigación fitment: respuesta no parseable", limpio.slice(0, 240));
  return null;
}

/**
 * Lleva una medida escrita por el modelo a la forma del catálogo.
 *
 * No es cosmético: el modelo escribe «235/45 R19» con espacio (verificado
 * contra la API el 7-ago) y el regex estricto de `extractTireSizesFromUnknown`
 * no lo reconoce. Sin esta normalización el candidato correcto se caía en
 * silencio justo después de que el modelo por fin lo devolvía. Se usa el parser
 * del catálogo (tireSize.ts), que ya tolera espacios y guiones, para no tener
 * dos ideas distintas de qué es una medida.
 */
export function normalizarMedida(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const size = parseTireSize(valor);
  return size ? formatTireSize(size) : null;
}

/**
 * Rastrea medidas por toda la respuesta, en cualquier forma y con tolerancia.
 *
 * Es la red bajo la red: si el modelo ignoró el esquema y escribió la medida en
 * la prosa, esto la rescata igual. Justamente el caso Creta 2027, donde la
 * respuesta correcta existía dentro del texto y el código la tiraba.
 */
export function medidasDeCualquierForma(valor: unknown): string[] {
  const vistas = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node === "string") for (const size of extractTireSizes(node)) vistas.add(formatTireSize(size));
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") Object.values(node as Record<string, unknown>).forEach(walk);
  };
  walk(valor);
  return [...vistas].slice(0, 12);
}

/** Menor es mejor; se usa para ordenar y para quedarse con la mejor versión de una medida repetida. */
const RANGO_CONFIANZA: Record<ConfianzaFitment, number> = { alta: 0, media: 1, baja: 2 };

/** Lo que no sea uno de los tres niveles se toma como "baja": se conserva el dato, no la certeza. */
function confianzaDe(valor: unknown): ConfianzaFitment {
  const texto = String(valor ?? "").trim().toLowerCase();
  return texto === "alta" || texto === "media" ? texto : "baja";
}

/**
 * Ordena por aro del cliente primero y confianza después.
 *
 * Se ORDENA y no se filtra: si el cliente dice aro 19 y la investigación solo
 * trajo la medida de la versión de 17, esa medida sigue siendo información útil
 * (el aro pudo entenderse mal, o el carro trae rines cambiados). Filtrarla nos
 * devolvería a la lista vacía por otra puerta. El aro decide el ORDEN, y el
 * cruce contra el catálogo decide qué se le muestra al cliente.
 */
function ordenarCandidatos(candidatos: readonly CandidatoFitment[], aro: number | null | undefined): CandidatoFitment[] {
  const fueraDelAro = (c: CandidatoFitment) => (aro && parseTireSize(c.medida)?.rim !== aro ? 1 : 0);
  return [...candidatos].sort(
    (a, b) => fueraDelAro(a) - fueraDelAro(b) || RANGO_CONFIANZA[a.confianza] - RANGO_CONFIANZA[b.confianza],
  );
}

/**
 * Convierte lo que devolvió el modelo en candidatos utilizables.
 *
 * Nunca descarta por falta de respaldo — un candidato de confianza "baja" es
 * exactamente lo que el prompt pide que exista en lugar de la lista vacía, y
 * tirarlo aquí anularía el rediseño del prompt. Solo se descarta lo que no se
 * puede leer como medida.
 */
export function normalizarCandidatos(
  parsed: RespuestaInvestigacion | null | undefined,
  aro: number | null | undefined,
): CandidatoFitment[] {
  const porMedida = new Map<string, CandidatoFitment>();
  const crudos = Array.isArray(parsed?.candidatos) ? parsed.candidatos : [];
  for (const crudo of crudos) {
    if (!crudo || typeof crudo !== "object") continue;
    const registro = crudo as Record<string, unknown>;
    const medida = normalizarMedida(registro.medida);
    if (!medida) continue;
    const candidato: CandidatoFitment = {
      medida,
      confianza: confianzaDe(registro.confianza),
      porque: typeof registro.porque === "string" ? registro.porque.slice(0, 300) : "",
    };
    // Una misma medida puede venir dos veces (dos versiones); se queda la mejor
    // respaldada, que es la que el vendedor va a poder defender.
    const previo = porMedida.get(medida);
    if (!previo || RANGO_CONFIANZA[candidato.confianza] < RANGO_CONFIANZA[previo.confianza]) {
      porMedida.set(medida, candidato);
    }
  }

  if (!porMedida.size && parsed) {
    // El modelo no llenó "candidatos" pero puede haber escrito la medida en la
    // nota o en el campo viejo "sizes". Se rescata con confianza baja en vez de
    // devolver nada: esa era exactamente la falla del 7-ago.
    for (const medida of medidasDeCualquierForma(parsed)) {
      porMedida.set(medida, {
        medida,
        confianza: "baja",
        porque: "Medida mencionada en la investigación, sin ficha que la respalde.",
      });
    }
  }

  return ordenarCandidatos([...porMedida.values()], aro).slice(0, 4);
}

/**
 * Confianza del mejor candidato → estado del resultado.
 *
 * La investigación web nunca produce "verified": eso queda para la ficha curada
 * y para Wheel-Size. Lo más alto que puede decir la web es "reference", que en
 * el resto del bot significa «ofrécela diciendo su límite y sigue vendiendo».
 */
export function estadoDeCandidatos(
  candidatos: readonly CandidatoFitment[],
): "reference" | "ambiguous" | "not_found" {
  if (!candidatos.length) return "not_found";
  return candidatos[0].confianza === "alta" ? "reference" : "ambiguous";
}
