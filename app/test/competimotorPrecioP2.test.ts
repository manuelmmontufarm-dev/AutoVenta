/**
 * COMPETIMOTOR COTIZA CON P2 (Carlos Romero, 20-nov-2026, WhatsApp):
 * «Corregir PRECIO en cotizaciones: dar precio 2 y cotizar en P2 y P3».
 *
 * Jenny, 18-nov: A = normal, B = con tarjeta, C = efectivo y transferencia,
 * D = nunca. Hasta hoy el bot cotizaba con el A. Desde ahora: la cotización,
 * la pieza y las 6 cuotas salen del B; en efectivo, transferencia o si pide
 * descuento se ofrece el C; el A no aparece en ningún lado.
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
const { politica } = await import("../src/negocio/politica.js");
const { buildQuote } = await import("../src/services/quotePdf.js");
const { business } = await import("../src/config.js");
const { mensajeDePreciosPorPago, mensajeDeUnPago } = await import("../src/domain/preciosPorPago.js");
const { toolItem } = await import("../src/agent/tools.js");
const { estructurarTurno } = await import("../src/domain/estructuraDelTurno.js");
const REPORTE = readFileSync(fileURLToPath(new URL("./fixtures/inventario-fenix-reporte.xls", import.meta.url)));

const fila = (a: string, b: string, c: string, d = "112") => ({
  "código": "Z1", articulo: "HAIDA 235/75R15LT AT HD818 LN 10PR", "precio a": a,
  "precio b": b, "precio c": c, "precio d": d, existencia: "11", categoria: "LLANTAS",
});

function cargar(filas: Record<string, string>[]) {
  const c = archivo.normalizarCatalogoSubido("x.csv", filas, archivo.MAPEO_CATALOGO_DEFECTO);
  return { subido: c, items: c.filas.map((f) => normalizarFilaDeCatalogo(f.cruda, "archivo", f.precios, politica.precioDeCotizacion).item!) };
}

describe("Competimotor: la política cotiza con tarjeta", () => {
  it("la política lo dice", () => {
    expect(politica.precioDeCotizacion).toBe("tarjeta");
  });

  it("el precio de la llanta es el B, sin el A tachado encima", () => {
    const [item] = cargar([fila("139.99", "126.50", "115")]).items;
    expect(item.minimumPriceWithTax).toBe(126.5);
    expect(item.customerPriceWithTax).toBe(126.5);
    expect(item.distributorPriceWithTax).toBe(126.5);
    expect(item.preciosPorPago).toEqual({ tarjetaConIva: 126.5, efectivoConIva: 115 });
  });

  it("sin B válido (B mayor que A: tipeo en Fénix) la llanta no se cotiza y queda descartada con el porqué", () => {
    // Fila real del 20-nov: CONTINENTAL 195/65R15 POWERCONTACT 2- SM, A 100.86 y B 104.99.
    const { subido, items } = cargar([fila("100.86", "104.99", "93.99", "89")]);
    expect(items).toEqual([]);
    expect(subido.descartadas).toHaveLength(1);
    expect(subido.descartadas[0].motivo).toMatch(/^sin precio con tarjeta/);
    expect(archivo.descartadasEnPalabras(subido.descartadas)[0].motivo).toMatch(/no la cotiza/);
  });

  it("C mayor que B también es tipeo: no se cotiza", () => {
    const { items, subido } = cargar([fila("139.99", "115", "126.50")]);
    expect(items).toEqual([]);
    expect(subido.descartadas[0].motivo).toMatch(/mayor que con tarjeta/);
  });

  it("el reporte real de Fénix: cada llanta sale con su Precio B, nunca con el A", async () => {
    const filas = await archivo.filasDelArchivo("inv.xls", REPORTE, Object.values(archivo.MAPEO_CATALOGO_DEFECTO.columnas).filter((c): c is string => typeof c === "string"));
    const c = archivo.normalizarCatalogoSubido("inv.xls", filas, archivo.MAPEO_CATALOGO_DEFECTO);
    expect(c.filas.length).toBeGreaterThanOrEqual(3);
    for (const f of c.filas) {
      const { item } = normalizarFilaDeCatalogo(f.cruda, "archivo", f.precios, politica.precioDeCotizacion);
      if (!item) continue;
      expect(item.minimumPriceWithTax).toBe(f.precios.tarjetaConIva);
      if (f.precios.conIva !== f.precios.tarjetaConIva) expect(item.minimumPriceWithTax).not.toBe(f.precios.conIva);
    }
  });

  it("el total del juego es B × 4 al centavo (antes $85.99 × 4 firmaba $343.97)", () => {
    const linea = (precio: number) => ({
      code: "X", description: "x", quantity: 4, unitPrice: precio / (1 + business.taxRate), salePriceWithTax: precio, listPriceWithTax: precio,
    });
    expect(buildQuote([linea(85.99)], "", "").total).toBe(343.96);
    expect(buildQuote([linea(62.99)], "", "").total).toBe(251.96);
    const q = buildQuote([linea(49.45)], "", "");
    expect(q.total).toBe(197.8);
    expect(Math.round((q.subtotal + q.tax) * 100) / 100).toBe(q.total);
  });
});

describe("Competimotor: el precio según cómo paga, sin el Precio A", () => {
  const linea = { nombre: "HAIDA HD818 235/75R15", cantidad: 4, normal: null, tarjeta: 126.5, efectivo: 115 };

  it("tarjeta = P2 y efectivo/transferencia = P3; nada de «Precio normal»", () => {
    const m = mensajeDePreciosPorPago([linea]);
    expect(m).not.toMatch(/Precio normal/);
    expect(m).toContain("💳 Con tarjeta de crédito: *$126.50* c/u · *$506.00* las 4 llantas");
    expect(m).toContain("💵 En efectivo o transferencia: *$115.00* c/u · *$460.00* las 4 llantas");
  });

  it("pide descuento o paga en efectivo: sale el P3", () => {
    expect(mensajeDeUnPago([linea], "efectivo")).toBe("Pagando en efectivo o por transferencia le queda en *$115.00* c/u · *$460.00* las 4 llantas.");
  });

  it("con Black Friday más barato que el P3, una sola línea y el rótulo", () => {
    const m = mensajeDePreciosPorPago([{ ...linea, tarjeta: 99, efectivo: 99, promocion: "Black Friday hasta el lunes 30-nov" }]);
    expect(m).toContain("* 🖤\n");
    expect(m).toContain("💳 Tarjeta, efectivo o transferencia: *$99.00* c/u");
    expect(m.endsWith("🖤 Black Friday hasta el lunes 30-nov")).toBe(true);
    expect(m).not.toMatch(/💵/);
  });

  it("dos opciones de la lámina con Black Friday: el quitador de repetidas no borra el título de la 2.ª (simulador, 20-nov)", () => {
    const promo = "Black Friday hasta el lunes 30-nov";
    const m = mensajeDePreciosPorPago([
      { nombre: "WINRUN MAXCLAW A/T", numero: 1, cantidad: 4, normal: null, tarjeta: 135, efectivo: 135, promocion: promo },
      { nombre: "WINRUN MAXCLAW R/T", numero: 2, cantidad: 4, normal: null, tarjeta: 135, efectivo: 135, promocion: promo },
    ]);
    const salida = estructurarTurno(m).texto;
    expect(salida).toContain("*1 · WINRUN MAXCLAW A/T* 🖤");
    expect(salida).toContain("*2 · WINRUN MAXCLAW R/T* 🖤");
    expect(salida.match(/Tarjeta, efectivo o transferencia/g)).toHaveLength(2);
    expect(salida.match(/Black Friday/g)).toHaveLength(1);
  });

  it("el vendedor recibe el precio en efectivo junto al de hoy", () => {
    const item = toolItem({
      code: "Z1", brand: "HAIDA", design: "HD818", sizeLabel: "235/75R15", stock: 11,
      customerPriceWithTax: 126.5, minimumPriceWithTax: 126.5, preciosPorPago: { tarjetaConIva: 126.5, efectivoConIva: 115 },
    });
    expect(item).toMatchObject({ precio_hoy_con_iva: 126.5, precio_efectivo_o_transferencia_con_iva: 115 });
    expect(item).not.toHaveProperty("promocion");
  });
});
