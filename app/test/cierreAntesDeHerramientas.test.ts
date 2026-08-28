/**
 * Conv 11818, 27-ago-2026: después de «Ya Ise el pedido aquí en Ibarra
 * gracias», el bot mandó los mapas. El candado final podía reemplazar el texto,
 * pero para entonces una herramienta ya había hecho el envío por su cuenta.
 *
 * Esta prueba cuida la frontera que faltaba: una despedida terminal se reconoce
 * antes de las rutas directas y de `runAgent`, porque ambas pueden ejecutar
 * herramientas con efectos laterales (mapas, guía de medida, piezas).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DESPEDIDA_VENTA_PERDIDA,
  despedidaQueCorresponde,
} from "../src/domain/cierrePerdido.js";

const indexSource = readFileSync(
  fileURLToPath(new URL("../src/index.ts", import.meta.url)),
  "utf8",
);

describe("la venta perdida se corta antes de cualquier herramienta", () => {
  it("reconoce la frase textual de la conv 11818", () => {
    expect(despedidaQueCorresponde("Ya Ise el pedido aquí en Ibarra gracias"))
      .toBe(DESPEDIDA_VENTA_PERDIDA);
  });

  it("el turno normal no ejecuta rutas ni agente después de reconocerla", () => {
    const corte = indexSource.indexOf("const cierreAntesDeHerramientas = despedidaQueCorresponde");
    const rutas = indexSource.indexOf("const directReply = cierreAntesDeHerramientas");
    const agente = indexSource.indexOf("await runAgent", rutas);

    expect(corte).toBeGreaterThan(0);
    expect(rutas).toBeGreaterThan(corte);
    expect(agente).toBeGreaterThan(rutas);
    expect(indexSource.slice(rutas, agente)).toMatch(
      /const directReply = cierreAntesDeHerramientas\s*\?\s*null/,
    );
    expect(indexSource.slice(rutas, agente)).toContain(
      "const reply = cierreAntesDeHerramientas ?? directReply ??",
    );
  });

  it("una conversación viva sigue llegando al agente", () => {
    expect(despedidaQueCorresponde("¿Me cotiza el juego de 4?"))
      .toBeNull();
  });
});
