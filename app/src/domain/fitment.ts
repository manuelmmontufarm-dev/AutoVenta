/**
 * Tabla de fitment vehículo → medidas OEM, curada para el mercado ecuatoriano.
 *
 * No existe dataset libre de fitment (investigado jul-2026; la única API seria
 * es Wheel-Size a $450/año). Esta tabla cubre los modelos más vendidos en
 * Ecuador y la valida el dueño del negocio.
 *
 * ⚠️ TODAS las entradas están marcadas `validated: false` hasta que el dueño
 * las revise — el agente SIEMPRE agrega un disclaimer si validated es false.
 */

export interface FitmentEntry {
  make: string;
  model: string;
  /** Medidas comunes de fábrica, formato canónico "185/65R14". */
  sizes: string[];
  years?: string;
  validated: boolean;
  sourceUrl?: string;
  note?: string;
}

export const FITMENT_TABLE: FitmentEntry[] = [
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
  { make: "chevrolet", model: "sail", sizes: ["185/60R14", "185/55R15"], validated: false },
  { make: "chevrolet", model: "aveo", sizes: ["185/60R14", "185/55R15"], validated: false },
  { make: "chevrolet", model: "spark", sizes: ["155/80R13", "165/65R14"], validated: false },
  { make: "chevrolet", model: "d-max", sizes: ["245/70R16", "255/60R18"], validated: false },
  { make: "chevrolet", model: "onix", sizes: ["185/65R15", "195/55R16"], validated: false },
  { make: "suzuki", model: "grand vitara", sizes: ["225/70R16", "215/65R16"], validated: false },
  { make: "suzuki", model: "vitara", sizes: ["215/60R16", "215/55R17"], validated: false },
  { make: "suzuki", model: "swift", sizes: ["185/65R15", "195/55R16"], validated: false },
  { make: "toyota", model: "hilux", sizes: ["265/65R17", "255/70R16"], validated: false },
  { make: "toyota", model: "corolla", sizes: ["205/55R16", "215/45R17"], validated: false },
  { make: "toyota", model: "yaris", sizes: ["185/60R15", "195/50R16"], validated: false },
  { make: "toyota", model: "fortuner", sizes: ["265/65R17", "265/60R18"], validated: false },
  { make: "kia", model: "rio", sizes: ["185/65R15", "205/45R17"], validated: false },
  { make: "kia", model: "sportage", sizes: ["225/60R17", "235/55R18"], validated: false },
  { make: "kia", model: "picanto", sizes: ["175/65R14", "185/55R15"], validated: false },
  { make: "kia", model: "soluto", sizes: ["185/65R15"], validated: false },
  { make: "hyundai", model: "accent", sizes: ["185/65R15", "195/55R16"], validated: false },
  { make: "hyundai", model: "tucson", sizes: ["225/60R17", "235/55R18"], validated: false },
  { make: "hyundai", model: "grand i10", sizes: ["165/65R14", "175/60R15"], validated: false },
  { make: "nissan", model: "sentra", sizes: ["205/60R16", "215/50R17"], validated: false },
  { make: "nissan", model: "frontier", sizes: ["255/70R16", "265/60R18"], validated: false },
  { make: "nissan", model: "x-trail", sizes: ["225/65R17", "225/60R18"], validated: false },
  { make: "mazda", model: "3", sizes: ["205/60R16", "215/45R18"], validated: false },
  { make: "mazda", model: "bt-50", sizes: ["255/70R16", "265/65R17"], validated: false },
  { make: "mazda", model: "cx-5", sizes: ["225/65R17", "225/55R19"], validated: false },
  { make: "renault", model: "duster", sizes: ["215/65R16", "215/60R17"], validated: false },
  { make: "renault", model: "kwid", sizes: ["165/70R14"], validated: false },
  { make: "ford", model: "ranger", sizes: ["255/70R16", "265/60R18"], validated: false },
  { make: "ford", model: "ecosport", sizes: ["205/60R16", "205/50R17"], validated: false },
  { make: "volkswagen", model: "gol", sizes: ["185/60R15"], validated: false },
];

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
    FITMENT_TABLE.find((entry) => {
      const eModel = entry.model.replace(/[- ]/g, "");
      const yearMatches = !year || !entry.years || yearInRange(year, entry.years);
      return (
        yearMatches &&
        (nMake.includes(entry.make) || entry.make.includes(nMake)) &&
        (nModel.includes(eModel) || eModel.includes(nModel))
      );
    }) ?? null
  );
}

function yearInRange(year: number, range: string): boolean {
  const [from, to = from] = range.split("-").map(Number);
  return Number.isFinite(from) && Number.isFinite(to) && year >= from && year <= to;
}
