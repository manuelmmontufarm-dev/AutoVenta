import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  CIERRE_COTIZAR,
  sinPreguntasProhibidas,
} from "../src/domain/preguntasProhibidas.js";

type QuoteMessages = typeof import("../src/services/quoteMessages.js");
let buildCierreOpciones: QuoteMessages["buildCierreOpciones"];

beforeAll(async () => {
  process.env.WHATSAPP_TOKEN ||= "test";
  process.env.WHATSAPP_APP_SECRET ||= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
  process.env.WHATSAPP_PHONE_ID ||= "test";
  process.env.SELLER_PHONE ||= "593000000000";
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
  ({ buildCierreOpciones } = await import("../src/services/quoteMessages.js"));
});

/*
 * EL CANDADO SE ESTABA COMIENDO NUESTRO PROPIO CIERRE.
 *
 * `sinPreguntasProhibidas` borra «¿Se la cotizo por 4?» porque pedir permiso
 * para la cantidad es pedir la cantidad. Pero la regex no distingue quién
 * escribió la frase, y la plantilla de recomendación —`buildCierreOpciones`,
 * texto NUESTRO— cerraba con esa misma forma. Resultado en producción: al
 * cliente le llegaba «…es la premium de las tres. 😊», sin pedido y con el
 * emoji colgando, y al asesor le llegaba una alerta culpando al modelo por un
 * texto que no escribió.
 *
 * El arreglo no es aflojar la regex: es que el candado sepa cuáles frases son
 * de la casa. La frase de cierre vive en UNA constante (`CIERRE_COTIZAR`), en
 * el dominio, y la plantilla la importa — así la exención y el texto no se
 * pueden separar.
 */
describe("el candado no borra lo que escribe la casa", () => {
  it("el cierre de la recomendación sobrevive entero", () => {
    const cierre = buildCierreOpciones({
      entregarRecomendacion: true,
      recomendacion: "FALKEN ZE310R",
      motivo: "es la premium de las tres",
      precioConIva: 221.77,
    });
    const r = sinPreguntasProhibidas(cierre);
    expect(r.quitadas).toHaveLength(0);
    expect(r.texto).toBe(cierre);
    expect(r.texto).toContain(CIERRE_COTIZAR);
  });

  it("la frase canónica sola tampoco se toca", () => {
    const r = sinPreguntasProhibidas(CIERRE_COTIZAR);
    expect(r.texto).toBe(CIERRE_COTIZAR);
    expect(r.quitadas).toHaveLength(0);
  });

  /*
   * La exención es por coincidencia EXACTA, no por parecido: si el modelo
   * inventa su propia versión con otra cantidad, sigue siendo la pregunta que
   * gasta un turno y se sigue yendo.
   */
  it("la que escribe el modelo por su cuenta se sigue borrando", () => {
    const r = sinPreguntasProhibidas(
      "Buenísimo, la *FALKEN WILDPEAK A/T 4W* es muy buena opción. ¿Se la cotizo por 6?",
    );
    expect(r.texto).toBe("Buenísimo, la *FALKEN WILDPEAK A/T 4W* es muy buena opción.");
    expect(r.quitadas).toEqual(["¿Se la cotizo por 6?"]);
  });

  it("y «¿Se la cotizo por 4?», que es la vieja nuestra, tampoco está exenta", () => {
    const r = sinPreguntasProhibidas("Le va bien la Kenda. ¿Se la cotizo por 4?");
    expect(r.texto).toBe("Le va bien la Kenda.");
    expect(r.quitadas).toEqual(["¿Se la cotizo por 4?"]);
  });

  /* La plantilla y el candado leen la MISMA constante: una sola fuente. */
  it("la plantilla usa la constante del dominio, no una copia a mano", () => {
    const cierre = buildCierreOpciones({
      entregarRecomendacion: true,
      recomendacion: "Kenda KR203",
      motivo: "es el mejor equilibrio entre duración y precio",
    });
    expect(cierre).toContain(CIERRE_COTIZAR);
  });
});

/*
 * Y EL GUARDIÁN TAMBIÉN SE LO COMÍA.
 *
 * Probado en el simulador el 27-ago con el candado ya arreglado: el cierre
 * llegaba igual de mutilado, y el culpable era el otro. El Ángel Guardián lo
 * marcó «pregunta_de_mas (alta) — El borrador pregunta "¿Le cotizo el juego de
 * 4 llantas?"» y lo borró, porque su regla 15 le prohíbe pedir permiso para la
 * cantidad y no distinguía quién había escrito la frase. Corre ANTES de los
 * candados deterministas y es la última mano que reescribe: exentar solo el
 * candado dejaba el bug intacto para el cliente.
 *
 * La exención de su rúbrica interpola la MISMA constante, no una copia: si
 * alguien cambia el texto del cierre, la regla del guardián cambia con él.
 */
describe("la rúbrica del guardián conoce el cierre de la casa", () => {
  it("exenta la frase interpolando la constante del dominio", () => {
    const fuente = readFileSync(
      join(fileURLToPath(new URL("..", import.meta.url)), "src/services/guardian.ts"),
      "utf8",
    );
    expect(fuente).toContain("«${CIERRE_COTIZAR}» es el cierre de venta que escribe la PLANTILLA");
    expect(fuente).toContain('import { CIERRE_COTIZAR } from "../domain/preguntasProhibidas.js";');
  });
});
