import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

/**
 * SALDO DE OPENAI BAJO: UN AVISO POR CRUCE (24-nov-2026).
 *
 * Manuel: «también un aviso si baja de 3 dólares los tokens».
 *
 * El saldo no se puede leer por API (probado: 403 con la clave del bot y con
 * la de administrador). Soporte anota lo que ve en OpenAI y desde ahí se resta
 * lo gastado. Acá se prueba que el cruce avisa UNA vez, que anotar una recarga
 * deja el aviso listo para el próximo cruce y que sin dato no se inventa nada.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
delete process.env.OPENAI_ADMIN_KEY;

const BASE = "autoventa_saldo_ia_test";
process.env.DATABASE_URL = `postgresql://${process.env.USER}@localhost/${BASE}`;

const admin = postgres(`postgresql://${process.env.USER}@localhost/postgres`, { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

vi.mock("../src/wa/client.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/wa/client.js")>();
  return { ...real, sendAdvisorText: vi.fn(async () => "wamid.TEXTO"), sendAdvisorTemplate: vi.fn(async () => "wamid.PLANTILLA") };
});

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const saldo = await import("../src/services/saldoDeIA.js");
const app = await import("../src/services/avisosEnLaApp.js");
const wa = await import("../src/wa/client.js");

let pushes: { titulo: string; cuerpo: string }[] = [];
let conversationId = 0;

/** Una corrida de gpt-5.5: a $5 el millón de entrada, 100.000 tokens = $0,50. */
async function gastar(usd: number, cuando = new Date()): Promise<void> {
  await sql`
    insert into ai_runs (conversation_id, stage, model, latency_ms, input_tokens, output_tokens, tools, created_at)
    values (${conversationId}, 'nuevo', 'gpt-5.5', 100, ${Math.round((usd / 5) * 1_000_000)}, 0, '[]'::jsonb, ${cuando})
  `;
}

const avisos = () => sql<{ clase: string; titulo: string; cuerpo: string; push_enviados: number; whatsapp: string }[]>`
  select clase, titulo, cuerpo, push_enviados, whatsapp from avisos_a_soporte order by id
`;

const T0 = new Date("2026-11-24T15:00:00.000Z");
const mas = (min: number) => new Date(T0.getTime() + min * 60_000);

beforeAll(async () => {
  await ensureSchema();
  const [c] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle) values ('593990000900', 'Cliente', 'open', 'nuevo', 1) returning id
  `;
  conversationId = Number(c.id);
  await sql`delete from advisors`;
  await sql`
    insert into advisors (nombre, telefono, rol, active, prioridad, ventana_hasta)
    values ('Manuel Montufar', '593990008763', 'admin', true, 1, now() + interval '10 hours')
  `;
  await app.guardarSuscripcion({
    userId: "manuel", userName: "Manuel Montufar", advisorPhone: "593990008763",
    suscripcion: { endpoint: "https://push.example.test/manuel-iphone", keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } },
  });
  app._usarTransportePush(async (_sub, cuerpo) => { pushes.push(JSON.parse(cuerpo)); });
});

beforeEach(async () => {
  pushes = [];
  vi.mocked(wa.sendAdvisorText).mockClear();
  saldo._usarLectorDeCostos(null);
  await sql`delete from avisos_a_soporte`;
  await sql`delete from incidentes_del_bot`;
  await sql`delete from saldo_de_ia`;
  await sql`delete from settings where key = 'saldo_de_anthropic'`;
  await sql`delete from ai_runs`;
});

describe("sin saldo anotado", () => {
  it("no se sabe cuánto queda: no avisa ni inventa un número", async () => {
    await gastar(50, mas(1));
    expect(await saldo.estadoDelSaldo()).toBeNull();
    expect(await saldo.revisarSaldo(mas(2))).toBe("sin_anotar");
    expect(await avisos()).toHaveLength(0);
  });
});

describe("estimado con lo que registró este bot (sin clave de administrador)", () => {
  it("el cruce de los $3 avisa UNA vez, aunque se revise cada cinco minutos y siga bajando", async () => {
    await saldo.anotarSaldo({ saldoUsd: 5 }, "manuel", T0);
    // Lo gastado ANTES de anotar no se resta.
    await gastar(40, mas(-30));
    await gastar(1.5, mas(10));
    expect(await saldo.revisarSaldo(mas(11))).toBe("ok");
    expect(await avisos()).toHaveLength(0);

    await gastar(0.6, mas(20)); // quedan $2,90: cruzó
    expect(await saldo.revisarSaldo(mas(21))).toBe("avisado");
    for (let i = 1; i <= 12; i += 1) {
      await gastar(0.1, mas(21 + i * 5));
      expect(await saldo.revisarSaldo(mas(22 + i * 5)), `revisión ${i}`).toBe("ya_avisado");
    }

    const filas = await avisos();
    expect(filas).toHaveLength(1);
    expect(filas[0].clase).toBe("saldo_bajo");
    expect(filas[0].titulo).toMatch(/^🟠 .+: saldo de OpenAI bajo$/);
    // Es una estimación y lo dice: «unos».
    expect(filas[0].cuerpo).toContain("Quedan unos $2.90 de crédito de OpenAI (aviso por debajo de $3.00)");
    expect(filas[0]).toMatchObject({ push_enviados: 1, whatsapp: "texto" });
    expect(pushes).toHaveLength(1);
    expect(wa.sendAdvisorText).toHaveBeenCalledTimes(1);

    const estado = await saldo.estadoDelSaldo();
    expect(estado).toMatchObject({ fuente: "bot", aproximado: true, bajo: true, gastadoUsd: 3.3, restanteUsd: 1.7 });
  });

  it("dos revisiones que cruzan a la vez mandan un solo aviso", async () => {
    await saldo.anotarSaldo({ saldoUsd: 3.2 }, "manuel", T0);
    await gastar(0.5, mas(5));
    const resultados = await Promise.all([saldo.revisarSaldo(mas(6)), saldo.revisarSaldo(mas(6)), saldo.revisarSaldo(mas(6))]);
    expect(resultados.filter((r) => r === "avisado")).toHaveLength(1);
    expect(await avisos()).toHaveLength(1);
  });

  it("anotar la recarga deja el aviso listo: el siguiente cruce vuelve a avisar, una vez", async () => {
    await saldo.anotarSaldo({ saldoUsd: 3.1 }, "manuel", T0);
    await gastar(0.5, mas(5));
    expect(await saldo.revisarSaldo(mas(6))).toBe("avisado");

    const recarga = await saldo.anotarSaldo({ saldoUsd: 22.6 }, "manuel", mas(30));
    expect(recarga).toMatchObject({ restanteUsd: 22.6, bajo: false });
    expect(await saldo.revisarSaldo(mas(31))).toBe("ok");
    expect(await avisos()).toHaveLength(1);

    await gastar(19.8, mas(200)); // quedan $2,80
    expect(await saldo.revisarSaldo(mas(201))).toBe("avisado");
    expect(await saldo.revisarSaldo(mas(206))).toBe("ya_avisado");
    expect((await avisos()).map((f) => f.clase)).toEqual(["saldo_bajo", "saldo_bajo"]);
  });

  it("el umbral se puede cambiar: con $10 de umbral, avisa a los $9,50", async () => {
    await saldo.anotarSaldo({ saldoUsd: 12, umbralUsd: 10 }, "manuel", T0);
    await gastar(2.5, mas(5));
    expect(await saldo.revisarSaldo(mas(6))).toBe("avisado");
    expect((await avisos())[0].cuerpo).toContain("Quedan unos $9.50 de crédito de OpenAI (aviso por debajo de $10.00)");
  });

  it("no acepta un saldo negativo ni texto", async () => {
    await expect(saldo.anotarSaldo({ saldoUsd: -4 }, "manuel", T0)).rejects.toThrow();
    await expect(saldo.anotarSaldo({ saldoUsd: "mucho" }, "manuel", T0)).rejects.toThrow();
    expect(await saldo.leerSaldoAnotado()).toBeNull();
  });
});

describe("con la clave de administrador: lo que OpenAI dice que gastó la organización", () => {
  it("resta el gasto de TODA la organización (no solo este bot) y descuenta lo gastado ese día antes de anotar", async () => {
    // OpenAI entrega el gasto por día entero. Al anotar ya iban $28,05 del día.
    let gastoDeLaOrganizacion = 28.05;
    const pedidos: number[] = [];
    saldo._usarLectorDeCostos(async (desdeUnix) => { pedidos.push(desdeUnix); return gastoDeLaOrganizacion; });

    const alAnotar = await saldo.anotarSaldo({ saldoUsd: 20 }, "manuel", T0);
    expect(alAnotar).toMatchObject({ fuente: "openai", aproximado: false, gastadoUsd: 0, restanteUsd: 20, bajo: false });
    // Se pide desde la medianoche UTC del día en que se anotó.
    expect(pedidos.at(-1)).toBe(Date.UTC(2026, 10, 24) / 1000);

    // Este bot no registró nada, pero Competimotor y el simulador gastaron $17,20.
    gastoDeLaOrganizacion = 28.05 + 17.2;
    expect(await saldo.revisarSaldo(mas(300))).toBe("avisado");
    expect(await saldo.revisarSaldo(mas(305))).toBe("ya_avisado");
    const filas = await avisos();
    expect(filas).toHaveLength(1);
    // Dato de OpenAI: sin «unos».
    expect(filas[0].cuerpo).toContain("Quedan $2.80 de crédito de OpenAI");
  });

  it("si OpenAI no contesta al revisar, no avisa ni inventa: lo vuelve a intentar después", async () => {
    let caido = false;
    saldo._usarLectorDeCostos(async () => { if (caido) throw new Error("OpenAI contestó 503 al pedir los costos"); return 10; });
    await saldo.anotarSaldo({ saldoUsd: 4 }, "manuel", T0);
    caido = true;
    expect(await saldo.revisarSaldo(mas(10))).toBe("sin_dato");
    expect(await avisos()).toHaveLength(0);
    caido = false;
    expect(await saldo.revisarSaldo(mas(15))).toBe("ok");
  });

  it("si OpenAI no contesta al anotar, no guarda un saldo mal calculado", async () => {
    saldo._usarLectorDeCostos(async () => { throw new Error("OpenAI contestó 500 al pedir los costos"); });
    await expect(saldo.anotarSaldo({ saldoUsd: 20 }, "manuel", T0)).rejects.toThrow(/no guardé el saldo/);
    expect(await saldo.leerSaldoAnotado()).toBeNull();
  });
});

describe("el saldo de Anthropic (27-nov-2026): mismo método, con lo que este bot gastó en Claude", () => {
  /** Una corrida de Claude Sonnet 5.5: con caché leído y escrito, como las de producción. */
  async function gastarClaude(cuando: Date, tokens: { input: number; cached?: number; escritos?: number; output?: number }): Promise<void> {
    await sql`
      insert into ai_runs (conversation_id, stage, model, latency_ms, input_tokens, cached_input_tokens, cache_write_tokens, output_tokens, tools, created_at)
      values (${conversationId}, 'nuevo', 'claude-sonnet-5-5', 100, ${tokens.input}, ${tokens.cached ?? 0}, ${tokens.escritos ?? 0}, ${tokens.output ?? 0}, '[]'::jsonb, ${cuando})
    `;
  }

  it("no se mezcla con el de OpenAI: cada uno resta solo lo suyo y avisa con su nombre y su página", async () => {
    // El lector de OpenAI (clave de administrador) NO se consulta para Anthropic.
    saldo._usarLectorDeCostos(async () => { throw new Error("no debería pedirse"); });
    await saldo.anotarSaldo({ saldoUsd: 10, proveedor: "anthropic" }, "manuel", T0);
    expect(await saldo.leerSaldoAnotado()).toBeNull(); // OpenAI sigue sin anotar

    // gpt-5.5 no cuenta; lo de antes de anotar tampoco.
    await gastar(50, mas(5));
    await gastarClaude(mas(-10), { input: 5_000_000 });
    expect(await saldo.revisarSaldo(mas(6), "anthropic")).toBe("ok");

    // 3 M de entrada sin caché ($6) + 1 M escrito al caché (a la tarifa de escritura) + 100 k de salida ($1).
    await gastarClaude(mas(10), { input: 4_000_000, escritos: 1_000_000, output: 100_000 });
    const estado = await saldo.estadoDelSaldo("anthropic");
    expect(estado).toMatchObject({ fuente: "bot", aproximado: true, bajo: true });
    expect(estado!.gastadoUsd).toBeGreaterThan(7);
    expect(await saldo.revisarSaldo(mas(11), "anthropic")).toBe("avisado");
    expect(await saldo.revisarSaldo(mas(16), "anthropic")).toBe("ya_avisado");

    const filas = await avisos();
    expect(filas).toHaveLength(1);
    expect(filas[0].titulo).toMatch(/saldo de Anthropic \(Claude\) bajo$/);
    expect(filas[0].cuerpo).toMatch(/^Quedan unos \$\d+\.\d\d de crédito de Anthropic \(Claude\)/);
    expect(filas[0].cuerpo).toContain("console.anthropic.com");

    // El de OpenAI sigue independiente: anotarlo no cierra el incidente de Anthropic.
    saldo._usarLectorDeCostos(null);
    await saldo.anotarSaldo({ saldoUsd: 100 }, "manuel", mas(20));
    expect(await sql`select 1 from incidentes_del_bot where causa = 'saldo_bajo_anthropic' and estado = 'abierto'`).toHaveLength(1);
    // Anotar la recarga de Anthropic sí lo cierra.
    await saldo.anotarSaldo({ saldoUsd: 50, proveedor: "anthropic" }, "manuel", mas(30));
    expect(await sql`select 1 from incidentes_del_bot where estado = 'abierto'`).toHaveLength(0);
  });
});
