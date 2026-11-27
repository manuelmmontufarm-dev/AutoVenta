// Carga .env (base de PRODUCCIÓN, forzada a SOLO LECTURA) + .env.sim (claves de pruebas).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
for (const archivo of [".env", ".env.sim"]) {
  try {
    for (const linea of readFileSync(path.join(raiz, archivo), "utf8").split("\n")) {
      const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* opcional */ }
}
const u = new URL(process.env.DATABASE_URL);
u.searchParams.set("options", "-c default_transaction_read_only=on -c statement_timeout=60000");
process.env.DATABASE_URL = u.toString();
process.env.WHATSAPP_TOKEN ||= "x"; process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x"; process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "593999000111";
delete process.env.OPENAI_BASE_URL;
delete process.env.ANTHROPIC_BASE_URL;
