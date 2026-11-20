import { describe, expect, it } from "vitest";
import { esFraseDeTrastienda, sinTrastienda } from "../src/domain/sinTrastienda.js";

/**
 * Simulador Competimotor, 18-nov (CM26 r2 del lote 03-17, y borradores de CM34):
 * el error de una herramienta parafraseado como respuesta al cliente.
 */
describe("ninguna frase de la trastienda llega al cliente", () => {
  it("CM26 r2: se cae la oración del bloqueo y queda la pregunta", () => {
    const borrador =
      "La cotización se bloqueó porque el sistema pide confirmar la medida escrita del costado de su llanta. ¿Me confirma si su llanta dice 185/60R14?";
    const r = sinTrastienda(borrador);
    expect(r.texto).toBe("¿Me confirma si su llanta dice 185/60R14?");
    expect(r.quitadas).toHaveLength(1);
  });

  it("los borradores de CM34", () => {
    expect(esFraseDeTrastienda("Perfecto, el sistema me pide reconfirmación manual de la medida.")).toBe(true);
    expect(esFraseDeTrastienda("La cotización no se pudo emitir automáticamente.")).toBe(true);
    expect(esFraseDeTrastienda("La herramienta bloqueó la cotización porque la medida fue deducida.")).toBe(true);
  });

  it("un bloque entero de trastienda se cae y quedan los otros bloques", () => {
    const r = sinTrastienda("El sistema no me deja cotizar todavía.\n---\n¿Me manda una foto del costado?");
    expect(r.texto).toBe("¿Me manda una foto del costado?");
  });

  it("lo que no es trastienda no se toca", () => {
    for (const texto of [
      "Le cotizo la *KENDA KR20* — $110.40 c/u con IVA 👍",
      "Para emitir la cotización necesito la medida del costado de su llanta, por ejemplo 185/60R14.",
      "Revisamos el sistema de frenos sin costo con la compra.",
      "¿Qué día cree que puede ir?",
    ]) {
      expect(sinTrastienda(texto)).toEqual({ texto, quitadas: [] });
    }
  });

  it("si todo era trastienda, el texto se queda (no se manda vacío) y se avisa", () => {
    const r = sinTrastienda("La cotización se bloqueó.");
    expect(r.texto).toBe("La cotización se bloqueó.");
    expect(r.quitadas).toHaveLength(1);
  });
});
