import { describe, expect, it } from "vitest";
import { COMPACT_PLAYBOOK } from "../src/agent/compactPlaybook.js";

describe("playbook compacto", () => {
  it("conserva las reglas de conversión y seguridad imprescindibles", () => {
    expect(COMPACT_PLAYBOOK).toMatch(/ENTREGA primero esa pieza/);
    expect(COMPACT_PLAYBOOK).toMatch(/Precio, stock[\s\S]{0,160}solo se afirman con datos de herramientas/);
    expect(COMPACT_PLAYBOOK).toMatch(/primero consigue el local; después pregunta el día/i);
    expect(COMPACT_PLAYBOOK).toMatch(/Nunca vuelvas a preguntar un dato/);
    expect(COMPACT_PLAYBOOK).toMatch(/notificar_vendedor/);
  });

  it("no puede olvidar registrar la visita", () => {
    expect(COMPACT_PLAYBOOK).toMatch(/agendar_visita/);
  });

  /** Evita volver a pegar incidentes y el manual histórico al prompt vivo. */
  it("es materialmente menor que el prompt histórico", () => {
    // 5 800 → 6 000 el 1-sep-2026: ese día entraron dos familias de reglas a
    // la vez (la forma fija del turno y «sin medida del cliente no se cotiza»)
    // y las dos son del negocio, no incidentes pegados. El tope sigue siendo
    // una fracción del prompt histórico; si vuelve a apretar, se recorta, no
    // se sube otra vez.
    expect(COMPACT_PLAYBOOK.length).toBeLessThan(6_000);
  });
});
