import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * SPRINT 5a (auditoría del 9-nov-2026) — el candado `insistir_con_lo_que_falta`
 * contra base, con los textos reales de los chats.
 *
 *   39769 · «tengo una cotización en $85 en Mazini» (habla de la de OTRO; sin
 *           producto elegido, solo vio un menú) → BOT «¿A cuál local…?»
 *   39887 · el turno repitió el menú «¿Le cotizo la 1, la 2 o la 3?» → a un
 *           segundo, «¿A cuál local le queda mejor ir…?»
 *   38924 · «Está muy lejos le agradezco» (cantidad 4 en la ficha) → igual.
 *   18535 · «Estoy en Ibarra» y después «Muy dificel ir a Quito» → la segunda
 *           pisaba `fuera` con `viene` y volvía la pregunta del local.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_s5a_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { insistirConLoQueFalta, sinPreguntaPendienteConsecutiva } = await import("../src/services/insistirCierre.js");
const { registrarDondeEstaElCliente } = await import("../src/services/dondeEstaElCliente.js");
const { PASOS } = await import("../src/services/prepararSalida.js");

interface Fila { id: number }

const MENU_39769 = "Entendido, Joffre. La opción más económica que le mostré en *225/65R17* es la *WINRUN MAXCLAW A/T* a *$97.97 c/u con IVA*.";
const MENU_39887 =
  "De PIRELLI, FIRESTONE y DUNLOP no tengo disponibilidad en 255/70R16. En esa medida sí tengo las alternativas que ya le mostré: Winrun, Falken y Kenda.\n---\n¿Le cotizo la 1, la 2 o la 3?";

async function conLamina(phone: string, opciones: { cantidad?: number | null; stage?: string } = {}): Promise<Fila> {
  const [fila] = await sql<Fila[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, selected_quantity)
    values (${phone}, 'Cliente', 'open', ${opciones.stage ?? "seleccionando"}, 1, '225/65R17', ${opciones.cantidad ?? null})
    returning id
  `;
  await sql`
    insert into messages (conversation_id, cycle, role, direction, content, type, author_kind, metadata, created_at)
    values (${fila.id}, 1, 'assistant', 'outbound',
      'Opciones enviadas: FALKEN ZIEX CT60 A/S · WINRUN MAXCLAW A/T', 'image', 'bot',
      ${sql.json({ piece: "options", codes: ["329014", "2256517WNMAXCLAWAT"] })}, now() - interval '3 minutes')
  `;
  return fila;
}

async function entra(id: number, texto: string): Promise<void> {
  await sql`
    insert into messages (conversation_id, cycle, role, direction, content, type)
    values (${id}, 1, 'user', 'inbound', ${texto}, 'text')
  `;
}

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("5a · el local no se le pregunta a quien no corresponde", () => {
  it("39769: solo vio el menú y habla de la cotización de OTRO → no se agrega «¿A cuál local…?»", async () => {
    const fila = await conLamina("593980050001");
    const cliente = "En realidad estoy buscando algo más económico\ntengo una cotización en $85 en Mazini";
    await entra(fila.id, cliente);
    // La fase la calcula el turno con el mismo texto: hoy daba cotizacion_enviada.
    const { elegirFaseOperativa } = await import("../src/agent/faseOperativa.js");
    const fase = elegirFaseOperativa({ etapaGuardada: "seleccionando", texto: cliente, tieneCotizacion: false });
    const r = await insistirConLoQueFalta(fila.id, 1, MENU_39769, cliente, fase);
    expect(r.agregado).toBeNull();
    expect(r.texto).toBe(MENU_39769);
  });

  it("39887: la oferta del turno es el MENÚ («¿Le cotizo la 1, la 2 o la 3?») → el paso no pega el local", async () => {
    const fila = await conLamina("593980050002", { cantidad: 4, stage: "seguimiento_venta" });
    const cliente = "Pirelli, firestone o dunlop si tiene";
    await entra(fila.id, cliente);
    const paso = PASOS.find((p) => p.nombre === "insistir_con_lo_que_falta")!;
    const salida = await paso.aplicar(MENU_39887, {
      conversation: { id: fila.id, current_cycle: 1, stage: "seguimiento_venta" },
      tipo: "respuesta",
      textoDelCliente: cliente,
      faseOperativa: "seguimiento_venta",
      ofertaDelTurno: { tipo: "oferta_de_cotizar", clase: "menu", opciones: 3 },
    });
    expect(salida).toBe(MENU_39887);
    expect(salida).not.toMatch(/a cuál local/i);
  });

  it("39887 (simulador, vuelta 2): el turno cierra ofreciendo cotizar UNA llanta → tampoco se pega el local", async () => {
    const fila = await conLamina("593980050009", { cantidad: 4, stage: "seguimiento_venta" });
    const cliente = "Pirelli, firestone o dunlop si tiene";
    await entra(fila.id, cliente);
    const texto = "De Pirelli, Firestone o Dunlop no tengo disponibilidad en 255/70R16. En esa medida sí tengo Kenda y Winrun; la Kenda KR608 es la opción equilibrada para uso mixto.\n\n¿Le cotizo la Kenda KR608 en 255/70R16?";
    const paso = PASOS.find((p) => p.nombre === "insistir_con_lo_que_falta")!;
    const salida = await paso.aplicar(texto, {
      conversation: { id: fila.id, current_cycle: 1, stage: "seguimiento_venta" },
      tipo: "respuesta", textoDelCliente: cliente, faseOperativa: "seguimiento_venta", ofertaDelTurno: null,
    } as never);
    expect(salida).toBe(texto);
  });

  it("38924: «Está muy lejos le agradezco» con cantidad 4 en la ficha → no se agrega el local", async () => {
    const fila = await conLamina("593980050003", { cantidad: 4, stage: "seguimiento_venta" });
    const cliente = "Está muy lejos le agradezco";
    await entra(fila.id, cliente);
    const borrador = "Entiendo, gracias a usted 🤝 ¿Le ayudo con otra medida, o busca algo más para su vehículo?";
    const r = await insistirConLoQueFalta(fila.id, 1, borrador, cliente, "seguimiento_venta");
    expect(r.agregado).toBeNull();
    expect(r.texto).toBe(borrador);
  });

  it("18535: «Estoy en Ibarra» y luego «Muy dificel ir a Quito» → la ficha sigue en fuera y no vuelve el local", async () => {
    const [fila] = await sql<Fila[]>`
      insert into conversations (phone, name, status, stage, current_cycle, tire_size, selected_quantity)
      values ('593980050004', 'Marcelo', 'open', 'seguimiento_venta', 1, '33X12.5R15', 4)
      returning id
    `;
    await sql`
      insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, sale_number)
      values (${fila.id}, 1, ${sql.json([{
        code: "3272B506", brand: "KENDA", design: "KR29", sizeLabel: "33X12.5R15",
        quantity: 4, salePriceWithTax: 260.48, listPriceWithTax: 347.31,
      }])}, 906, 135.9, 1041.9, 'COT-S5A', 'AV-S5A')
    `;
    await entra(fila.id, "Estoy en Ibarra");
    await registrarDondeEstaElCliente(fila.id, 1, "Estoy en Ibarra");
    await entra(fila.id, "Muy dificel ir a Quito");
    await registrarDondeEstaElCliente(fila.id, 1, "Muy dificel ir a Quito");

    const [ficha] = await sql<{ cobertura_estado: string | null }[]>`
      select cobertura_estado from conversations where id=${fila.id}
    `;
    expect(ficha.cobertura_estado).toBe("fuera");

    const borrador = "Entiendo, si le queda difícil Quito no le hago perder tiempo. Si más adelante quiere revisar opciones por aquí, con gusto le ayudo 🤝";
    const r = await insistirConLoQueFalta(fila.id, 1, borrador, "Muy dificel ir a Quito", "seguimiento_venta");
    expect(r.agregado).toBeNull();
  });

  it("SANO: con cotización, sin local y el cliente en Quito, la pregunta del local sí se agrega", async () => {
    const [fila] = await sql<Fila[]>`
      insert into conversations (phone, name, status, stage, current_cycle, tire_size)
      values ('593980050005', 'Cliente', 'open', 'cotizacion_enviada', 1, '225/70R16')
      returning id
    `;
    await sql`
      insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, sale_number)
      values (${fila.id}, 1, ${sql.json([{
        code: "329015", brand: "FALKEN", design: "ZIEX CT60 A/S", sizeLabel: "225/70R16",
        quantity: 4, salePriceWithTax: 173.2, listPriceWithTax: 231.04,
      }])}, 562.54, 84.38, 646.92, 'COT-S5A2', 'AV-S5A2')
    `;
    const r = await insistirConLoQueFalta(fila.id, 1, "Sí, incluye alineación y balanceo.", "¿incluye alineación?", "cotizacion_enviada");
    expect(r.agregado).toBe("local");
  });

  it("SANO: «está lejos de mi casa pero voy el sábado» con cotización sigue recibiendo el local", async () => {
    const [fila] = await sql<Fila[]>`
      insert into conversations (phone, name, status, stage, current_cycle, tire_size)
      values ('593980050006', 'Cliente', 'open', 'cotizacion_enviada', 1, '225/70R16')
      returning id
    `;
    await sql`
      insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, sale_number)
      values (${fila.id}, 1, ${sql.json([{
        code: "329015", brand: "FALKEN", design: "ZIEX CT60 A/S", sizeLabel: "225/70R16",
        quantity: 4, salePriceWithTax: 173.2, listPriceWithTax: 231.04,
      }])}, 562.54, 84.38, 646.92, 'COT-S5A3', 'AV-S5A3')
    `;
    const cliente = "está lejos de mi casa pero voy el sábado";
    await entra(fila.id, cliente);
    const r = await insistirConLoQueFalta(fila.id, 1, "Perfecto, le esperamos.", cliente, "seguimiento_venta");
    expect(r.agregado).toBe("local");
  });

  it("C5 · 39845: la pregunta del día repetida se quita aunque el Guardián la ponga en el bloque del MEDIO", async () => {
    const [fila] = await sql<Fila[]>`
      insert into conversations (phone, name, status, stage, current_cycle, tire_size, nearest_store)
      values ('593980050007', 'Cliente', 'open', 'cotizacion_enviada', 1, '225/75R15', 'Depot Tire Quito Sur')
      returning id
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type, author_kind, metadata, created_at)
      values (${fila.id}, 1, 'assistant', 'outbound',
        '¿Qué día le queda bien pasar por *Depot Tire Quito Sur*? Lo anoto y le aviso al asesor. 📅', 'text', 'bot', '{}',
        now() - interval '30 seconds')
    `;
    const cliente = "Estoy por el oriente llego en 15 días asta entonces seguiré cotizando";
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type, created_at)
      values (${fila.id}, 1, 'user', 'inbound', ${cliente}, 'text', now() - interval '10 seconds')
    `;
    const corregido = [
      "Perfecto, seguimos cotizando por aquí. Si luego le queda mejor venir, *Depot Tire Quito Sur* ya está anotado. ¿Qué día cree que puede pasar por *Depot Tire Quito Sur*? Así lo dejo anotado para el asesor. 📅",
      "---",
      "¿Quiere que le ayude con otra medida o comparar alguna llanta? 🤝",
    ].join("\n");
    const salida = await sinPreguntaPendienteConsecutiva(fila.id, 1, corregido, cliente);
    expect(salida).not.toMatch(/qué día/i);
    expect(salida).toContain("Perfecto, seguimos cotizando por aquí.");
    expect(salida).toContain("¿Quiere que le ayude con otra medida");
  });

  it("C5 SANO: la pregunta del día que NO se repite (el bot antes preguntó el local) se queda", async () => {
    const [fila] = await sql<Fila[]>`
      insert into conversations (phone, name, status, stage, current_cycle, tire_size, nearest_store)
      values ('593980050008', 'Cliente', 'open', 'cotizacion_enviada', 1, '225/75R15', 'Depot Tire Quito Sur')
      returning id
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type, author_kind, metadata, created_at)
      values (${fila.id}, 1, 'assistant', 'outbound', '¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍', 'text', 'bot', '{}',
        now() - interval '30 seconds')
    `;
    const texto = "Perfecto, *Depot Tire Quito Sur*. ¿Qué día cree que puede pasar? 📅\n---\n¿Quiere que le ayude con otra medida? 🤝";
    expect(await sinPreguntaPendienteConsecutiva(fila.id, 1, texto, "Quito Sur")).toBe(texto);
  });
  it("SANO (revisión ronda 1): «No puedo pasar esos días» es rechazo de días → se repregunta el día, la ficha no queda fuera", async () => {
    const [fila] = await sql<Fila[]>`
      insert into conversations (phone, name, status, stage, current_cycle, tire_size, nearest_store)
      values ('593980050010', 'Cliente', 'open', 'cotizacion_enviada', 1, '225/70R16', 'Depot Tire Quito Sur')
      returning id
    `;
    await sql`
      insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, sale_number)
      values (${fila.id}, 1, ${sql.json([{
        code: "329015", brand: "FALKEN", design: "ZIEX CT60 A/S", sizeLabel: "225/70R16",
        quantity: 4, salePriceWithTax: 173.2, listPriceWithTax: 231.04,
      }])}, 562.54, 84.38, 646.92, 'COT-S5A4', 'AV-S5A4')
    `;
    const cliente = "No puedo pasar esos días";
    await entra(fila.id, cliente);
    await registrarDondeEstaElCliente(fila.id, 1, cliente);
    const [ficha] = await sql<{ cobertura_estado: string | null }[]>`select cobertura_estado from conversations where id=${fila.id}`;
    expect(ficha.cobertura_estado).toBeNull();
    const r = await insistirConLoQueFalta(fila.id, 1, "Entiendo.", cliente, "cotizacion_enviada");
    expect(r.agregado).toBe("dia");
  });

  it("38924 (revisión ronda 1): «Está muy lejos» sin ciudad no se guarda en la ficha", async () => {
    const fila = await conLamina("593980050011", { cantidad: 4, stage: "seguimiento_venta" });
    await registrarDondeEstaElCliente(fila.id, 1, "Está muy lejos le agradezco");
    const [ficha] = await sql<{ cobertura_estado: string | null }[]>`select cobertura_estado from conversations where id=${fila.id}`;
    expect(ficha.cobertura_estado).toBeNull();
  });
  it("revisión ronda 1 (m8): el bloque del medio con la pregunta del día SIN «¿» y otra información pierde solo esa oración", async () => {
    const [fila] = await sql<Fila[]>`
      insert into conversations (phone, name, status, stage, current_cycle, tire_size, nearest_store)
      values ('593980050012', 'Cliente', 'open', 'cotizacion_enviada', 1, '225/75R15', 'Depot Tire Quito Sur')
      returning id
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type, author_kind, metadata, created_at)
      values (${fila.id}, 1, 'assistant', 'outbound',
        '¿Qué día le queda bien pasar por *Depot Tire Quito Sur*? Lo anoto y le aviso al asesor. 📅', 'text', 'bot', '{}',
        now() - interval '30 seconds')
    `;
    await entra(fila.id, "Gracias");
    const texto = [
      "Con gusto. Qué día cree que puede pasar por *Depot Tire Quito Sur*? Con *Black Friday* tiene 60 % menos en la 2.ª llanta.",
      "---",
      "¿Le ayudo con algo más? 🤝",
    ].join("\n");
    const salida = await sinPreguntaPendienteConsecutiva(fila.id, 1, texto, "Gracias");
    expect(salida).not.toMatch(/qué día/i);
    expect(salida).toContain("Con *Black Friday* tiene 60 % menos");
    expect(salida).toContain("¿Le ayudo con algo más?");
  });
  it("SANO 39329 (revisión ronda 1, simulador): contestó con un tramo («la próxima semana») → la pregunta del día se queda", async () => {
    const [fila] = await sql<Fila[]>`
      insert into conversations (phone, name, status, stage, current_cycle, tire_size, nearest_store)
      values ('593980050013', 'Emilio', 'open', 'seguimiento_venta', 1, '265/70R16', 'Depot Tire Quito Sur')
      returning id
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type, author_kind, metadata, created_at)
      values (${fila.id}, 1, 'assistant', 'outbound', '¿Qué día cree que puede pasar por *Depot Tire Quito Sur*?', 'text', 'bot', '{}',
        now() - interval '90 seconds')
    `;
    const cliente = "La próxima semana estoy por allá, este rato estoy trabajando en el oriente";
    await entra(fila.id, cliente);
    const corregido = "Perfecto, le dejo anotado para seguimiento en *Depot Tire Quito Sur*.\n\n¿Qué día cree que puede pasar por *Depot Tire Quito Sur*? 🤝";
    expect(await sinPreguntaPendienteConsecutiva(fila.id, 1, corregido, cliente)).toBe(corregido);
  });
  it("SANO (revisión ronda 2): «la otra semana le aviso» posterga → la pregunta del día repetida se quita", async () => {
    const [fila] = await sql<Fila[]>`
      insert into conversations (phone, name, status, stage, current_cycle, tire_size, nearest_store)
      values ('593980050014', 'Cliente', 'open', 'seguimiento_venta', 1, '265/70R16', 'Depot Tire Quito Sur')
      returning id
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type, author_kind, metadata, created_at)
      values (${fila.id}, 1, 'assistant', 'outbound', '¿Qué día cree que puede pasar por *Depot Tire Quito Sur*?', 'text', 'bot', '{}',
        now() - interval '90 seconds')
    `;
    const cliente = "la otra semana le aviso";
    await entra(fila.id, cliente);
    const corregido = "Perfecto, quedo atento.\n\n¿Qué día cree que puede pasar por *Depot Tire Quito Sur*? 🤝";
    const salida = await sinPreguntaPendienteConsecutiva(fila.id, 1, corregido, cliente);
    expect(salida).not.toMatch(/qué día/i);
    expect(salida).toContain("Perfecto, quedo atento.");
  });
  it("revisión ronda 2 (menor 3): «mi carro está lejos de aquí» de un turno viejo no se arrastra como fuera", async () => {
    const { porQueNoPasaPorElLocal } = await import("../src/services/dondeEstaElCliente.js");
    const [fila] = await sql<Fila[]>`
      insert into conversations (phone, name, status, stage, current_cycle, tire_size)
      values ('593980050015', 'Cliente', 'open', 'cotizacion_enviada', 1, '225/70R16') returning id
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type, created_at)
      values (${fila.id}, 1, 'user', 'inbound', 'mi carro está lejos de aquí', 'text', now() - interval '1 hour')
    `;
    await entra(fila.id, "Gracias");
    expect(await porQueNoPasaPorElLocal(fila.id, 1, "Gracias")).toBeNull();
    // En SU turno sí vale.
    expect(await porQueNoPasaPorElLocal(fila.id, 1, "Está muy lejos le agradezco")).toBe("fuera_de_cobertura");
  });
});
