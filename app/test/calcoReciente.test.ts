import { describe, expect, it } from "vitest";
import { sinBloquesCalcados } from "../src/domain/calcoReciente.js";

/**
 * Producción, 31-ago-2026, conv 3 c20 (Manuel Montufar): el turno de la
 * cotización mandó el bloque de locales a las 17:23:35 y el turno siguiente
 * mandó EL MISMO bloque a las 17:23:42 — el guardián reescribió el borrador
 * dejándolo idéntico, y el chequeo de duplicados había corrido antes que él.
 * Los textos de abajo son los reales de la base (mensajes 15907–15910).
 */
const MAPAS =
  "Puede pasar sin compromiso a verlas y probarlas en su vehículo.\n"
  + "📍 *Depot Tire Cumbayá*: https://maps.app.goo.gl/QnMBPXKc1o8igbsp8\n"
  + "📍 *Depot Tire Quito Sur*: https://maps.app.goo.gl/NQeNN8csyAnRkJDJ7";
const PREGUNTA_LOCAL = "¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍";

describe("sin bloques calcados", () => {
  it("EL CASO DE MANUEL: el turno entero era una repetición de hace segundos → no se envía nada", () => {
    const r = sinBloquesCalcados(`${MAPAS}\n---\n${PREGUNTA_LOCAL}`, [MAPAS, PREGUNTA_LOCAL]);
    expect(r.texto).toBeNull();
    expect(r.calcados).toHaveLength(2);
  });

  it("un bloque nuevo sobrevive aunque el otro sea calco", () => {
    const r = sinBloquesCalcados(
      `Con gusto le explico la garantía.\n---\n${PREGUNTA_LOCAL}`,
      [MAPAS, PREGUNTA_LOCAL],
    );
    expect(r.texto).toBe("Con gusto le explico la garantía.");
    expect(r.calcados).toEqual([PREGUNTA_LOCAL]);
  });

  it("EL CASO QUE NO DEBE DISPARAR: texto parecido pero no idéntico pasa intacto", () => {
    const distinto = "¿A cuál local le queda más cerca ir, *Cumbayá* o *Quito Sur*? 📍";
    const r = sinBloquesCalcados(distinto, [PREGUNTA_LOCAL]);
    expect(r.texto).toBe(distinto);
    expect(r.calcados).toEqual([]);
  });

  it("sin salientes recientes no toca nada", () => {
    const r = sinBloquesCalcados(MAPAS, []);
    expect(r.texto).toBe(MAPAS);
    expect(r.calcados).toEqual([]);
  });

  it("EL BORDE: la comparación ignora espacios y mayúsculas, no el contenido", () => {
    const conEspacios = `  ${PREGUNTA_LOCAL.replace("¿A cuál", "¿A  CUÁL")}  `;
    const r = sinBloquesCalcados(conEspacios, [PREGUNTA_LOCAL]);
    expect(r.texto).toBeNull();
    expect(r.calcados).toHaveLength(1);
  });

  it("un saliente reciente con varios bloques se compara bloque a bloque", () => {
    const r = sinBloquesCalcados(MAPAS, [`${MAPAS}\n---\n${PREGUNTA_LOCAL}`]);
    expect(r.texto).toBeNull();
  });

  it("LA REPREGUNTA LEGÍTIMA: la pregunta de cierre repetida de hace varios mensajes NO es calco", () => {
    // `insistirCierre` re-agrega la pregunta del día a propósito cuando el
    // turno anterior NO la hizo (27-ago, conv 3 c15). Solo cuenta como calco
    // si duplica los DOS salientes más recientes.
    const PREGUNTA_DIA = "¿Qué día cree que puede pasar? Le aviso al asesor. 📅";
    const texto = `Con gusto, la garantía es de 5 años.\n---\n${PREGUNTA_DIA}`;
    const r = sinBloquesCalcados(texto, [
      "La Kenda es coreana, muy buena marca.",
      "Puede pasar a verlas cuando guste.",
      PREGUNTA_DIA, // hace 3 mensajes: el cliente preguntó otra cosa en el medio
    ]);
    expect(r.texto).toBe(texto);
    expect(r.calcados).toEqual([]);
  });

  it("pero la pregunta calcada del mensaje inmediato anterior SÍ se quita", () => {
    const PREGUNTA_DIA = "¿Qué día cree que puede pasar? Le aviso al asesor. 📅";
    const r = sinBloquesCalcados(PREGUNTA_DIA, [PREGUNTA_DIA]);
    expect(r.texto).toBeNull();
    expect(r.calcados).toHaveLength(1);
  });
});
