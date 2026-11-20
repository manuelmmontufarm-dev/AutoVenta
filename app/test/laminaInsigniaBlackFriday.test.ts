/**
 * LA INSIGNIA DE LA LÁMINA NO PROMETE DESCUENTO EN OPCIONES QUE NO LO TIENEN
 * (Competimotor, conv 469, 20-nov-2026): KENDA KR29 235/75R15 sin rebaja junto
 * a FALKEN WILDPEAK M/T 30X9.5R15 con Black Friday ($220 contra P2 $278.30)
 * salía «−21% DESCUENTO HOY en las 2 opciones». `iguales` se contaba solo entre
 * las que tienen descuento y el texto nombraba todas. Y con Black Friday la
 * insignia lo dice: «BLACK FRIDAY».
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "x";
process.env.DATABASE_URL ||= "postgresql://x@localhost/x";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const { optionsPosterDiaNoche } = await import("../src/render/diaNoche.js");

function textoDe(nodo: unknown): string {
  if (typeof nodo === "string") return nodo;
  if (Array.isArray(nodo)) return nodo.map(textoDe).join(" ");
  if (nodo && typeof nodo === "object") {
    const props = (nodo as { props?: { children?: unknown } }).props;
    return props ? textoDe(props.children) : "";
  }
  return "";
}

const BF = { nombre: "Black Friday", bajada: null, hasta: "lunes 30 de noviembre", precioEspecial: true };
const linea = (brand: string, design: string, sizeLabel: string, unit: number, pvp: number | null, conBF = false) => ({
  brand, design, sizeLabel, loadSpeedLabel: null, loadSpeedTranslation: null, quantity: 4,
  unitConIva: unit, pvpConIva: pvp, availability: "available" as const, golpesMeses: 12, fabricaAnios: 0,
  photoUri: "data:image/png;base64,iVBORw0KGgo=", medidaExacta: sizeLabel === "235/75R15",
  ...(conBF ? { temporada: BF } : {}),
});
const lamina = (lines: ReturnType<typeof linea>[]) =>
  textoDe(optionsPosterDiaNoche({ dateLabel: "20/11/2026", sizeLabel: "235/75R15", lines, cantidad: 4, medidaConocida: true }, "noche"));

// Conv 469: KR29 al P2 de siempre ($197.80) y la Falken M/T con Black Friday.
const KR29 = linea("KENDA", "KR29", "235/75R15", 197.8, null);
const FALKEN_MT = linea("FALKEN", "WILDPEAK M/T", "30X9.5R15", 220, 278.3, true);

describe("insignia de la lámina con Black Friday", () => {
  it("conv 469: una sola con descuento → la nombra, no «en las 2 opciones»", () => {
    const t = lamina([KR29, FALKEN_MT]);
    expect(t).toContain("−21%");
    expect(t).not.toContain("en las 2 opciones");
    expect(t).toContain("en Falken");
    expect(t).toContain("BLACK FRIDAY");
  });

  it("las 2 con Black Friday y el mismo porcentaje → «en las 2 opciones» y BLACK FRIDAY", () => {
    const t = lamina([linea("TOWNHALL", "TH-161", "235/75R15", 42.05, 49.47, true), linea("KENDA", "KR203", "235/75R15", 84.15, 99, true)]);
    expect(t).toContain("−15%");
    expect(t).toContain("en las 2 opciones");
    expect(t).toContain("BLACK FRIDAY");
  });

  it("dos de la misma marca, una sola con descuento → se nombra el modelo, no la marca", () => {
    const t = lamina([linea("KENDA", "KR28", "235/75R15", 130, 152.95, true), linea("KENDA", "KR29", "235/75R15", 197.8, null)]);
    expect(t).toContain("en Kenda KR28");
    expect(t).not.toMatch(/en Kenda(?! KR28)/);
  });

  it("sin Black Friday y todas con el mismo descuento: igual que siempre", () => {
    const t = lamina([linea("KENDA", "KR28", "235/75R15", 75, 100), linea("FALKEN", "AT3W", "235/75R15", 150, 200)]);
    expect(t).toContain("DESCUENTO HOY");
    expect(t).toContain("en las 2 opciones");
    expect(t).not.toContain("BLACK FRIDAY");
  });
});
