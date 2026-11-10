import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * El candado que agrega la pregunta que falta — contra base, porque lo que
 * decide vive ahí: si hay cotización, si hay local y si hay visita registrada.
 * Ver `domain/preguntaPendiente.ts` para el caso que lo originó.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_insistir_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { insistirConLoQueFalta, sinPreguntaPendienteConsecutiva } = await import("../src/services/insistirCierre.js");

const EL_QUE_CERRO_SIN_PREGUNTAR =
  "Sí, le sirven para uso mixto; la *WINRUN MAXCLAW A/T* es A/T, más apta que una de calle "
  + "para tierra y camino irregular.";

interface Fila { id: number }

async function conversacion(phone: string, opciones: {
  conCotizacion?: boolean; local?: string | null; visita?: boolean;
} = {}): Promise<Fila> {
  const [fila] = await sql<Fila[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, nearest_store, visit_date)
    values (${phone}, 'Manuel', 'open', 'cotizacion_enviada', 1, '225/65R17',
      ${opciones.local ?? null}, ${opciones.visita ? new Date("2026-08-29T15:00:00Z") : null})
    returning id
  `;
  if (opciones.conCotizacion !== false) {
    await sql`
      insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, sale_number)
      values (${fila.id}, 1, ${sql.json([{
        code: "W1", brand: "WINRUN", design: "MAXCLAW A/T", sizeLabel: "225/65R17",
        quantity: 3, salePriceWithTax: 97.97, listPriceWithTax: 130.63,
      }])}, 255.57, 38.34, 293.91, 'COT-X', 'AV-X')
    `;
  }
  return fila;
}

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("insistir con lo que falta", () => {
  it("EL CASO DEL CHAT: con el local dado y sin día, agrega la pregunta del día CON el ahorro", async () => {
    const fila = await conversacion("593980006001", { local: "Depot Tire Cumbayá" });
    const r = await insistirConLoQueFalta(fila.id, 1, EL_QUE_CERRO_SIN_PREGUNTAR);

    expect(r.agregado).toBe("dia");
    expect(r.texto).toContain(EL_QUE_CERRO_SIN_PREGUNTAR);
    expect(r.texto).toMatch(/qué día cree que puede pasar/i);
    expect(r.texto).toContain("Depot Tire Cumbayá");
    // 3 × (130.63 − 97.97) = 97.98
    expect(r.texto).toContain("*25 %*");
    expect(r.texto).toContain("$97.98");
    // Va como mensaje aparte, no pegado al párrafo.
    expect(r.texto).toContain("---");
  });

  it("sin local, la que falta es la del local", async () => {
    const fila = await conversacion("593980006002", { local: null });
    const r = await insistirConLoQueFalta(fila.id, 1, "Sí, incluye alineación y balanceo sin costo.");
    expect(r.agregado).toBe("local");
    expect(r.texto).toMatch(/Cumbayá/);
    expect(r.texto).toMatch(/Quito Sur/);
  });

  it("EL CASO QUE NO DEBE DISPARAR: si el turno YA pregunta, no se toca", async () => {
    const fila = await conversacion("593980006003", { local: "Depot Tire Cumbayá" });
    const yaPregunta = "Sí, incluye alineación. ¿Qué día cree que puede pasar?";
    const r = await insistirConLoQueFalta(fila.id, 1, yaPregunta);
    expect(r.agregado).toBeNull();
    expect(r.texto).toBe(yaPregunta);
  });

  it("sin cotización formal NI señales de cierre: todavía se está vendiendo", async () => {
    const fila = await conversacion("593980006004", { conCotizacion: false });
    const r = await insistirConLoQueFalta(fila.id, 1, "La 225/65R17 la tengo en tres marcas.");
    expect(r.agregado).toBeNull();
  });

  it("EL CASO OSWALDO (conv 13909): sin PDF pero con opciones y local, «Gracias» recibe la pregunta del día", async () => {
    const [fila] = await sql<Fila[]>`
      insert into conversations (phone, name, status, stage, current_cycle, nearest_store, visit_date)
      values ('593999699487', 'Oswaldo', 'open', 'seguimiento_venta', 1, 'Depot Tire Quito Sur', null)
      returning id
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type, metadata)
      values (
        ${fila.id}, 1, 'assistant', 'outbound',
        'Opciones enviadas: FALKEN ZE310R · KENDA KR20 · WINRUN R330', 'text',
        ${sql.json({ piece: "options" })}
      )
    `;
    const cierreBlando =
      "Con gusto. Cuando tenga definido el día, me escribe y le ayudamos a coordinar su visita en *Depot Tire Quito Sur*.";
    const r = await insistirConLoQueFalta(
      fila.id, 1, cierreBlando, "Gracias", "seguimiento_venta",
    );

    expect(r.agregado).toBe("dia");
    expect(r.texto).toContain(cierreBlando);
    expect(r.texto).toMatch(/qué día cree que puede pasar/i);
    expect(r.texto).toContain("Depot Tire Quito Sur");
    expect(r.texto).toContain("---");
  });

  it("si el cliente volvió a pedir otra medida no salta a preguntarle el local", async () => {
    const fila = await conversacion("593980006014", { local: null });
    const texto = "Opciones enviadas para 185/70R14.\n---\n¿Qué prioriza: costo, equilibrio o premium?";
    const r = await insistirConLoQueFalta(
      fila.id, 1, texto, "También necesito ver opciones en 185/70R14", "medida_confirmada",
    );

    expect(r.agregado).toBeNull();
    expect(r.texto).toBe(texto);
  });

  it("con local Y visita registrados deja de molestar", async () => {
    const fila = await conversacion("593980006005", { local: "Depot Tire Quito Sur", visita: true });
    const r = await insistirConLoQueFalta(fila.id, 1, "Sí, le sirven para uso mixto.");
    expect(r.agregado).toBeNull();
  });

  it("EL BORDE: con el turno lleno de bloques, la pregunta igual sobrevive", async () => {
    const fila = await conversacion("593980006006", { local: "Depot Tire Cumbayá" });
    const lleno = ["uno", "dos", "tres", "cuatro"].join("\n\n---\n\n");
    const r = await insistirConLoQueFalta(fila.id, 1, lleno);
    // splitBlocks manda 4 como máximo: se suelta el más viejo para hacerle sitio.
    const bloques = r.texto.split(/\n\s*-{3,}\s*\n/).map((b) => b.trim()).filter(Boolean);
    expect(bloques).toHaveLength(4);
    expect(bloques.at(-1)).toMatch(/qué día cree que puede pasar/i);
  });

  it("un no gracias no recibe la pregunta de local que estaba pendiente", async () => {
    const fila = await conversacion("593980006007", { local: null });
    const r = await insistirConLoQueFalta(
      fila.id, 1, "Entendido, quedamos a las órdenes.", "No gracias",
    );
    expect(r.agregado).toBeNull();
    expect(r.texto).not.toMatch(/Cumbayá|Quito Sur/);
  });

  it("no repite local en dos turnos y conserva la respuesta útil", async () => {
    const fila = await conversacion("593980006008", { local: null });
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type, author_kind)
      values (${fila.id}, 1, 'assistant', 'outbound',
        '¿Le queda mejor Cumbayá o Quito Sur para pasar a verlas?', 'text', 'bot')
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type)
      values (${fila.id}, 1, 'user', 'inbound', '¿Y la garantía cuánto dura?', 'text')
    `;
    const borrador = "La garantía es de 5 años.\n\n---\n\n¿Le queda mejor Cumbayá o Quito Sur para pasar a verlas?";
    const limpio = await sinPreguntaPendienteConsecutiva(fila.id, 1, borrador);

    expect(limpio).toBe("La garantía es de 5 años.");
  });

  // Producción, 31-ago-2026, conv 3 c20 (Manuel Montufar): a «¿Qué día cree que
  // puede pasar?…» el cliente contestó «no puedo esos dias» y el turno terminó
  // en «Entendido, aún no queda agendada la visita.» sin preguntar nada. El
  // rechazo de los días propuestos ES una respuesta: se repregunta qué día SÍ.
  const PREGUNTA_DEL_DIA_ANTERIOR =
    "¿Qué día cree que puede pasar? Le aviso al asesor para que le tenga lista su cotización con *25 %* de descuento, *$95.72* menos. 📅";

  it("EL CASO DE MANUEL: «no puedo esos dias» recibe la repregunta de qué día SÍ", async () => {
    const fila = await conversacion("593980006021", { local: "Depot Tire Quito Sur" });
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type, author_kind)
      values (${fila.id}, 1, 'assistant', 'outbound', ${PREGUNTA_DEL_DIA_ANTERIOR}, 'text', 'bot')
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type)
      values (${fila.id}, 1, 'user', 'inbound', 'no puedo esos dias', 'text')
    `;
    const r = await insistirConLoQueFalta(
      fila.id, 1, "Entendido, aún no queda agendada la visita.", "no puedo esos dias",
    );
    expect(r.agregado).toBe("dia");
    expect(r.texto).toMatch(/qué día sí le vendría bien/i);
    expect(r.texto).toContain("Depot Tire Quito Sur");
  });

  it("EL CASO QUE NO DEBE DISPARAR: sin rechazo, la pregunta del turno anterior sigue callando al candado", async () => {
    const fila = await conversacion("593980006022", { local: "Depot Tire Quito Sur" });
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type, author_kind)
      values (${fila.id}, 1, 'assistant', 'outbound', ${PREGUNTA_DEL_DIA_ANTERIOR}, 'text', 'bot')
    `;
    const r = await insistirConLoQueFalta(
      fila.id, 1, "La garantía es de 5 años.", "¿y la garantía cuánto dura?",
    );
    expect(r.agregado).toBeNull();
    expect(r.texto).toBe("La garantía es de 5 años.");
  });

  it("EL BORDE: si el cliente rechaza pero nombra un día, no es rechazo en seco y no se repregunta", async () => {
    const fila = await conversacion("593980006023", { local: "Depot Tire Quito Sur" });
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type, author_kind)
      values (${fila.id}, 1, 'assistant', 'outbound', ${PREGUNTA_DEL_DIA_ANTERIOR}, 'text', 'bot')
    `;
    const r = await insistirConLoQueFalta(
      fila.id, 1, "Perfecto, el viernes entonces.", "no puedo esos dias, mejor el viernes",
    );
    expect(r.agregado).toBeNull();
  });

  it("el dedupe conserva la repregunta del día cuando el cliente acaba de rechazar los días", async () => {
    const fila = await conversacion("593980006024", { local: "Depot Tire Quito Sur" });
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type, author_kind)
      values (${fila.id}, 1, 'assistant', 'outbound', ${PREGUNTA_DEL_DIA_ANTERIOR}, 'text', 'bot')
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type)
      values (${fila.id}, 1, 'user', 'inbound', 'no puedo esos dias', 'text')
    `;
    const borrador = "Entendido, no hay problema.\n\n---\n\n¿Qué día sí le vendría bien pasar? 📅";
    const limpio = await sinPreguntaPendienteConsecutiva(fila.id, 1, borrador, "no puedo esos dias");
    expect(limpio).toBe(borrador);
  });
});
