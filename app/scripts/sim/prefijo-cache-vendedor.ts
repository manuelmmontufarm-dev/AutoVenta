/**
 * ¿El prefijo cacheable del vendedor en Claude es el mismo entre conversaciones?
 * Arma la petición REAL (herramientas de la fase + system) que `agent.ts` manda,
 * para cada fase y cada etapa guardada, y compara los bytes de lo que va antes
 * del punto de caché. No llama al API (salvo count_tokens, gratis, si hay
 * ANTHROPIC_API_KEY) ni a la base: los prompts de fase se
 * pasan a mano con las herramientas publicadas en producción.
 *
 *   npx tsx scripts/sim/prefijo-cache-vendedor.ts
 */
import { createHash } from "node:crypto";
import { buildSystemPrompt } from "../../src/agent/prompts.js";
import { buildTools } from "../../src/agent/tools.js";
import { aPeticionClaude } from "../../src/agent/chatClaude.js";
import { DEFAULT_AI_CONFIG } from "../../src/services/settings.js";

const PUBLICADAS: Record<string, string[]> = {
  nuevo: ["buscar_llanta", "buscar_catalogo", "fitment_vehiculo", "buscar_por_aro_y_tipo", "tipos_de_llanta", "preparar_opciones", "generar_cotizacion", "guia_medida", "opciones_sin_medida", "notificar_vendedor"],
  medida_confirmada: ["buscar_llanta", "buscar_catalogo", "fitment_vehiculo", "preparar_opciones", "enviar_comparacion", "generar_cotizacion", "buscar_por_aro_y_tipo", "tipos_de_llanta", "guia_medida", "opciones_sin_medida", "notificar_vendedor"],
  seleccionando: ["buscar_llanta", "buscar_catalogo", "fitment_vehiculo", "preparar_opciones", "enviar_comparacion", "generar_cotizacion", "notificar_vendedor", "local_mas_cercano", "buscar_por_aro_y_tipo", "tipos_de_llanta", "guia_medida", "opciones_sin_medida", "respaldo_marcas"],
  cotizacion_enviada: ["fitment_vehiculo", "local_mas_cercano", "notificar_vendedor", "generar_cotizacion", "buscar_llanta", "buscar_catalogo", "buscar_por_aro_y_tipo", "guia_medida", "opciones_sin_medida", "preparar_opciones", "enviar_comparacion", "reenviar_cotizacion", "ubicacion_locales", "agendar_visita"],
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 10);

function peticion(fase: string, guardada: string, conv: number) {
  const ctx = { conversation: { id: conv, stage: guardada, current_cycle: 1 } } as never;
  const tools = buildTools(ctx)
    .filter((t: { function: { name: string } }) => PUBLICADAS[fase].includes(t.function.name))
    .map(({ execute: _e, ...t }: { execute: unknown; function: unknown }) => ({ type: "function" as const, function: t.function as never }));
  const system = buildSystemPrompt(DEFAULT_AI_CONFIG, { key: fase as never, name: fase, objective: `objetivo ${fase}`, prompt: "", version: 4 });
  const { cuerpo } = aPeticionClaude({
    model: "claude-sonnet-5-5",
    messages: [{ role: "system", content: system }, { role: "user", content: `hola ${conv}` }],
    tools, tool_choice: "auto", parallel_tool_calls: false,
  } as never, { esfuerzo: "low" });
  return cuerpo;
}

const filas: string[] = [];
const casos: [string, string, number][] = [
  ["nuevo", "nuevo", 1], ["nuevo", "nuevo", 2], ["nuevo", "medida_confirmada", 3],
  ["medida_confirmada", "medida_confirmada", 4], ["medida_confirmada", "nuevo", 5],
  ["seleccionando", "seleccionando", 6], ["cotizacion_enviada", "cotizacion_enviada", 7], ["cotizacion_enviada", "seguimiento_venta", 8],
];
for (const [fase, guardada, conv] of casos) {
  const c = peticion(fase, guardada, conv);
  const tools = JSON.stringify(c.tools);
  const system = JSON.stringify(c.system);
  filas.push(`${fase.padEnd(19)} guardada=${guardada.padEnd(19)} conv=${conv}  tools=${sha(tools)} (${tools.length} c)  system=${sha(system)} (${system.length} c)  tools+system=${sha(tools + system)}`);
}
console.log(filas.join("\n"));

// Conteo exacto con count_tokens (no cobra). Solo si hay clave.
if (process.env.ANTHROPIC_API_KEY) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const api = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: "https://api.anthropic.com" });
  const contar = async (c: ReturnType<typeof peticion>, sinSystem = false, sinTools = false) => (await api.messages.countTokens({
    model: c.model,
    messages: [{ role: "user", content: "hola" }],
    ...(sinSystem ? {} : { system: c.system as never }),
    ...(sinTools ? {} : { tools: c.tools as never }),
  })).input_tokens;
  for (const fase of Object.keys(PUBLICADAS)) {
    const c = peticion(fase, fase, 1);
    const [todo, soloTools, soloSystem, nada] = await Promise.all([contar(c), contar(c, true), contar(c, false, true), contar(c, true, true)]);
    console.log(`${fase.padEnd(19)} tools+system=${todo}  tools=${soloTools - nada}  system=${soloSystem - nada}  vacío=${nada}`);
  }
}
