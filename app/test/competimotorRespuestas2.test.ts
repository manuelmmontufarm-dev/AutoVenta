/**
 * SEGUNDA TANDA DE RESPUESTAS DE JENNY (18-nov-2026, noche).
 *
 * - Envío a otras ciudades: lo paga el cliente. El «podemos hacer envío gratis»
 *   por Black Friday NO está confirmado: no se promete.
 * - Mantenimiento cada 10.000 km (con 2 o 4 llantas): rotación de llantas,
 *   revisión mecánica y nitrógeno gratis.
 * - Instalación: hora y media, porque se hace un chequeo general del carro.
 * - Origen: Falken hecha en Tailandia, tecnología japonesa; Winrun hecha en
 *   China; Maxxis y Kenda hechas en China, tecnología taiwanesa.
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { readFileSync } = await import("node:fs");
const { negocio } = await import("../src/negocio/index.js");
const { faltantesDelPerfil } = await import("../src/negocio/identidad.js");
const { politica } = await import("../src/negocio/politica.js");
const { respaldoDeMarca, respaldoCompleto } = await import("../src/domain/respaldoMarcas.js");
const { buildSystemPrompt } = await import("../src/agent/prompts.js");
const { hechoDelNegocio, hechoDeOrigenDeMarcas } = await import("../src/services/guardian.js");
const { quotePosterDiaNoche } = await import("../src/render/diaNoche.js");

const hechos = (politica.hechosConfirmados ?? []).join(" ");

function textoDe(nodo: unknown): string {
  if (typeof nodo === "string") return nodo;
  if (Array.isArray(nodo)) return nodo.map(textoDe).join(" ");
  if (nodo && typeof nodo === "object") {
    const props = (nodo as { props?: { children?: unknown } }).props;
    return props ? textoDe(props.children) : "";
  }
  return "";
}

describe("envíos: los paga el cliente, sin envío gratis", () => {
  it("el hecho dice quién paga y deja el costo al asesor", () => {
    expect(hechos).toMatch(/Laar Courier o Transportes Bemaut/);
    expect(hechos).toMatch(/el env[ií]o lo paga el cliente/i);
    expect(hechos).not.toMatch(/qui[eé]n paga el env[ií]o.*asesor/i);
    expect(hechos).toMatch(/cu[aá]nto cuesta.*asesor/i);
  });

  it("nadie promete envío gratis: ni el prompt, ni el guardián, ni el conocimiento", () => {
    for (const texto of [buildSystemPrompt(), hechoDelNegocio() ?? "", JSON.stringify(respaldoCompleto())]) {
      expect(texto).not.toMatch(/env[ií]o gratis|gratis el env[ií]o/i);
    }
  });
});

describe("mantenimiento cada 10.000 km: qué incluye", () => {
  it("rotación de llantas, revisión mecánica y nitrógeno, en el hecho y en el conocimiento", () => {
    for (const texto of [hechos, respaldoCompleto().serviciosIncluidos.join(" ")]) {
      expect(texto).toMatch(/rotaci[oó]n de llantas, revisi[oó]n mec[aá]nica y nitr[oó]geno/i);
      expect(texto).not.toMatch(/qu[eé] incluye no est[aá] confirmado/i);
    }
  });

  it("y en el INCLUYE de una base nueva, desde 2 llantas", () => {
    expect(negocio.beneficiosDeArranque).toContainEqual({
      text: "Mantenimiento cada 10.000 km: rotación, revisión mecánica y nitrógeno (comprando 2 o 4 llantas)",
      minQuantity: 2,
    });
  });
});

describe("instalación: hora y media", () => {
  it("con el chequeo general del carro, por orden de llegada o con cita", () => {
    expect(hechos).toMatch(/hora y media/);
    expect(hechos).toMatch(/chequeo general/);
    expect(hechos).toMatch(/orden de llegada y tambi[eé]n con cita/);
    expect(hechos).not.toMatch(/cu[aá]nto se demora no est[aá] confirmado/i);
    expect(buildSystemPrompt()).toMatch(/hora y media/);
  });
});

describe("origen por marca: dónde se hace y de qué tecnología", () => {
  const casos = [
    { marca: "FALKEN", pais: "Tailandia", tecnologia: /japonesa/ },
    { marca: "WINRUN", pais: "China", tecnologia: null },
    { marca: "MAXXIS", pais: "China", tecnologia: /taiwanesa/ },
    { marca: "KENDA", pais: "China", tecnologia: /taiwanesa/ },
  ];
  for (const { marca, pais, tecnologia } of casos) {
    it(`${marca}: hecha en ${pais}`, () => {
      const r = respaldoDeMarca(marca)!;
      expect(r.origen.pais).toBe(pais);
      if (tecnologia) expect(r.origen.fraseDeVenta).toMatch(tecnologia);
    });
  }

  it("el guardián tiene el país de las cuatro como hecho", () => {
    const hecho = hechoDeOrigenDeMarcas() ?? "";
    expect(hecho).toContain("FALKEN: Tailandia");
    expect(hecho).toContain("WINRUN: China");
    expect(hecho).toContain("MAXXIS: China");
    expect(hecho).toContain("KENDA: China");
  });

  it("el conocimiento de modelos ya no dice otra cosa", () => {
    const modelos = JSON.parse(readFileSync(new URL("../assets/mundillantas/conocimiento-modelos.json", import.meta.url), "utf8"));
    expect(modelos.temas.origen).toMatch(/Falken hecha en Tailandia/);
    expect(modelos.temas.origen).not.toMatch(/Winrun china, una l[ií]nea de Kenda/);
  });

  it("la pieza dibuja el país donde se hace y la tecnología (Falken: TAILANDIA · tecnología japonesa)", () => {
    const linea = (brand: string) => ({
      brand, design: "ZE310", sizeLabel: "205/55R16", loadSpeedLabel: "91V", loadSpeedTranslation: null,
      quantity: 4, unitConIva: 80, pvpConIva: null, availability: "available" as const,
      golpesMeses: 18, fabricaAnios: 1.5, photoUri: "data:image/png;base64,iVBORw0KGgo=",
    });
    const de = (brand: string) => textoDe(quotePosterDiaNoche({ number: "COT-1", dateLabel: "18 / 11 / 2026", line: linea(brand), total: 320 }, "noche"));
    expect(de("FALKEN")).toMatch(/TAILANDIA\s+•\s+tecnología japonesa/);
    expect(de("FALKEN")).not.toContain("JAPÓN");
    expect(de("KENDA")).toMatch(/CHINA\s+•\s+tecnología taiwanesa/);
    expect(de("MAXXIS")).toMatch(/CHINA\s+•\s+tecnología taiwanesa/);
    expect(de("WINRUN")).toMatch(/CHINA/);
    expect(de("WINRUN")).not.toMatch(/alemana/);
  });
});

describe("lo respondido sale de los pendientes; lo que falta, queda", () => {
  it("sin país, sin qué incluye, sin demora, sin quién paga; el costo del envío y la promo de diciembre siguen", () => {
    const f = faltantesDelPerfil(negocio).join(" | ");
    expect(f).not.toMatch(/pa[ií]s de origen|qu[eé] incluye|cu[aá]nto demora|qui[eé]n paga/i);
    expect(f).toMatch(/cu[aá]nto cuesta/i);
    expect(f).toMatch(/diciembre/i);
  });
});
