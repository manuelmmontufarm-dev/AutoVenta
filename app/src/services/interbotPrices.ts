/**
 * Precios reales desde el Interbot (el sistema que ven los vendedores).
 *
 * Por qué existe (7-ago): el bot reconstruía el precio de venta desde el costo
 * de Contífico con divisores fijos «observados» (÷0.75 y ÷0.5625 = margen 33%).
 * Al cruzar las 362 llantas presentes en ambos sistemas resultó que el Interbot
 * NO usa una fórmula: hay 32 grupos de factores distintos (×1.0 a ×1.7) puestos
 * producto por producto — la regla del 33% solo cubre el 27% del catálogo. La
 * RT01 315/70R17 que reclamó Depot ($502.16 vs $489.14) está en el grupo ×1.2987.
 * Ninguna fórmula reproduce eso: hay que LEER el precio, no calcularlo.
 *
 * Fuente en vivo: POST /api/login → GET /api/medidas → POST /api/chat por medida
 * (el mismo endpoint que usa el buscador del Interbot). Si no hay credenciales o
 * el sync falla, se usa el último snapshot bueno; de fábrica viene uno en
 * assets/precios-interbot.json (capturado 7-ago). La fórmula vieja queda como
 * último recurso solo para códigos que el Interbot no tenga.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

export interface InterbotPrice {
  marca: string;
  medida: string;
  /** Costo con IVA según el Interbot (verificado: = pvp1 de Contífico × 1.15). */
  costoConIva: number;
  /** PVP «antes» (tachado). En todo el catálogo = pvpMin ÷ 0.75. */
  pvpFullConIva: number;
  /** Precio de venta real al cliente (el que ve el vendedor). */
  pvpMinConIva: number;
  precioPromoConIva: number | null;
  tienePromo: boolean;
}

interface Snapshot {
  capturadoEn: string;
  fuente: string;
  productos: Record<string, InterbotPrice>;
}

export interface InterbotSyncState {
  source: "live" | "snapshot" | "none";
  at: Date | null;
  productos: number;
  lastError: string | null;
}

let precios: Map<string, InterbotPrice> = new Map();
let state: InterbotSyncState = { source: "none", at: null, productos: 0, lastError: null };
let lastLiveSyncAt = 0;
let syncInFlight: Promise<void> | null = null;

const snapshotPath = fileURLToPath(
  new URL("../../assets/precios-interbot.json", import.meta.url),
);

function loadSnapshot(): void {
  try {
    const parsed = JSON.parse(readFileSync(snapshotPath, "utf8")) as Snapshot;
    precios = new Map(Object.entries(parsed.productos));
    state = {
      source: "snapshot",
      at: new Date(parsed.capturadoEn),
      productos: precios.size,
      lastError: state.lastError,
    };
  } catch (error) {
    console.warn(
      "⚠️ No se pudo cargar el snapshot de precios de Interbot:",
      error instanceof Error ? error.message : error,
    );
  }
}

async function fetchJson(
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<{ status: number; json: unknown; setCookie: string | null }> {
  if (!config.interbot) throw new Error("Interbot no configurado");
  const { cookie, ...rest } = init;
  const response = await fetch(`${config.interbot.baseUrl}${path}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...rest.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    /* respuestas no-JSON (p. ej. HTML de login) se tratan como null */
  }
  return { status: response.status, json, setCookie: response.headers.get("set-cookie") };
}

async function syncLive(): Promise<void> {
  if (!config.interbot) throw new Error("Interbot no configurado");

  const login = await fetchJson("/api/login", {
    method: "POST",
    body: JSON.stringify({
      username: config.interbot.username,
      password: config.interbot.password,
    }),
  });
  const cookie = login.setCookie?.split(";")[0] ?? null;
  if (login.status !== 200 || !cookie) {
    throw new Error(`login Interbot falló (HTTP ${login.status})`);
  }

  const medidasRes = await fetchJson("/api/medidas", { cookie });
  const rawMedidas = Array.isArray(medidasRes.json)
    ? medidasRes.json
    : ((medidasRes.json as { medidas?: unknown[] } | null)?.medidas ?? []);
  const medidas = rawMedidas
    .map((m) => (typeof m === "string" ? m : String((m as { medida?: unknown })?.medida ?? "")))
    .filter(Boolean);
  if (!medidas.length) throw new Error("Interbot devolvió 0 medidas");

  const next = new Map<string, InterbotPrice>();
  for (const medida of medidas) {
    const res = await fetchJson("/api/chat", {
      method: "POST",
      cookie,
      body: JSON.stringify({ mensaje: medida }),
    });
    const productos = ((res.json as { productos?: unknown[] } | null)?.productos ?? []) as Array<
      Record<string, unknown>
    >;
    for (const p of productos) {
      const codigo = String(p.codigo ?? "");
      const pvpMin = Number(p.pvpMinConIva);
      if (!codigo || !Number.isFinite(pvpMin) || pvpMin <= 0) continue;
      next.set(codigo, {
        marca: String(p.marca ?? ""),
        medida: String(p.medida ?? ""),
        costoConIva: Number(p.precioConIva) || 0,
        pvpFullConIva: Number(p.pvpFullConIva) || 0,
        pvpMinConIva: pvpMin,
        precioPromoConIva: Number(p.precioPromoConIva) > 0 ? Number(p.precioPromoConIva) : null,
        tienePromo: Boolean(p.tienePromo),
      });
    }
  }

  // Un barrido que trae muchísimo menos que el anterior huele a fallo parcial
  // (sesión caída a mitad, deploy del Interbot): mejor conservar lo conocido.
  if (precios.size > 0 && next.size < precios.size * 0.5) {
    throw new Error(`sync trajo ${next.size} productos (antes ${precios.size}); se descarta`);
  }

  precios = next;
  state = { source: "live", at: new Date(), productos: next.size, lastError: null };
}

/**
 * Garantiza precios frescos. Nunca lanza: si el vivo falla se queda el último
 * snapshot bueno (o el de fábrica) y el error queda en el estado.
 */
export async function ensureInterbotPricesFresh(): Promise<void> {
  if (precios.size === 0) loadSnapshot();
  if (!config.interbot) return;
  const stale = Date.now() - lastLiveSyncAt > config.interbot.syncIntervalMs;
  if (!stale) return;
  if (!syncInFlight) {
    syncInFlight = syncLive()
      .then(() => {
        lastLiveSyncAt = Date.now();
      })
      .catch((error) => {
        // El intento fallido también marca tiempo: sin esto, un Interbot caído
        // haría reintentar el barrido completo en cada sync del catálogo.
        lastLiveSyncAt = Date.now();
        state.lastError = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️ Sync de precios Interbot falló (${state.lastError}); se mantiene ${state.source}`);
      })
      .finally(() => {
        syncInFlight = null;
      });
  }
  await syncInFlight;
}

export function getInterbotPrice(codigo: string): InterbotPrice | null {
  if (precios.size === 0) loadSnapshot();
  return precios.get(codigo) ?? null;
}

export function interbotPricesState(): InterbotSyncState {
  return { ...state };
}

/** Solo para pruebas: fija el mapa sin tocar red ni disco. */
export function __setPreciosForTests(map: Record<string, InterbotPrice> | null): void {
  precios = map ? new Map(Object.entries(map)) : new Map();
  state = map
    ? { source: "live", at: new Date(), productos: precios.size, lastError: null }
    : { source: "none", at: null, productos: 0, lastError: null };
}
