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
    // 31-ago: el cierre ya no pide permiso; lo que tiene que sobrevivir es la
    // recomendación con su precio (la cotización sale sola en el mismo turno).
    expect(r.texto).toContain("FALKEN ZE310R");
    expect(r.texto).toContain("221.77");
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

  /* La constante sigue exenta para el GUARDIÁN: su rúbrica la nombra como la
     única forma legítima de pedir la cotización, y si un día vuelve a hacer
     falta pedir permiso, el candado no puede comérsela. La plantilla ya no la
     escribe (31-ago), pero la exención tiene que seguir viva. */
  it("la constante de la casa sigue exenta del candado", () => {
    const r = sinPreguntasProhibidas(`Yo iría por la *Kenda KR203*. ${CIERRE_COTIZAR}`);
    expect(r.quitadas).toHaveLength(0);
    expect(r.texto).toContain(CIERRE_COTIZAR);
  });

  it("la plantilla ya no pide permiso para cotizar", () => {
    const cierre = buildCierreOpciones({
      entregarRecomendacion: true,
      recomendacion: "Kenda KR203",
      motivo: "es el mejor equilibrio entre duración y precio",
    });
    expect(cierre).not.toContain(CIERRE_COTIZAR);
    expect(cierre).toContain("Kenda KR203");
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

/**
 * EL CONECTOR QUE SE QUEDÓ SIN SU PREGUNTA.
 *
 * Simulador, 27-ago-2026, reproduciendo la conv 11901. El candado se llevó la
 * pregunta —correcto— y le mandó al cliente el resto tal cual, cortado a la
 * mitad: «… costo y tiempo de entrega. Para avanzar,». Una frase que se corta
 * se lee como un bot roto, que es peor que la pregunta que se estaba quitando.
 */
describe("lo que queda después de quitar la pregunta se lee entero", () => {
  it("EL CASO QUE FALLÓ: «Para avanzar,» no se queda colgando", () => {
    const borrador =
      "Perfecto, para Santo Domingo un asesor le confirma si se puede despachar, costo y tiempo de entrega.\n"
      + "Para avanzar, ¿le cotizo la Kenda KR15 por 4 llantas o prefiere KR33A?";
    const { texto, quitadas } = sinPreguntasProhibidas(borrador);
    expect(quitadas.length).toBeGreaterThan(0);
    expect(texto).not.toMatch(/Para avanzar,?\s*$/);
    expect(texto).toMatch(/tiempo de entrega\.$/);
  });

  it("una coma huérfana al final tampoco sobrevive", () => {
    const { texto } = sinPreguntasProhibidas(
      "Le dejo la KR15 a $99.69,\n¿cuántas llantas necesita?",
    );
    expect(texto).not.toMatch(/,\s*$/);
  });

  it("EL CASO QUE NO DEBE DISPARAR: un texto sin preguntas prohibidas no se toca", () => {
    const intacto = "Para avanzar, le dejo la cotización por 4 llantas.\nAhí la tiene 👍";
    expect(sinPreguntasProhibidas(intacto).texto).toBe(intacto);
  });

  it("y un «Para avanzar» que SÍ lleva frase propia se respeta", () => {
    const { texto } = sinPreguntasProhibidas(
      "Para avanzar le mando la cotización.\n¿Cuántas llantas quiere?",
    );
    expect(texto).toMatch(/Para avanzar le mando la cotización\./);
  });
});

/*
 * PENDIENTE DEL 27-AGO, CERRADO EL 29-AGO: «¿Cuántas necesita de cada
 * medida…?» se escapaba porque la regex exigía el sustantivo (llantas,
 * unidades) dentro de la pregunta. La forma sin sustantivo es la misma
 * pregunta prohibida; «¿cuántos km dura?» no lo es y tiene que sobrevivir.
 */
describe("la pregunta de cantidad sin el sustantivo también se borra", () => {
  it.each([
    "¿Cuántas necesita de cada medida?",
    "¿Cuántas quiere que le cotice?",
    "¿Cuántas va a llevar?",
    "¿Cuántas serían en total?",
  ])("«%s» se quita", (pregunta) => {
    const r = sinPreguntasProhibidas(`La KENDA KR20 es muy buena opción. ${pregunta}`);
    expect(r.quitadas).toEqual([pregunta]);
    expect(r.texto).toBe("La KENDA KR20 es muy buena opción.");
  });

  it.each([
    "¿Cuántos kilómetros dura la Falken?",
    "¿Cuántos meses de seguro incluye?",
    "¿En cuánto tiempo me la instalan?",
  ])("«%s» sobrevive: no pide cantidad", (pregunta) => {
    const r = sinPreguntasProhibidas(pregunta);
    expect(r.quitadas).toHaveLength(0);
    expect(r.texto).toBe(pregunta);
  });
});
