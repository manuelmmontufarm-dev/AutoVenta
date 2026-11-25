import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

/**
 * «EL BOT NO RESPONDIÓ»: UN AVISO A SOPORTE, NO TREINTA (24-nov-2026).
 *
 * Se acabó el crédito de OpenAI de 16:35 a 17:58: 13 chats sin respuesta y a
 * Manuel no le sonó el teléfono. Lo que se prueba acá, contra una base real:
 *
 *  · con el bot caído y 30 mensajes entrando a la vez, sale UN aviso;
 *  · le llega a soporte (usuario `manuel`) por la app y por WhatsApp, no a los
 *    asesores del negocio;
 *  · hay un recordatorio espaciado y un aviso cuando vuelve;
 *  · el bot apagado a propósito y el chat en manos de un asesor NO avisan.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.BOT_POWER_CACHE_MS = "0";

const BASE = "autoventa_avisos_soporte_test";
process.env.DATABASE_URL = `postgresql://${process.env.USER}@localhost/${BASE}`;

const admin = postgres(`postgresql://${process.env.USER}@localhost/postgres`, { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

vi.mock("../src/wa/client.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/wa/client.js")>();
  return {
    ...real,
    sendAdvisorText: vi.fn(async () => "wamid.TEXTO"),
    sendAdvisorTemplate: vi.fn(async () => "wamid.PLANTILLA"),
  };
});

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const soporte = await import("../src/services/avisosASoporte.js");
const app = await import("../src/services/avisosEnLaApp.js");
const { setBotPower } = await import("../src/services/botPower.js");
const wa = await import("../src/wa/client.js");
const { PRIMER_RECORDATORIO_MS, RECORDATORIO_SIGUIENTE_MS, CALMA_PARA_CERRAR_MS } = await import("../src/domain/falloDelBot.js");

const MANUEL = "593990008763";
const ASESORA = "593990001111";
const SIN_CREDITO = Object.assign(
  new Error("429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/."),
  { status: 429 },
);

/** Lo que «sonó» en cada teléfono. */
let pushes: { endpoint: string; aviso: { titulo: string; cuerpo: string; ruta?: string } }[] = [];

async function conversacion(nombre = "Carla Mendoza"): Promise<number> {
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, last_customer_message_at)
    values (${`5939${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`}, ${nombre}, 'open', 'nuevo', 1, now())
    returning id
  `;
  return Number(fila.id);
}

const avisos = () => sql<{ clase: string; titulo: string; cuerpo: string; push_enviados: number; whatsapp: string }[]>`
  select clase, titulo, cuerpo, push_enviados, whatsapp from avisos_a_soporte order by id
`;

const T0 = new Date("2026-11-24T21:35:00.000Z");
const mas = (ms: number) => new Date(T0.getTime() + ms);

beforeAll(async () => {
  await ensureSchema();
  await sql`delete from advisors`;
  await sql`
    insert into advisors (nombre, telefono, rol, active, prioridad, ventana_hasta) values
      ('Manuel Montufar', ${MANUEL}, 'nivel-2', true, 1, now() + interval '10 hours'),
      ('Asesora del Local', ${ASESORA}, 'admin', true, 2, now() + interval '10 hours')
  `;
  // Manuel activó las notificaciones en dos aparatos; la asesora en uno.
  for (const [userId, nombre, telefono, endpoint] of [
    ["manuel", "Manuel Montufar", MANUEL, "https://push.example.test/manuel-iphone"],
    ["manuel", "Manuel Montufar", MANUEL, "https://push.example.test/manuel-mac"],
    ["asesora", "Asesora del Local", ASESORA, "https://push.example.test/asesora"],
  ] as const) {
    await app.guardarSuscripcion({
      userId, userName: nombre, advisorPhone: telefono,
      suscripcion: { endpoint, keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } },
    });
  }
  app._usarTransportePush(async (sub, cuerpo) => {
    pushes.push({ endpoint: sub.endpoint, aviso: JSON.parse(cuerpo) });
  });
});

beforeEach(async () => {
  pushes = [];
  vi.mocked(wa.sendAdvisorText).mockClear();
  vi.mocked(wa.sendAdvisorTemplate).mockClear();
  await sql`delete from avisos_a_soporte`;
  await sql`delete from incidentes_del_bot`;
  await sql`update advisors set ventana_hasta = now() + interval '10 hours'`;
  await setBotPower({ activo: true });
  soporte.olvidarIncidentesAbiertos();
});

describe("el bot no respondió", () => {
  it("OpenAI sin crédito y 30 mensajes entrando a la vez: UN aviso a Manuel, con cliente, causa y chat", async () => {
    const chats = await Promise.all(Array.from({ length: 30 }, (_, i) => conversacion(`Cliente ${i + 1}`)));
    const resultados = await Promise.all(
      chats.map((conversationId) => soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId, ahora: T0 })),
    );

    expect(resultados.filter((r) => r === "abrir")).toHaveLength(1);
    expect(resultados.filter((r) => r === "nada")).toHaveLength(29);

    const filas = await avisos();
    expect(filas).toHaveLength(1);
    expect(filas[0].clase).toBe("caida");
    expect(filas[0].titulo).toMatch(/^🔴 .+: el bot no está respondiendo$/);
    expect(filas[0].cuerpo).toMatch(/^Se acabó el crédito de OpenAI\. Chat afectado: Cliente \d+ \(5939\d{8}\)\. Recarga en platform\.openai\.com/);

    // Por la app: a los DOS aparatos de Manuel y a nadie más.
    expect(pushes.map((p) => p.endpoint).sort()).toEqual([
      "https://push.example.test/manuel-iphone", "https://push.example.test/manuel-mac",
    ]);
    expect(pushes[0].aviso.ruta).toMatch(/^#\/ticket\/\d+$/);
    // Por WhatsApp: un solo mensaje, a Manuel, no a la asesora.
    expect(wa.sendAdvisorText).toHaveBeenCalledTimes(1);
    expect(vi.mocked(wa.sendAdvisorText).mock.calls[0][1]).toBe(MANUEL);
    expect(vi.mocked(wa.sendAdvisorText).mock.calls[0][0]).toContain("el bot no está respondiendo");
    expect(filas[0]).toMatchObject({ push_enviados: 2, whatsapp: "texto" });

    // El incidente recuerda los 30 chats que quedaron sin respuesta.
    const [incidente] = await sql<{ fallos: number; conversaciones: string[]; estado: string; causa: string }[]>`
      select fallos, conversaciones, estado, causa from incidentes_del_bot
    `;
    expect(incidente).toMatchObject({ fallos: 30, estado: "abierto", causa: "sin_credito" });
    expect(incidente.conversaciones).toHaveLength(30);
  });

  it("mientras sigue caído: un recordatorio a la media hora y el siguiente recién a las dos horas", async () => {
    const chat = await conversacion();
    await soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId: chat, ahora: T0 });
    // 20 fallos más durante la primera media hora: silencio.
    for (let i = 1; i <= 20; i += 1) {
      expect(await soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId: await conversacion(), ahora: mas(i * 60_000) })).toBe("nada");
    }
    expect(await avisos()).toHaveLength(1);

    // Se cumple la media hora y entran dos fallos juntos: UN recordatorio.
    const [a, b] = await Promise.all([
      soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId: await conversacion(), ahora: mas(PRIMER_RECORDATORIO_MS) }),
      soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId: await conversacion(), ahora: mas(PRIMER_RECORDATORIO_MS) }),
    ]);
    expect([a, b].sort()).toEqual(["nada", "recordar"]);
    let filas = await avisos();
    expect(filas.map((f) => f.clase)).toEqual(["caida", "recordatorio"]);
    expect(filas[1].titulo).toMatch(/el bot SIGUE sin responder$/);
    expect(filas[1].cuerpo).toMatch(/Van 2[2-3] chats sin respuesta en 30 min/);

    // Una hora después del recordatorio: nada. A las dos horas: el segundo.
    const recordado = PRIMER_RECORDATORIO_MS;
    expect(await soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId: chat, ahora: mas(recordado + 60 * 60_000) })).toBe("nada");
    expect(await soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId: chat, ahora: mas(recordado + RECORDATORIO_SIGUIENTE_MS) })).toBe("recordar");
    filas = await avisos();
    expect(filas.map((f) => f.clase)).toEqual(["caida", "recordatorio", "recordatorio"]);
  });

  it("cuando vuelve a responder: un solo «volvió», con cuánto duró y cuántos chats quedaron", async () => {
    const chats = [await conversacion(), await conversacion(), await conversacion()];
    for (const [i, c] of chats.entries()) {
      await soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId: c, ahora: mas(i * 60_000) });
    }
    const ultimoFallo = 2 * 60_000;
    // Un acierto pegado al último fallo no alcanza (un límite intermitente lo abriría y cerraría cada minuto).
    soporte.olvidarIncidentesAbiertos();
    expect(await soporte.reportarBotResponde("ia", mas(ultimoFallo + 20_000))).toBe(false);
    // Que le llegue un mensaje al cliente tampoco: no dice que OpenAI haya vuelto.
    soporte.olvidarIncidentesAbiertos();
    expect(await soporte.reportarBotResponde("turno", mas(83 * 60_000))).toBe(false);
    expect(await avisos()).toHaveLength(1);

    // El modelo contesta a los 83 minutos, y dos turnos aciertan a la vez.
    soporte.olvidarIncidentesAbiertos();
    const cierres = await Promise.all([
      soporte.reportarBotResponde("ia", mas(83 * 60_000)),
      soporte.reportarBotResponde("ia", mas(83 * 60_000)),
    ]);
    expect(cierres.filter(Boolean)).toHaveLength(1);
    const filas = await avisos();
    expect(filas.map((f) => f.clase)).toEqual(["caida", "vuelta"]);
    expect(filas[1].titulo).toMatch(/^🟢 .+: el bot volvió a responder$/);
    expect(filas[1].cuerpo).toContain("Estuvo sin responder 1 h 23 min");
    expect(filas[1].cuerpo).toContain("3 chats quedaron sin respuesta");
    expect(CALMA_PARA_CERRAR_MS).toBeGreaterThan(20_000);

    // Con todo cerrado, los aciertos siguientes no hacen nada.
    expect(await soporte.reportarBotResponde("ia", mas(90 * 60_000))).toBe(false);
    expect(await avisos()).toHaveLength(2);

    // Y si se vuelve a caer después, es un incidente nuevo: avisa otra vez.
    expect(await soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId: chats[0], ahora: mas(120 * 60_000) })).toBe("abrir");
    expect((await avisos()).map((f) => f.clase)).toEqual(["caida", "vuelta", "caida"]);
  });

  it("WhatsApp rechaza el envío: avisa, y se cierra cuando un mensaje vuelve a salir (no cuando el modelo contesta)", async () => {
    const chat = await conversacion();
    const rechazo = new Error("No se pudo enviar el mensaje: el token de WhatsApp expiró o es inválido. Actualízalo en Ajustes → Canal.");
    expect(await soporte.reportarFalloDelBot({ causa: "envio_rechazado", error: rechazo, conversationId: chat, ahora: T0 })).toBe("abrir");
    const [caida] = await avisos();
    expect(caida.cuerpo).toMatch(/^WhatsApp rechazó el mensaje del bot\./);
    soporte.olvidarIncidentesAbiertos();
    expect(await soporte.reportarBotResponde("ia", mas(10 * 60_000))).toBe(false);
    soporte.olvidarIncidentesAbiertos();
    expect(await soporte.reportarBotResponde("turno", mas(10 * 60_000))).toBe(true);
    expect((await avisos()).map((f) => f.clase)).toEqual(["caida", "vuelta"]);
  });
});

describe("lo que NO es un fallo", () => {
  it("el bot apagado a propósito: ningún aviso, ningún incidente", async () => {
    await setBotPower({ activo: false, motivo: "probando el catálogo" });
    const chat = await conversacion();
    expect(await soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId: chat, ahora: T0 })).toBe("nada");
    expect(await soporte.reportarFalloDelBot({ causa: "error_interno", error: new Error("x"), conversationId: chat, ahora: T0 })).toBe("nada");
    expect(await avisos()).toHaveLength(0);
    expect(await sql`select 1 from incidentes_del_bot`).toHaveLength(0);
    expect(pushes).toHaveLength(0);
    expect(wa.sendAdvisorText).not.toHaveBeenCalled();
  });

  it("un asesor tiene el control del chat (o el bot está en pausa ahí): ningún aviso", async () => {
    const tomado = await conversacion();
    await sql`update conversations set assigned_to = 'human' where id = ${tomado}`;
    const pausado = await conversacion();
    await sql`update conversations set bot_paused_until = ${mas(60 * 60_000)} where id = ${pausado}`;
    expect(await soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId: tomado, ahora: T0 })).toBe("nada");
    expect(await soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId: pausado, ahora: T0 })).toBe("nada");
    expect(await avisos()).toHaveLength(0);
    expect(pushes).toHaveLength(0);

    // La pausa vencida ya no protege: ahí sí le tocaba al bot.
    expect(await soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId: pausado, ahora: mas(2 * 60 * 60_000) })).toBe("abrir");
  });
});

describe("por dónde le llega", () => {
  it("con la ventana de 24 h de Manuel cerrada, el WhatsApp sale como plantilla (el texto libre rebotaría con el 131047)", async () => {
    await sql`update advisors set ventana_hasta = now() - interval '2 hours' where telefono = ${MANUEL}`;
    await soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId: await conversacion(), ahora: T0 });
    expect(wa.sendAdvisorText).not.toHaveBeenCalled();
    expect(wa.sendAdvisorTemplate).toHaveBeenCalledTimes(1);
    const enviado = vi.mocked(wa.sendAdvisorTemplate).mock.calls[0][0];
    expect(enviado.to).toBe(MANUEL);
    expect(enviado.variables[0]).toBe("Manuel");
    expect(enviado.variables[1]).toContain("el bot no está respondiendo · Se acabó el crédito de OpenAI");
    expect(enviado.variables[1]).not.toContain("\n");
    expect((await avisos())[0]).toMatchObject({ push_enviados: 2, whatsapp: "plantilla" });
  });

  it("si WhatsApp también está caído, la app sola alcanza; y queda anotado que el WhatsApp falló", async () => {
    vi.mocked(wa.sendAdvisorText).mockRejectedValueOnce(new Error("WhatsApp rechazó el mensaje: token inválido"));
    expect(await soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId: await conversacion(), ahora: T0 })).toBe("abrir");
    expect(pushes).toHaveLength(2);
    expect((await avisos())[0]).toMatchObject({ push_enviados: 2, whatsapp: "fallo" });
  });

  it("no depende de los niveles de Ajustes → Avisos: el nivel de Manuel no recibe NADA y el aviso sale igual", async () => {
    const { saveNivelesAviso, getNivelesAviso } = await import("../src/services/advisorNotifications.js");
    // Como en Depot: Manuel está en un nivel propio, y ese nivel no tiene ni un aviso marcado.
    await saveNivelesAviso([...(await getNivelesAviso()), { id: "nivel-2", nombre: "Sin avisos", eventos: [], generales: [] }]);
    expect(await soporte.reportarFalloDelBot({ error: SIN_CREDITO, conversationId: await conversacion(), ahora: T0 })).toBe("abrir");
    expect(pushes).toHaveLength(2);
    expect(wa.sendAdvisorText).toHaveBeenCalledTimes(1);
  });
});
