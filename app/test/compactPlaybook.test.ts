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

  it("no puede olvidar registrar la visita", () => {
    expect(COMPACT_PLAYBOOK).toMatch(/agendar_visita/);
  });

  /*
   * El guardarraíl es contra la tentación de volver a pegar el playbook largo,
   * que son 18.400 caracteres. El techo subió de 4.500 a 5.000 el 26-ago para
   * que entrara la regla de `agendar_visita`: sin ella el bot confirma la
   * visita por escrito y no la registra, que es exactamente el fallo que se
   * llevó dos seguimientos y un cupón el 24-ago. Y de 5.000 a 5.100 el 27-ago
   * para la regla de la unidad («se dice 4 llantas, nunca el número a secas»),
   * que tiene que estar en los DOS playbooks o producción no la lee. Sigue
   * siendo ~1/4 del largo, que es lo que este techo protege.
   *
   * Y de 5.100 a 5.800 el 27-ago por dos reglas que producción no tenía y que
   * costaron dos fallas del mismo día: «si no es un NO, es un SÍ» (conv 11070,
   * el bot ofreció la cotización, el cliente dijo «Gracias» y el bot volvió a
   * ofrecerla — la regla existía en el playbook LARGO, que producción no lee) y
   * «el stock manda sobre la cotización» (conv 11720, se firmaron 4 llantas de
   * las que había 1). Las dos son de conversión y de verdad, no de estilo.
   */
  it("es materialmente menor que el prompt histórico", () => {
    expect(COMPACT_PLAYBOOK.length).toBeLessThan(5_800);
  });
});
