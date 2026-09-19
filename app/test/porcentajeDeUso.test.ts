/**
 * El reparto asfalto/tierra sale de la ficha del modelo (Joaquín, 14-sep, conv 20017).
 */
import { describe, expect, it } from "vitest";
import { sinRepartoInventado } from "../src/domain/porcentajeDeUso.js";

const LINEAS = [
  { modelo: "WILDPEAK A/T4W", uso: "4x4 y camioneta de uso mixto, on/off road real: 50% asfalto / 50% tierra" },
  { modelo: "WILDPEAK A/T TRAIL", uso: "SUV y camionetas de uso mixto: 80% asfalto / 20% tierra" },
  { modelo: "KR50", uso: "SUV y camioneta 100% asfalto" },
];

const MENSAJE_REAL =
  "Para la medida y tipo A/T que pidió, le envié la opción en foto:\n\n"
  + "*FALKEN WILDPEAK A/T 4W* — *$208.48 c/u con IVA* 😊\n\n"
  + "Es una llanta *All Terrain*, de uso mixto: aprox. 70% asfalto / 30% tierra.";

describe("sinRepartoInventado", () => {
  it("quita el 70/30 que no es de la A/T 4W y deja el precio", () => {
    const salida = sinRepartoInventado(MENSAJE_REAL, LINEAS);
    expect(salida).not.toMatch(/70|30 ?%/);
    expect(salida).toContain("$208.48 c/u con IVA");
    expect(salida).toContain("FALKEN WILDPEAK A/T 4W");
  });

  it("deja pasar el reparto que sí es el de la ficha", () => {
    const bien = "La *FALKEN WILDPEAK A/T 4W* es de uso mixto: 50% asfalto / 50% tierra.";
    expect(sinRepartoInventado(bien, LINEAS)).toBe(bien);
    const trail = "La *WILDPEAK A/T TRAIL* va 80 % asfalto / 20 % tierra.";
    expect(sinRepartoInventado(trail, LINEAS)).toBe(trail);
  });

  it("no toca un descuento ni un texto sin reparto", () => {
    const t = "Su cotización ya trae el *25 %* de descuento.\n---\n¿A cuál local le queda mejor ir?";
    expect(sinRepartoInventado(t, LINEAS)).toBe(t);
  });

  it("si todo el mensaje era el reparto, no lo deja vacío", () => {
    expect(sinRepartoInventado("Es 70% asfalto / 30% tierra.", LINEAS)).toBe("Es 70% asfalto / 30% tierra.");
  });
});

describe("el uso de la ficha del modelo", () => {
  it("la A/T 4W trae el 50/50 que confirmó Joaquín, escrita como venga", async () => {
    const { usoDelModelo } = await import("../src/domain/tireTypes.js");
    expect(usoDelModelo("WILDPEAK A/T 4W")).toContain("50% asfalto / 50% tierra");
    expect(usoDelModelo("Wildpeak A/T4W")).toContain("50% asfalto / 50% tierra");
    expect(usoDelModelo("MODELO QUE NO EXISTE")).toBeNull();
  });
  it("la definición genérica del tipo A/T ya no trae porcentajes", async () => {
    const { infoTipo } = await import("../src/domain/tireTypes.js");
    expect(infoTipo("A/T")?.definicion).not.toMatch(/\d+\s?%/);
  });
});
