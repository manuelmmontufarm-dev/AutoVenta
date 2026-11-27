/**
 * LA APERTURA CORTA CON BASE (Sprint 3, F-04, Competimotor). Los chats reales:
 *  · 989/1091/1120/1125/290: la auto-respuesta de WhatsApp Business entraba
 *    antes del bot y apagaba el saludo corto → guía + «Lo que más necesito es
 *    el *aro*… Sin ese dato no le puedo asegurar que la llanta entre.».
 *  · 1063 («Precio.»), 1112 («Q medias tiene»): `opciones_sin_medida` mandaba
 *    la guía y después la muestra de tres medidas mezcladas.
 *  · 1051 («Llantas rin 16»): la lámina del aro con tres medidas.
 *  · 432: la guía en cada ciclo a quien ya había dado la medida por foto.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEGOCIO = "mundillantas";
  delete process.env.IDENTIDAD;
});

const BASE = `autoventa_apertura_corta_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
let sql: typeof import("../src/db/client.js").sql;
let svc: typeof import("../src/services/aperturaCorta.js");

async function conversacion(phone: string, cycle = 1) {
  const [conv] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle)
    values (${phone}, 'Cliente', 'open', 'nuevo', ${cycle}) returning id
  `;
  return conv.id;
}
async function mensaje(id: number, dir: "inbound" | "outbound", autor: string, content: string, metadata: object = {}, cycle = 1) {
  await sql`
    insert into messages (conversation_id, cycle, role, direction, type, author_kind, content, metadata)
    values (${id}, ${cycle}, ${dir === "inbound" ? "user" : "assistant"}, ${dir}, 'text', ${autor}, ${content}, ${sql.json(metadata as never)})
  `;
}

const AUTO_RESPUESTA = "Gracias por tu mensaje. En este momento no podemos responder, déjanos tu solicitud y te responderemos lo antes posible. 😊";

describe.sequential("apertura corta (mundillantas)", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${BASE}`);
    await admin.unsafe(`create database ${BASE}`);
    process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";
    process.env.SELLER_PHONE = "593000000000";
    process.env.OPENAI_API_KEY = "test";
    sql = (await import("../src/db/client.js")).sql;
    await (await import("../src/db/schema.js")).ensureSchema();
    svc = await import("../src/services/aperturaCorta.js");
  });
  afterAll(async () => {
    await sql?.end();
    await admin.unsafe(`drop database if exists ${BASE}`);
    await admin.end();
  });

  it("989: con la auto-respuesta del celular adentro, la apertura ve el chat vacío", async () => {
    const id = await conversacion("593900098901");
    await mensaje(id, "inbound", "customer", "¡Hola! Quiero más información");
    await mensaje(id, "outbound", "owner", AUTO_RESPUESTA, { origen: "echo", waType: "text", automatica: true });
    const deSiempre = { previousOutbound: AUTO_RESPUESTA, autorDelUltimoSaliente: "owner" };
    expect(await svc.vistaDeApertura(id, deSiempre)).toEqual({ previousOutbound: null, autorDelUltimoSaliente: null });
  });

  it("un asesor que escribió a mano SÍ cuenta: no hay saludo encima de una persona", async () => {
    const id = await conversacion("593900098902");
    await mensaje(id, "outbound", "owner", "Buenas tardes, soy Andre", { origen: "echo", waType: "text" });
    await mensaje(id, "outbound", "owner", AUTO_RESPUESTA, { origen: "echo", waType: "text", automatica: true });
    const vista = await svc.vistaDeApertura(id, { previousOutbound: "x", autorDelUltimoSaliente: "owner" });
    expect(vista.autorDelUltimoSaliente).toBe("owner");
    expect(vista.previousOutbound).toBe("Buenas tardes, soy Andre");
  });

  it("sin auto-respuesta devuelve lo de siempre, intacto", async () => {
    const id = await conversacion("593900098903");
    await mensaje(id, "outbound", "bot", "¿Qué medida usa? Ej: 225/65R17");
    const deSiempre = { previousOutbound: "¿Qué medida usa? Ej: 225/65R17", autorDelUltimoSaliente: "bot" };
    expect(await svc.vistaDeApertura(id, deSiempre)).toBe(deSiempre);
  });

  it("1063: «Precio.» tras el saludo corto → la pregunta de las tres vías; a la tercera, la muestra de siempre", async () => {
    const id = await conversacion("593900106301");
    const { pedidoDeMedidaDelPrimerContacto } = await import("../src/domain/firstContact.js");
    const { PEDIDO_DE_MEDIDA_CON_LAS_TRES_VIAS } = await import("../src/domain/aperturaCorta.js");
    // Sin nada pedido antes (primer mensaje «Precio.»): el pedido corto del saludo.
    expect(await svc.pedidoDeMedidaSinDatos(id)).toBe(pedidoDeMedidaDelPrimerContacto());
    expect(await svc.pedidoDeMedidaSinDatos(id)).toBe(PEDIDO_DE_MEDIDA_CON_LAS_TRES_VIAS);
    expect(await svc.pedidoDeMedidaSinDatos(id)).toBeNull();
  });

  it("el saludo corto (`first_contact`) cuenta como el primer pedido", async () => {
    const id = await conversacion("593900106302");
    const { logFunnelEvent } = await import("../src/services/conversations.js");
    await logFunnelEvent(id, "respuesta_directa", { route: "first_contact" });
    const { PEDIDO_DE_MEDIDA_CON_LAS_TRES_VIAS } = await import("../src/domain/aperturaCorta.js");
    expect(await svc.pedidoDeMedidaSinDatos(id)).toBe(PEDIDO_DE_MEDIDA_CON_LAS_TRES_VIAS);
  });

  it("1051: «Llantas rin 16» → la pregunta de lo que falta, una vez por ciclo", async () => {
    const id = await conversacion("593900105101");
    const primera = await svc.preguntaPorAroSiCorresponde(id, 16);
    expect(primera).toMatch(/rin 16/);
    expect(primera).not.toMatch(/la 1|Ojo/);
    expect(await svc.preguntaPorAroSiCorresponde(id, 16)).toBeNull();
  });

  it("opciones_sin_medida contesta el texto exacto, sin guía ni muestra", async () => {
    const id = await conversacion("593900106303");
    const { buildTools } = await import("../src/agent/tools.js");
    const [conv] = await sql<never[]>`select id, phone, name, stage, bot_paused_until, status, current_cycle from conversations where id=${id}`;
    const tools = buildTools({ conversation: conv, customerPhone: "593900106303", currentUserText: "Precio." });
    const tool = tools.find((t) => t.function.name === "opciones_sin_medida")!;
    const salida = JSON.parse(await tool.execute({}));
    expect(salida.paso).toBe("pedir_la_medida");
    expect(salida.mensaje_para_enviar).toMatch(/foto del costado/);
    expect(salida.mensaje_para_enviar).not.toMatch(/Sin ese dato/);
    const [guia] = await sql`select id from messages where conversation_id=${id} and metadata->>'piece'='medida_guide'`;
    expect(guia).toBeUndefined();
  });

  it("989/432: guia_medida por iniciativa del modelo se niega; el cliente que dice «no sé» sí la recibe (no se niega)", async () => {
    const id = await conversacion("593900043201");
    const { buildTools } = await import("../src/agent/tools.js");
    const { ERROR_GUIA_SIN_PEDIRLA } = await import("../src/domain/aperturaCorta.js");
    const [conv] = await sql<never[]>`select id, phone, name, stage, bot_paused_until, status, current_cycle from conversations where id=${id}`;
    const guia = (texto: string) => buildTools({ conversation: conv, customerPhone: "593900043201", currentUserText: texto })
      .find((t) => t.function.name === "guia_medida")!;
    const negada = JSON.parse(await guia("¡Hola! Quiero más información").execute({ aro: null, lo_pidio_el_cliente: true }));
    expect(negada.error).toBe(ERROR_GUIA_SIN_PEDIRLA);
    const foto = JSON.parse(await guia("[El cliente mandó una foto que no se pudo leer. Pídele con amabilidad que escriba lo que dice el costado de la llanta.]").execute({ aro: null, lo_pidio_el_cliente: false }));
    expect(foto.error).toBe(ERROR_GUIA_SIN_PEDIRLA);
    // «no sé la medida» pasa el candado nuevo (lo que siga es la guía de siempre).
    const pedida = await guia("no sé cuál es la medida").execute({ aro: null, lo_pidio_el_cliente: true }).catch((e: Error) => JSON.stringify({ lanzo: e.message }));
    expect(JSON.parse(pedida).error ?? "").not.toBe(ERROR_GUIA_SIN_PEDIRLA);
  });

  it("902: «En Sto dgo. Donde las consigo gracias» → el local y después UNA pregunta de las tres vías", async () => {
    const { PEDIDO_TRAS_LA_UBICACION } = await import("../src/domain/aperturaCorta.js");
    const r = svc.respuestaDeUbicacionDeEntrada("En Sto dgo. Donde las consigo gracias");
    expect(r).toMatch(/^Aquí queda nuestro local:/);
    expect(r!.trim().endsWith(PEDIDO_TRAS_LA_UBICACION)).toBe(true);
    expect(r).not.toMatch(/Sin ese dato/);
    // Con un dato, el turno es del agente.
    expect(svc.respuestaDeUbicacionDeEntrada("donde las consigo en 265/65R17")).toBeNull();
    expect(svc.respuestaDeUbicacionDeEntrada("Hola, rin 16")).toBeNull();
  });
});
