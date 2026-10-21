import { describe, expect, it } from "vitest";
import { dondeEstaElCliente } from "../src/domain/fueraDeCobertura.js";
import { motivoParaNoSeguir } from "../src/domain/sinSeguimiento.js";

/**
 * CLIENTES FUERA DE QUITO QUE IGUAL RECIBÍAN MAPAS E INVITACIÓN A VISITAR
 * (auditoría 19-oct-2026, familia 7-A: Manabí, Machala, Cuenca, Tulcán, Píllaro).
 *
 * Los textos son los de producción, tal cual los escribió cada cliente.
 */

describe("dónde está el cliente — las formas que se escapaban", () => {
  it.each([
    // 27932, 15-oct 17:36 UTC: después recibió los mapas y dos «¿A cuál local…?».
    ["Enq parte de Manabi están", "Manabí"],
    ["Gracias las necesito para \nMANABI", "Manabí"],
    // 8924, 20-oct 00:52 UTC: después, tres «¿Qué día cree que puede pasar por Quito Sur?».
    ["Tungurahua Cantón Pillaro.", "Píllaro"],
    // 28916, 16-oct 22:29 UTC (audio): «aquí en» no estaba, solo «acá en».
    [
      "[El cliente mandó un audio. Dice: No voy a obtener todos los beneficios. ¿Qué precio tendría el envío, o si me podrías hacer algún descuento? Yo estoy aquí en Cuenca, pero sí le veo súper bonita la llanta.]",
      "Cuenca",
    ],
  ])("«%s» → fuera (%s)", (texto, ciudad) => {
    expect(dondeEstaElCliente(texto)).toEqual({ estado: "fuera", ciudad });
  });

  it("«Soy de provincia» dice que está fuera aunque no nombre la ciudad (8924)", () => {
    expect(dondeEstaElCliente("Soy de provincia..")?.estado).toBe("fuera");
  });

  it("los casos sanos no cambian", () => {
    expect(dondeEstaElCliente("Estoy en machala")).toEqual({ estado: "fuera", ciudad: "Machala" });
    expect(dondeEstaElCliente("En Tulcán")).toEqual({ estado: "fuera", ciudad: "Tulcán" });
    expect(dondeEstaElCliente("vivo en Cumbayá")?.estado).toBe("cobertura");
    expect(dondeEstaElCliente("Soy de Manabí pero el lunes voy a estar en Quito")?.estado).toBe("viene");
    // Una llanta para la «provincia» no es un lugar si el mensaje habla de otra cosa.
    expect(dondeEstaElCliente("¿Tienen la 205/55R16 en Kenda?")).toBeNull();
  });
});

describe("el seguimiento de quien está fuera de Quito: la detección llega a su dueño", () => {
  // 29642, 19-oct 13:30 UTC: «Estoy en machala» el día antes; el borrador del
  // seguimiento fue «Sobre su visita, ¿le ayudo a dejar lista la visita?». Desde
  // el sprint 4 decide `motivoParaNoSeguir` con `porQueNoPasaPorElLocal`; lo que
  // falta es que las formas de arriba lleguen a decir «fuera».
  it.each([
    "Estoy en machala",
    "Enq parte de Manabi están",
    "Tungurahua Cantón Pillaro.",
  ])("sin cotización, «%s» no recibe seguimiento", (texto) => {
    const sinVisita = dondeEstaElCliente(texto)?.estado === "fuera" ? "fuera_de_cobertura" as const : null;
    expect(motivoParaNoSeguir({ ultimo: "Gracias", anterior: texto, sinVisita, hayCotizacion: false }))
      .toBe("fuera_de_cobertura");
  });
});
