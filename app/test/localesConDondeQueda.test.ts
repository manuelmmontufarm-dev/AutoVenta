/**
 * Al preguntar el local, Competimotor dice dónde queda cada uno (17-nov).
 *
 * «Mundillantas Falken / Mundillantas Kenda / Competimotor» no le dicen al
 * cliente cuál le queda cerca. Con `referencia` en el perfil, el mensaje de los
 * botones lista cada local con su referencia y su link de Maps.
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "mundillantas";
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { botonesParaBloque, conDondeQueda } = await import("../src/domain/botones.js");
const { PREGUNTA_DE_LOCAL, preguntaElLocal } = await import("../src/domain/storeSelection.js");
const { buildStoreLinksBlock } = await import("../src/services/quoteMessages.js");

describe("Competimotor: la pregunta del local dice dónde queda cada uno", () => {
  const bloque = `${PREGUNTA_DE_LOCAL} 📍`;

  it("lista los tres con su referencia, y el link de Maps cuando hay", () => {
    const cuerpo = conDondeQueda(bloque);
    expect(cuerpo).toContain("📍 *Mundillantas Falken*: Vía Quevedo km 2 y Manuel Borrero\nhttps://maps.app.goo.gl/swNHGotRKPLJn3LZA");
    expect(cuerpo).toContain("📍 *Mundillantas Kenda*: Vía Quevedo km 1½, a una cuadra del Banco Pichincha");
    expect(cuerpo).toContain("📍 *Competimotor*: Vía Quevedo km 1½ y Juan León Mera\nhttps://maps.app.goo.gl/QTFCzK2KDRXULRwz7");
    // La pregunta va al final, pegada a los botones.
    expect(cuerpo.endsWith(bloque)).toBe(true);
  });

  it("el cuerpo de los botones lleva las referencias y sigue reconocido como pregunta del local", () => {
    const conBotones = botonesParaBloque(bloque, { ciclo: 3 });
    expect(conBotones?.botones.map((b) => b.titulo)).toEqual(["Mundillantas Falken", "Mundillantas Kenda", "Competimotor"]);
    expect(conBotones?.cuerpo).toContain("a una cuadra del Banco Pichincha");
    expect(preguntaElLocal(conBotones!.cuerpo)).toBe(true);
    expect(conBotones!.cuerpo.length).toBeLessThanOrEqual(1024);
  });

  // 17-nov 19:56, «dónde quedan sus locales»: salió un mensaje con dos links
  // (sin Kenda) y después la pregunta repitió las tres ubicaciones.
  it("el mensaje de ubicaciones trae los tres locales, Kenda incluido", () => {
    const bloque = buildStoreLinksBlock();
    expect(bloque).toContain("📍 *Mundillantas Falken*: Vía Quevedo km 2 y Manuel Borrero\nhttps://maps.app.goo.gl/swNHGotRKPLJn3LZA");
    expect(bloque).toContain("📍 *Mundillantas Kenda*: Vía Quevedo km 1½, a una cuadra del Banco Pichincha");
    expect(bloque).toContain("📍 *Competimotor*: Vía Quevedo km 1½ y Juan León Mera\nhttps://maps.app.goo.gl/QTFCzK2KDRXULRwz7");
  });

  it("con un local elegido, solo ese", () => {
    expect(buildStoreLinksBlock("Competimotor", { soloDestacado: true }))
      .toBe("📍 *Competimotor*: Vía Quevedo km 1½ y Juan León Mera\nhttps://maps.app.goo.gl/QTFCzK2KDRXULRwz7");
  });

  it("si el turno ya mandó las ubicaciones, la pregunta del local no las repite", () => {
    const conBotones = botonesParaBloque(bloque, { ciclo: 3, bloquesAnteriores: ["Hola", buildStoreLinksBlock()] });
    expect(conBotones?.cuerpo).toBe(bloque);
    expect(conBotones?.botones).toHaveLength(3);
  });
});
