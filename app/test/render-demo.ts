/**
 * Demo visual del motor de imágenes: genera las 3 piezas con productos reales
 * del catálogo y las guarda como PNG para revisarlas a ojo.
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
const { normalizeContificoProduct } = await import("../src/domain/catalog.js");

/** Producto de ejemplo con la forma exacta que devuelve Contífico. */
function product(wire: {
  codigo: string;
  nombre: string;
  marca: string;
  /** Costo distribuidor sin IVA, como lo entrega Contífico. */
  pvp1: number;
  pvp2: number;
  stock: number;
}) {
  const item = normalizeContificoProduct({
    id: wire.codigo,
    codigo: wire.codigo,
    nombre: wire.nombre,
    marca_nombre: wire.marca,
    estado: "A",
    tipo: "P",
    pvp1: wire.pvp1,
    pvp2: wire.pvp2,
    porcentaje_iva: 15,
    cantidad_stock: wire.stock,
  }, "pvp1");
  if (!item) throw new Error(`No se pudo construir ${wire.codigo}`);
  return item;
}

const kr608 = product({
  codigo: "KR608-2657016",
  nombre: "LT265/70R16 8PR 117/114 S - KR608 TL (CARGA)",
  marca: "KENDA",
  pvp1: 156.16,
  pvp2: 0,
  stock: 12,
});
const kr601 = product({
  codigo: "KR601-2657016",
  nombre: "LT265/70R16 6PR 110/107 Q - KR601 TL (CARGA)",
  marca: "KENDA",
  pvp1: 147.86,
  pvp2: 0,
  stock: 6,
});
const wildpeak = product({
  codigo: "FK-WP-AT-TRAIL-2657016",
  nombre: "265/70R16 112S WILDPEAK A/T TRAIL",
  marca: "FALKEN",
  pvp1: 147.57,
  pvp2: 0,
  stock: 0,
});

const dateLabel = "20 / 07 / 2026";

const hero = await renderQuoteImage({
  number: "COT-DEMO1",
  dateLabel,
  lines: [await toRenderLine(kr608, 4)],
  subtotal: 832.9,
  iva: 124.94,
  total: 957.84,
});
writeFileSync(path.join(out, "1-cotizacion-hero.png"), hero);

const multi = await renderQuoteImage({
  number: "COT-DEMO2",
  dateLabel,
  lines: [await toRenderLine(kr608, 2), await toRenderLine(wildpeak, 2)],
  subtotal: 809.33,
  iva: 121.4,
  total: 930.73,
});
writeFileSync(path.join(out, "2-cotizacion-multi.png"), multi);

const compare = await renderCompareImage({
  dateLabel,
  products: [
    await toRenderLine(kr608),
    await toRenderLine(kr601),
    await toRenderLine(wildpeak),
  ],
});
writeFileSync(path.join(out, "3-comparativa.png"), compare);

for (const item of [kr608, kr601, wildpeak]) {
  console.log(
    `${item.brand} ${item.design} · ${item.sizeLabel} · hoy $${item.minimumPriceWithTax} ` +
      `(antes $${item.customerPriceWithTax}) · ${item.availability} · foto: ${item.imageUrl ?? "genérica"}`,
  );
}
console.log(`✅ Piezas generadas en ${out}`);
