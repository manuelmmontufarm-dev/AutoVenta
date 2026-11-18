/**
 * Competimotor, 17-nov-2026 (conv 40): «en efectivo cuánto sale?» y «y si pago
 * en efectivo hay descuento?» se contestaron con «Se acepta efectivo,
 * transferencia y tarjeta de crédito.». Mundillantas no confirmó descuento por
 * efectivo: el bot dice que lo confirma un asesor y no borra el precio.
 */
import { describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

vi.mock("../src/services/followUps.js", async (orig) => ({
  ...(await orig<object>()),
  createBotAlert: vi.fn(async () => undefined),
}));

async function pasoComo(id: string) {
  vi.resetModules();
  process.env.NEGOCIO = id;
  const { PASOS } = await import("../src/services/prepararSalida.js");
  const datos = await import("../src/domain/datosDelNegocio.js");
  return { paso: PASOS.find((p) => p.nombre === "el_pago_se_responde")!, datos };
}

const ctx = (textoDelCliente: string) =>
  ({ conversation: { id: 40, current_cycle: 1 }, tipo: "respuesta", textoDelCliente }) as never;

const COTIZACION =
  "Su cotización de 4 *FALKEN WILDPEAK A/T 4W* 265/65R18 está en *$1527.20 con IVA* e incluye enllantaje, balanceo y nitrógeno.";

describe("descuento en efectivo sin dato del negocio → lo confirma un asesor", () => {
  it("«y si pago en efectivo hay descuento?»: no repite las formas de pago, deriva y deja el precio", async () => {
    const { paso, datos } = await pasoComo("mundillantas");
    const borrador = `Se acepta efectivo, transferencia y tarjeta de crédito.\n---\n${COTIZACION}`;
    const salida = await paso.aplicar(borrador, ctx("y si pago en efectivo hay descuento?"));
    expect(salida).toContain(datos.DESCUENTO_LO_CONFIRMA_EL_ASESOR);
    expect(salida).not.toContain("Se acepta");
    expect(salida).toContain("$1527.20");
  });

  it("«en efectivo cuánto sale?»: el precio se queda y el descuento va al asesor", async () => {
    const { paso, datos } = await pasoComo("mundillantas");
    const borrador = "En efectivo serían $1527.20 con IVA por las 4. Si hay descuento por efectivo, se lo confirma un asesor.";
    const salida = await paso.aplicar(borrador, ctx("en efectivo cuánto sale?"));
    expect(salida.startsWith(datos.DESCUENTO_LO_CONFIRMA_EL_ASESOR)).toBe(true);
    expect(salida).toContain("$1527.20");
    // La derivación del modelo no se lee repetida.
    expect(salida.match(/asesor/g)).toHaveLength(1);
  });

  it("un descuento inventado o negado no sale", async () => {
    const { paso } = await pasoComo("mundillantas");
    for (const inventado of ["En efectivo no hay descuento, el precio es el mismo.", "Sí, en efectivo tiene un 5% de descuento."]) {
      const salida = await paso.aplicar(`${inventado}\n---\n${COTIZACION}`, ctx("hay descuento en efectivo?"));
      expect(salida).not.toMatch(/no hay descuento|5%|el mismo/);
    }
  });

  it("Depot sí tiene descuento cargado: sigue con su frase de siempre", async () => {
    const { paso, datos } = await pasoComo("depot");
    const salida = await paso.aplicar("Claro.", ctx("y si pago en efectivo hay descuento?"));
    expect(salida).not.toContain(datos.DESCUENTO_LO_CONFIRMA_EL_ASESOR);
    expect(salida).toContain("Si paga en efectivo sí hay un descuento");
  });

  it("una pregunta de pago sin descuento no cambia (Mundillantas)", async () => {
    const { datos } = await pasoComo("mundillantas");
    expect(datos.preguntaPorDescuentoEnEfectivo("aceptan tarjeta?")).toBe(false);
    expect(datos.preguntaPorDescuentoEnEfectivo("en efectivo cuánto sale?")).toBe(true);
    expect(datos.preguntaPorDescuentoEnEfectivo("si pago de contado me hacen rebaja")).toBe(true);
  });
});
