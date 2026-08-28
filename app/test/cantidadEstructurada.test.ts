/**
 * LA CANTIDAD LA DECLARA EL AGENTE EN UNA HERRAMIENTA, NO UN LECTOR DE TEXTO.
 *
 * Convs 11366, 11005 y 11357, 26–27-ago-2026: «Arrizo 5», «las 3 marcas» y
 * «pasado las 5» terminaron en `selected_quantity` porque un regex decidió
 * antes de que el agente entendiera de qué hablaba el cliente. La herramienta
 * que prepara la vitrina necesita recibir la cantidad como dato estructurado;
 * el lector viejo queda únicamente para rescatar frases inequívocas si el
 * modelo omite el argumento.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { buildTools } = await import("../src/agent/tools.js");
const { cantidadParaPrepararOpciones } = await import("../src/domain/salesIntent.js");

const prepararOpciones = buildTools({
  conversation: {
    id: 1, phone: "593900000101", name: "Prueba", stage: "seleccionando",
    bot_paused_until: null, status: "open", current_cycle: 1,
  },
  customerPhone: "593900000101",
  currentUserText: "Para arrizo 5",
} as never).find((tool) => tool.function.name === "preparar_opciones");

describe("la cantidad entra por el esquema de preparar_opciones", () => {
  it("el agente puede declararla de forma estructurada o mandar null si no la sabe", () => {
    expect(prepararOpciones).toBeDefined();
    const properties = prepararOpciones!.function.parameters.properties as Record<string, unknown>;
    expect(properties).toHaveProperty("cantidad");
    expect(properties.cantidad).toMatchObject({ default: null });
  });

  it("el webhook ya no escribe selected_quantity antes de que el agente entienda el mensaje", () => {
    const fuente = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    expect(fuente).not.toContain("cantidadPedidaPorElCliente");
    expect(fuente).not.toContain("parsedQuantity");
  });
});

describe("resolución de cantidad para la vitrina", () => {
  const resolver = (
    textoActual: string,
    declarada: number | null = null,
    guardada: number | null = null,
    ultimoMensajeNuestro: string | null = null,
  ) => cantidadParaPrepararOpciones({
    declarada, guardada, textoActual, ultimoMensajeNuestro,
  });

  it("el argumento estructurado es el camino principal", () => {
    expect(resolver("deme tres para el eje delantero", 3)).toEqual({
      cantidad: 3, origen: "herramienta", guardar: true,
    });
  });

  it("los tres números de otra cosa no se guardan y caen al juego de 4", () => {
    for (const texto of [
      "Para arrizo 5",
      "Las 3 de ir marcas manejan ustedes",
      "paso pasado las 5",
    ]) {
      expect(resolver(texto), texto).toEqual({
        cantidad: 4, origen: "default", guardar: false,
      });
    }
  });

  it("el respaldo conserva solo las expresiones inequívocas exigidas", () => {
    expect(resolver("deme solo 3")).toMatchObject({ cantidad: 3, origen: "respaldo_textual" });
    expect(resolver("mejor 2")).toMatchObject({ cantidad: 2, origen: "respaldo_textual" });
    expect(resolver("un juego")).toMatchObject({ cantidad: 4, origen: "respaldo_textual" });
    expect(resolver("quiero 20 llantas")).toMatchObject({ cantidad: 20, origen: "respaldo_textual" });
  });

  it("el 2 del menú sigue siendo preferencia, no cantidad", () => {
    const menu = "¿Qué prioriza usted?\n1) Costo\n2) Equilibrio\n3) Premium";
    expect(resolver("2", null, null, menu)).toEqual({
      cantidad: 4, origen: "default", guardar: false,
    });
  });

  it("una cantidad confiable de un turno anterior sigue filtrando la vitrina", () => {
    expect(resolver("Equilibrio", null, 8)).toEqual({
      cantidad: 8, origen: "ficha", guardar: false,
    });
  });
});
