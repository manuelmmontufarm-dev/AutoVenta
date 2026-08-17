/**
 * El candado del reporte diario, contra una base de verdad.
 *
 * Es la única defensa entre «un reporte a las 20:00» y «cinco reportes porque
 * Railway reinició el contenedor cuatro veces». Vive en SQL — un
 * `on conflict ... where` sobre `settings` — y por eso no se puede probar en
 * memoria: lo que se está afirmando es que la base rechaza el segundo intento,
 * incluso si dos procesos entran a la vez.
 */
import { beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";

const BASE = "av_reporte_candado";
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
// El candado real, no una copia: si el SQL de producción cambia, esto se entera.
const { rechazadosPorMeta, reclamarDia, soltarDia, ultimoDiaEnviado } = await import("../src/services/dailyReportDelivery.js");

beforeAll(async () => {
  await sql`
    create table if not exists settings (
      key text primary key,
      value jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
});

describe("candado del reporte diario", () => {
  it("el primero se lo lleva; los reintentos del mismo día rebotan", async () => {
    expect(await reclamarDia("2026-08-09")).toBe(true);
    expect(await reclamarDia("2026-08-09")).toBe(false);
    expect(await reclamarDia("2026-08-09")).toBe(false);
  });

  it("guarda el día en un formato que se puede volver a leer", async () => {
    expect(await ultimoDiaEnviado()).toBe("2026-08-09");
  });

  it("el día siguiente sí pasa", async () => {
    expect(await reclamarDia("2026-08-10")).toBe(true);
    expect(await ultimoDiaEnviado()).toBe("2026-08-10");
    expect(await reclamarDia("2026-08-10")).toBe(false);
  });

  it("dos procesos a la vez producen UN reporte, no dos", async () => {
    const votos = await Promise.all(["2026-08-11", "2026-08-11", "2026-08-11", "2026-08-11"].map(reclamarDia));
    expect(votos.filter(Boolean)).toHaveLength(1);
  });

  it("soltar el día deja reintentar esa misma noche", async () => {
    // Si ningún asesor pudo recibirlo —la ventana de 24 h de Meta suele estar
    // cerrada— el día se suelta y el siguiente giro del bucle lo reintenta.
    // Sin esto, un envío fallido a las 20:00 se lleva el reporte entero.
    expect(await reclamarDia("2026-08-12")).toBe(true);
    await soltarDia("2026-08-12");
    expect(await ultimoDiaEnviado()).toBeNull();
    expect(await reclamarDia("2026-08-12")).toBe(true);
  });

  it("soltar NO borra la marca de un día distinto", async () => {
    // El borrado va condicionado al día: un proceso rezagado no puede tumbar
    // la marca del reporte que otro ya entregó.
    expect(await reclamarDia("2026-08-13")).toBe(true);
    await soltarDia("2026-08-12");
    expect(await ultimoDiaEnviado()).toBe("2026-08-13");
  });
});

/**
 * El candado de arriba solo sirve si `entregados` dice la verdad, y el 16-ago
 * no la decía: Meta aceptó los dos mensajes del reporte con HTTP 200 y un wamid
 * cada uno, los rechazó tres segundos después por el webhook con el 131047, y
 * como el envío miraba únicamente la respuesta del POST, el reporte quedó
 * anotado «enviado a 2/2 asesores» sin haberle llegado a nadie. El día quedó
 * reclamado y el reintento de `soltarDia` no llegó a correr.
 *
 * Por eso esto se prueba contra Postgres de verdad: lo que se afirma es que la
 * consulta a `message_status_events` encuentra el veredicto real.
 */
describe("el veredicto de Meta, no el acuse del POST", () => {
  beforeAll(async () => {
    await sql`
      create table if not exists message_status_events (
        id bigserial primary key,
        message_id bigint,
        provider_id text not null,
        status text not null,
        payload jsonb,
        created_at timestamptz not null default now()
      )
    `;
    await sql`
      insert into message_status_events (provider_id, status) values
        ('wamid.RECHAZADO', 'failed'),
        ('wamid.ENTREGADO', 'delivered')
    `;
  });

  it("un mensaje que Meta aceptó y luego rechazó NO cuenta como entregado", async () => {
    const rechazados = await rechazadosPorMeta(["wamid.RECHAZADO"]);
    expect(rechazados.has("wamid.RECHAZADO")).toBe(true);
  });

  it("uno entregado de verdad no aparece como rechazado", async () => {
    const rechazados = await rechazadosPorMeta(["wamid.ENTREGADO"]);
    expect(rechazados.size).toBe(0);
  });

  it("con dos asesores distingue cuál falló y cuál no", async () => {
    // Es el caso exacto del 16-ago: a Joaquín le llegó, a Manuel no.
    const rechazados = await rechazadosPorMeta(["wamid.ENTREGADO", "wamid.RECHAZADO"]);
    expect([...rechazados]).toEqual(["wamid.RECHAZADO"]);
  });

  it("sin mensajes que revisar no consulta ni espera", async () => {
    expect((await rechazadosPorMeta([])).size).toBe(0);
  });
});
