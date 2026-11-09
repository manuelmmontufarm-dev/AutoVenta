import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * El saludo fijo no pisa al cliente que ya escribió (auditoría 9-nov-2026,
 * bloque B). La línea de tiempo de la conv 39899 del 7-nov:
 *
 *   16:48:22  «¡Hola! Quiero más información»      (anuncio)
 *   16:48:34  vence el debounce de 12 s → arranca el turno del saludo
 *   16:48:36  presentación · 16:48:37 promo
 *   16:48:37  «Precio en 245/75/16»                  ← llega a la cola, turno 2
 *   16:48:41  «Puede mandarme la medida escrita…»    ← el bug
 *
 * Reloj controlado: el reloj de la prueba solo avanza cuando la prueba lo dice
 * (`vi.setSystemTime`), y cada mensaje del cliente entra a la base con su hora.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_saludo_fijo_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { bloqueDelSaludoFijoVigente, clienteEscribioDespuesDe } = await import("../src/services/saludoFijo.js");
const { pedidoDeMedidaDelPrimerContacto, firstContactReply } = await import("../src/domain/firstContact.js");
const { InboundPipeline } = await import("../src/pipeline/inbound.js");
const { config } = await import("../src/config.js");

const PEDIDO = pedidoDeMedidaDelPrimerContacto();
const [LINEA_PEDIDO, LINEA_MEDIDA] = PEDIDO.split("\n\n");

async function conversacion(phone: string): Promise<number> {
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle)
    values (${phone}, 'Alejandro', 'open', 'nuevo', 1) returning id
  `;
  return fila.id;
}

async function clienteDijo(id: number, texto: string): Promise<number> {
  const [fila] = await sql<{ id: number }[]>`
    insert into messages (conversation_id, role, content, direction, type, cycle, author_kind)
    values (${id}, 'user', ${texto}, 'inbound', 'text', 1, 'customer') returning id
  `;
  return Number(fila.id);
}

const ultimoEntrante = async (id: number) =>
  Number((await sql<{ id: number }[]>`select max(id) as id from messages where conversation_id=${id} and direction='inbound'`)[0].id);

beforeAll(async () => {
  await ensureSchema();
});
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe("el pedido de medida del saludo fijo", () => {
  it("39899: «Precio en 245/75/16» entra mientras sale la promo → el pedido NO sale", async () => {
    const id = await conversacion("593900000401");
    await clienteDijo(id, "¡Hola! Quiero más información");
    const alEmpezar = await ultimoEntrante(id); // lo que el turno del saludo está contestando
    // Durante la presentación y la promo entra la medida (turno 2).
    await clienteDijo(id, "Precio en 245/75/16");

    expect(await clienteEscribioDespuesDe(id, alEmpezar)).toBe(true);
    // Los dos bloques en que `prepararSalida` parte el pedido.
    expect(await bloqueDelSaludoFijoVigente(id, alEmpezar, LINEA_PEDIDO)).toBeNull();
    expect(await bloqueDelSaludoFijoVigente(id, alEmpezar, LINEA_MEDIDA)).toBeNull();
    // Y el pedido entero, si no se parte.
    expect(await bloqueDelSaludoFijoVigente(id, alEmpezar, PEDIDO)).toBeNull();
  });

  it("un «Hola» pelado sin nada más sigue recibiendo el pedido de medida, completo", async () => {
    const id = await conversacion("593900000402");
    await clienteDijo(id, "Hola");
    const alEmpezar = await ultimoEntrante(id);

    expect(await clienteEscribioDespuesDe(id, alEmpezar)).toBe(false);
    expect(await bloqueDelSaludoFijoVigente(id, alEmpezar, LINEA_PEDIDO)).toBe(LINEA_PEDIDO);
    expect(await bloqueDelSaludoFijoVigente(id, alEmpezar, LINEA_MEDIDA)).toBe(LINEA_MEDIDA);
    expect(await bloqueDelSaludoFijoVigente(id, alEmpezar, PEDIDO)).toBe(PEDIDO);
  });

  it("40074: tres mensajes dentro de los 12 s son UN turno → el pedido no se omite por ellos", async () => {
    const id = await conversacion("593900000403");
    await clienteDijo(id, "hola");
    await clienteDijo(id, "Q opciones tiene en 265/65R18");
    await clienteDijo(id, "En AT");
    // El turno arranca con TODOS ya guardados: lo que contesta incluye los tres.
    const alEmpezar = await ultimoEntrante(id);
    expect(await clienteEscribioDespuesDe(id, alEmpezar)).toBe(false);
  });

  it("1750: cualquier cosa que escriba cuenta, aunque no traiga medida («Donde estan»)", async () => {
    const id = await conversacion("593900000404");
    await clienteDijo(id, "Hola buenas");
    const alEmpezar = await ultimoEntrante(id);
    await clienteDijo(id, "Donde estan");
    expect(await bloqueDelSaludoFijoVigente(id, alEmpezar, PEDIDO)).toBeNull();
  });

  it("sin promo (bienvenida entera en un bloque): sale la presentación y se calla solo el pedido", async () => {
    const id = await conversacion("593900000405");
    await clienteDijo(id, "Hola");
    const alEmpezar = await ultimoEntrante(id);
    await clienteDijo(id, "225/70R16");

    const bienvenida = firstContactReply();
    const vigente = await bloqueDelSaludoFijoVigente(id, alEmpezar, bienvenida);
    expect(vigente).not.toBeNull();
    expect(vigente).toContain("Le cotizo al instante");
    expect(vigente).not.toContain("Puede mandarme la medida escrita");
    expect(vigente).not.toContain("¿Qué medida usa?");
  });

  it("un mensaje de OTRA conversación no cuenta", async () => {
    const a = await conversacion("593900000406");
    const b = await conversacion("593900000407");
    await clienteDijo(a, "Hola");
    const alEmpezar = await ultimoEntrante(a);
    await clienteDijo(b, "225/70R16");
    expect(await bloqueDelSaludoFijoVigente(a, alEmpezar, PEDIDO)).toBe(PEDIDO);
  });
});

describe("la premisa de tiempos: el segundo mensaje llega DESPUÉS del debounce de 12 s", () => {
  it("«Hola» y la medida 13 s después son dos turnos; con 5 s de por medio, uno solo", async () => {
    vi.useFakeTimers();
    try {
      const turnos: string[][] = [];
      const pipeline = new InboundPipeline(async (job) => {
        turnos.push(job.text.split("\n"));
      });
      expect(config.pipeline.debounceMs).toBe(12_000);

      pipeline.push("593900000410", "wamid.A1", "Hola");
      await vi.advanceTimersByTimeAsync(13_000);
      pipeline.push("593900000410", "wamid.A2", "Precio en 245/75/16");
      await vi.advanceTimersByTimeAsync(13_000);
      expect(turnos).toEqual([["Hola"], ["Precio en 245/75/16"]]);

      turnos.length = 0;
      pipeline.push("593900000411", "wamid.B1", "Hola");
      await vi.advanceTimersByTimeAsync(5_000);
      pipeline.push("593900000411", "wamid.B2", "Precio en 245/75/16");
      await vi.advanceTimersByTimeAsync(13_000);
      expect(turnos).toEqual([["Hola", "Precio en 245/75/16"]]);
    } finally {
      vi.useRealTimers();
    }
  });
});
