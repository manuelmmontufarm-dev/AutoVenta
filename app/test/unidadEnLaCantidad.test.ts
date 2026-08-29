import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * «SE LA COTIZO POR 4» NO SE ENTIENDE.
 *
 * Manuel, 27-ago-2026: el bot dice el número solo y el cliente tiene que
 * adivinar qué cuenta — ¿por 4 llantas?, ¿por $4?, ¿en 4 cuotas? El pedido es
 * de una línea: donde el bot nombre una cantidad, dice la unidad («4 llantas»,
 * «el juego de 4 llantas»).
 *
 * Esto se vigila con una prueba y no con una revisión a ojo porque la copy del
 * bot vive en seis archivos —dos playbooks, el prompt operativo, la plantilla
 * de cierre, la línea de escalones y las instrucciones que devuelven las
 * tools— y el «por 4» se vuelve a colar cada vez que alguien escribe una regla
 * nueva copiando el estilo de la de al lado.
 */

const raiz = fileURLToPath(new URL("..", import.meta.url));

/** Todo lo que termina en el prompt del modelo o en el chat del cliente. */
const FUENTES_DE_COPY = [
  "src/agent/prompts.ts",
  "src/agent/compactPlaybook.ts",
  "src/agent/agent.ts",
  "src/agent/tools.ts",
  "src/services/quoteMessages.ts",
] as const;

/**
 * Un número de cantidad colgado de «por» o «de» sin decir qué cuenta.
 *
 * Se mira solo 1–8 —el rango en el que se habla de llantas— para no confundir
 * con «más de 30 años» ni «la ventana de 24 h`. Y se deja pasar el rango
 * («de 4 a 5 pm», «fuera de 4–8»), que es una hora o un intervalo, no una
 * cantidad de llantas.
 */
const NUMERO_SIN_UNIDAD =
  /\b(?:por|de)\s+([1-8])\b(?!\s*(?:llantas?|unidades?|neum[áa]ticos?))(?!\s*(?:[a–—-]|y)\s*\d)/gi;

/** Los comentarios del código no los lee ningún cliente. */
const esComentario = (linea: string) => /^\s*(?:\/\/|\/\*|\*)/.test(linea);

function frasesSinUnidad(archivo: string): string[] {
  const esCodigo = archivo.endsWith(".ts");
  return readFileSync(join(raiz, archivo), "utf8")
    .split("\n")
    .flatMap((linea, i) => {
      if (esCodigo && esComentario(linea)) return [];
      return [...linea.matchAll(NUMERO_SIN_UNIDAD)].map((m) => {
        const desde = Math.max(0, (m.index ?? 0) - 50);
        const trozo = linea.slice(desde, (m.index ?? 0) + 50).replace(/\s+/g, " ").trim();
        return `${archivo}:${i + 1} → «…${trozo}…»`;
      });
    });
}

describe("el bot siempre dice la unidad cuando nombra una cantidad", () => {
  for (const archivo of FUENTES_DE_COPY) {
    it(`${archivo} no dice un número de llantas a secas`, () => {
      expect(frasesSinUnidad(archivo)).toEqual([]);
    });
  }
});

/* La regla tiene una fuente única y buildSystemPrompt la incluye por import. */
const REGLA_DE_LA_UNIDAD =
  "La cantidad SIEMPRE lleva su unidad: se dice «4 llantas», nunca el número a secas.";

/** Sin negritas ni saltos: cada archivo resalta a su manera, la regla es la misma. */
const sinFormato = (texto: string) => texto.replace(/\*/g, "").replace(/\s+/g, " ");

describe("la regla de la unidad está en la política única y en el prompt generado", () => {
  it("vive una sola vez en la política comercial", async () => {
    const { COMPACT_PLAYBOOK } = await import("../src/agent/compactPlaybook.js");
    expect(sinFormato(COMPACT_PLAYBOOK)).toContain(REGLA_DE_LA_UNIDAD);
  });

  it("llega una sola vez al prompt que recibe el modelo", async () => {
    process.env.OPENAI_API_KEY ||= "test";
    process.env.WHATSAPP_TOKEN ||= "test";
    process.env.WHATSAPP_APP_SECRET ||= "test";
    process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
    process.env.WHATSAPP_PHONE_ID ||= "test";
    process.env.DATABASE_URL ||= "postgresql://manue@localhost/autoventa_test";
    const { buildSystemPrompt } = await import("../src/agent/prompts.js");
    const prompt = sinFormato(buildSystemPrompt());
    expect(prompt.split(REGLA_DE_LA_UNIDAD)).toHaveLength(2);
  });
});
