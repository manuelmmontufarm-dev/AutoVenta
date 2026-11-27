import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

/**
 * El recordatorio de la víspera y el «no llegó» (19-nov-2026), contra una base
 * de verdad. Lo que importa: que salga UNO por visita aunque el bucle pase cada
 * cuarto de hora, que no salga si el casillero «Envío automático» está apagado,
 * que no le escriba a quien ya está conversando, y que el «no llegó» calle si
 * no se puede saber quién compró.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";

const BASE = "autoventa_recordatorios_test";
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const plantillas: { to: string; templateName: string; variables: string[]; actor?: string }[] = [];
vi.mock("../src/wa/client.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/wa/client.js")>();
  return {
    ...real,
    sendApprovedTemplate: vi.fn(async (input: { to: string; templateName: string; variables: string[]; actor?: string }) => {
      plantillas.push(input);
      return `wamid.${plantillas.length}`;
    }),
  };
});

// Las facturas se controlan desde la prueba: sin sync reciente el «no llegó» no sale.
let ultimaSync: Date | null = null;
let ventas: { ticketId: number; dia: string }[] = [];
vi.mock("../src/services/ventasConfirmadas.js", () => ({
  ultimaSyncFacturas: () => ultimaSync,
  cruceVigente: async () => ({ ventas, descartes: [] }),
}));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { barrerRecordatorios } = await import("../src/services/recordatoriosDeVisita.js");

/** Jueves 19-nov-2026, 18:00 en Guayaquil (UTC-5): víspera de una visita del viernes. */
const VISPERA = new Date("2026-11-19T23:00:00.000Z");
/** Sábado 21-nov, 11:00 en Guayaquil: el día después de la visita del viernes. */
const DIA_DESPUES = new Date("2026-11-21T16:00:00.000Z");
/** La visita: viernes 20-nov, 10:00 en Guayaquil. */
const VISITA = new Date("2026-11-20T15:00:00.000Z");

let telefono = 593990000000;
async function conversacion(opts: { ultimoCliente?: Date; stage?: string; visita?: Date; sinCotizacion?: boolean } = {}): Promise<number> {
  telefono += 1;
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, stage, status, current_cycle, visit_date, nearest_store, tire_size, last_customer_message_at)
    values (${String(telefono)}, 'maría josé', ${opts.stage ?? "seguimiento_venta"}, 'open', 1,
      ${opts.visita ?? VISITA}, 'Depot Tire Cumbayá', '205/55R16', ${opts.ultimoCliente ?? new Date("2026-11-18T15:00:00Z")})
    returning id
  `;
  // Sprint 4: el recordatorio nombra lo COTIZADO (195/65R15), no la medida
  // de la ficha (205/55R16) — chats 1456 y 302 de Competimotor.
  if (!opts.sinCotizacion) await sql`
    insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number)
    values (${fila.id}, 1, ${sql.json([{ code: "X1", brand: "KENDA", design: "KR203", sizeLabel: "195/65R15", quantity: 4 }] as never)},
      87, 13, 100, ${`COT-T${fila.id}`})
  `;
  return Number(fila.id);
}

async function prender(plantilla: string, prendida = true) {
  await sql`
    update follow_up_templates set approval_status = 'approved', automatic_send = ${prendida},
      template_name = ${plantilla},
      preview = 'Hola {{1}}, le recordamos su visita de mañana {{2}} en {{3}}. Ya tenemos listas sus llantas {{4}}.'
    where template_key = ${plantilla}
  `;
}

beforeAll(async () => {
  await ensureSchema();
});

beforeEach(async () => {
  plantillas.length = 0;
  ultimaSync = null;
  ventas = [];
  await sql`delete from recordatorios_visita`;
  await sql`delete from conversations`;
  await sql`update follow_up_templates set automatic_send = false`;
});

describe("recordatorio de la víspera", () => {
  it("con «Envío automático» apagado no sale nada", async () => {
    await conversacion();
    await prender("recordatorio_visita_v1", false);
    expect(await barrerRecordatorios("recordatorio", VISPERA)).toBeNull();
    expect(plantillas).toHaveLength(0);
  });

  it("sale uno por visita, con las variables del negocio, aunque el bucle pase dos veces", async () => {
    const id = await conversacion();
    await prender("recordatorio_visita_v1");
    const r1 = await barrerRecordatorios("recordatorio", VISPERA);
    const r2 = await barrerRecordatorios("recordatorio", new Date(VISPERA.getTime() + 15 * 60_000));
    expect(r1?.enviados).toBe(1);
    expect(r2?.enviados).toBe(0);
    expect(plantillas).toHaveLength(1);
    // Depot tiene dos locales: el local va como variable.
    expect(plantillas[0].variables).toEqual(["María", "viernes", "Depot Tire Cumbayá", "195/65R15"]);
    expect(plantillas[0].actor).toBe("visit_reminder");
    const [msg] = await sql<{ content: string }[]>`select content from messages where conversation_id = ${id}`;
    expect(msg.content).toBe("Hola María, le recordamos su visita de mañana viernes en Depot Tire Cumbayá. Ya tenemos listas sus llantas 195/65R15.");
  });

  it("Sprint 4 (1456): sin cotización no afirma «ya tenemos listas sus llantas»: no sale", async () => {
    await conversacion({ sinCotizacion: true });
    await prender("recordatorio_visita_v1");
    const r = await barrerRecordatorios("recordatorio", VISPERA);
    expect(r).toMatchObject({ enviados: 0, omitidos: 1 });
    expect(plantillas).toHaveLength(0);
  });

  it("no sale fuera de la tarde", async () => {
    await conversacion();
    await prender("recordatorio_visita_v1");
    expect(await barrerRecordatorios("recordatorio", new Date("2026-11-19T15:00:00Z"))).toBeNull();
  });

  it("no le escribe a quien está conversando", async () => {
    await conversacion({ ultimoCliente: new Date(VISPERA.getTime() - 2 * 3_600_000) });
    await prender("recordatorio_visita_v1");
    const r = await barrerRecordatorios("recordatorio", VISPERA);
    expect(r).toMatchObject({ enviados: 0, omitidos: 1 });
  });

  it("no le escribe a una venta ya ganada", async () => {
    await conversacion({ stage: "ganado" });
    await prender("recordatorio_visita_v1");
    expect((await barrerRecordatorios("recordatorio", VISPERA))?.enviados).toBe(0);
  });
});

describe("«no llegó» del día siguiente", () => {
  it("sin facturas recientes no sale: no se puede saber si vino", async () => {
    await conversacion();
    await prender("visita_no_llego_v1");
    const r = await barrerRecordatorios("no_llego", DIA_DESPUES);
    expect(r).toMatchObject({ enviados: 0, omitidos: 1 });
    expect(plantillas).toHaveLength(0);
  });

  it("sale a quien no compró, y no a quien compró", async () => {
    const vino = await conversacion();
    await conversacion();
    await prender("visita_no_llego_v1");
    ultimaSync = new Date(DIA_DESPUES.getTime() - 3_600_000);
    ventas = [{ ticketId: vino, dia: "2026-11-20" }];
    const r = await barrerRecordatorios("no_llego", DIA_DESPUES);
    expect(r).toMatchObject({ enviados: 1, omitidos: 1 });
    expect(plantillas[0].variables).toEqual(["María", "Depot Tire Cumbayá", "195/65R15"]);
  });

  it("no sale si el cliente escribió desde el día de la visita", async () => {
    await conversacion({ ultimoCliente: new Date("2026-11-20T20:00:00Z") });
    await prender("visita_no_llego_v1");
    ultimaSync = new Date(DIA_DESPUES.getTime() - 3_600_000);
    expect((await barrerRecordatorios("no_llego", DIA_DESPUES))?.enviados).toBe(0);
  });
});
