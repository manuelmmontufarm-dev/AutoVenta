/**
 * Las variables REALES del servicio de Depot, leídas de Railway.
 *
 * Los modelos y los interruptores de comportamiento del bot no viven en el
 * repo ni en `app/.env`: viven en las variables del servicio. Y se separan sin
 * que nadie se entere — medido el 26-ago-2026: el `.env` del portátil decía
 * `gpt-5.4` mientras Depot llevaba días en `gpt-5.5`, y `AI_COMPACT_PROMPT_ENABLED`
 * (que cambia el prompt ENTERO del vendedor) estaba prendido allá y apagado
 * acá. Un simulador con otro prompt y otro modelo no simula nada.
 *
 * Así que se leen del origen. Con dos candados:
 *
 *  1. LISTA BLANCA. Solo cruzan variables de COMPORTAMIENTO (modelos,
 *     interruptores, divisores de precio). Ni una credencial: las claves, los
 *     tokens de Meta y la DATABASE_URL de producción no tienen nada que hacer
 *     en un simulador, que además las reemplaza por las suyas.
 *
 *  2. AVISO DE DERIVA. Toda variable de producción que no esté ni en la lista
 *     blanca ni en la de ignoradas se reporta. Es el detector de que alguien
 *     agregó un interruptor nuevo allá y el simulador dejó de ser fiel — que
 *     es exactamente la forma en que una herramienta así se pudre en silencio.
 */
import { execFileSync } from "node:child_process";

/** Comportamiento del bot: esto SÍ cruza. */
export const LISTA_BLANCA = [
  // Los modelos, uno por uno y no `^OPENAI_`: ese prefijo también cubre las
  // claves, y una lista blanca que puede tragarse una credencial no es una
  // lista blanca.
  /^OPENAI_(MODEL|ROUTINE_MODEL|CLASSIFIER_MODEL|RESEARCH_MODEL|VISION_MODEL|ESCALATION_MODEL|TRANSCRIBE_MODEL|EVAL_MODEL|GUARDIAN_MODEL|EXACT_TOOL_MODEL)$/,
  // Los interruptores del agente: prompt compacto, historia que ve, vueltas de
  // herramientas, porcentaje del canary.
  /^AI_[A-Z_]+$/,
  // Cómo se calcula el precio que se le firma al cliente.
  /^CONTIFICO_(CUSTOMER_PVP|CUSTOMER_PRICE_DIVISOR|MINIMUM_PRICE_DIVISOR)$/,
  // Cuánto se calla el bot tras un asesor, si nace prendido, cómo se llama el
  // vendedor en los textos, y las rutas de venta directa.
  /^(DIRECT_SALES_ROUTES_ENABLED|PHASES_DEFAULT|DEBOUNCE_MS|BOT_PAUSE_HOURS|BOT_POWER_DEFAULT|BOT_POWER_CACHE_MS|SELLER_NAME|PIPELINE_MAX_CONCURRENT)$/,
  // El worker de seguimientos: cada cuánto despierta y cuántos toma.
  /^FOLLOW_UP_(BATCH_SIZE|LEASE_MINUTES|POLL_MS)$/,
  // Los números que el hub muestra como facturación.
  /^BILLING_[A-Z_]+$/,
];

/** Credenciales e infraestructura: esto NUNCA cruza, y no es deriva. */
export const IGNORADAS = [
  /KEY$/, /TOKEN$/, /SECRET$/, /PASSWORD$/, /_URL$/, /^DATABASE_URL$/,
  /^WHATSAPP_/, /^RAILWAY_/, /^PORT$/, /^SELLER_PHONE$/, /^OWNER_KEY$/,
  /^INTERBOT_(USERNAME|PASSWORD|SYNC_[A-Z_]+)$/, /^NODE_ENV$/, /^PGSSL$/,
  // Infraestructura del despliegue y del hub: no cambian lo que el bot dice.
  /^ADMIN_PANEL_ORIGIN$/, /^GIT_SHA$/, /^VITEST$/,
];

const calza = (lista, clave) => lista.some((re) => re.test(clave));

/**
 * @returns {{ ok: boolean, variables: object, deriva: string[], motivo?: string }}
 */
export function variablesDeProduccion({ entorno = "Depot_Tire", servicio = "AutoVenta" } = {}) {
  let crudo;
  try {
    crudo = execFileSync(
      "railway",
      ["variables", "--environment", entorno, "--service", servicio, "--json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 25_000 },
    );
  } catch (error) {
    return { ok: false, variables: {}, deriva: [], motivo: mensajeDeFallo(error) };
  }

  let todas;
  try {
    todas = JSON.parse(crudo);
  } catch {
    return { ok: false, variables: {}, deriva: [], motivo: "railway no devolvió JSON" };
  }

  const variables = {};
  const deriva = [];
  for (const [clave, valor] of Object.entries(todas)) {
    if (calza(LISTA_BLANCA, clave)) variables[clave] = String(valor);
    else if (!calza(IGNORADAS, clave)) deriva.push(clave);
  }
  return { ok: true, variables, deriva };
}

function mensajeDeFallo(error) {
  const texto = `${error?.stderr ?? ""}${error?.message ?? ""}`;
  if (/not found|ENOENT/i.test(texto)) return "el CLI de Railway no está instalado";
  if (/Unauthorized|login/i.test(texto)) return "el CLI de Railway no tiene sesión (railway login)";
  if (/not linked|No linked project/i.test(texto)) return "esta carpeta no está enlazada a un proyecto (railway link)";
  return (texto.trim().split("\n")[0] || "error desconocido").slice(0, 160);
}

/**
 * Variables que el simulador DEFINE ÉL MISMO, porque son justo las que lo
 * hacen un simulador: la base desechable, la Graph de mentira, la foto del
 * catálogo. No se copian de producción ni son deriva.
 */
export const DEFINIDAS_POR_EL_SIM = [
  "DATABASE_URL", "PGSSL", "PGUSER", "PORT",
  "OPENAI_API_KEY", "OPENAI_API_KEY_SIM", "OPENAI_BASE_URL", "OPENAI_ADMIN_KEY",
  "GRAPH_BASE_URL", "CONTIFICO_BASE_URL", "CONTIFICO_API_KEY", "CONTIFICO_TOKEN",
  // El catálogo lo sirve el simulador desde su foto, y lo resincroniza rápido
  // para que el stock que se fuerza en pantalla entre en segundos. El respaldo
  // por Google Sheets queda apagado a propósito: la foto es la única fuente.
  "CONTIFICO_CATALOG_SYNC_INTERVAL_MS", "CATALOG_SYNC_INTERVAL_MS",
  "CATALOG_SHEET_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY",
  "WHATSAPP_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_PHONE_ID",
  "SELLER_PHONE", "ADMIN_KEY", "OWNER_KEY",
  "INTERBOT_USERNAME", "INTERBOT_PASSWORD",
  "NODE_ENV", "SEED_WIPE",
];
