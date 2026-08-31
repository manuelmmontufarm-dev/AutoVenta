import { describe, expect, it } from "vitest";
import { sinPreguntaRepetidaEnElTurno } from "../src/domain/preguntaRepetidaEnElTurno.js";

/**
 * Simulador, 31-ago-2026 20:38, repitiendo la ráfaga de la conv 3: el turno
 * cerró preguntando lo mismo dos veces con otras palabras, en dos mensajes
 * seguidos. Los textos de abajo son los que salieron.
 *
 * Se conserva la ÚLTIMA: el turno tiene que terminar preguntando y los botones
 * se pintan sobre el último bloque.
 */
const PREGUNTA_A = "¿A cuál local le queda mejor?";
const PREGUNTA_B = "¿Depot Tire Cumbayá o Depot Tire Quito Sur?";
const PREGUNTA_DIA = "¿Qué día cree que puede pasar? 📅";

const bloquesDe = (texto: string) =>
  texto.split(/\n\s*-{3,}\s*\n/).map((b) => b.trim()).filter(Boolean);

describe("la misma pregunta dos veces en el mismo turno", () => {
  it("EL CASO DEL SIMULADOR: dos preguntas de local seguidas → queda la última", () => {
    const r = sinPreguntaRepetidaEnElTurno(`${PREGUNTA_A}\n---\n${PREGUNTA_B}`);
    expect(r.texto).toBe(PREGUNTA_B);
    expect(r.quitadas).toEqual([PREGUNTA_A]);
  });

  it("EL BORDE DE LOS BOTONES: con datos en medio, el turno sigue TERMINANDO en la pregunta", () => {
    // `botonesDelUltimoBloque` pinta sobre el último bloque: si se conservara la
    // primera pregunta, el turno cerraría con los datos y sin botones.
    const datos = "La KENDA KR203 le queda en $71.77 c/u con IVA.";
    const r = sinPreguntaRepetidaEnElTurno(`${PREGUNTA_A}\n---\n${datos}\n---\n${PREGUNTA_B}`);
    const bloques = bloquesDe(r.texto);
    expect(bloques).toEqual([datos, PREGUNTA_B]);
    expect(bloques.at(-1)).toBe(PREGUNTA_B);
  });

  it("lo mismo con la pregunta del día", () => {
    const r = sinPreguntaRepetidaEnElTurno(`${PREGUNTA_DIA}\n---\n¿Qué día le queda mejor?`);
    expect(r.texto).toBe("¿Qué día le queda mejor?");
    expect(r.quitadas).toHaveLength(1);
  });

  it("EL CASO QUE NO DEBE DISPARAR: dos preguntas DISTINTAS conviven", () => {
    const texto = `${PREGUNTA_A}\n---\n${PREGUNTA_DIA}`;
    expect(sinPreguntaRepetidaEnElTurno(texto).texto).toBe(texto);
  });

  it("EL CASO QUE NO DEBE DISPARAR: la respuesta útil no se toca", () => {
    const texto = `La garantía es de 5 años.\n---\n${PREGUNTA_A}`;
    expect(sinPreguntaRepetidaEnElTurno(texto).texto).toBe(texto);
  });

  it("EL BORDE: un bloque con precio NUNCA se calla, aunque repita la pregunta", () => {
    // Perder un dato es peor que repetir una pregunta: aquí sobrevive el
    // duplicado a propósito, y queda en `quitadas` que no se tocó nada.
    const conPrecio = `Le quedan en $287.07 el juego. ${PREGUNTA_A}`;
    const texto = `${conPrecio}\n---\n${PREGUNTA_B}`;
    const r = sinPreguntaRepetidaEnElTurno(texto);
    expect(r.texto).toBe(texto);
    expect(r.quitadas).toEqual([]);
  });

  it("EL BORDE: un solo bloque se devuelve intacto", () => {
    expect(sinPreguntaRepetidaEnElTurno(PREGUNTA_A).texto).toBe(PREGUNTA_A);
    expect(sinPreguntaRepetidaEnElTurno("Con gusto le ayudo.").quitadas).toEqual([]);
  });

  it("tres bloques: sobrevive la última de cada clase y el día queda al final", () => {
    const r = sinPreguntaRepetidaEnElTurno(
      `${PREGUNTA_A}\n---\n${PREGUNTA_B}\n---\n${PREGUNTA_DIA}`,
    );
    expect(bloquesDe(r.texto)).toEqual([PREGUNTA_B, PREGUNTA_DIA]);
  });
});
