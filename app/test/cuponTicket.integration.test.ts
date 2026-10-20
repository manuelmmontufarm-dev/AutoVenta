/**
 * El ticket del cupón del 2 % (19-oct-2026), de punta a punta contra Postgres.
 *
 * Lo que se cuida aquí es lo que cuesta plata o confianza si falla: que no se
 * emita un cupón sin cotización, que el ticket salga UNA vez y solo el del
 * turno, que si la imagen falla el código llegue igual, que caja no honre uno
 * vencido, y que el seguimiento lo regale solo cuando es el ÚLTIMO.
 */
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const wa = vi.hoisted(() => ({
  imagenes: [] as Array<{ to: string; caption?: string; filename?: string; bytes: number; actor?: string }>,
  textos: [] as string[],
  falloImagen: false,
}));

vi.mock("../src/wa/client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/wa/client.js")>()),
  sendImage: async (_id: number, to: string, png: Buffer, caption?: string, filename?: string, actor?: string) => {
    if (wa.falloImagen) throw new Error("Meta rechazó la imagen");
    wa.imagenes.push({ to, caption, filename, bytes: png.length, actor });
    return `wamid.img.${wa.imagenes.length}`;
  },
  sendCustomerText: async (_id: number, _to: string, body: string) => {
    wa.textos.push(body);
    return `wamid.txt.${wa.textos.length}`;
  },
}));

vi.mock("../src/services/followUpCopy.js", () => ({
  generateFollowUpCopy: async () => ({ text: "Hola, ¿pudo revisar su cotización?", source: "ai" as const }),
}));

const testDatabase = `autoventa_cupon_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let conversations: typeof import("../src/services/conversations.js");
let coupons: typeof import("../src/services/coupons.js");
let settings: typeof import("../src/services/settings.js");
let followUps: typeof import("../src/services/followUps.js");
let processor: typeof import("../src/services/followUpProcessor.js");

/** Lunes 19-oct-2026, 10:00 en Quito → dentro del horario comercial. */
const AHORA = new Date("2026-10-19T15:00:00.000Z");
let siguienteTelefono = 0;

const ITEMS = [{
  brand: "FALKEN", design: "WILDPEAK A/T 4W", sizeLabel: "265/60R18", quantity: 4, code: "356401",
}];

async function conversacion(opciones: { cotizacion?: boolean; visita?: Date | null } = {}) {
  siguienteTelefono += 1;
  const phone = `59397${String(100000 + siguienteTelefono).padStart(6, "0")}`;
  const conv = await conversations.getOrCreateConversation(phone, `Cliente ${siguienteTelefono}`);
  await appSql`
    update conversations set stage = 'cotizacion_enviada', nearest_store = 'Cumbayá',
      visit_date = ${opciones.visita ?? null},
      last_customer_message_at = ${new Date(AHORA.getTime() - 3_600_000)},
      last_assistant_message_at = ${new Date(AHORA.getTime() - 3_540_000)},
      customer_opt_in = true
    where id = ${conv.id}
  `;
  if (opciones.cotizacion !== false) {
    await appSql`
      insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number)
      values (${conv.id}, 1, ${appSql.json(ITEMS)}, 862.02, 129.30, 991.32, ${`COT-T-${conv.id}`})
    `;
  }
  return { id: conv.id, phone };
}

describe.sequential("Ticket del cupón con QR", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.unsafe(`create database ${testDatabase}`);
    process.env.DATABASE_URL = `postgresql://manue@localhost/${testDatabase}`;
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";
    process.env.SELLER_PHONE = "593000000000";
    process.env.OPENAI_API_KEY = "test";
    process.env.GRAPH_BASE_URL = "http://127.0.0.1:9";

    appSql = (await import("../src/db/client.js")).sql;
    await (await import("../src/db/schema.js")).ensureSchema();
    conversations = await import("../src/services/conversations.js");
    coupons = await import("../src/services/coupons.js");
    settings = await import("../src/services/settings.js");
    followUps = await import("../src/services/followUps.js");
    processor = await import("../src/services/followUpProcessor.js");
    await settings.saveCouponConfig({ activo: true, porcentaje: 2 });
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  beforeEach(() => { wa.imagenes = []; wa.textos = []; wa.falloImagen = false; });

  it("sin cotización no hay cupón", async () => {
    const conv = await conversacion({ cotizacion: false });
    expect(await coupons.emitirCuponDeConfirmacion({ conversationId: conv.id, cycle: 1 })).toBeNull();
  });

  it("vale hasta una semana después de la visita, al final del día de Quito", async () => {
    // Visita el sábado 24-oct a las 10:00 de Quito.
    const conv = await conversacion({ visita: new Date("2026-10-24T15:00:00.000Z") });
    const cupon = await coupons.emitirCuponDeConfirmacion({ conversationId: conv.id, cycle: 1, ahora: AHORA });
    expect(cupon?.yaExistia).toBe(false);
    const [fila] = await appSql<{ valid_until: Date; motivo: string }[]>`
      select valid_until, motivo from confirmation_coupons where code = ${cupon!.codigo}
    `;
    expect(fila.motivo).toBe("visita");
    // Sábado 31-oct 23:59:59 en Quito = domingo 1-nov 04:59:59 UTC.
    expect(fila.valid_until.toISOString()).toBe("2026-11-01T04:59:59.000Z");
  });

  it("el ticket sale UNA vez, como imagen, con el código y el monto en la leyenda", async () => {
    const conv = await conversacion();
    const cupon = await coupons.emitirCuponDeConfirmacion({ conversationId: conv.id, cycle: 1 });
    const enviado = await coupons.enviarTicketDeCupon({ conversationId: conv.id, cycle: 1, to: conv.phone });
    expect(enviado).toBe(true);
    expect(wa.imagenes).toHaveLength(1);
    expect(wa.imagenes[0].bytes).toBeGreaterThan(20_000);
    expect(wa.imagenes[0].caption).toContain(`*${cupon!.codigo}*`);
    // 2 % de $991.32 = $19.83.
    expect(wa.imagenes[0].caption).toContain("$19.83 menos");
    expect(wa.imagenes[0].caption).not.toMatch(/COT-|356401/);

    expect(await coupons.enviarTicketDeCupon({ conversationId: conv.id, cycle: 1, to: conv.phone })).toBe(false);
    expect(wa.imagenes).toHaveLength(1);

    const [mensaje] = await appSql<{ type: string; metadata: Record<string, unknown> }[]>`
      select type, metadata from messages where conversation_id = ${conv.id} and direction = 'outbound'
    `;
    expect(mensaje.type).toBe("image");
    expect(mensaje.metadata.couponCode).toBe(cupon!.codigo);
  });

  it("un turno no manda el cupón que se emitió antes que él", async () => {
    const conv = await conversacion();
    await coupons.emitirCuponDeConfirmacion({ conversationId: conv.id, cycle: 1 });
    await appSql`update confirmation_coupons set issued_at = now() - interval '3 hours' where conversation_id = ${conv.id}`;
    const enviado = await coupons.enviarTicketDeCupon({
      conversationId: conv.id, cycle: 1, to: conv.phone, emitidoDesde: new Date(Date.now() - 30_000),
    });
    expect(enviado).toBe(false);
    expect(wa.imagenes).toHaveLength(0);
  });

  it("si la imagen falla, el código llega igual como texto", async () => {
    wa.falloImagen = true;
    const conv = await conversacion();
    const cupon = await coupons.emitirCuponDeConfirmacion({ conversationId: conv.id, cycle: 1 });
    expect(await coupons.enviarTicketDeCupon({ conversationId: conv.id, cycle: 1, to: conv.phone })).toBe(true);
    expect(wa.textos).toHaveLength(1);
    expect(wa.textos[0]).toContain(cupon!.codigo);
  });

  it("caja no honra un cupón vencido", async () => {
    const conv = await conversacion();
    const cupon = await coupons.emitirCuponDeConfirmacion({ conversationId: conv.id, cycle: 1 });
    await appSql`update confirmation_coupons set valid_until = now() - interval '1 day' where code = ${cupon!.codigo}`;
    const consulta = await coupons.consultarCupon(cupon!.codigo);
    expect(consulta.ok).toBe(false);
    expect(consulta.ok ? null : consulta.motivo).toBe("vencido");
  });

  describe("el último seguimiento lo regala", () => {
    async function procesar(convId: number, tipo: "in_window_first" | "in_window_second") {
      await appSql`
        update follow_up_jobs set due_at = ${new Date(AHORA.getTime() - 60_000)}
        where conversation_id = ${convId} and type = ${tipo} and status = 'scheduled'
      `;
      const jobs = await followUps.claimDueFollowUpJobs({ now: AHORA, limit: 10 });
      for (const job of jobs) {
        await processor.processFollowUpJob(job, {
          now: () => AHORA,
          sendText: async () => "wamid.seguimiento",
          sendTemplate: async () => "wamid.template",
        });
      }
    }

    it("con otro seguimiento detrás todavía, no", async () => {
      const conv = await conversacion();
      await followUps.scheduleConversationFollowUps(conv.id, AHORA);
      const [segundo] = await appSql<{ count: number }[]>`
        select count(*)::int as count from follow_up_jobs
        where conversation_id = ${conv.id} and type = 'in_window_second' and status = 'scheduled'
      `;
      expect(segundo.count).toBe(1);
      await procesar(conv.id, "in_window_first");
      expect(wa.imagenes).toHaveLength(0);
      const [cupones] = await appSql<{ count: number }[]>`
        select count(*)::int as count from confirmation_coupons where conversation_id = ${conv.id}
      `;
      expect(cupones.count).toBe(0);
    });

    it("en el último, sí: «usted fue seleccionado» con el monto", async () => {
      const conv = await conversacion();
      await followUps.scheduleConversationFollowUps(conv.id, AHORA);
      await appSql`
        update follow_up_jobs set status = 'cancelled'
        where conversation_id = ${conv.id} and type = 'in_window_second'
      `;
      await procesar(conv.id, "in_window_first");
      expect(wa.imagenes).toHaveLength(1);
      expect(wa.imagenes[0].actor).toBe("worker");
      expect(wa.imagenes[0].caption).toMatch(/seleccionado para un 2 % adicional/);
      expect(wa.imagenes[0].caption).toContain("$19.83 menos");
      const [fila] = await appSql<{ motivo: string }[]>`
        select motivo from confirmation_coupons where conversation_id = ${conv.id}
      `;
      expect(fila.motivo).toBe("seguimiento");
    });

    it("sin cotización, el último seguimiento no regala nada", async () => {
      const conv = await conversacion({ cotizacion: false });
      await followUps.scheduleConversationFollowUps(conv.id, AHORA);
      await appSql`
        update follow_up_jobs set status = 'cancelled'
        where conversation_id = ${conv.id} and type = 'in_window_second'
      `;
      await procesar(conv.id, "in_window_first");
      expect(wa.imagenes).toHaveLength(0);
    });

    it("quien ya tiene cupón por su visita no recibe un segundo", async () => {
      const conv = await conversacion();
      await coupons.emitirCuponDeConfirmacion({ conversationId: conv.id, cycle: 1 });
      await coupons.enviarTicketDeCupon({ conversationId: conv.id, cycle: 1, to: conv.phone });
      wa.imagenes = [];
      await followUps.scheduleConversationFollowUps(conv.id, AHORA);
      await appSql`
        update follow_up_jobs set status = 'cancelled'
        where conversation_id = ${conv.id} and type = 'in_window_second'
      `;
      await procesar(conv.id, "in_window_first");
      expect(wa.imagenes).toHaveLength(0);
    });
  });
});
