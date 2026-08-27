import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * EL SALVAVIDAS, CON EL CLASIFICADOR FORZADO A DECIR «PERDIDO».
 *
 * El caso real (conv 3, 27-ago 22:30): sobre una cotización de $821.53 el
 * cliente escribió «chuta ta carisisimo oe» y el clasificador cerró la venta.
 * Cerrar deja `status='closed'` y el mensaje siguiente reabre en un ciclo nuevo,
 * borrando medida, producto, cantidad y cotización — por eso el bot terminó
 * pidiendo la medida que ya tenía.
 *
 * Acá se prueba el CABLEADO, no solo la función pura: se le hace decir
 * «perdido» al modelo y se comprueba que la conversación sobreviva. Sin esto
 * solo sabríamos que `puedeCerrarComoPerdido` opina bien, no que alguien la
 * escucha.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_cierre_perdido_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

/** El clasificador siempre dice «perdido»: es el peor caso posible. */
vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: async () => ({
          choices: [{ message: { content: JSON.stringify({ stage: "perdido" }) } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      },
    };
  },
}));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { classifyStage } = await import("../src/agent/classifier.js");

interface Fila { id: number; phone: string; name: string; stage: string; current_cycle: number }

async function conversacionConCotizacion(phone: string): Promise<Fila> {
  const [fila] = await sql<Fila[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, selected_quantity)
    values (${phone}, 'Manuel', 'open', 'cotizacion_enviada', 1, '215/75R14', 8)
    returning id, phone, name, stage, current_cycle
  `;
  return fila;
}

const estado = (id: number) => sql<{ stage: string; status: string; tire_size: string | null }[]>`
  select stage, status, tire_size from conversations where id=${id}
`;

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("el clasificador no cierra una venta por una queja de precio", () => {
  it("EL BUG: «chuta ta carisisimo oe» ya no cierra la conversación", async () => {
    const fila = await conversacionConCotizacion("593980007001");
    await classifyStage(fila as never, "chuta ta carisisimo oe", "Le entiendo, son 8 llantas…");

    const [despues] = await estado(fila.id);
    expect(despues.stage).toBe("cotizacion_enviada");
    expect(despues.status).toBe("open");
    // Y lo que importa de verdad: la medida sigue ahí para el turno siguiente.
    expect(despues.tire_size).toBe("215/75R14");
  });

  it("tampoco las otras formas de decir que está caro", async () => {
    for (const [i, texto] of ["uf que caro", "no me alcanza", "es mucha plata"].entries()) {
      const fila = await conversacionConCotizacion(`59398000710${i}`);
      await classifyStage(fila as never, texto, "…");
      const [despues] = await estado(fila.id);
      expect(despues.stage, texto).toBe("cotizacion_enviada");
      expect(despues.tire_size, texto).toBe("215/75R14");
    }
  });

  it("EL CASO QUE NO DEBE DISPARAR: un rechazo de verdad SÍ cierra", async () => {
    const fila = await conversacionConCotizacion("593980007005");
    await classifyStage(fila as never, "no me interesa, gracias", "…");

    const [despues] = await estado(fila.id);
    expect(despues.stage).toBe("perdido");
  });

  it("y «ya compré en otro lado» también", async () => {
    const fila = await conversacionConCotizacion("593980007006");
    await classifyStage(fila as never, "ya compre en otro lado", "…");
    expect((await estado(fila.id))[0].stage).toBe("perdido");
  });
});
