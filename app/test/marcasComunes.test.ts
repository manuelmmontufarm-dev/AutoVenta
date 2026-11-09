/**
 * Ronda 2 del Sprint 4: al unificar las listas de marcas entró «general» como
 * palabra suelta y `marcaPreguntada` empezó a detectar la marca GENERAL en
 * «¿Cuánto cuestan en general las 205/55R16?» — el bot respondía «De GENERAL
 * no tengo disponibilidad». Una marca que también es una palabra común del
 * español no puede estar suelta en la lista.
 */
import { describe, expect, it } from "vitest";
import { marcaPreguntada } from "../src/domain/consultaConRespaldo.js";
import { isGenericFirstContact } from "../src/domain/firstContact.js";
import { buscarConEscalera, normalizeContificoProduct, type CatalogItem } from "../src/domain/catalog.js";
import { MARCAS_DE_LLANTA_CONOCIDAS } from "../src/domain/marcasDeLlanta.js";

const FRASES_COMUNES = [
  "¿Cuánto cuestan en general las 205/55R16?",
  "¿Qué precios tienen en general?",
  "por lo general cuanto cuesta la 205/55R16",
  "precio general de la 205/55R16",
  "Buenas, ¿tienen llantas en general?",
];

describe("palabras comunes no son marcas", () => {
  it.each(FRASES_COMUNES)("«%s» no es preguntar por una marca", (frase) => {
    expect(marcaPreguntada(frase)).toBeNull();
  });

  it("«general» suelta no está en la lista; «general tire» sí", () => {
    expect(MARCAS_DE_LLANTA_CONOCIDAS as readonly string[]).not.toContain("general");
    expect(MARCAS_DE_LLANTA_CONOCIDAS as readonly string[]).toContain("general tire");
    expect(marcaPreguntada("¿tienen General Tire en 205/55R16?")).toBe("GENERAL TIRE");
  });

  it("las marcas que consultaConRespaldo ganó al unificar solo disparan si se nombran", () => {
    for (const marca of ["apollo", "aeolus", "chaoyang", "goodrich", "bf goodrich"]) {
      expect(marcaPreguntada(`¿tienen ${marca} en 205/55R16?`)).toBe(marca.toUpperCase());
      expect(marcaPreguntada("¿Cuánto cuestan las 205/55R16?")).toBeNull();
    }
  });

  it("«sunoco» no se agregó: no es marca de llanta y «aceite sunoco» no debe forzar la búsqueda de llantas", () => {
    expect(MARCAS_DE_LLANTA_CONOCIDAS as readonly string[]).not.toContain("sunoco");
    expect(marcaPreguntada("¿cuánto cuesta el aceite sunoco?")).toBeNull();
  });

  it("el buscador no trata «general» como marca", () => {
    const item = normalizeContificoProduct(
      { id: "1", codigo: "35272004", nombre: "KENDA LT265/65R17 10PR 120/117Q - KR601 TL (CARGA)", marca_nombre: "KENDA", estado: "A", tipo: "PRO", pvp1: "70", porcentaje_iva: 15, cantidad_stock: "4", imagen: null },
      "pvp1",
    ) as CatalogItem;
    // Si «general» fuera marca ausente del catálogo, esta relajación se cancelaría.
    expect(buscarConEscalera([item], "Klever KR601 en general").resultados.length).toBe(1);
  });

  it("firstContact: un saludo con una marca sigue sin ser genérico; «Hola» solo sí", () => {
    expect(isGenericFirstContact("Hola")).toBe(true);
    expect(isGenericFirstContact("Hola, precio de la Kenda")).toBe(false);
    expect(isGenericFirstContact("Hola, ¿tienen Giti?")).toBe(false);
  });
});
