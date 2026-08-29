import { business } from "../config.js";
import type { Stage } from "../domain/pipeline.js";
import { DEFAULT_AI_CONFIG, formatStoreHours, type AiConfig, type StoreHours } from "../services/settings.js";
import { COMPACT_PLAYBOOK, playbookParaFase } from "./compactPlaybook.js";

/**
 * Prompt estable del agente. La política comercial tiene una sola fuente
 * (`COMPACT_PLAYBOOK`); aquí solo entran el negocio, el estilo administrable y
 * el objetivo de la etapa. Una indicación por etapa solo se agrega cuando el
 * dueño escribió una diferencia real en Ajustes. Los hechos variables se
 * agregan después en agent.ts.
 */
export function buildSystemPrompt(
  ai: AiConfig = DEFAULT_AI_CONFIG,
  stage?: { key?: Stage; name: string; objective: string; prompt: string; version: number; storedStage?: string },
  storeHours?: StoreHours,
): string {
  const stores = business.stores.map((store) => `- ${store.name}`).join("\n");

  const policy = stage?.key ? playbookParaFase(stage.key) : COMPACT_PLAYBOOK;

  return `${policy}

---

# Negocio
Eres el asistente de ventas por WhatsApp de ${business.name}, una llantera en Quito con más de 30 años de experiencia. Vende ${business.brands.join(", ")} y ofrece mantenimiento preventivo automotriz.

Locales disponibles:
${stores}
Horario: ${storeHours ? formatStoreHours(storeHours) : business.schedule}.
Teléfono: ${business.phone}.
${business.promo ? `Promoción vigente: ${business.promo}.` : ""}

# Estilo administrado
Estas preferencias vienen de Ajustes y son la única fuente del tono y la personalidad:
${styleRules(ai)}

${stage ? `# Fase operativa de este turno: ${stage.name}
La fase puede avanzar o volver según lo que acaba de pedir el cliente. Resuelve primero esa necesidad y después haz una sola pregunta que empuje al siguiente dato comercial que falte.
Objetivo: ${stage.objective}${stage.storedStage && stage.storedStage !== stage.name ? `
La tarjeta del Kanban sigue en ${stage.storedStage}; no borres los datos ni la cotización ya conseguida.` : ""}${stage.prompt.trim() ? `
Indicación adicional publicada: ${stage.prompt.trim()}` : ""}` : ""}`.trim();
}

/** Traduce la configuración de /configuracion/ia sin redefinir reglas comerciales. */
function styleRules(ai: AiConfig): string {
  const tono = {
    calido: "Trato cálido y directo, como un buen vendedor quiteño.",
    neutral: "Trato profesional y neutro, amable sin exceso de confianza.",
    formal: 'Trato formal: siempre de "usted", sin modismos.',
  }[ai.tono];

  const emojis = {
    ninguno: "No uses emojis.",
    pocos: "Máximo un emoji por mensaje, y no en todos.",
    muchos: "Usa emojis con libertad, manteniendo claridad.",
  }[ai.emojis];

  const longitud = {
    corta: "Cada mensaje ocupa 1–3 líneas.",
    media: "Cada mensaje puede ocupar hasta 5 líneas.",
    larga: "Puedes extender cada mensaje cuando ayude, sin pasar de un párrafo.",
  }[ai.longitud];

  const formato = {
    imagen_primero: "La pieza visual lleva el detalle; el texto solo agrega criterio o el siguiente paso.",
    texto_completo: "Además de la pieza visual, incluye la información completa en texto.",
  }[ai.formato];

  const lines = [tono, emojis, longitud, formato];
  if (ai.stickerFinal) {
    lines.push(`Al despedirte, termina con ${ai.emojiCierre}.`);
  }
  if (ai.personalidad.trim()) {
    lines.push(`Personalidad adicional del administrador: ${ai.personalidad.trim()}`);
  }
  return lines.map((line) => `- ${line}`).join("\n");
}
