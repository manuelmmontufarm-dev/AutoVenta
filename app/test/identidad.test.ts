/**
 * LAS REGLAS DE LAS IDENTIDADES (R-01, R-02) — pruebas puras sobre perfiles.
 *
 * Un negocio puede tener varias marcas comerciales. Las reglas que no se
 * negocian, para cualquier perfil:
 *
 *  · sin `identidades` → UNA identidad con todos los locales (Depot no cambia);
 *  · cada local pertenece a EXACTAMENTE una identidad (si no, no arranca);
 *  · la identidad de una conversación nunca sale de un local que no existe.
 */
import { describe, expect, it } from "vitest";
import { DEPOT } from "../src/negocio/negocios/depot.js";
import { EJEMPLO } from "../src/negocio/negocios/ejemplo.js";
import { MUNDILLANTAS } from "../src/negocio/negocios/mundillantas.js";
import {
  faltantesDelPerfil,
  identidadDeLaConversacion,
  identidadDelLocal,
  identidades,
  localesDeIdentidad,
  nombresDelNegocio,
  validarIdentidades,
} from "../src/negocio/identidad.js";
import {
  firmaDePresentacion,
  fraseDePresentacion,
  inicialesDelNegocio,
  sinPendiente,
  esPendiente,
  type PerfilDeNegocio,
} from "../src/negocio/perfil.js";

describe("sin `identidades` hay una sola, que es el negocio", () => {
  it("Depot: una identidad con sus dos locales", () => {
    expect(identidades(DEPOT)).toEqual([
      { id: "depot", nombre: "Depot Tire", locales: ["cumbaya", "quito_sur"] },
    ]);
    expect(nombresDelNegocio(DEPOT)).toEqual(["Depot Tire"]);
  });

  it("la plantilla de un local también", () => {
    expect(identidades(EJEMPLO)).toEqual([
      { id: "ejemplo", nombre: "Llantera Ejemplo", locales: ["principal"] },
    ]);
  });

  it("la presentación de Depot es la de siempre", () => {
    expect(fraseDePresentacion(DEPOT)).toBe("Depot Tire");
    expect(firmaDePresentacion(DEPOT)).toBe("Soy Martín, de Depot Tire");
    expect(inicialesDelNegocio(DEPOT)).toBe("DT");
  });
});

describe("cada local pertenece a exactamente una identidad", () => {
  it("los tres perfiles reales pasan la validación", () => {
    for (const perfil of [DEPOT, EJEMPLO, MUNDILLANTAS]) expect(() => validarIdentidades(perfil)).not.toThrow();
  });

  it("un local en dos marcas no arranca", () => {
    const ambiguo: PerfilDeNegocio = {
      ...MUNDILLANTAS,
      identidades: [
        { id: "mundillantas", nombre: "Mundillantas", locales: ["matriz", "local2", "competimotor"] },
        { id: "competimotor", nombre: "Competimotor", locales: ["competimotor"] },
      ],
    };
    expect(() => validarIdentidades(ambiguo)).toThrow(/dos identidades/);
  });

  it("un local sin marca no arranca", () => {
    const huerfano: PerfilDeNegocio = {
      ...MUNDILLANTAS,
      identidades: [{ id: "mundillantas", nombre: "Mundillantas", locales: ["matriz", "local2"] }],
    };
    expect(() => validarIdentidades(huerfano)).toThrow(/ninguna identidad/);
  });

  it("una marca que nombra un local inexistente no arranca", () => {
    const fantasma: PerfilDeNegocio = {
      ...MUNDILLANTAS,
      identidades: [
        { id: "mundillantas", nombre: "Mundillantas", locales: ["matriz", "local2", "norte"] },
        { id: "competimotor", nombre: "Competimotor", locales: ["competimotor"] },
      ],
    };
    expect(() => validarIdentidades(fantasma)).toThrow(/no existe/);
  });
});

describe("la identidad de una conversación", () => {
  it("es la del local elegido, por slug o por nombre", () => {
    expect(identidadDeLaConversacion(MUNDILLANTAS, "competimotor").id).toBe("competimotor");
    expect(identidadDeLaConversacion(MUNDILLANTAS, "Competimotor").id).toBe("competimotor");
    expect(identidadDeLaConversacion(MUNDILLANTAS, "Mundillantas Matriz").id).toBe("mundillantas");
    expect(identidadDeLaConversacion(MUNDILLANTAS, "local2").id).toBe("mundillantas");
  });

  it("sin local, o con un local que no existe, es la de la presentación — nunca inventada", () => {
    expect(identidadDeLaConversacion(MUNDILLANTAS, null).id).toBe("mundillantas");
    expect(identidadDeLaConversacion(MUNDILLANTAS, "").id).toBe("mundillantas");
    expect(identidadDeLaConversacion(MUNDILLANTAS, "Competimotor Norte").id).toBe("mundillantas");
    expect(identidadDelLocal(MUNDILLANTAS, "Competimotor Norte")).toBeNull();
  });

  it("la presentación fija manda cuando no hay local", () => {
    const fija: PerfilDeNegocio = {
      ...MUNDILLANTAS,
      presentacion: { modo: "fija", identidad: "competimotor" },
    };
    expect(identidadDeLaConversacion(fija, null).id).toBe("competimotor");
    expect(fraseDePresentacion(fija)).toBe("Competimotor");
  });

  it("Depot: toda conversación es Depot Tire", () => {
    for (const local of [null, "Depot Tire Cumbayá", "quito_sur", "Depot Tire Norte"]) {
      expect(identidadDeLaConversacion(DEPOT, local)).toEqual(identidades(DEPOT)[0]);
    }
  });
});

describe("los locales de una identidad", () => {
  it("Competimotor solo lista su local; sin identidad, todos", () => {
    expect(localesDeIdentidad(MUNDILLANTAS, "competimotor").map((l) => l.slug)).toEqual(["competimotor"]);
    expect(localesDeIdentidad(MUNDILLANTAS, "mundillantas").map((l) => l.slug)).toEqual(["matriz", "local2"]);
    expect(localesDeIdentidad(MUNDILLANTAS).length).toBe(3);
    expect(localesDeIdentidad(MUNDILLANTAS, "inexistente").length).toBe(3);
  });
});

describe("el candado de lo pendiente (R-10), en frío", () => {
  it("sinPendiente omite o reemplaza, y deja pasar lo confirmado", () => {
    expect(esPendiente("[PENDIENTE] algo")).toBe(true);
    expect(esPendiente("  [PENDIENTE] algo")).toBe(true);
    expect(esPendiente("Precio [PENDIENTE]")).toBe(false);
    expect(sinPendiente("[PENDIENTE] algo")).toBe("");
    expect(sinPendiente("[PENDIENTE] algo", "respaldo")).toBe("respaldo");
    expect(sinPendiente("Confirmado", "respaldo")).toBe("Confirmado");
    expect(sinPendiente(undefined, "respaldo")).toBe("respaldo");
  });

  it("un vendedor pendiente se presenta como asistente", () => {
    expect(firmaDePresentacion(MUNDILLANTAS)).toBe("Soy el asistente de Competimotor y Mundillantas");
    const conNombre = { ...MUNDILLANTAS, vendedor: { nombre: "Carla" } };
    expect(firmaDePresentacion(conNombre)).toBe("Soy Carla, de Competimotor y Mundillantas");
  });

  it("combinada sin frase une las marcas con «y»", () => {
    const sinFrase: PerfilDeNegocio = { ...MUNDILLANTAS, presentacion: { modo: "combinada" } };
    expect(fraseDePresentacion(sinFrase)).toBe("Mundillantas y Competimotor");
  });
});

describe("faltantesDelPerfil", () => {
  it("Depot y la plantilla no tienen nada pendiente", () => {
    expect(faltantesDelPerfil(DEPOT)).toEqual([]);
    expect(faltantesDelPerfil(EJEMPLO)).toEqual([]);
  });

  it("Mundillantas lista cada hueco con una ruta legible", () => {
    const faltantes = faltantesDelPerfil(MUNDILLANTAS);
    expect(faltantes).toContain("teléfono");
    expect(faltantes).toContain("vendedor · nombre");
    expect(faltantes).toContain("piezas · qué incluye toda compra");
    // Los numéricos declarados también van.
    expect(faltantes.some((f) => f.startsWith("garantías por marca"))).toBe(true);
    // Lo que Jenny confirmó el 6-nov NO aparece.
    expect(faltantes).not.toContain("piezas · condiciones de las piezas");
    expect(faltantes).not.toContain("local2 · dirección");
    expect(faltantes).not.toContain("Competimotor · dirección");
  });
});
