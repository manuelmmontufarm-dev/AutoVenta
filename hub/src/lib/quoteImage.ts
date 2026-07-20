import type { CatalogProduct, QuoteSelection } from "../data/catalog";

const NAVY = "#14213d";
const RED = "#d62828";
const CREAM = "#f7f3ea";
const PAPER = "#fffdf7";
const GREEN = "#14835d";
const MUTED = "#667085";
const GOLD = "#f4bd4f";

export async function downloadOptionsImage(
  products: readonly CatalogProduct[],
): Promise<void> {
  if (!products.length) throw new Error("No hay opciones visibles para exportar");
  if (products.length > 18) {
    throw new Error("Reduce los filtros a máximo 18 opciones para crear la imagen");
  }
  await document.fonts?.ready;
  const groups = groupByBrand(products);
  const width = 1600;
  const cardHeight = 440;
  const rows = [...groups.values()].reduce(
    (sum, values) => sum + Math.ceil(values.length / 3),
    0,
  );
  const height = 200 + groups.size * 70 + rows * cardHeight + 90;
  const { canvas, ctx } = canvas2d(width, height);
  paintBackground(ctx, width, height);
  drawHeader(ctx, "Opciones de llantas", `${longDate()} · precios por unidad`);

  let y = 185;
  for (const [brand, brandProducts] of groups) {
    ctx.fillStyle = brandColor(brand);
    ctx.font = "900 30px Archivo, sans-serif";
    ctx.fillText(`${brandEmoji(brand)} ${brand.toUpperCase()}`, 54, y + 35);
    ctx.strokeStyle = "#d9dde5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(320, y + 27);
    ctx.lineTo(width - 54, y + 27);
    ctx.stroke();
    y += 66;
    for (let index = 0; index < brandProducts.length; index += 3) {
      const row = brandProducts.slice(index, index + 3);
      await Promise.all(
        row.map((product, column) =>
          drawOptionCard(ctx, product, 52 + column * 510, y, 480, 410),
        ),
      );
      y += cardHeight;
    }
  }
  drawFooter(ctx, width, height);
  await downloadCanvas(canvas, `Opciones-DepotTire-${Date.now()}.png`);
}

export async function downloadComparisonImage(
  products: readonly CatalogProduct[],
): Promise<void> {
  if (products.length < 2 || products.length > 3) {
    throw new Error("Selecciona dos o tres llantas para comparar");
  }
  await document.fonts?.ready;
  const width = 1600;
  const height = 1180;
  const { canvas, ctx } = canvas2d(width, height);
  paintBackground(ctx, width, height);
  drawHeader(ctx, "Comparativa de llantas", `${shortDate()} · válida 3 días`);
  const gap = 28;
  const cardWidth = (width - 104 - gap * (products.length - 1)) / products.length;
  await Promise.all(
    products.map((product, index) =>
      drawComparisonCard(
        ctx,
        product,
        52 + index * (cardWidth + gap),
        190,
        cardWidth,
        900,
      ),
    ),
  );
  drawFooter(ctx, width, height);
  await downloadCanvas(canvas, `Comparativa-DepotTire-${Date.now()}.png`);
}

export async function downloadQuoteImage(
  selection: QuoteSelection,
  customerName: string,
): Promise<void> {
  await document.fonts?.ready;
  const { product, quantity } = selection;
  const width = 1080;
  const height = 1350;
  const { canvas, ctx } = canvas2d(width, height);
  paintBackground(ctx, width, height);
  drawHeader(ctx, "Cotización de llanta", `${shortDate()} · válida 3 días`);

  roundedRect(ctx, 56, 180, width - 112, 1100, 28, PAPER, "#d9dde5");
  const image = await loadImage(product.imageUrl);
  if (image) drawContain(ctx, image, 90, 215, 420, 430);
  else drawTirePlaceholder(ctx, 90, 215, 420, 430);

  ctx.fillStyle = brandColor(product.brand);
  ctx.font = "900 38px Archivo, sans-serif";
  ctx.fillText(product.brand.toUpperCase(), 550, 250);
  ctx.fillStyle = NAVY;
  ctx.font = "900 54px Archivo, sans-serif";
  ctx.fillText(trim(product.design, 20), 550, 315);
  ctx.font = "800 30px JetBrains Mono, monospace";
  ctx.fillText(product.sizeLabel ?? "", 550, 365);
  ctx.fillStyle = availabilityColor(product.availability);
  ctx.font = "800 25px Archivo, sans-serif";
  ctx.fillText(availability(product.availability), 550, 430);
  if (product.loadSpeed) {
    ctx.fillStyle = MUTED;
    ctx.font = "700 22px Archivo, sans-serif";
    ctx.fillText(spec(product), 550, 480);
  }

  ctx.fillStyle = "#f1f3f7";
  roundedRect(ctx, 90, 690, width - 180, 230, 24, "#f1f3f7", "#d9dde5");
  ctx.fillStyle = MUTED;
  ctx.font = "800 21px Archivo, sans-serif";
  ctx.fillText("PRECIO LISTA", 125, 745);
  ctx.font = "800 34px Archivo, sans-serif";
  strikeText(ctx, money(product.listPrice), 125, 800);
  ctx.fillStyle = RED;
  ctx.font = "900 24px Archivo, sans-serif";
  ctx.fillText(`Ahorras ${product.discountPercent}%`, 125, 855);
  ctx.textAlign = "right";
  ctx.fillStyle = RED;
  ctx.font = "800 21px Archivo, sans-serif";
  ctx.fillText("PRECIO HOY", width - 125, 745);
  ctx.fillStyle = NAVY;
  ctx.font = "900 58px Archivo, sans-serif";
  ctx.fillText(money(product.salePrice), width - 125, 815);
  ctx.fillStyle = MUTED;
  ctx.font = "600 19px Archivo, sans-serif";
  ctx.fillText("IVA y Ecovalor incluidos · por unidad", width - 125, 855);
  ctx.textAlign = "left";

  ctx.fillStyle = NAVY;
  ctx.font = "800 23px Archivo, sans-serif";
  ctx.fillText(`Cliente: ${customerName || "Cliente"}`, 95, 980);
  ctx.fillText(`${quantity} llanta${quantity === 1 ? "" : "s"}`, 95, 1025);
  ctx.textAlign = "right";
  ctx.fillStyle = MUTED;
  ctx.font = "800 20px Archivo, sans-serif";
  ctx.fillText("TOTAL", width - 95, 980);
  ctx.fillStyle = RED;
  ctx.font = "900 50px Archivo, sans-serif";
  ctx.fillText(money(product.salePrice * quantity), width - 95, 1038);
  ctx.textAlign = "left";

  drawWarrantyRows(ctx, product, 92, 1090, width - 184);
  drawFooter(ctx, width, height);
  await downloadCanvas(canvas, `Cotizacion-DepotTire-${Date.now()}.png`);
}

async function drawOptionCard(
  ctx: CanvasRenderingContext2D,
  product: CatalogProduct,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  roundedRect(ctx, x, y, width, height, 24, PAPER, brandColor(product.brand));
  const image = await loadImage(product.imageUrl);
  if (image) drawContain(ctx, image, x + 20, y + 18, width - 40, 230);
  else drawTirePlaceholder(ctx, x + 20, y + 18, width - 40, 230);
  ctx.fillStyle = NAVY;
  ctx.font = "900 26px Archivo, sans-serif";
  ctx.fillText(trim(product.design, 25), x + 22, y + 282);
  ctx.fillStyle = MUTED;
  ctx.font = "700 17px JetBrains Mono, monospace";
  ctx.fillText(product.sizeLabel ?? "", x + 22, y + 310);
  ctx.font = "700 16px Archivo, sans-serif";
  strikeText(ctx, `PVP ${money(product.listPrice)}`, x + 22, y + 340);
  ctx.fillStyle = RED;
  ctx.font = "900 31px Archivo, sans-serif";
  ctx.fillText(money(product.salePrice), x + 22, y + 380);
  ctx.textAlign = "right";
  ctx.fillStyle = availabilityColor(product.availability);
  ctx.font = "800 16px Archivo, sans-serif";
  ctx.fillText(availability(product.availability), x + width - 22, y + 378);
  ctx.textAlign = "left";
}

async function drawComparisonCard(
  ctx: CanvasRenderingContext2D,
  product: CatalogProduct,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  roundedRect(ctx, x, y, width, height, 28, PAPER, "#d9dde5");
  const image = await loadImage(product.imageUrl);
  if (image) drawContain(ctx, image, x + 30, y + 30, width - 60, 390);
  else drawTirePlaceholder(ctx, x + 30, y + 30, width - 60, 390);
  ctx.textAlign = "center";
  ctx.fillStyle = brandColor(product.brand);
  ctx.font = "900 34px Archivo, sans-serif";
  ctx.fillText(product.brand.toUpperCase(), x + width / 2, y + 470);
  ctx.fillStyle = NAVY;
  ctx.font = "900 40px Archivo, sans-serif";
  ctx.fillText(trim(product.design, 20), x + width / 2, y + 522);
  ctx.fillStyle = MUTED;
  ctx.font = "800 22px JetBrains Mono, monospace";
  ctx.fillText(product.sizeLabel ?? "", x + width / 2, y + 558);
  ctx.fillStyle = RED;
  ctx.font = "900 48px Archivo, sans-serif";
  ctx.fillText(money(product.salePrice), x + width / 2, y + 635);
  ctx.fillStyle = MUTED;
  ctx.font = "700 20px Archivo, sans-serif";
  strikeText(ctx, `Antes ${money(product.listPrice)}`, x + width / 2, y + 675);
  ctx.fillStyle = GREEN;
  ctx.font = "900 19px Archivo, sans-serif";
  ctx.fillText(`-${product.discountPercent}%`, x + width / 2, y + 710);
  ctx.fillStyle = NAVY;
  ctx.font = "800 19px Archivo, sans-serif";
  ctx.fillText(spec(product) || "Índice por confirmar", x + width / 2, y + 770);
  ctx.fillStyle = availabilityColor(product.availability);
  ctx.fillText(availability(product.availability), x + width / 2, y + 810);
  ctx.textAlign = "left";
  drawWarrantyRows(ctx, product, x + 24, y + 842, width - 48);
}

function drawWarrantyRows(
  ctx: CanvasRenderingContext2D,
  product: CatalogProduct,
  x: number,
  y: number,
  width: number,
) {
  roundedRect(ctx, x, y, width, 48, 12, "#fff7da", "#f1dfa0");
  roundedRect(ctx, x, y + 56, width, 48, 12, "#e9f6ee", "#bee5cd");
  ctx.fillStyle = NAVY;
  ctx.font = "700 15px Archivo, sans-serif";
  ctx.fillText(`⭐ ${product.warranty.factory}`, x + 14, y + 30);
  ctx.fillText(
    `🔒 ${product.warranty.roadHazard ?? "Cobertura por confirmar"}`,
    x + 14,
    y + 86,
  );
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
) {
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, ctx.canvas.width, 155);
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, ctx.canvas.width, 12);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 48px Archivo, sans-serif";
  ctx.fillText("DEPOT TIRE", 52, 70);
  ctx.fillStyle = GOLD;
  ctx.font = "900 26px Archivo, sans-serif";
  ctx.fillText(title.toUpperCase(), 52, 112);
  ctx.textAlign = "right";
  ctx.fillStyle = "#dce4f3";
  ctx.font = "700 23px Archivo, sans-serif";
  ctx.fillText(subtitle, ctx.canvas.width - 52, 84);
  ctx.textAlign = "left";
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.fillStyle = NAVY;
  ctx.font = "600 19px Archivo, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    "Precios incluyen IVA y Ecovalor · disponibilidad sujeta a confirmación",
    width / 2,
    height - 30,
  );
  ctx.textAlign = "left";
  ctx.fillStyle = RED;
  ctx.fillRect(0, height - 10, width, 10);
}

function paintBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, width, height);
}

function canvas2d(width: number, height: number) {
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no puede generar la imagen");
  ctx.scale(scale, scale);
  return { canvas, ctx };
}

async function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function drawTirePlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  ctx.fillStyle = "#eef0f3";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(x + width / 2, y + height / 2, Math.min(width, height) * 0.25, 0, Math.PI * 2);
  ctx.stroke();
}

async function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("No se pudo crear la imagen")),
      "image/png",
      0.96,
    ),
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke: string,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function strikeText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
) {
  ctx.fillStyle = MUTED;
  ctx.fillText(text, x, y);
  const metrics = ctx.measureText(text);
  const start =
    ctx.textAlign === "center"
      ? x - metrics.width / 2
      : ctx.textAlign === "right"
        ? x - metrics.width
        : x;
  ctx.strokeStyle = MUTED;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(start, y - 9);
  ctx.lineTo(start + metrics.width, y - 9);
  ctx.stroke();
}

function groupByBrand(products: readonly CatalogProduct[]) {
  const groups = new Map<string, CatalogProduct[]>();
  for (const product of products) {
    const current = groups.get(product.brand) ?? [];
    current.push(product);
    groups.set(product.brand, current);
  }
  return groups;
}

function spec(product: CatalogProduct): string {
  if (!product.loadSpeed) return "";
  const details = [
    product.loadSpeed.loadKg ? `${product.loadSpeed.loadKg} kg` : null,
    product.loadSpeed.speedKmh ? `${product.loadSpeed.speedKmh} km/h` : null,
  ].filter(Boolean);
  return details.length
    ? `${product.loadSpeed.code} · ${details.join(" · ")}`
    : product.loadSpeed.code;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function shortDate(): string {
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function longDate(): string {
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function trim(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function availability(value: CatalogProduct["availability"]): string {
  return value === "available"
    ? "✓ Disponible"
    : value === "check"
      ? "• Consultar"
      : "Agotada";
}

function availabilityColor(value: CatalogProduct["availability"]): string {
  return value === "available" ? GREEN : value === "check" ? "#c06b00" : RED;
}

function brandEmoji(brand: string): string {
  const normalized = brand.toLowerCase();
  if (normalized.includes("falken")) return "🔵";
  if (normalized.includes("kenda")) return "🔴";
  if (normalized.includes("winrun")) return "🟢";
  return "⚫";
}

function brandColor(brand: string): string {
  const normalized = brand.toLowerCase();
  if (normalized.includes("falken")) return "#1f4e8c";
  if (normalized.includes("kenda")) return RED;
  if (normalized.includes("winrun")) return "#16836b";
  return NAVY;
}
