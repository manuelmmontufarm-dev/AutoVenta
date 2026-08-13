/**
 * Tabla de fitment vehículo → medidas OEM, curada para el mercado ecuatoriano.
 *
 * Desde el 13-ago-2026 la fuente principal es `assets/aplicaciones-vehiculos.json`
 * (122 modelos, 24 marcas), la tabla que armó el negocio con medidas por aro,
 * aros de fábrica y nivel de confianza por ficha. La tablita inline que vivía
 * aquí queda como respaldo para los pocos modelos que el archivo no cubre.
 *
 * La confianza de la ficha manda sobre el flujo:
 *  · `alta`  → validated: la investigación la trata como ficha OEM confiable.
 *  · `media`/`baja` → NO validated: el agente ofrece con reserva y pide
 *    confirmar (foto del flanco o etiqueta de la puerta), como dice la propia
 *    tabla: «Nunca adivinar».
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");

export interface FitmentEntry {
  make: string;
  model: string;
  /** Medidas comunes de fábrica, formato canónico "185/65R14". */
  sizes: string[];
  /** Aros que salieron de fábrica en ese modelo. Un aro fuera de esta lista = el cliente cambió de aro. */
  factoryRims?: number[];
  years?: string;
  validated: boolean;
  sourceUrl?: string;
  note?: string;
}

interface AplicacionCruda {
  marca: string;
  modelo: string;
  anios?: string;
  medidas_de_fabrica?: Array<{ medida: string; aro?: number; nota?: string }>;
  aros_de_fabrica?: number[];
  confianza?: "alta" | "media" | "baja";
  verificado_contra_fuente?: boolean;
  nota?: string;
}

/**
 * Respaldo inline: solo modelos que el archivo del negocio no trae.
 * (El resto de la tabla vieja se retiró: el archivo la reemplaza y ampliada.)
 */
const LEGADO: FitmentEntry[] = [
  {
    make: "toyota",
    model: "highlander",
    sizes: ["245/65R17", "245/55R19"],
    years: "2008-2013",
    validated: true,
    sourceUrl:
      "https://pressroom.toyota.com/2012-toyota-highlander-four-cylinder-v6-hybrid-models/",
    note: "2012: Base/SE 245/65R17; Limited 245/55R19. Confirmar versión y etiqueta de la puerta.",
  },
];

let tabla: FitmentEntry[] | null = null;

function cargar(): FitmentEntry[] {
  if (tabla) return tabla;
  try {
    const cruda = JSON.parse(
      readFileSync(path.join(ASSETS, "aplicaciones-vehiculos.json"), "utf8"),
    ) as { aplicaciones?: AplicacionCruda[] };
    const delArchivo: FitmentEntry[] = (cruda.aplicaciones ?? []).map((a) => ({
      make: a.marca.toLowerCase(),
      model: a.modelo.toLowerCase(),
      sizes: (a.medidas_de_fabrica ?? []).map((m) => m.medida.toUpperCase()),
      factoryRims: a.aros_de_fabrica ?? [],
      years: a.anios,
      validated: a.confianza === "alta",
      ...(a.verificado_contra_fuente
        ? { sourceUrl: "https://www.wheel-size.com" }
        : {}),
      note: [
        a.nota,
        a.confianza && a.confianza !== "alta"
          ? `Confianza ${a.confianza}: confirmar con el cliente (foto del flanco o etiqueta de la puerta).`
          : null,
      ].filter(Boolean).join(" ") || undefined,
    }));
    tabla = [...delArchivo, ...LEGADO];
  } catch (error) {
    console.error("⚠️ No se pudo cargar aplicaciones-vehiculos.json:", error);
    tabla = LEGADO;
  }
  return tabla;
}

export function fitmentTable(): FitmentEntry[] {
  return cargar();
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Busca medidas de fábrica para un vehículo. Matching laxo en make/model. */
export function lookupFitment(make: string, model: string, year?: number | null): FitmentEntry | null {
  const nMake = normalize(make);
  const nModel = normalize(model).replace(/[- ]/g, "");
  return (
    cargar().find((entry) => {
      // Los modelos del archivo pueden venir compuestos («H1 / Starex»,
      // «Cerato / Forte»): cada alias cuenta por separado.
      const alias = entry.model.split("/").map((m) => normalize(m).replace(/[- ]/g, "")).filter(Boolean);
      const yearMatches = !year || !entry.years || yearInRange(year, entry.years);
      const makeMatches =
        nMake.includes(normalize(entry.make).replace(/\(.*\)/, "").trim()) ||
        normalize(entry.make).includes(nMake);
      return (
        yearMatches &&
        makeMatches &&
        alias.some((a) => nModel.includes(a) || a.includes(nModel))
      );
    }) ?? null
  );
}

/**
 * ¿El aro que trae el cliente salió de fábrica en ese modelo?
 *
 * `null` = no se sabe (ficha sin aros o vehículo sin ficha): no afirmar nada.
 * `false` = cambió de aro → no sirve la medida OEM tal cual; corresponde
 * buscar equivalencia por diámetro en el aro nuevo (buscar_por_aro_y_tipo).
 */
export function aroEsDeFabrica(make: string, model: string, aro: number, year?: number | null): boolean | null {
  const entry = lookupFitment(make, model, year);
  if (!entry?.factoryRims?.length) return null;
  return entry.factoryRims.includes(aro);
}

function yearInRange(year: number, range: string): boolean {
  const [from, to = from] = range.split("-").map(Number);
  return Number.isFinite(from) && Number.isFinite(to) && year >= from && year <= to;
}
