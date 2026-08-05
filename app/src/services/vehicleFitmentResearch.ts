import OpenAI from "openai";
import { config } from "../config.js";
import { lookupFitment } from "../domain/fitment.js";
import { extractTireSizesFromUnknown } from "../domain/fitmentResearch.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * El bot NO puede leer imágenes: pedir una foto deja al cliente en un callejón
 * sin salida (falla vista en producción — chat del Chevrolet Orlando, 5-ago).
 * La alternativa que sí vende: pedir la medida escrita del filo de la llanta.
 */
const PREGUNTA_MEDIDA_ESCRITA =
  "¿Me escribe la medida que dice el filo de la llanta? Es algo como 225/65R17 — con eso le cotizo de una.";

/** Reescribe cualquier pregunta que pida foto/imagen (incluidas las que redacta la investigación web). */
function sinPedirFoto(pregunta: string | null | undefined): string | null {
  if (!pregunta) return null;
  return /foto|imagen|selfie|captura/i.test(pregunta) ? PREGUNTA_MEDIDA_ESCRITA : pregunta;
}

export interface FitmentResearchResult {
  status: "verified" | "reference" | "ambiguous" | "not_found";
  vehicle: string;
  sizes: string[];
  note: string;
  nextQuestion: string | null;
  sources: Array<{ title: string; url: string }>;
  provider: "curated" | "wheel-size" | "web" | "none";
}

async function wheelSizeLookup(make: string, model: string, year: number | null): Promise<FitmentResearchResult | null> {
  if (!config.vehicleFitment.wheelSizeApiKey || !year) return null;
  const url = new URL("https://api.wheel-size.com/v2/search/by_model/");
  url.searchParams.set("make", make); url.searchParams.set("model", model);
  url.searchParams.set("year", String(year)); url.searchParams.set("region", "ladm");
  url.searchParams.set("user_key", config.vehicleFitment.wheelSizeApiKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Wheel-Size ${response.status}`);
  const payload = await response.json() as unknown;
  const sizes = extractTireSizesFromUnknown(payload);
  if (!sizes.length) return null;
  return {
    status: sizes.length === 1 ? "verified" : "reference",
    vehicle: `${make} ${model} ${year}`, sizes,
    note: sizes.length === 1
      ? "Medida encontrada para el mercado latinoamericano; la confirmación fina se hace en el local al instalar."
      : "Hay varias medidas OEM según versión. Ofrecer la más común como referencia diciendo su límite; no afirmarla como segura.",
    // Nunca pedir foto: el bot no puede leer imágenes y la conversación muere ahí.
    nextQuestion: sizes.length === 1 ? null : "¿Qué versión o motor tiene? O si prefiere, escríbame la medida que dice el filo de la llanta (ej. 225/65R17) y le cotizo de una.",
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

async function webLookup(make: string, model: string, year: number | null): Promise<FitmentResearchResult | null> {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return null;
  const vehicle = `${make} ${model}${year ? ` ${year}` : ""}`;
  const response = await openai.responses.create({
    model: config.openai.researchModel,
    tools: [{ type: "web_search", search_context_size: "low", user_location: { type: "approximate", country: "EC", city: "Quito", timezone: "America/Guayaquil" } }],
    input: `Investiga la medida OEM de llantas para ${vehicle} vendido en Ecuador/Latinoamérica. Prioriza manual del propietario o fabricante oficial. No adivines ni mezcles generaciones. Devuelve JSON estricto: {"status":"reference|ambiguous|not_found","sizes":["245/65R17"],"note":"...","nextQuestion":"..."}. Si versión, motor o mercado cambian la medida, status debe ser ambiguous y nextQuestion debe pedir UN solo dato discriminante.`,
  } as never);
  let parsed: { status?: string; sizes?: unknown; note?: string; nextQuestion?: string | null } = {};
  try { parsed = JSON.parse(response.output_text.replace(/^```json\s*|\s*```$/g, "")); } catch { /* sin salida estructurada segura */ }
  const sources = responseSources(response);
  const sizes = Array.isArray(parsed.sizes) ? extractTireSizesFromUnknown(parsed.sizes) : [];
  if (!sources.length || !sizes.length) return null;
  return {
    status: parsed.status === "reference" ? "reference" : "ambiguous",
    vehicle, sizes, provider: "web", sources,
    note: parsed.note?.slice(0, 500) ?? "Referencia encontrada en la web; falta confirmar la versión exacta.",
    nextQuestion: sinPedirFoto(parsed.nextQuestion?.slice(0, 220)) ?? PREGUNTA_MEDIDA_ESCRITA,
  };
}

export async function researchVehicleFitment(make: string, model: string, year: number | null): Promise<FitmentResearchResult> {
  const local = lookupFitment(make, model, year);
  if (local?.validated) return {
    status: "verified", vehicle: `${make} ${model}${year ? ` ${year}` : ""}`,
    sizes: local.sizes, note: local.note ?? "Medidas OEM registradas; confirmar versión.",
    nextQuestion: local.sizes.length > 1 ? `¿Qué versión es? O si prefiere, ${PREGUNTA_MEDIDA_ESCRITA}` : null,
    sources: local.sourceUrl ? [{ title: "Fuente del fabricante", url: local.sourceUrl }] : [], provider: "curated",
  };
  try { const result = await wheelSizeLookup(make, model, year); if (result) return result; } catch (error) {
    console.warn("⚠️ Wheel-Size no disponible:", error instanceof Error ? error.message : error);
  }
  try { const result = await webLookup(make, model, year); if (result) return result; } catch (error) {
    console.warn("⚠️ Investigación web de fitment no disponible:", error instanceof Error ? error.message : error);
  }
  if (local) return {
    status: "reference", vehicle: `${make} ${model}${year ? ` ${year}` : ""}`,
    sizes: local.sizes, note: "Referencia local no validada; no garantiza compatibilidad.",
    nextQuestion: PREGUNTA_MEDIDA_ESCRITA,
    sources: [], provider: "curated",
  };
  return { status: "not_found", vehicle: `${make} ${model}${year ? ` ${year}` : ""}`, sizes: [],
    note: "No se encontró una medida verificable. No afirmar compatibilidad.",
    nextQuestion: PREGUNTA_MEDIDA_ESCRITA,
    sources: [], provider: "none" };
}
