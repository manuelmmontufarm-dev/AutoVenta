/**
 * LO QUE EL CLIENTE PREGUNTA Y EL BOT NO TENÍA.
 *
 * Dos datos concretos de la auditoría del 8 al 11-sep:
 *
 * PAGOS. conv 17804, tras una cotización de $1.563:
 *   CLIENTE: «Si se realiza el pago con tarjeta cuanto sube el valor disculpe»
 *   BOT: «El valor de la cotización ya está enviado; no puedo confirmar
 *         recargos de tarjeta por este medio.»
 *   ASESOR, 22 minutos después: «Con pagos con tarjeta no sube el precio. Y
 *         puede diferir a 3 y 6 meses sin intereses»
 * El dato estaba impreso en el pie de la propia imagen que el bot acababa de
 * mandar («3 y 6 meses sin intereses»), pero como texto dibujado: el bot no lo
 * tenía en ninguna parte que pudiera leer.
 *
 * LONAS. Tres clientes preguntaron de cuántas lonas es una llanta (16974,
 * 18294, 18880) y las tres veces el bot dijo que no tenía el dato. Está en el
 * nombre del producto que él mismo está mostrando: «KENDA LT245/75 R16 120Q
 * KR29 10PR TL» — ese «10PR» son diez lonas.
 */
import { describe, expect, it } from "vitest";
import { lonasDelProducto, politicaDePagos, preguntaPorElPago, respondeElPago } from "../src/domain/datosDelNegocio.js";

describe("las lonas salen del nombre del producto", () => {
  it("los nombres reales del catálogo de Depot", () => {
    expect(lonasDelProducto("KENDA LT245/75 R16 120Q KR29 10PR TL 120/116Q")).toBe(10);
    expect(lonasDelProducto("31X10.50R15LT 109Q KR628 6PR KENDA")).toBe(6);
    expect(lonasDelProducto("LT265/65R17 10PR 120/117R - KR608 TL (CARGA)")).toBe(10);
    expect(lonasDelProducto("35*12.50R17LT 121Q KR629 10PR KENDA")).toBe(10);
    expect(lonasDelProducto("36625028 35*12.50R20LT 125Q KR629 12PR KENDA")).toBe(12);
  });

  it("cuando el nombre no lo dice, no se inventa", () => {
    expect(lonasDelProducto("205/55R16 91V ZE310R FALKEN")).toBeNull();
    expect(lonasDelProducto("")).toBeNull();
    expect(lonasDelProducto(null)).toBeNull();
  });

  it("un número de medida no se confunde con lonas", () => {
    // «10.50» y «R15» traen dígitos pegados a letras; solo «NPR» cuenta.
    expect(lonasDelProducto("31X10.50R15LT 109Q KR601")).toBeNull();
  });
});

describe("la política de pagos es un hecho, no una suposición", () => {
  it("Manuel, 12-sep: con tarjeta NO es más caro, y en efectivo hay descuento que se confirma en el local", () => {
    const t = politicaDePagos();
    expect(t).toMatch(/no\*? es más caro/i);
    expect(t).toMatch(/efectivo/i);
    expect(t).toMatch(/descuento/i);
    expect(t).toMatch(/confirman en el local/i);
    expect(t).not.toMatch(/\d+\s*%/);
  });

  it("conv 17804: dice que con tarjeta no sube y que hay diferido", () => {
    const t = politicaDePagos();
    expect(t).toMatch(/tarjeta/i);
    expect(t).toMatch(/no sube|mismo precio|sin recargo/i);
    expect(t).toMatch(/3 y 6 meses/);
    expect(t).toMatch(/sin intereses/i);
  });

  it("dice también las formas que se aceptan", () => {
    expect(politicaDePagos()).toMatch(/efectivo/i);
    expect(politicaDePagos()).toMatch(/transferencia/i);
  });
});

describe("se exige la respuesta, no se persigue la evasiva", () => {
  it("conv 17804: las tres formas en que el modelo se escapó NO responden", () => {
    // Cada corrida del simulador trajo una redacción distinta. Por eso el
    // candado pregunta si la respuesta ESTÁ, y no cómo se escapó.
    for (const t of [
      "El valor de la cotización ya está enviado; no puedo confirmar recargos de tarjeta por este medio.",
      "Para pago con tarjeta y diferidos, las condiciones exactas se las confirma el asesor en el local.",
      "El pago con tarjeta y las condiciones de diferido se las confirma el asesor en el local. 🤝",
    ]) expect(respondeElPago(t), t).toBe(false);
  });

  it("la política de la casa sí responde", () => {
    expect(respondeElPago(politicaDePagos())).toBe(true);
    expect(respondeElPago("Con tarjeta el precio es el mismo.")).toBe(true);
    expect(respondeElPago("Puede diferir a 3 y 6 meses sin intereses.")).toBe(true);
  });

  it("reconoce cuándo el cliente está preguntando por el pago", () => {
    for (const t of [
      "Si se realiza el pago con tarjeta cuanto sube el valor disculpe",
      "aceptan tarjeta?",
      "se puede diferir?",
      "cuotas sin intereses?",
      "como puedo pagar",
    ]) expect(preguntaPorElPago(t), t).toBe(true);
    expect(preguntaPorElPago("205/55R16")).toBe(false);
    expect(preguntaPorElPago("¿de cuántas lonas es?")).toBe(false);
  });
});
