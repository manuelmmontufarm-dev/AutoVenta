import { beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

/**
 * La ubicación se manda; no se cuenta.
 *
 * El 18-ago Manuel trajo dos capturas del mismo problema: el bot despachando la
 * ubicación en párrafos —«Estamos en Quito Sur y Cumbayá. Quito Sur: Galo Molina
 * y Av. Alonso de Angulo. Cumbayá: C.C. La del Establo y Av. Oswaldo
 * Guayasamín…»— y repitiéndolos cada vez que se hablaba de la visita. En una de
 * ellas el cliente pidió literalmente «ayúdeme con la ubicación por este medio»
 * y recibió la calle escrita, no el mapa; el asesor terminó mandando el link a
 * mano esa misma noche.
 *
 * Lo que se prueba aquí: el único camino a la ubicación es el link de Maps, y
 * el turno aprovecha para cerrar el día y el local que faltan.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = "autoventa_ubicacion_test";
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { buildTools } = await import("../src/agent/tools.js");
const { buildSystemPrompt } = await import("../src/agent/prompts.js");
const { extractExplicitStore, preguntamosElLocal } = await import("../src/domain/storeSelection.js");
const { extractCustomerCommitment, preguntamosElDia } = await import("../src/domain/customerCommitment.js");

/** Las calles de los dos locales, tal como salían escritas en el chat. */
const CALLES = /Galo Molina|Alonso de Angulo|La del Establo|Guayasam[ií]n/;

interface Fila {
  id: number;
  current_cycle: number;
}

async function conversacion(phone: string): Promise<Fila> {
  const [fila] = await sql<Fila[]>`
    insert into conversations (phone, name, status, stage, current_cycle)
    values (${phone}, 'Cliente', 'open', 'cotizacion_enviada', 1)
    returning id, current_cycle
  `;
  return fila;
}

function herramientaLlamada(nombre: string, fila: Fila, phone: string, texto: string) {
  const tools = buildTools({
    conversation: { id: fila.id, current_cycle: fila.current_cycle } as never,
    customerPhone: phone,
    customerName: "Cliente",
    currentUserText: texto,
  });
  const tool = tools.find((t) => t.function.name === nombre);
  if (!tool) throw new Error(`${nombre} no está registrada`);
  return tool;
}

function herramienta(fila: Fila, phone: string, texto = "ayúdeme con la ubicación por este medio") {
  return herramientaLlamada("ubicacion_locales", fila, phone, texto);
}

beforeAll(async () => {
  await ensureSchema();
});

describe("ubicacion_locales", () => {
  it("manda los dos links y pregunta el día y el local, sin escribir una sola calle", async () => {
    const phone = "593980001001";
    const fila = await conversacion(phone);

    const salida = JSON.parse(await herramienta(fila, phone).execute({ local: null }));
    const mensaje: string = salida.mensaje_para_enviar;

    expect(mensaje).not.toMatch(CALLES);
    expect(mensaje.match(/https?:\/\/\S+/g) ?? []).toHaveLength(2);
    expect(mensaje).toMatch(/qué día/i);
    expect(mensaje).toMatch(/cuál local/i);
  });

  it("con el local ya elegido manda solo ese link y pregunta únicamente el día", async () => {
    const phone = "593980001002";
    const fila = await conversacion(phone);
    await sql`update conversations set nearest_store='Depot Tire Quito Sur' where id=${fila.id}`;

    const salida = JSON.parse(await herramienta(fila, phone).execute({ local: null }));
    const mensaje: string = salida.mensaje_para_enviar;

    expect(mensaje).not.toMatch(CALLES);
    expect(mensaje.match(/https?:\/\/\S+/g) ?? []).toHaveLength(1);
    expect(mensaje).toMatch(/Quito Sur/);
    expect(mensaje).not.toMatch(/Cumbayá/);
    expect(mensaje).toMatch(/qué día/i);
  });

  // El caso exacto de la captura: el cliente ya había dicho «al sur» y «el
  // viernes por favor». Pedir la ubicación no puede reabrir esas dos preguntas.
  it("con día y local confirmados manda el link y no pregunta nada", async () => {
    const phone = "593980001003";
    const fila = await conversacion(phone);
    await sql`
      update conversations
      set nearest_store='Depot Tire Quito Sur', customer_commitment='el viernes por favor',
        customer_commitment_cycle=current_cycle, visit_date=now() + interval '3 days'
      where id=${fila.id}
    `;

    const salida = JSON.parse(await herramienta(fila, phone).execute({ local: null }));
    const mensaje: string = salida.mensaje_para_enviar;

    expect(salida.visita_registrada).toBe(true);
    expect(mensaje).toMatch(/https?:\/\//);
    expect(mensaje).not.toMatch(/qué día/i);
    expect(mensaje).not.toMatch(/cuál local/i);
    expect(mensaje).toMatch(/el viernes por favor/);
  });

  it("sin cotización no promete el descuento de una cotización que no existe", async () => {
    const phone = "593980001004";
    const fila = await conversacion(phone);

    const salida = JSON.parse(await herramienta(fila, phone).execute({ local: null }));
    expect(salida.mensaje_para_enviar).not.toMatch(/descuento/i);
  });

  it("el prompt ya no lleva las direcciones que el modelo copiaba al chat", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).not.toMatch(CALLES);
    expect(prompt).toMatch(/ubicacion_locales/);
    expect(prompt).toMatch(/Depot Tire Quito Sur/);
  });
});

/*
 * «La gente se queda sin ubicación porque el bot espera el pin. Que cuando diga
 * los lugares, mande los links de una» — Joaquín, 25-ago.
 *
 * `local_mas_cercano` tenía un callejón sin salida: si no reconocía el sector
 * devolvía un error que mandaba a pedir el pin de WhatsApp, y ahí se quedaba el
 * hilo. El cliente no necesita que le adivinemos el sector para elegir local:
 * necesita ver los dos y decidir.
 */
describe("local_mas_cercano", () => {
  function local(fila: Fila, phone: string, texto = "estoy por el sector") {
    return herramientaLlamada("local_mas_cercano", fila, phone, texto);
  }

  it("con un sector que no reconoce manda igual los dos links, sin exigir el pin", async () => {
    const phone = "593980002001";
    const fila = await conversacion(phone);

    const salida = JSON.parse(
      await local(fila, phone).execute({ lat: null, lng: null, sector: "por mi barrio" }),
    );
    const mensaje: string = salida.mensaje_para_enviar;

    expect(salida.error).toBeUndefined();
    expect(salida.sector_reconocido).toBe(false);
    expect(mensaje.match(/https?:\/\/\S+/g) ?? []).toHaveLength(2);
    expect(mensaje).toMatch(/cuál local/i);
    expect(mensaje).not.toMatch(CALLES);
    // El pin sigue existiendo, pero como ofrecimiento — nunca como requisito.
    expect(mensaje).toMatch(/Si prefiere, compárteme su ubicación/i);
    expect(salida.regla).toMatch(/PROHIBIDO condicionar los links/i);
  });

  /*
   * La cadena completa del chat que trajo Joaquín: «el cliente puso "al sur por
   * favor el viernes" y el seguimiento volvió a preguntar el lugar».
   *
   * No fallaba el seguimiento: fallaba lo que el bot había dicho ANTES. Con el
   * callejón del pin, nuestro último mensaje era «¿de qué sector nos escribe?»
   * —sin los dos locales y sin preguntar el día—, así que ni «al sur» era una
   * elección de local ni «el viernes» era una fecha. Los dos hechos se perdían
   * y el seguimiento no tenía con qué callarse.
   *
   * Aquí se corre esa cadena tal como la corre index.ts, sobre el mensaje que
   * de verdad devuelve la herramienta.
   */
  it("su respuesta deja legible el «al sur por favor el viernes» del turno siguiente", async () => {
    const phone = "593980002005";
    const fila = await conversacion(phone);
    const salida = JSON.parse(
      await local(fila, phone).execute({ lat: null, lng: null, sector: "por mi barrio" }),
    );
    const ultimoNuestro: string = salida.mensaje_para_enviar;

    const ENTRANTE = "al sur por favor el viernes";
    expect(preguntamosElLocal(ultimoNuestro)).toBe(true);
    expect(preguntamosElDia(ultimoNuestro)).toBe(true);
    expect(extractExplicitStore(ENTRANTE, { respondiendoAlLocal: true }))
      .toBe("Depot Tire Quito Sur");
    expect(extractCustomerCommitment(ENTRANTE, new Date("2026-08-25T15:00:00.000Z"), {
      respondiendoAlDia: true,
    })?.visitDate).toBeInstanceOf(Date);
  });

  /*
   * «Al sur», a secas, es como media Quito dice dónde vive — y era justo el
   * sector que no resolvía nada. Es el chat que trajo Joaquín: «al sur por favor
   * el viernes», y el bot volvió a preguntar el lugar.
   */
  it("«al sur» ya resuelve y recomienda Quito Sur con su mapa", async () => {
    const phone = "593980002002";
    const fila = await conversacion(phone);

    const salida = JSON.parse(
      await local(fila, phone).execute({ lat: null, lng: null, sector: "al sur" }),
    );
    const mensaje: string = salida.mensaje_para_enviar;

    expect(salida.local).toBe("Depot Tire Quito Sur");
    expect(salida.ubicacion_cliente).toBe("sur de Quito");
    expect(mensaje.match(/https?:\/\/\S+/g) ?? []).toHaveLength(1);
    expect(mensaje).toMatch(/Quito Sur/);
    expect(mensaje).toMatch(/qué día/i);
    // Un solo bloque. Si el mapa saliera como mensaje aparte quedaría él de
    // último saliente y `preguntamosElDia` dejaría de reconocer el «el viernes»
    // que llega en el turno siguiente — que es como se perdía el dato.
    expect(mensaje).not.toContain("---");
  });

  it("con el pin compartido el mapa y la pregunta por el día viajan juntos", async () => {
    const phone = "593980002003";
    const fila = await conversacion(phone);

    const salida = JSON.parse(
      await local(fila, phone).execute({ lat: -0.199, lng: -78.44, sector: null }),
    );
    const mensaje: string = salida.mensaje_para_enviar;

    expect(salida.local).toBe("Depot Tire Cumbayá");
    expect(mensaje.match(/https?:\/\/\S+/g) ?? []).toHaveLength(1);
    expect(mensaje).toMatch(/qué día/i);
    expect(mensaje).not.toContain("---");
    expect(mensaje).not.toMatch(CALLES);
  });

  it("al local ya elegido explícitamente le manda su mapa, no los dos", async () => {
    const phone = "593980002004";
    const fila = await conversacion(phone);
    await sql`
      update conversations
      set nearest_store='Depot Tire Cumbayá',
          location_label='Local elegido explícitamente por el cliente: Depot Tire Cumbayá'
      where id=${fila.id}
    `;

    const salida = JSON.parse(
      await local(fila, phone, "prefiero cumbayá").execute({ lat: null, lng: null, sector: null }),
    );
    const mensaje: string = salida.mensaje_para_enviar;

    expect(salida.local).toBe("Depot Tire Cumbayá");
    expect(mensaje.match(/https?:\/\/\S+/g) ?? []).toHaveLength(1);
    expect(mensaje).toMatch(/Cumbayá/);
    expect(mensaje).not.toMatch(/Quito Sur/);
    expect(mensaje).toMatch(/qué día/i);
    expect(mensaje).not.toContain("---");
  });
});
