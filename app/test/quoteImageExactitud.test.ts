/**
 * Conv 13905: el cliente escribió 255/70 R16, tire_size=255/70R16 y las tres
 * SKUs eran 255/70R16 — pero la pieza salió «OPCIONES EN SU ARO RIN 16» con
 * sellos ámbar «LE MONTA». Dos fallas: `medidaPedida` no llegaba al render, y
 * `marcarExactitud` comparaba etiquetas literales del catálogo en vez de la
 * medida canónica.
 */
import { describe, expect, it } from "vitest";
import { medidaEstaPedida } from "../src/domain/medidaPedida.js";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const { optionsPoster } = await import("../src/render/depotPosters.js");
const { resolveTheme } = await import("../src/render/depotDesign.js");

const linea = (design: string, sizeLabel: string, medidaPedida: string) => ({
  brand: "FALKEN",
  design,
  sizeLabel,
  loadSpeedLabel: "117T",
  loadSpeedTranslation: null,
  quantity: 4,
  unitConIva: 200,
  pvpConIva: 260,
  availability: "available" as const,
  golpesMeses: 18,
  fabricaAnios: 5,
  photoUri: "data:image/png;base64,iVBORw0KGgo=",
  medidaExacta: medidaEstaPedida(sizeLabel, [medidaPedida]),
});

function textoDe(nodo: unknown): string {
  if (typeof nodo === "string") return nodo;
  if (Array.isArray(nodo)) return nodo.map(textoDe).join(" ");
  if (nodo && typeof nodo === "object") {
    const props = (nodo as { props?: { children?: unknown } }).props;
    return props ? textoDe(props.children) : "";
  }
  return "";
}

const tema = resolveTheme("depotRojo", "exo");

describe("exactitud de medida en la pieza de opciones", () => {
  it("255/70R16 pedida marca la etiqueta corta como MEDIDA EXACTA", () => {
    const medidaPedida = "255/70R16";
    const texto = textoDe(
      optionsPoster(
        {
          dateLabel: "01 / 09 / 2026",
          sizeLabel: medidaPedida,
          medidaConocida: true,
          lines: [
            linea("WILDPEAK A/T 4W", "255/70R16", medidaPedida),
            linea("KOMET KR203", "255/70R16", medidaPedida),
            linea("R380 WINRUN", "255/70R16", medidaPedida),
          ],
        },
        tema,
      ),
    );
    expect(texto).toContain("TODO EN TU MEDIDA");
    expect(texto).toContain("255/70R16 · MEDIDA EXACTA");
    expect(texto).not.toContain("LE MONTA");
    expect(texto).not.toContain("OPCIONES EN SU ARO");
  });

  it("la etiqueta larga del catálogo también sale verde con medidaPedida 255/70R16", () => {
    const medidaPedida = "255/70R16";
    const etiquetaCatalogo = "LT255/70R16 121/118S";
    expect(medidaEstaPedida(etiquetaCatalogo, [medidaPedida])).toBe(true);

    const texto = textoDe(
      optionsPoster(
        {
          dateLabel: "01 / 09 / 2026",
          sizeLabel: medidaPedida,
          medidaConocida: true,
          lines: [linea("WILDPEAK A/T 4W", etiquetaCatalogo, medidaPedida)],
        },
        tema,
      ),
    );
    expect(texto).toContain(`${etiquetaCatalogo} · MEDIDA EXACTA`);
    expect(texto).not.toContain("LE MONTA");
  });
});
