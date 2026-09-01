import { describe, expect, it } from "vitest";
import {
  pideLaRecomendacionConPiezaEnviada,
  recomendadaDeLaPieza,
} from "../src/domain/recomendacionConPieza.js";

const pieza = {
  codes: ["FAL-ZE310R", "FAL-ZE914", "KEN-KR"],
  recomendado: "FAL-ZE310R",
  motivo: "mejor agarre en pavimento",
  escalones: { premium: { codigo: "FAL-ZE310R" }, equilibrada: { codigo: "FAL-ZE914" }, economica: { codigo: "KEN-KR" } },
};

describe("recomendación con la pieza ya enviada (1-sep, 16:02)", () => {
  it("el chat real: describir el uso o pedir recomendación con pieza enviada y sin cotización", () => {
    expect(pideLaRecomendacionConPiezaEnviada("Busco una llanta\nQue se adiera\nAl pavimento", pieza, false)).toBe(true);
    expect(pideLaRecomendacionConPiezaEnviada("Y cual me recomienda para que no derrape?", pieza, false)).toBe(true);
  });

  it("sin pieza enviada no es de esta ruta: la primera vez la arma el agente", () => {
    expect(pideLaRecomendacionConPiezaEnviada("cual me recomienda?", null, false)).toBe(false);
    expect(pideLaRecomendacionConPiezaEnviada("cual me recomienda?", { codes: [] }, false)).toBe(false);
  });

  it("con cotización viva ya eligió: lo lleva el vendedor", () => {
    expect(pideLaRecomendacionConPiezaEnviada("cual me recomienda?", pieza, true)).toBe(false);
  });

  it("pedir precio, cantidad o un modelo no es pedir recomendación", () => {
    expect(pideLaRecomendacionConPiezaEnviada("precio de la falken", pieza, false)).toBe(false);
    expect(pideLaRecomendacionConPiezaEnviada("quiero 4", pieza, false)).toBe(false);
    expect(pideLaRecomendacionConPiezaEnviada("la 2", pieza, false)).toBe(false);
  });

  it("la recomendada es la que la pieza guardó, con su motivo", () => {
    expect(recomendadaDeLaPieza(pieza)).toEqual({ recomendado: "FAL-ZE310R", motivo: "mejor agarre en pavimento" });
  });

  it("una pieza vieja sin recomendada cae en la premium, y sin escalones en la primera", () => {
    expect(recomendadaDeLaPieza({ codes: ["A", "B"], escalones: { premium: { codigo: "B" } } }).recomendado).toBe("B");
    expect(recomendadaDeLaPieza({ codes: ["A", "B"] }).recomendado).toBe("A");
    expect(recomendadaDeLaPieza({ codes: ["A", "B"] }).motivo.length).toBeGreaterThan(5);
  });
});
