/**
 * Demo visual del motor de imágenes: genera las 3 piezas con datos de ejemplo
 * y las guarda como PNG (y el PDF) para revisarlas a ojo.
 *
 *   npx tsx test/render-demo.ts [dir-salida]
 */
// El módulo de config exige env vars del bot — dummies para el render local.
process.env.WHATSAPP_TOKEN ??= "x";
process.env.WHATSAPP_APP_SECRET ??= "x";
process.env.WHATSAPP_VERIFY_TOKEN ??= "x";
process.env.WHATSAPP_PHONE_ID ??= "x";
process.env.SELLER_PHONE ??= "x";
process.env.OPENAI_API_KEY ??= "x";
process.env.DATABASE_URL ??= "postgres://x/x";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const out = process.argv[2] ?? "test/render-out";
mkdirSync(out, { recursive: true });

const { renderQuoteImage, renderCompareImage, toRenderLine } = await import(
  "../src/render/quoteImage.js"
);
const { pngToQuotePdf } = await import("../src/services/quotePdf.js");
const { extractLoadSpeed } = await import("../src/domain/loadSpeed.js");

const kenda608 = await toRenderLine({
  brand: "Kenda",
  design: "KR608",
  sizeLabel: "265/70R16",
  loadSpeed: extractLoadSpeed("LT265/70R16 8PR 117/114 S - KR608 TL (CARGA)"),
  quantity: 4,
  priceSinIva: 208.23,
  pvpSinIva: 277.63,
  stock: 12,
});

const kenda601 = await toRenderLine({
  brand: "Kenda",
  design: "KR601",
  sizeLabel: "265/70R16",
  loadSpeed: extractLoadSpeed("LT265/70R16 6PR 110/107 Q - KR601 TL (CARGA)"),
  quantity: 1,
  priceSinIva: 197.16,
  pvpSinIva: 262.87,
  stock: 6,
});

const winrun = await toRenderLine({
  brand: "Winrun",
  design: "Maxclaw A/T",
  sizeLabel: "265/70R16",
  loadSpeed: extractLoadSpeed("265/70R16 112T MAXCLAW A/T WINRUN"),
  quantity: 2,
  priceSinIva: 126.50,
  pvpSinIva: 168.67,
  stock: 0,
});

const falken = await toRenderLine({
  brand: "Falken",
  design: "Wildpeak A/T Trail",
  sizeLabel: "265/70R16",
  loadSpeed: extractLoadSpeed("265/70R16 112S WILDPEAK A/T TRAIL"),
  quantity: 1,
  priceSinIva: 196.76,
  pvpSinIva: null,
  stock: 3,
});

const dateLabel = "20 / 07 / 2026";

// 1. Cotización héroe (1 producto, 4 unidades)
const hero = await renderQuoteImage({
  number: "COT-DEMO1",
  dateLabel,
  lines: [{ ...kenda608 }],
  subtotal: 832.92,
  iva: 124.94,
  total: 957.86,
});
writeFileSync(path.join(out, "1-cotizacion-hero.png"), hero);
writeFileSync(path.join(out, "1-cotizacion-hero.pdf"), await pngToQuotePdf(hero));

// 2. Cotización multi-producto
const multi = await renderQuoteImage({
  number: "COT-DEMO2",
  dateLabel,
  lines: [{ ...kenda608, quantity: 2 }, { ...winrun, quantity: 2 }],
  subtotal: 669.46,
  iva: 100.42,
  total: 769.88,
});
writeFileSync(path.join(out, "2-cotizacion-multi.png"), multi);

// 3. Comparativa de 3
const compare = await renderCompareImage({
  dateLabel,
  products: [kenda608, kenda601, winrun],
});
writeFileSync(path.join(out, "3-comparativa.png"), compare);

console.log(`✅ Piezas generadas en ${out}`);
