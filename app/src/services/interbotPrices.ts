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
 * assets/precios-interbot.json. La fórmula vieja queda como último recurso solo
 * para códigos que el Interbot no tenga.
 *
 * Orden de preferencia al arrancar: último sync bueno guardado en la base >
 * snapshot de fábrica. Sin eso, cada reinicio volvía a los precios del 7-ago
 * aunque el sync llevara semanas corriendo bien.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { sql } from "../db/client.js";

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
  /** `db` = último sync bueno rescatado de la base tras un reinicio. */
  source: "live" | "db" | "snapshot" | "none";
  at: Date | null;
  productos: number;
  lastError: string | null;
}

/** Clave en `settings` donde se guarda el último barrido bueno. */
const SETTINGS_KEY = "interbot_precios";

/**
 * Un fallo no debe reintentar el barrido completo en cada mensaje (castiga al
 * Interbot y alarga la respuesta al cliente), pero tampoco esperar los 15 min
 * completos: una caída de un minuto dejaría los precios viejos un cuarto de hora.
 */
const RETRY_TRAS_FALLO_MS = 2 * 60_000;

/** Peticiones simultáneas del barrido. Son ~155 medidas; de a una tomaba ~30 s. */
const CONCURRENCIA = 5;

let precios: Map<string, InterbotPrice> = new Map();
let state: InterbotSyncState = { source: "none", at: null, productos: 0, lastError: null };
let nextLiveAttemptAt = 0;
let syncInFlight: Promise<void> | null = null;
let persistedLoaded = false;

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

/**
 * Rescata de la base el último barrido bueno. Se usa una sola vez por proceso y
 * solo si es más nuevo que lo que ya hay en memoria: tras un redeploy los
 * precios siguen siendo los de hace minutos, no los del snapshot de fábrica.
 */
async function loadPersisted(): Promise<void> {
  if (persistedLoaded) return;
  persistedLoaded = true;
  try {
    const [row] = await sql<{ value: Snapshot | null }[]>`
      select value from settings where key = ${SETTINGS_KEY}
    `;
    const guardado = row?.value;
    if (!guardado?.productos || !guardado.capturadoEn) return;
    const at = new Date(guardado.capturadoEn);
    if (Number.isNaN(at.getTime())) return;
    if (state.at && at <= state.at) return;
    const entries = Object.entries(guardado.productos);
    if (!entries.length) return;
    precios = new Map(entries);
    state = { source: "db", at, productos: precios.size, lastError: state.lastError };
    console.log(
      `💲 Precios Interbot rescatados de la base: ${precios.size} productos (${at.toISOString()})`,
    );
  } catch (error) {
    // Nunca es fatal: si la base no responde, queda el snapshot de fábrica.
    console.warn(
      "⚠️ No se pudo leer el último sync de precios guardado:",
      error instanceof Error ? error.message : error,
    );
  }
}

async function persist(at: Date): Promise<void> {
  try {
    const value: Snapshot = {
      capturadoEn: at.toISOString(),
      fuente: "sync-en-vivo",
      productos: Object.fromEntries(precios),
    };
    await sql`
      insert into settings (key, value) values (${SETTINGS_KEY}, ${sql.json(value as never)})
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `;
  } catch (error) {
    console.warn(
      "⚠️ No se pudo guardar el sync de precios:",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * El Interbot usa sesión firmada (Koa): el login deja `interbot.sid` **y**
 * `interbot.sid.sig`. Mandar solo la primera devuelve «No autenticado», y el
 * barrido moría con «0 medidas» sin decir por qué — el bug que dejó el sync en
 * vivo apagado desde el 7-ago aunque las credenciales estuvieran puestas.
 */
function collectCookies(headers: Headers): string | null {
  const raw =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : ((headers.get("set-cookie") ?? "").split(/,(?=[^;]+?=)/g).filter(Boolean));
  const pares = raw
    .map((c) => c.split(";")[0]?.trim())
    .filter((c): c is string => Boolean(c && c.includes("=")));
  return pares.length ? pares.join("; ") : null;
}

async function fetchJson(
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<{ status: number; json: unknown; cookies: string | null }> {
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
  return { status: response.status, json, cookies: collectCookies(response.headers) };
}

/** Corre `tarea` sobre `items` con un tope de peticiones simultáneas. */
async function enParalelo<T>(
  items: readonly T[],
  limite: number,
  tarea: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const obreros = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item !== undefined) await tarea(item);
    }
  });
  await Promise.all(obreros);
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
  const cookie = login.cookies;
  if (login.status !== 200 || !cookie) {
    throw new Error(`login Interbot falló (HTTP ${login.status})`);
  }

  const medidasRes = await fetchJson("/api/medidas", { cookie });
  // Distinguir «la sesión no sirve» de «no hay medidas»: con el bug de la cookie
  // los dos casos se veían igual en el log y costó una semana encontrarlo.
  const authError = (medidasRes.json as { error?: string } | null)?.error;
  if (medidasRes.status === 401 || authError) {
    throw new Error(`sesión rechazada por el Interbot (${authError ?? medidasRes.status})`);
  }
  const rawMedidas = Array.isArray(medidasRes.json)
    ? medidasRes.json
    : ((medidasRes.json as { medidas?: unknown[] } | null)?.medidas ?? []);
  const medidas = rawMedidas
    .map((m) => (typeof m === "string" ? m : String((m as { medida?: unknown })?.medida ?? "")))
    .filter(Boolean);
  if (!medidas.length) throw new Error("Interbot devolvió 0 medidas");

  const next = new Map<string, InterbotPrice>();
  let medidasFallidas = 0;
  await enParalelo(medidas, CONCURRENCIA, async (medida) => {
    let res;
    try {
      res = await fetchJson("/api/chat", {
        method: "POST",
        cookie,
        body: JSON.stringify({ mensaje: medida }),
      });
    } catch {
      // Una medida que falla no puede tumbar el barrido entero; el guardia de
      // abajo se encarga si fallaron tantas que el resultado no es confiable.
      medidasFallidas += 1;
      return;
    }
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
  });

  // Un barrido que trae muchísimo menos que el anterior huele a fallo parcial
  // (sesión caída a mitad, deploy del Interbot): mejor conservar lo conocido.
  if (precios.size > 0 && next.size < precios.size * 0.5) {
    throw new Error(`sync trajo ${next.size} productos (antes ${precios.size}); se descarta`);
  }

  const cambios = contarCambios(precios, next);
  const at = new Date();
  precios = next;
  state = { source: "live", at, productos: next.size, lastError: null };
  console.log(
    `💲 Sync Interbot en vivo: ${next.size} productos de ${medidas.length} medidas` +
      `${cambios ? `, ${cambios} con precio distinto` : ", sin cambios de precio"}` +
      `${medidasFallidas ? ` (${medidasFallidas} medidas fallaron)` : ""}`,
  );
  await persist(at);
}

function contarCambios(
  antes: Map<string, InterbotPrice>,
  despues: Map<string, InterbotPrice>,
): number {
  let n = 0;
  for (const [codigo, nuevo] of despues) {
    const viejo = antes.get(codigo);
    if (viejo && viejo.pvpMinConIva !== nuevo.pvpMinConIva) n += 1;
  }
  return n;
}

/**
 * Garantiza precios frescos. Nunca lanza: si el vivo falla se queda el último
 * snapshot bueno (o el de fábrica) y el error queda en el estado.
 *
 * No bloquea al cliente: mientras haya precios en memoria el refresco corre en
 * segundo plano. Antes se esperaba el barrido completo, así que el primer
 * mensaje tras 15 min de calma pagaba ~30 s de espera antes de recibir respuesta.
 */
export async function ensureInterbotPricesFresh(): Promise<void> {
  if (precios.size === 0) {
    loadSnapshot();
    await loadPersisted();
  }
  if (!config.interbot) return;
  if (Date.now() < nextLiveAttemptAt) return;
  if (!syncInFlight) {
    // Se marca el próximo intento ANTES de arrancar: si el barrido tarda, los
    // mensajes que entren mientras tanto no encolan otro.
    nextLiveAttemptAt = Date.now() + config.interbot.syncIntervalMs;
    syncInFlight = syncLive()
      .catch((error) => {
        const msg = error instanceof Error ? error.message : String(error);
        state.lastError = msg;
        nextLiveAttemptAt = Date.now() + RETRY_TRAS_FALLO_MS;
        console.warn(`⚠️ Sync de precios Interbot falló (${msg}); se mantiene ${state.source}`);
      })
      .finally(() => {
        syncInFlight = null;
      });
  }
  // Solo se espera cuando no hay NADA que cotizar; con precios en mano, el
  // refresco no debe retrasar la respuesta al cliente.
  if (precios.size === 0) await syncInFlight;
}

export function getInterbotPrice(codigo: string): InterbotPrice | null {
  if (precios.size === 0) loadSnapshot();
  return precios.get(codigo) ?? null;
}

export function interbotPricesState(): InterbotSyncState {
  return { ...state };
}

/** Solo para pruebas: corre un barrido contra el `fetch` que la prueba haya puesto. */
export async function __syncLiveForTests(): Promise<void> {
  await syncLive();
}

/** Solo para pruebas: fija el mapa sin tocar red ni disco. */
export function __setPreciosForTests(map: Record<string, InterbotPrice> | null): void {
  precios = map ? new Map(Object.entries(map)) : new Map();
  state = map
    ? { source: "live", at: new Date(), productos: precios.size, lastError: null }
    : { source: "none", at: null, productos: 0, lastError: null };
}
