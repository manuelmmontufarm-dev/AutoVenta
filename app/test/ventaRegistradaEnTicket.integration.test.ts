/**
 * La venta registrada en `/venta` marca el ticket del panel (21-nov-2026).
 *
 * Lo que tiene que cumplirse, contra Postgres de verdad y por HTTP:
 *  - registrar un número que cruza con un chat pasa ese ticket a «ganado» con
 *    el motivo «Venta registrada por <vendedor>», por el `setStage` de siempre
 *    (transición, `sales_history`);
 *  - un chat que ya estaba ganado no se toca;
 *  - un número con dos chats marca SOLO el que el vendedor vio (el más reciente
 *    donde el cliente escribió); sin chat, solo queda el registro;
 *  - «Corregir el número» anula el registro y devuelve el ticket a donde estaba,
 *    salvo que alguien lo haya movido después;
 *  - el ticket del panel trae quién registró, cuándo y la factura;
 *  - con el interruptor apagado «ganado» a mano sigue andando; encendido, exige
 *    la venta registrada;
 *  - las métricas no cambian sus números: solo agregan el desglose.
 */
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";
process.env.GRAPH_BASE_URL ||= "http://127.0.0.1:9";
const ADMIN_KEY = "clave-de-prueba-venta-ticket";
process.env.ADMIN_KEY = ADMIN_KEY;
process.env.NODE_ENV = "test";

const BASE = `autoventa_venta_ticket_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const raiz = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await raiz.unsafe(`drop database if exists ${BASE}`);
await raiz.unsafe(`create database ${BASE}`);
await raiz.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { createRegistroVentaRouter, reiniciarFrenoDeRegistro } = await import("../src/server/registroVenta.js");
const { createAdminRouter } = await import("../src/server/admin.js");
const { claveDelEnlace } = await import("../src/services/registroDeVentas.js");
const { setStage } = await import("../src/services/conversations.js");
const { getHubTicket, getHubMetrics, getFinalStageArrivals } = await import("../src/services/hubData.js");

let server: Server;
let url = "";
const k = claveDelEnlace();

async function post(ruta: string, cuerpo: Record<string, unknown>, panel = false) {
  const r = await fetch(`${url}${ruta}`, {
    method: ruta.endsWith("/stage") ? "PATCH" : "POST",
    headers: { "content-type": "application/json", ...(panel ? { "x-admin-key": ADMIN_KEY } : {}) },
    body: JSON.stringify(panel ? cuerpo : { k, ...cuerpo }),
  });
  return { status: r.status, json: (await r.json()) as any };
}
const registrar = (vendedor: string, telefono: string) => post("/venta/registrar", { vendedor, telefono });
const anular = (id: number, telefono: string) => post("/venta/anular", { id, telefono });
const cerrarDesdeElPanel = (id: number, closure: string) => post(`/api/hub/tickets/${id}/close`, { closure }, true);

async function interruptor(exigirParaGanado: boolean) {
  const r = await fetch(`${url}/api/hub/registro-venta`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
    body: JSON.stringify({ exigirParaGanado }),
  });
  return { status: r.status, json: (await r.json()) as any };
}

/** Un chat donde el cliente escribió, en la etapa pedida. */
async function chat(phone: string, name: string, stage = "cotizacion_enviada"): Promise<number> {
  const [c] = await sql<{ id: number }[]>`
    insert into conversations (phone, name) values (${phone}, ${name}) returning id`;
  await sql`insert into messages (conversation_id, role, direction, content) values (${c.id}, 'user', 'inbound', 'precio 205/55R16')`;
  await sql`insert into quotes (conversation_id, items, subtotal, tax, total) values (${c.id}, '[]', 100, 15, 115)`;
  if (stage !== "nuevo") await setStage(c.id, stage as never, { actor: "bot" });
  return Number(c.id);
}

async function estado(id: number) {
  const [c] = await sql<{ stage: string; status: string; closed_reason: string | null }[]>`
    select stage, status, closed_reason from conversations where id = ${id}`;
  const historia = await sql<{ outcome: string; reason: string | null }[]>`
    select outcome, reason from sales_history where conversation_id = ${id}`;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from stage_transitions where conversation_id = ${id}`;
  return { ...c, historia, transiciones: n };
}

beforeAll(async () => {
  await ensureSchema();
  const app = express();
  app.use(express.json());
  app.use("/api", createAdminRouter());
  app.use("/venta", createRegistroVentaRouter());
  server = app.listen(0);
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  await sql.end();
  const a = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
  await a.unsafe(`drop database if exists ${BASE}`);
  await a.end();
});

describe("registrar la venta marca el ticket", () => {
  it("un chat abierto pasa a «ganado» con el motivo del vendedor, por setStage", async () => {
    reiniciarFrenoDeRegistro();
    const id = await chat("593991110001", "Carlos");
    const r = await registrar("Luis Mora", "0991110001");
    expect(r.json).toMatchObject({ ok: true, venta: { vinoDeWhatsapp: true, efectoEnTicket: "marcado_ganado" } });

    const e = await estado(id);
    expect(e).toMatchObject({ stage: "ganado", status: "closed" });
    expect(e.historia).toEqual([{ outcome: "ganado", reason: "Venta registrada por Luis Mora" }]);
    const [t] = await sql`select to_stage, actor, reason from stage_transitions
      where conversation_id = ${id} order by id desc limit 1`;
    expect(t).toMatchObject({ to_stage: "ganado", actor: "owner", reason: "Venta registrada por Luis Mora" });
    const [fila] = await sql`select cycle, efecto_en_ticket, etapa_anterior from ventas_registradas where id = ${r.json.venta.id}`;
    expect(fila).toMatchObject({ cycle: 1, efecto_en_ticket: "marcado_ganado", etapa_anterior: "cotizacion_enviada" });
  });

  it("un chat que ya estaba ganado a mano NO se toca", async () => {
    const id = await chat("593991110002", "Ana");
    await setStage(id, "ganado", { actor: "owner", reason: "ganado" });
    const antes = await estado(id);

    const r = await registrar("Pedro", "0991110002");
    expect(r.json.venta.efectoEnTicket).toBe("ya_ganado");
    const despues = await estado(id);
    expect(despues).toEqual(antes);
    expect(despues.historia).toEqual([{ outcome: "ganado", reason: "ganado" }]);
  });

  it("un perdido también pasa a ganado: la venta registrada es el hecho", async () => {
    const id = await chat("593991110003", "Beto");
    await setStage(id, "perdido", { actor: "owner", reason: "precio" });
    await registrar("Luis Mora", "0991110003");
    expect(await estado(id)).toMatchObject({ stage: "ganado", historia: [{ outcome: "ganado" }] });
  });

  it("con dos chats del mismo número marca solo el que vio el vendedor (el más reciente)", async () => {
    const viejo = await chat("0991110004", "Dora (viejo)");
    const nuevo = await chat("593991110004", "Dora");
    await sql`update conversations set updated_at = now() - interval '10 days' where id = ${viejo}`;
    await sql`update conversations set updated_at = now() where id = ${nuevo}`;

    const r = await registrar("Luis Mora", "0991110004");
    expect(r.json.venta.cliente).toBe("Dora");
    expect((await estado(nuevo)).stage).toBe("ganado");
    expect((await estado(viejo)).stage).toBe("cotizacion_enviada");
  });

  it("sin chat solo queda el registro", async () => {
    const r = await registrar("Luis Mora", "0990009999");
    expect(r.json.venta).toMatchObject({ vinoDeWhatsapp: false, efectoEnTicket: "sin_chat" });
  });
});

describe("corregir el número", () => {
  it("anula el registro y devuelve el ticket a su etapa, sin dejar un ganado en sales_history", async () => {
    const id = await chat("593991110005", "Equivocado");
    const r = await registrar("Luis Mora", "0991110005");
    expect((await estado(id)).stage).toBe("ganado");

    const a = await anular(r.json.venta.id, "0991110005");
    expect(a.json).toMatchObject({ ok: true, ticketDevuelto: true });
    const e = await estado(id);
    expect(e).toMatchObject({ stage: "cotizacion_enviada", status: "open", historia: [] });
    const [fila] = await sql`select anulada_at from ventas_registradas where id = ${r.json.venta.id}`;
    expect(fila.anulada_at).toBeTruthy();
    expect((await getHubTicket(id))?.ventaRegistrada).toBeNull();
  });

  it("un perdido vuelve a perdido con su motivo", async () => {
    const id = await chat("593991110006", "Perdido");
    await setStage(id, "perdido", { actor: "owner", reason: "precio" });
    const r = await registrar("Luis Mora", "0991110006");
    await anular(r.json.venta.id, "0991110006");
    expect(await estado(id)).toMatchObject({ stage: "perdido", closed_reason: "precio", historia: [{ outcome: "perdido", reason: "precio" }] });
  });

  it("si alguien movió el ticket después, no se deshace lo de otro", async () => {
    const id = await chat("593991110007", "Movido");
    const r = await registrar("Luis Mora", "0991110007");
    await setStage(id, "perdido", { actor: "owner", reason: "devolvió las llantas" });
    const a = await anular(r.json.venta.id, "0991110007");
    expect(a.json.ticketDevuelto).toBe(false);
    expect(await estado(id)).toMatchObject({ stage: "perdido", closed_reason: "devolvió las llantas" });
  });

  it("si otro vendedor también registró esa venta, el ticket sigue ganado", async () => {
    const id = await chat("593991110008", "Doble");
    const primero = await registrar("Luis Mora", "0991110008");
    await registrar("Pedro", "0991110008");
    const a = await anular(primero.json.venta.id, "0991110008");
    expect(a.json.ticketDevuelto).toBe(false);
    expect((await estado(id)).stage).toBe("ganado");
  });

  it("no anula un registro ajeno adivinando el id", async () => {
    const r = await registrar("Luis Mora", "0991110001");
    expect((await anular(r.json.venta.id, "0990000000")).status).toBe(404);
  });
});

describe("el ticket del panel", () => {
  it("trae quién la registró, cuándo y la factura", async () => {
    const id = await chat("593991110009", "Con factura");
    const r = await registrar("Marta", "0991110009");
    await post("/venta/factura", { id: r.json.venta.id, telefono: "0991110009", factura: "001-002-000777" });
    const ticket = await getHubTicket(id);
    expect(ticket?.ventaRegistrada).toMatchObject({ id: r.json.venta.id, vendedor: "Marta", factura: "001-002-000777" });
    expect(new Date(ticket!.ventaRegistrada!.registradaEn).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("un ganado a mano viene sin venta registrada", async () => {
    const id = await chat("593991110010", "A mano");
    const r = await cerrarDesdeElPanel(id, "ganado");
    expect(r.status).toBe(200);
    const ticket = await getHubTicket(id);
    expect(ticket).toMatchObject({ cierre: "ganado", ventaRegistrada: null });
  });

  it("el enlace «Registrar venta» del panel es el de los vendedores, y /venta pone el número", async () => {
    const r = await fetch(`${url}/api/hub/registro-venta`, { headers: { "x-admin-key": ADMIN_KEY } });
    const j = (await r.json()) as any;
    expect(j).toMatchObject({ ok: true, exigirParaGanado: false, enlace: `/venta?k=${k}` });
    const html = await (await fetch(`${url}${j.enlace}&tel=0991234567`)).text();
    expect(html).toContain('get("tel")');
    // Dentro de la plantilla HTML un «\d» pierde la barra y el filtro borraría
    // los dígitos: pasó en la primera versión. El filtro tiene que dejarlos.
    const filtro = html.match(/get\("tel"\) \|\| ""\)\.replace\((\/.*?\/g)/)?.[1];
    expect(filtro).toBeTruthy();
    expect("0991234567".replace(new RegExp(filtro!.slice(1, -2), "g"), "")).toBe("0991234567");
  });
});

describe("el interruptor «ganado exige la venta registrada»", () => {
  it("apagado (por defecto): ganado a mano sigue permitido", async () => {
    const id = await chat("593991110011", "Apagado");
    expect((await cerrarDesdeElPanel(id, "ganado")).status).toBe(200);
  });

  it("encendido: sin venta registrada no se puede cerrar como ganado (ni arrastrando)", async () => {
    expect((await interruptor(true)).json).toMatchObject({ ok: true, exigirParaGanado: true });
    const id = await chat("593991110012", "Encendido");
    const cierre = await cerrarDesdeElPanel(id, "ganado");
    expect(cierre.status).toBe(409);
    expect(cierre.json.code).toBe("venta_sin_registrar");
    expect((await post(`/api/hub/tickets/${id}/stage`, { stage: "ganado" }, true)).status).toBe(409);
    expect((await estado(id)).stage).toBe("cotizacion_enviada");
    // Perdido sigue andando.
    expect((await cerrarDesdeElPanel(id, "perdido")).status).toBe(200);
  });

  it("encendido: con la venta registrada sí (y el registro ya lo deja ganado)", async () => {
    const id = await chat("593991110013", "Registrado");
    await registrar("Luis Mora", "0991110013");
    expect((await estado(id)).stage).toBe("ganado");
    await interruptor(false);
  });
});

describe("métricas", () => {
  it("los ganados de siempre, más el desglose registradas / a mano", async () => {
    const [{ ganados }] = await sql<{ ganados: number }[]>`
      select count(*)::int as ganados from sales_history where outcome = 'ganado'`;
    const [{ registrados }] = await sql<{ registrados: number }[]>`
      select count(*)::int as registrados from sales_history s where outcome = 'ganado'
        and exists (select 1 from ventas_registradas v
          where v.conversation_id = s.conversation_id and v.cycle = s.cycle and v.anulada_at is null)`;
    expect(registrados).toBeGreaterThan(0);
    expect(registrados).toBeLessThan(ganados);

    const m = await getHubMetrics();
    expect(m.summary.ganados).toBe(ganados);
    expect(m.summary.ganadosRegistrados).toBe(registrados);
    expect(m.reachedFinal?.ganados).toBe(ganados);
    expect(m.reachedFinal?.ganadosRegistrados).toBe(registrados);

    const final = await getFinalStageArrivals();
    expect(final.ganados).toBe(ganados);
    expect(final.ganadosRegistrados).toBe(registrados);
    const tickets = final.days.flatMap((d) => d.tickets as { cierre: string; ventaRegistrada: boolean }[]);
    expect(tickets.filter((t) => t.cierre === "ganado" && !t.ventaRegistrada).length).toBe(ganados - registrados);
  });
});

describe("los registros de antes de este cambio", () => {
  it("la migración los vincula a su ciclo para que el panel los muestre, sin cambiarle la etapa al ticket", async () => {
    const { runVentaEnTicketMigration } = await import("../src/db/migrations/036_venta_registrada_en_ticket.js");
    const id = await chat("593991110020", "Del 20-nov");
    const [vieja] = await sql<{ id: number }[]>`
      insert into ventas_registradas (vendedor, telefono, tel9, vino_de_whatsapp, conversation_id, dia)
      values ('Luis Mora', '0991110020', '991110020', true, ${id}, current_date) returning id`;
    await runVentaEnTicketMigration(sql);
    const [fila] = await sql`select cycle, efecto_en_ticket from ventas_registradas where id = ${vieja.id}`;
    expect(fila).toMatchObject({ cycle: 1, efecto_en_ticket: null });
    expect((await estado(id)).stage).toBe("cotizacion_enviada");
    expect((await getHubTicket(id))?.ventaRegistrada).toMatchObject({ vendedor: "Luis Mora" });
  });
});
