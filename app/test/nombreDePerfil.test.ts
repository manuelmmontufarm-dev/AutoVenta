/**
 * Auditoría 9-nov-2026, bloque D: el bot saludaba con la primera palabra del
 * nombre del perfil de WhatsApp tal cual. «Hola La» (La Brocheta Burguer),
 * «Hola Tapicería», «Hola Mmmmmm», «Hola Lagophone»… 16 de 69 saludos de la
 * ventana 6–8 nov no eran un nombre de persona. Con nombre solo si de verdad
 * parece un nombre de pila; en la duda, «¡Hola!» a secas.
 *
 * Los perfiles son los reales del análisis (`causa-candados-saludo.md`, bloque D).
 */
import { describe, expect, it } from "vitest";
import { conPresentacion, conSaludo, nombreSaludable, presentacionDeApertura } from "../src/domain/saludo.js";

const PERFILES_QUE_NO_SON_UN_NOMBRE: Array<[string, string]> = [
  ["39011", "La Brocheta Burguer"],
  ["40172", "Tapicería Multimarcas"],
  ["40082", "mmmmmm"],
  ["39909", "Lagophone"],
  ["39759", "Alternativa"],
  ["40123", "CAMBICOL S.A.S"],
  ["39561", "JUPANA'S INGENIERÍA CLI"],
  ["40137", "POLIstone"],
  ["39675", "REPROGENETIC PC 🐴🦌🐊🐒🐄🦡🐯🐗🐺"],
  ["39635", "Temor Solo A Dios 😎"],
  ["40170", "Tecniso"],
  ["39474", "Yo"],
  ["34987", "JP"],
  ["40042", "MJE"],
  ["39326", "Aaaaa"],
  ["39262", "El libro"],
  ["39460", "El Sobreviviente"],
  ["39409", "destroyer"],
  ["38872", "HAGA"],
  ["34999", "El Ñeque Tapa Todo 💪🙏🏼"],
];

describe("nombreSaludable: solo un nombre de pila", () => {
  it.each(PERFILES_QUE_NO_SON_UN_NOMBRE)("conv %s · «%s» → sin nombre", (_conv, perfil) => {
    expect(nombreSaludable(perfil)).toBeNull();
  });

  it("los nombres reales siguen saliendo (Carlos 39834, Paul 40097)", () => {
    expect(nombreSaludable("Carlos")).toBe("Carlos");
    expect(nombreSaludable("Paul Escobar")).toBe("Paul");
    expect(nombreSaludable("Miguelito")).toBe("Miguelito");
    expect(nombreSaludable("Fernandito")).toBe("Fernandito");
    expect(nombreSaludable("Pepito")).toBe("Pepito");
    expect(nombreSaludable("Tatiana🌷")).toBe("Tatiana");
    expect(nombreSaludable("Yady 🌴")).toBeNull(); // no es un nombre de la lista: en la duda, sin nombre
    expect(nombreSaludable("Haydee  Saltos🙏🏻")).toBe("Haydee");
    expect(nombreSaludable("Eduardo Andrés Barnuevo F")).toBe("Eduardo");
    expect(nombreSaludable("Maria De Lourdes")).toBe("Maria");
    expect(nombreSaludable("María Fernanda Pérez")).toBe("María");
    expect(nombreSaludable("jimmy  balseca")).toBe("Jimmy");
    expect(nombreSaludable("angel")).toBe("Angel");
  });

  it("acepta el nombre con o sin tilde, en minúscula o capitalizado", () => {
    expect(nombreSaludable("jose")).toBe("Jose");
    expect(nombreSaludable("José")).toBe("José");
    expect(nombreSaludable("andres")).toBe("Andres");
    expect(nombreSaludable("Mónica")).toBe("Mónica");
    expect(nombreSaludable("monica")).toBe("Monica");
  });

  it("todo en mayúsculas no es un nombre escrito por una persona: duda → sin nombre", () => {
    expect(nombreSaludable("JOSÉ")).toBeNull();
    expect(nombreSaludable("WILLIAM PILATAXI")).toBeNull();
  });

  it("perfil con más de 4 palabras o con sufijo de empresa → sin nombre", () => {
    expect(nombreSaludable("Carlos Perez Importaciones del Sur")).toBeNull();
    expect(nombreSaludable("Carlos Andrés Pérez Mora")).toBe("Carlos");
    expect(nombreSaludable("Carlos Lopez S.A.S")).toBeNull();
    expect(nombreSaludable("Juan Pérez Cía. Ltda")).toBeNull();
    expect(nombreSaludable("Pablo SAS")).toBeNull();
  });

  it("lo que ya se descartaba por forma sigue descartado", () => {
    expect(nombreSaludable("angelbarreiro1986")).toBeNull();
    expect(nombreSaludable("593995199290")).toBeNull();
    expect(nombreSaludable("🔥🔥")).toBeNull();
    expect(nombreSaludable("A")).toBeNull();
    expect(nombreSaludable("D A N I L O 😎")).toBeNull();
    expect(nombreSaludable(".")).toBeNull();
    expect(nombreSaludable("")).toBeNull();
    expect(nombreSaludable(null)).toBeNull();
    expect(nombreSaludable(undefined)).toBeNull();
  });
});

describe("todas las puertas que saludan por nombre usan el mismo filtro", () => {
  it("la presentación de apertura (turno normal)", () => {
    expect(presentacionDeApertura("La Brocheta Burguer")).toMatch(/^¡Hola! 👋/);
    expect(presentacionDeApertura("Tapicería Multimarcas")).toMatch(/^¡Hola! 👋/);
    expect(presentacionDeApertura("Carlos")).toMatch(/^¡Hola, Carlos! 👋/);
  });

  it("el saludo que se antepone al primer texto (wa/client: retomada, rutas directas)", () => {
    expect(conSaludo("¿Qué aro usa?", "mmmmmm")).toBe("¡Hola! 👋\n¿Qué aro usa?");
    expect(conPresentacion("¿Qué aro usa?", "Lagophone")).toMatch(/^¡Hola! 👋 /);
    expect(conPresentacion("¿Qué aro usa?", "Paul Escobar")).toMatch(/^¡Hola, Paul! 👋 /);
  });
});
