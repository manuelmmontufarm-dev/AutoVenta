/**
 * Al preguntar el local, Competimotor dice dónde queda cada uno (17-nov).
 *
 * «Mundillantas Falken / Mundillantas Kenda / Competimotor» no le dicen al
 * cliente cuál le queda cerca. Con `referencia` en el perfil, el mensaje de los
 * botones lista cada local con su referencia y su link de Maps.
 *
 * Desde el 18-nov cada servicio es UNA marca: Competimotor tiene un local y no
 * pregunta (ver `competimotorMarcaUnica.test.ts`). La pregunta con referencias
 * sigue viva para el servicio de Mundillantas, que tiene dos — por eso esta
 * prueba corre con `IDENTIDAD=mundillantas`.
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "mundillantas";
process.env.IDENTIDAD = "mundillantas";
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { botonesParaBloque, conDondeQueda } = await import("../src/domain/botones.js");
const { PREGUNTA_DE_LOCAL, preguntaElLocal } = await import("../src/domain/storeSelection.js");
const { buildStoreLinksBlock } = await import("../src/services/quoteMessages.js");
const { estructurarTurno } = await import("../src/domain/estructuraDelTurno.js");
const { motivoDeUbicacion } = await import("../src/domain/ubicacionPedida.js");

describe("Mundillantas: la pregunta del local dice dónde queda cada uno", () => {
  const bloque = `${PREGUNTA_DE_LOCAL} 📍`;

  it("lista los dos con su referencia, y el link de Maps cuando hay", () => {
    const cuerpo = conDondeQueda(bloque);
    expect(cuerpo).toContain("📍 *Mundillantas Falken* (Vía Quevedo km 2 y Manuel Borrero): https://maps.app.goo.gl/swNHGotRKPLJn3LZA");
    expect(cuerpo).toMatch(/📍 \*Mundillantas Kenda\* \(Vía Quevedo km 1½, a una cuadra del Banco Pichincha\): https:\/\/www\.google\.com\/maps\/search\//);
    expect(cuerpo).not.toMatch(/competimotor/i);
    // La pregunta va al final, pegada a los botones.
    expect(cuerpo.endsWith(bloque)).toBe(true);
  });

  it("el cuerpo de los botones lleva las referencias y sigue reconocido como pregunta del local", () => {
    const conBotones = botonesParaBloque(bloque, { ciclo: 3 });
    expect(conBotones?.botones.map((b) => b.titulo)).toEqual(["Mundillantas Falken", "Mundillantas Kenda"]);
    expect(conBotones?.cuerpo).toContain("a una cuadra del Banco Pichincha");
    expect(preguntaElLocal(conBotones!.cuerpo)).toBe(true);
    expect(conBotones!.cuerpo.length).toBeLessThanOrEqual(1024);
  });

  // 17-nov 19:56, «dónde quedan sus locales»: salió un mensaje con dos links
  // (sin Kenda) y después la pregunta repitió las tres ubicaciones.
  it("el mensaje de ubicaciones trae los dos locales, Kenda incluido", () => {
    const bloque = buildStoreLinksBlock();
    // Una línea por local, con su link: ninguna línea sin link.
    const lineas = bloque.split("\n");
    expect(lineas).toHaveLength(2);
    for (const linea of lineas) expect(linea).toMatch(/^📍 \*[^*]+\* \([^)]+\): https:\/\//);
    expect(bloque).toContain("Mundillantas Kenda* (Vía Quevedo km 1½, a una cuadra del Banco Pichincha): https://www.google.com/maps/search/");
  });

  it("con un local elegido, solo ese", () => {
    expect(buildStoreLinksBlock("Mundillantas Falken", { soloDestacado: true }))
      .toBe("📍 *Mundillantas Falken* (Vía Quevedo km 2 y Manuel Borrero): https://maps.app.goo.gl/swNHGotRKPLJn3LZA");
  });

  it("si el turno ya mandó las ubicaciones, la pregunta del local no las repite", () => {
    const conBotones = botonesParaBloque(bloque, { ciclo: 3, bloquesAnteriores: ["Hola", buildStoreLinksBlock()] });
    expect(conBotones?.cuerpo).toBe(bloque);
    expect(conBotones?.botones).toHaveLength(2);
  });

  // 17-nov 20:10, conv 1: el modelo escribió las direcciones sin link, se pegó
  // el bloque de mapas y el turno mandó los links sueltos en otra burbuja.
  it("el turno real: cada link sale junto a su local y las direcciones no se repiten", () => {
    const delModelo = [
      "Claro, le puedo mandar las ubicaciones por mapas de los 2 locales para que escoja el más cercano.",
      "",
      "📍 *Mundillantas Falken*: Vía Quevedo km 2 y Manuel Borrero",
      "",
      "📍 *Mundillantas Kenda*: Vía Quevedo km 1½, a una cuadra del Banco Pichincha",
    ].join("\n");
    const { texto } = estructurarTurno(`${delModelo}\n---\n${buildStoreLinksBlock()}`);
    const [prosa, links] = texto.split("\n---\n");
    expect(prosa).toBe("Claro, le puedo mandar las ubicaciones por mapas de los 2 locales para que escoja el más cercano.");
    expect(links.split("\n")).toHaveLength(2);
    for (const linea of links.split("\n")) expect(linea).toMatch(/^📍 \*[^*]+\* \([^)]+\): https:\/\//);
  });

  it("«qué locales tiene» manda las ubicaciones de una", () => {
    expect(motivoDeUbicacion("hola que locales tiene")).toBe("la_pidio");
    expect(motivoDeUbicacion("cuántas sucursales tienen")).toBe("la_pidio");
    expect(motivoDeUbicacion("dónde quedan sus locales")).toBe("la_pidio");
  });
});
