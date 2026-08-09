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

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
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

  // Credenciales de WhatsApp opcionales en el entorno: el dueño puede pegarlas
  // desde el panel (Ajustes → Canal), que se guarda en DB y gana sobre el
  // entorno (ver services/channel.ts). El bot arranca sin ellas y levanta el
  // webhook; solo no responde por WhatsApp hasta que el canal esté configurado.
  whatsapp: {
    token: envOr("WHATSAPP_TOKEN", ""),
    appSecret: envOr("WHATSAPP_APP_SECRET", ""),
    verifyToken: envOr("WHATSAPP_VERIFY_TOKEN", ""),
    phoneId: envOr("WHATSAPP_PHONE_ID", ""),
    /** Número del vendedor que recibe las alertas (formato internacional sin +).
     * Opcional: cada cliente lo pone desde el panel (Canal de WhatsApp). */
    sellerPhone: envOr("SELLER_PHONE", ""),
    /** Nombre visible del asesor principal de staging. */
    sellerName: envOr("SELLER_NAME", "Manuel Montúfar"),
    /**
     * Host de la Graph API. Solo se cambia para pruebas de carga, donde se
     * apunta a un stub local y así ningún mensaje sintético sale a Meta.
     * En producción NUNCA se define: el default es el host real.
     */
    graphBaseUrl: envOr("GRAPH_BASE_URL", "https://graph.facebook.com/v21.0")
      .replace(/\/$/, ""),
  },

  hub: {
    /**
     * Base de los links que el bot le manda al asesor por WhatsApp.
     *
     * El default NO puede ser una URL fija: cada cliente corre su propio deploy
     * y un default de staging manda al asesor de Depot a un panel que no es el
     * suyo — el ticket existe, pero en otra base de datos, así que el link
     * abre en vacío. Railway expone el dominio del propio servicio en
     * RAILWAY_PUBLIC_DOMAIN, así que cada deploy se apunta a sí mismo sin que
     * nadie tenga que acordarse de configurar nada. Solo se usa el literal de
     * staging cuando no hay ninguna de las dos (correr local).
     */
    publicUrl: envOr(
      "HUB_PUBLIC_URL",
      process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/admin`
        : "https://autoventa-staging.up.railway.app/admin",
    ).replace(/\/$/, ""),
  },

  openai: {
    // Arquitectura de modelos (7-ago): el loop conversacional usa `model`; los
    // ANÁLISIS (visión, investigación, escalación) pueden usar modelos superiores
    // sin encarecer el turno común — son pocas llamadas donde la capacidad rinde.
    // Los defaults NO cambian el comportamiento actual: la potencia se activa
    // poniendo las variables en Railway, previa validación contra /v1/models
    // (un ID mal escrito tumbaría al bot con 400 en cada mensaje).
    model: envOr("OPENAI_MODEL", "gpt-4o-mini"),
    /**
     * Modelo de primera ronda para tareas rutinarias post-cotización. En
     * producción empieza igual al principal: permite bajar por etapa después
     * de validar la tasa de éxito, sin volver a desplegar código.
     */
    routineModel: envOr("OPENAI_ROUTINE_MODEL", envOr("OPENAI_MODEL", "gpt-4o-mini")),
    classifierModel: envOr("OPENAI_CLASSIFIER_MODEL", "gpt-4o-mini"),
    researchModel: envOr("OPENAI_RESEARCH_MODEL", envOr("OPENAI_MODEL", "gpt-4o-mini")),
    /** Lee fotos del cliente (medida en el costado, etiqueta de la puerta). */
    visionModel: envOr("OPENAI_VISION_MODEL", envOr("OPENAI_MODEL", "gpt-4o-mini")),
    /** Transcribe los audios de WhatsApp. */
    transcribeModel: envOr("OPENAI_TRANSCRIBE_MODEL", "whisper-1"),
    /**
     * Modelo de rescate: entra cuando el principal se atascó (iteraciones
     * tardías del loop y la llamada de rescate). Hoy el rescate usa el MISMO
     * modelo que ya falló 8 veces — con esta variable, escala a uno superior.
     */
    escalationModel: envOr("OPENAI_ESCALATION_MODEL", envOr("OPENAI_MODEL", "gpt-4o-mini")),
    apiKey: env("OPENAI_API_KEY"),
    // Se envía como `max_completion_tokens` (NO `max_tokens`): la familia GPT-5
    // rechaza el parámetro viejo con 400 «Unsupported parameter», y el nuevo lo
    // aceptan tanto GPT-5 como GPT-4o. Lo cazó el replay del 7-ago: 461/461
    // turnos fallaron al probar gpt-5.4 antes de tocar producción.
    maxTokens: 2048,
    /** Límite del loop normal; siempre queda una llamada final de rescate. */
    maxToolIterations: Math.max(1, Number(envOr("AI_MAX_TOOL_ITERATIONS", "8"))),
    historyLimit: Math.max(4, Number(envOr("AI_HISTORY_LIMIT", "30"))),
    compactPromptEnabled: envBoolean("AI_COMPACT_PROMPT_ENABLED", false),
    directSalesRoutesEnabled: envBoolean("DIRECT_SALES_ROUTES_ENABLED", false),
  },

  vehicleFitment: {
    wheelSizeApiKey: process.env.WHEELSIZE_API_KEY ?? null,
  },

  // Interbot: la fuente del PRECIO DE VENTA real (el que ve el vendedor).
  // Contífico solo trae el costo; los precios del Interbot se ponen producto
  // por producto y no siguen ninguna fórmula (ver services/interbotPrices.ts).
  // Sin credenciales, el bot usa el snapshot de assets/precios-interbot.json.
  interbot:
    process.env.INTERBOT_USERNAME && process.env.INTERBOT_PASSWORD
      ? {
          baseUrl: envOr(
            "INTERBOT_BASE_URL",
            "https://interbot-production.up.railway.app",
          ).replace(/\/$/, ""),
          username: env("INTERBOT_USERNAME"),
          password: env("INTERBOT_PASSWORD"),
          // 15 min: el barrido son ~155 requests al Interbot; más seguido sería
          // castigar su servidor sin ganancia (los precios no cambian por minuto).
          syncIntervalMs: Number(
            envOr("INTERBOT_SYNC_INTERVAL_MS", String(15 * 60_000)),
          ),
        }
      : null,

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
    /**
     * Tope global de handlers en vuelo. El FIFO por usuario no limita nada
     * cuando escriben N clientes a la vez: N llamadas simultáneas al LLM →
     * rate limit de OpenAI → el cliente ve el mensaje de error. Con el tope,
     * los excedentes esperan en cola (responden un poco más tarde) en vez de
     * fallar.
     */
    maxConcurrent: Number(envOr("PIPELINE_MAX_CONCURRENT", "6")),
  },
} as const;
