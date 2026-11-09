/**
 * SPRINT 2 · RECORDATORIOS AUTOMÁTICOS — de punta a punta contra Postgres
 * (auditoría del 9-nov-2026). El seguimiento pasa por `processFollowUpJob` →
 * `ensureFollowUpJobCopy` → `prepararSalida` (tipo `seguimiento`) con el
 * catálogo y la promo de verdad; solo el modelo del Guardián es falso.
 *
 * - 2a (26 seguimientos, 17 chats; 39168): el seguimiento copia los precios
 *   guardados con la lámina («KENDA KR601 — $194.85 c/u · 4 = $779.40») y el 7-nov
 *   Kenda ya iba a «2 × $259.80 + 2 × $103.92 = $727.44». El 1-dic haría lo
 *   contrario: «(−60 % en la 2.ª llanta)» con la promo apagada.
 * - 2b (24 chats; 39194, 39208…): el 2.º recordatorio trae la MISMA lista con
 *   otra cabecera y el filtro anti-calco solo compara el texto entero.
 * - 2c1 (39282, 38924, 39667): el gate previo mira 2 mensajes con frases exactas.
 * - 2d (39282): el borrador que el Guardián calificó de malo no puede salir.
 *
 * Están en ROJO a propósito hasta que el sprint arregle el código. Las
 * marcadas «guarda» (los chats sanos: 38811, 39011, 39474, el seguimiento normal
 * a quien no contestó el menú) pasan hoy y no pueden dejar de pasar.
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.GRAPH_BASE_URL = "http://127.0.0.1:9";

const BASE = `autoventa_s2_recordatorios_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

/** El catálogo de HOY, tal como lo ve el seguimiento al enviar. */
const cat = vi.hoisted(() => ({ items: new Map<string, unknown>(), cargado: true }));
vi.mock("../src/services/catalog.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/services/catalog.js")>();
  return {
    ...real,
    findByCode: (codigo: string) => (cat.cargado ? cat.items.get(codigo) : undefined),
    catalogCandidates: (referencia: string) => (cat.cargado && cat.items.has(referencia) ? [cat.items.get(referencia)] : []),
    catalogStatus: () => ({ ...real.catalogStatus(), items: cat.cargado ? cat.items.size : 0, error: null }),
  };
});

/** El Guardián falso: devuelve lo que cada prueba le diga, con el candado de verdad detrás. */
const guardianFalso = vi.hoisted(() => ({
  hallazgos: [] as Array<{ categoria: string; severidad: string; detalle: string }>,
  texto: null as string | null,
  /** Un texto por llamada (null = el borrador tal cual); se agota y sigue `texto`. */
  cola: [] as Array<string | null>,
  vistos: [] as Array<{ borrador: string; telefono: string | null | undefined }>,
}));
vi.mock("../src/services/guardian.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/services/guardian.js")>();
  return {
    ...real,
    revisarConGuardian: async (conv: { phone?: string | null }, borrador: string) => {
      guardianFalso.vistos.push({ borrador, telefono: conv.phone });
      return {
        texto: (guardianFalso.cola.length ? guardianFalso.cola.shift() : guardianFalso.texto) ?? borrador,
        veredicto: guardianFalso.hallazgos.length ? "corregir" : "aprobar",
        hallazgos: guardianFalso.hallazgos,
      };
    },
  };
});

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const conversations = await import("../src/services/conversations.js");
const followUps = await import("../src/services/followUps.js");
const processor = await import("../src/services/followUpProcessor.js");
const { fijarCompuertaDeTemporada, segundaLlantaDe } = await import("../src/domain/promocionDeTemporada.js");
const { POLITICA_DEPOT } = await import("../src/negocio/politicas/depot.js");

/** Lunes 9-nov-2026, 10:00 en Guayaquil: Black Friday corre y es horario comercial. */
const AHORA = new Date("2026-11-09T15:00:00.000Z");
/** Miércoles 2-dic-2026, 10:00: la promo ya terminó (válida hasta el 30-nov). */
const DOS_DE_DICIEMBRE = new Date("2026-12-02T15:00:00.000Z");
const HACE = (minutos: number, desde = AHORA) => new Date(desde.getTime() - minutos * 60_000);

function llanta(codigo: string, marca: string, diseno: string, hoy: number, lista: number, stock = 12): CatalogItem {
  return {
    id: codigo, code: codigo, name: `265/65R18 ${marca} ${diseno}`, brand: marca, design: diseno,
    size: { width: 265, aspect: 65, rim: 18 }, sizeLabel: "265/65R18",
    price: hoy / 1.15, sourcePrice: hoy / 1.15, priceTier: "pvp1",
    prices: { pvp1: hoy / 1.15, pvp2: hoy / 1.15, pvp3: hoy / 1.15, pvp4: hoy / 1.15 },
    taxRate: 0.15, customerPriceWithTax: lista, minimumPriceWithTax: hoy, distributorPriceWithTax: hoy * 0.8,
    stock, availability: "available", imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  } as CatalogItem;
}

/** Las tres opciones del 39168: Winrun (sin promo), Kenda KR601 y Falken (−25 % de hoy, −60 % en la 2.ª). */
const WINRUN = llanta("W-R380", "WINRUN", "R380", 124.76, 124.76);
const KENDA = llanta("K-KR601", "KENDA", "KR601", 194.85, 259.8);
const FALKEN = llanta("F-CT60", "FALKEN", "ZIEX CT60 A/S", 200.0, 266.67);

let siguienteTelefono = 0;
/** Un id de WhatsApp distinto por envío: con el mismo, el hilo no guarda el segundo mensaje. */
let siguienteWamid = 0;

async function conversacion(stage = "seleccionando") {
  siguienteTelefono += 1;
  const phone = `59398${String(800000 + siguienteTelefono).padStart(6, "0")}`;
  const conv = await conversations.getOrCreateConversation(phone, `Cliente ${siguienteTelefono}`);
  await sql`
    update conversations set stage = ${stage}, tire_size = '265/65R18', selected_quantity = 4,
      customer_opt_in = true where id = ${conv.id}
  `;
  return conv;
}

async function mensaje(convId: number, quien: "cliente" | "bot", texto: string, creado: Date) {
  await sql`
    insert into messages (conversation_id, role, content, direction, type, status, author_kind, cycle, created_at)
    values (${convId}, ${quien === "cliente" ? "user" : "assistant"}, ${texto},
      ${quien === "cliente" ? "inbound" : "outbound"}, 'text', 'delivered',
      ${quien === "cliente" ? "customer" : "bot"}, 1, ${creado})
  `;
}

type Escalon = { codigo: string; nombre: string; precio_con_iva: number; segunda_llanta?: unknown };

/** La lámina de opciones tal como `preparar_opciones` la deja guardada. */
async function lamina(convId: number, escalones: { economica?: Escalon; equilibrada?: Escalon; premium?: Escalon }, creado: Date) {
  const lista = Object.values(escalones).filter(Boolean) as Escalon[];
  await sql`
    insert into messages (conversation_id, role, content, direction, type, status, author_kind, cycle, created_at, metadata)
    values (${convId}, 'assistant', ${`Opciones enviadas: ${lista.map((e) => e.nombre).join(" · ")}`}, 'outbound', 'image', 'delivered', 'bot', 1,
      ${creado}, ${sql.json({
        piece: "options", codes: lista.map((e) => e.codigo), cantidad: 4, escalones,
      } as never)})
  `;
}

/** Lo que guardaba la lámina del 6-nov por la mañana: antes de abrir Black Friday (sin `segunda_llanta`). */
const ESCALONES_VIEJOS = {
  economica: { codigo: WINRUN.code, nombre: "WINRUN R380", precio_con_iva: 124.76 },
  equilibrada: { codigo: KENDA.code, nombre: "KENDA KR601", precio_con_iva: 194.85 },
  premium: { codigo: FALKEN.code, nombre: "FALKEN ZIEX CT60 A/S", precio_con_iva: 200.0 },
};

/** Lo que guarda una lámina posterior a la apertura: con la cuenta de la 2.ª llanta (38811, 39011). */
function escalonesConPromo(ahora: Date) {
  const promo = (marca: string, hoy: number, lista: number) =>
    segundaLlantaDe(POLITICA_DEPOT.promocionDeTemporada, marca, 4, { hoyConIva: hoy, listaConIva: lista }, ahora);
  return {
    economica: { codigo: WINRUN.code, nombre: "WINRUN R380", precio_con_iva: 124.76 },
    equilibrada: { codigo: KENDA.code, nombre: "KENDA KR601", precio_con_iva: 194.85, segunda_llanta: promo("KENDA", 194.85, 259.8) },
    premium: { codigo: FALKEN.code, nombre: "FALKEN ZIEX CT60 A/S", precio_con_iva: 200.0, segunda_llanta: promo("FALKEN", 200.0, 266.67) },
  };
}

/**
 * Un ciclo con la lámina y el menú ya enviados y el cliente callado:
 * cliente (medida) → lámina → menú → silencio. Devuelve la conversación.
 */
async function ciclo(opts: { escalones?: object; ultimoDelCliente?: string; stage?: string } = {}) {
  const conv = await conversacion(opts.stage);
  await mensaje(conv.id, "cliente", opts.ultimoDelCliente ?? "Necesito llantas 265/65R18 para camioneta", HACE(180));
  await lamina(conv.id, (opts.escalones ?? ESCALONES_VIEJOS) as never, HACE(179));
  await mensaje(conv.id, "bot", "¿Le cotizo la 1, la 2 o la 3?", HACE(178));
  await sql`
    update conversations set last_customer_message_at = ${HACE(180)}, last_assistant_message_at = ${HACE(178)} where id = ${conv.id}
  `;
  return conv;
}

async function jobsDeEnvio(convId: number) {
  return sql<{ id: number; type: string; status: string; cancel_reason: string | null; payload: Record<string, unknown> }[]>`
    select id, type, status, cancel_reason, payload from follow_up_jobs
    where conversation_id = ${convId} and type like 'in_window_%' order by id
  `;
}

/**
 * Agenda el plan y procesa TODOS los jobs de envío de la conversación, en orden
 * (el primero y el segundo). Devuelve lo que salió por WhatsApp, un elemento por job
 * (null = no salió nada). El procesador mismo guarda el mensaje enviado en el hilo.
 */
async function procesar(convId: number, ahora = AHORA) {
  await followUps.scheduleConversationFollowUps(convId, ahora);
  await sql`
    update follow_up_jobs set due_at = ${HACE(1, ahora)}
    where conversation_id = ${convId} and status = 'scheduled' and type like 'in_window_%'
  `;
  const reclamados = (await followUps.claimDueFollowUpJobs({ now: ahora, limit: 50 }))
    .filter((j: { conversation_id?: number; conversationId?: number }) => (j.conversation_id ?? j.conversationId) === convId)
    .sort((a: { id: number }, b: { id: number }) => a.id - b.id);
  const enviados: Array<string | null> = [];
  for (const job of reclamados) {
    let salio: string | null = null;
    await processor.processFollowUpJob(job, {
      now: () => ahora,
      sendText: async (_id: number, _phone: string, body: string) => { salio = body; return `wamid.s2.${++siguienteWamid}`; },
      sendTemplate: async () => "wamid.template",
    });
    enviados.push(salio);
  }
  return enviados;
}

describe.sequential("recordatorios automáticos · sprint 2", () => {
  beforeAll(async () => {
    await ensureSchema();
  });

  afterAll(async () => {
    await sql?.end();
    await admin.unsafe(`drop database if exists ${BASE}`);
    await admin.end();
  });

  beforeEach(() => {
    guardianFalso.hallazgos = [];
    guardianFalso.texto = null;
    guardianFalso.cola = [];
    guardianFalso.vistos = [];
    cat.cargado = true;
    cat.items = new Map([WINRUN, KENDA, FALKEN].map((i) => [i.code, i]));
    fijarCompuertaDeTemporada(() => true);
  });

  afterEach(() => {
    fijarCompuertaDeTemporada(() => true);
    vi.useRealTimers();
  });

  // =========================================================================
  // 2a · la lista VIGENTE de la pieza
  // =========================================================================
  describe("2a · el seguimiento dice el precio de HOY, no el que quedó guardado", () => {
    it("39168: lámina del 6-nov sin promo + Black Friday vigente → la cuenta de la 2.ª llanta", async () => {
      const conv = await ciclo({ escalones: ESCALONES_VIEJOS });
      const [texto] = await procesar(conv.id);
      expect(texto).not.toBeNull();
      expect(texto).not.toContain("$194.85 c/u · 4 = $779.40");
      expect(texto).toContain("KENDA KR601 — 2 × $259.80 + 2 × $103.92 = $727.44 (−60 % en la 2.ª llanta)");
      // 39474: Winrun no entra a la promo de la 2.ª llanta y conserva su línea.
      expect(texto).toContain("WINRUN R380 — $124.76 c/u · 4 = $499.04");
    });

    it("guarda · 38811 / 39011: lámina posterior a la promo, la cuenta guardada es la misma de hoy", async () => {
      const conv = await ciclo({ escalones: escalonesConPromo(AHORA) });
      const [texto] = await procesar(conv.id);
      expect(texto).toContain("KENDA KR601 — 2 × $259.80 + 2 × $103.92 = $727.44 (−60 % en la 2.ª llanta)");
      expect(texto).toContain("WINRUN R380 — $124.76 c/u · 4 = $499.04");
    });

    it("1-dic: lámina de noviembre con `segunda_llanta` y reloj en el 2-dic → no aparece «−60 %»", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: DOS_DE_DICIEMBRE });
      const conv = await ciclo({ escalones: escalonesConPromo(AHORA) });
      // El 2-dic los mensajes de la fixture quedaron muy atrás: el seguimiento sigue siendo del mismo ciclo.
      await sql`update messages set created_at = created_at + interval '23 days' where conversation_id = ${conv.id}`;
      await sql`
        update conversations set last_customer_message_at = ${HACE(180, DOS_DE_DICIEMBRE)}, last_assistant_message_at = ${HACE(178, DOS_DE_DICIEMBRE)}
        where id = ${conv.id}
      `;
      const [texto] = await procesar(conv.id, DOS_DE_DICIEMBRE);
      expect(texto).not.toBeNull();
      expect(texto).not.toMatch(/−60|2\.ª llanta|2 ×/);
      expect(texto).toContain("KENDA KR601 — $194.85 c/u · 4 = $779.40");
    });

    it("compuerta del admin cerrada (promo apagada a mano) → tampoco aparece «−60 %»", async () => {
      // La lámina se emitió con la promo abierta; DESPUÉS el admin cierra la compuerta.
      const guardados = escalonesConPromo(AHORA);
      fijarCompuertaDeTemporada(() => false);
      const conv = await ciclo({ escalones: guardados });
      const [texto] = await procesar(conv.id);
      expect(texto).not.toMatch(/−60|2\.ª llanta|2 ×/);
      expect(texto).toContain("KENDA KR601 — $194.85 c/u · 4 = $779.40");
    });

    it("un código sin stock hoy → la lista sale SIN precios, con nombres", async () => {
      cat.items.set(KENDA.code, { ...KENDA, stock: 0, availability: "out_of_stock" });
      const conv = await ciclo({ escalones: ESCALONES_VIEJOS });
      const [texto] = await procesar(conv.id);
      expect(texto).not.toBeNull();
      expect(texto).not.toMatch(/\$\s*\d/);
      expect(texto).toMatch(/KENDA KR601/);
      expect(texto).toMatch(/la 1, la 2 o la 3/);
    });

    it("catálogo sin cargar → nunca cae a los precios guardados", async () => {
      cat.cargado = false;
      const conv = await ciclo({ escalones: ESCALONES_VIEJOS });
      const [texto] = await procesar(conv.id);
      expect(texto).not.toBeNull();
      expect(texto).not.toMatch(/\$\s*\d/);
      expect(texto).toMatch(/la 1, la 2 o la 3/);
    });
  });

  // =========================================================================
  // 2b · la misma lista reenviada
  // =========================================================================
  describe("2b · la lista no sale dos veces en el mismo ciclo", () => {
    it("guarda · el primer seguimiento a quien no contestó el menú sale con la lista", async () => {
      const conv = await ciclo({ escalones: escalonesConPromo(AHORA) });
      const [primero] = await procesar(conv.id);
      expect(primero).toContain("1 · WINRUN R380 — $124.76 c/u · 4 = $499.04");
      expect(primero).toContain("¿Le cotizo la 1, la 2 o la 3?");
    });

    it("el 2.º seguimiento (otra cabecera, mismas líneas) sale sin la lista o no sale", async () => {
      const conv = await ciclo({ escalones: escalonesConPromo(AHORA) });
      const [primero, segundo] = await procesar(conv.id);
      expect(await jobsDeEnvio(conv.id)).toHaveLength(2);
      expect(primero).toContain("1 · WINRUN R380 — $124.76 c/u · 4 = $499.04");
      // Suprimido (null) o, si sale, sin repetir las líneas ni los precios del primero.
      if (segundo !== null) {
        expect(segundo).not.toContain("$124.76");
        expect(segundo).not.toMatch(/\$\s*\d/);
        expect(segundo).toMatch(/la 1, la 2 o la 3/);
        expect(segundo).toMatch(/WINRUN R380|KENDA KR601|FALKEN/);
      }
    });
  });

  describe("2b · lo que reescriba el Guardián tampoco repite la lista", () => {
    it("el 2.º seguimiento reescrito con otra cabecera y las MISMAS líneas se suprime", async () => {
      const lineas =
        "1 · WINRUN R380 — $124.76 c/u · 4 = $499.04\n"
        + "2 · KENDA KR601 — 2 × $259.80 + 2 × $103.92 = $727.44 (−60 % en la 2.ª llanta)\n"
        + "3 · FALKEN ZIEX CT60 A/S — 2 × $266.67 + 2 × $106.67 = $746.68 (−60 % en la 2.ª llanta)";
      guardianFalso.hallazgos = [{ categoria: "tono", severidad: "baja", detalle: "Tono." }];
      guardianFalso.cola = [null, `Le comparto nuevamente las opciones:\n${lineas}\n¿Le cotizo la 1, la 2 o la 3?`];
      const conv = await ciclo({ escalones: escalonesConPromo(AHORA) });
      const [primero, segundo] = await procesar(conv.id);
      expect(primero).toContain("1 · WINRUN R380");
      expect(segundo).toBeNull();
      const [, job2] = await jobsDeEnvio(conv.id);
      expect(job2.cancel_reason).toBe("seguimiento_suprimido:lista_ya_enviada");
    });
  });

  // =========================================================================
  // 2c1 · el gate previo
  // =========================================================================
  describe("2c1 · porQueNoQuiereSeguimiento mira todo lo que el cliente dijo desde el último mensaje del bot", () => {
    it("39667: «Encontramos las BFGoodrich», «No nos espere», «Gracias», «Muy amable» → no hay seguimiento", async () => {
      const conv = await ciclo({ ultimoDelCliente: "Encontramos las BFGoodrich" });
      await mensaje(conv.id, "cliente", "No nos espere", HACE(170));
      await mensaje(conv.id, "cliente", "Gracias", HACE(169));
      await mensaje(conv.id, "cliente", "Muy amable", HACE(168));
      expect(await followUps.porQueNoQuiereSeguimiento(conv.id, 1)).not.toBeNull();
    });

    it("39667: aunque «No nos espere» quede a tres mensajes de distancia del último", async () => {
      const conv = await ciclo({ ultimoDelCliente: "Hola" });
      await mensaje(conv.id, "cliente", "No nos espere", HACE(170));
      await mensaje(conv.id, "cliente", "Gracias", HACE(169));
      await mensaje(conv.id, "cliente", "Muy amable", HACE(168));
      expect(await followUps.porQueNoQuiereSeguimiento(conv.id, 1)).not.toBeNull();
    });

    it("38924: «Está muy lejos le agradezco»", async () => {
      const conv = await ciclo({ ultimoDelCliente: "Está muy lejos le agradezco" });
      expect(await followUps.porQueNoQuiereSeguimiento(conv.id, 1)).not.toBeNull();
    });

    it("39282: «Ninguna gracias, necesito llantas doble propósito» → no recibe el menú otra vez", async () => {
      const conv = await ciclo({ ultimoDelCliente: "Ninguna gracias, necesito llantas doble propósito" });
      // Ni se agenda (el gate lo ve al programar) ni, si hubiera un job viejo, sale.
      expect((await procesar(conv.id)).filter(Boolean)).toHaveLength(0);
      expect((await jobsDeEnvio(conv.id)).filter((j) => j.status === "sent")).toHaveLength(0);
    });

    it("guarda · «Está lejos pero voy» sigue siendo venta viva", async () => {
      const conv = await ciclo({ ultimoDelCliente: "Está lejos pero voy el sábado" });
      expect(await followUps.porQueNoQuiereSeguimiento(conv.id, 1)).toBeNull();
    });
  });

  // =========================================================================
  // 2d (+2c2) · un borrador que el Guardián marcó como malo nunca sale
  // =========================================================================
  describe("2d · el borrador calificado de malo no sale", () => {
    // El cliente acaba de pedir doble propósito; el Gate no lo toca.
    const ULTIMO = "Necesito llantas doble propósito";
    const OFRECE_UNA = "Solo le puedo ofrecer 1 unidad de la KENDA KR50, ¿se la cotizo?";
    const ALTA = [{ categoria: "contradiccion", severidad: "alta", detalle: "El cliente rechazó esas opciones." }];

    it("39282: la corrección que NIEGA («solo hay 1 unidad, no puedo ofrecerla») es la que sale, no el menú", async () => {
      guardianFalso.hallazgos = ALTA;
      guardianFalso.texto =
        "Para doble propósito en *265/65R18* le confirmé la *Falken Wildpeak A/T 4W*, pero hoy solo hay *1 unidad*, "
        + "así que no puedo ofrecerla para juego de 4. Si desea, puedo revisar con el asesor si se puede conseguir el juego completo por pedido.";
      const conv = await ciclo({ ultimoDelCliente: ULTIMO });
      const [texto] = await procesar(conv.id);
      expect(texto).toBe(guardianFalso.texto);
      expect(texto).not.toMatch(/Estas son las opciones|Le dejo otra vez/);
    });

    it("corrección que SÍ vende de más + hallazgo alto → el seguimiento se suprime, nunca vuelve el borrador", async () => {
      guardianFalso.hallazgos = ALTA;
      guardianFalso.texto = OFRECE_UNA;
      const conv = await ciclo({ ultimoDelCliente: ULTIMO });
      const [texto] = await procesar(conv.id);
      expect(texto).toBeNull();
      const [job] = await jobsDeEnvio(conv.id);
      expect(job.status).toBe("cancelled");
      expect(job.cancel_reason).toMatch(/^seguimiento_suprimido:/);
    });

    it("guarda · con un hallazgo de severidad media el borrador sigue saliendo como hoy", async () => {
      guardianFalso.hallazgos = [{ categoria: "tono", severidad: "media", detalle: "Un poco seco." }];
      guardianFalso.texto = OFRECE_UNA;
      const conv = await ciclo({ ultimoDelCliente: ULTIMO });
      const [texto] = await procesar(conv.id);
      expect(texto).not.toBeNull();
      expect(texto).toMatch(/opciones/i);
    });

    it("cada bloqueo deja su alerta: el 2.º seguimiento del ciclo no se queda sin rastro", async () => {
      guardianFalso.hallazgos = ALTA;
      guardianFalso.texto = OFRECE_UNA;
      const conv = await ciclo({ ultimoDelCliente: ULTIMO });
      await procesar(conv.id);
      const [{ n }] = await sql<{ n: number }[]>`
        select count(*)::int as n from bot_alerts
        where conversation_id = ${conv.id} and type = 'guardian_hecho_nuevo_bloqueado'
      `;
      expect(n).toBe(2);
    });

    it("el Guardián recibe el teléfono de la conversación (canary)", async () => {
      const conv = await ciclo({ ultimoDelCliente: ULTIMO });
      await procesar(conv.id);
      expect(guardianFalso.vistos.length).toBeGreaterThan(0);
      expect(guardianFalso.vistos.every((v) => v.telefono === conv.phone)).toBe(true);
    });
  });
});
