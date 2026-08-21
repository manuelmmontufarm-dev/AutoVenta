import { beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

/**
 * Avisos de visita contra una base de verdad.
 *
 * Lo que importa aquí es SQL y deduplicación, no texto: que se avise por la
 * visita de mañana y solo por esa, que un chat cerrado no moleste a nadie, y
 * que el asesor reciba UN mensaje aunque el bucle pase cada cuarto de hora
 * durante todo el día. Eso último es la diferencia entre un aviso útil y un
 * asesor que silencia el número.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";

const BASE = "autoventa_visitas_test";
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

// Lo único que se simula es el envío por WhatsApp: la deduplicación de avisos
// vive en la base y es justo lo que se quiere probar, así que notifyAdvisor
// corre de verdad.
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
const {
  revisarVisitasDeManana, revisarVisitasDeHoy, avisarVisitaComprometida, esHoraDeRecordar,
  claveVisitaComprometida, diaGuayaquil,
} = await import("../src/services/visitAlerts.js");
const { asesoresActivos } = await import("../src/services/advisorNotifications.js");

/** 10:00 en Guayaquil (UTC-5): dentro del horario de atención. */
const AHORA = new Date("2026-08-10T15:00:00.000Z");
/** Mañana a las 10:00 locales. */
const MANANA = new Date("2026-08-11T15:00:00.000Z");
/** Hoy a las 15:00 locales: el cliente todavía no llega cuando se avisa. */
const HOY_TARDE = new Date("2026-08-10T20:00:00.000Z");

async function crearConversacion(
  phone: string, visitDate: Date | null, status: "open" | "closed" = "open",
): Promise<number> {
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, stage, status, current_cycle, visit_date,
      customer_commitment, customer_commitment_cycle)
    values (${phone}, ${`Cliente ${phone}`}, 'seguimiento_venta', ${status}, 1,
      ${visitDate}, 'Voy mañana temprano', 1)
    returning id
  `;
  return Number(fila.id);
}

beforeAll(async () => {
  await ensureSchema();
  await sql`
    insert into advisors (nombre, telefono, prioridad, active)
    values ('Asesor de prueba', '593999999999', 0, true)
    on conflict (telefono) do nothing
  `;
});

describe("La ventana de envío", () => {
  it("no despierta a nadie de madrugada", () => {
    // La condición "la visita es mañana" se cumple desde las 00:00; sin ventana
    // el asesor recibiría el WhatsApp a medianoche.
    expect(esHoraDeRecordar(new Date("2026-08-10T05:00:00.000Z"))).toBe(false); // 00:00
    expect(esHoraDeRecordar(new Date("2026-08-10T12:00:00.000Z"))).toBe(false); // 07:00
    expect(esHoraDeRecordar(new Date("2026-08-10T13:00:00.000Z"))).toBe(true); //  08:00
    expect(esHoraDeRecordar(new Date("2026-08-10T22:59:00.000Z"))).toBe(true); //  17:59
    expect(esHoraDeRecordar(new Date("2026-08-10T23:00:00.000Z"))).toBe(false); // 18:00
  });

  it("cuenta el día en Guayaquil y no en UTC", () => {
    // 21:00 locales del 10 son las 02:00 UTC del 11: en UTC este aviso se
    // adelantaría un día entero.
    expect(diaGuayaquil(new Date("2026-08-11T02:00:00.000Z"))).toBe("2026-08-10");
  });
});

describe("Clave de la fecha prometida", () => {
  it("repetir el mismo día no avisa dos veces, cambiarlo sí", () => {
    const sabado = new Date("2026-08-15T15:00:00.000Z");
    const lunes = new Date("2026-08-17T15:00:00.000Z");
    expect(claveVisitaComprometida(7, 1, sabado)).toBe(claveVisitaComprometida(7, 1, sabado));
    expect(claveVisitaComprometida(7, 1, sabado)).not.toBe(claveVisitaComprometida(7, 1, lunes));
    expect(claveVisitaComprometida(7, 1, null)).toMatch(/sin-fecha$/);
  });
});

describe("Recordatorio de la víspera", () => {
  it("avisa por la visita de mañana, una sola vez, y deja en paz al resto", async () => {
    const manana = await crearConversacion("593900001111", MANANA);
    const lejos = await crearConversacion("593900002222", new Date("2026-08-14T15:00:00.000Z"));
    const cerrado = await crearConversacion("593900003333", MANANA, "closed");
    const sinFecha = await crearConversacion("593900004444", null);

    const primera = await revisarVisitasDeManana(AHORA);
    expect(primera).toBe(1);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toContain("Mañana viene un cliente");

    const alertas = await sql<{ conversation_id: number; dedupe_key: string }[]>`
      select conversation_id, dedupe_key from bot_alerts where type = 'visita_manana'
    `;
    expect(alertas).toHaveLength(1);
    expect(Number(alertas[0].conversation_id)).toBe(manana);
    expect(alertas[0].dedupe_key).toBe(`${manana}:1:visita_manana:2026-08-11`);

    // El que viene en tres días, el chat cerrado y el que nunca dio fecha no
    // generan nada: un aviso de más se ignora, y el siguiente también.
    for (const id of [lejos, cerrado, sinFecha]) {
      const [fila] = await sql<{ n: number }[]>`
        select count(*)::int as n from bot_alerts where conversation_id = ${id}
      `;
      expect(fila.n).toBe(0);
    }

    // El bucle pasa cada 15 minutos durante toda la ventana: el asesor tiene
    // que recibir UN mensaje, no cuarenta.
    const segunda = await revisarVisitasDeManana(new Date("2026-08-10T17:00:00.000Z"));
    expect(segunda).toBe(0);
    expect(enviados).toHaveLength(1);
  });

  it("fuera de horario no manda nada aunque haya visitas mañana", async () => {
    const antes = enviados.length;
    expect(await revisarVisitasDeManana(new Date("2026-08-10T06:00:00.000Z"))).toBe(0);
    expect(enviados).toHaveLength(antes);
  });

  /**
   * «Voy mañana» es de las respuestas más comunes. Sin este filtro el asesor
   * recibía el aviso de "dijo cuándo viene" y, minutos después, el de "mañana
   * viene un cliente" — lo mismo dos veces.
   */
  it("no repite el aviso si el cliente prometió hoy que venía mañana", async () => {
    const id = await crearConversacion("593900005555", MANANA);
    const antes = enviados.length;

    await avisarVisitaComprometida({
      conversationId: id, cycle: 1, texto: "Voy mañana temprano", visitDate: MANANA,
    });
    expect(enviados).toHaveLength(antes + 1);
    expect(enviados[enviados.length - 1]).toContain("dijo cuándo viene");

    // El aviso se graba con el reloj de la base, que no sabe nada de la línea
    // de tiempo simulada: se lo mueve a mano al "hoy" de la prueba.
    const fechar = (cuando: string) => sql`
      update advisor_notifications set created_at = ${cuando}::timestamptz
      where conversation_id = ${id} and event_type = 'visita_comprometida'
    `;

    await fechar("2026-08-10T18:00:00.000Z"); // hoy, un par de horas antes
    expect(await revisarVisitasDeManana(new Date("2026-08-10T20:00:00.000Z"))).toBe(0);
    expect(enviados).toHaveLength(antes + 1);

    // Y el caso contrario, que es el que da sentido al recordatorio: si la
    // promesa fue hace cinco días, la víspera SÍ hay que empujar.
    await fechar("2026-08-05T18:00:00.000Z");
    expect(await revisarVisitasDeManana(new Date("2026-08-10T20:00:00.000Z"))).toBe(1);
    expect(enviados).toHaveLength(antes + 2);
    expect(enviados[enviados.length - 1]).toContain("Mañana viene un cliente");
  });
});

/**
 * El aviso del día mismo (14-ago). La víspera sirve para preparar; hoy sirve
 * para atender, y quien abre la tienda a las ocho no tiene por qué acordarse de
 * una promesa de hace cinco días.
 */
describe("Recordatorio del día", () => {
  it("avisa que hoy viene el cliente, una sola vez en todo el día", async () => {
    const hoy = await crearConversacion("593900006666", HOY_TARDE);
    const antes = enviados.length;

    expect(await revisarVisitasDeHoy(AHORA)).toBe(1);
    expect(enviados).toHaveLength(antes + 1);
    expect(enviados[enviados.length - 1]).toContain("Hoy viene un cliente");
    expect(enviados[enviados.length - 1]).toContain("🎯 *VIENE HOY*");

    const [alerta] = await sql<{ dedupe_key: string }[]>`
      select dedupe_key from bot_alerts
      where type = 'visita_hoy' and conversation_id = ${hoy}
    `;
    expect(alerta.dedupe_key).toBe(`${hoy}:1:visita_hoy:2026-08-10`);

    // El bucle pasa cada cuarto de hora desde que abre la tienda hasta que
    // cierra: son treinta y pico de vueltas y UN mensaje.
    expect(await revisarVisitasDeHoy(new Date("2026-08-10T17:00:00.000Z"))).toBe(0);
    expect(await revisarVisitasDeHoy(new Date("2026-08-10T22:00:00.000Z"))).toBe(0);
    expect(enviados).toHaveLength(antes + 1);
  });

  it("no confunde el de hoy con el de mañana", async () => {
    // La conversación de mañana ya avisada arriba no vuelve a salir hoy, y la de
    // hoy no se cuela en el barrido de la víspera.
    const antes = enviados.length;
    expect(await revisarVisitasDeManana(AHORA)).toBe(0);
    expect(enviados).toHaveLength(antes);
  });

  it("fuera de horario tampoco despierta a nadie", async () => {
    const antes = enviados.length;
    expect(await revisarVisitasDeHoy(new Date("2026-08-10T06:00:00.000Z"))).toBe(0);
    expect(enviados).toHaveLength(antes);
  });
});

describe("Cambio de fecha de visita", () => {
  it("re-alerta con la fecha nueva y no con la vieja", async () => {
    const id = await crearConversacion("593900007777", null);
    const antes = enviados.length;
    const jueves = new Date("2026-08-13T15:00:00.000Z");
    const sabado = new Date("2026-08-15T15:00:00.000Z");

    await avisarVisitaComprometida({
      conversationId: id, cycle: 1, texto: "Voy el jueves", visitDate: jueves,
    });
    expect(enviados).toHaveLength(antes + 1);

    // Repetir la misma fecha no vuelve a molestar al asesor.
    await avisarVisitaComprometida({
      conversationId: id, cycle: 1, texto: "Confirmo, el jueves", visitDate: jueves,
    });
    expect(enviados).toHaveLength(antes + 1);

    // Cambiarla sí: el asesor preparó las llantas para el jueves.
    await avisarVisitaComprometida({
      conversationId: id, cycle: 1, texto: "Mejor el sábado", visitDate: sabado,
    });
    expect(enviados).toHaveLength(antes + 2);
    expect(enviados[enviados.length - 1]).toContain("📅 *CONFIRMÓ VISITA*");
  });
});

/**
 * El filtro por rol contra la tabla de verdad. La regla pura se prueba en
 * avisosPorRol.test.ts; lo que falta comprobar es que el `select` lea la
 * columna y que el respaldo por entorno no se salte el filtro.
 */
describe("A quién le llega, según la tabla advisors", () => {
  it("el asesor de local queda fuera de todo lo que no sean sus cinco avisos", async () => {
    await sql`
      insert into advisors (nombre, telefono, prioridad, active, rol)
      values ('Jocelyn (local)', '593988888888', 1, true, 'asesor')
      on conflict (telefono) do update set rol = 'asesor', active = true
    `;
    try {
      const telefonos = async (filtro: Parameters<typeof asesoresActivos>[0]) =>
        (await asesoresActivos(filtro)).map((a) => a.telefono);

      expect(await telefonos({ evento: "visita_hoy" })).toContain("593988888888");
      expect(await telefonos({ evento: "quote_created" })).toContain("593988888888");
      // Ventana de 24 h: apagada por defecto para TODOS desde la reunión con
      // Andrés (19-ago) — eran demasiados mensajes. Se re-enciende en Ajustes.
      expect(await telefonos({ evento: "ventana_por_cerrar" })).toHaveLength(0);

      // Errores del bot y fallas de envío: no los acciona desde el mostrador.
      expect(await telefonos({ evento: "send_error" })).not.toContain("593988888888");
      expect(await telefonos({ evento: "guard_bot_atascado" })).not.toContain("593988888888");

      // El reporte de las 20:00 pide `rol: 'admin'` explícitamente.
      expect(await telefonos({ rol: "admin" })).not.toContain("593988888888");
      expect(await telefonos({ rol: "admin" })).toContain("593999999999");

      // Y el de siempre sigue recibiéndolo todo, que es la mitad del trato.
      for (const evento of ["send_error", "visita_hoy", "repetitive_conversation"] as const) {
        expect(await telefonos({ evento })).toContain("593999999999");
      }
    } finally {
      await sql`delete from advisors where telefono = '593988888888'`;
    }
  });
});
