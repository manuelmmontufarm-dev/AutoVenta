/**
 * Las preguntas de producto que el bot contestaba mal o con «no tengo el dato»
 * (lectura de ~3.800 mensajes de clientes, ago–nov 2026; ver
 * docs/CONOCIMIENTO-LLANTAS.md). Cada frase de cliente es textual.
 */
import { describe, expect, it } from "vitest";
import {
  competidoresEnTexto,
  conocimientoParaElTurno,
  fichaDeModelo,
  lonasPorCodigo,
  modelosEnTexto,
  temasDeLaPregunta,
} from "../src/domain/conocimientoProducto.js";

describe("temasDeLaPregunta (frases reales)", () => {
  const casos: Array<[string, string]> = [
    ["De cuántas lonas es?", "lonas"],
    ["Necesito 215/75/16 de 10 lonas para carga", "lonas"],
    ["Kenda es para cuantos kilómetros?", "km"],
    ["Que treadwear es? Y que Dot es?", "treadwear"],
    ["Que treadwear es? Y que Dot es?", "dot"],
    ["Dígame el año de fabricación", "dot"],
    ["Son chinas verdad", "origen"],
    ["Que procedencia son", "origen"],
    ["Cual tiene más adherencia en lluvia", "lluvia"],
    ["Esa llanta es dura o suave", "ruido"],
    ["Esta es la apropiada para terreno de lodo?", "uso"],
    ["Y el balanceo y alineación es aparte?", "incluye"],
    ["Y que es eso de seguro contra daños??", "garantia"],
    ["quiero ponerle la más alta 245/80R16", "equivalencia"],
    ["Cuál es la diferencia entre KR-50 y KR-28", "diferencia"],
    ["¿Se puede instalar el runflat con cualquiera de estas llantas?", "runflat"],
    ["En que marcas de llantas tiene??", "marcas_que_manejan"],
  ];
  for (const [frase, tema] of casos) {
    it(`«${frase}» → ${tema}`, () => expect(temasDeLaPregunta(frase)).toContain(tema));
  }

  it("no ve temas en un mensaje de logística", () => {
    expect(temasDeLaPregunta("el viernes paso por cumbaya a las 10")).toEqual([]);
  });
});

describe("modelosEnTexto", () => {
  it("reconoce los nombres que usan los clientes", () => {
    expect(modelosEnTexto("Cuál es la diferencia entre KR-50 y KR-28")).toEqual(["KR50", "KR28"]);
    expect(modelosEnTexto("Cuántas lonas Falken Wild Peak?")).toEqual(["WILDPEAKAT4W"]);
    expect(modelosEnTexto("La Falken Wildpeak A/T3WA la tienen?")).toEqual(["WILDPEAKAT3W"]);
    expect(modelosEnTexto("y la wildpeak mt?")).toEqual(["WILDPEAKMT"]);
    expect(modelosEnTexto("Llanta KENDA KR628 245/75R16")).toEqual(["KR628"]);
  });

  it("la KR28 existe (c36592: «no me sale como una que exista»)", () => {
    expect(fichaDeModelo("KR28")?.tipo).toMatch(/A\/T/);
  });

  it("los diseños de Contífico con espacios se encuentran", () => {
    expect(fichaDeModelo("WILDPEAK A/T 4W")?.nombre).toBe("Falken Wildpeak A/T4W");
    expect(fichaDeModelo("WILDPEAK M/T01")?.nombre).toBe("Falken Wildpeak M/T");
    expect(fichaDeModelo("ZIEX CT60 A/S")?.marca).toBe("FALKEN");
  });
});

describe("lonasPorCodigo", () => {
  it("deduce las lonas de las LT cuyo nombre no trae «PR»", () => {
    // LT265/75R16 123/120S WILDPEAK A/T 4W — rango E.
    expect(lonasPorCodigo("356533")).toBe(10);
  });
  it("un código desconocido no inventa lonas", () => {
    expect(lonasPorCodigo("NO-EXISTE")).toBeNull();
  });
});

describe("conocimientoParaElTurno", () => {
  it("lonas: llega la regla C/D/E y la ficha del modelo sobre la mesa", () => {
    const hecho = conocimientoParaElTurno("De cuántas lonas es?", ["Le muestro KENDA KR601 LT265/65R17"]);
    expect(hecho).toContain("E = 10");
    expect(hecho).toContain("Klever R/T");
  });

  it("km: obliga a dar la cifra (c22800 «no le puedo prometer»)", () => {
    const hecho = conocimientoParaElTurno("Kenda es para cuantos kilómetros?") ?? "";
    expect(hecho).toContain("68.500");
    expect(hecho).toMatch(/PROHIBIDO negarse/);
  });

  it("origen: Kenda es taiwanesa, nunca china (c7900)", () => {
    const hecho = conocimientoParaElTurno("Son chinas verdad") ?? "";
    expect(hecho).toMatch(/KENDA: Marca TAIWANESA/);
    expect(hecho).toMatch(/PROHIBIDO decir que Kenda es china/);
  });

  it("alineación y balanceo: están incluidos (c8590 «van aparte»)", () => {
    expect(conocimientoParaElTurno("Y el balanceo y alineación es aparte?")).toMatch(/ALINEACIÓN Y BALANCEO/);
  });

  it("uso: prohíbe turismo para montaña (c3 ZE310R)", () => {
    const hecho = conocimientoParaElTurno("cuál es mejor para montañas", ["FALKEN ZE310R 205/55R16"]) ?? "";
    expect(hecho).toMatch(/PROHIBIDO recomendar una llanta de turismo/);
    expect(hecho).toContain("NO es para montaña");
  });

  it("competencia: trae el argumento contra BFG", () => {
    expect(conocimientoParaElTurno("es mejor que una bf ko2?")).toContain("CONTRA BFGOODRICH");
    expect(competidoresEnTexto("Cual la mas buena maxxis o kenda?")).toEqual(["MAXXIS"]);
  });

  it("pregunta abierta sobre un modelo nombrado", () => {
    expect(conocimientoParaElTurno("que tal es la kr628")).toContain("Klever A/T2");
  });

  it("sin pregunta técnica no gasta tokens", () => {
    expect(conocimientoParaElTurno("ok, el sábado paso", ["KENDA KR628"])).toBeNull();
    expect(conocimientoParaElTurno("265/70R16")).toBeNull();
  });

  it("no manda más de 4 fichas de modelo", () => {
    const hecho = conocimientoParaElTurno("cual es la diferencia?", [
      "KR20 KR203 KR41 KR628 KR601 KR29",
    ]) ?? "";
    expect(hecho.match(/• MODELO/g)?.length).toBe(4);
  });
});

describe("lonas resueltas por modelo y medida (simulador 17-nov: «lo confirma el asesor»)", () => {
  it("KR628 en 265/70R17 son 10 lonas", async () => {
    const { lonasDeModeloEnMedida } = await import("../src/domain/conocimientoProducto.js");
    expect(lonasDeModeloEnMedida("KR628", "LT265/70R17")).toEqual([10]);
  });
  it("el hecho trae las lonas de lo que está sobre la mesa", () => {
    const hecho = conocimientoParaElTurno("De cuántas lonas es?", [
      "Hola, necesito 4 llantas 265/70R17 para mi Hilux",
      "Le muestro KENDA KR628 en 265/70R17",
    ]) ?? "";
    expect(hecho).toContain("Kenda Klever A/T2 KR628 265/70R17: 10 lonas");
  });
  it("y obliga a contestar cada tema", () => {
    expect(conocimientoParaElTurno("Que treadwear es? Y que Dot es?")).toMatch(/CADA tema/);
  });
});
