/**
 * Depot: cada link de Maps sale con el nombre de su local (17-nov).
 *
 * En Competimotor los links llegaron sueltos, sin saber de qué local era cada
 * uno. Depot tiene que seguir saliendo con el nombre pegado al link, y si el
 * modelo ya escribió la línea del local sin link, no se repite.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { buildStoreLinksBlock } = await import("../src/services/quoteMessages.js");
const { estructurarTurno } = await import("../src/domain/estructuraDelTurno.js");
const { motivoDeUbicacion } = await import("../src/domain/ubicacionPedida.js");

describe("Depot: los links de los locales siempre llevan su nombre", () => {
  it("cada línea del bloque es nombre + link", () => {
    const lineas = buildStoreLinksBlock().split("\n");
    expect(lineas.length).toBeGreaterThanOrEqual(2);
    for (const linea of lineas) expect(linea).toMatch(/^📍 \*Depot Tire [^*]+\*: https:\/\//);
  });

  it("en el turno, el link sale con su nombre y la línea del modelo no se repite", () => {
    const { texto } = estructurarTurno(
      `Tenemos dos locales.\n📍 *Depot Tire Cumbayá*: en la Interoceánica\n---\n${buildStoreLinksBlock()}`,
    );
    const [prosa, links] = texto.split("\n---\n");
    expect(prosa).toBe("Tenemos dos locales.");
    for (const linea of links.split("\n")) expect(linea).toMatch(/^📍 \*Depot Tire [^*]+\*: https:\/\//);
  });

  it("«qué locales tienen» también le manda los mapas a Depot", () => {
    expect(motivoDeUbicacion("qué locales tienen")).toBe("la_pidio");
  });
});
