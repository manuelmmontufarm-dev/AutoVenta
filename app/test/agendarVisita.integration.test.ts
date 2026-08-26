/**
 * `agendar_visita`: el bot escribe lo que promete.
 *
 * Antes del 26-ago la fecha de visita solo entraba por una expresión regular
 * que corría ANTES del modelo. El 24-ago el cliente escribió «X eso el juebes»,
 * el modelo entendió y contestó «Listo, jueves de 4 a 5 pm», la regex no
 * reconoció el typo — y la visita no existió para nadie: ni aviso al asesor, ni
 * cupón, y dos seguimientos preguntándole otra vez el día.
 *
 * La regex ahora tolera faltas, pero esta herramienta es el arreglo de fondo:
 * ninguna promesa del chat depende de que un patrón adivine igual que el
 * modelo. Si el bot lo dice, el bot lo escribe.
 */
import { beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";
process.env.GRAPH_BASE_URL ||= "http://127.0.0.1:9";

const BASE = `autoventa_agendar_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { buildTools } = await import("../src/agent/tools.js");

interface Fila { id: number; current_cycle: number }

async function conversacion(phone: string): Promise<Fila> {
  const [fila] = await sql<Fila[]>`
    insert into conversations (phone, name, status, stage, current_cycle)
    values (${phone}, 'Cesar', 'open', 'seguimiento_venta', 1)
    returning id, current_cycle
  `;
  return fila;
}

function agendar(fila: Fila, phone: string, texto: string) {
  const tools = buildTools({
    conversation: { id: fila.id, current_cycle: fila.current_cycle } as never,
    customerPhone: phone,
    customerName: "Cesar",
    currentUserText: texto,
  });
  const tool = tools.find((t) => t.function.name === "agendar_visita");
  if (!tool) throw new Error("agendar_visita no está registrada");
  return tool;
}

async function hechos(id: number) {
  const [fila] = await sql<{
    visit_date: Date | null; visit_time_label: string | null;
    nearest_store: string | null; customer_commitment: string | null;
  }[]>`
    select visit_date, visit_time_label, nearest_store, customer_commitment
    from conversations where id = ${id}
  `;
  return fila;
}

beforeAll(async () => {
  await ensureSchema();
});

describe("agendar_visita", () => {
  it("registra el día que el modelo entendió, con su hora y su local", async () => {
    const phone = "593980002001";
    const fila = await conversacion(phone);

    const salida = JSON.parse(
      await agendar(fila, phone, "X eso el juebes").execute({
        dia: "jueves", franja: "de 4 a 5 pm", local: "Depot Tire Quito Sur",
      }),
    );

    expect(salida.visita_registrada).toBe(true);
    const estado = await hechos(fila.id);
    expect(estado.visit_date).toBeInstanceOf(Date);
    expect(estado.visit_time_label).toBe("de 4 a 5 pm");
    expect(estado.nearest_store).toBe("Depot Tire Quito Sur");
    // La hora que dijo el cliente, no el relleno de las 10:00.
    expect(estado.visit_date!.toISOString()).toMatch(/T21:00:00/);
    expect(salida.mensaje_para_enviar).toMatch(/le esperamos/i);
    expect(salida.regla).toMatch(/no vuelvas a preguntar/i);
  });

  /*
   * El aviso al asesor es la razón de ser de todo el cierre: es lo que el
   * 24-ago no ocurrió. Que la herramienta lo dispare sola —y no dependa de que
   * otra capa se acuerde— es la mitad del arreglo.
   */
  it("avisa al asesor en la misma llamada", async () => {
    const phone = "593980002002";
    const fila = await conversacion(phone);
    await agendar(fila, phone, "el savado voy").execute({
      dia: "sábado", franja: null, local: "Depot Tire Cumbayá",
    });

    const [alerta] = await sql<{ summary: string }[]>`
      select summary from bot_alerts
      where conversation_id = ${fila.id} and type = 'visita_comprometida'
    `;
    expect(alerta?.summary).toMatch(/sábado/i);
  });

  it("con hora pero sin día, anota la franja y pide solo la fecha", async () => {
    const phone = "593980002003";
    const fila = await conversacion(phone);

    const salida = JSON.parse(
      await agendar(fila, phone, "de 4 a 5 puedo").execute({
        dia: "", franja: "de 4 a 5 pm", local: null,
      }),
    );

    expect(salida.visita_registrada).toBe(false);
    expect(salida.mensaje_para_enviar).toMatch(/¿Qué día sería\?/);
    const estado = await hechos(fila.id);
    expect(estado.visit_date).toBeNull();
    expect(estado.visit_time_label).toBe("de 4 a 5 pm");
  });

  /*
   * La hora dicha un turno antes se pega al día dicho ahora — que es como habla
   * la gente: primero «de 4 a 5», después «el juebes».
   */
  it("junta la hora del turno anterior con el día de este", async () => {
    const phone = "593980002004";
    const fila = await conversacion(phone);
    await agendar(fila, phone, "de 4 a 5 puedo").execute({
      dia: "", franja: "de 4 a 5 pm", local: null,
    });
    await agendar(fila, phone, "X eso el juebes").execute({
      dia: "jueves", franja: null, local: "Depot Tire Quito Sur",
    });

    const estado = await hechos(fila.id);
    expect(estado.visit_date!.toISOString()).toMatch(/T21:00:00/);
    expect(estado.visit_time_label).toBe("de 4 a 5 pm");
  });

  it("sin día ni hora no inventa nada y lo dice", async () => {
    const phone = "593980002005";
    const fila = await conversacion(phone);
    const salida = JSON.parse(
      await agendar(fila, phone, "ya le aviso").execute({ dia: "", franja: null, local: null }),
    );
    expect(salida.error).toMatch(/No entendí/);
    expect((await hechos(fila.id)).visit_date).toBeNull();
  });

  /*
   * Reagendar es información nueva, no un duplicado: el día tiene que moverse.
   */
  it("un cambio de día reemplaza al anterior", async () => {
    const phone = "593980002006";
    const fila = await conversacion(phone);
    await agendar(fila, phone, "el martes").execute({ dia: "martes", franja: null, local: null });
    const primero = (await hechos(fila.id)).visit_date!.toISOString();
    await agendar(fila, phone, "mejor el viernes").execute({ dia: "viernes", franja: null, local: null });
    const segundo = (await hechos(fila.id)).visit_date!.toISOString();

    expect(segundo).not.toBe(primero);
  });
});
