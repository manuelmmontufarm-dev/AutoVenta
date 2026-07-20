import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const playbookPath = fileURLToPath(
  new URL("../../BOT_PLAYBOOK.md", import.meta.url),
);

/**
 * Fuente única de reglas del bot. El archivo también se muestra en Account
 * Settings para que operación pueda leer exactamente lo que recibe el modelo.
 */
export const BOT_PLAYBOOK = readFileSync(playbookPath, "utf8").trim();
