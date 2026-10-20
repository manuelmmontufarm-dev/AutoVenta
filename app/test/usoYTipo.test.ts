import { describe, expect, it } from "vitest";
import { tipoSolicitadoEn } from "../src/domain/opcionesCandados.js";
import {
  separarPorUso, tiposCompatibles, usoDeLosTextos, usoDeclarado,
} from "../src/domain/usoYTipo.js";

/**
 * Familia «el menú se arma por precio y sale un tipo que contradice el uso»
 * (semana del 21-sep-2026, 10 chats). Aquí: el dueño único del uso y de los
 * tipos que le sirven. El cableado en las herramientas se prueba en
 * `menuPorUso.test.ts`.
 */

describe("usoDeclarado · lo que el cliente dijo de verdad", () => {
  it.each([
    ["es para ciudad, NO todoterreno", "pavimento"],
    ["2 llantas para ciudad", "pavimento"],
    ["solo asfalto y calle", "pavimento"],
    ["quiero H/T", "pavimento"],
    ["camino mixto", "mixto"],
    ["a veces camino de tierra", "tierra"],
    ["ciudad y a veces finca", "tierra"],
    ["para lodo, pantanero", "lodo"],
    ["es una furgoneta de reparto", "carga"],
    ["uso comercial", "carga"],
    ["Hola, buenas tardes", null],
  ])("«%s» → %s", (texto, esperado) => {
    expect(usoDeclarado(texto)).toBe(esperado);
  });

  it("«NO todoterreno» no es mixto: lo negado no es el uso", () => {
    expect(usoDeclarado("NO todoterreno")).toBeNull();
    expect(usoDeclarado("no quiero mixto, solo ciudad")).toBe("pavimento");
  });

  it("«voy al trabajo» es ciudad, no carga", () => {
    expect(usoDeclarado("la uso para ir al trabajo por la ciudad")).toBe("pavimento");
  });

  it("gana el mensaje más reciente (textos del más nuevo al más viejo)", () => {
    expect(usoDeLosTextos(["ahora para lodo", "es para ciudad"])).toBe("lodo");
    expect(usoDeLosTextos(["gracias", "es para ciudad"])).toBe("pavimento");
    expect(usoDeLosTextos(["gracias", undefined, ""])).toBeNull();
  });
});

describe("tiposCompatibles · una sola tabla", () => {
  it("ciudad nunca incluye M/T; lodo nunca incluye H/T", () => {
    expect(tiposCompatibles("pavimento")).toEqual(expect.arrayContaining(["H/T", "TURISMO", "TURISMO SUV", "TURISMO UHP"]));
    expect(tiposCompatibles("pavimento")).not.toContain("M/T");
    expect(tiposCompatibles("lodo")).toEqual(["M/T", "R/T"]);
    expect(tiposCompatibles("mixto")).toEqual(expect.arrayContaining(["A/T", "R/T", "H/T"]));
    expect(tiposCompatibles("carga")).toEqual(expect.arrayContaining(["COMERCIAL", "H/T"]));
    expect(tiposCompatibles(null)).toBeNull();
  });
});

describe("separarPorUso", () => {
  const p = (tipo: string, stock = 8) => ({ tipo, stock });
  const tipoDe = (x: { tipo: string }) => x.tipo;

  it("sin uso declarado todo es compatible y no hay aviso", () => {
    const r = separarPorUso([p("M/T"), p("H/T")], null, tipoDe);
    expect(r.compatibles).toHaveLength(2);
    expect(r.avisoTipo).toBeNull();
  });

  it("con dos compatibles vendibles, los demás tipos no entran", () => {
    const r = separarPorUso([p("M/T"), p("H/T"), p("TURISMO")], "pavimento", tipoDe);
    expect(r.compatibles.map(tipoDe)).toEqual(["H/T", "TURISMO"]);
    expect(r.otros).toEqual([]);
    expect(r.avisoTipo).toBeNull();
  });

  it("una compatible agotada no cuenta como vendible: se cae al relleno y AVISA", () => {
    const r = separarPorUso([p("H/T"), p("H/T", 0), p("A/T")], "pavimento", tipoDe);
    expect(r.avisoTipo).toMatch(/H\/T/);
    expect(r.otros.map(tipoDe)).toEqual(["A/T"]);
  });

  it("«mixto»: con dos A/T o R/T vendibles la H/T no entra; si no alcanzan, sí (sin aviso: sirve)", () => {
    const con = separarPorUso([p("H/T"), p("A/T"), p("R/T"), p("H/T")], "mixto", tipoDe);
    expect(con.compatibles.map(tipoDe)).toEqual(["A/T", "R/T"]);
    const sin = separarPorUso([p("H/T"), p("A/T"), p("H/T")], "mixto", tipoDe);
    expect(sin.compatibles.map(tipoDe)).toEqual(["H/T", "A/T", "H/T"]);
    expect(sin.avisoTipo).toBeNull();
  });

  it("el relleno nunca es M/T para ciudad", () => {
    const r = separarPorUso([p("H/T"), p("M/T"), p("R/T")], "pavimento", tipoDe);
    expect(r.otros).toEqual([]);
    expect(r.avisoTipo).not.toBeNull();
  });

  it("sin nada compatible y solo lo vetado: no se deja vacío, pero avisa", () => {
    const r = separarPorUso([p("M/T")], "pavimento", tipoDe);
    expect(r.otros.map(tipoDe)).toEqual(["M/T"]);
    expect(r.avisoTipo).not.toBeNull();
  });
});

describe("tipoSolicitadoEn · lo negado no es un tipo pedido", () => {
  it("«NO todoterreno» no pide A/T (así se filtraba el menú a A/T para quien dijo lo contrario)", () => {
    expect(tipoSolicitadoEn(["Es para ciudad, NO todoterreno"])).toBeNull();
    expect(tipoSolicitadoEn(["no quiero mud, solo ciudad"])).toBeNull();
  });

  it("lo afirmado sigue funcionando", () => {
    expect(tipoSolicitadoEn(["265/70/17 AT"])).toBe("A/T");
    expect(tipoSolicitadoEn(["quiero todoterreno"])).toBe("A/T");
    expect(tipoSolicitadoEn(["no las quiero H/T, mejor M/T"])).toBe("M/T");
  });
});

describe("avisoAlCliente · el texto que ve el cliente", () => {
  const p = (tipo: string, stock = 8) => ({ tipo, stock });
  const tipoDe = (x: { tipo: string }) => x.tipo;

  it("no nombra un uso que el cliente no dijo («camino de piedra» no es «camino de tierra»)", () => {
    const r = separarPorUso([p("M/T")], "tierra", tipoDe);
    expect(r.avisoAlCliente).not.toMatch(/camino de tierra/i);
  });

  it("no presenta la M/T como mala elección ni como «la más cercana» cuando es la única", () => {
    const r = separarPorUso([p("M/T")], "tierra", tipoDe);
    expect(r.avisoAlCliente).not.toMatch(/lo ideal|más cercana/i);
    expect(r.avisoAlCliente).toMatch(/no me queda stock/);
    expect(r.avisoAlCliente).toMatch(/M\/T/);
  });
});

