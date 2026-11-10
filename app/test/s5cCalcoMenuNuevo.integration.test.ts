import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * SPRINT 5c (auditoría del 9-nov-2026) — EL «CALCO RECIENTE» BORRA LA PREGUNTA
 * DE CIERRE DE UN MENÚ NUEVO.
 *
 *   39971 · 21:00:10 lista 1 + 21:00:12 «¿Le cotizo la 1, la 2 o la 3?»
 *           21:04:22 «La 1 pero en otro labrado»
 *           21:04:51 lámina NUEVA (otras llantas) → texto = lista nueva + la
 *           misma pregunta → el candado la quitó: salió una lista sin pregunta.
 *
 * La pregunta cambió de referente: después del mensaje que la contenía salió
 * una pieza `options` (o `quote`) nueva. Se lee de la metadata, no del texto.
 *
 * Sano 39561: «¿A cuál local le queda mejor ir…?» repetida sin pieza en medio
 * sí es calco y se sigue quitando.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_s5c_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { PASOS } = await import("../src/services/prepararSalida.js");

const paso = PASOS.find((p) => p.nombre === "sin_calco_reciente")!;

const PREGUNTA = "¿Le cotizo la 1, la 2 o la 3?";
const LISTA_1 =
  "1 · WINRUN MAXCLAW A/T — $145.47 c/u · 4 = $581.88\n2 · KENDA KR628 — 2 × $230.08 + 2 × $92.03 = $644.22 (−60 % en la 2.ª llanta)\n3 · FALKEN WILDPEAK A/T TRAIL — 2 × $301.70 + 2 × $120.68 = $844.76 (−60 % en la 2.ª llanta)";
const LISTA_2 =
  "1 · WINRUN MAXCLAW A/T — $145.47 c/u · 4 = $581.88\n2 · FALKEN WILDPEAK A/T 4W — 2 × $298.87 + 2 × $119.55 = $836.84 (−60 % en la 2.ª llanta)\n3 · KENDA KR608 — 2 × $319.27 + 2 × $127.71 = $893.96 (−60 % en la 2.ª llanta)";

async function conversacion(phone: string): Promise<number> {
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size)
    values (${phone}, 'Richard', 'open', 'seleccionando', 1, '265/70R16') returning id
  `;
  return fila.id;
}

async function sale(id: number, content: string, segundosAtras: number, extra: { type?: string; metadata?: object } = {}) {
  await sql`
    insert into messages (conversation_id, cycle, role, direction, content, type, author_kind, metadata, created_at)
    values (${id}, 1, 'assistant', 'outbound', ${content}, ${extra.type ?? "text"}, 'bot',
      ${sql.json((extra.metadata ?? {}) as never)}, now() - make_interval(secs => ${segundosAtras}))
  `;
}

async function entra(id: number, content: string, segundosAtras: number) {
  await sql`
    insert into messages (conversation_id, cycle, role, direction, content, type, created_at)
    values (${id}, 1, 'user', 'inbound', ${content}, 'text', now() - make_interval(secs => ${segundosAtras}))
  `;
}

const ctx = (id: number, textoDelCliente: string) =>
  ({ conversation: { id, current_cycle: 1, stage: "seleccionando" }, tipo: "respuesta", textoDelCliente }) as never;

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("5c · una pregunta con referente nuevo no es calco", () => {
  it("39971: tras una lámina NUEVA, el segundo menú conserva «¿Le cotizo la 1, la 2 o la 3?»", async () => {
    const id = await conversacion("593980052001");
    await sale(id, "Opciones enviadas: FALKEN WILDPEAK A/T TRAIL · KENDA KR628 · WINRUN MAXCLAW A/T", 290, {
      type: "image", metadata: { piece: "options", codes: ["350276", "K383B639", "2657016WNMAXCLAWAT"] },
    });
    await sale(id, LISTA_1, 287);
    await sale(id, PREGUNTA, 285, { metadata: { oferta: { tipo: "oferta_de_cotizar", clase: "menu", opciones: 3 } } });
    await entra(id, "La 1 pero en otro labrado", 35);
    await entra(id, "Buenas noches", 28);
    await sale(id, "Opciones enviadas: FALKEN WILDPEAK A/T 4W · KENDA KR608 · WINRUN MAXCLAW A/T", 3, {
      type: "image", metadata: { piece: "options", codes: ["356391", "33014002", "2657016WNMAXCLAWAT"] },
    });

    const salida = await paso.aplicar(`${LISTA_2}\n---\n${PREGUNTA}`, ctx(id, "La 1 pero en otro labrado\nBuenas noches"));
    expect(salida).toContain(PREGUNTA);
    expect(salida).toContain("KENDA KR608");
  });

  it("igual tras una cotización nueva (pieza `quote`)", async () => {
    const id = await conversacion("593980052002");
    await sale(id, "¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍", 120);
    await entra(id, "mejor cotíceme la 2", 40);
    await sale(id, "Cotización COT-S5C enviada por $646.92", 3, { type: "image", metadata: { piece: "quote", quoteNumber: "COT-S5C" } });
    const salida = await paso.aplicar("¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍", ctx(id, "mejor cotíceme la 2"));
    expect(salida).toContain("¿A cuál local");
  });

  it("SANO 39561: la misma pregunta del local sin pieza en medio sigue siendo calco", async () => {
    const id = await conversacion("593980052003");
    await sale(id, "¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍", 116);
    await entra(id, "Estamos viendo si podemos adquirir", 116);
    await sale(id, "Perfecto, quedo atento. Si deciden avanzar, les ayudo a cerrar la cotización o a ver el local que les queda mejor 🤝", 72);
    await entra(id, "Ok muchas gracias", 16);
    const salida = await paso.aplicar(
      "Con gusto, aquí seguimos atentos 🤝\n---\n¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍",
      ctx(id, "Ok muchas gracias"),
    );
    expect(salida).toBe("Con gusto, aquí seguimos atentos 🤝");
  });

  it("SANO: un bloque SIN pregunta idéntico sigue siendo calco aunque haya pieza nueva", async () => {
    const id = await conversacion("593980052004");
    await sale(id, LISTA_1, 200);
    await sale(id, "Opciones enviadas: …", 3, { type: "image", metadata: { piece: "options", codes: ["x"] } });
    const salida = await paso.aplicar(`${LISTA_1}\n---\n${PREGUNTA}`, ctx(id, "y en otro labrado?"));
    expect(salida).toBe(PREGUNTA);
  });
});
