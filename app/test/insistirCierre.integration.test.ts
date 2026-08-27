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
const { insistirConLoQueFalta } = await import("../src/services/insistirCierre.js");

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

  it("sin cotización viva no molesta: todavía se está vendiendo", async () => {
    const fila = await conversacion("593980006004", { conCotizacion: false });
    const r = await insistirConLoQueFalta(fila.id, 1, "La 225/65R17 la tengo en tres marcas.");
    expect(r.agregado).toBeNull();
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
});
