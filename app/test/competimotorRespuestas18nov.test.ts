/**
 * LAS RESPUESTAS DE JENNY DEL 18-NOV-2026, CARGADAS EN EL BOT DE COMPETIMOTOR.
 *
 * Fuente: `docs/clientes/Preguntas-Competimotor-Mundillantas-respondido-18nov.xlsx`
 * (hojas Preguntas y Garantías). Lo que dejó en blanco lo respondió esa noche
 * casi todo (ver `competimotorRespuestas2.test.ts`); siguen pendientes el costo
 * del envío y la promoción de diciembre.
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

const { negocio, plazoDeFabrica } = await import("../src/negocio/index.js");
const { faltantesDelPerfil } = await import("../src/negocio/identidad.js");
const { politica } = await import("../src/negocio/politica.js");
const { warrantyForBrand } = await import("../src/services/quoteMessages.js");
const { respaldoDeMarca, respaldoCompleto } = await import("../src/domain/respaldoMarcas.js");
const { buildSystemPrompt } = await import("../src/agent/prompts.js");
const { hechoDelNegocio } = await import("../src/services/guardian.js");
const { quotePosterDiaNoche } = await import("../src/render/diaNoche.js");

function textoDe(nodo: unknown): string {
  if (typeof nodo === "string") return nodo;
  if (Array.isArray(nodo)) return nodo.map(textoDe).join(" ");
  if (nodo && typeof nodo === "object") {
    const props = (nodo as { props?: { children?: unknown } }).props;
    return props ? textoDe(props.children) : "";
  }
  return "";
}

describe("garantías por marca (hoja Garantías)", () => {
  const casos = [
    { marca: "KENDA", seguro: 12, fabrica: "1 año" },
    { marca: "FALKEN", seguro: 18, fabrica: "18 meses" }, // 1,5 años
    { marca: "WINRUN", seguro: 6, fabrica: "6 meses" }, // 0,5 años
    { marca: "MAXXIS", seguro: 12, fabrica: "1 año" },
  ];
  for (const { marca, seguro, fabrica } of casos) {
    it(`${marca}: ${seguro} meses de seguro contra impacto y ${fabrica} de fábrica`, () => {
      const g = warrantyForBrand(marca);
      expect(g.roadHazardMonths).toBe(seguro);
      expect(g.roadHazard).toBe(`${seguro} meses de seguro contra impacto`);
      expect(g.factory).toBe(`${fabrica} garantía de fábrica contra defectos de fabricación`);
    });
  }

  it("una marca que Jenny no nombró sigue sin plazo", () => {
    const g = warrantyForBrand("SAILUN");
    expect(g.roadHazardMonths).toBeNull();
    expect(g.factory).toBe("Garantía de fábrica por confirmar con el asesor");
  });

  it("el seguro no promete lo que Depot cubre: «golpes», «estalladuras», «cualquier daño»", () => {
    for (const marca of ["KENDA", "FALKEN", "WINRUN", "MAXXIS"]) {
      expect(warrantyForBrand(marca).roadHazard).not.toMatch(/golpes|estallad|cualquier/i);
    }
  });

  it("los plazos de fábrica se dicen bien: 1 año (no «1 años»), 1,5 años = 18 meses; Depot sigue en 5 años", () => {
    expect(plazoDeFabrica(1)).toEqual({ cifra: "1", unidad: "año" });
    expect(plazoDeFabrica(1.5)).toEqual({ cifra: "18", unidad: "meses" });
    expect(plazoDeFabrica(0.5)).toEqual({ cifra: "6", unidad: "meses" });
    expect(plazoDeFabrica(5)).toEqual({ cifra: "5", unidad: "años" });
  });

  it("la pieza de Kenda dibuja sus cifras y las condiciones del seguro de Competimotor", () => {
    const linea = {
      brand: "KENDA", design: "KR20", sizeLabel: "205/55R16", loadSpeedLabel: "91V", loadSpeedTranslation: null,
      quantity: 4, unitConIva: 80, pvpConIva: null, availability: "available" as const,
      golpesMeses: 12, fabricaAnios: 1, photoUri: "data:image/png;base64,iVBORw0KGgo=",
    };
    for (const modo of ["dia", "noche"] as const) {
      const texto = textoDe(quotePosterDiaNoche({ number: "COT-1", dateLabel: "18 / 11 / 2026", line: linea, total: 320 }, modo));
      expect(texto).toContain("12 meses de seguro");
      expect(texto).toContain("SEGURO CONTRA IMPACTO");
      expect(texto).toMatch(/1 año\s+Garantía de fábrica Kenda/);
      expect(texto).not.toMatch(/1 años|cualquier daño|golpes/i);
      expect(texto).toContain("factura");
    }
  });
});

describe("conocimiento de marcas: origen, km y tecnología", () => {
  it("Kenda: China, tecnología taiwanesa 100 % garantizada, hasta 70.000 km", () => {
    const k = respaldoDeMarca("KENDA")!;
    expect(k.origen.pais).toBe("China");
    expect(k.origen.fraseDeVenta).toMatch(/tecnolog[ií]a taiwanesa/i);
    expect(k.kmPromedio).toBe(70000);
    expect(k.seguroMeses).toBe(12);
    expect(k.garantiaFabricaAnios).toBe(1);
  });

  // El país llegó esa misma noche (ver competimotorRespuestas2): Tailandia.
  it("Falken: tecnología japonesa y reforzada, hasta 100.000 km, hecha en Tailandia", () => {
    const f = respaldoDeMarca("FALKEN")!;
    expect(f.origen.fraseDeVenta).toMatch(/japonesa/i);
    expect(f.origen.fraseDeVenta).toMatch(/reforzad/i);
    expect(f.origen.pais).toBe("Tailandia");
    expect(f.kmPromedio).toBe(100000);
    expect(f.seguroMeses).toBe(18);
    expect(f.garantiaFabricaAnios).toBe(1.5);
  });

  it("Winrun es una línea de Kenda (hasta 50.000 km); Maxxis taiwanesa (hasta 60.000 km)", () => {
    expect(respaldoDeMarca("WINRUN")!.origen.fraseDeVenta).toMatch(/l[ií]neas de la marca Kenda/i);
    expect(respaldoDeMarca("WINRUN")!.kmPromedio).toBe(50000);
    expect(respaldoDeMarca("MAXXIS")!.origen.fraseDeVenta).toMatch(/taiwanesa/i);
    expect(respaldoDeMarca("MAXXIS")!.kmPromedio).toBe(60000);
  });

  it("el seguro se hace válido con la factura, solo en las cuatro marcas", () => {
    for (const marca of ["KENDA", "FALKEN", "WINRUN", "MAXXIS"]) {
      expect(respaldoDeMarca(marca)!.seguroFrase).toMatch(/factura/i);
    }
  });
});

describe("mantenimiento cada 10.000 km: comprando 2 o 4 llantas", () => {
  it("lo ofrece hablando (servicios del conocimiento) y lo respalda ante el guardián", () => {
    const servicios = respaldoCompleto().serviciosIncluidos.join(" ");
    expect(servicios).toMatch(/mantenimiento cada 10\.000 km/);
    expect(servicios).toMatch(/2 o 4 llantas/);
  });

  it("y va en el INCLUYE de una base nueva desde 2 llantas", () => {
    expect(negocio.beneficiosDeArranque).toContainEqual({
      text: "Mantenimiento cada 10.000 km: rotación, revisión mecánica y nitrógeno (comprando 2 o 4 llantas)",
      minQuantity: 2,
    });
  });
});

describe("envíos, parte de pago e instalación", () => {
  it("sí envía a otras ciudades", () => {
    expect(politica.vendeADistancia).toBe(true);
  });

  it("los datos van al prompt y al guardián, palabra por palabra", () => {
    const prompt = buildSystemPrompt();
    const hecho = hechoDelNegocio();
    for (const dato of [/Laar Courier/, /Transportes Bemaut/, /aros y llantas usadas como parte de pago/, /orden de llegada y tambi[eé]n con cita/]) {
      expect(prompt).toMatch(dato);
      expect(hecho).toMatch(dato);
    }
  });
});

describe("lo que Jenny dejó en blanco sigue pendiente", () => {
  it("el panel ya no pide las garantías, y sí lo que falta", () => {
    const faltantes = faltantesDelPerfil(negocio).join(" | ");
    expect(faltantes).not.toMatch(/garant[ií]as por marca/);
    // País, mantenimiento e instalación llegaron esa noche; el costo del envío y diciembre no.
    for (const falta of [/env[ií]o/i, /diciembre/i]) {
      expect(faltantes).toMatch(falta);
    }
  });

  it("la promoción de diciembre no se anuncia", () => {
    expect(politica.promocionDeTemporada?.nombre ?? "").not.toMatch(/diciembre/i);
    expect(buildSystemPrompt()).not.toMatch(/diciembre/i);
  });
});
