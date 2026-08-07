/**
 * El interruptor global del bot, contra Postgres.
 *
 * Es una función de seguridad: cuando el dueño lo apaga, tiene que dejar de
 * hablar **por las dos vías** (respuesta automática y seguimientos), y tiene
 * que hacerlo rápido. Las tres cosas que se comprueban aquí son las que, si se
 * rompen, dejan al bot escribiéndole a clientes reales cuando nadie quería:
 *
 * 1. Por defecto está encendido — no se puede nacer mudo por accidente.
 * 2. Apagado, el worker de seguimientos no reclama ni un job, pero **sigue
 *    latiendo**: apagado ≠ caído, y confundirlos dispara una alerta falsa.
 * 3. El cambio se ve desde otro proceso en segundos, no cuando caduque un cache
 *    largo. El worker corre aparte y no comparte memoria con la API.
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const testDatabase = `autoventa_botpower_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let botPower: typeof import("../src/services/botPower.js");

let conversations: typeof import("../src/services/conversations.js");
let worker: typeof import("../src/workers/followUpWorker.js");
let resumeBot: typeof import("../src/services/resumeBot.js");

const AHORA = new Date("2026-08-01T15:00:00.000Z");

describe.sequential("Interruptor global del bot", () => {
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
    // El cache real dura 5 s; aquí basta con comprobar que caduca y relee.
    process.env.BOT_POWER_CACHE_MS = "50";

    appSql = (await import("../src/db/client.js")).sql;
    await (await import("../src/db/schema.js")).ensureSchema();
    botPower = await import("../src/services/botPower.js");

    conversations = await import("../src/services/conversations.js");
    worker = await import("../src/workers/followUpWorker.js");
    resumeBot = await import("../src/services/resumeBot.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  beforeEach(async () => {
    await botPower.setBotPower({ activo: true });
  });

  it("nace encendido: sin fila en settings, el bot responde", async () => {
    await appSql`delete from settings where key = 'bot_power'`;
    // setBotPower cachea; leer desde cero es lo que replica un arranque limpio.
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(await botPower.isBotActive()).toBe(true);
  });

  /**
   * Un cliente recién conectado recibe mensajes reales en el webhook antes de
   * que su catálogo y su prompt estén listos. BOT_POWER_DEFAULT=off es lo que
   * permite dejar el deploy en pie sin que conteste hasta que el dueño lo
   * encienda a mano.
   */
  describe("instalación que nace apagada (BOT_POWER_DEFAULT=off)", () => {
    beforeEach(async () => {
      await appSql`delete from settings where key = 'bot_power'`;
      process.env.BOT_POWER_DEFAULT = "off";
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    afterEach(() => {
      delete process.env.BOT_POWER_DEFAULT;
    });

    it("sin fila en settings, el bot no contesta", async () => {
      expect(await botPower.isBotActive()).toBe(false);
    });

    it("no dice «apagado desde», porque nunca estuvo encendido", async () => {
      const power = await botPower.getBotPower();
      expect(power.apagadoAt).toBeNull();
      expect(power.motivo).toBeTruthy();
    });

    it("encenderlo desde el panel manda sobre el default y se queda encendido", async () => {
      await botPower.setBotPower({ activo: true });
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(await botPower.isBotActive()).toBe(true);
    });
  });

  it("apagar guarda la marca de tiempo y el motivo; encender sin motivo los limpia", async () => {
    const apagado = await botPower.setBotPower({ activo: false, motivo: "catálogo desactualizado" });
    expect(apagado.activo).toBe(false);
    expect(apagado.motivo).toBe("catálogo desactualizado");
    expect(apagado.apagadoAt).not.toBeNull();

    const encendido = await botPower.setBotPower({ activo: true });
    expect(encendido.activo).toBe(true);
    expect(encendido.apagadoAt).toBeNull();
    // Sin motivo nuevo no se arrastra el del apagado: describiría lo contrario.
    expect(encendido.motivo).toBe("");
  });

  /**
   * El motivo describe el estado ACTUAL, no solo el apagado. Antes se borraba
   * al encender y el aviso a los asesores («ya está el catálogo») se quedaba
   * sin nada que contar.
   */
  it("encender CON motivo lo conserva", async () => {
    await botPower.setBotPower({ activo: false, motivo: "probando" });
    const encendido = await botPower.setBotPower({ activo: true, motivo: "ya está el catálogo" });
    expect(encendido.motivo).toBe("ya está el catálogo");
    expect(encendido.apagadoAt).toBeNull();
  });

  it("apagar dos veces no mueve la marca del primer apagado", async () => {
    const primero = await botPower.setBotPower({ activo: false, motivo: "uno" });
    const segundo = await botPower.setBotPower({ activo: false, motivo: "dos" });
    expect(segundo.apagadoAt).toBe(primero.apagadoAt);
  });

  it("apagado, el worker no procesa ningún seguimiento pero sigue latiendo", async () => {
    const conversation = await conversations.getOrCreateConversation("593980000009", "Cliente prueba");
    await appSql`
      insert into follow_up_jobs (conversation_id, cycle, type, due_at, idempotency_key)
      values (
        ${conversation.id}, 1, 'sin_respuesta',
        ${new Date(AHORA.getTime() - 60_000)}, ${`apagado-${conversation.id}`}
      )
    `;

    await botPower.setBotPower({ activo: false, motivo: "prueba" });

    let procesados = 0;
    const hechos = await worker.runFollowUpWorkerOnce(
      async () => { procesados += 1; },
      { workerId: "test-apagado", clock: () => AHORA },
    );

    expect(hechos).toBe(0);
    expect(procesados).toBe(0);

    // El latido es lo que /health mira: apagado no debe verse como caído.
    const [latido] = await appSql<{ value: { at?: string } }[]>`
      select value from settings where key = 'follow_up_worker_heartbeat'
    `;
    expect(latido?.value?.at).toBeTruthy();
  });

  /**
   * La tercera vía por la que el bot puede hablar: devolver el chat al bot
   * desde el panel. Con el interruptor apagado tiene que callar igual que las
   * otras dos — si no, el panel dice "apagado" mientras sale un mensaje.
   */
  it("apagado, devolver una conversación al bot no genera respuesta", async () => {
    const conversation = await conversations.getOrCreateConversation("593980000011", "Cliente prueba");
    await conversations.appendMessage(conversation.id, "user", "¿Tienen 205/55R16?");
    await botPower.setBotPower({ activo: false, motivo: "prueba" });

    // Sin el corte, esto llamaría al agente y enviaría por Meta.
    expect(await resumeBot.resumeBotIfUnanswered(conversation.id)).toBe("bot_off");

    const [{ count }] = await appSql<{ count: string }[]>`
      select count(*) from messages
      where conversation_id = ${conversation.id} and direction = 'outbound'
    `;
    expect(Number(count)).toBe(0);
  });

  it("el apagado se ve desde otro proceso en segundos, no minutos", async () => {
    expect(await botPower.isBotActive()).toBe(true);
    // Escritura directa: simula que la API apagó el bot en OTRO proceso, donde
    // invalidar el cache en memoria de este no es posible.
    await appSql`
      insert into settings (key, value)
      values ('bot_power', ${appSql.json({ activo: false, apagadoAt: AHORA.toISOString(), motivo: "" })})
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `;
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(await botPower.isBotActive()).toBe(false);
  });
});
