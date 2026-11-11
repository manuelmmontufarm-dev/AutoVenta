/**
 * `/privacy` LLEVA EL NOMBRE DEL NEGOCIO DE LA INSTANCIA.
 *
 * Meta pide esta URL para publicar la app de cada cliente. Hasta el
 * 11-nov-2026 decía «Depot Tire» también en el servicio de Mundillantas.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEPOT } from "../src/negocio/negocios/depot.js";
import { MUNDILLANTAS } from "../src/negocio/negocios/mundillantas.js";
import { nombreDelResponsable, renderPrivacidad } from "../src/server/privacidad.js";

const plantilla = readFileSync(
  fileURLToPath(new URL("../site/privacy.html", import.meta.url)),
  "utf8",
);

describe("política de privacidad por negocio", () => {
  it("la plantilla no tiene ningún negocio escrito a mano", () => {
    expect(plantilla).not.toMatch(/Depot|Mundillantas|Competimotor/);
    expect(plantilla).toContain("{{NEGOCIO}}");
  });

  it("Mundillantas: sus dos marcas y su número, nada de Depot", () => {
    const html = renderPrivacidad(plantilla, MUNDILLANTAS);
    expect(nombreDelResponsable(MUNDILLANTAS)).toBe("Competimotor y Mundillantas");
    expect(html).toContain("<title>Política de privacidad · AutoVenta / Competimotor y Mundillantas</title>");
    expect(html).toContain('href="tel:+593991244698">+593 99 124 4698</a>');
    expect(html).not.toMatch(/Depot|280 1766|\{\{/);
  });

  it("Depot: queda igual que antes del cambio", () => {
    const html = renderPrivacidad(plantilla, DEPOT);
    expect(html).toContain("Depot Tire utiliza AutoVenta");
    expect(html).toContain('href="tel:+593982801766">+593 98 280 1766</a>');
    expect(html).not.toMatch(/\{\{/);
  });
});
