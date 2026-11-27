/**
 * DEPOT NO CAMBIA (Sprint 3, F-04): sin `politica.aperturaCorta` cada pieza de
 * la apertura corta devuelve lo de siempre y ni siquiera toca la base.
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEGOCIO = "depot";
  delete process.env.IDENTIDAD;
  process.env.OPENAI_API_KEY ??= "test";
  process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_apertura_depot_falsa";
  process.env.WHATSAPP_TOKEN ??= "test";
  process.env.WHATSAPP_APP_SECRET ??= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
  process.env.WHATSAPP_PHONE_ID ??= "test";
});

const consultas: string[] = [];
vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(
    async (strings: TemplateStringsArray) => {
      consultas.push(strings.join(" "));
      throw new Error("Depot no debería consultar la base para la apertura corta");
    },
    { end: async () => undefined, json: (v: unknown) => v },
  ),
}));

describe("con el perfil de Depot la apertura sale idéntica", () => {
  it("la política de Depot no tiene la apertura corta", async () => {
    const { politica } = await import("../src/negocio/politica.js");
    expect(politica.aperturaCorta).toBeUndefined();
  });

  it("la vista de la apertura es la de siempre, sin consultar", async () => {
    const { vistaDeApertura } = await import("../src/services/aperturaCorta.js");
    const deSiempre = { previousOutbound: "Gracias por tu mensaje.", autorDelUltimoSaliente: "owner" };
    expect(await vistaDeApertura(1, deSiempre)).toBe(deSiempre);
    expect(consultas).toEqual([]);
  });

  it("las tres frases del anuncio no cambian de ruta en Depot", async () => {
    const { esAperturaDeAnuncio } = await import("../src/services/aperturaCorta.js");
    expect(esAperturaDeAnuncio("Hola. ¿Puedes darme más información sobre esto?")).toBe(false);
    expect(esAperturaDeAnuncio("¡Hola! Me gustaría conseguir más información sobre esto.")).toBe(false);
  });

  it("«dónde las consigo», el aro solo y el pedido sin datos siguen el camino de siempre", async () => {
    const svc = await import("../src/services/aperturaCorta.js");
    expect(svc.respuestaDeUbicacionDeEntrada("En Sto dgo. Donde las consigo gracias")).toBeNull();
    expect(await svc.preguntaPorAroSiCorresponde(1, 16)).toBeNull();
    expect(await svc.pedidoDeMedidaSinDatos(1)).toBeNull();
    expect(consultas).toEqual([]);
  });

  it("el cierre de la lámina sin medida conserva «las que más se usan en su vehículo»", async () => {
    const { buildCierreOpciones, CIERRE_PIDE_MEDIDA } = await import("../src/services/quoteMessages.js");
    expect(buildCierreOpciones({
      entregarRecomendacion: false, recomendacion: "KENDA KR601", motivo: "x", pedirMedida: true, vehiculoDicho: false,
    })).toBe(CIERRE_PIDE_MEDIDA);
    expect(buildCierreOpciones({
      entregarRecomendacion: true, recomendacion: "KENDA KR601", motivo: "Es la del medio", pedirMedida: true, vehiculoDicho: false,
    })).toBe(`Yo iría por la *KENDA KR601*: Es la del medio.\n${CIERRE_PIDE_MEDIDA}`);
  });
});
