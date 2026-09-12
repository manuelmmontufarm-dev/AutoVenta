/**
 * «QUITO» LA CIUDAD NO ES «QUITO SUR» EL LOCAL.
 *
 * Los locales se llaman Cumbayá y Quito Sur, así que cuando el bot pregunta
 * cuál prefiere, un «al de quito» ES Quito Sur. Pero el mismo detector tomaba
 * cualquier mensaje con la palabra «quito» como si eligiera local:
 *
 *   conv 18821 · BOT: «¿Le queda mejor *Cumbayá* o *Quito Sur*? 🤝»
 *                CLIENTE: «Soy de Santo Domingo»
 *                CLIENTE: «Yo el lunes voy a estar en quito»
 *                → ficha: «Local elegido explícitamente por el cliente:
 *                  Depot Tire Quito Sur», visita confirmada tres veces.
 *
 *   conv 18221 · CLIENTE: «Yo les aviso el día que suba a la siudad de Quito»
 *                → mismo registro, y el bot le contestó con la plantilla de
 *                  rechazo.
 *
 * El cliente estaba diciendo cuándo viene a la ciudad, no a cuál de los dos
 * locales. Elegir local es nombrarlo; anunciar un viaje no lo es.
 */
import { describe, expect, it } from "vitest";
import { extractExplicitStore } from "../src/domain/storeSelection.js";

const respondiendo = { respondiendoAlLocal: true };

describe("elegir local vs. hablar de la ciudad", () => {
  it("conv 18821 y 18221: anunciar que viene a Quito no elige local", () => {
    expect(extractExplicitStore("Yo el lunes voy a estar en quito", respondiendo)).toBeNull();
    expect(extractExplicitStore("Yo les aviso el día que suba a la siudad de Quito", respondiendo)).toBeNull();
    expect(extractExplicitStore("la próxima semana subo a Quito", respondiendo)).toBeNull();
  });

  it("decir de dónde es tampoco elige local", () => {
    expect(extractExplicitStore("Soy de Santo Domingo", respondiendo)).toBeNull();
    expect(extractExplicitStore("vivo en Quito norte", respondiendo)).toBeNull();
    expect(extractExplicitStore("no vivo en Quito", respondiendo)).toBeNull();
  });

  it("pero elegir el local sigue funcionando igual (conv 3, 27-ago)", () => {
    expect(extractExplicitStore("al de quito", respondiendo)).toBe("Depot Tire Quito Sur");
    expect(extractExplicitStore("el de Quito", respondiendo)).toBe("Depot Tire Quito Sur");
    expect(extractExplicitStore("sur", respondiendo)).toBe("Depot Tire Quito Sur");
    expect(extractExplicitStore("Quito Sur", respondiendo)).toBe("Depot Tire Quito Sur");
    expect(extractExplicitStore("Al sur me resulta más fácil", respondiendo)).toBe("Depot Tire Quito Sur");
    expect(extractExplicitStore("Cumbayá", respondiendo)).toBe("Depot Tire Cumbayá");
    // «Bay» a secas (conv 17667) NO lo lee este detector y no se toca acá: lo
    // resolvió el modelo. Anotado como pendiente, no es de esta familia.
  });

  it("fuera de la pregunta del local, «quito» nunca elige nada", () => {
    expect(extractExplicitStore("estoy en quito")).toBeNull();
    expect(extractExplicitStore("Yo el lunes voy a estar en quito")).toBeNull();
  });
});
