import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = `autoventa_final_stage_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let hubData: typeof import("../src/services/hubData.js");

/**
 * El contador del final del tablero se lee del historial, no del estado actual.
 * Lo que se prueba aquí es justamente lo que el kanban no puede mostrar: el que
 * llegó al final y ya se cerró sigue contando.
 */
describe.sequential("Contador del final del tablero", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.unsafe(`create database ${testDatabase}`);

    process.env.DATABASE_URL = `postgresql://manue@localhost/${testDatabase}`;
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";
    process.env.OPENAI_API_KEY = "test";

    const db = await import("../src/db/client.js");
    appSql = db.sql;
    const schema = await import("../src/db/schema.js");
    await schema.ensureSchema();
    hubData = await import("../src/services/hubData.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  it("cuenta a quien tocó la última columna, incluidos los cerrados", async () => {
    // Llegó al final y sigue abierto.
    const [abierto] = await appSql<{ id: number }[]>`
      insert into conversations (phone, name, stage, tire_size)
      values ('593000000101', 'Sigue Abierto', 'seguimiento_venta', '185/60R14')
      returning id
    `;
    await appSql`
      insert into stage_transitions (conversation_id, cycle, from_stage, to_stage, created_at)
      values (${abierto.id}, 1, 'cotizacion_enviada', 'seguimiento_venta', '2026-08-04T15:00:00Z')
    `;

    // Llegó al final y se cerró: desaparece del kanban, pero tiene que contar.
    const [cerrado] = await appSql<{ id: number }[]>`
      insert into conversations (phone, name, stage, status, closed_at)
      values ('593000000102', 'Ya Cerrado', 'ganado', 'closed', now())
      returning id
    `;
    await appSql`
      insert into stage_transitions (conversation_id, cycle, from_stage, to_stage, created_at)
      values (${cerrado.id}, 1, 'cotizacion_enviada', 'seguimiento_venta', '2026-08-04T16:00:00Z')
    `;
    await appSql`
      insert into sales_history (conversation_id, cycle, outcome, closed_at)
      values (${cerrado.id}, 1, 'ganado', '2026-08-04T18:00:00Z')
    `;

    // Nunca pasó de la mitad: no cuenta.
    await appSql`
      insert into conversations (phone, name, stage)
      values ('593000000103', 'A Medias', 'seleccionando')
    `;

    const resultado = await hubData.getFinalStageArrivals();

    expect(resultado.total).toBe(2);
    expect(resultado.ganados).toBe(1);

    const nombres = resultado.days.flatMap((d) => d.tickets.map((t) => (t as { nombre: string }).nombre));
    expect(nombres).toContain("Sigue Abierto");
    expect(nombres).toContain("Ya Cerrado");
    expect(nombres).not.toContain("A Medias");
  });

  it("agrupa por día en hora de Guayaquil, no en UTC", async () => {
    // 02:30 UTC del 6-ago = 21:30 del 5-ago en Guayaquil (UTC-5). Agrupar en
    // UTC lo mandaría al día siguiente y el negocio lo vería con fecha errada.
    const [nocturno] = await appSql<{ id: number }[]>`
      insert into conversations (phone, name, stage)
      values ('593000000104', 'Noche Guayaquil', 'seguimiento_venta')
      returning id
    `;
    await appSql`
      insert into stage_transitions (conversation_id, cycle, from_stage, to_stage, created_at)
      values (${nocturno.id}, 1, 'cotizacion_enviada', 'seguimiento_venta', '2026-08-06T02:30:00Z')
    `;

    const resultado = await hubData.getFinalStageArrivals();
    const dia = resultado.days.find((d) =>
      d.tickets.some((t) => (t as { nombre: string }).nombre === "Noche Guayaquil"),
    );

    expect(dia?.day).toBe("2026-08-05");
  });

  it("cuenta una sola vez aunque el ticket rebote al final varias veces", async () => {
    const [rebote] = await appSql<{ id: number }[]>`
      insert into conversations (phone, name, stage)
      values ('593000000105', 'Ida Y Vuelta', 'seguimiento_venta')
      returning id
    `;
    await appSql`
      insert into stage_transitions (conversation_id, cycle, from_stage, to_stage, created_at)
      values
        (${rebote.id}, 1, 'cotizacion_enviada', 'seguimiento_venta', '2026-08-03T14:00:00Z'),
        (${rebote.id}, 1, 'seguimiento_venta', 'cotizacion_enviada', '2026-08-03T15:00:00Z'),
        (${rebote.id}, 1, 'cotizacion_enviada', 'seguimiento_venta', '2026-08-04T09:00:00Z')
    `;

    const resultado = await hubData.getFinalStageArrivals();
    const apariciones = resultado.days.flatMap((d) =>
      d.tickets.filter((t) => (t as { nombre: string }).nombre === "Ida Y Vuelta"),
    );

    expect(apariciones).toHaveLength(1);
    // Se queda con la PRIMERA vez que llegó, no con la última.
    const dia = resultado.days.find((d) =>
      d.tickets.some((t) => (t as { nombre: string }).nombre === "Ida Y Vuelta"),
    );
    expect(dia?.day).toBe("2026-08-03");
  });

  it("un mismo cliente que vuelve a comprar cuenta una vez por ciclo", async () => {
    const [recurrente] = await appSql<{ id: number }[]>`
      insert into conversations (phone, name, stage, current_cycle)
      values ('593000000106', 'Cliente Fiel', 'seguimiento_venta', 2)
      returning id
    `;
    await appSql`
      insert into stage_transitions (conversation_id, cycle, from_stage, to_stage, created_at)
      values
        (${recurrente.id}, 1, 'cotizacion_enviada', 'seguimiento_venta', '2026-07-20T14:00:00Z'),
        (${recurrente.id}, 2, 'cotizacion_enviada', 'seguimiento_venta', '2026-08-02T14:00:00Z')
    `;

    const resultado = await hubData.getFinalStageArrivals();
    const apariciones = resultado.days.flatMap((d) =>
      d.tickets.filter((t) => (t as { nombre: string }).nombre === "Cliente Fiel"),
    );

    expect(apariciones).toHaveLength(2);
  });
});
