import { describe, expect, it } from "vitest";
import { cantidadGrandePedida } from "../src/domain/cantidadGrande.js";
import { esPedidoDeAmbasOpciones } from "../src/domain/salesIntent.js";

const MENU_DOS = `¿Qué prioriza usted?
1) *Costo*
2) *Premium*`;
const MENU_TRES = `${MENU_DOS}
3) *Otra opción*`;

describe("un precio o descuento no es cantidad", () => {
  it("descarta el precio que originó 103 llantas", () => {
    // Chat 16982: «La promoción del 25% q son 103$.64 menos».
    expect(cantidadGrandePedida("La promoción del 25% q son 103$.64 menos")).toBeNull();
    expect(cantidadGrandePedida("son 300 dolares")).toBeNull();
    expect(cantidadGrandePedida("son $103 menos")).toBeNull();
    expect(cantidadGrandePedida("son 25 de descuento")).toBeNull();
  });

  it("conserva cantidades inequívocas", () => {
    expect(cantidadGrandePedida("quiero 20 llantas")).toBe(20);
    expect(cantidadGrandePedida("son 4 llantas")).toBeNull();
    expect(cantidadGrandePedida("necesito 12")).toBe(12);
    expect(cantidadGrandePedida("quiero 265/65R17")).toBeNull();
  });
});

describe("«las dos» pide ambas opciones", () => {
  it.each(["Las 2", "las dos", "los dos", "ambas", "los dos valores", "deme de las dos"])(
    "entiende %s sobre un menú de dos",
    (texto) => {
      // Chats 17934, 18129 y 18543: no debe elegir ni cotizar solo la opción 2.
      expect(esPedidoDeAmbasOpciones(texto, MENU_DOS)).toBe(true);
    },
  );

  it("con tres opciones, «las 2» queda ambiguo", () => {
    expect(esPedidoDeAmbasOpciones("las 2", MENU_TRES)).toBe(false);
  });

  it("devuelve los dos precios y no elige una sola", async () => {
    process.env.WHATSAPP_TOKEN ||= "test";
    process.env.WHATSAPP_APP_SECRET ||= "test";
    process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
    process.env.WHATSAPP_PHONE_ID ||= "test";
    process.env.SELLER_PHONE ||= "593000000000";
    process.env.OPENAI_API_KEY ||= "test";
    process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
    const { loQueEligio } = await import("../src/services/cotizarLoElegido.js");
    const respuesta = loQueEligio("las dos", MENU_DOS, null, [
      { codigo: "ECO", marca: "Kenda", diseno: "KR29" },
      { codigo: "PRE", marca: "Falken", diseno: "Wildpeak" },
    ], {
      economica: { codigo: "ECO", nombre: "KENDA KR29", precio_con_iva: 100 },
      premium: { codigo: "PRE", nombre: "FALKEN WILDPEAK", precio_con_iva: 150 },
    });
    expect(respuesta).toEqual({
      respuesta: "Claro, estas son las dos:\n• *KENDA KR29*: *$100.00 c/u con IVA*\n• *FALKEN WILDPEAK*: *$150.00 c/u con IVA*\n¿Cuál quiere que le cotice?",
    });
  });
});
