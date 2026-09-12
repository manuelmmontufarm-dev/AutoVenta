/**
 * EL AUDIO QUE DEVUELVE EL PROMPT EN VEZ DE LO QUE DIJO EL CLIENTE.
 *
 * Conv 18025, 9-sep-2026 15:39. El cliente mandó dos audios seguidos y los dos
 * se «transcribieron» con exactamente el mismo texto:
 *
 *   «Llantas en Quito. Medidas como 205/55R16, 265/70R17, aro, rin, juego de
 *    4. Marcas: Kenda, Falken, Sunoco, Eurolub, Wildpeak. Cotización, precio,
 *    camioneta.»
 *
 * Eso no es una frase: es el vocabulario que este mismo archivo le pasa a
 * Whisper como sesgo. Cuando el audio sale corto, mudo o inaudible, el modelo
 * devuelve el prompt. El bot lo tomó como palabra del cliente, sacó de ahí
 * «205/55R16» y le mandó opciones de una medida que nadie había pedido; la
 * cotización COT-MTUKH7VH terminó en esa medida fantasma, ni la de la foto
 * (205/65R16) ni la equivalente que se había ofrecido (215/65R16).
 *
 * Un audio que no se entendió tiene que comportarse como un audio que no se
 * entendió.
 */
import { beforeAll, describe, expect, it } from "vitest";

let esEcoDelVocabulario: (texto: string) => boolean;

beforeAll(async () => {
  process.env.WHATSAPP_TOKEN ||= "test";
  process.env.WHATSAPP_APP_SECRET ||= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
  process.env.WHATSAPP_PHONE_ID ||= "test";
  process.env.SELLER_PHONE ||= "593000000000";
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
  ({ esEcoDelVocabulario } = await import("../src/domain/transcripcionEco.js"));
});

describe("el audio que devuelve el vocabulario del prompt", () => {
  it("descarta el eco exacto, que es el caso de la conv 18025", () => {
    expect(
      esEcoDelVocabulario(
        "Llantas en Quito. Medidas como 205/55R16, 265/70R17, aro, rin, juego de 4. "
        + "Marcas: Kenda, Falken, Sunoco, Eurolub, Wildpeak. Cotización, precio, camioneta.",
      ),
    ).toBe(true);
  });

  it("descarta un pedazo del vocabulario", () => {
    expect(esEcoDelVocabulario("Marcas: Kenda, Falken, Sunoco, Eurolub, Wildpeak.")).toBe(true);
    expect(esEcoDelVocabulario("Llantas en Quito. Medidas como 205/55R16, 265/70R17")).toBe(true);
  });

  it("descarta el eco aunque cambie la puntuación o las mayúsculas", () => {
    expect(esEcoDelVocabulario("llantas en quito medidas como 205 55 r16 265 70 r17 aro rin juego de 4")).toBe(true);
  });

  it("deja pasar lo que el cliente dice de verdad, aunque use esas palabras", () => {
    for (const dicho of [
      "Buenas, necesito llantas 205/55R16 para mi carro, ¿cuánto cuesta el juego de 4?",
      "Hola, quiero una cotización de llantas Kenda para camioneta, aro 17",
      "el parcito de llanta rin 16 para la Mazda para la 2600",
      "Muy buenas noches, ¿tienen Falken en 265/70R17?",
      "Llantas en Quito",
    ]) {
      expect(esEcoDelVocabulario(dicho), dicho).toBe(false);
    }
  });

  it("un texto vacío o de una palabra no es eco: es un audio corto normal", () => {
    expect(esEcoDelVocabulario("")).toBe(false);
    expect(esEcoDelVocabulario("Hola")).toBe(false);
    expect(esEcoDelVocabulario("camioneta")).toBe(false);
  });
});
