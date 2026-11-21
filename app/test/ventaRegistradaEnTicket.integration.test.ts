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
 *  - el ticket del panel trae quién registró, cuándo, la factura y el monto;
 *  - «ganado» a mano (21-nov, Manuel) pide «el cliente llegó y compró» y
 *    factura + monto, o «completar después»; crea o completa el registro de
 *    venta del ticket (la misma tabla). Arrastrar a ganado no alcanza. Con el
 *    ajuste del negocio apagado, el cierre libre de antes;
 *  - la factura pendiente y los ganados viejos se completan con el mismo formulario;
 *  - «Gracias ya compré.» (conv 293) NO cierra como ganado: queda por confirmar;
 *  - las métricas no cambian sus números: solo agregan el desglose
 *    completa / factura pendiente / sin registrar.
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
const { claveDelEnlace, leerMonto, listarPendientes, revisarCierreGanado } = await import("../src/services/registroDeVentas.js");
const { classifyStage } = await import("../src/agent/classifier.js");
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
const cerrarDesdeElPanel = (id: number, closure: string, venta: Record<string, unknown> = {}) =>
  post(`/api/hub/tickets/${id}/close`, { closure, ...venta }, true);
const completar = (id: number, venta: Record<string, unknown>) => post(`/api/hub/tickets/${id}/venta`, venta, true);

async function interruptor(confirmarGanado: boolean) {
  const r = await fetch(`${url}/api/hub/registro-venta`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
    body: JSON.stringify({ confirmarGanado }),
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
    await post("/venta/factura", { id: r.json.venta.id, telefono: "0991110009", factura: "001-002-000777", monto: "$1.234,50" });
    const ticket = await getHubTicket(id);
    expect(ticket?.ventaRegistrada).toMatchObject({
      id: r.json.venta.id, vendedor: "Marta", factura: "001-002-000777", monto: 1234.5, origen: "vendedor",
    });
    expect(new Date(ticket!.ventaRegistrada!.registradaEn).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("el enlace «Registrar venta» del panel es el de los vendedores, y /venta pone el número", async () => {
    const r = await fetch(`${url}/api/hub/registro-venta`, { headers: { "x-admin-key": ADMIN_KEY } });
    const j = (await r.json()) as any;
    expect(j).toMatchObject({ ok: true, confirmarGanado: true, enlace: `/venta?k=${k}` });
    const html = await (await fetch(`${url}${j.enlace}&tel=0991234567`)).text();
    expect(html).toContain('get("tel")');
    // Dentro de la plantilla HTML un «\d» pierde la barra y el filtro borraría
    // los dígitos: pasó en la primera versión. El filtro tiene que dejarlos.
    const filtro = html.match(/get\("tel"\) \|\| ""\)\.replace\((\/.*?\/g)/)?.[1];
    expect(filtro).toBeTruthy();
    expect("0991234567".replace(new RegExp(filtro!.slice(1, -2), "g"), "")).toBe("0991234567");
  });
});

describe("el monto", () => {
  it("se lee como lo escriba el asesor", () => {
    expect(leerMonto("230")).toBe(230);
    expect(leerMonto("230.5")).toBe(230.5);
    expect(leerMonto("$1.234,50")).toBe(1234.5);
    expect(leerMonto("1,234.50")).toBe(1234.5);
    expect(leerMonto("1.234")).toBe(1234);
    expect(leerMonto(99.999)).toBe(100);
    for (const malo of ["", "0", "abc", "-5", "2000000", null]) expect(leerMonto(malo)).toBeNull();
  });
});

describe("«ganado» a mano = el asesor confirma que compró ACÁ", () => {
  it("las reglas del formulario", () => {
    expect(revisarCierreGanado({}, false)).toMatchObject({ ok: false, code: "sin_confirmar" });
    expect(revisarCierreGanado({ confirmado: true }, false)).toMatchObject({ ok: false, code: "faltan_factura_y_monto" });
    expect(revisarCierreGanado({ confirmado: true, factura: "F-1" }, false)).toMatchObject({ ok: false, code: "faltan_factura_y_monto" });
    expect(revisarCierreGanado({ confirmado: true, factura: "F-1", monto: "diez" }, false)).toMatchObject({ ok: false, code: "monto_invalido" });
    expect(revisarCierreGanado({ confirmado: true, factura: "F-1", monto: "230" }, false)).toEqual({ ok: true, factura: "F-1", monto: 230 });
    expect(revisarCierreGanado({ confirmado: true, completarDespues: true }, false)).toEqual({ ok: true, factura: null, monto: null });
    // La venta ya la registró completa un vendedor: basta confirmar.
    expect(revisarCierreGanado({ confirmado: true }, true)).toMatchObject({ ok: true });
  });

  it("sin confirmar, o sin factura y monto, no se cierra; perdido y sin respuesta no cambian", async () => {
    const id = await chat("593991110011", "Sin datos");
    expect((await cerrarDesdeElPanel(id, "ganado")).json.code).toBe("sin_confirmar");
    expect((await cerrarDesdeElPanel(id, "ganado", { confirmado: true })).status).toBe(400);
    expect((await cerrarDesdeElPanel(id, "ganado", { confirmado: true, factura: "F-1" })).status).toBe(400);
    expect((await estado(id)).stage).toBe("cotizacion_enviada");
    // Arrastrar la tarjeta a ganado tampoco: el ganado se confirma en el formulario.
    const arrastre = await post(`/api/hub/tickets/${id}/stage`, { stage: "ganado" }, true);
    expect(arrastre.status).toBe(409);
    expect(arrastre.json.code).toBe("ganado_sin_confirmar");
    expect((await cerrarDesdeElPanel(id, "perdido", { note: "precio" })).status).toBe(200);
    expect(await estado(id)).toMatchObject({ stage: "perdido", closed_reason: "precio" });
    expect(await sql`select 1 from ventas_registradas where conversation_id = ${id}`).toHaveLength(0);
  });

  it("con factura y monto: crea el registro de venta (origen panel, completo) y cierra como ganado", async () => {
    const id = await chat("593991110012", "Completo");
    const r = await cerrarDesdeElPanel(id, "ganado", { confirmado: true, factura: "001-001-000900", monto: "450.75" });
    expect(r.status).toBe(200);
    expect(await estado(id)).toMatchObject({ stage: "ganado", historia: [{ outcome: "ganado" }] });
    const [fila] = await sql`select vendedor, factura, monto::float8 as monto, origen, cycle, efecto_en_ticket, etapa_anterior, telefono
      from ventas_registradas where conversation_id = ${id}`;
    expect(fila).toMatchObject({
      vendedor: "Panel", factura: "001-001-000900", monto: 450.75, origen: "panel", cycle: 1,
      efecto_en_ticket: "marcado_ganado", etapa_anterior: "cotizacion_enviada", telefono: "593991110012",
    });
    expect((await getHubTicket(id))?.ventaRegistrada).toMatchObject({ factura: "001-001-000900", monto: 450.75, origen: "panel" });
  });

  it("«completar después»: cuenta como ganado con la factura pendiente, y se completa con el mismo formulario", async () => {
    const id = await chat("593991110013", "Después");
    expect((await cerrarDesdeElPanel(id, "ganado", { confirmado: true, completarDespues: true })).status).toBe(200);
    expect((await estado(id)).stage).toBe("ganado");
    expect((await getHubTicket(id))?.ventaRegistrada).toMatchObject({ factura: null, monto: null });
    expect((await listarPendientes()).facturaPendiente.map((p) => p.conversationId)).toContain(id);

    // Sin los dos datos no se completa.
    expect((await completar(id, { factura: "F-77" })).status).toBe(400);
    const r = await completar(id, { factura: "F-77", monto: "199" });
    expect(r.json).toMatchObject({ ok: true, venta: { factura: "F-77", monto: 199 } });
    expect(await sql`select 1 from ventas_registradas where conversation_id = ${id}`).toHaveLength(1);
    expect((await listarPendientes()).facturaPendiente.map((p) => p.conversationId)).not.toContain(id);
  });

  it("un ticket que un vendedor ya registró: el cierre completa ESE registro, no crea otro", async () => {
    const id = await chat("593991110014", "Ya registrado");
    const v = await registrar("Luis Mora", "0991110014");
    expect((await estado(id)).stage).toBe("ganado");
    await setStage(id, "seguimiento_venta", { actor: "owner", reason: "reabierto a mano" });
    expect((await cerrarDesdeElPanel(id, "ganado", { confirmado: true, factura: "F-14", monto: "100" })).status).toBe(200);
    const filas = await sql`select id::int as id, factura from ventas_registradas where conversation_id = ${id}`;
    expect(filas).toEqual([{ id: v.json.venta.id, factura: "F-14" }]);
  });

  it("un ganado viejo sin registrar se completa con el mismo formulario, sin moverle la etapa", async () => {
    const id = await chat("593991110015", "Ganado viejo");
    await setStage(id, "ganado", { actor: "owner", reason: "ganado" });
    expect((await listarPendientes()).sinRegistrar.map((p) => p.conversationId)).toContain(id);
    const antes = await estado(id);
    const r = await completar(id, { factura: "F-OLD", monto: "300" });
    expect(r.json).toMatchObject({ ok: true, venta: { factura: "F-OLD", monto: 300, origen: "panel" } });
    expect(await estado(id)).toEqual(antes);
    const [fila] = await sql`select efecto_en_ticket from ventas_registradas where conversation_id = ${id}`;
    expect(fila.efecto_en_ticket).toBe("ya_ganado");
    expect((await listarPendientes()).sinRegistrar.map((p) => p.conversationId)).not.toContain(id);
  });

  it("no se completa la venta de un ticket que no está ganado", async () => {
    const id = await chat("593991110016", "Abierto");
    const r = await completar(id, { factura: "F-1", monto: "10" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("no_ganado");
  });

  it("con el ajuste del negocio apagado vuelve el cierre libre (salida de emergencia)", async () => {
    expect((await interruptor(false)).json).toMatchObject({ ok: true, confirmarGanado: false });
    const id = await chat("593991110017", "Libre");
    expect((await cerrarDesdeElPanel(id, "ganado")).status).toBe(200);
    expect(await getHubTicket(id)).toMatchObject({ cierre: "ganado", ventaRegistrada: null });
    expect((await interruptor(true)).json.confirmarGanado).toBe(true);
  });
});

describe("«ya compré» queda por confirmar (conv 293)", () => {
  it("«Gracias ya compré.» no cierra como ganado: queda en la lista y se cortan los seguimientos", async () => {
    const id = await chat("593991110018", "Compró afuera", "seguimiento_venta");
    await sql`
      insert into follow_up_jobs (conversation_id, cycle, type, channel, due_at, idempotency_key, payload)
      values (${id}, 1, 'post_window_1', 'whatsapp', now() + interval '1 day', ${`porconfirmar:${id}`}, ${sql.json({ preview: "hola" })})`;
    const [conv] = await sql`select * from conversations where id = ${id}`;

    await classifyStage(conv as never, "Gracias ya compré.", "Gracias por avisarnos.");

    expect(await estado(id)).toMatchObject({ stage: "seguimiento_venta", status: "open", historia: [] });
    const pendientes = await listarPendientes();
    expect(pendientes.porConfirmar).toEqual([
      expect.objectContaining({ conversationId: id, texto: "Gracias ya compré." }),
    ]);
    expect((await getHubTicket(id))?.compraPorConfirmar).toMatchObject({ texto: "Gracias ya compré." });
    const [job] = await sql`select status from follow_up_jobs where conversation_id = ${id}`;
    expect(job.status).not.toBe("scheduled");
    expect((await getHubMetrics()).summary.porConfirmar).toBe(1);
  });

  it("el asesor decide: «compró en otro lado» lo cierra perdido y sale de la lista", async () => {
    const [{ id }] = await sql<{ id: number }[]>`select id from conversations where phone = '593991110018'`;
    expect((await cerrarDesdeElPanel(id, "perdido", { note: "Compró en otro lado" })).status).toBe(200);
    expect((await listarPendientes()).porConfirmar).toEqual([]);
    expect((await getHubTicket(id))?.compraPorConfirmar).toBeNull();
  });

  it("o «compró acá»: ganado con factura, y sale de la lista", async () => {
    const id = await chat("593991110019", "Compró acá", "seguimiento_venta");
    const [conv] = await sql`select * from conversations where id = ${id}`;
    await classifyStage(conv as never, "ya compré, gracias", "Gracias");
    expect((await listarPendientes()).porConfirmar.map((p) => p.conversationId)).toEqual([id]);
    await cerrarDesdeElPanel(id, "ganado", { confirmado: true, factura: "F-19", monto: "80" });
    expect((await estado(id)).stage).toBe("ganado");
    expect((await listarPendientes()).porConfirmar).toEqual([]);
  });
});

describe("métricas", () => {
  it("los ganados de siempre, más el desglose completa / factura pendiente / sin registrar", async () => {
    const [{ ganados }] = await sql<{ ganados: number }[]>`
      select count(*)::int as ganados from sales_history where outcome = 'ganado'`;
    const venta = (completa: boolean) => sql<{ n: number }[]>`
      select count(*)::int as n from sales_history s where outcome = 'ganado'
        and exists (select 1 from ventas_registradas v
          where v.conversation_id = s.conversation_id and v.cycle = s.cycle and v.anulada_at is null)
        and ${completa} = exists (select 1 from ventas_registradas v
          where v.conversation_id = s.conversation_id and v.cycle = s.cycle and v.anulada_at is null
            and v.factura is not null and v.monto is not null)`;
    const [{ n: completas }] = await venta(true);
    const [{ n: pendientes }] = await venta(false);
    const sinRegistrar = ganados - completas - pendientes;
    expect(completas).toBeGreaterThan(0);
    expect(pendientes).toBeGreaterThan(0);
    expect(sinRegistrar).toBeGreaterThan(0);

    const m = await getHubMetrics();
    expect(m.summary).toMatchObject({
      ganados, ganadosRegistrados: completas, ganadosFacturaPendiente: pendientes, ganadosSinRegistrar: sinRegistrar,
    });
    expect(m.reachedFinal).toMatchObject({ ganados, ganadosRegistrados: completas, ganadosFacturaPendiente: pendientes });

    const final = await getFinalStageArrivals();
    expect(final).toMatchObject({ ganados, ganadosRegistrados: completas, ganadosFacturaPendiente: pendientes });
    const tickets = final.days.flatMap((d) => d.tickets as { cierre: string; venta: string | null }[]);
    expect(tickets.filter((t) => t.cierre === "ganado" && t.venta === null).length).toBe(sinRegistrar);
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
