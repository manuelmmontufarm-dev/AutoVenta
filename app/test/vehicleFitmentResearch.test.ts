import { describe, expect, it } from "vitest";
import { extractTireSizesFromUnknown } from "../src/domain/fitmentResearch.js";

describe("vehicle fitment research", () => {
  it("extrae y deduplica medidas desde respuestas anidadas", () => {
    expect(extractTireSizesFromUnknown({ wheels: [{ tire: "245/65R17" }, { note: "245/65r17 o 245/55R19" }] }))
      .toEqual(["245/65R17", "245/55R19"]);
  });
});
