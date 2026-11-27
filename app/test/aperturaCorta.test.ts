/**
 * LA APERTURA CORTA DE COMPETIMOTOR (Sprint 3, familia F-04, auditoría
 * 26-nov-2026). Textos reales de los chats; lo puro, sin base.
 */
import { describe, expect, it, vi } from "vitest";

// Antes de cualquier import: el perfil se elige al cargar `negocio/index.ts`.
vi.hoisted(() => {
  process.env.NEGOCIO = "mundillantas";
  delete process.env.IDENTIDAD;
  process.env.OPENAI_API_KEY ??= "test";
  process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_apertura_falsa";
  process.env.WHATSAPP_TOKEN ??= "test";
  process.env.WHATSAPP_APP_SECRET ??= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
  process.env.WHATSAPP_PHONE_ID ??= "test";
});

import {
  esPedidoDeInformacionDelAnuncio,
  esRespuestaAutomaticaGuardada,
  preguntaDondeConseguirlas,
  preguntaParaCerrarLaMedida,
  PEDIDO_DE_MEDIDA_CON_LAS_TRES_VIAS,
} from "../src/domain/aperturaCorta.js";
import { isGenericFirstContact } from "../src/domain/firstContact.js";

describe("las tres frases del botón del anuncio de Meta son un saludo pelado", () => {
  // 989, 1091, 1120: la primera; 290, 659, 999, 1051: la segunda; 1125, 794, 1283, 1437: la tercera.
  const DEL_ANUNCIO = [
    "¡Hola! Quiero más información",
    "Hola. ¿Puedes darme más información sobre esto?",
    "¡Hola! Me gustaría conseguir más información sobre esto.",
  ];
  it.each(DEL_ANUNCIO)("«%s» → apertura corta", (texto) => {
    expect(esPedidoDeInformacionDelAnuncio(texto)).toBe(true);
  });

  it("hoy el detector de saludo solo conoce la primera (por eso las otras dos iban al agente → guía)", () => {
    expect(isGenericFirstContact(DEL_ANUNCIO[0])).toBe(true);
    expect(isGenericFirstContact(DEL_ANUNCIO[1])).toBe(false);
    expect(isGenericFirstContact(DEL_ANUNCIO[2])).toBe(false);
  });

  it.each([
    "Hola. ¿Puedes darme más información sobre esto?\nLlantas 185/65R14", // 999 agrupado
    "En qué marca son las llantas 195 50 rin 16", // 659
    "¡Hola! Quiero más informaciónpara autos ay", // 1344: trae «autos»
    "Hola, información de la Kenda KR601",
    "En Sto dgo. Donde las consigo gracias", // 902
    "Precio.",
  ])("con un dato o una pregunta propia NO es el saludo del anuncio: «%s»", (texto) => {
    expect(esPedidoDeInformacionDelAnuncio(texto)).toBe(false);
  });
});

describe("la auto-respuesta de WhatsApp Business se reconoce por el hecho, no por el texto", () => {
  it("metadata del eco de 989 (`automatica: true`)", () => {
    expect(esRespuestaAutomaticaGuardada({ error: null, origen: "echo", waType: "text", automatica: true })).toBe(true);
  });
  it("un mensaje del asesor escrito a mano NO", () => {
    expect(esRespuestaAutomaticaGuardada({ origen: "echo", waType: "text" })).toBe(false);
    expect(esRespuestaAutomaticaGuardada(null)).toBe(false);
  });
});

describe("902: «dónde las consigo» de entrada pregunta por el local", () => {
  it.each(["En Sto dgo. Donde las consigo gracias", "donde los compro", "Dónde las venden?"])("«%s»", (texto) => {
    expect(preguntaDondeConseguirlas(texto)).toBe(true);
  });
  it("«las consigo en rin 16?» no es dónde", () => {
    expect(preguntaDondeConseguirlas("las consigo en rin 16?")).toBe(false);
  });
});

describe("1051/1724: con solo el aro se pregunta lo que falta, sin lámina mezclada", () => {
  it("rin 16: una pregunta con las tres vías, sin «la 1, la 2 o la 3» ni «⚠️ Ojo»", () => {
    const texto = preguntaParaCerrarLaMedida(16);
    expect(texto).toContain("rin 16");
    expect(texto).toContain("205/55R16");
    expect(texto).toMatch(/foto/);
    expect(texto).toMatch(/vehículo/);
    expect(texto).not.toMatch(/la 1|la 2|Ojo|medidas distintas|Sin ese dato/);
    expect((texto.match(/\?/g) ?? []).length).toBe(1);
  });
  it("aro sin ejemplo propio: el ej. lleva su aro", () => {
    expect(preguntaParaCerrarLaMedida(23)).toContain("R23");
  });
});

describe("1063/1112: el segundo pedido sin datos es una pregunta, no la muestra", () => {
  it("las tres vías, sin «sin ese dato no le puedo asegurar»", () => {
    expect(PEDIDO_DE_MEDIDA_CON_LAS_TRES_VIAS).toMatch(/medida del costado/);
    expect(PEDIDO_DE_MEDIDA_CON_LAS_TRES_VIAS).toMatch(/foto/);
    expect(PEDIDO_DE_MEDIDA_CON_LAS_TRES_VIAS).toMatch(/vehículo/);
    expect(PEDIDO_DE_MEDIDA_CON_LAS_TRES_VIAS).not.toMatch(/Sin ese dato|asegurar que la llanta entre/);
  });
});

describe("1063, 1112, 1283, 1437: «las que más se usan en su vehículo» sin vehículo dicho", () => {
  it("sin vehículo el cierre no nombra un vehículo", async () => {
    const { buildCierreOpciones } = await import("../src/services/quoteMessages.js");
    const cierre = buildCierreOpciones({
      entregarRecomendacion: false, recomendacion: "KENDA KR601", motivo: "x", pedirMedida: true, vehiculoDicho: false,
    });
    expect(cierre).not.toMatch(/su vehículo/);
    expect(cierre).toMatch(/medida exacta/);
  });
  it("con el vehículo en la ficha (fitment) sigue la frase", async () => {
    const { buildCierreOpciones, CIERRE_PIDE_MEDIDA } = await import("../src/services/quoteMessages.js");
    expect(buildCierreOpciones({
      entregarRecomendacion: false, recomendacion: "KENDA KR601", motivo: "x", pedirMedida: true, vehiculoDicho: true,
    })).toBe(CIERRE_PIDE_MEDIDA);
  });
  it("con recomendación entregada, tampoco «su vehículo»", async () => {
    const { buildCierreOpciones } = await import("../src/services/quoteMessages.js");
    const cierre = buildCierreOpciones({
      entregarRecomendacion: true, recomendacion: "TOWNHALL TH-161", motivo: "Es la más económica", pedirMedida: true, vehiculoDicho: false,
    });
    expect(cierre).toMatch(/^Yo iría por la \*TOWNHALL TH-161\*/);
    expect(cierre).not.toMatch(/su vehículo/);
  });
});
