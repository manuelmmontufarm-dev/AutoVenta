/**
 * SPRINT 5b — el Guardián recibe el aviso de «medidas distintas» como HECHO.
 *
 * 39897 y 39787 (gpt-5.4-mini): el revisor solo ve 500 caracteres del resultado
 * de `preparar_opciones` y la regla 22 («si dio el aro no le pidas la medida
 * exacta»); tomó el aviso por un invento y lo borró. Mismo patrón que
 * `AVISO DE TIPO VIGENTE`: con `aviso_medidas:true` en la huella, el contexto
 * lo dice y aclara que la regla 22 no lo anula.
 */
import postgres from "postgres";
import { beforeAll, describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const BASE = `autoventa_s5b_guardian_${process.pid}`;
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
    insert into conversations (phone, name, status, stage, current_cycle)
    values ('593980051001', 'Cliente', 'open', 'nuevo', 1) returning id
  `;
  conv = fila.id;
  await sql`
    insert into messages (conversation_id, cycle, role, direction, content, type)
    values (${conv}, 1, 'user', 'inbound', 'Que precio tienen en 175 x. Rin 16', 'text')
  `;
});

const BORRADOR =
  "⚠️ Ojo: estas opciones son de *medidas distintas* del mismo aro (195/45R16, 205/50R16, 205/55R16) — cada tarjeta lleva la suya. Para asegurarle el calce necesito la medida del costado de su llanta.";

describe("armarContexto · AVISO DE MEDIDAS VIGENTE", () => {
  it("con `aviso_medidas:true` en la huella, el hecho está y dice que la regla 22 no lo anula", async () => {
    const contexto = await armarContexto(conv, 1, BORRADOR, [{
      herramienta: "preparar_opciones",
      argumentos: "{}",
      resultado: '{"imagen_enviada":true,"consentimiento_pendiente":false,"aviso_medidas":true,"unica_opcion":false}',
    }]);
    expect(contexto).toContain("AVISO DE MEDIDAS VIGENTE");
    expect(contexto).toMatch(/regla 22 no lo anula/i);
  });

  it("sin la bandera, no aparece", async () => {
    const contexto = await armarContexto(conv, 1, "1 · WINRUN R330 — $60.67 c/u", [{
      herramienta: "preparar_opciones", argumentos: "{}", resultado: '{"imagen_enviada":true}',
    }]);
    expect(contexto).not.toContain("AVISO DE MEDIDAS VIGENTE");
  });
});
