/**
 * El sello de medida en la pieza de opciones.
 *
 * La pieza se llena hasta con tres llantas y, para lograrlo, a veces entran
 * equivalentes de otra medida. Eso es correcto —son llantas que sí le montan—
 * pero la tarjeta no mostraba la medida por ningún lado: tres medidas
 * distintas se veían idénticas. Aquí se verifica que cada una salga marcada.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const { optionsPoster } = await import("../src/render/depotPosters.js");
const { resolveTheme } = await import("../src/render/depotDesign.js");

const linea = (design: string, sizeLabel: string, medidaExacta: boolean | null) => ({
  brand: "FALKEN", design, sizeLabel,
  loadSpeedLabel: "112T", loadSpeedTranslation: null,
  quantity: 4, unitConIva: 200, pvpConIva: 260,
  availability: "available" as const, golpesMeses: 18, fabricaAnios: 5,
  photoUri: "data:image/png;base64,iVBORw0KGgo=",
  ...(medidaExacta === null ? {} : { medidaExacta }),
});

/** Todo el texto del árbol de nodos, para poder afirmar qué se ve. */
function textoDe(nodo: unknown): string {
  if (typeof nodo === "string") return nodo;
  if (Array.isArray(nodo)) return nodo.map(textoDe).join(" ");
  if (nodo && typeof nodo === "object") {
    const props = (nodo as { props?: { children?: unknown } }).props;
    return props ? textoDe(props.children) : "";
  }
  return "";
}

const render = (lines: ReturnType<typeof linea>[]) =>
  textoDe(optionsPoster({ dateLabel: "14/08/2026", sizeLabel: "265/70R17", lines }, resolveTheme("depotRojo", "exo")));

describe("sello de medida en las opciones", () => {
  it("la medida exacta sale marcada en verde, con su medida", () => {
    const texto = render([linea("WILDPEAK A/T 4W", "265/70R17", true)]);
    expect(texto).toContain("265/70R17 · MEDIDA EXACTA");
    expect(texto).not.toContain("NO ES SU MEDIDA");
  });

  it("la equivalente dice que NO es su medida y por qué le entra", () => {
    const texto = render([linea("KR628", "265/65R17", false)]);
    expect(texto).toContain("265/65R17 · NO ES SU MEDIDA");
    expect(texto).toContain("Le entra por el aro 17");
  });

  it("con alguna equivalente, el rótulo deja de prometer «TODO EN TU MEDIDA» y sale el aviso", () => {
    const texto = render([
      linea("WILDPEAK A/T 4W", "265/70R17", true),
      linea("KR628", "265/65R17", false),
    ]);
    expect(texto).toContain("OPCIONES QUE LE MONTAN");
    expect(texto).not.toContain("TODO EN TU MEDIDA");
    expect(texto).toContain("OJO");
    expect(texto).toContain("NO son su medida exacta");
  });

  it("si TODAS son exactas, no hay aviso rojo y vuelve «TODO EN TU MEDIDA»", () => {
    const texto = render([
      linea("WILDPEAK A/T 4W", "265/70R17", true),
      linea("WILDPEAK M/T", "265/70R17", true),
    ]);
    expect(texto).toContain("TODO EN TU MEDIDA");
    expect(texto).not.toContain("OJO");
  });

  it("sin medida pedida (llegó por vehículo o aro) no se marca nada", () => {
    const texto = render([linea("WILDPEAK A/T 4W", "265/70R17", null)]);
    expect(texto).not.toContain("MEDIDA EXACTA");
    expect(texto).not.toContain("NO ES SU MEDIDA");
  });
});
