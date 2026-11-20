/**
 * EL GUARDIÁN RECIBE EL MISMO HECHO QUE EL CANDADO DE LA MEDIDA (simulador
 * Competimotor, 18-nov, CM26).
 *
 * «aveo family 2015» → el modelo adivinó la 185/60R14 (fitment apagado: sin
 * vehículo registrado), la ficha quedó llena y el candado de
 * `generar_cotizacion` bloqueó. El revisor solo ponía «MEDIDA NO CONFIRMADA»
 * con un vehículo registrado, así que no tenía con qué juzgar y aprobó «La
 * cotización se bloqueó porque el sistema pide confirmar la medida…».
 */
import postgres from "postgres";
import { beforeAll, describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const BASE = `autoventa_medida_guardian_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { armarContexto } = await import("../src/services/guardian.js");

let conv = 0;
beforeAll(async () => {
  await ensureSchema();
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, vehicle)
    values ('593980026001', 'Cliente', 'open', 'seleccionando', 1, '185/60R14', null) returning id
  `;
  conv = fila.id;
  for (const texto of ["buenas", "busco llantas", "aveo family 2015", "uso ciudad nomas", "la economica", "4"]) {
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type)
      values (${conv}, 1, 'user', 'inbound', ${texto}, 'text')
    `;
  }
});

const BORRADOR =
  "La cotización se bloqueó porque el sistema pide confirmar la medida escrita del costado. ¿Me confirma si su llanta dice 185/60R14?";

describe("armarContexto · MEDIDA NO CONFIRMADA sigue al candado", () => {
  it("CM26: sin vehículo registrado y con el candado puesto, el hecho está", async () => {
    const contexto = await armarContexto(conv, 1, BORRADOR, [], { medidaSinConfirmar: true });
    expect(contexto).toContain("MEDIDA NO CONFIRMADA");
  });

  it("con el candado quitado (el cliente dio su medida), no está", async () => {
    const contexto = await armarContexto(conv, 1, "Le cotizo la TOWNHALL.", [], { medidaSinConfirmar: false });
    expect(contexto).not.toContain("MEDIDA NO CONFIRMADA");
  });
});
