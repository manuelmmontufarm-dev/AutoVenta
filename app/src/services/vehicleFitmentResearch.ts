import OpenAI from "openai";
import { config } from "../config.js";
import { lookupFitment } from "../domain/fitment.js";
import {
  conDobleVia,
  estadoDeCandidatos,
  ESQUEMA_CANDIDATOS,
  extractTireSizesFromUnknown,
  medidasDelAro,
  normalizarCandidatos,
  parseRespuestaInvestigacion,
  PREGUNTA_MEDIDA_ESCRITA,
  promptCandidatosFitment,
  type CandidatoFitment,
  type ConfianzaFitment,
} from "../domain/fitmentResearch.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export { PREGUNTA_MEDIDA_ESCRITA };
export type { CandidatoFitment };

export interface FitmentResearchResult {
  status: "verified" | "reference" | "ambiguous" | "not_found";
  vehicle: string;
  sizes: string[];
  /**
   * Las mismas medidas de `sizes` pero con su respaldo. `sizes` se mantiene
   * porque medio bot lo consume; `candidatos` es lo que permite a la tool
   * decirle al vendedor qué tan firme es cada una en vez de presentarlas todas
   * con el mismo peso.
   */
  candidatos: CandidatoFitment[];
  note: string;
  nextQuestion: string | null;
  sources: Array<{ title: string; url: string }>;
  provider: "curated" | "wheel-size" | "web" | "none";
}

/** Envuelve medidas ya confiables (ficha curada, Wheel-Size) en la forma de candidato. */
function comoCandidatos(sizes: readonly string[], confianza: ConfianzaFitment, porque: string): CandidatoFitment[] {
  return sizes.map((medida) => ({ medida, confianza, porque }));
}

async function wheelSizeLookup(
  make: string,
  model: string,
  year: number | null,
  aro: number | null,
): Promise<FitmentResearchResult | null> {
  if (!config.vehicleFitment.wheelSizeApiKey || !year) return null;
  const url = new URL("https://api.wheel-size.com/v2/search/by_model/");
  url.searchParams.set("make", make); url.searchParams.set("model", model);
  url.searchParams.set("year", String(year)); url.searchParams.set("region", "ladm");
  url.searchParams.set("user_key", config.vehicleFitment.wheelSizeApiKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Wheel-Size ${response.status}`);
  const payload = await response.json() as unknown;
  // Con aro del cliente la respuesta se recorta a ese aro: si él anda en 19, las
  // medidas de 16 de otra versión no son opciones, son ruido. Si el aro no
  // aparece, se devuelve null a propósito para que lo intente la web, que sí
  // puede razonar sobre generaciones y versiones.
  const sizes = medidasDelAro(extractTireSizesFromUnknown(payload), aro);
  if (!sizes.length) return null;
  return {
    status: sizes.length === 1 ? "verified" : "reference",
    vehicle: `${make} ${model} ${year}`, sizes,
    candidatos: comoCandidatos(sizes, "media", "Wheel-Size para el mercado latinoamericano."),
    note: sizes.length === 1
      ? "Medida encontrada para el mercado latinoamericano; la confirmación fina se hace en el local al instalar."
      : "Hay varias medidas OEM según versión. Ofrecer la más común como referencia diciendo su límite; no afirmarla como segura.",
    nextQuestion: sizes.length === 1
      ? null
      : `¿Qué versión o motor tiene? O si prefiere: ${PREGUNTA_MEDIDA_ESCRITA}`,
    sources: [{ title: "Wheel-Size API", url: "https://developer.wheel-size.com/api-data" }],
    provider: "wheel-size",
  };
}

function responseSources(response: unknown): Array<{ title: string; url: string }> {
  const found = new Map<string, string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.url === "string" && /^https?:\/\//.test(record.url)) {
      found.set(record.url, typeof record.title === "string" ? record.title : new URL(record.url).hostname);
    }
    Object.values(record).forEach(walk);
  };
  walk(response);
  return [...found].slice(0, 4).map(([url, title]) => ({ title, url }));
}

/**
 * Lo único que esta investigación necesita del mundo: pedirle una respuesta al
 * modelo. Se recibe como parámetro en vez de usar el cliente del módulo para
 * que el cableado (qué se manda, qué se hace con lo que vuelve) sea probable
 * sin red — ver `investigarCandidatosWeb`.
 */
export type CrearRespuesta = (peticion: Record<string, unknown>) => Promise<{ output_text: string }>;

/**
 * El cableado de la investigación web: arma la petición, la manda, y convierte
 * lo que vuelve en candidatos.
 *
 * Está exportada y recibe el cliente por parámetro por una razón concreta: el
 * corte por NODE_ENV que protege a `webLookup` de pegarle a la API en los tests
 * dejaba TODO este tramo sin una sola línea cubierta. Lo que se rompió el 7-ago
 * no fue el prompt ni el parser por separado —los dos tenían tests— sino la
 * unión: se mandaba una cosa y se leía otra. Eso es lo que se prueba aquí con
 * un `crear` falso.
 */
export async function investigarCandidatosWeb(
  crear: CrearRespuesta,
  make: string,
  model: string,
  year: number | null,
  aro: number | null,
): Promise<FitmentResearchResult | null> {
  const vehicle = `${make} ${model}${year ? ` ${year}` : ""}`;
  const peticion = {
    model: config.openai.researchModel,
    tools: [{ type: "web_search", search_context_size: "low", user_location: { type: "approximate", country: "EC", city: "Quito", timezone: "America/Guayaquil" } }],
    input: promptCandidatosFitment(vehicle, aro),
  };

  // Se pide salida estructurada, que es lo que obliga al modelo a llenar el
  // arreglo de candidatos en vez de contar la medida en la prosa. Si el modelo
  // configurado no la soporta, se reintenta en texto plano: el parser tolerante
  // rescata el JSON igual. Verificado el 7-ago contra la API — gpt-5.5 responde
  // bien por las dos vías, así que el reintento es red y no camino principal.
  let response: { output_text: string };
  try {
    response = await crear({ ...peticion, text: { format: ESQUEMA_CANDIDATOS } });
  } catch (error) {
    console.warn(
      "⚠️ Fitment: el modelo rechazó la salida estructurada, se reintenta en texto:",
      error instanceof Error ? error.message : error,
    );
    response = await crear(peticion);
  }

  const parsed = parseRespuestaInvestigacion(response.output_text);
  const candidatos = normalizarCandidatos(parsed, aro);
  // Se devuelve aunque no haya fuentes citadas. Antes se exigía `sources.length`
  // y eso convertía una investigación con la respuesta correcta en un
  // "not_found": el vendedor perdía la medida por un requisito de forma.
  if (!candidatos.length) return null;

  const nota = typeof parsed?.nota === "string" && parsed.nota.trim() ? parsed.nota.trim().slice(0, 500) : null;
  const pregunta = typeof parsed?.siguiente_pregunta === "string" ? parsed.siguiente_pregunta.slice(0, 220) : null;
  const resuelto = candidatos.length === 1 && candidatos[0].confianza === "alta";
  return {
    status: estadoDeCandidatos(candidatos),
    vehicle,
    sizes: candidatos.map((c) => c.medida),
    candidatos,
    provider: "web",
    sources: responseSources(response),
    note: nota ?? "Referencia encontrada en la web; falta confirmar la versión exacta.",
    // Una sola medida con ficha oficial no necesita repregunta; todo lo demás sí,
    // y si el modelo no redactó una, la doble vía (medida escrita o foto) sirve
    // para cualquier caso.
    nextQuestion: resuelto ? conDobleVia(pregunta) : conDobleVia(pregunta) ?? PREGUNTA_MEDIDA_ESCRITA,
  };
}

/**
 * La investigación web con el cliente real. El corte por entorno vive SOLO aquí:
 * es lo que evita que la suite le pegue a la API, y por eso la lógica de arriba
 * está afuera — si el corte envolviera el cableado, no habría forma de probarlo.
 */
async function webLookup(
  make: string,
  model: string,
  year: number | null,
  aro: number | null,
): Promise<FitmentResearchResult | null> {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return null;
  return investigarCandidatosWeb(
    (peticion) => openai.responses.create(peticion as never) as unknown as Promise<{ output_text: string }>,
    make,
    model,
    year,
    aro,
  );
}

/**
 * @param aro Aro/rin en pulgadas que dijo el cliente, si lo dijo. Es el dato
 * discriminante más barato que existe (ver medidasDelAro): sin él, el 7-ago la
 * investigación de una Creta 2027 devolvió «no encontrado» mientras ChatGPT,
 * con el mismo texto del cliente y el aro incluido, acertó la 235/45R19.
 */
export async function researchVehicleFitment(
  make: string,
  model: string,
  year: number | null,
  aro: number | null = null,
): Promise<FitmentResearchResult> {
  const vehicle = `${make} ${model}${year ? ` ${year}` : ""}`;
  const local = lookupFitment(make, model, year);
  if (local?.validated) {
    // La ficha curada también se recorta al aro del cliente; si su aro no está
    // en la ficha se devuelve completa (mejor una referencia con su límite
    // dicho que nada), pero la nota deja claro que ese aro no figura.
    const delAro = medidasDelAro(local.sizes, aro);
    const sizes = delAro.length ? delAro : local.sizes;
    const aroFueraDeFicha = Boolean(aro) && !delAro.length;
    return {
      status: sizes.length === 1 && !aroFueraDeFicha ? "verified" : "reference",
      vehicle,
      sizes,
      candidatos: comoCandidatos(
        sizes,
        aroFueraDeFicha ? "media" : "alta",
        aroFueraDeFicha ? `Medida OEM de fábrica; no corresponde al aro ${aro} que dijo el cliente.` : "Ficha OEM validada en la base del bot.",
      ),
      note: aroFueraDeFicha
        ? `La ficha de ese vehículo no registra aro ${aro}; estas son las medidas OEM de fábrica. No afirmar compatibilidad con el aro que tiene puesto.`
        : local.note ?? "Medidas OEM registradas; confirmar versión.",
      nextQuestion: sizes.length > 1 || aroFueraDeFicha ? `¿Qué versión es? O si prefiere: ${PREGUNTA_MEDIDA_ESCRITA}` : null,
      sources: local.sourceUrl ? [{ title: "Fuente del fabricante", url: local.sourceUrl }] : [],
      provider: "curated",
    };
  }
  try { const result = await wheelSizeLookup(make, model, year, aro); if (result) return result; } catch (error) {
    console.warn("⚠️ Wheel-Size no disponible:", error instanceof Error ? error.message : error);
  }
  try { const result = await webLookup(make, model, year, aro); if (result) return result; } catch (error) {
    console.warn("⚠️ Investigación web de fitment no disponible:", error instanceof Error ? error.message : error);
  }
  if (local) {
    const sizes = medidasDelAro(local.sizes, aro).length ? medidasDelAro(local.sizes, aro) : local.sizes;
    return {
      status: "reference", vehicle, sizes,
      candidatos: comoCandidatos(sizes, "baja", "Referencia local sin validar."),
      note: "Referencia local no validada; no garantiza compatibilidad.",
      nextQuestion: PREGUNTA_MEDIDA_ESCRITA,
      sources: [], provider: "curated",
    };
  }
  return { status: "not_found", vehicle, sizes: [], candidatos: [],
    note: "No se encontró una medida verificable. No afirmar compatibilidad.",
    nextQuestion: PREGUNTA_MEDIDA_ESCRITA,
    sources: [], provider: "none" };
}
