import { describe, expect, it } from "vitest";
import { detectOptOut } from "../src/domain/followUps.js";

describe("baja como adjetivo no es opt-out", () => {
  it("no silencia una objeción sobre la llanta", () => {
    // Chat 18225: «es llanta es muy baja» pausó al cliente casi seis horas.
    expect(detectOptOut("es muy baja")).toBe(false);
    expect(detectOptOut("la llanta es baja")).toBe(false);
  });

  it.each(["Callate", "no me escriban más", "dejen de molestar"])("conserva el opt-out real: %s", (texto) => {
    expect(detectOptOut(texto)).toBe(true);
  });

  it.each(["darme de baja", "me doy de baja", "dar de baja", "baja de la lista", "baja de la suscripción"])(
    "reconoce la baja explícita: %s",
    (texto) => expect(detectOptOut(texto)).toBe(true),
  );
});
