/**
 * Qué tabla es CONFIGURACIÓN y qué tabla es DATOS de conversación.
 *
 * El simulador copia la configuración de producción (para portarse igual) y no
 * copia los datos (para no arrastrar clientes reales a una base de pruebas).
 * La lista vive acá, y no dentro de `sim.mjs`, para que la prueba de deriva
 * (`test/simuladorFidelidad.test.ts`) pueda leer la MISMA lista que usa el
 * simulador: dos listas separadas se desincronizan el día que nadie mira.
 *
 * Si agregás una tabla al esquema, tenés que ponerla en una de las dos. La
 * prueba falla hasta que lo hagas — a propósito: una tabla de configuración
 * nueva que el simulador no copia es fidelidad que se pierde en silencio.
 */

/** Se copia de producción: define CÓMO se comporta el bot. */
export const TABLAS_CONFIG = [
  "settings",
  "stage_prompt_versions",
  "benefits",
  "brand_profiles",
  "product_media",
  "advisors",
  "follow_up_templates",
  "follow_up_policies",
  "pending_discount_rules",
];

/** NO se copia: son clientes, conversaciones y su rastro. */
export const TABLAS_DATOS = [
  "conversations",
  "messages",
  "message_status_events",
  "conversation_notes",
  "conversation_summaries",
  "stage_transitions",
  "ai_runs",
  "audit_events",
  "quotes",
  "quote_artifacts",
  "funnel_events",
  "bot_alerts",
  "guardian_reviews",
  "discount_offers",
  "confirmation_coupons",
  "customer_consents",
  "follow_up_jobs",
  "follow_up_attempts",
  "follow_up_campaigns",
  "advisor_notifications",
  "sales_history",
  "billing_months",
  "schema_migrations",
  "hub_sessions",
];
