import { describe, expect, it } from "vitest";
import { extractLoadSpeed } from "../src/domain/loadSpeed.js";

describe("extractLoadSpeed", () => {
  it("extrae índice simple pegado (112T)", () => {
    const ls = extractLoadSpeed("265/70R16 112T MAXCLAW A/T WINRUN");
    expect(ls?.label).toBe("112T");
    expect(ls?.translation).toBe("1120 kg máx · 190 km/h máx");
  });

  it("extrae índice doble de carga (117/114 S)", () => {
    const ls = extractLoadSpeed("LT265/70R16 8PR 117/114 S - KR608 TL (CARGA)");
    expect(ls?.label).toBe("117/114 S");
    expect(ls?.translation).toBe("1285 kg máx · 180 km/h máx");
  });

  it("no confunde la medida con el índice", () => {
    expect(extractLoadSpeed("185/65R14")).toBeNull();
    expect(extractLoadSpeed("265/70R16")).toBeNull();
  });

  it("índice con espacio (112 S)", () => {
    const ls = extractLoadSpeed("265/70R16 112S WILDPEAK A/T TRAIL");
    expect(ls?.label).toBe("112S");
    expect(ls?.translation).toBe("1120 kg máx · 180 km/h máx");
  });

  it("devuelve null cuando no hay índice", () => {
    expect(extractLoadSpeed("KR23A KENDA KOMET")).toBeNull();
  });
});
