/**
 * NINGÚN TURNO CON COTIZACIÓN CIERRA SIN LA PREGUNTA QUE FALTA.
 *
 * Manuel, 27-ago-2026, sobre su chat de prueba (conv 3, ciclo 8): «si hago
 * preguntas se desvía la conversación y no acaba con una pregunta… debería
 * insistir con el local, o si ya dijo eso, el día que va, molestando con esas
 * preguntas hasta que se respondan».
 *
 * El mensaje que lo destapó, textual, 21:50:23 — el bot ya tenía el local y le
 * había pedido el día; el cliente preguntó dos cosas y el segundo turno cerró
 * así, sin pregunta:
 *
 *   «Sí, le sirven para uso mixto; la WINRUN MAXCLAW A/T es A/T, más apta que
 *    una de calle para tierra y camino irregular. Si quiere, le dejo la visita
 *    en Depot Tire Cumbayá y el asesor se la confirma en tienda.»
 */
import { describe, expect, it } from "vitest";
import { datoQueFalta } from "../src/domain/preguntaPendiente.js";
import { preguntamosElDia } from "../src/domain/customerCommitment.js";
import { PREGUNTA_DE_LOCAL, preguntamosElLocal } from "../src/domain/storeSelection.js";

/** El mensaje real que cerró el hilo sin pedir nada. */
const EL_QUE_CERRO_SIN_PREGUNTAR =
  "Sí, le sirven para uso mixto; la *WINRUN MAXCLAW A/T* es A/T, más apta que una de calle "
  + "para tierra y camino irregular.\nSi quiere, le dejo la visita en *Depot Tire Cumbayá* "
  + "y el asesor se la confirma en tienda.";

describe("qué dato falta para que el asesor pueda atenderlo", () => {
  it("sin cotización no se empuja nada: todavía se está vendiendo", () => {
    expect(datoQueFalta({ hayCotizacion: false, localElegido: false, visitaRegistrada: false })).toBeNull();
    // Ni siquiera si ya eligió local por su cuenta.
    expect(datoQueFalta({ hayCotizacion: false, localElegido: true, visitaRegistrada: false })).toBeNull();
  });

  it("con cotización y sin local, falta el local", () => {
    expect(datoQueFalta({ hayCotizacion: true, localElegido: false, visitaRegistrada: false })).toBe("local");
  });

  it("EL CASO DEL CHAT: con el local ya dado, falta el día", () => {
    expect(datoQueFalta({ hayCotizacion: true, localElegido: true, visitaRegistrada: false })).toBe("dia");
  });

  it("con los dos registrados ya no se molesta más", () => {
    expect(datoQueFalta({ hayCotizacion: true, localElegido: true, visitaRegistrada: true })).toBeNull();
  });

  it("de a uno y en orden: el local antes que el día", () => {
    // Nunca los dos juntos — preguntarlos en el mismo mensaje era lo que hacía
    // que el cliente contestara solo uno (26-ago).
    const falta = datoQueFalta({ hayCotizacion: true, localElegido: false, visitaRegistrada: false });
    expect(falta).toBe("local");
    expect(falta).not.toBe("dia");
  });
});

describe("reconocer si el turno YA preguntaba", () => {
  it("EL BUG: el mensaje real no pide ni el local ni el día", () => {
    expect(preguntamosElDia(EL_QUE_CERRO_SIN_PREGUNTAR)).toBe(false);
    expect(preguntamosElLocal(EL_QUE_CERRO_SIN_PREGUNTAR)).toBe(false);
  });

  it("EL CASO QUE NO DEBE DISPARAR: un turno que sí pregunta no se toca", () => {
    const conPregunta = "Sí, incluye alineación y balanceo. ¿Qué día cree que puede pasar?";
    expect(preguntamosElDia(conPregunta)).toBe(true);
    expect(preguntamosElLocal(`${PREGUNTA_DE_LOCAL} 📍`)).toBe(true);
  });
});
