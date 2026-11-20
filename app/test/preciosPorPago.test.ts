/**
 * EL PRECIO SEGÚN CÓMO PAGA (Manuel, 18-nov-2026, Competimotor).
 *
 * «Dejar precio A, pero si preguntan los descuentos o si cuesta menos con
 * efectivo o cuánto cuesta con tarjeta, que pueda responder y que simplemente
 * dé el precio con cada uno de los métodos de pago en un mensaje.»
 * Jenny: Precio A = normal, B = con tarjeta de crédito, C = efectivo (y,
 * Manuel, transferencia = efectivo). D = mayorista sin servicios: nunca se
 * muestra, sigue siendo el control de tipeo.
 *
 * Los números salen del Excel, no del modelo. Una B o una C mayor que A, o
 * menor que D, es un error de tipeo del sistema y no se guarda.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.DATABASE_URL ||= "postgresql://nadie@localhost/no_se_usa";

const archivo = await import("../src/services/fuentes/archivo.js");
const { normalizarFilaDeCatalogo } = await import("../src/services/fuentes/sheets.js");
const { mensajeDePreciosPorPago, preguntaPorPrecioSegunPago } = await import("../src/domain/preciosPorPago.js");
const REPORTE = readFileSync(fileURLToPath(new URL("./fixtures/inventario-fenix-reporte.xls", import.meta.url)));

const { politica } = await import("../src/negocio/politica.js");

// Con la política de Competimotor: desde el 20-nov cotiza con el Precio B.
async function itemsDe(filas: Record<string, string>[], mapeo = archivo.MAPEO_CATALOGO_DEFECTO) {
  const c = archivo.normalizarCatalogoSubido("x.csv", filas, mapeo);
  return c.filas.map((f) => normalizarFilaDeCatalogo(f.cruda, "archivo", f.precios, politica.precioDeCotizacion).item!);
}

const fila = (b: string, c: string, d = "112") => ({
  "código": "Z1", articulo: "HAIDA 235/75R15LT AT HD818 LN 10PR", "precio a": "139.99",
  "precio b": b, "precio c": c, "precio d": d, existencia: "11", categoria: "LLANTAS",
});

describe("el lector guarda Precio B (tarjeta) y Precio C (efectivo)", () => {
  it("del reporte de Fénix: HAIDA A 139,99 · B 125 · C 118", async () => {
    const l = await archivo.leerInventario("inventario-fenix-reporte.xls", REPORTE, archivo.MAPEO_CATALOGO_DEFECTO);
    const items = l.catalogo.filas.map((f) => normalizarFilaDeCatalogo(f.cruda, "archivo", f.precios).item!);
    const haida = items.find((i) => i.code === "A0100")!;
    expect(haida.customerPriceWithTax).toBe(139.99);
    expect(haida.preciosPorPago).toEqual({ tarjetaConIva: 125, efectivoConIva: 118 });
    expect(items.find((i) => i.code === "A0103")!.preciosPorPago).toEqual({ tarjetaConIva: 200, efectivoConIva: 190 });
  });

  // Desde el 20-nov (Carlos: «cotizar en P2 y P3») una llanta sin B y C que
  // pasen el control NO se cotiza: el A ya no es un respaldo.
  it("B o C mayor que A, o menor que D, es error de tipeo: no se guarda y la llanta no se cotiza", async () => {
    expect(await itemsDe([fila("145", "118")])).toEqual([]);
    expect(await itemsDe([fila("125", "100")])).toEqual([]);
  });

  it("sin B o sin C en la fila: no hay precios por pago (no se inventa) y la llanta no se cotiza", async () => {
    expect(await itemsDe([fila("", "118")])).toEqual([]);
    expect(await itemsDe([fila("125", "")])).toEqual([]);
  });

  it("la cotización va con el Precio B (Carlos Romero, 20-nov), nunca con el A", async () => {
    const [item] = await itemsDe([fila("125", "118")]);
    expect(item.customerPriceWithTax).toBe(125);
    expect(item.minimumPriceWithTax).toBe(125);
  });
});

describe("el mensaje, un solo bloque con los tres precios", () => {
  it("4 llantas: normal, tarjeta y efectivo o transferencia, con el total", () => {
    expect(mensajeDePreciosPorPago([
      { nombre: "HAIDA AT HD818 LN 235/75R15", cantidad: 4, normal: 139.99, tarjeta: 125, efectivo: 118 },
    ])).toBe([
      "Estos son los precios según cómo pague:",
      "*4 llantas HAIDA AT HD818 LN 235/75R15*",
      "🧾 Precio normal: *$139.99* c/u · *$559.96* las 4 llantas",
      "💳 Con tarjeta de crédito: *$125.00* c/u · *$500.00* las 4 llantas",
      "💵 En efectivo o transferencia: *$118.00* c/u · *$472.00* las 4 llantas",
    ].join("\n"));
  });

  it("1 llanta: sin total", () => {
    expect(mensajeDePreciosPorPago([
      { nombre: "HAIDA AT HD818 LN 235/75R15", cantidad: 1, normal: 139.99, tarjeta: 125, efectivo: 118 },
    ])).toBe([
      "Estos son los precios según cómo pague:",
      "*1 llanta HAIDA AT HD818 LN 235/75R15*",
      "🧾 Precio normal: *$139.99*",
      "💳 Con tarjeta de crédito: *$125.00*",
      "💵 En efectivo o transferencia: *$118.00*",
    ].join("\n"));
  });

  it("nunca nombra el precio mayorista", () => {
    const m = mensajeDePreciosPorPago([{ nombre: "X", cantidad: 4, normal: 100, tarjeta: 95, efectivo: 90 }]);
    expect(m).not.toMatch(/mayorist|precio d\b|para llevar/i);
  });
});

describe("qué preguntas lo disparan", () => {
  it("efectivo, tarjeta, transferencia y descuentos", () => {
    for (const t of ["y con tarjeta cuánto sale?", "hay descuento en efectivo?", "cuánto sale en efectivo", "si pago por transferencia?",
      "tienen algún descuento?", "sale más barato de contado?", "me hace una rebaja"]) {
      expect(preguntaPorPrecioSegunPago(t), t).toBe(true);
    }
  });

  it("lo demás no", () => {
    for (const t of ["quiero 4 llantas 235/75R15", "dónde quedan", "cuánto cuesta la kenda"]) {
      expect(preguntaPorPrecioSegunPago(t), t).toBe(false);
    }
  });
});

describe("por cuál pago pregunta (para la segunda vez)", () => {
  it("tarjeta, efectivo o ninguno", async () => {
    const { pagoPreguntado } = await import("../src/domain/preciosPorPago.js");
    expect(pagoPreguntado("y con tarjeta cuánto sale?")).toBe("tarjeta");
    expect(pagoPreguntado("a cuántas cuotas?")).toBe("tarjeta");
    expect(pagoPreguntado("hay descuento en efectivo?")).toBe("efectivo");
    expect(pagoPreguntado("y por transferencia?")).toBe("efectivo");
    expect(pagoPreguntado("cómo es con tarjeta y en efectivo?")).toBeNull();
    expect(pagoPreguntado("formas de pago?")).toBeNull();
  });
});
