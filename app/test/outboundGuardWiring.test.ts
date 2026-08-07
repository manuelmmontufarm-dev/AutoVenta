import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

/**
 * Cableado REAL del guardián de salida contra una base Postgres de verdad.
 *
 * El núcleo puro (guardOutboundReply) ya está cubierto en outboundGuard.test.ts.
 * Lo que aquí se prueba es lo otro: que applyOutboundGuard ENCUENTRE el último
 * mensaje del bot en la DB y que la alerta guard_* SE INSERTE en bot_alerts.
 * Motivo: en producción lleva dos días con cero alertas guard_*, y eso puede
 * significar «el modelo ya no falla» o «el cableado está muerto». Sin esta
 * prueba no hay forma de distinguir una cosa de la otra.
 */

// La config se lee al importar: el entorno tiene que estar puesto ANTES de
// cualquier import dinámico de src/ (mismo patrón que outboundGuard.test.ts).
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";

const BASE = "autoventa_guard_test";
const ADMIN_URL = "postgresql://manue@localhost/postgres";
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

// Base efímera creada ANTES de importar el pool de la app (que se conecta con
// la URL vigente al importarse). Mismo esquema de scripts/eval/run.mjs.
const admin = postgres(ADMIN_URL, { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

// Único mock: notificar al asesor sale por WhatsApp a Meta. Ni `sql` ni
// `createBotAlert` se mockean — probar el cableado es exactamente probar esos.
vi.mock("../src/services/advisorNotifications.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/services/advisorNotifications.js")>();
  return { ...real, notifyAdvisor: vi.fn(async () => ({ sent: true, skipped: false })) };
});

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { applyOutboundGuard } = await import("../src/services/outboundGuard.js");

const APOLOGIA = "Disculpa, tuve un problema procesando tu mensaje. ¿Me lo repites por favor?";

/** Conversación nueva con teléfono irrepetible por caso. */
async function crearConversacion(telefono: string): Promise<{ id: number; cycle: number }> {
  const [fila] = await sql<{ id: number; current_cycle: number }[]>`
    insert into conversations (phone, name) values (${telefono}, ${`Test ${telefono}`})
    returning id, current_cycle
  `;
  return { id: Number(fila.id), cycle: fila.current_cycle };
}

/** Mensaje saliente del bot tal como lo guarda appendMessage() en producción. */
async function sembrarSalienteDelBot(conversationId: number, contenido: string): Promise<void> {
  await sql`
    insert into messages (
      conversation_id, role, content, direction, type, author_kind, status, cycle
    ) values (
      ${conversationId}, 'assistant', ${contenido}, 'outbound', 'text', 'bot', 'sent',
      (select current_cycle from conversations where id = ${conversationId})
    )
  `;
}

async function alertasDe(conversationId: number): Promise<{ type: string; priority: string }[]> {
  return sql<{ type: string; priority: string }[]>`
    select type, priority from bot_alerts where conversation_id = ${conversationId}
  `;
}

beforeAll(async () => {
  await ensureSchema();
}, 60_000);

afterAll(async () => {
  await sql.end();
  const cierre = postgres(ADMIN_URL, { prepare: false, max: 1 });
  await cierre.unsafe(`drop database if exists ${BASE}`);
  await cierre.end();
});

describe("applyOutboundGuard contra la base real", () => {
  it("la segunda disculpa no sale y queda la alerta guard_bot_atascado", async () => {
    const conv = await crearConversacion("593900000001");
    await sembrarSalienteDelBot(conv.id, APOLOGIA);

    const resultado = await applyOutboundGuard(conv.id, APOLOGIA);

    expect(resultado.text).toBeNull();
    expect(resultado.issues).toContain("bot_atascado");
    // La alerta se crea con `void async`: no está lista al volver de la llamada.
    await vi.waitFor(async () => {
      const alertas = await alertasDe(conv.id);
      expect(alertas).toEqual([{ type: "guard_bot_atascado", priority: "high" }]);
    }, { timeout: 5_000, interval: 100 });
  });

  it("el pedido de foto pasa intacto y NO alerta (visión activa desde el 6-ago)", async () => {
    const conv = await crearConversacion("593900000002");
    await sembrarSalienteDelBot(conv.id, "En 225/65R17 tengo Falken Wildpeak A/T 🛞");

    const pedido = "¿Me puede enviar una foto del costado?";
    const resultado = await applyOutboundGuard(conv.id, pedido);

    expect(resultado.text).toBe(pedido);
    expect(resultado.issues).toEqual([]);
    // Margen por si una alerta se insertara tarde: censurar esto era el bug.
    await new Promise((r) => setTimeout(r, 400));
    expect(await alertasDe(conv.id)).toEqual([]);
  });

  it("sin mensajes previos del bot, el saludo inicial pasa intacto y no alerta", async () => {
    const conv = await crearConversacion("593900000003");
    const saludo = "¡Hola! Con gusto le ayudo. ¿Qué medida necesita?";

    const resultado = await applyOutboundGuard(conv.id, saludo);

    expect(resultado.text).toBe(saludo);
    expect(resultado.issues).toEqual([]);
    // Margen por si una alerta se insertara tarde: aquí no debe haber ninguna.
    await new Promise((listo) => setTimeout(listo, 300));
    expect(await alertasDe(conv.id)).toEqual([]);
  });

  it("solo mira el ciclo vigente: una disculpa del ciclo anterior no cuenta", async () => {
    const conv = await crearConversacion("593900000004");
    await sembrarSalienteDelBot(conv.id, APOLOGIA);
    // El ciclo avanza cuando el cliente vuelve tras cerrarse el ticket; lo de
    // antes es historia y no debe frenar la primera respuesta del ciclo nuevo.
    await sql`update conversations set current_cycle = current_cycle + 1 where id = ${conv.id}`;

    const resultado = await applyOutboundGuard(conv.id, APOLOGIA);

    expect(resultado.text).toBe(APOLOGIA);
    expect(resultado.issues).toEqual([]);
  });

  it("ignora los mensajes del cliente y del asesor al buscar el último del bot", async () => {
    const conv = await crearConversacion("593900000005");
    await sembrarSalienteDelBot(conv.id, APOLOGIA);
    await sql`
      insert into messages (conversation_id, role, content, direction, type, author_kind, cycle)
      values (${conv.id}, 'user', ${"¿hola?"}, 'inbound', 'text', 'customer', 1)
    `;

    const resultado = await applyOutboundGuard(conv.id, APOLOGIA);

    // El último mensaje de la conversación es del cliente, pero el último del
    // BOT sigue siendo la disculpa: el guardián tiene que frenar igual.
    expect(resultado.text).toBeNull();
    expect(resultado.issues).toContain("bot_atascado");
  });

  it("una conversación inexistente no rompe el envío", async () => {
    const resultado = await applyOutboundGuard(999_999_999, "Aquí están sus opciones 🛞");
    expect(resultado.text).toBe("Aquí están sus opciones 🛞");
    expect(resultado.issues).toEqual([]);
  });
});
