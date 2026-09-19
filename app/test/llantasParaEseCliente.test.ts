/**
 * A UNA CAMIONETA NO SE LE MUESTRAN LLANTAS DE AUTO, Y EL ANUNCIO SE LEE.
 * Auditoría 13–18 sep, familia 2, con los textos reales de los chats.
 */
import { describe, expect, it } from "vitest";
import { claseDeVehiculoEnTexto } from "../src/domain/claseDeVehiculo.js";
import { anuncioDelReferral, hechoDelAnuncio } from "../src/domain/anuncio.js";

describe("la clase de vehículo que el cliente dijo", () => {
  it.each([
    ["conv 20211", "Precio Rin 17 para camioneta 4x4"],
    ["conv 20077", "Para Mazda b 2600 para carga con aros y llantas"],
    ["conv 20663", "para una BT-50 4x4"],
    ["conv 20209", "Montero 4x4"],
  ])("%s: «%s» es camioneta", (_conv, texto) => {
    expect(claseDeVehiculoEnTexto([texto])).toBe("camioneta");
  });

  it("el anuncio de la KR601 también lo dice", () => {
    expect(claseDeVehiculoEnTexto([
      "En lá q están en el anuncio pero en fin 16",
      "¿Buscas agarre, duración y seguridad en cualquier terreno? La Kenda Klever KR601 es la llanta ideal",
    ])).toBe("camioneta");
  });

  it("un auto, o nada, no filtra", () => {
    expect(claseDeVehiculoEnTexto(["Que medida en r18 tienes saludos"])).toBeNull();
    expect(claseDeVehiculoEnTexto(["para un Chevrolet Aveo 2012", null])).toBeNull();
    expect(claseDeVehiculoEnTexto(["Hola información para un toyota raize"])).toBeNull();
  });
});

describe("el referral de Meta", () => {
  const referral = {
    source_type: "ad", source_url: "https://fb.me/abc",
    headline: "Depot Tire",
    body: "¿Buscas agarre, duración y seguridad en cualquier terreno? La Kenda Klever KR601 es la llanta ideal para tu próxima aventura.",
  };
  it("se reduce a título, texto y url", () => {
    expect(anuncioDelReferral(referral)).toEqual({
      titulo: "Depot Tire", texto: referral.body, url: "https://fb.me/abc",
    });
  });
  it("sin referral o vacío, null", () => {
    expect(anuncioDelReferral(undefined)).toBeNull();
    expect(anuncioDelReferral({ source_type: "ad" })).toBeNull();
  });
  it("el hecho nombra la llanta del anuncio", () => {
    expect(hechoDelAnuncio(anuncioDelReferral(referral)!)).toContain("KR601");
  });
});
