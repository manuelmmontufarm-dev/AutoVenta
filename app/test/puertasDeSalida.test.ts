/**
 * LAS PUERTAS POR LAS QUE EL BOT LE HABLA A UN CLIENTE.
 *
 * El 27-ago se tapó la fuga del JSON crudo: el resultado de una herramienta que
 * terminó SIENDO la respuesta y le llegó tal cual al cliente. Se tapó en
 * `index.ts` — la puerta de la respuesta normal.
 *
 * Pero `sendCustomerText` se llama desde CUATRO sitios, y `resumeBot` (el bot
 * retomando un chat que atendió un humano) llama al MISMO `runAgent` con las
 * MISMAS herramientas y corría UNO solo de los ocho candados. O sea: la misma
 * fuga, viva, por la puerta de al lado. Lo mismo con el aviso de stock corto.
 *
 * Esta prueba mira las puertas laterales, no la principal: que lo que sale por
 * `resumeBotIfUnanswered` pase por la misma cadena que lo que sale por el turno
 * normal, y que el seguimiento fuera de ventana siga saliendo INTACTO (su texto
 * lo fija Meta y no se puede tocar).
 */
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const EL_JSON_DE_LA_HERRAMIENTA =
  '{"motivo":"caso_sin_resolver","resumen":"Cliente con cotización ya enviada de 4 × FALKEN ZE310R 205/55R16."}';

/** Lo que el modelo devuelve en el turno bajo prueba. */
const respuestaDelModelo = { texto: "" };
/** Lo que de verdad salió hacia el teléfono del cliente. */
const enviados: string[] = [];
/** Cada borrador que vio el Ángel Guardián, para probar que también corre aquí. */
const revisados: string[] = [];
/** Lo que el redactor de seguimientos devuelve en el caso bajo prueba. */
const copiaDelSeguimiento = { texto: "" };

vi.mock("../src/agent/agent.js", () => ({
  runAgent: vi.fn(async () => respuestaDelModelo.texto),
}));

vi.mock("../src/agent/classifier.js", () => ({
  classifyStage: vi.fn(async () => undefined),
}));

vi.mock("../src/wa/client.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/wa/client.js")>();
  return {
    ...real,
    sendCustomerText: vi.fn(async (_id: number, _phone: string, body: string) => {
      enviados.push(body);
      return "wamid.test";
    }),
  };
});

// El guardián de IA cuesta tokens: aquí pasa el texto tal cual, pero deja
// constancia de que lo VIO — que corra en esta puerta es parte de lo que se prueba.
vi.mock("../src/services/guardian.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/services/guardian.js")>();
  return {
    ...real,
    revisarConGuardian: vi.fn(async (_conv: unknown, borrador: string) => {
      revisados.push(borrador);
      return { texto: borrador, veredicto: "sin_cambios", hallazgos: [] };
    }),
  };
});

// El redactor del seguimiento cuesta tokens: aquí se le dicta el borrador.
vi.mock("../src/services/followUps.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/services/followUps.js")>();
  return {
    ...real,
    ensureFollowUpJobCopy: vi.fn(async () => ({ text: copiaDelSeguimiento.texto })),
  };
});

const testDatabase = `autoventa_puertas_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let resumeBot: typeof import("../src/services/resumeBot.js");
let followUps: typeof import("../src/services/followUps.js");
let processor: typeof import("../src/services/followUpProcessor.js");
let prepararSalida: typeof import("../src/services/prepararSalida.js").prepararSalida;

/** Conversación con un mensaje del cliente sin contestar, lista para que el bot retome. */
async function conversacionHuerfana(telefono: string, texto: string): Promise<number> {
  const [conv] = await appSql<{ id: number; current_cycle: number }[]>`
    insert into conversations (phone, name, status, assigned_to, last_customer_message_at)
    values (${telefono}, ${"Prueba"}, 'open', 'bot', now())
    returning id, current_cycle
  `;
  await appSql`
    insert into messages (conversation_id, role, content, direction, type, author_kind, status, cycle)
    values (${conv.id}, 'user', ${texto}, 'inbound', 'text', 'customer', 'received', ${conv.current_cycle})
  `;
  return Number(conv.id);
}

describe.sequential("las puertas por las que el bot le habla a un cliente", () => {
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
    resumeBot = await import("../src/services/resumeBot.js");
    followUps = await import("../src/services/followUps.js");
    processor = await import("../src/services/followUpProcessor.js");
    prepararSalida = (await import("../src/services/prepararSalida.js")).prepararSalida;
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  beforeEach(() => {
    enviados.length = 0;
    revisados.length = 0;
  });

  describe("el bot retomando un chat que atendió un humano", () => {
    it("el JSON de una herramienta NO le llega al cliente", async () => {
      respuestaDelModelo.texto = EL_JSON_DE_LA_HERRAMIENTA;
      const id = await conversacionHuerfana(`593900000${process.pid % 1000}1`, "¿y entonces?");

      expect(await resumeBot.resumeBotIfUnanswered(id)).not.toBe("bot_off");

      const todo = enviados.join("\n");
      expect(todo).not.toContain("caso_sin_resolver");
      expect(todo).not.toContain('"motivo"');
    });

    it("el bloque bueno sobrevive aunque el otro fuera JSON", async () => {
      respuestaDelModelo.texto = `${EL_JSON_DE_LA_HERRAMIENTA}\n---\n¿Qué día puede pasar?`;
      const id = await conversacionHuerfana(`593900000${process.pid % 1000}2`, "¿y entonces?");

      await resumeBot.resumeBotIfUnanswered(id);

      const todo = enviados.join("\n");
      expect(todo).toContain("¿Qué día puede pasar?");
      expect(todo).not.toContain("caso_sin_resolver");
    });

    it("el Ángel Guardián también revisa lo que sale al retomar", async () => {
      respuestaDelModelo.texto = "Le confirmo el total en un momento.";
      const id = await conversacionHuerfana(`593900000${process.pid % 1000}3`, "¿cuánto era?");

      await resumeBot.resumeBotIfUnanswered(id);

      expect(revisados).toContain("Le confirmo el total en un momento.");
    });

    it("la pregunta de más también se quita al retomar", async () => {
      respuestaDelModelo.texto = "Tengo la FALKEN en stock. ¿Cuántas llantas necesita?";
      const id = await conversacionHuerfana(`593900000${process.pid % 1000}4`, "¿tiene?");

      await resumeBot.resumeBotIfUnanswered(id);

      const todo = enviados.join("\n");
      expect(todo).toContain("FALKEN");
      expect(todo).not.toMatch(/cuántas llantas/i);
    });
  });

  describe("el seguimiento automático", () => {
    /** Lunes 24-ago-2026, 14:58 en Guayaquil: dentro de horario comercial. */
    const LUNES = new Date("2026-08-24T16:58:20.000Z");
    const TRES_HORAS_DESPUES = new Date("2026-08-24T19:58:20.000Z");

    async function seguimientoListo(telefono: string): Promise<void> {
      const conv = await appSql<{ id: number }[]>`
        insert into conversations (phone, name, stage, status, assigned_to,
          tire_size, nearest_store, customer_opt_in,
          last_customer_message_at, last_assistant_message_at)
        values (${telefono}, 'Prueba', 'seguimiento_venta', 'open', 'bot',
          '235/75R15', 'Depot Tire Quito Sur', true,
          ${new Date(LUNES.getTime() - 60_000)}, ${new Date(LUNES.getTime() - 30_000)})
        returning id
      `;
      const id = Number(conv[0].id);
      await appSql`
        insert into messages (conversation_id, cycle, role, direction, type, content)
        values (${id}, 1, 'assistant', 'outbound', 'text', ${"¿Qué día le queda mejor?"})
      `;
      await followUps.scheduleConversationFollowUps(id, LUNES);
    }

    async function correrLosJobs(): Promise<void> {
      for (const job of await followUps.claimDueFollowUpJobs({ now: TRES_HORAS_DESPUES, limit: 10 })) {
        await processor.processFollowUpJob(job, {
          now: () => TRES_HORAS_DESPUES,
          sendText: async (_id: number, _phone: string, body: string) => {
            enviados.push(body);
            return "wamid.test";
          },
          sendTemplate: async () => "wamid.template",
        });
      }
    }

    it("el JSON de una herramienta tampoco viaja en un seguimiento", async () => {
      copiaDelSeguimiento.texto = `${EL_JSON_DE_LA_HERRAMIENTA}\n---\n¿Le confirmo el día?`;
      await seguimientoListo(`593900000${process.pid % 1000}5`);

      await correrLosJobs();

      expect(enviados.length).toBeGreaterThan(0);
      const todo = enviados.join("\n");
      expect(todo).toContain("¿Le confirmo el día?");
      expect(todo).not.toContain("caso_sin_resolver");
    });

    it("la pregunta de más también se quita en un seguimiento", async () => {
      copiaDelSeguimiento.texto = "Sigue vigente su cotización. ¿Cuántas llantas necesita?";
      await seguimientoListo(`593900000${process.pid % 1000}6`);

      await correrLosJobs();

      expect(enviados.length).toBeGreaterThan(0);
      expect(enviados.join("\n")).not.toMatch(/cuántas llantas/i);
    });
  });

  describe("la plantilla fuera de ventana", () => {
    /**
     * Su texto lo fija Meta y no se puede corregir. Pasa igual por la cadena
     * —con `tipo: "plantilla"`— para que no quede ninguna puerta suelta, pero
     * NINGÚN paso la toca: ni el guardián (sería tirar el dinero), ni los
     * candados deterministas (el texto no es nuestro).
     */
    it("sale byte por byte como entró", async () => {
      // A propósito con todo lo que los otros candados sí borrarían.
      const PLANTILLA =
        "Hola 👋 Su cotización COT-MT7H1534 sigue vigente. ¿Cuántas llantas necesita?";
      const salida = await prepararSalida(PLANTILLA, {
        conversation: { id: 1, current_cycle: 1, stage: "seguimiento_venta" },
        tipo: "plantilla",
      });

      expect(salida.texto).toBe(PLANTILLA);
      expect(salida.pasosCorridos).toEqual([]);
      expect(revisados).not.toContain(PLANTILLA);
    });
  });
});
