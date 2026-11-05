import { NOMBRE_DEL_VENDEDOR } from "../domain/saludo.js";
import { politicaDePagos } from "../domain/datosDelNegocio.js";
import { business } from "../config.js";
import type { Stage } from "../domain/pipeline.js";
import { DEFAULT_AI_CONFIG, formatStoreHours, type AiConfig, type StoreHours } from "../services/settings.js";
import { COMPACT_PLAYBOOK, playbookParaFase } from "./compactPlaybook.js";
import { negocio } from "../negocio/index.js";
import { fraseDePresentacion } from "../negocio/perfil.js";
import { politica } from "../negocio/politica.js";

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
  const pagos = politicaDePagos();
  // El «no sube con tarjeta» solo se exige cuando la política confirmó el
  // diferido sin intereses (Depot); sin eso, el bot no promete nada de recargos.
  const conCuotas = politica.formasDePago.includes("tarjeta") && Boolean(politica.cuotasSinIntereses);

  return `${policy}

---

# Negocio
Eres ${NOMBRE_DEL_VENDEDOR}, el asistente de ventas por WhatsApp de ${fraseDePresentacion(negocio)}, una llantera en ${negocio.ciudad}${negocio.piezas.antiguedadClasica ? ` con más de ${negocio.piezas.antiguedadClasica} de experiencia` : ""}.${queVendeYOfrece(business.brands, politica.serviciosQueOfrece)} Si preguntan si eres bot, no lo niegues.

Locales disponibles:
${stores}
Horario: ${storeHours ? formatStoreHours(storeHours) : business.schedule}.
Teléfono: este mismo WhatsApp. El cliente ya está escribiendo aquí: NUNCA le des un número para que llame ni le digas que no tienes la dirección — la ubicación se manda con ${negocio.locales.length === 1 ? "el mapa del local" : "los mapas de los locales"}.
${pagos ? `Formas de pago: ${pagos} ${conCuotas
  ? "Es un hecho: si preguntan por tarjeta, recargos o cuotas, respóndelo con estas palabras. PROHIBIDO decir que no puedes confirmar lo de la tarjeta."
  : "Es un hecho: si preguntan cómo pagar, respóndelo con estas palabras. Recargos, cuotas, diferidos o descuentos que no estén acá NO se prometen: los confirma un asesor."}
` : `Formas de pago: todavía no están confirmadas. Si preguntan cómo pagar, tarjeta, cuotas o descuentos, NO prometas ninguna: di que se lo confirma un asesor y usa notificar_vendedor.
`}${business.promo ? `Promoción vigente: ${business.promo}.` : ""}

# Estilo administrado
Estas preferencias vienen de Ajustes y son la única fuente del tono y la personalidad:
${styleRules(ai)}

${stage ? `# Fase operativa de este turno: ${stage.name}
La fase puede avanzar o volver según lo que acaba de pedir el cliente. Resuelve primero esa necesidad y después haz una sola pregunta que empuje al siguiente dato comercial que falte.
Objetivo: ${stage.objective}${stage.storedStage && stage.storedStage !== stage.name ? `
La tarjeta del Kanban sigue en ${stage.storedStage}; no borres los datos ni la cotización ya conseguida.` : ""}${stage.prompt.trim() ? `
Indicación adicional publicada: ${stage.prompt.trim()}` : ""}` : ""}`.trim();
}

/**
 * « Vende Kenda, Sunoco… y ofrece mantenimiento preventivo automotriz.» con lo
 * que dicen el perfil y la política. Sin marcas cargadas se omite «Vende …»: un
 * negocio multimarca cuyo catálogo manda no tiene por qué listarlas, y una
 * lista vacía dejaría «Vende  y ofrece».
 */
function queVendeYOfrece(marcas: readonly string[], servicios: readonly string[]): string {
  const lista = (cosas: readonly string[]) =>
    cosas.length <= 1 ? (cosas[0] ?? "") : `${cosas.slice(0, -1).join(", ")} y ${cosas[cosas.length - 1]}`;
  if (marcas.length && servicios.length) return ` Vende ${marcas.join(", ")} y ofrece ${lista(servicios)}.`;
  if (marcas.length) return ` Vende ${lista(marcas)}.`;
  if (servicios.length) return ` Ofrece ${lista(servicios)}.`;
  return "";
}

/** Traduce la configuración de /configuracion/ia sin redefinir reglas comerciales. */
function styleRules(ai: AiConfig): string {
  const tono = {
    calido: `Trato cálido y directo, como un buen vendedor ${politica.gentilicio}.`,
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
