/**
 * El conocimiento entregado por el negocio el 13-ago: respaldo de marcas,
 * escalera por línea y la tabla de aplicaciones vehículo→medida.
 */
import { describe, expect, it } from "vitest";
import { costoPorKm, respaldoCompleto, respaldoDeMarca } from "../src/domain/respaldoMarcas.js";
import { nivelDeLinea, ordenDeNivel } from "../src/domain/escalera.js";
import { aroEsDeFabrica, lookupFitment } from "../src/domain/fitment.js";

describe("respaldo de marcas", () => {
  it("Falken: japonesa, 5 años de fábrica, hasta 18 meses de seguro, ~86.500 km", () => {
    const falken = respaldoDeMarca("falken");
    expect(falken?.origen.pais).toBe("Japon");
    expect(falken?.garantiaFabricaAnios).toBe(5);
    expect(falken?.seguroMeses).toBe(18);
    expect(falken?.kmPromedio).toBe(86500);
  });

  it("GITI existe pero sin seguro ni rendimiento definidos (no prometer)", () => {
    const giti = respaldoDeMarca("GITI");
    expect(giti?.seguroMeses).toBeNull();
    expect(giti?.kmPromedio).toBeNull();
  });

  it("las frases al cliente dicen Depot Tire, no Pit Stop", () => {
    const texto = JSON.stringify(respaldoCompleto());
    expect(texto).not.toContain("Pit Stop");
  });

  it("costo por km sale del precio real y calla cuando no hay rendimiento", () => {
    expect(costoPorKm("FALKEN", 173)).toContain("100 km");
    expect(costoPorKm("GITI", 173)).toBeNull();
  });
});

describe("escalera por línea", () => {
  it("la línea manda sobre la marca dentro de Kenda", () => {
    expect(nivelDeLinea("KENDA", "KR628")).toBe("INTERMEDIA");
    expect(nivelDeLinea("KENDA", "KR203")).toBe("ECONOMICA");
    expect(nivelDeLinea("KENDA", "Kenda Komendo")).toBe("ECONOMICA");
  });

  it("Falken entera es premium y Winrun económica", () => {
    expect(nivelDeLinea("FALKEN", "WILDPEAK A/T4W")).toBe("PREMIUM");
    expect(nivelDeLinea("WINRUN", "R330")).toBe("ECONOMICA");
  });

  it("GITI queda fuera de la escalera hasta tener condiciones", () => {
    expect(nivelDeLinea("GITI", "cualquiera")).toBeNull();
  });

  it("el orden presenta premium primero y lo desconocido nunca como premium", () => {
    expect(ordenDeNivel("PREMIUM")).toBeLessThan(ordenDeNivel("ECONOMICA"));
    expect(ordenDeNivel(null)).toBeGreaterThan(ordenDeNivel("ECONOMICA"));
  });
});

describe("aplicaciones vehículo → medida", () => {
  it("Creta aro 17: ficha de confianza alta con la 215/60R17", () => {
    const creta = lookupFitment("Hyundai", "Creta", 2027);
    expect(creta?.validated).toBe(true);
    expect(creta?.sizes).toContain("215/60R17");
    expect(creta?.factoryRims).toContain(17);
  });

  it("Hilux con aro 18: el 18 sí es de fábrica; un 20 no", () => {
    expect(aroEsDeFabrica("Toyota", "Hilux", 18)).toBe(true);
    expect(aroEsDeFabrica("Toyota", "Hilux", 20)).toBe(false);
  });

  it("modelos compuestos se encuentran por cualquiera de sus alias", () => {
    expect(lookupFitment("Kia", "Forte")).not.toBeNull();
    expect(lookupFitment("Hyundai", "Starex")).not.toBeNull();
  });

  it("confianza media va marcada para confirmar, no como ficha validada", () => {
    const santaFe = lookupFitment("Hyundai", "Santa Fe");
    expect(santaFe?.validated).toBe(false);
    expect(santaFe?.note).toMatch(/confirmar/i);
  });

  it("el respaldo legado sigue vivo para modelos fuera del archivo", () => {
    expect(lookupFitment("Toyota", "Highlander", 2012)?.validated).toBe(true);
  });
});
