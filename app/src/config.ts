/**
 * Configuración central del bot.
 *
 * Todo lo específico del negocio (Depot Tire) vive en `business`. Para vender
 * el bot a otra llantera solo se cambia este objeto (o se carga desde DB) —
 * el resto del código es genérico.
 */

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function envOr(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function catalogConfigured(): boolean {
  return Boolean(
    process.env.CATALOG_SHEET_ID &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY,
  );
}

function contificoConfigured(): boolean {
  return Boolean(process.env.CONTIFICO_API_KEY);
}

function contificoPriceTier(): "pvp1" | "pvp2" | "pvp3" | "pvp4" {
  const value = envOr("CONTIFICO_CUSTOMER_PVP", "pvp1").toLowerCase();
  if (value === "pvp1" || value === "pvp2" || value === "pvp3" || value === "pvp4") {
    return value;
  }
  throw new Error("CONTIFICO_CUSTOMER_PVP debe ser pvp1, pvp2, pvp3 o pvp4");
}

export interface Store {
  name: string;
  address: string;
  lat: number;
  lng: number;
  mapsUrl?: string;
}

export interface BusinessConfig {
  name: string;
  phone: string;
  schedule: string;
  /** Horario de atención por día (0=domingo…6=sábado), formato HH:mm, o null si cerrado. */
  hours: Record<number, { open: string; close: string } | null>;
  brands: string[];
  promo?: string;
  stores: Store[];
  /** IVA Ecuador (15% desde abr-2024). Los precios del catálogo se asumen SIN IVA. */
  taxRate: number;
  currency: string;
  /**
   * Garantías por marca para las piezas de cotización (clave = marca tal como
   * viene en el catálogo; "default" aplica a las demás).
   */
  warranties: Record<string, { golpesMeses: number; fabricaAnios: number }>;
}

export const business: BusinessConfig = {
  name: "Depot Tire",
  phone: "+593 98 280 1766",
  schedule: "Lunes a sábado, 8:30–17:30",
  hours: {
    0: null,
    1: { open: "08:30", close: "17:30" },
    2: { open: "08:30", close: "17:30" },
    3: { open: "08:30", close: "17:30" },
    4: { open: "08:30", close: "17:30" },
    5: { open: "08:30", close: "17:30" },
    6: { open: "08:30", close: "17:30" },
  },
  brands: ["Kenda", "Sunoco", "Eurolub", "Falken"],
  stores: [
    {
      name: "Depot Tire Cumbayá",
      address: "C.C. La del Establo y Av. Oswaldo Guayasamín, Cumbayá",
      lat: -0.198,
      lng: -78.443,
      mapsUrl: "https://maps.app.goo.gl/QnMBPXKc1o8igbsp8",
    },
    {
      name: "Depot Tire Quito Sur",
      address: "Galo Molina y Av. Alonso de Angulo, Quito",
      lat: -0.2487128,
      lng: -78.5296804,
    },
  ],
  taxRate: 0.15,
  currency: "USD",
  warranties: {
    default: { golpesMeses: 6, fabricaAnios: 5 },
    Kenda: { golpesMeses: 12, fabricaAnios: 5 },
    Falken: { golpesMeses: 18, fabricaAnios: 5 },
  },
};

export const config = {
  port: Number(envOr("PORT", "3000")),

  whatsapp: {
    token: env("WHATSAPP_TOKEN"),
    appSecret: env("WHATSAPP_APP_SECRET"),
    verifyToken: env("WHATSAPP_VERIFY_TOKEN"),
    phoneId: env("WHATSAPP_PHONE_ID"),
    /** Número del vendedor que recibe las alertas (formato internacional sin +). */
    sellerPhone: env("SELLER_PHONE"),
  },

  openai: {
    // GPT-4o mini mantiene el costo bajo para el piloto y soporta function calling.
    model: envOr("OPENAI_MODEL", "gpt-4o-mini"),
    classifierModel: envOr("OPENAI_CLASSIFIER_MODEL", "gpt-4o-mini"),
    apiKey: env("OPENAI_API_KEY"),
    maxTokens: 2048,
  },

  databaseUrl: env("DATABASE_URL"),
  // Railway Postgres (red interna) no usa SSL; Supabase/proxy público sí → PGSSL=require
  pgSsl: process.env.PGSSL === "require",

  // Contífico es la fuente primaria del cotizador. La API Key solo se usa en
  // servidor; nunca se expone al Hub ni se incluye en respuestas.
  contifico: contificoConfigured()
    ? {
        apiKey: env("CONTIFICO_API_KEY"),
        baseUrl: envOr(
          "CONTIFICO_BASE_URL",
          "https://api.contifico.com/sistema/api/v2",
        ).replace(/\/$/, ""),
        customerPriceTier: contificoPriceTier(),
        // Interbot observado: distribuidor = base + IVA; mínimo = distribuidor
        // / 0.75; PVP cliente = distribuidor / 0.5625. Ajustable sin tocar código.
        customerPriceDivisor: Number(
          envOr("CONTIFICO_CUSTOMER_PRICE_DIVISOR", "0.5625"),
        ),
        minimumPriceDivisor: Number(
          envOr("CONTIFICO_MINIMUM_PRICE_DIVISOR", "0.75"),
        ),
        syncIntervalMs: Number(
          envOr("CONTIFICO_CATALOG_SYNC_INTERVAL_MS", String(5 * 60_000)),
        ),
      }
    : null,

  // Catálogo opcional: el bot puede desplegarse y levantar el webhook aunque el
  // catálogo aún no esté conectado (bloqueo #1). Si faltan las credenciales de
  // Sheets, el sync se salta y el agente responde sin precios hasta que se conecte.
  catalog: catalogConfigured()
    ? {
        sheetId: env("CATALOG_SHEET_ID"),
        serviceAccountEmail: env("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
        // Railway guarda los saltos de línea como \n literales
        privateKey: env("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
        syncIntervalMs: Number(envOr("CATALOG_SYNC_INTERVAL_MS", String(5 * 60_000))),
      }
    : null,

  pipeline: {
    /** Espera tras el último mensaje antes de responder (la gente escribe en ráfagas). */
    debounceMs: Number(envOr("DEBOUNCE_MS", "5000")),
    /** Cuánto se silencia el bot en un chat cuando el dueño responde a mano. */
    botPauseHours: Number(envOr("BOT_PAUSE_HOURS", "6")),
  },
} as const;
