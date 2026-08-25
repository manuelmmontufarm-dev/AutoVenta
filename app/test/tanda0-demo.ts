/**
 * Evidencia de la Tanda 0: corre el esquema completo contra una base limpia,
 * verifica que la migración de beneficios siembre bien, y muestra lado a lado
 * lo que el cliente recibía antes y lo que recibe ahora.
 *
 *   createdb autoventa_tanda0
 *   DATABASE_URL=postgres://.../autoventa_tanda0 npx tsx test/tanda0-demo.ts
 */
import type { CatalogItem } from "../src/domain/catalog.js";

process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.OPENAI_API_KEY ||= "test";

const { ensureSchema } = await import("../src/db/schema.js");
const { sql } = await import("../src/db/client.js");
const { buildBenefitsBlock, getActiveBenefits } = await import("../src/services/benefits.js");
const {
  buildCustomerOptionsMessageDetallado,
  composeBlocks,
  PREGUNTA_PREFERENCIA,
  splitBlocks,
} = await import("../src/services/quoteMessages.js");

function producto(over: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: "1", code: "ABC", name: "Kenda KR203", brand: "Kenda", design: "KR203",
    size: { width: 205, aspect: 55, rim: 16 }, sizeLabel: "205/55R16",
    price: 85.12, sourcePrice: 85.12, priceTier: "pvp1",
    prices: { pvp1: 85.12, pvp2: null, pvp3: null, pvp4: null },
    taxRate: 0.15, customerPriceWithTax: 113.49, minimumPriceWithTax: 85.12,
    distributorPriceWithTax: 80, stock: 4, availability: "available", imageUrl: null,
    imageSource: null, loadSpeed: null, active: true, source: "contifico",
    ...over,
  } satisfies CatalogItem;
}

const kenda = producto();
const falken = producto({ id: "2", code: "DEF", brand: "Falken", design: "ZE310", minimumPriceWithTax: 96.4 });
const winrun = producto({ id: "3", code: "GHI", brand: "Winrun", design: "R380", minimumPriceWithTax: 72.9 });
const productos = [kenda, falken, winrun];

console.log("▶ Aplicando esquema completo (incluye la migración 008_benefits)…");
await ensureSchema();
console.log("✅ Esquema aplicado sin errores\n");

const [{ exists }] = await sql<{ exists: boolean }[]>`
  select exists (select 1 from information_schema.tables where table_name = 'benefits') as exists
`;
console.log(`Tabla benefits creada: ${exists}`);

const sembrados = await getActiveBenefits();
console.log(`Beneficios sembrados: ${sembrados.length}`);
for (const b of sembrados) console.log(`  ${b.position}. ${b.text}`);

console.log("\n▶ Idempotencia: segunda corrida del esquema…");
await ensureSchema();
const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from benefits`;
console.log(`Beneficios tras la segunda corrida: ${count} ${count === sembrados.length ? "✅ no se duplicaron" : "❌ SE DUPLICARON"}`);

// ------------------------------------------------------------------
console.log("\n" + "═".repeat(70));
console.log("ANTES — lo que recibía el cliente (la captura que mandó Joaquín)");
console.log("═".repeat(70));
const antes = buildCustomerOptionsMessageDetallado(productos, "Manuel");
console.log(antes);
console.log("─".repeat(70));
console.log(`1 mensaje · ${antes.split("\n").filter((l) => l.trim()).length} líneas`);

console.log("\n" + "═".repeat(70));
console.log("AHORA — imagen + bloques cortos");
console.log("═".repeat(70));
const ahora = composeBlocks(
  await buildBenefitsBlock({ brands: productos.map((p) => p.brand) }),
  PREGUNTA_PREFERENCIA,
);
const bloques = splitBlocks(ahora);
bloques.forEach((bloque, i) => {
  console.log(`\n┌─ mensaje ${i + 1} ${"─".repeat(50)}`);
  for (const line of bloque.split("\n")) console.log(`│ ${line}`);
  console.log(`└─ ${bloque.split("\n").filter((l) => l.trim()).length} líneas`);
});
console.log(`\n${bloques.length} mensajes, precedidos por la imagen de opciones.`);

await sql.end();
