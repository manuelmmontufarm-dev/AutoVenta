import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

/**
 * Regresión del 11-ago: el sync en vivo llevaba desde el 7-ago apagado aunque
 * las credenciales estuvieran puestas en Railway.
 *
 * Causa: el Interbot usa sesión firmada (Koa) y el login deja DOS cookies,
 * `interbot.sid` y `interbot.sid.sig`. El código tomaba `headers.get("set-cookie")`
 * y se quedaba con la primera; sin la firma, el Interbot responde
 * «No autenticado» a todo. El síntoma en el log era «Interbot devolvió 0
 * medidas», que apunta al Interbot y no a nosotros — por eso tardó en verse.
 */

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://test@localhost/test";
process.env.INTERBOT_USERNAME = "bot";
process.env.INTERBOT_PASSWORD = "clave";
// Hora 0 para que el barrido no dependa de a qué hora corran las pruebas.
process.env.INTERBOT_SYNC_HOUR = "0";

const {
  __syncLiveForTests, __setPreciosForTests, getInterbotPrice, interbotPricesState,
  refreshPriceForSize, ensureInterbotPricesFresh, forceSyncNow,
} = await import("../src/services/interbotPrices.js");

/** Lo que de verdad manda el Interbot en producción (verificado contra la API). */
const LOGIN_COOKIES = [
  "interbot.sid=abc123; path=/; samesite=lax; secure; httponly",
  "interbot.sid.sig=firma456; path=/; samesite=lax; secure; httponly",
];

const PRODUCTO = {
  codigo: "K246B404",
  marca: "KENDA",
  medida: "165/65R14",
  precioConIva: 43.02,
  pvpFullConIva: 74.19,
  pvpMinConIva: 55.64,
  precioPromoConIva: null,
  tienePromo: false,
};

function respuesta(body: unknown, cookies: string[] = []): Response {
  const headers = new Headers();
  for (const c of cookies) headers.append("set-cookie", c);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status: 200, headers });
}

/** Interbot de mentira: solo responde de verdad si le llegan las DOS cookies. */
function interbotFalso(cookiesDelLogin: string[]) {
  const vistas: string[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    const cookie = String((init?.headers as Record<string, string>)?.Cookie ?? "");
    if (path.endsWith("/api/login")) {
      return respuesta({ ok: true, name: "Ventas Digitales" }, cookiesDelLogin);
    }
    vistas.push(cookie);
    const autenticado = cookie.includes("interbot.sid=") && cookie.includes("interbot.sid.sig=");
    if (!autenticado) return respuesta({ error: "No autenticado" });
    if (path.endsWith("/api/medidas")) return respuesta({ medidas: ["165/65R14"] });
    return respuesta({ productos: [PRODUCTO], medida: "165/65R14" });
  });
  return { fetchMock, vistas };
}

describe("sync en vivo de precios del Interbot", () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    __setPreciosForTests({});
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    __setPreciosForTests(null);
    vi.restoreAllMocks();
  });

  it("manda las dos cookies de sesión, no solo la primera", async () => {
    const { fetchMock, vistas } = interbotFalso(LOGIN_COOKIES);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await __syncLiveForTests();

    expect(vistas.length).toBeGreaterThan(0);
    for (const cookie of vistas) {
      expect(cookie).toContain("interbot.sid=abc123");
      expect(cookie).toContain("interbot.sid.sig=firma456");
    }
  });

  it("con las dos cookies el barrido trae los precios reales", async () => {
    const { fetchMock } = interbotFalso(LOGIN_COOKIES);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await __syncLiveForTests();

    expect(getInterbotPrice("K246B404")?.pvpMinConIva).toBe(55.64);
    expect(interbotPricesState().source).toBe("live");
  });

  it("si la sesión no sirve lo dice, en vez de culpar al Interbot por «0 medidas»", async () => {
    // Solo la cookie de sesión, sin la firma: exactamente el bug viejo.
    const { fetchMock } = interbotFalso([LOGIN_COOKIES[0]!]);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(__syncLiveForTests()).rejects.toThrow(/sesión rechazada/i);
  });

  it("descarta un barrido que trae menos de la mitad que el anterior", async () => {
    __setPreciosForTests(
      Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [
          `COD${i}`,
          { ...PRODUCTO, marca: "KENDA", medida: "165/65R14" },
        ]),
      ),
    );
    const { fetchMock } = interbotFalso(LOGIN_COOKIES);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // El Interbot falso devuelve 1 producto contra los 10 que ya había.
    await expect(__syncLiveForTests()).rejects.toThrow(/se descarta/i);
    expect(interbotPricesState().productos).toBe(10);
  });

  it("cotizar consulta UNA medida, no el barrido de 155", async () => {
    // Reclamo del 12-ago: el barrido cada 15 min dejaba ~15.000 consultas
    // diarias en el Interbot. Confirmar el precio de una cotización tiene que
    // costar una consulta, no el catálogo entero.
    const { fetchMock } = interbotFalso(LOGIN_COOKIES);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const ok = await refreshPriceForSize("165/65R14");

    expect(ok).toBe(true);
    expect(getInterbotPrice("K246B404")?.pvpMinConIva).toBe(55.64);
    // login + chat de esa medida. Nada de /api/medidas ni barrido.
    expect(fetchMock.mock.calls.length).toBe(2);
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/api/medidas"))).toBe(false);
  });

  it("reusa la sesión: la segunda consulta ya no vuelve a loguearse", async () => {
    const { fetchMock } = interbotFalso(LOGIN_COOKIES);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await refreshPriceForSize("165/65R14");
    await refreshPriceForSize("165/65R14");

    const logins = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/api/login")).length;
    expect(logins).toBe(1);
  });

  it("si el Interbot no contesta, no rompe la cotización", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    await expect(refreshPriceForSize("165/65R14")).resolves.toBe(false);
  });

  it("un redeploy el mismo día NO dispara otro barrido", async () => {
    // Antes cada arranque barría: cinco deploys en un día eran cinco barridos
    // de 156 peticiones. Ahora el de la mañana ya corrió y no se repite.
    __setPreciosForTests({ K246B404: { ...PRODUCTO } as never });
    const { fetchMock } = interbotFalso(LOGIN_COOKIES);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await ensureInterbotPricesFresh();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dos días después y sin ser miércoles, NO barre: es semanal", async () => {
    const anteayer = new Date(Date.now() - 2 * 86_400_000);
    __setPreciosForTests({ K246B404: { ...PRODUCTO } as never }, anteayer);
    const { fetchMock } = interbotFalso(LOGIN_COOKIES);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await ensureInterbotPricesFresh();
    await new Promise((r) => setTimeout(r, 10));

    // Solo barrería si hoy fuera el día configurado; con INTERBOT_SYNC_DAY sin
    // poner (miércoles) esto es falso 6 de cada 7 días. La prueba vale para los
    // otros 6; el miércoles la cubre la red de seguridad de abajo.
    const hoyEsMiercoles = new Date().getDay() === 3;
    expect(fetchMock.mock.calls.length > 0).toBe(hoyEsMiercoles);
  });

  it("el botón de Ajustes fuerza el barrido sin esperar al miércoles", async () => {
    const anteayer = new Date(Date.now() - 2 * 86_400_000);
    __setPreciosForTests({ K246B404: { ...PRODUCTO } as never }, anteayer);
    const { fetchMock } = interbotFalso(LOGIN_COOKIES);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const estado = await forceSyncNow();

    expect(fetchMock).toHaveBeenCalled();
    expect(estado.source).toBe("live");
    expect(estado.productos).toBe(1);
  });

  it("si el barrido forzado falla, el botón se entera (lanza)", async () => {
    __setPreciosForTests({ K246B404: { ...PRODUCTO } as never });
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    await expect(forceSyncNow()).rejects.toThrow();
  });

  it("tras 8 días sin barrer, la red de seguridad lo dispara igual", async () => {
    const ayer = new Date(Date.UTC(2020, 0, 1));
    __setPreciosForTests({ K246B404: { ...PRODUCTO } as never }, ayer);
    const { fetchMock } = interbotFalso(LOGIN_COOKIES);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await ensureInterbotPricesFresh();
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchMock).toHaveBeenCalled();
  });
});
