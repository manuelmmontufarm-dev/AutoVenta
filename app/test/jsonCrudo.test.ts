import { describe, expect, it } from "vitest";
import { esJsonCrudo, sinJsonCrudo } from "../src/domain/jsonCrudo.js";

// El texto EXACTO que salió en el simulador el 27-ago al tocar «Otro día».
const EL_QUE_SALIO =
  '{"motivo":"caso_sin_resolver","resumen":"Cliente con cotización ya enviada de 4 × FALKEN ZE310R ' +
  '205/55R16 por $445.44. Confirmó local Depot Tire Cumbayá, pero todavía no da día para la visita."}';

describe("el JSON de una herramienta no llega al cliente", () => {
  it("reconoce el bloque que se escapó", () => {
    expect(esJsonCrudo(EL_QUE_SALIO)).toBe(true);
  });

  it("se cae el bloque y sobrevive la pregunta que sí había que hacer", () => {
    const turno = `${EL_QUE_SALIO}\n---\n¿Qué día cree que puede pasar? 📅`;
    const r = sinJsonCrudo(turno);
    expect(r.texto).toBe("¿Qué día cree que puede pasar? 📅");
    expect(r.quitados).toHaveLength(1);
  });

  it.each([
    "Perfecto, *Depot Tire Cumbayá*.",
    "El total es $445.44 por 4 llantas.",
    "Le mando {los dos} links de una vez.",
    "1) *Costo* — la más conveniente de precio",
    "¿Le queda alguna otra duda antes de su visita?",
  ])("no toca un mensaje normal: %s", (texto) => {
    expect(sinJsonCrudo(texto)).toEqual({ texto, quitados: [] });
  });

  it("un número suelto no es JSON crudo", () => {
    expect(esJsonCrudo("4")).toBe(false);
    expect(esJsonCrudo("205/55R16")).toBe(false);
  });
});
