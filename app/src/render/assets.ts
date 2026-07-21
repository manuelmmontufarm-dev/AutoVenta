/**
 * Assets del motor de imágenes: fuentes, logos de marca y fotos de producto.
 * Los SVG (logos, llanta genérica) se rasterizan a PNG con resvg al primer uso
 * y quedan cacheados — satori los recibe como data URI.
 */
import { readFileSync, existsSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

// src/render → app/assets (misma profundidad compilado en dist/render)
const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets");

// ---------------------------------------------------------------------------
// Fuentes
// ---------------------------------------------------------------------------

export interface FontSpec {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 700 | 900;
  style: "normal";
}

let fonts: FontSpec[] | null = null;

export function loadFonts(): FontSpec[] {
  if (fonts) return fonts;
  const dir = path.join(ASSETS, "fonts");
  fonts = [
    { name: "Archivo", data: readFileSync(path.join(dir, "Archivo-400.ttf")), weight: 400, style: "normal" },
    { name: "Archivo", data: readFileSync(path.join(dir, "Archivo-500.ttf")), weight: 500, style: "normal" },
    { name: "Archivo", data: readFileSync(path.join(dir, "Archivo-700.ttf")), weight: 700, style: "normal" },
    { name: "Archivo Black", data: readFileSync(path.join(dir, "ArchivoBlack.ttf")), weight: 900, style: "normal" },
  ];
  return fonts;
}

// ---------------------------------------------------------------------------
// SVG → PNG data URI (logos, llanta genérica)
// ---------------------------------------------------------------------------

export interface RasterImage {
  dataUri: string;
  width: number;
  height: number;
}

function rasterize(svg: string, fitHeight: number): RasterImage {
  const resvg = new Resvg(svg, { fitTo: { mode: "height", value: fitHeight } });
  const png = resvg.render();
  const buf = png.asPng();
  return {
    dataUri: `data:image/png;base64,${Buffer.from(buf).toString("base64")}`,
    width: png.width,
    height: png.height,
  };
}

/**
 * Recorta los márgenes vacíos de un SVG de logo reescribiendo su viewBox.
 * Los vectores de banco de logos vienen en lienzo cuadrado con el arte al
 * centro (y a veces un fondo blanco) — sin esto el logo sale diminuto.
 * El bounding box se calcula sobre píxeles no transparentes y no-blancos.
 */
function autoTrimSvg(svg: string): string {
  const viewBoxMatch = svg.match(/viewBox="([\d.eE+-]+)[ ,]+([\d.eE+-]+)[ ,]+([\d.eE+-]+)[ ,]+([\d.eE+-]+)"/);
  if (!viewBoxMatch) return svg;
  const [, vx, vy, vw, vh] = viewBoxMatch.map(Number);
  if (!vw || !vh) return svg;

  const probe = new Resvg(svg, { fitTo: { mode: "width", value: 400 } }).render();
  const { pixels, width, height } = probe;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
      if (a > 16 && !(r > 245 && g > 245 && b > 245)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || maxX - minX < 8 || maxY - minY < 8) return svg;

  const scaleX = vw / width;
  const scaleY = vh / height;
  const pad = Math.max((maxX - minX) * scaleX, (maxY - minY) * scaleY) * 0.04;
  const nx = Math.max(vx, vx + minX * scaleX - pad);
  const ny = Math.max(vy, vy + minY * scaleY - pad);
  const nw = Math.min(vw, (maxX - minX + 1) * scaleX + pad * 2);
  const nh = Math.min(vh, (maxY - minY + 1) * scaleY + pad * 2);

  return svg
    .replace(viewBoxMatch[0], `viewBox="${nx} ${ny} ${nw} ${nh}"`)
    .replace(/(<svg[^>]*?)\s(?:width|height)="[^"]*"/g, "$1")
    .replace(/(<svg[^>]*?)\s(?:width|height)="[^"]*"/g, "$1");
}

const brandCache = new Map<string, RasterImage | null>();

function brandSlug(brand: string): string {
  return brand
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Logo de la marca como PNG (alto 96px @2x) o null si no hay asset —
 * en ese caso la plantilla dibuja el nombre en texto estilizado.
 * Busca `assets/brands/<slug>.svg` o `.png`.
 */
export function brandLogo(brand: string): RasterImage | null {
  const slug = brandSlug(brand);
  if (brandCache.has(slug)) return brandCache.get(slug)!;
  let result: RasterImage | null = null;
  const svgPath = path.join(ASSETS, "brands", `${slug}.svg`);
  const pngPath = path.join(ASSETS, "brands", `${slug}.png`);
  try {
    if (existsSync(svgPath)) {
      result = rasterize(autoTrimSvg(readFileSync(svgPath, "utf8")), 96);
    } else if (existsSync(pngPath)) {
      const buf = readFileSync(pngPath);
      result = { dataUri: `data:image/png;base64,${buf.toString("base64")}`, width: 0, height: 96 };
    }
  } catch (err) {
    console.warn(`⚠️ No se pudo rasterizar el logo de ${brand}:`, err);
  }
  brandCache.set(slug, result);
  return result;
}

let genericTire: RasterImage | null = null;

/** Ilustración genérica de llanta (fallback cuando el producto no tiene foto). */
export function genericTireImage(): RasterImage {
  if (!genericTire) {
    genericTire = rasterize(readFileSync(path.join(ASSETS, "tires", "generic.svg"), "utf8"), 640);
  }
  return genericTire;
}

const tireAssetCache = new Map<string, RasterImage | null>();

/**
 * Foto local del producto: `assets/tires/<marca>-<diseño>.png|jpg` (slug).
 * Ej. Kenda KR608 → kenda-kr608.png
 */
export function localTirePhoto(brand: string, design: string): RasterImage | null {
  const slug = `${brandSlug(brand)}-${brandSlug(design)}`;
  if (tireAssetCache.has(slug)) return tireAssetCache.get(slug)!;
  let result: RasterImage | null = null;
  for (const ext of ["png", "jpg", "jpeg"]) {
    const p = path.join(ASSETS, "tires", `${slug}.${ext}`);
    if (existsSync(p)) {
      const mime = ext === "png" ? "image/png" : "image/jpeg";
      result = { dataUri: `data:${mime};base64,${readFileSync(p).toString("base64")}`, width: 0, height: 0 };
      break;
    }
  }
  tireAssetCache.set(slug, result);
  return result;
}

// ---------------------------------------------------------------------------
// Fotos remotas (columna "foto" del catálogo)
// ---------------------------------------------------------------------------

const photoCache = new Map<string, RasterImage | null>();

/** Descarga una foto de producto (png/jpeg, máx 3MB, timeout 6s). Cachea. */
export async function remotePhoto(url: string): Promise<RasterImage | null> {
  if (photoCache.has(url)) return photoCache.get(url)!;
  let result: RasterImage | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const mime = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (res.ok && ["image/png", "image/jpeg", "image/jpg"].includes(mime)) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength <= 3 * 1024 * 1024) {
        result = { dataUri: `data:${mime};base64,${buf.toString("base64")}`, width: 0, height: 0 };
      }
    }
  } catch {
    // foto remota caída no debe tumbar la cotización — cae al fallback
  }
  photoCache.set(url, result);
  return result;
}

/**
 * Resuelve la mejor imagen disponible para un producto:
 * foto remota (catálogo) → asset local → ilustración genérica.
 */
export async function productPhoto(
  brand: string,
  design: string,
  photoUrl?: string | null,
): Promise<RasterImage> {
  if (photoUrl) {
    const remote = await remotePhoto(photoUrl);
    if (remote) return remote;
  }
  return localTirePhoto(brand, design) ?? genericTireImage();
}

/** Lista de marcas con logo disponible (para diagnóstico). */
export function availableBrandLogos(): string[] {
  try {
    return readdirSync(path.join(ASSETS, "brands"))
      .filter((f) => /\.(svg|png)$/.test(f))
      .map((f) => f.replace(/\.(svg|png)$/, ""));
  } catch {
    return [];
  }
}
