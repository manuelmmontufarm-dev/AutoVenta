/**
 * FAMILIA: «EL BOT DICE SOBRE EL PAGO ALGO QUE CONTRADICE LA FUENTE ÚNICA».
 *
 * La fuente (`politicaDePagos`): con tarjeta no sube, 3 y 6 meses sin
 * intereses, y en efectivo SÍ hay descuento que se confirma en el local. Esta
 * semana, en 6 chats, el bot dijo a veces eso y a veces «el precio es el mismo
 * en efectivo, tarjeta o transferencia»: un negativo inventado. No es un chat
 * suelto: es un modelo que niega un dato de negocio que el sistema sí tiene.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { niegaDescuentoEnEfectivo, politicaDePagos, mencionaDescuentoEnEfectivo, respondeElPago } =
  await import("../src/domain/datosDelNegocio.js");
const { PASOS, pasosPara } = await import("../src/services/prepararSalida.js");
const { hechoDePagos } = await import("../src/services/guardian.js");

const bloques = (t: string) => t.split(/\n\s*-{3,}\s*\n/).map((b) => b.trim());

describe("niegaDescuentoEnEfectivo", () => {
  it("las negaciones que el modelo inventó", () => {
    for (const t of [
      "El precio es el mismo en efectivo, tarjeta o transferencia.",
      "El precio es el mismo si paga en efectivo.",
      "Es el mismo precio en efectivo, con tarjeta o por transferencia.",
      "No hay descuento adicional por pago en efectivo.",
      "No hay descuento por efectivo.",
      "No hay descuentos en efectivo, señor.",
      "Por el momento no manejamos descuento en efectivo.",
      "Sin descuento por pago en efectivo.",
      "En efectivo no aplica ningún descuento adicional.",
      "El descuento en efectivo no existe.",
      "En efectivo el precio no cambia.",
      "Pagando en efectivo o en cash el precio queda igual.",
      "No ofrecemos rebaja por pagar de contado.",
      "NO HAY DESCUENTO EN EFECTIVO 😊",
      "Con tarjeta no sube y tampoco hay descuento en efectivo.",
    ]) expect(niegaDescuentoEnEfectivo(t), t).toBe(true);
  });

  it("lo verdadero y lo que no habla del efectivo no se toca", () => {
    for (const t of [
      "Si paga en efectivo sí hay un descuento adicional en el local.",
      "En efectivo hay descuento; el monto se lo confirman en el local.",
      "Con tarjeta el precio es el mismo y se puede diferir a 3 y 6 meses sin intereses.",
      "El precio es el mismo con tarjeta, y si paga en efectivo hay descuento.",
      "No hay recargo por pagar en efectivo.",
      "También se acepta transferencia.",
      "Con tarjeta no sube el precio.",
      "No hay descuento sobre los 3 y 6 meses sin intereses.",
      "",
    ]) expect(niegaDescuentoEnEfectivo(t), t).toBe(false);
  });

  it("ninguna frase de la política canónica se toma por negación", () => {
    for (const f of politicaDePagos().split(/(?<=[.!?])\s+/)) expect(niegaDescuentoEnEfectivo(f), f).toBe(false);
    expect(niegaDescuentoEnEfectivo(politicaDePagos())).toBe(false);
  });
});

describe("el paso sin_descuento_negado (candado, después del guardián)", () => {
  const paso = () => PASOS.find((p) => p.nombre === "sin_descuento_negado")!;
  const ctx = (textoDelCliente: string | null) =>
    ({ conversation: { id: 1, current_cycle: 1 }, tipo: "respuesta", textoDelCliente }) as never;

  it("existe, corre en las tres puertas con guardián y va DESPUÉS del guardián y ANTES de separar la pregunta", () => {
    expect(paso()).toBeDefined();
    expect([...paso().corre].sort()).toEqual(["respuesta", "retomada", "seguimiento"]);
    const orden = PASOS.map((p) => p.nombre);
    expect(orden.indexOf("sin_descuento_negado")).toBeGreaterThan(orden.indexOf("angel_guardian"));
    expect(orden.indexOf("sin_descuento_negado")).toBeLessThan(orden.indexOf("pregunta_en_su_propio_mensaje"));
    for (const tipo of ["respuesta", "retomada", "seguimiento"] as const)
      expect(pasosPara(tipo).map((p) => p.nombre)).toContain("sin_descuento_negado");
    expect(pasosPara("plantilla").map((p) => p.nombre)).not.toContain("sin_descuento_negado");
  });

  it("cambia SOLO la frase que niega por la política y conserva el resto", async () => {
    const borrador = "Claro. El precio es el mismo en efectivo, tarjeta o transferencia. Tenemos stock de las 4.\n---\n¿A cuál local le queda mejor ir?";
    const salida = (await paso().aplicar(borrador, ctx("y si pago en efectivo?")))!;
    expect(niegaDescuentoEnEfectivo(salida)).toBe(false);
    expect(mencionaDescuentoEnEfectivo(salida)).toBe(true);
    expect(respondeElPago(salida)).toBe(true);
    expect(salida).toContain("Claro.");
    expect(salida).toContain("Tenemos stock de las 4.");
    expect(salida).not.toMatch(/el precio es el mismo en efectivo/i);
    expect(salida).toContain(politicaDePagos());
    expect((salida.match(/3 y 6 meses/g) ?? []).length).toBe(1);
    expect(bloques(salida).at(-1)).toBe("¿A cuál local le queda mejor ir?");
  });

  it("actúa aunque el cliente no haya preguntado por el pago en este turno", async () => {
    const salida = (await paso().aplicar("No hay descuento adicional por efectivo.", ctx("ok, dígame el local")))!;
    expect(salida).toBe(politicaDePagos());
  });

  it("si el turno ya afirma el descuento en otra frase, la negación sale sin repetir la política", async () => {
    const borrador = "No hay descuento en efectivo. Si paga en efectivo sí hay un descuento, que se lo confirman en el local.";
    const salida = (await paso().aplicar(borrador, ctx(null)))!;
    expect(niegaDescuentoEnEfectivo(salida)).toBe(false);
    expect((salida.match(/descuento/gi) ?? []).length).toBe(1);
  });

  it("un texto correcto o sin relación pasa idéntico", async () => {
    for (const t of [
      `${politicaDePagos()}\n---\n¿A cuál local le queda mejor ir?`,
      "Tenemos 4 unidades de la 205/55R16.",
    ]) expect(await paso().aplicar(t, ctx("y con tarjeta?"))).toBe(t);
  });
});

describe("el guardián no borra la política de pagos: está en sus hechos", () => {
  it("hechoDePagos trae la política canónica y le prohíbe negar el descuento", () => {
    const h = hechoDePagos();
    expect(h).toContain(politicaDePagos());
    expect(h).toMatch(/PUEDE/);
    expect(h).toMatch(/efectivo/i);
  });
});
