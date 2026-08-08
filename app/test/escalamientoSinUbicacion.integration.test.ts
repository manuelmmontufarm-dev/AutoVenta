import { beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

/**
 * Escalar no puede depender de un pin de ubicación.
 *
 * El 8-ago un cliente de Yantzaza (Zamora Chinchipe) pidió despacho después de
 * recibir su cotización. El bot contestó «podemos revisar el envío con un
 * asesor» y le pidió el pin. Nadie se enteró nunca: notificar_vendedor exigía
 * `location_label` y `nearest_store`, y ese cliente no tenía ni podía tener un
 * local recomendado — vive a 600 km del más cercano.
 *
 * Lo que se prueba aquí es esa asimetría: la ubicación sigue siendo requisito
 * para COORDINAR una visita, y deja de serlo para AVISAR de un caso que el bot
 * no puede resolver solo.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = "autoventa_escalamiento_test";
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

// Solo se simula el envío por WhatsApp: la guarda y el registro del aviso son
// justo lo que se quiere probar, así que notifyAdvisor corre de verdad.
const enviados: string[] = [];
vi.mock("../src/wa/client.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/wa/client.js")>();
  return {
    ...real,
    sendAdvisorText: vi.fn(async (texto: string) => {
      enviados.push(texto);
      return "wamid.TEST";
    }),
  };
});

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { buildTools } = await import("../src/agent/tools.js");

interface Fila {
  id: number;
  current_cycle: number;
}

/** Conversación con cotización enviada y sin ubicación: el caso de Yantzaza. */
async function conversacionSinUbicacion(phone: string): Promise<Fila> {
  const [fila] = await sql<Fila[]>`
    insert into conversations (phone, name, status, stage, current_cycle)
    values (${phone}, 'Cliente Yantzaza', 'open', 'cotizacion_enviada', 1)
    returning id, current_cycle
  `;
  return fila;
}

function herramienta(conversation: Record<string, unknown>, phone: string) {
  const tools = buildTools({
    conversation: conversation as never,
    customerPhone: phone,
    customerName: "Cliente Yantzaza",
    currentUserText: "Es para que me envíe a Zamora Chinchipe cantón Yantzaza",
  });
  const tool = tools.find((t) => t.function.name === "notificar_vendedor");
  if (!tool) throw new Error("notificar_vendedor no está registrada");
  return tool;
}

beforeAll(async () => {
  await ensureSchema();
});

describe("escalar sin ubicación", () => {
  it("avisa al asesor cuando pide envío fuera de cobertura, sin pin ni local", async () => {
    const phone = "593980000001";
    const fila = await conversacionSinUbicacion(phone);
    enviados.length = 0;

    const salida = await herramienta({ id: fila.id, current_cycle: fila.current_cycle }, phone)
      .execute({
        motivo: "envio_fuera_de_cobertura",
        resumen: "4 × Kenda KR203 175/70R14, COT-MSKHUINH, quiere despacho a Yantzaza",
      });

    expect(JSON.parse(salida)).toMatchObject({ notificado: true });
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatch(/despacho fuera de cobertura/i);
    expect(enviados[0]).toMatch(/Yantzaza/);

    const [aviso] = await sql<{ event_type: string; status: string }[]>`
      select event_type, status from advisor_notifications where conversation_id = ${fila.id}
    `;
    expect(aviso).toMatchObject({ event_type: "envio_fuera_de_cobertura", status: "sent" });

    // Escalar no es avanzar en el embudo: sigue esperando respuesta sobre el envío.
    const [conv] = await sql<{ stage: string }[]>`
      select stage from conversations where id = ${fila.id}
    `;
    expect(conv.stage).toBe("cotizacion_enviada");
  });

  it("sigue exigiendo ubicación y local para coordinar una compra", async () => {
    const phone = "593980000002";
    const fila = await conversacionSinUbicacion(phone);
    enviados.length = 0;

    const salida = await herramienta({ id: fila.id, current_cycle: fila.current_cycle }, phone)
      .execute({ motivo: "compra", resumen: "Confirmó 4 llantas" });

    expect(JSON.parse(salida).error).toMatch(/ubicación/i);
    expect(enviados).toHaveLength(0);
  });

  it("un cliente que pide un humano llega al asesor aunque no haya dicho dónde vive", async () => {
    const phone = "593980000003";
    const fila = await conversacionSinUbicacion(phone);
    enviados.length = 0;

    const salida = await herramienta({ id: fila.id, current_cycle: fila.current_cycle }, phone)
      .execute({ motivo: "pide_humano", resumen: "Pide hablar con una persona" });

    expect(JSON.parse(salida)).toMatchObject({ notificado: true });
    expect(enviados[0]).toMatch(/hablar con un asesor/i);
  });

  it("no repite el aviso si el cliente insiste en el mismo ciclo", async () => {
    const phone = "593980000004";
    const fila = await conversacionSinUbicacion(phone);
    enviados.length = 0;
    const tool = herramienta({ id: fila.id, current_cycle: fila.current_cycle }, phone);

    await tool.execute({ motivo: "envio_fuera_de_cobertura", resumen: "Quiere envío a Yantzaza" });
    await tool.execute({ motivo: "envio_fuera_de_cobertura", resumen: "Insiste con el envío" });

    expect(enviados).toHaveLength(1);
  });
});
