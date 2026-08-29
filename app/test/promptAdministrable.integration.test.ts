import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = `autoventa_prompt_admin_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
let appSql: typeof import("../src/db/client.js").sql;

const PERSONALIDAD_ANTERIOR =
  "Responde siempre en una o dos oraciones cortas y directas, nunca en párrafos. " +
  "No dividas la respuesta en varios mensajes seguidos: entrega todo en un solo mensaje breve. " +
  "Evita relleno, cortesías largas o repetir información ya dicha. Ve directo al punto.";

describe.sequential("la configuración administrable reemplaza la contradicción vieja", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.unsafe(`create database ${testDatabase}`);
    process.env.DATABASE_URL = `postgresql://manue@localhost/${testDatabase}`;
    process.env.OPENAI_API_KEY = "test";
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";

    appSql = (await import("../src/db/client.js")).sql;
    await appSql.unsafe(`
      create table settings (
        key text primary key,
        value jsonb not null,
        updated_at timestamptz not null default now()
      )
    `);
    await appSql`
      insert into settings (key, value)
      values ('ai_config', ${appSql.json({
        tono: "neutral", emojis: "pocos", longitud: "corta",
        formato: "imagen_primero", stickerFinal: true, emojiCierre: "🤝",
        personalidad: PERSONALIDAD_ANTERIOR,
      })})
    `;
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  it("conserva el tono neutral y quita la orden de un solo mensaje", async () => {
    await (await import("../src/db/schema.js")).ensureSchema();
    const [row] = await appSql<{ value: { tono: string; personalidad: string } }[]>`
      select value from settings where key='ai_config'
    `;

    expect(row.value.tono).toBe("neutral");
    expect(row.value.personalidad).toBe(
      "Directo, claro y atento. Evita relleno, cortesías largas y repetir información ya dicha.",
    );
    expect(row.value.personalidad).not.toContain("un solo mensaje");

    await (await import("../src/services/settings.js")).ensureDefaultStagePrompts();
    const etapas = await appSql<{ stage: string; prompt: string }[]>`
      select stage, prompt from stage_prompt_versions
      where status='published'
        and stage in ('nuevo', 'medida_confirmada', 'seleccionando', 'cotizacion_enviada', 'seguimiento_venta')
    `;
    expect(etapas).toHaveLength(5);
    expect(etapas.every((etapa) => etapa.prompt === "")).toBe(true);
  });
});
