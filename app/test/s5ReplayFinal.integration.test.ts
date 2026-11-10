/**
 * Replay final de los cinco sprints (10-nov, rama integrada @ 4c9cb7d): las
 * corridas de la familia 7 que fallaron 1 de 3, con el texto EXACTO que salió.
 *
 *   S5-09 · 40082 «Yo vivo en pedernales» (r1): el Guardián corrigió con día,
 *           local y mapas; `sin_visita_si_no_puede_venir` vació el turno y salió
 *           el relleno «Le consulto con un asesor y le confirmo por acá 🙌».
 *   S5-13 · 39845 «Cumbayá me queda lejos» (r3): salió el mapa de Cumbayá y
 *           «¿Qué día cree que puede pasar por *Depot Tire Cumbayá*?».
 *   S5-17 · 39971 «Buenas noches» (r1): el Guardián reescribió la lista con
 *           negritas; el calco quitó solo la pregunta y salió la lista sin pregunta.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_s5replay_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { PASOS, correrPasos } = await import("../src/services/prepararSalida.js");
const { armarContexto } = await import("../src/services/guardian.js");

const paso = (nombre: string) => PASOS.find((p) => p.nombre === nombre)!;

async function conversacion(phone: string, extra: { tire?: string; local?: string | null } = {}): Promise<number> {
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, nearest_store)
    values (${phone}, 'Cliente', 'open', 'seguimiento_venta', 1, ${extra.tire ?? "245/75R16"}, ${extra.local ?? null}) returning id
  `;
  return fila.id;
}
async function entra(id: number, content: string, segundosAtras = 5) {
  await sql`insert into messages (conversation_id, cycle, role, direction, content, type, created_at)
    values (${id}, 1, 'user', 'inbound', ${content}, 'text', now() - make_interval(secs => ${segundosAtras}))`;
}
async function sale(id: number, content: string, segundosAtras: number, extra: { type?: string; metadata?: object } = {}) {
  await sql`insert into messages (conversation_id, cycle, role, direction, content, type, author_kind, metadata, created_at)
    values (${id}, 1, 'assistant', 'outbound', ${content}, ${extra.type ?? "text"}, 'bot',
      ${sql.json((extra.metadata ?? {}) as never)}, now() - make_interval(secs => ${segundosAtras}))`;
}
const ctx = (id: number, textoDelCliente: string) =>
  ({ conversation: { id, current_cycle: 1, stage: "seguimiento_venta" }, tipo: "respuesta", textoDelCliente }) as never;

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

const CORREGIDO_40082 =
  "¿Qué día puede pasar y a cuál local? ¿Depot Tire Cumbayá o Depot Tire Quito Sur? Con esos dos datos le aviso al asesor para que le atienda apenas llegue. 📅\n📍 *Depot Tire Cumbayá*: https://maps.app.goo.gl/QnMBPXKc1o8igbsp8\n📍 *Depot Tire Quito Sur*: https://maps.app.goo.gl/NQeNN8csyAnRkJDJ7\nSi prefiere, compárteme su ubicación de WhatsApp y le digo cuál le queda más cerca. 📲";

describe.sequential("S5-09 · el turno vaciado a quien está fuera sale con la respuesta fija", () => {
  it("40082: la corrección del Guardián (día + local + mapas) → «Nuestros locales están en Quito…», no el relleno", async () => {
    const id = await conversacion("593980055001");
    await entra(id, "Yo vivo en pedernales");
    // Por la cadena (desde la separación de la pregunta), como en el turno real: la
    // protección de «después de separar solo se quita» descartaba un texto agregado.
    const desde = PASOS.slice(PASOS.findIndex((p) => p.nombre === "pregunta_en_su_propio_mensaje"));
    const salida = await correrPasos(desde, CORREGIDO_40082, ctx(id, "Yo vivo en pedernales"));
    expect(salida.texto).toBe("Nuestros locales están en Quito: *Cumbayá* y *Quito Sur*. Por ahora no tenemos local fuera de Quito.");
  });

  it("con cotización en el ciclo, agrega la compra a distancia", async () => {
    const id = await conversacion("593980055002");
    await sql`insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, sale_number)
      values (${id}, 1, ${sql.json([{ code: "x", brand: "KENDA", design: "KR601", sizeLabel: "245/75R16", quantity: 4, salePriceWithTax: 100, listPriceWithTax: 100 }])},
        347.83, 52.17, 400, 'COT-RF1', 'AV-RF1')`;
    await entra(id, "Yo vivo en pedernales");
    const desde = PASOS.slice(PASOS.findIndex((p) => p.nombre === "pregunta_en_su_propio_mensaje"));
    const salida = await correrPasos(desde, CORREGIDO_40082, ctx(id, "Yo vivo en pedernales"));
    expect(salida.texto).toContain("Nuestros locales están en Quito");
    expect(salida.texto).toMatch(/pago y el envío|envío/);
  });
});

describe.sequential("S5-13 · el local que «le queda lejos» no se propone", () => {
  const SALIDA_R3 =
    "📍 *Depot Tire Cumbayá*: https://maps.app.goo.gl/QnMBPXKc1o8igbsp8\n\n---\n\n¿Qué día cree que puede pasar por *Depot Tire Cumbayá*? Con ese dato le aviso al asesor y le aplican el descuento de su cotización apenas llegue. 📅";

  it("39845 r3: el mapa y la pregunta del día pasan a Quito Sur", async () => {
    const id = await conversacion("593980055003", { tire: "225/75R15" });
    await entra(id, "Cumbayá me queda lejos");
    const salida = await paso("sin_el_local_que_le_queda_lejos").aplicar(SALIDA_R3, ctx(id, "Cumbayá me queda lejos"));
    expect(salida).not.toMatch(/Cumbay/);
    expect(salida).toContain("📍 *Depot Tire Quito Sur*: https://maps.app.goo.gl/NQeNN8csyAnRkJDJ7");
    expect(salida).toContain("¿Qué día cree que puede pasar por *Depot Tire Quito Sur*?");
  });

  it("la frase que reconoce lo dicho («Entiendo que Cumbayá le queda lejos») no se toca", async () => {
    const id = await conversacion("593980055004", { tire: "225/75R15" });
    const texto = "Entiendo que Cumbayá le queda lejos.\n---\n¿Le queda mejor *Quito Sur*?";
    expect(await paso("sin_el_local_que_le_queda_lejos").aplicar(texto, ctx(id, "Cumbayá me queda lejos"))).toBe(texto);
  });

  it("SANO: sin «lejos» el texto no cambia", async () => {
    const id = await conversacion("593980055005", { tire: "225/75R15" });
    expect(await paso("sin_el_local_que_le_queda_lejos").aplicar(SALIDA_R3, ctx(id, "Cumbayá"))).toBe(SALIDA_R3);
  });

  it("el Guardián recibe el hecho «Cumbayá le queda lejos»", async () => {
    const id = await conversacion("593980055006", { tire: "225/75R15" });
    await entra(id, "Cumbayá me queda lejos");
    const contexto = await armarContexto(id, 1, SALIDA_R3);
    expect(contexto).toMatch(/LE QUEDA LEJOS: \*Cumbayá\*/);
    expect(contexto).toContain("*Quito Sur*");
  });
});

describe.sequential("S5-17 · la lista reescrita con negritas es calco; queda la pregunta del menú", () => {
  const LISTA =
    "1 · FALKEN WILDPEAK A/T 4W — 2 × $298.87 + 2 × $119.55 = $836.84 (−60 % en la 2.ª llanta)\n2 · KENDA KR601 — 2 × $302.30 + 2 × $120.92 = $846.44 (−60 % en la 2.ª llanta)\n3 · KENDA KR608 — 2 × $319.27 + 2 × $127.71 = $893.96 (−60 % en la 2.ª llanta)";
  const PREGUNTA = "¿Le cotizo la 1, la 2 o la 3?";
  const CORREGIDO_R1 =
    "Buenas noches, con gusto le ayudo.\n\nPara la medida *265/70R16*, le dejo las opciones que vimos:\n\n1 · *FALKEN WILDPEAK A/T 4W* — 2 × $298.87 + 2 × $119.55 = $836.84\n2 · *KENDA KR601* — 2 × $302.30 + 2 × $120.92 = $846.44\n3 · *KENDA KR608* — 2 × $319.27 + 2 × $127.71 = $893.96\n---\n¿Le cotizo la 1, la 2 o la 3?";

  it("39971 r1: sale el saludo y la pregunta del menú, sin la lista repetida", async () => {
    const id = await conversacion("593980055007", { tire: "265/70R16" });
    await sale(id, "Opciones enviadas en 265/70R16", 45, { type: "image", metadata: { piece: "options", codes: ["356391", "K383B639", "33014002"] } });
    await sale(id, LISTA, 42);
    await sale(id, PREGUNTA, 40, { metadata: { oferta: { tipo: "oferta_de_cotizar", clase: "menu", opciones: 3 } } });
    await entra(id, "Buenas noches", 5);
    const salida = await paso("sin_calco_reciente").aplicar(CORREGIDO_R1, ctx(id, "Buenas noches"));
    expect(salida).not.toMatch(/WILDPEAK|KR601|KR608/);
    expect(salida).toContain("Buenas noches, con gusto le ayudo.");
    expect(salida!.trim()).toMatch(/¿Le cotizo la 1, la 2 o la 3\?$/);
    // Y por la cadena real desde la separación (la protección «solo se quita» lo deja pasar).
    const desde = PASOS.slice(PASOS.findIndex((p) => p.nombre === "pregunta_en_su_propio_mensaje"));
    const porLaCadena = await correrPasos(desde, CORREGIDO_R1, ctx(id, "Buenas noches"));
    expect(porLaCadena.texto).not.toMatch(/WILDPEAK|KR601|KR608/);
    expect(porLaCadena.texto!.trim()).toMatch(/¿Le cotizo la 1, la 2 o la 3\?$/);
  });

  it("39971 (simulador, 10-nov): «La más económica es…» sin otra pregunta conserva la del menú", async () => {
    const id = await conversacion("593980055009", { tire: "265/70R16" });
    await sale(id, "Opciones enviadas en 265/70R16", 45, { type: "image", metadata: { piece: "options", codes: ["a", "b", "c"] } });
    await sale(id, LISTA, 42);
    await sale(id, PREGUNTA, 40);
    await entra(id, "Buenas noches", 5);
    const texto = "Buenas noches, soy Martín de Depot Tire. Para la medida 265/70R16 ya tenemos opciones vistas en A/T.\n\nLa más económica es WINRUN MAXCLAW A/T en $145.47 c/u con IVA.\n---\n¿Le cotizo la 1, la 2 o la 3?";
    const salida = await paso("sin_calco_reciente").aplicar(texto, ctx(id, "Buenas noches"));
    expect(salida!.trim()).toMatch(/¿Le cotizo la 1, la 2 o la 3\?$/);
  });

  it("SANO 39561: la pregunta del local repetida y nada más que un agradecimiento sigue quitándose", async () => {
    const id = await conversacion("593980055008");
    await sale(id, "¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍", 116);
    await entra(id, "Estamos viendo si podemos adquirir", 116);
    await sale(id, "Perfecto, quedo atento. Si deciden avanzar, les ayudo a cerrar la cotización o a ver el local que les queda mejor 🤝", 72);
    await entra(id, "Ok muchas gracias", 16);
    const salida = await paso("sin_calco_reciente").aplicar(
      "Con gusto, aquí seguimos atentos 🤝\n---\n¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍",
      ctx(id, "Ok muchas gracias"),
    );
    expect(salida).toBe("Con gusto, aquí seguimos atentos 🤝");
  });
});
