/**
 * DEPOT SALE BYTE A BYTE IGUAL — con hashes, no con capturas (R-39).
 *
 * La línea base es la salida de `origin/main` = `dc50dab`, antes del plan
 * multicliente: 7 piezas, 5 textos y 4 garantías, con fecha y catálogo fijos.
 * Si esto falla, un cambio le movió algo a lo que ve el cliente de Depot. Si
 * fue a propósito, se regenera con el arnés y se dice en el PR:
 *
 *   npx tsx test/arneses/hashesPiezasDepot.ts test/arneses/hashes-depot.json
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { entornoDeDepot, hashesDePiezasDepot } from "./arneses/hashesPiezasDepot.js";

entornoDeDepot();

const LINEA_BASE: Record<string, string> = JSON.parse(
  readFileSync(new URL("./arneses/hashes-depot.json", import.meta.url), "utf8"),
);

describe("las piezas y textos de Depot no cambian", () => {
  it("los 16 sha256 son los de main antes del plan multicliente", async () => {
    const actuales = await hashesDePiezasDepot();
    expect(Object.keys(actuales)).toHaveLength(16);
    expect(actuales).toEqual(LINEA_BASE);
  }, 30_000);
});
