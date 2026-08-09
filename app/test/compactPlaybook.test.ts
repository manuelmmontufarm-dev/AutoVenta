import { describe, expect, it } from "vitest";
import { COMPACT_PLAYBOOK } from "../src/agent/compactPlaybook.js";

describe("playbook compacto", () => {
  it("conserva las reglas de conversión y seguridad imprescindibles", () => {
    expect(COMPACT_PLAYBOOK).toMatch(/ENTREGA primero esa pieza/);
    expect(COMPACT_PLAYBOOK).toMatch(/No inventes precios/);
    expect(COMPACT_PLAYBOOK).toMatch(/local explícito.*gana/i);
    expect(COMPACT_PLAYBOOK).toMatch(/no los vuelvas a preguntar/i);
    expect(COMPACT_PLAYBOOK).toMatch(/notificar_vendedor/);
  });

  it("es materialmente menor que el prompt histórico", () => {
    expect(COMPACT_PLAYBOOK.length).toBeLessThan(4_500);
  });
});
