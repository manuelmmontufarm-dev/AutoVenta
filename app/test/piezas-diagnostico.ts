/**
 * Diagnóstico del motor de imágenes: mide peso, tamaño y tiempo de las tres
 * piezas a distintos números de producto.
 *
 * Existe porque cuando una pieza falla el cliente recibe el muro de texto y
 * nadie se entera (`sendVisual` solo hace console.error). El límite duro de
 * WhatsApp Cloud API para imágenes es 5 MB: pasado eso el upload se rechaza.
 *
 *   npx tsx test/piezas-diagnostico.ts
 */
process.env.WHATSAPP_TOKEN ??= "x";
process.env.WHATSAPP_APP_SECRET ??= "x";
process.env.WHATSAPP_VERIFY_TOKEN ??= "x";
process.env.WHATSAPP_PHONE_ID ??= "x";
process.env.SELLER_PHONE ??= "x";
process.env.OPENAI_API_KEY ??= "x";
process.env.DATABASE_URL ??= "postgres://x/x";

const { renderOptionsImage, renderCompareImage, renderQuoteImage, toRenderLine } =
  await import("../src/render/quoteImage.js");
const { normalizeContificoProduct } = await import("../src/domain/catalog.js");

/** Tope de Meta para imágenes; a partir de aquí el upload falla. */
const LIMITE_META_MB = 5;
/** Margen operativo propio: por encima de esto ya hay que recortar la pieza. */
const ALERTA_MB = 4.5;
const ALERTA_MS = 8_000;

const wire = (codigo: string, nombre: string, marca: string, pvp1: number, stock: number) =>
  normalizeContificoProduct(
    {
      id: codigo, codigo, nombre, marca_nombre: marca, estado: "A", tipo: "P",
      pvp1, porcentaje_iva: 15, cantidad_stock: stock,
    },
    "pvp1",
  )!;

/** Catálogo sintético de 12 productos en 3 marcas, medida 205/55R16. */
const CATALOGO = [
  wire("ZE310R-2055516", "205/55R16 91V ZIEX ZE310R ECORUN", "FALKEN", 72.6, 8),
  wire("ZE914-2055516", "205/55R16 91V ZIEX ZE914B ECORUN", "FALKEN", 68.0, 0),
  wire("AZENIS-2055516", "205/55R16 91W AZENIS FK510", "FALKEN", 84.2, 3),
  wire("SINCERA-2055516", "205/55R16 91H SINCERA SN250", "FALKEN", 70.1, 5),
  wire("KR203-2055516", "205/55R16 91V KOMET PLUS KR203", "KENDA", 55.5, 14),
  wire("KR20-2055516", "205/55R16 91V KOMET PLUS KR20", "KENDA", 59.0, 5),
  wire("KR23-2055516", "205/55R16 91V VEZDA TOURING KR23", "KENDA", 57.4, 9),
  wire("KR30-2055516", "205/55R16 91V VEZDA UHP KR30", "KENDA", 63.8, 2),
  wire("R380-2055516", "205/55R16 91V R380 WINRUN", "WINRUN", 43.0, 9),
  wire("R330-2055516", "205/55R16 91W R330 WINRUN", "WINRUN", 45.5, 6),
  wire("MAXCLAW-2055516", "205/55R16 91V MAXCLAW HT WINRUN", "WINRUN", 41.2, 11),
  wire("R680-2055516", "205/55R16 91H R680 WINRUN", "WINRUN", 39.9, 4),
];

/** Lee ancho y alto del header IHDR del PNG (bytes 16–24). */
function dimensiones(png: Buffer): { ancho: number; alto: number } {
  return { ancho: png.readUInt32BE(16), alto: png.readUInt32BE(20) };
}

interface Medicion {
  pieza: string;
  productos: number;
  ancho: number;
  alto: number;
  mb: number;
  ms: number;
  error?: string;
}

const resultados: Medicion[] = [];

async function medir(pieza: string, productos: number, render: () => Promise<Buffer>) {
  const inicio = Date.now();
  try {
    const png = await render();
    const ms = Date.now() - inicio;
    const { ancho, alto } = dimensiones(png);
    resultados.push({ pieza, productos, ancho, alto, mb: png.byteLength / 1_048_576, ms });
  } catch (err) {
    resultados.push({
      pieza, productos, ancho: 0, alto: 0, mb: 0, ms: Date.now() - inicio,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const dateLabel = "03 / 08 / 2026";
const lineas = await Promise.all(CATALOGO.map((p) => toRenderLine(p)));

// Cotización: siempre un producto. Es la pieza que el cliente elogió.
await medir("cotizacion", 1, () =>
  renderQuoteImage({
    number: "COT-DIAG", dateLabel, lines: [lineas[0]],
    subtotal: 252.52, iva: 37.88, total: 290.40,
  }),
);

// Comparativa: 2 y 3, que es su rango real.
for (const n of [2, 3]) {
  await medir("comparativa", n, () =>
    renderCompareImage({ dateLabel, products: lineas.slice(0, n) }),
  );
}

// Opciones: aquí está la sospecha. El alto crece con el número de productos
// Y con el número de marcas (cada marca agrega su cabecera).
for (const n of [3, 5, 6, 8, 9, 12]) {
  await medir("opciones", n, () =>
    renderOptionsImage({ dateLabel, sizeLabel: "205/55R16", products: lineas.slice(0, n) }),
  );
}

// ---------------------------------------------------------------------------

const fmt = (m: Medicion) =>
  m.error
    ? `${m.pieza.padEnd(12)} ${String(m.productos).padStart(2)} prod  ❌ ${m.error}`
    : `${m.pieza.padEnd(12)} ${String(m.productos).padStart(2)} prod  ` +
      `${String(m.ancho).padStart(4)}×${String(m.alto).padEnd(5)}  ` +
      `${m.mb.toFixed(2).padStart(5)} MB  ${String(m.ms).padStart(5)} ms  ` +
      `${m.mb >= LIMITE_META_MB ? "❌ META LA RECHAZA" : m.mb >= ALERTA_MB ? "⚠️  al límite" : m.ms >= ALERTA_MS ? "⚠️  lenta" : "✅"}`;

console.log("\n  Pieza        Prod    Tamaño        Peso     Tiempo\n" + "  " + "─".repeat(62));
for (const m of resultados) console.log("  " + fmt(m));

const rotas = resultados.filter((m) => m.error || m.mb >= LIMITE_META_MB);
const alLimite = resultados.filter((m) => !m.error && m.mb >= ALERTA_MB && m.mb < LIMITE_META_MB);

console.log("");
if (rotas.length) {
  console.log(`  ❌ ${rotas.length} pieza(s) que WhatsApp NO acepta:`);
  for (const m of rotas) console.log(`     · ${m.pieza} con ${m.productos} productos`);
}
if (alLimite.length) console.log(`  ⚠️  ${alLimite.length} pieza(s) al borde de los ${LIMITE_META_MB} MB`);
if (!rotas.length && !alLimite.length) console.log("  ✅ Todas las piezas dentro de los límites de Meta");
console.log("");

process.exit(rotas.length ? 1 : 0);
