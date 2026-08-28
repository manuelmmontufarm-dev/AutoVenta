/**
 * FALLAR ABIERTO NO PUEDE SER FALLAR EN SILENCIO.
 *
 * El 27-ago-2026 se midieron 31 de 496 mensajes sin revisión. El guardián
 * cortaba en 12 s, justo encima de p90=10,6 s y p95=11,1 s, y en cada timeout
 * solo hacía console.warn: ni guardian_reviews ni bot_alerts permitían saber
 * después qué texto había salido sin revisar.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = `autoventa_guardian_timeout_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
process.env.OPENAI_API_KEY = "test";
process.env.OPENAI_BASE_URL = "http://127.0.0.1:9";
process.env.WHATSAPP_TOKEN = "x";
process.env.WHATSAPP_APP_SECRET = "x";
process.env.WHATSAPP_VERIFY_TOKEN = "x";
process.env.WHATSAPP_PHONE_ID = "x";
process.env.SELLER_PHONE = "x";

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { revisarConGuardian } = await import("../src/services/guardian.js");

const BORRADOR = "Le confirmo la medida y enseguida le paso las opciones disponibles.";

describe.sequential("el guardián cuando agota su tiempo", () => {
  beforeAll(async () => {
    await ensureSchema();
    await sql`
      insert into settings (key, value)
      values ('guardian_config', ${sql.json({ activo: true })})
      on conflict (key) do update set value=excluded.value
    `;
  });

  afterAll(async () => {
    await sql.end();
    const limpieza = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
    await limpieza.unsafe(`drop database if exists ${BASE}`);
    await limpieza.end();
  });

  it("el borrador sale igual y quedan revisión consultable + alerta", async () => {
    const [conversation] = await sql<{ id: number; current_cycle: number }[]>`
      insert into conversations (phone, name, status, stage, current_cycle, tire_size)
      values ('593999118002', 'Timeout', 'open', 'medida_confirmada', 1, '195/55R15')
      returning id, current_cycle
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type)
      values (${conversation.id}, 1, 'user', 'inbound', '195/55R15', 'text')
    `;

    const revision = await revisarConGuardian(
      { ...conversation, stage: "medida_confirmada" },
      BORRADOR,
      [],
      {},
      {
        timeoutMs: 8,
        completar: async () => new Promise<never>(() => undefined),
      },
    );

    // Fail-open: el cliente NO se queda esperando al guardián.
    expect(revision.texto).toBe(BORRADOR);
    expect(revision.veredicto).toBe("sin_revision");

    const [rastro] = await sql<{
      verdict: string; original_text: string; corrected_text: string | null;
      latency_ms: number | null; findings: Array<{ detalle?: string }>;
    }[]>`
      select verdict, original_text, corrected_text, latency_ms, findings
      from guardian_reviews where conversation_id=${conversation.id}
      order by created_at desc limit 1
    `;
    expect(rastro?.verdict).toBe("sin_revision");
    expect(rastro?.original_text).toBe(BORRADOR);
    expect(rastro?.corrected_text).toBeNull();
    expect(rastro?.latency_ms).toBeGreaterThanOrEqual(8);
    expect(rastro?.findings[0]?.detalle).toMatch(/tiempo|timeout|respuesta/i);

    const [alerta] = await sql<{ type: string; summary: string; exact_reason: string }[]>`
      select type, summary, exact_reason from bot_alerts
      where conversation_id=${conversation.id} and type='guardian_sin_revision'
    `;
    expect(alerta?.summary).toMatch(/sin revisar/i);
    expect(alerta?.exact_reason).toContain("8 ms");
  });
});
