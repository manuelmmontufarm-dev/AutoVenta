const baseUrl = (process.env.STAGING_BASE_URL ?? "https://autoventa-staging.up.railway.app").replace(/\/$/, "");
const adminKey = process.env.ADMIN_KEY ?? "";

if (!/^https:\/\/[^/]*staging[^/]*\.up\.railway\.app$/i.test(baseUrl)) {
  throw new Error(`Se rechazó STAGING_BASE_URL porque no es un dominio staging de Railway: ${baseUrl}`);
}

const headers = adminKey ? { "x-admin-key": adminKey } : {};

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${body.error ?? ""}`.trim());
  return body;
}

const checks = [
  ["health", "/health"],
  ["follow-up settings", "/api/follow-up-settings"],
  ["follow-up board", "/api/follow-ups"],
  ["bot alerts", "/api/bot-alerts"],
  ["metrics", "/api/hub/metrics"],
  ["catalog with stock", "/api/catalog/search?q=205%2F55R16&limit=3"],
];

for (const [label, path] of checks) {
  const body = await getJson(path);
  if (label === "catalog with stock") {
    const products = Array.isArray(body.products) ? body.products : [];
    if (products.some((product) => !Number.isFinite(product.stock))) {
      throw new Error("El catálogo devolvió un producto sin stock numérico");
    }
  }
  console.log(`✓ ${label}`);
}

if (process.env.E2E_ALLOW_META_SEND === "true") {
  if (!process.env.E2E_AUTHORIZED_PHONE) {
    throw new Error("E2E_ALLOW_META_SEND exige E2E_AUTHORIZED_PHONE (número autorizado por Meta)");
  }
  console.log("ℹ El smoke de escritura requiere completar el flujo desde el número autorizado en WhatsApp.");
  console.log("  Usa el retraso temporal de 3 minutos y verifica respuesta, toma humana y cierre desde el Hub.");
} else {
  console.log("✓ modo seguro: no se enviaron mensajes de Meta");
}
