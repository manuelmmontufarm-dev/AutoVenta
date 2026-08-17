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
/** Fotos del catálogo servidas por el hub (`/assets/catalog/...`). */
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../site");

// ---------------------------------------------------------------------------
// Fuentes
// ---------------------------------------------------------------------------

export interface FontSpec {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 700 | 900;
  /** Las fuentes de precio del diseño son itálicas; el cuerpo es normal. */
  style: "normal" | "italic";
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
    // Fuentes de precio del diseño de Depot Tire. El negocio elige una desde
    // Ajustes; solo se usan en las cifras grandes, no en el cuerpo del texto.
    { name: "Exo 2", data: readFileSync(path.join(dir, "Exo2-700i.ttf")), weight: 700, style: "italic" },
    { name: "Barlow", data: readFileSync(path.join(dir, "Barlow-700i.ttf")), weight: 700, style: "italic" },
    { name: "Kanit", data: readFileSync(path.join(dir, "Kanit-700i.ttf")), weight: 700, style: "italic" },
    { name: "Chakra Petch", data: readFileSync(path.join(dir, "ChakraPetch-700i.ttf")), weight: 700, style: "italic" },
    { name: "Saira", data: readFileSync(path.join(dir, "Saira-700i.ttf")), weight: 700, style: "italic" },
    { name: "Rajdhani", data: readFileSync(path.join(dir, "Rajdhani-700.ttf")), weight: 700, style: "normal" },
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
 * Quita el rectángulo blanco de fondo que traen muchos vectores de banco de
 * logos (`<path fill="#fff" d="M0 0h192.7v192.7H0V0z"/>`): sobre el crema de la
 * pieza se veía como una caja blanca alrededor del logo.
 */
function stripWhiteBackdrop(svg: string, vw: number, vh: number): string {
  const isWhite = (fill: string) => /^#(fff|ffffff)$/i.test(fill) || /^white$/i.test(fill);
  return svg
    // <path fill="#fff" d="M0 0h{W}v{H}H0V0z"/> — rect a lienzo completo
    .replace(/<path\b[^>]*\/?>/g, (tag) => {
      const fill = tag.match(/fill="([^"]+)"/)?.[1] ?? "";
      const d = tag.match(/\bd="([^"]+)"/)?.[1] ?? "";
      if (!isWhite(fill)) return tag;
      const nums = d.match(/[\d.]+/g)?.map(Number) ?? [];
      const coversCanvas =
        nums.some((n) => Math.abs(n - vw) < 0.5) && nums.some((n) => Math.abs(n - vh) < 0.5);
      return coversCanvas && nums.length <= 6 ? "" : tag;
    })
    // <rect fill="#fff" width="{W}" height="{H}"/>
    .replace(/<rect\b[^>]*\/?>/g, (tag) => {
      const fill = tag.match(/fill="([^"]+)"/)?.[1] ?? "";
      const w = Number(tag.match(/width="([\d.]+)"/)?.[1] ?? NaN);
      const h = Number(tag.match(/height="([\d.]+)"/)?.[1] ?? NaN);
      const covers = Math.abs(w - vw) < 0.5 && Math.abs(h - vh) < 0.5;
      return isWhite(fill) && covers ? "" : tag;
    });
}

/**
 * Recorta los márgenes vacíos de un SVG de logo reescribiendo su viewBox.
 * Los vectores de banco de logos vienen en lienzo cuadrado con el arte al
 * centro (y a veces un fondo blanco) — sin esto el logo sale diminuto.
 * El bounding box se calcula sobre píxeles no transparentes y no-blancos.
 */
function autoTrimSvg(rawSvg: string): string {
  const viewBoxMatch = rawSvg.match(/viewBox="([\d.eE+-]+)[ ,]+([\d.eE+-]+)[ ,]+([\d.eE+-]+)[ ,]+([\d.eE+-]+)"/);
  if (!viewBoxMatch) return rawSvg;
  const [, vx, vy, vw, vh] = viewBoxMatch.map(Number);
  if (!vw || !vh) return rawSvg;

  const svg = stripWhiteBackdrop(rawSvg, vw, vh);
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

// ---------------------------------------------------------------------------
// Logotipo de Depot Tire
// ---------------------------------------------------------------------------

/**
 * Proporción del archivo de logo (422×132). Quien lo coloque fija el ALTO y
 * saca el ancho de aquí: un logo estirado es peor que ninguno.
 */
export const DEPOT_LOGO_RATIO = 422 / 132;

const depotLogoCache = new Map<string, RasterImage | null>();

/**
 * Logotipo real de Depot Tire, tal como está en tiredepotec.com — el archivo
 * de la marca, no una recreación tipográfica.
 *
 * Son los dos únicos originales que publica el negocio, recortados a su
 * contenido (el PNG de Wix viene en lienzo de 500×500 con el arte al centro):
 *
 * - `blanco` para fondos oscuros — el encabezado de las cuatro piezas.
 * - `color`  para fondos claros — negro, rojo y el volante de la O.
 *
 * Devuelve null si falta el archivo; quien llama dibuja el nombre en texto,
 * que es lo que hacían las piezas antes de tener el logo.
 */
export function depotLogo(variant: "blanco" | "color" = "blanco"): RasterImage | null {
  if (depotLogoCache.has(variant)) return depotLogoCache.get(variant)!;
  let result: RasterImage | null = null;
  const file = path.join(ASSETS, "depot", variant === "blanco" ? "logo-blanco.png" : "logo.png");
  try {
    if (existsSync(file)) {
      const buf = readFileSync(file);
      result = { dataUri: `data:image/png;base64,${buf.toString("base64")}`, width: 422, height: 132 };
    } else {
      console.warn(`⚠️ Falta el logo de Depot Tire (${file}); las piezas caen al nombre en texto`);
    }
  } catch (err) {
    console.warn("⚠️ No se pudo leer el logo de Depot Tire:", err);
  }
  depotLogoCache.set(variant, result);
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

const guideTireCache = new Map<string, RasterImage>();

/**
 * La llanta de la guía de medida, con el ARO resaltado.
 *
 * Es la misma ilustración genérica con un anillo grueso sobre el borde del rin.
 * Existe porque la pieza entera se trata de una sola idea —«el aro es el dato
 * que no tiene reemplazo»— y el dibujo la contradecía: el rin era la parte más
 * apagada de la imagen. Resaltado, el ojo va del anillo de la llanta a la caja
 * del «16» sin que nadie lo explique.
 *
 * El realce se inyecta en el SVG como figuras, nunca como texto: resvg dibuja
 * formas siempre, pero para el texto depende de las fuentes que encuentre en el
 * sistema, y el contenedor de Railway no trae ninguna.
 */
export function guideTireImage(rimColor: string): RasterImage {
  const cached = guideTireCache.get(rimColor);
  if (cached) return cached;

  const base = readFileSync(path.join(ASSETS, "tires", "generic.svg"), "utf8");
  // Va justo antes del cierre para quedar por encima de los rayos y los pernos,
  // pegado al borde del rin (r=104 en el lienzo de 400 del original).
  const realce = `
  <circle cx="200" cy="200" r="104" fill="none" stroke="${rimColor}" stroke-width="11" opacity="0.95"/>
  <circle cx="200" cy="200" r="112" fill="none" stroke="${rimColor}" stroke-width="3" opacity="0.55"/>
  </svg>`;
  const image = rasterize(base.replace("</svg>", realce), 640);
  guideTireCache.set(rimColor, image);
  return image;
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

/**
 * `at` es el instante en que se guardó, y solo lo mira `remotePhoto` para no
 * quedarse pegado a un fallo de red. Las fotos de disco (`sitePhoto`) sí
 * cachean el negativo para siempre a propósito: si el archivo no está, no va a
 * aparecer solo a mitad del proceso.
 */
const photoCache = new Map<string, { value: RasterImage | null; at: number }>();

/**
 * Formato REAL del archivo, por sus bytes mágicos — no por la extensión.
 *
 * `kenda-kr50.png` y `kenda-kr100.png` son JPEG guardados con extensión .png.
 * Declararlos como `data:image/png` hacía que resvg no pudiera decodificarlos y
 * la tarjeta salía vacía: eso es el hueco blanco que Joaquín vio en la pieza de
 * 245/65R17 el 6-ago. Un archivo mal nombrado no puede volver a romper la
 * pieza: el nombre no manda, el contenido sí.
 */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "<?xml") return "image/svg+xml";
  if (buf.length >= 4 && buf.subarray(0, 4).toString("latin1") === "<svg") return "image/svg+xml";
  return null;
}

/**
 * Foto del catálogo. Las rutas del manifiesto vienen como `/assets/catalog/x.jpg`
 * (servidas por el hub) → se leen del disco; una URL absoluta se descarga.
 */
export async function catalogPhoto(url: string): Promise<RasterImage | null> {
  if (url.startsWith("/")) return sitePhoto(url);
  return remotePhoto(url);
}

function sitePhoto(publicPath: string): RasterImage | null {
  const enCache = photoCache.get(publicPath);
  if (enCache) return enCache.value;
  let result: RasterImage | null = null;
  // Normaliza para no salir del directorio del sitio
  const rel = path.normalize(publicPath).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  const file = path.join(SITE, rel);
  if (file.startsWith(SITE) && existsSync(file)) {
    const buf = readFileSync(file);
    const mime = sniffImageMime(buf);
    // Sin firma reconocible se descarta: mejor la ilustración genérica que una
    // tarjeta en blanco.
    if (mime) result = { dataUri: `data:${mime};base64,${buf.toString("base64")}`, width: 0, height: 0 };
    else console.warn(`⚠️ Foto de catálogo con formato no reconocido, se ignora: ${publicPath}`);
  }
  photoCache.set(publicPath, { value: result, at: Date.now() });
  return result;
}

const TOPE_FOTO = 3 * 1024 * 1024;
/** Cuánto vale un fallo antes de volver a intentar la descarga. */
const REINTENTO_FOTO_MS = 5 * 60_000;

/** Descarga una foto de producto (png/jpeg, máx 3MB, timeout 6s). Cachea. */
export async function remotePhoto(url: string): Promise<RasterImage | null> {
  // El NEGATIVO no se memoriza para siempre (16-ago). Antes, un timeout de 6 s
  // en el primer render del día dejaba `null` cacheado sin TTL: esa llanta
  // salía con la ilustración genérica en todas las cotizaciones hasta el
  // siguiente deploy, y el catch vacío no dejaba ni una línea de log.
  const enCache = photoCache.get(url);
  if (enCache && (enCache.value !== null || Date.now() - enCache.at < REINTENTO_FOTO_MS)) {
    return enCache.value;
  }
  let result: RasterImage | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const declarado = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (res.ok && ["image/png", "image/jpeg", "image/jpg"].includes(declarado)) {
      // El tope se comprueba ANTES de bajar el cuerpo: la URL sale del campo
      // `imagen` de Contífico, que acepta cualquier http(s). Comprobarlo
      // después (como antes) no protegía de nada — los 40 MB ya estaban en RAM.
      const largo = Number(res.headers.get("content-length"));
      if (Number.isFinite(largo) && largo > TOPE_FOTO) {
        await res.body?.cancel().catch(() => {});
        console.warn(`⚠️ Foto remota descartada por tamaño declarado (${largo} B):`, url);
      } else {
        const buf = Buffer.from(await res.arrayBuffer());
        // El content-type del servidor tampoco manda: vale la firma del archivo.
        const mime = sniffImageMime(buf);
        if (mime && buf.byteLength <= TOPE_FOTO) {
          result = { dataUri: `data:${mime};base64,${buf.toString("base64")}`, width: 0, height: 0 };
        } else {
          console.warn(`⚠️ Foto remota descartada (mime ${mime ?? "?"}, ${buf.byteLength} B):`, url);
        }
      }
    } else if (!res.ok) {
      console.warn(`⚠️ Foto remota no descargada (HTTP ${res.status}):`, url);
    }
  } catch (err) {
    // foto remota caída no debe tumbar la cotización — cae al fallback, pero
    // ahora deja rastro: antes esto era un agujero ciego.
    console.warn("⚠️ Foto remota no descargada:", url, err instanceof Error ? err.message : err);
  }
  photoCache.set(url, { value: result, at: Date.now() });
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
    const photo = await catalogPhoto(photoUrl);
    if (photo) return photo;
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
