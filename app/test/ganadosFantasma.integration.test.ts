/**
 * LOS GANADOS FANTASMA DEL ARRANQUE (auditoría 27-sep-2026).
 *
 * `schema.ts` cerraba como ganada, en cada arranque, toda conversación cuyo
 * cliente escribió «ya compré» — también «ya se compró en El Carmen» (conv
 * 8162). 22 de los 33 ganados de septiembre. La migración 023 los deshace por
 * su firma: cierre sin ningún mensaje del cliente en los 10 minutos previos.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const DB = `autoventa_ganados_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${DB}`;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { runGanadosFantasmaMigration, MOTIVO_CORREGIDO, GANADOS_FANTASMA_MIGRATION_ID } = await import("../src/db/migrations/023_ganados_fantasma.js");

beforeAll(async () => {
  execSync(`createdb ${DB}`);
  await ensureSchema();
});
afterAll(async () => {
  await sql.end();
  execSync(`dropdb ${DB}`);
});

describe("migración 023", () => {
  it("borra el ganado del arranque, conserva el ganado real y no vuelve a correr", async () => {
    const deploy = new Date("2026-09-25T01:18:29Z");
    // Fantasma: «ya se compró en el Carmen» tres días antes del cierre.
    const [f] = await sql<{ id: number }[]>`insert into conversations (phone, name, stage, status, current_cycle, closed_reason, closed_at)
      values ('593990000001','Marco','ganado','closed',1,'Cliente confirmó explícitamente que la compra fue realizada',${deploy}) returning id`;
    await sql`insert into messages (conversation_id, role, direction, content, created_at, cycle)
      values (${f.id},'user','inbound','Gracias ya se compró en el carmen ahí se tuvo q cambiar las llantas ok','2026-09-22T21:27:44Z',1)`;
    await sql`insert into sales_history (conversation_id, cycle, outcome, reason, closed_at)
      values (${f.id},1,'ganado','Cliente confirmó explícitamente que la compra fue realizada',${deploy})`;
    // Real: el cliente dijo «ya compré» y el clasificador cerró dos minutos después.
    const [r] = await sql<{ id: number }[]>`insert into conversations (phone, name, stage, status, current_cycle, closed_reason, closed_at)
      values ('593990000002','Ana','ganado','closed',1,'Cliente confirmó explícitamente que la compra fue realizada','2026-09-26T13:52:30Z') returning id`;
    await sql`insert into messages (conversation_id, role, direction, content, created_at, cycle)
      values (${r.id},'user','inbound','Ya compré las 4, gracias Martín','2026-09-26T13:50:10Z',1)`;
    await sql`insert into sales_history (conversation_id, cycle, outcome, reason, closed_at)
      values (${r.id},1,'ganado','Cliente confirmó explícitamente que la compra fue realizada','2026-09-26T13:52:30Z')`;

    // ensureSchema ya la corrió una vez (con la base vacía); acá se fuerza otra vez sobre datos.
    await sql`delete from schema_migrations where id = ${GANADOS_FANTASMA_MIGRATION_ID}`;
    await runGanadosFantasmaMigration(sql);

    const ganados = await sql<{ conversation_id: number }[]>`select conversation_id from sales_history where outcome='ganado'`;
    expect(ganados.map((g) => Number(g.conversation_id))).toEqual([Number(r.id)]);
    const [fant] = await sql<{ stage: string; closed_reason: string; status: string }[]>`select stage, closed_reason, status from conversations where id=${f.id}`;
    expect(fant).toEqual({ stage: "perdido", closed_reason: MOTIVO_CORREGIDO, status: "closed" });
    const [perdida] = await sql<{ outcome: string; reason: string }[]>`select outcome, reason from sales_history where conversation_id=${f.id}`;
    expect(perdida).toEqual({ outcome: "perdido", reason: MOTIVO_CORREGIDO });
    const [real] = await sql<{ stage: string }[]>`select stage from conversations where id=${r.id}`;
    expect(real.stage).toBe("ganado");

    // Idempotente: segunda corrida no toca nada.
    await runGanadosFantasmaMigration(sql);
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from sales_history`;
    expect(n.n).toBe(2);
  });

  it("el arranque ya no cierra como ganada a quien dijo «ya compré en otro lugar»", async () => {
    const [c] = await sql<{ id: number }[]>`insert into conversations (phone, name, stage, status, current_cycle)
      values ('593990000003','Luis','seguimiento_venta','open',1) returning id`;
    await sql`insert into messages (conversation_id, role, direction, content, created_at, cycle)
      values (${c.id},'user','inbound','sabe que no gracias ya compre en otro lugar',now(),1)`;
    await ensureSchema();
    const [row] = await sql<{ stage: string; status: string }[]>`select stage, status from conversations where id=${c.id}`;
    expect(row).toEqual({ stage: "seguimiento_venta", status: "open" });
  });
});
