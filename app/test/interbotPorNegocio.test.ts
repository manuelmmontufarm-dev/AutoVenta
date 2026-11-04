/**
 * INTERBOT SOLO PARA QUIEN LO TIENE (R-23).
 *
 * Hasta el 4-nov `interbotPrices.ts` cargaba `assets/precios-interbot.json`
 * SIEMPRE, y `applyInterbotPrices` pisaba precios por código. Si un código de
 * Fénix coincidía con uno de Depot, Mundillantas cotizaba el precio de Depot.
 * Ahora el snapshot vive en `assets/depot/` y otro negocio no lo ve.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";
process.env.DATABASE_URL = "postgresql://nadie@127.0.0.1:1/nada";

const SNAPSHOT_DEPOT = fileURLToPath(new URL("../assets/depot/precios-interbot.json", import.meta.url));
const snapshot = JSON.parse(readFileSync(SNAPSHOT_DEPOT, "utf8")) as { productos: Record<string, { pvpMinConIva: number }> };
/** Un código que existe en el snapshot de Depot. */
const CODIGO = Object.keys(snapshot.productos)[0];

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  vi.resetModules();
  delete process.env.NEGOCIO;
  delete process.env.INTERBOT_USERNAME;
  delete process.env.INTERBOT_PASSWORD;
  globalThis.fetch = fetchOriginal;
});

async function conNegocio(id: string | null) {
  vi.resetModules();
  if (id) process.env.NEGOCIO = id;
  else delete process.env.NEGOCIO;
  return import("../src/services/interbotPrices.js");
}

const itemConCodigo = (code: string, precio: number): CatalogItem => ({
  id: code, code, name: `LLANTA ${code}`, brand: "X", design: "Y",
  size: { width: 205, aspect: 55, rim: 16 }, sizeLabel: "205/55R16",
  price: precio, sourcePrice: precio, priceTier: "pvp1",
  prices: { pvp1: precio, pvp2: null, pvp3: null, pvp4: null },
  taxRate: 0.15, customerPriceWithTax: precio * 1.15, minimumPriceWithTax: precio * 1.15,
  distributorPriceWithTax: precio * 1.15, stock: 4, availability: "available",
  imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "archivo",
});

describe("Depot (NEGOCIO sin definir) sigue con su snapshot", () => {
  it("getInterbotPrice encuentra el código de su snapshot", async () => {
    const ib = await conNegocio(null);
    expect(ib.interbotDisponible()).toBe(true);
    expect(ib.getInterbotPrice(CODIGO)?.pvpMinConIva).toBe(snapshot.productos[CODIGO].pvpMinConIva);
  });
});

describe("con NEGOCIO=ejemplo no hay Interbot", () => {
  it("getInterbotPrice → null aunque el código exista en el snapshot de Depot", async () => {
    const ib = await conNegocio("ejemplo");
    expect(ib.interbotDisponible()).toBe(false);
    expect(ib.getInterbotPrice(CODIGO)).toBeNull();
  });

  it("un código que existe en el snapshot de Depot cotiza el precio del catálogo propio", async () => {
    await conNegocio("ejemplo");
    const { applyInterbotPrices } = await import("../src/services/catalog.js");
    const item = itemConCodigo(CODIGO, 50);
    const antes = { ...item };
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(applyInterbotPrices([item])).toBe(0);
    // Sin el «💲 Precios Interbot aplicados» en el log: no hay nada que aplicar.
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
    expect(item).toEqual(antes);
  });

  it("refrescar, asegurar frescura y barrer no hacen nada — ni red ni log", async () => {
    process.env.INTERBOT_USERNAME = "u";
    process.env.INTERBOT_PASSWORD = "p";
    const ib = await conNegocio("ejemplo");
    const llamadas: string[] = [];
    globalThis.fetch = (async (url: URL | string) => {
      llamadas.push(String(url));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await ib.refreshPriceForSize("205/55R16")).toBe(false);
    await ib.ensureInterbotPricesFresh();
    expect(llamadas).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(ib.interbotPricesState().source).toBe("none");
  });
});
