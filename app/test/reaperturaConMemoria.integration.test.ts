/**
 * LA REAPERTURA NO PUEDE BORRAR UNA VISITA QUE TODAVÍA ESTÁ VIVA.
 *
 * Conv 11274, 27-ago-2026: el cliente tenía una cotización vigente por
 * 255/70R16, el clasificador cerró el chat y cuatro minutos después la
 * reapertura borró la medida. El bot volvió a pedir lo que acababan de hablar.
 * Conv 4732 protege el borde contrario: después de 13 días sí era otra compra
 * y conservar 265/65R17 habría contaminado el pedido nuevo por 235/70R15.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = `autoventa_reapertura_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let conversations: typeof import("../src/services/conversations.js");

describe.sequential("reabrir conserva solamente la memoria de la visita actual", () => {
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

    const db = await import("../src/db/client.js");
    appSql = db.sql;
    await (await import("../src/db/schema.js")).ensureSchema();
    conversations = await import("../src/services/conversations.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  async function conversacionCerrada(phone: string, silencio: string): Promise<number> {
    const [row] = await appSql<{ id: number }[]>`
      insert into conversations (
        phone, stage, status, tire_size, vehicle, vehicle_year,
        location_label, nearest_store, selected_product_code,
        selected_quantity, customer_commitment, visit_date,
        last_customer_message_at, closed_reason, closed_at
      ) values (
        ${phone}, 'perdido', 'closed', '255/70R16', 'Chevrolet D-Max', 2021,
        'Cumbayá', 'cumbaya', '356398', 4, 'Voy esta tarde',
        current_date, now() - ${silencio}::interval, 'No interesado', now()
      )
      returning id
    `;
    return row.id;
  }

  it("conv 11274: al volver cuatro minutos después conserva medida, vehículo y local", async () => {
    const phone = "593000011274";
    const id = await conversacionCerrada(phone, "4 minutes");

    await conversations.getOrCreateConversation(phone, "Cliente 11274");

    const [ficha] = await appSql<{
      tire_size: string | null;
      vehicle: string | null;
      vehicle_year: number | null;
      location_label: string | null;
      nearest_store: string | null;
      selected_product_code: string | null;
      selected_quantity: number | null;
      customer_commitment: string | null;
      visit_date: Date | null;
    }[]>`
      select tire_size, vehicle, vehicle_year, location_label, nearest_store,
        selected_product_code, selected_quantity, customer_commitment, visit_date
      from conversations where id = ${id}
    `;

    expect(ficha).toEqual({
      tire_size: "255/70R16",
      vehicle: "Chevrolet D-Max",
      vehicle_year: 2021,
      location_label: "Cumbayá",
      nearest_store: "cumbaya",
      selected_product_code: null,
      selected_quantity: null,
      customer_commitment: null,
      visit_date: null,
    });
  });

  it("conv 4732: después del corte de 12 horas limpia también la memoria estable", async () => {
    const phone = "593000004732";
    const id = await conversacionCerrada(phone, "12 hours 1 minute");

    await conversations.getOrCreateConversation(phone, "Cliente 4732");

    const [ficha] = await appSql<{
      tire_size: string | null;
      vehicle: string | null;
      vehicle_year: number | null;
      location_label: string | null;
      nearest_store: string | null;
    }[]>`
      select tire_size, vehicle, vehicle_year, location_label, nearest_store
      from conversations where id = ${id}
    `;
    expect(ficha).toEqual({
      tire_size: null,
      vehicle: null,
      vehicle_year: null,
      location_label: null,
      nearest_store: null,
    });
  });

  it("/restart sigue empezando de cero aunque el último mensaje sea reciente", async () => {
    const id = await conversacionCerrada("593000009999", "2 minutes");
    await appSql`update conversations set status='open' where id=${id}`;

    await conversations.reiniciarConversacion(id);

    const [ficha] = await appSql<{
      tire_size: string | null; vehicle: string | null; nearest_store: string | null;
    }[]>`select tire_size, vehicle, nearest_store from conversations where id=${id}`;
    expect(ficha).toEqual({ tire_size: null, vehicle: null, nearest_store: null });
  });
});
