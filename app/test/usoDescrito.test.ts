import { describe, expect, it } from "vitest";
import { describeUso } from "../src/domain/salesIntent.js";

describe("describir el uso: agarre, pavimento y compañía", () => {
  it("reconoce el chat del 1-sep («que se adiera al pavimento»)", () => {
    expect(describeUso("Que se adiera")).toBe(true);
    expect(describeUso("Al pavimento")).toBe(true);
    expect(describeUso("Busco una llanta que se adhiera al pavimento")).toBe(true);
    expect(describeUso("Que no derrape")).toBe(true);
    expect(describeUso("una con buen agarre en asfalto")).toBe(true);
  });

  it("sigue reconociendo los usos de siempre", () => {
    expect(describeUso("son para carretera")).toBe(true);
    expect(describeUso("uso mixto, ciudad y campo")).toBe(true);
  });

  it("no confunde un pedido normal con un uso", () => {
    expect(describeUso("quiero 4 llantas")).toBe(false);
    expect(describeUso("¿a cómo la Kenda?")).toBe(false);
    expect(describeUso("paso el viernes")).toBe(false);
  });
});
