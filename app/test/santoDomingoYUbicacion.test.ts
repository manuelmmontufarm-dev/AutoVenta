/**
 * DOS FALLAS DE LA MISMA CONVERSACIÓN, conv 11901 del 27-ago-2026.
 *
 * 1. «Soy de provincia de santo domingo» quedó guardado como una VISITA el
 *    domingo 30: `visit_date = 2026-08-30`, `customer_commitment` con esa
 *    frase, y una tarea al asesor que decía «Prometió: "Soy de provincia de
 *    santo domingo"». No prometió nada — dijo de dónde es, y justamente por eso
 *    es el cliente que NO puede pasar por el local.
 *
 * 2. En esa misma conversación el cliente preguntó «De donde son» y el bot
 *    contestó «Son *Kenda*»; después dijo de qué provincia era y el bot habló
 *    de Cumbayá y Quito Sur sin un solo link, hasta que entró el asesor a mano.
 */
import { describe, expect, it } from "vitest";
import { diaEnTexto } from "../src/domain/diasEnEspanol.js";
import { extractCustomerCommitment } from "../src/domain/customerCommitment.js";
import { motivoDeUbicacion, pideUbicacion, mencionaOtraCiudad } from "../src/domain/ubicacionPedida.js";

describe("«santo domingo» es una provincia, no un domingo", () => {
  it("EL CASO QUE FALLÓ: la frase exacta de la conv 11901", () => {
    expect(diaEnTexto("Soy de provincia de santo domingo")).toBeNull();
    expect(
      extractCustomerCommitment("Soy de provincia de santo domingo", new Date(), {
        respondiendoAlDia: true,
      }),
    ).toBeNull();
  });

  it("las otras formas de escribirlo", () => {
    for (const texto of [
      "soy de santo domingo", "vivo en sto domingo", "de Sto. Domingo",
      "santo domingo de los tsachilas", "estoy en san domingo",
    ]) expect(diaEnTexto(texto), texto).toBeNull();
  });

  it("EL CASO QUE NO DEBE DISPARAR: el domingo de verdad sigue siendo domingo", () => {
    expect(diaEnTexto("voy el domingo")?.nombre).toBe("domingo");
    expect(diaEnTexto("el domingo paso")?.nombre).toBe("domingo");
    // Con faltas también, que es de lo que vive este módulo.
    expect(diaEnTexto("paso el dominguo")?.nombre).toBe("domingo");
  });

  it("EL BORDE: es de Santo Domingo PERO viene el sábado", () => {
    // El candado es por palabra anterior, no por mensaje: el sábado sobrevive.
    expect(diaEnTexto("soy de santo domingo pero voy el sabado")?.nombre).toBe("sabado");
  });

  it("y no rompe los otros días pegados a un santo", () => {
    // «San Martín» no es martes; «Santa Lucía» no es nada. Que no invente días.
    expect(diaEnTexto("vivo por san martin")).toBeNull();
  });
});

describe("la ubicación se manda cuando la piden, no cuando toca en el embudo", () => {
  it("EL CASO QUE FALLÓ: «De donde son» pide ubicación", () => {
    expect(pideUbicacion("De donde son")).toBe(true);
    expect(motivoDeUbicacion("De donde son")).toBe("la_pidio");
  });

  it("las formas normales de preguntar dónde quedan", () => {
    for (const texto of [
      "dónde están ubicados", "donde quedan", "me manda la ubicacion",
      "cual es la direccion", "como llego", "tienen local en quito",
      "me pasa el mapa", "en que parte estan",
    ]) expect(pideUbicacion(texto), texto).toBe(true);
  });

  it("nombrar su provincia también trae el mapa, pero una sola vez", () => {
    expect(motivoDeUbicacion("Soy de provincia de santo domingo")).toBe("hablo_de_su_ciudad");
    expect(mencionaOtraCiudad("estoy en ambato")).toBe(true);
    expect(mencionaOtraCiudad("soy de guayaquil")).toBe(true);
  });

  it("EL CASO QUE NO DEBE DISPARAR: la conversación normal no arrastra mapas", () => {
    for (const texto of [
      "225/70R15", "cuanto cuestan", "la mas economica", "4 llantas",
      "gracias", "si", "cotíceme esa", "¿tienen kenda?",
    ]) expect(motivoDeUbicacion(texto), texto).toBeNull();
  });
});
