import { describe, expect, it } from "vitest";
import { medidasEnTexto } from "../src/domain/medidaPedida.js";
import { extractTireSizes } from "../src/domain/tireSize.js";
import { avisoDeMedidaEnOpciones, sinEquivalenciasFalsas } from "../src/domain/equivalenciaEnTexto.js";
import * as equivalencia from "../src/domain/equivalencia.js";
import { equivalentesAMostrar } from "../src/domain/equivalentesPorMostrar.js";

/**
 * EQUIVALENCIAS QUE NO EQUIVALEN (auditoría 19-oct-2026, familia 7-B).
 *
 *  · chat 26218 (13-oct): etiqueta de puerta «265/45R20 Extra Load» de una
 *    Mercedes ML 350. Se ofrecieron 245/50R20 (102V) y 255/45R20 (105W) como
 *    equivalentes y, tras «Okey», se cotizaron 4 × 245/50R20 por $980,44.
 *    Ninguna lleva la carga de una XL. Y la alerta del candado leyó el precio
 *    «$245.11» como la medida «245R11».
 *  · chat 22492 (13/14-oct): pidió banda MÁS ANCHA que 205 y recibió
 *    185/70R14 como «equivalente de su aro».
 */

const FOTO_1 =
  "[El cliente mandó una foto. Se lee: Etiqueta puerta: medida recomendada 265/45 R20 (delanteras y traseras), rin 9Jx20, presión 310/330 kPa (45/48 PSI).]";
const FOTO_2 =
  "[El cliente mandó una foto. Se lee: Etiqueta puerta: recomendada 265/45R20 Extra Load (del/tras), repuesto T155/90R18 113M]";

describe("un precio no es una medida (alerta equivalencia_falsa del chat 26218)", () => {
  const FRASE = "Yo iría por la *FALKEN ZIEX CT60 A/S* — $245.11 c/u con IVA: La recomiendo por ser la opción más cercana y equilibrada para SUV en asfalto.";

  it("«$245.11» no sale como 245R11", () => {
    expect(medidasEnTexto(FRASE)).toEqual([]);
    expect(extractTireSizes("$245.11 c/u")).toEqual([]);
    expect(extractTireSizes("a $ 195.15 cada una")).toEqual([]);
    expect(extractTireSizes("WINRUN R330 — $127.70 c/u · 4 = $510.80")).toEqual([]);
  });

  it("el candado deja en paz la frase de la recomendación", () => {
    const r = sinEquivalenciasFalsas(FRASE, { textosDeLaVisita: [FOTO_1, FOTO_2], textoDelTurno: FOTO_2 });
    expect(r.reemplazadas).toEqual([]);
    expect(r.texto).toBe(FRASE);
  });

  it("las medidas de verdad se siguen leyendo", () => {
    expect(medidasEnTexto("busco 205/55R16")).toEqual(["205/55R16"]);
    expect(medidasEnTexto("195 65 15 para mi auto")).toEqual(["195/65R15"]);
    expect(medidasEnTexto("la 245/50R20 102V está en $245.11")).toEqual(["245/50R20"]);
  });
});

describe("la carga de una Extra Load (chat 26218)", () => {
  const CT60 = {
    design: "ZIEX CT60 A/S", sizeLabel: "245/50R20", name: "245/50R20 102V CT60AS FALKEN",
    loadSpeed: { code: "102V", loadIndex: 102, speedSymbol: "V", loadKg: 850, speedKmh: 240 },
  };
  const KR605 = {
    design: "KR605", sizeLabel: "255/45R20", name: "255/45ZR20 105W KR605 KENDA",
    loadSpeed: { code: "105W", loadIndex: 105, speedSymbol: "W", loadKg: 925, speedKmh: 270 },
  };
  const R330XL = {
    design: "R330", sizeLabel: "255/45R20", name: "255/45 ZR20 105W XL R330 WINRUN",
    loadSpeed: { code: "105W", loadIndex: 105, speedSymbol: "W", loadKg: 925, speedKmh: 270 },
  };

  it("lee el requisito de carga de lo que el cliente mandó", () => {
    expect(equivalencia.requisitoDeCarga([FOTO_1, FOTO_2])).toEqual({ xl: true, indice: null });
    expect(equivalencia.requisitoDeCarga(["necesito 265/70R16 112T"])).toEqual({ xl: false, indice: 112 });
    expect(equivalencia.requisitoDeCarga(["busco 205/55R16"])).toBeNull();
  });

  it("ninguna de las tres le lleva la carga a una 265/45R20 XL", () => {
    const req = { xl: true, indice: null };
    expect(equivalencia.cargaAlcanza(req, "265/45R20", CT60)).toBe(false);
    expect(equivalencia.cargaAlcanza(req, "265/45R20", KR605)).toBe(false);
    // XL pero 10 mm más angosta: 105 (925 kg) contra la 108 (1000 kg) de su XL.
    expect(equivalencia.cargaAlcanza(req, "265/45R20", R330XL)).toBe(false);
  });

  it("la lámina no las rotula equivalentes ni las deja cotizables", () => {
    const aviso = avisoDeMedidaEnOpciones({
      permitidas: ["265/45R20"], fueraDeMedida: [CT60, KR605, R330XL], totalMostradas: 3,
      carga: { xl: true, indice: null },
    } as Parameters<typeof avisoDeMedidaEnOpciones>[0]);
    expect(aviso.equivalentes).toEqual([]);
    expect(aviso.avisoCliente).not.toMatch(/\*equivalentes\*/);
  });

  it("sin requisito de carga, nada cambia (la equivalencia por medida sigue igual)", () => {
    expect(equivalencia.esEquivalente("265/45R20", "255/45R20")).toBe(true);
    const aviso = avisoDeMedidaEnOpciones({ permitidas: ["265/45R20"], fueraDeMedida: [KR605], totalMostradas: 1 });
    expect(aviso.equivalentes).toEqual(["255/45R20"]);
  });
});

describe("«más ancha» dicha antes en la visita también cuenta (chat 22492)", () => {
  const VISITA = [
    "225/55/R14...",
    "Ok algo cercano a 225 y cercano a 55",
    "Gracias, la 225 es un referente, pueden ser medidas cercanas. las enviada por Ud., no están dentro de mi interés",
    "Al usar la 205/60 R13, tengo la altura necesaria, por eso al subir 1\" y bajar el pefil, lo que busco, es subir o mantener la altura y logra una banda de rodamiento, más ancha.",
    "Gracias",
    "No gracias, quiero subir a 14... estoy usando 205/60/R14...",
  ];
  const TURNO = VISITA[VISITA.length - 1];

  it("la dirección vigente es la última que pidió en el ciclo", () => {
    expect(equivalencia.direccionVigente(VISITA)).toBe("mas_ancha");
    expect(equivalencia.direccionVigente(["205/55R16", "gracias"])).toBeNull();
  });

  it("el candado no deja pasar una 185 como equivalente de quien pidió más ancha que 205", () => {
    const BOT = "⚠️ Ojo: en *205/60R14* no me queda disponibilidad exacta. Estas son *equivalentes* de su aro: R380 en 185/70R14. Se confirma el calce al montar.";
    const r = sinEquivalenciasFalsas(BOT, { textosDeLaVisita: VISITA, textoDelTurno: TURNO, medidaDeTrabajo: "205/60R14" });
    expect(r.reemplazadas.map((x) => x.medida)).toContain("185/70R14");
    expect(r.texto).not.toMatch(/185\/70R14/);
  });

  it("la lámina tampoco la rotula equivalente", () => {
    const R380 = { design: "R380", sizeLabel: "185/70R14" };
    const aviso = avisoDeMedidaEnOpciones({
      permitidas: ["205/60R14"], fueraDeMedida: [R380], totalMostradas: 1, direccion: "mas_ancha",
    } as Parameters<typeof avisoDeMedidaEnOpciones>[0]);
    expect(aviso.equivalentes).toEqual([]);
  });

  it("caso sano: sin dirección pedida, 185/70R14 sigue siendo equivalente de 205/60R14", () => {
    expect(equivalencia.esEquivalente("205/60R14", "185/70R14")).toBe(true);
  });
});

describe("las equivalentes que la herramienta le pasa al Guardián como HECHO (26218 en el simulador)", () => {
  // Con el juez de solo medida, `buscar_por_aro_y_tipo` devolvía 255/45R20 y
  // 245/45R20 como «equivalentes de verdad» y el Guardián reescribió el
  // borrador honesto («no son equivalentes por la carga») a «equivalentes que
  // sí le entran».
  const alternativas = [
    { code: "R330", brand: "WINRUN", design: "R330", sizeLabel: "255/45R20", name: "255/45 ZR20 105W XL R330 WINRUN", stock: 4, loadSpeed: { loadIndex: 105 } },
    { code: "KR605", brand: "KENDA", design: "KR605", sizeLabel: "245/45R20", name: "245/45ZR20 103W KR605 TL XL KENDA", stock: 8, loadSpeed: { loadIndex: 103 } },
  ];

  it("con Extra Load no devuelve ninguna", () => {
    expect(equivalentesAMostrar(alternativas, "265/45R20", false, { carga: { xl: true, indice: null } })).toEqual([]);
  });

  it("sin requisito, las mismas siguen saliendo", () => {
    expect(equivalentesAMostrar(alternativas, "265/45R20", false).map((e) => e.code)).toEqual(["R330", "KR605"]);
  });
});
