/**
 * Guarda de tamaño de las piezas visuales.
 *
 * El tope de WhatsApp Cloud API para imágenes es 5 MB: pasado eso el upload se
 * rechaza y el cliente recibe solo el texto largo — justo lo que Depot Tire
 * pidió evitar. Esta prueba falla antes de que un cambio de diseño nos acerque
 * al límite, en vez de descubrirlo en una conversación real.
 */
import { describe, expect, it } from "vitest";

process.env.WHATSAPP_TOKEN ??= "x";
process.env.WHATSAPP_APP_SECRET ??= "x";
process.env.WHATSAPP_VERIFY_TOKEN ??= "x";
process.env.WHATSAPP_PHONE_ID ??= "x";
process.env.SELLER_PHONE ??= "x";
process.env.OPENAI_API_KEY ??= "x";
process.env.DATABASE_URL ??= "postgres://x/x";

const {
  renderOptionsImage, renderCompareImage, renderMedidaGuideImage, renderQuoteImage, toRenderLine,
} = await import("../src/render/quoteImage.js");
const { normalizeContificoProduct } = await import("../src/domain/catalog.js");

/** Margen operativo bajo los 5 MB de Meta. */
const MAX_MB = 4.5;
const MAX_MS = 8_000;

const wire = (codigo: string, nombre: string, marca: string, pvp1: number, stock: number) =>
  normalizeContificoProduct(
    {
      id: codigo, codigo, nombre, marca_nombre: marca, estado: "A", tipo: "P",
      pvp1, porcentaje_iva: 15, cantidad_stock: stock,
    },
    "pvp1",
  )!;

// 9 productos en 3 marcas: el peor caso realista de la lista de opciones, que
// es la pieza que más crece (cada marca suma su cabecera y una fila de fichas).
const CATALOGO = [
  wire("ZE310R", "205/55R16 91V ZIEX ZE310R ECORUN", "FALKEN", 72.6, 8),
  wire("ZE914", "205/55R16 91V ZIEX ZE914B ECORUN", "FALKEN", 68.0, 0),
  wire("AZENIS", "205/55R16 91W AZENIS FK510", "FALKEN", 84.2, 3),
  wire("KR203", "205/55R16 91V KOMET PLUS KR203", "KENDA", 55.5, 14),
  wire("KR20", "205/55R16 91V KOMET PLUS KR20", "KENDA", 59.0, 5),
  wire("KR23", "205/55R16 91V VEZDA TOURING KR23", "KENDA", 57.4, 9),
  wire("R380", "205/55R16 91V R380 WINRUN", "WINRUN", 43.0, 9),
  wire("R330", "205/55R16 91W R330 WINRUN", "WINRUN", 45.5, 6),
  wire("MAXCLAW", "205/55R16 91V MAXCLAW HT WINRUN", "WINRUN", 41.2, 11),
];

const mb = (png: Buffer) => png.byteLength / 1_048_576;

describe("Piezas visuales dentro de los límites de WhatsApp", () => {
  it("las tres piezas pesan menos que el tope de Meta y rinden a tiempo", async () => {
    const lines = await Promise.all(CATALOGO.map((p) => toRenderLine(p)));
    const fecha = "03 / 08 / 2026";

    const piezas: Array<{ nombre: string; png: Buffer; ms: number }> = [];
    const medir = async (nombre: string, render: () => Promise<Buffer>) => {
      const inicio = Date.now();
      const png = await render();
      piezas.push({ nombre, png, ms: Date.now() - inicio });
    };

    await medir("cotizacion", () =>
      renderQuoteImage({
        number: "COT-TEST", dateLabel: fecha, lines: [lines[0]],
        subtotal: 252.52, iva: 37.88, total: 290.4,
      }));
    await medir("comparativa", () =>
      renderCompareImage({ dateLabel: fecha, products: lines.slice(0, 3) }));
    await medir("opciones", () =>
      renderOptionsImage({ dateLabel: fecha, sizeLabel: "205/55R16", products: lines }));
    // La forma que el bot manda de verdad: tresOpciones() deja una marca por
    // escalón, o sea una tarjeta por fila. Desde el 6-ago esa tarjeta va
    // acostada y con la llanta grande, así que es la variante más alta y más
    // pesada de la pieza — la que hay que vigilar.
    await medir("opciones-una-por-marca", () =>
      renderOptionsImage({
        dateLabel: fecha, sizeLabel: "205/55R16",
        products: [lines[0], lines[3], lines[6]],
      }));
    // La guía de medida no toca el catálogo, pero se manda al principio de la
    // conversación: si pesa o tarda, el primer turno del bot es el que sufre.
    await medir("guia-medida", () => renderMedidaGuideImage({ dateLabel: fecha }));
    await medir("guia-medida-con-aro", () =>
      renderMedidaGuideImage({ dateLabel: fecha, aroDelCliente: 17 }));

    for (const { nombre, png, ms } of piezas) {
      expect(png.byteLength, `${nombre} debe producir un PNG`).toBeGreaterThan(0);
      // Firma PNG: si el buffer no lo es, el envío a Meta falla igual.
      expect(png.subarray(1, 4).toString(), `${nombre} debe ser un PNG válido`).toBe("PNG");
      expect(
        mb(png),
        `${nombre} pesa ${mb(png).toFixed(2)} MB — Meta rechaza a partir de 5 MB`,
      ).toBeLessThan(MAX_MB);
      expect(ms, `${nombre} tardó ${ms} ms`).toBeLessThan(MAX_MS);
    }
  }, 60_000);
});
