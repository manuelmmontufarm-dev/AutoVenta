/**
 * Seed del entregable de Depot Tire: deja la base lista para producción con
 * fase 1 activa y CERO conversaciones de staging.
 *
 * Uso:
 *   npm run seed:depot            → asegura esquema, prompts y fase 1 (no borra nada)
 *   SEED_WIPE=true npm run seed:depot → además vacía datos de conversación
 *
 * En Railway lo normal es apuntar el servicio de Depot a una base Postgres
 * NUEVA y vacía: entonces basta el modo sin wipe. El wipe existe solo para
 * reutilizar una base que ya tuvo tráfico de prueba.
 */
import { sql } from "./client.js";
import { ensureSchema } from "./schema.js";
import { ensureDefaultStagePrompts } from "../services/settings.js";
import { savePhaseFlags } from "../services/phases.js";

// Tablas ligadas a conversaciones (se vacían con --wipe). NO incluye settings,
// stage_prompt_versions, product_media ni sales_history (config del producto).
const CONVERSATION_TABLES = [
  "message_status_events",
  "conversation_notes",
  "stage_transitions",
  "ai_runs",
  "quote_artifacts",
  "funnel_events",
  "quotes",
  "messages",
  "conversations",
];

async function main(): Promise<void> {
  const wipe = process.env.SEED_WIPE === "true";

  await ensureSchema();
  console.log("✅ Esquema aplicado");

  await ensureDefaultStagePrompts();
  console.log("✅ Prompts por etapa (defaults) publicados");

  // Entregable arranca en Fase 1; el dueño enciende 2 y 3 desde el panel.
  const phases = await savePhaseFlags({ fase2: false, fase3: false });
  console.log(`✅ Fases: fase2=${phases.fase2}, fase3=${phases.fase3} (arranca en Fase 1)`);

  if (wipe) {
    console.log("🧹 SEED_WIPE=true → vaciando datos de conversación…");
    // TRUNCATE en una sola sentencia respeta las dependencias entre tablas.
    await sql.unsafe(
      `truncate table ${CONVERSATION_TABLES.join(", ")} restart identity cascade`,
    );
    console.log("✅ Datos de conversación vaciados");
  }

  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from conversations
  `;
  console.log(`📊 Conversaciones actuales: ${count}`);
  console.log("🏁 Seed Depot completado.");

  await sql.end();
}

main().catch((error) => {
  console.error("❌ Seed falló:", error);
  process.exit(1);
});
