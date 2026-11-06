/**
 * Cada foto del catálogo tiene que poder DECODIFICARSE, no solo existir.
 *
 * El 6-ago Joaquín mandó la pieza de 245/65R17 con la tarjeta de la Kenda KR50
 * en blanco: el archivo estaba ahí y pesaba 1,1 MB, pero era un JPEG guardado
 * como `.png`. El motor deducía el tipo por la extensión, resvg recibía
 * `data:image/png` con bytes de JPEG y no dibujaba nada. Una llanta invisible
 * en la pieza es una opción que el cliente no compra.
 *
 * Por eso el chequeo no mira nombres: lee los bytes de cada archivo del
 * manifiesto y exige una firma de imagen reconocida.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

process.env.WHATSAPP_TOKEN ??= "x";
process.env.WHATSAPP_APP_SECRET ??= "x";
process.env.WHATSAPP_VERIFY_TOKEN ??= "x";
process.env.WHATSAPP_PHONE_ID ??= "x";
process.env.SELLER_PHONE ??= "x";
process.env.OPENAI_API_KEY ??= "x";
process.env.DATABASE_URL ??= "postgres://x/x";

const { sniffImageMime } = await import("../src/render/assets.js");
const catalogMedia = await import("../src/domain/catalogMedia.js");

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../site");

/** Rutas públicas declaradas en el manifiesto, sin repetir. */
function rutasDelManifiesto(): string[] {
  const fuente = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/domain/catalogMedia.ts"),
    "utf8",
  );
  const rutas = [...fuente.matchAll(/publicUrl:\s*"([^"]+)"/g)].map((m) => m[1]);
  return [...new Set(rutas)];
}

describe("Fotos del catálogo", () => {
  it("el manifiesto resuelve y trae rutas", () => {
    expect(catalogMedia.resolveCatalogMedia("KENDA", "KR50")?.publicUrl).toBe(
      "/assets/catalog/kenda-kr50.png",
    );
    expect(rutasDelManifiesto().length).toBeGreaterThan(10);
  });

  it("todas existen y tienen una firma de imagen que resvg sabe leer", () => {
    const faltantes: string[] = [];
    const ilegibles: string[] = [];

    for (const ruta of rutasDelManifiesto()) {
      const archivo = path.join(SITE, ruta.replace(/^\/+/, ""));
      if (!existsSync(archivo)) {
        faltantes.push(ruta);
        continue;
      }
      if (!sniffImageMime(readFileSync(archivo))) ilegibles.push(ruta);
    }

    expect(faltantes, `fotos del manifiesto que no están en disco: ${faltantes.join(", ")}`).toEqual([]);
    expect(ilegibles, `fotos sin firma de imagen reconocible: ${ilegibles.join(", ")}`).toEqual([]);
  });

  it("Mundillantas: la foto se busca por el modelo en el nombre, y la extensión dice la verdad", () => {
    expect(catalogMedia.resolveCatalogMediaPorNombre("HAIDA", "HAIDA 235/75R15LT AT HD828 LN 6PR")?.publicUrl).toBe(
      "/assets/catalog/haida-hd828.jpg",
    );
    expect(catalogMedia.resolveCatalogMediaPorNombre("TOURADOR", "TOURADOR 225/65R17 FORCE A/T 102T X")?.publicUrl).toBe(
      "/assets/catalog/tourador-x-force-at.jpg",
    );
    expect(catalogMedia.resolveCatalogMediaPorNombre("TOURADOR", "TOURADOR 265/65R17 FORCE AT II LB")?.publicUrl).toBe(
      "/assets/catalog/tourador-x-force-at-ii.jpg",
    );
    // La marca manda: el ALL TERRAIN de Sumaxx no es el de BFGoodrich.
    expect(catalogMedia.resolveCatalogMediaPorNombre("SUMAXX", "SUMAXX 255/70R16 ALL TERRAIN LB")?.publicUrl).toBe(
      "/assets/catalog/sumaxx-all-terrain-at.jpg",
    );
    expect(catalogMedia.resolveCatalogMediaPorNombre("HAIDA", "HAIDA 205/55R16 HD999")).toBeNull();
    // El PDF elige el tipo por la extensión (`localImageData`): en estas no puede mentir.
    const mienten = catalogMedia.FOTOS_POR_MODELO.filter((f) => {
      const mime = sniffImageMime(readFileSync(path.join(SITE, f.publicUrl.replace(/^\/+/, ""))));
      return mime !== (f.publicUrl.endsWith(".png") ? "image/png" : "image/jpeg");
    }).map((f) => f.publicUrl);
    expect(mienten).toEqual([]);
  });

  it("reconoce el formato por los bytes, no por el nombre del archivo", () => {
    const jpeg = readFileSync(path.join(SITE, "assets/catalog/kenda-kr50.png"));
    // Se llama .png y es un JPEG: lo que importa es que salga "image/jpeg".
    expect(sniffImageMime(jpeg)).toBe("image/jpeg");

    const png = readFileSync(path.join(SITE, "assets/catalog/falken-wildpeak-at4w.png"));
    expect(sniffImageMime(png)).toBe("image/png");

    expect(sniffImageMime(Buffer.from("no soy una imagen"))).toBeNull();
  });
});
