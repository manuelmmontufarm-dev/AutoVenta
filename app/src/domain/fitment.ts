/**
 * Tabla de fitment vehículo → medidas OEM, curada para el mercado ecuatoriano.
 *
 * Desde el 13-ago-2026 la fuente principal es `assets/aplicaciones-vehiculos.json`
 * (la tabla que armó el negocio con medidas por aro, aros de fábrica y nivel de
 * confianza por ficha). La tablita inline que vivía aquí queda como respaldo
 * para los pocos modelos que el archivo no cubre.
 *
 * La confianza de la ficha viaja con la entrada (`confianza`) y la decide el
 * flujo de investigación, no esta tabla:
 *  · `alta`  → validated: ficha OEM confiable, se afirma.
 *  · `media` → se usa como referencia (desde el 1-sep): se ofrece con su
 *    límite dicho y se pide la medida escrita o la foto antes de cotizar.
 *  · `baja`  → último recurso, solo si la investigación web tampoco dio.
 *
 * MATCHEO POR PALABRAS (1-sep-2026). El cliente escribe «Gran Vitara», «Vitara
 * SZ 4x2», «Susuki Sz» o «D-Max Hi Ride»; la ficha dice «Grand Vitara SZ» o
 * «D-Max». Comparar cadenas enteras con `includes` perdía la mitad de eso —
 * medido contra los 72 vehículos distintos preguntados en producción. Ahora se
 * comparan palabras: cada palabra del cliente tiene que empezar como alguna de
 * la ficha (o al revés), y gana la ficha con más palabras coincidentes, para
 * que «Corolla Cross» prefiera su ficha y no la del Corolla a secas.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");

export type ConfianzaFicha = "alta" | "media" | "baja";

export interface FitmentEntry {
  make: string;
  model: string;
  /** Medidas comunes de fábrica, formato canónico "185/65R14". */
  sizes: string[];
  /** Aros que salieron de fábrica en ese modelo. Un aro fuera de esta lista = el cliente cambió de aro. */
  factoryRims?: number[];
  years?: string;
  validated: boolean;
  /** Nivel declarado por la tabla del negocio. `alta` ⇔ validated. */
  confianza: ConfianzaFicha;
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
    confianza: "alta",
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
    const delArchivo: FitmentEntry[] = (cruda.aplicaciones ?? []).map((a) => {
      const confianza: ConfianzaFicha = a.confianza === "alta" || a.confianza === "media" ? a.confianza : "baja";
      return {
        make: a.marca.toLowerCase(),
        model: a.modelo.toLowerCase(),
        sizes: (a.medidas_de_fabrica ?? []).map((m) => m.medida.toUpperCase()),
        factoryRims: a.aros_de_fabrica ?? [],
        years: a.anios,
        validated: confianza === "alta",
        confianza,
        ...(a.verificado_contra_fuente
          ? { sourceUrl: "https://www.wheel-size.com" }
          : {}),
        note: [
          a.nota,
          confianza !== "alta"
            ? `Confianza ${confianza}: confirmar con el cliente (foto del flanco o etiqueta de la puerta).`
            : null,
        ].filter(Boolean).join(" ") || undefined,
      };
    });
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

/**
 * Palabras que describen la versión o la carrocería, no el modelo. Si contaran
 * como palabras del modelo, «Vitara SZ 4x2» no encontraría «Grand Vitara SZ» y
 * «Yaris sedan» no encontraría «Yaris».
 */
const RUIDO = new Set([
  "4x4", "4x2", "4wd", "2wd", "awd", "doble", "cabina", "simple", "sencilla", "cd", "cs",
  "sedan", "hatchback", "hb", "clasico", "clasica", "puertas", "puerta", "turbo", "diesel",
  "gasolina", "full", "std", "base", "automatico", "automatica", "manual", "mt", "at",
  "de", "del", "la", "el", "version", "modelo", "camioneta", "carro", "auto", "suv",
]);

/** Sinónimos y errores frecuentes del cliente → forma de la ficha. */
const SINONIMOS: Record<string, string> = {
  gran: "grand",
  susuki: "suzuki",
  suzuky: "suzuki",
  toyoya: "toyota",
  chevy: "chevrolet",
  vw: "volkswagen",
  nisan: "nissan",
  hiunday: "hyundai",
  hundai: "hyundai",
  hyundai: "hyundai",
  jetur: "jetour",
};

/** «D-Max Hi Ride 2023» → ["dmax", "hi", "ride"] (sin año, sin ruido). */
export function palabrasDeModelo(texto: string): string[] {
  return normalize(texto)
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/[.,;:()\[\]"']/g, " ")
    .split(/\s+/)
    .map((p) => p.replace(/-/g, ""))
    .map((p) => SINONIMOS[p] ?? p)
    .filter((p) => p && !RUIDO.has(p) && !/^\d+$/.test(p));
}

function mismaPalabra(a: string, b: string): boolean {
  if (a === b) return true;
  // Prefijo de al menos 3 letras: «gran» ~ «grand», «fortun» ~ «fortuner».
  // Con menos de 3 se cuelan coincidencias por una sola letra.
  const corta = a.length <= b.length ? a : b;
  const larga = a.length <= b.length ? b : a;
  return corta.length >= 3 && larga.startsWith(corta);
}

/**
 * Puntaje de una ficha para lo que escribió el cliente. 0 = no matchea.
 * Cuenta palabras coincidentes y suma un punto si coincide en las dos
 * direcciones (todas las del cliente están en la ficha Y viceversa).
 */
function puntaje(palabrasCliente: string[], alias: string): number {
  const palabrasFicha = palabrasDeModelo(alias);
  if (!palabrasCliente.length || !palabrasFicha.length) return 0;
  const clienteEnFicha = palabrasCliente.filter((p) => palabrasFicha.some((f) => mismaPalabra(p, f)));
  const fichaEnCliente = palabrasFicha.filter((f) => palabrasCliente.some((p) => mismaPalabra(p, f)));
  const todasDelCliente = clienteEnFicha.length === palabrasCliente.length;
  const todasDeLaFicha = fichaEnCliente.length === palabrasFicha.length;
  if (!todasDelCliente && !todasDeLaFicha) return 0;
  return Math.max(clienteEnFicha.length, fichaEnCliente.length) * 2 + (todasDelCliente && todasDeLaFicha ? 1 : 0);
}

function marcaCoincide(make: string, entry: FitmentEntry): boolean {
  const nMake = palabrasDeModelo(make).join("");
  const deFicha = normalize(entry.make);
  const principal = deFicha.replace(/\(.*\)/, "").trim().replace(/\s+/g, "");
  const parentesis = [...deFicha.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim().replace(/\s+/g, ""));
  return [principal, ...parentesis].some((alias) => alias && (nMake.includes(alias) || alias.includes(nMake)));
}

/**
 * Busca medidas de fábrica para un vehículo. Matching por palabras en el
 * modelo, laxo en la marca, estricto en el año si la ficha trae rango.
 */
export function lookupFitment(make: string, model: string, year?: number | null): FitmentEntry | null {
  const palabrasCliente = palabrasDeModelo(model);
  // El cliente puede escribir la marca dentro del modelo («Suzuki SZ» con
  // marca «Suzuki»): esas palabras no cuentan para el modelo.
  const palabrasMarca = new Set(palabrasDeModelo(make));
  const soloModelo = palabrasCliente.filter((p) => !palabrasMarca.has(p));
  const palabras = soloModelo.length ? soloModelo : palabrasCliente;

  let mejor: { entry: FitmentEntry; puntos: number } | null = null;
  for (const entry of cargar()) {
    if (!marcaCoincide(make, entry)) continue;
    if (year && entry.years && !yearInRange(year, entry.years)) continue;
    // Los modelos del archivo pueden venir compuestos («H1 / Starex»,
    // «Cerato / Forte»): cada alias cuenta por separado.
    const alias = entry.model.split("/").map((m) => m.trim()).filter(Boolean);
    const puntos = Math.max(0, ...alias.map((a) => puntaje(palabras, a)));
    if (puntos > (mejor?.puntos ?? 0)) mejor = { entry, puntos };
  }
  return mejor?.entry ?? null;
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
