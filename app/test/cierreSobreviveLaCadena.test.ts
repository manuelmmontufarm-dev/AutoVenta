/**
 * EL CRUCE DE LOS DOS SPRINTS — lo único que ninguno de los dos pudo probar solo.
 *
 * S2 cambió el cierre de venta de la plantilla a «¿Le cotizo el juego de 4
 * llantas?» y exentó esa frase EXACTA del candado de preguntas prohibidas.
 * S1, en paralelo, se llevó la cadena de candados de `index.ts` a
 * `prepararSalida.ts` y la hizo correr por las tres puertas.
 *
 * Cada uno probó su mitad. Lo que queda sin cubrir es la pregunta que los une:
 * ¿la frase nueva sobrevive a la cadena ENTERA, y por las tres puertas? Importa
 * porque la frase contiene «de 4» y por eso vuelve a caer en la misma regex que
 * borraba a la vieja —la exención es lo único que la salva—, y porque ahora esa
 * regex corre en tres sitios donde antes corría en uno.
 *
 * Y la otra mitad de la pregunta: que exentar la nuestra NO haya abierto la
 * puerta a la del modelo. «¿Se la cotizo por 6?» se tiene que seguir yendo.
 */
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const respuestaDelModelo = { texto: "" };
const enviados: string[] = [];

vi.mock("../src/agent/agent.js", () => ({
  runAgent: vi.fn(async () => respuestaDelModelo.texto),
}));
vi.mock("../src/agent/classifier.js", () => ({
  classifyStage: vi.fn(async () => undefined),
}));
vi.mock("../src/wa/client.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/wa/client.js")>();
  return {
    ...real,
    sendCustomerText: vi.fn(async (_id: number, _phone: string, body: string) => {
      enviados.push(body);
      return "wamid.test";
    }),
  };
});
// El Ángel Guardián cuesta tokens. Acá pasa el texto tal cual: lo que se prueba
// es la cadena DETERMINISTA, que es donde vive el cruce de los dos sprints.
vi.mock("../src/services/guardian.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/services/guardian.js")>();
  return {
    ...real,
    revisarConGuardian: vi.fn(async (_conv: unknown, borrador: string) => ({
      texto: borrador, veredicto: "sin_cambios", hallazgos: [],
    })),
  };
});

const testDatabase = `autoventa_cruce_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let resumeBot: typeof import("../src/services/resumeBot.js");
let prepararSalida: typeof import("../src/services/prepararSalida.js").prepararSalida;
/** La frase canónica y el cierre que la plantilla arma con ella. Se cargan
 *  dentro de `beforeAll`: `quoteMessages` arrastra `config.ts`, que exige las
 *  variables de entorno en cuanto se lo importa. */
let CIERRE_COTIZAR: string;
let EL_CIERRE_DE_LA_CASA: string;

async function conversacionHuerfana(telefono: string, texto: string): Promise<number> {
  const [conv] = await appSql<{ id: number; current_cycle: number }[]>`
    insert into conversations (phone, name, status, assigned_to, last_customer_message_at)
    values (${telefono}, ${"Prueba"}, 'open', 'bot', now())
    returning id, current_cycle
  `;
  await appSql`
    insert into messages (conversation_id, role, content, direction, type, author_kind, status, cycle)
    values (${conv.id}, 'user', ${texto}, 'inbound', 'text', 'customer', 'received', ${conv.current_cycle})
  `;
  return Number(conv.id);
}

describe.sequential("el cierre nuevo sobrevive a la cadena entera", () => {
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
    resumeBot = await import("../src/services/resumeBot.js");
    prepararSalida = (await import("../src/services/prepararSalida.js")).prepararSalida;
    CIERRE_COTIZAR = (await import("../src/domain/preguntasProhibidas.js")).CIERRE_COTIZAR;
    EL_CIERRE_DE_LA_CASA = (await import("../src/services/quoteMessages.js")).buildCierreOpciones({
      // `entregarRecomendacion` es la rama de la recomendación; sin él la
      // plantilla devuelve el menú de preferencia, que no lleva este cierre.
      entregarRecomendacion: true,
      recomendacion: "FALKEN WILDPEAK AT3W",
      motivo: "es la premium de las tres",
      precioConIva: 221.77,
    });
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  beforeEach(() => { enviados.length = 0; });

  it("la plantilla de la casa sí escribe la frase que el candado exenta", () => {
    // Si S2 vuelve a escribir el cierre a mano, esto se cae antes que nada.
    expect(EL_CIERRE_DE_LA_CASA).toContain(CIERRE_COTIZAR);
  });

  for (const tipo of ["respuesta", "retomada", "seguimiento"] as const) {
    it(`el pedido del final sigue ahí por la puerta «${tipo}»`, async () => {
      const salida = await prepararSalida(EL_CIERRE_DE_LA_CASA, {
        conversation: { id: 1, current_cycle: 1, stage: "cotizacion" },
        tipo,
      });
      expect(salida.texto, `la cadena vació el mensaje por la puerta ${tipo}`).toBeTruthy();
      expect(salida.texto).toContain(CIERRE_COTIZAR);
      // Y el resto del mensaje tampoco se mutila: el 27-ago quedó
      // «…es la premium de las tres. 😊» sin pedido y con el emoji colgando.
      expect(salida.texto).toContain("FALKEN WILDPEAK AT3W");
      expect(salida.texto).toContain("221.77");
    });
  }

  it("por la puerta de verdad —el bot retomando tras un humano— también llega entero", async () => {
    respuestaDelModelo.texto = EL_CIERRE_DE_LA_CASA;
    const id = await conversacionHuerfana(`593900001${process.pid % 1000}1`, "¿cuál me recomienda?");

    await resumeBot.resumeBotIfUnanswered(id);

    expect(enviados.join("\n")).toContain(CIERRE_COTIZAR);
  });

  it("pero la que escribe el modelo por su cuenta se sigue yendo, por las tres puertas", async () => {
    const DEL_MODELO = "Yo iría por la *FALKEN*. ¿Se la cotizo por 6?";
    for (const tipo of ["respuesta", "retomada", "seguimiento"] as const) {
      const salida = await prepararSalida(DEL_MODELO, {
        conversation: { id: 2, current_cycle: 1, stage: "cotizacion" },
        tipo,
      });
      expect(salida.texto ?? "", tipo).not.toMatch(/cotizo por 6/i);
      expect(salida.texto ?? "", tipo).toContain("FALKEN");
    }
  });
});
