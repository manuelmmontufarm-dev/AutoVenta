import { describe, expect, it } from "vitest";
import { medidaQueConfirmoAlAsesor } from "../src/domain/medidaQueConfirmoAlAsesor.js";

// Conv 19706, 14-sep-2026, textos reales.
describe("la medida que el cliente le confirmó al asesor", () => {
  const ASESOR = "Disculpe usted se referia a  la 265/75R16?";
  it("«Si» a la pregunta del asesor fija 265/75R16", () => {
    expect(medidaQueConfirmoAlAsesor(ASESOR, "Si")).toBe("265/75R16");
  });
  it("un no, u otra medida, no fija nada", () => {
    expect(medidaQueConfirmoAlAsesor(ASESOR, "No")).toBeNull();
    expect(medidaQueConfirmoAlAsesor(ASESOR, "no, 245/75R16")).toBeNull();
  });
  it("sin pregunta o con dos medidas no se adivina", () => {
    expect(medidaQueConfirmoAlAsesor("Dispongo en 235/75R15", "Si")).toBeNull();
    expect(medidaQueConfirmoAlAsesor("¿265/75R16 o 245/75R16?", "Si")).toBeNull();
    expect(medidaQueConfirmoAlAsesor(null, "Si")).toBeNull();
  });
});
