/**
 * Render de verificación: las cuatro piezas con el logo real, en la paleta
 * «depot» y en «grafito» (para ver que las seis de siempre no se movieron).
 *
 *   npx tsx test/render-depot-check.ts [dir-salida]
 */
process.env.WHATSAPP_TOKEN ??= "x";
process.env.WHATSAPP_APP_SECRET ??= "x";
process.env.WHATSAPP_VERIFY_TOKEN ??= "x";
process.env.WHATSAPP_PHONE_ID ??= "x";
process.env.SELLER_PHONE ??= "x";
process.env.OPENAI_API_KEY ??= "x";
process.env.DATABASE_URL ??= "postgres://x/x";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const out = process.argv[2] ?? "test/render-out-depot";
mkdirSync(out, { recursive: true });

const {
  renderQuoteImage, renderCompareImage, renderOptionsImage, renderMedidaGuideImage, toRenderLine,
} = await import("../src/render/quoteImage.js");
const { normalizeContificoProduct } = await import("../src/domain/catalog.js");

function product(wire: {
  codigo: string; nombre: string; marca: string; pvp1: number; pvp2: number; stock: number;
}) {
  const item = normalizeContificoProduct({
    id: wire.codigo, codigo: wire.codigo, nombre: wire.nombre, marca_nombre: wire.marca,
    estado: "A", tipo: "P", pvp1: wire.pvp1, pvp2: wire.pvp2,
    porcentaje_iva: 15, cantidad_stock: wire.stock,
  }, "pvp1");
  if (!item) throw new Error(`No se pudo construir ${wire.codigo}`);
  return item;
}

const kr608 = product({ codigo: "KR608-2657016", nombre: "LT265/70R16 8PR 117/114 S - KR608 TL (CARGA)", marca: "KENDA", pvp1: 156.16, pvp2: 210, stock: 12 });
const kr601 = product({ codigo: "KR601-2657016", nombre: "LT265/70R16 6PR 110/107 Q - KR601 TL (CARGA)", marca: "KENDA", pvp1: 147.86, pvp2: 0, stock: 6 });
const wildpeak = product({ codigo: "FK-WP-AT-TRAIL-2657016", nombre: "265/70R16 112S WILDPEAK A/T TRAIL", marca: "FALKEN", pvp1: 147.57, pvp2: 195, stock: 0 });

const dateLabel = "12 / 08 / 2026";
const benefits = ["Instalación y balanceo sin costo", "Seguro contra golpes 12 meses"];

for (const paleta of ["depotRojo", "depot", "grafito"]) {
  writeFileSync(path.join(out, `${paleta}-1-cotizacion.png`), await renderQuoteImage({
    paleta, number: "COT-DEMO1", dateLabel, lines: [await toRenderLine(kr608, 4)],
    subtotal: 832.9, iva: 124.94, total: 957.84, benefits,
  }));
  writeFileSync(path.join(out, `${paleta}-2-comparativa.png`), await renderCompareImage({
    paleta, dateLabel,
    products: [await toRenderLine(kr608), await toRenderLine(kr601), await toRenderLine(wildpeak)],
  }));
  writeFileSync(path.join(out, `${paleta}-3-opciones.png`), await renderOptionsImage({
    paleta, dateLabel,
    products: [await toRenderLine(kr608), await toRenderLine(kr601), await toRenderLine(wildpeak)],
  }));
  writeFileSync(path.join(out, `${paleta}-4-medida.png`), await renderMedidaGuideImage({
    paleta, dateLabel,
  }));
  console.log(`✅ ${paleta}`);
}
console.log(`Piezas en ${out}`);
