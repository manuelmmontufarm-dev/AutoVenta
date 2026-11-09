/**
 * Mundillantas, 8-nov-2026 (Jenny): «comprando las 4 llantas incluye
 * alineación, balanceo, nitrógeno y enllantaje, y si llevan una sola llanta
 * incluye solo balanceo, nitrógeno y enllantaje».
 *
 * Fija las tres piezas que lo hacen verdad: el filtro por cantidad (la franja
 * de la pieza), la línea de HECHO para el vendedor (sin ella contestaba «se lo
 * confirma el asesor» a «¿incluye alineación?») y el perfil que lo siembra.
 */
import { describe, expect, it } from "vitest";
import type { Benefit } from "../src/services/benefits.js";
import { MUNDILLANTAS } from "../src/negocio/negocios/mundillantas.js";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { applicableBenefits, lineaDeBeneficiosPorCantidad } = await import("../src/services/benefits.js");

const beneficio = (id: number, text: string, minQuantity: number | null = null): Benefit => ({
  id, text, position: id, active: true, brand: null, minQuantity, store: null, startsAt: null, expiresAt: null,
});

const DE_MUNDILLANTAS: Benefit[] = (MUNDILLANTAS.beneficiosDeArranque ?? []).map((b, i) =>
  beneficio(i + 1, b.text, b.minQuantity ?? null));

describe("INCLUYE de Mundillantas según cuántas llantas lleva", () => {
  it("el perfil siembra los dos: lo de siempre y la alineación con mínimo 4", () => {
    expect(DE_MUNDILLANTAS.map((b) => [b.text, b.minQuantity])).toEqual([
      ["Enllantaje, balanceo y nitrógeno", null],
      ["Alineación (comprando las 4 llantas)", 4],
    ]);
  });

  it("con 4 llantas (o más) la pieza imprime también la alineación", () => {
    for (const quantity of [4, 6]) {
      expect(applicableBenefits(DE_MUNDILLANTAS, { quantity }).map((b) => b.text)).toEqual([
        "Enllantaje, balanceo y nitrógeno",
        "Alineación (comprando las 4 llantas)",
      ]);
    }
  });

  it("con 1, 2 o 3 llantas NO hay alineación", () => {
    for (const quantity of [1, 2, 3]) {
      expect(applicableBenefits(DE_MUNDILLANTAS, { quantity }).map((b) => b.text)).toEqual([
        "Enllantaje, balanceo y nitrógeno",
      ]);
    }
  });

  it("el vendedor recibe la alineación como hecho CON su condición", () => {
    const linea = lineaDeBeneficiosPorCantidad(DE_MUNDILLANTAS.filter((b) => b.minQuantity != null));
    expect(linea).toContain("Alineación (comprando las 4 llantas) → SOLO comprando 4 llantas o más");
    expect(linea).toContain("NO va incluido");
  });

  it("sin beneficios por cantidad (Depot) no hay línea nueva", () => {
    expect(lineaDeBeneficiosPorCantidad([])).toBeNull();
  });
});

describe("la pieza antes de elegir local habla por las dos marcas (8-nov)", async () => {
  const { identidadDeLaPieza, localesDeIdentidad } = await import("../src/negocio/identidad.js");
  it("sin local: sin identidad, y el pie lista los tres locales (Competimotor incluido)", () => {
    const id = identidadDeLaPieza(MUNDILLANTAS, null);
    expect(id).toBeUndefined();
    expect(localesDeIdentidad(MUNDILLANTAS, id).map((l) => l.nombreCorto)).toEqual([
      "Mundillantas Falken", "Mundillantas Kenda", "Competimotor",
    ]);
  });
  it("con local elegido: la marca de ese local", () => {
    expect(identidadDeLaPieza(MUNDILLANTAS, "competimotor")).toBe("competimotor");
    expect(identidadDeLaPieza(MUNDILLANTAS, "local2")).toBe("mundillantas");
  });
});
