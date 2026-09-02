import { describe, expect, it } from "vitest";
import { elegirRecomendadaPorUso, usoDeclarado } from "../src/domain/recomendacionPorUso.js";

// La pieza del simulador del 1-sep: tres opciones en 235/60R16.
const pieza = [
  { codigo: "FAL-ZE310R", tipo: "TURISMO", precioConIva: 161.08 },
  { codigo: "FAL-ZE914", tipo: "TURISMO", precioConIva: 159.36 },
  { codigo: "KEN-KR50", tipo: "H/T", precioConIva: 120.8 },
];

describe("el uso que contó el cliente", () => {
  it("lee el chat real («que se adiera al pavimento») como agarre", () => {
    expect(usoDeclarado("Busco una llanta\nQue se adiera\nAl pavimento")).toBe("agarre");
    expect(usoDeclarado("Y cual me recomienda para que no derrape?")).toBe("agarre");
  });

  it("distingue los usos de la tabla de Depot", () => {
    expect(usoDeclarado("es para carretera y ciudad")).toBe("pavimento");
    expect(usoDeclarado("uso mixto, ciudad y campo")).toBe("tierra");
    expect(usoDeclarado("una todo terreno")).toBe("mixto");
    expect(usoDeclarado("para lodo y cantera")).toBe("lodo");
    expect(usoDeclarado("la camioneta es para carga")).toBe("carga");
  });

  it("sin uso no inventa nada", () => {
    expect(usoDeclarado("cual me recomienda?")).toBeNull();
    expect(usoDeclarado("precio")).toBeNull();
  });
});

describe("la recomendada según el uso, de las que ya están en pantalla", () => {
  it("agarre en pavimento: la turismo más cara, no la Kenda intermedia que guardó la pieza", () => {
    const r = elegirRecomendadaPorUso("agarre", pieza, "KEN-KR50");
    expect(r?.codigo).toBe("FAL-ZE310R");
    expect(r?.motivo).toContain("agarre");
  });

  it("ciudad y carretera: la H/T gana sobre las turismo", () => {
    expect(elegirRecomendadaPorUso("pavimento", pieza, null)?.codigo).toBe("KEN-KR50");
  });

  it("dentro del mismo tipo conserva la recomendada original si calza", () => {
    expect(elegirRecomendadaPorUso("agarre", pieza, "FAL-ZE914")?.codigo).toBe("FAL-ZE914");
  });

  it("uso mixto con una pieza solo de turismo cae en la H/T, la más cercana", () => {
    expect(elegirRecomendadaPorUso("mixto", pieza, null)?.codigo).toBe("KEN-KR50");
  });

  it("sin tipos conocidos devuelve null y se queda la original", () => {
    expect(elegirRecomendadaPorUso("agarre", [{ codigo: "X", tipo: null, precioConIva: 100 }], "X")).toBeNull();
  });

  it("lodo elige la M/T cuando está en la pieza", () => {
    const mixta = [
      { codigo: "AT", tipo: "A/T", precioConIva: 200 },
      { codigo: "MT", tipo: "M/T", precioConIva: 250 },
    ];
    expect(elegirRecomendadaPorUso("lodo", mixta, "AT")?.codigo).toBe("MT");
  });
});
