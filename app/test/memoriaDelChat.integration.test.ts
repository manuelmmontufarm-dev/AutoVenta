/**
 * EL «HOLA» QUE RECIBIÓ LA GUÍA DE MEDIDAS SIN SALUDO (conv 3, 31-ago-2026).
 *
 * El cliente volvió a escribir tras días de silencio y el bot, con el ciclo
 * viejo a cuestas, arrancó con herramientas en vez de presentarse. Dos causas:
 * `lastOutboundText` miraba TODOS los ciclos (el candado del primer contacto
 * nunca veía «conversación sin salientes»), y no existía ningún corte de
 * memoria por silencio. Aquí se prueba la cadena real contra una base de
 * verdad: el reinicio a las 15 h, que el candado del primer contacto queda
 * armado después, y que un chat activo NO se reinicia.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = `autoventa_memoria_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let conversations: typeof import("../src/services/conversations.js");
let firstContact: typeof import("../src/domain/firstContact.js");

/** Lunes 31-ago-2026, 12:36 en Guayaquil — el minuto del «hola» real. */
const AHORA = new Date("2026-08-31T17:36:22.000Z");
const hace = (horas: number) => new Date(AHORA.getTime() - horas * 3_600_000);

/** Una conversación con una compra a medio camino y su último cruce de mensajes. */
async function conversacionConHistoria(
  phone: string,
  ultimoDelCliente: Date,
  ultimoNuestro: Date,
) {
  const conv = await conversations.getOrCreateConversation(phone, "Manuel");
  await appSql`
    update conversations
    set stage = 'cotizado', tire_size = '195/55R16', vehicle = 'Kia Rio',
        last_customer_message_at = ${ultimoDelCliente},
        last_assistant_message_at = ${ultimoNuestro}
    where id = ${conv.id}
  `;
  await appSql`
    insert into messages (conversation_id, cycle, role, direction, type, content, created_at)
    values
      (${conv.id}, 1, 'user', 'inbound', 'text', 'necesito 195/55R16', ${ultimoDelCliente}),
      (${conv.id}, 1, 'assistant', 'outbound', 'text',
       '¿A cuál local le queda mejor pasar, Cumbayá o Quito Sur?', ${ultimoNuestro})
  `;
  return conversations.getOrCreateConversation(phone);
}

describe.sequential("la memoria del chat caduca a las 15 horas", () => {
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
    firstContact = await import("../src/domain/firstContact.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  it("tras 16 horas de silencio el «hola» encuentra un ciclo limpio y el saludo armado", async () => {
    const conv = await conversacionConHistoria("593900000201", hace(16), hace(16));

    const trasElCorte = await conversations.reiniciarSiLaMemoriaVencio(conv, AHORA);

    // Ciclo nuevo, ficha olvidada, de vuelta al arranque.
    expect(trasElCorte.current_cycle).toBe(conv.current_cycle + 1);
    expect(trasElCorte.stage).toBe("nuevo");
    expect(trasElCorte.status).toBe("open");
    const [ficha] = await appSql<{ tire_size: string | null; vehicle: string | null }[]>`
      select tire_size, vehicle from conversations where id = ${conv.id}
    `;
    expect(ficha.tire_size).toBeNull();
    expect(ficha.vehicle).toBeNull();

    // El candado del primer contacto: las TRES condiciones de index.ts quedan
    // dadas — etapa nueva, ningún saliente en el ciclo vigente, saludo genérico.
    expect(await conversations.lastOutboundText(conv.id)).toBeNull();
    expect(firstContact.isGenericFirstContact("hola")).toBe(true);

    // Y el ciclo viejo quedó archivado, no perdido en el aire.
    const [archivo] = await appSql<{ outcome: string }[]>`
      select outcome from sales_history where conversation_id = ${conv.id} and cycle = ${conv.current_cycle}
    `;
    expect(archivo?.outcome).toBe("perdido");
  });

  it("un chat activo no se toca: cotizar de noche y confirmar en la mañana es la misma compra", async () => {
    const conv = await conversacionConHistoria("593900000202", hace(14), hace(14));

    const igual = await conversations.reiniciarSiLaMemoriaVencio(conv, AHORA);

    expect(igual.current_cycle).toBe(conv.current_cycle);
    const [ficha] = await appSql<{ tire_size: string | null; stage: string }[]>`
      select tire_size, stage from conversations where id = ${conv.id}
    `;
    expect(ficha.tire_size).toBe("195/55R16");
    expect(ficha.stage).toBe("cotizado");
    // Y como hay un saliente en el ciclo vigente, el saludo de primer contacto
    // NO se dispararía: al agente le toca seguir la venta, no presentarse.
    expect(await conversations.lastOutboundText(conv.id)).not.toBeNull();
  });

  it("el seguimiento del bot refresca el reloj aunque el cliente lleve días callado", async () => {
    const conv = await conversacionConHistoria("593900000203", hace(40), hace(2));

    const igual = await conversations.reiniciarSiLaMemoriaVencio(conv, AHORA);

    expect(igual.current_cycle).toBe(conv.current_cycle);
  });

  /*
   * Medido en producción el 31-ago: 1085 chats que atiende un asesor llevaban
   * más de 15 h en silencio. Olvidar el contexto es una cosa; arrebatarle la
   * conversación al asesor que la está trabajando, otra muy distinta.
   */
  it("el asesor no pierde su chat: se olvida la memoria, no el dueño", async () => {
    const conv = await conversacionConHistoria("593900000205", hace(20), hace(20));
    const pausaLarga = new Date(AHORA.getTime() + 30 * 3_600_000);
    await appSql`
      update conversations
      set assigned_to = 'human', bot_paused_until = ${pausaLarga}
      where id = ${conv.id}
    `;

    const trasElCorte = await conversations.reiniciarSiLaMemoriaVencio(conv, AHORA);

    // La memoria sí caducó…
    expect(trasElCorte.current_cycle).toBe(conv.current_cycle + 1);
    const [fila] = await appSql<
      { tire_size: string | null; assigned_to: string; bot_paused_until: Date | null }[]
    >`
      select tire_size, assigned_to, bot_paused_until from conversations where id = ${conv.id}
    `;
    expect(fila.tire_size).toBeNull();
    // …pero el chat sigue siendo del asesor, con su pausa intacta.
    expect(fila.assigned_to).toBe("human");
    expect(fila.bot_paused_until?.toISOString()).toBe(pausaLarga.toISOString());
    expect(await conversations.isBotPaused(trasElCorte)).toBe(true);
  });

  it("dos mensajes que entran a la vez reinician UNA sola vez", async () => {
    const conv = await conversacionConHistoria("593900000204", hace(20), hace(20));

    const [a, b] = await Promise.all([
      conversations.reiniciarSiLaMemoriaVencio(conv, AHORA),
      conversations.reiniciarSiLaMemoriaVencio(conv, AHORA),
    ]);

    // Uno de los dos cierra y reabre; el otro no encuentra nada que cerrar. En
    // el peor de los casos ambos devuelven el ciclo nuevo, pero NUNCA se salta
    // un ciclo de más.
    expect(Math.max(a.current_cycle, b.current_cycle)).toBe(conv.current_cycle + 1);
    const [fila] = await appSql<{ current_cycle: number }[]>`
      select current_cycle from conversations where id = ${conv.id}
    `;
    expect(fila.current_cycle).toBe(conv.current_cycle + 1);
  });
});
