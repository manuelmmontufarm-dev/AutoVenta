process.env.WHATSAPP_TOKEN ??= "x";
process.env.WHATSAPP_APP_SECRET ??= "x";
process.env.WHATSAPP_VERIFY_TOKEN ??= "x";
process.env.WHATSAPP_PHONE_ID ??= "x";
process.env.SELLER_PHONE ??= "x";
process.env.OPENAI_API_KEY ??= "x";
process.env.DATABASE_URL ??= "postgres://x/x";
import { writeFileSync } from "node:fs";
const { renderOptionsImage, toRenderLine } = await import("../src/render/quoteImage.js");
const { normalizeContificoProduct } = await import("../src/domain/catalog.js");
const wire = (codigo: string, nombre: string, marca: string, pvp1: number, stock: number) =>
  normalizeContificoProduct({ id: codigo, codigo, nombre, marca_nombre: marca, estado: "A", tipo: "P", pvp1, porcentaje_iva: 15, cantidad_stock: stock }, "pvp1")!;
const products = [
  wire("ZE310R-2055516", "205/55R16 91V ZIEX ZE310R ECORUN", "FALKEN", 72.6, 8),
  wire("ZE914-2055516", "205/55R16 91V ZIEX ZE914B ECORUN", "FALKEN", 68.0, 0),
  wire("KR203-2055516", "205/55R16 91V KOMET PLUS KR203", "KENDA", 55.5, 14),
  wire("KR20-2055516", "205/55R16 91V KOMET PLUS KR20", "KENDA", 59.0, 5),
  wire("R380-2055516", "205/55R16 91V R380 WINRUN", "WINRUN", 43.0, 9),
];
const png = await renderOptionsImage({
  dateLabel: "20 / 07 / 2026",
  sizeLabel: "205/55R16",
  products: await Promise.all(products.map((p) => toRenderLine(p))),
});
writeFileSync(process.argv[2] ?? "test/options.png", png);
console.log("✅ opciones renderizadas", products.map(p => `${p.brand} ${p.design} $${p.minimumPriceWithTax}`).join(" | "));
