import { describe, expect, it } from "vitest";
import {
  debeBloquearReenvio,
  mismaMedida,
  tipoSolicitadoEn,
} from "../src/domain/opcionesCandados.js";

describe("candado 2 — tipo pedido por el cliente", () => {
  it("detecta el tipo como lo escribe la gente", () => {
    // Ticket 1286 del 6-ago-2026: «265/70/17 AT» terminó con un M/T enviado.
    expect(tipoSolicitadoEn(["265/70/17 AT"])).toBe("A/T");
    expect(tipoSolicitadoEn(["quiero una a/t"])).toBe("A/T");
    expect(tipoSolicitadoEn(["algo todo terreno porfa"])).toBe("A/T");
    expect(tipoSolicitadoEn(["all terrain"])).toBe("A/T");
    expect(tipoSolicitadoEn(["una mt para lodo"])).toBe("M/T");
    expect(tipoSolicitadoEn(["para lodo"])).toBe("M/T");
    expect(tipoSolicitadoEn(["h/t para carretera"])).toBe("H/T");
  });

  it("manda el mensaje más reciente y no el más viejo", () => {
    // La consulta viene con order by created_at desc.
    expect(tipoSolicitadoEn(["mejor m/t", "quiero at"])).toBe("M/T");
  });

  it("no inventa tipo cuando el cliente no lo dijo", () => {
    expect(tipoSolicitadoEn(["hola, precio de 265/75R16?"])).toBeNull();
    expect(tipoSolicitadoEn([])).toBeNull();
    expect(tipoSolicitadoEn([""])).toBeNull();
  });
});

describe("candado 1 — solo el doble envío del mismo turno", () => {
  const previo = (sizeLabel: string | null, minutos: number) => ({ sizeLabel, minutos });

  it("bloquea la misma pieza si acaba de salir en este turno", () => {
    expect(debeBloquearReenvio(previo("265/75R16", 0.2), "265/75R16", "Presio por favor")).toBe(true);
  });

  it("ya no hay candado por tiempo: a los 2 minutos la pieza vuelve a salir si la piden", () => {
    // Manuel, 1-sep-2026: el candado de 120 min mandaba la recomendación a texto
    // repetido. Pedir opciones o recomendación con la medida confirmada = pieza.
    // (En producción la consulta ya solo trae piezas de ESTE turno; el techo
    // de minutos es un seguro por si un turno se alarga.)
    expect(debeBloquearReenvio(previo("265/75R16", 10), "265/75R16", "Presio por favor")).toBe(false);
    expect(debeBloquearReenvio(previo("265/75R16", 121), "265/75R16", "precio")).toBe(false);
  });

  it("permite si la medida es distinta", () => {
    expect(debeBloquearReenvio(previo("265/75R16", 0.2), "225/65R17", "y en r17?")).toBe(false);
  });

  it("permite productos distintos de la misma medida cuando el cliente pide otras opciones", () => {
    expect(debeBloquearReenvio(
      { sizeLabel: "265/75R16", minutos: 0.2, codes: ["A", "B", "C"] },
      "265/75R16",
      "quiero ver otras",
      ["D", "E", "F"],
    )).toBe(false);
  });

  it("bloquea exactamente el mismo conjunto aunque cambie el orden", () => {
    expect(debeBloquearReenvio(
      { sizeLabel: "265/75R16", minutos: 0.5, codes: ["A", "B", "C"] },
      "265/75R16",
      "precio",
      ["C", "A", "B"],
    )).toBe(true);
  });

  it("bloquea los mismos códigos aunque una pieza vieja no tenga medida", () => {
    expect(debeBloquearReenvio(
      { sizeLabel: null, minutos: 0.5, codes: ["A", "B", "C"] },
      "205/55R16",
      "precio",
      ["C", "A", "B"],
    )).toBe(true);
  });

  it("permite si el cliente dice que no le llegó, aunque sea en el mismo turno", () => {
    for (const texto of ["no me llegó la imagen", "mándamelas de nuevo", "reenvíamelas", "no las veo"]) {
      expect(debeBloquearReenvio(previo("265/75R16", 0.3), "265/75R16", texto)).toBe(false);
    }
  });

  it("permite si nunca se envió nada", () => {
    expect(debeBloquearReenvio(null, "265/75R16", "precio")).toBe(false);
  });

  it("no bloquea cuando no se sabe la medida previa", () => {
    expect(debeBloquearReenvio(previo(null, 0.3), "265/75R16", "precio")).toBe(false);
  });

  it("compara medidas escritas de forma distinta", () => {
    expect(mismaMedida("265/75R16", "265/75 r16")).toBe(true);
    expect(mismaMedida("265/75R16", "265/70R16")).toBe(false);
  });
});
