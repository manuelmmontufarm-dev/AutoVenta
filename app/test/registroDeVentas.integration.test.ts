/**
 * `/venta`: el vendedor registra una venta y se valida contra los chats.
 *
 * Puente hasta leer facturas (20-nov-2026). Lo que tiene que cumplirse:
 *  - sin la clave del enlace no se ve la página ni se puede preguntar por un número;
 *  - un número que le escribió al bot sale «sí», lo escriban con 09…, +593… o espacios;
 *  - un chat donde el cliente nunca escribió NO cuenta como venido de WhatsApp;
 *  - TODO número validado se guarda siempre: repetido, mal tipeado o sin chat;
 *  - si ya estaba registrado hoy se avisa quién fue (hay obsequio de por medio);
 *  - la factura o referencia entra en un segundo paso, sobre el mismo registro.
 */
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import postgres from "postgres";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";
process.env.GRAPH_BASE_URL ||= "http://127.0.0.1:9";
process.env.ADMIN_KEY = "clave-de-prueba";

const BASE = `autoventa_registro_venta_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { createRegistroVentaRouter, pasaElFreno, reiniciarFrenoDeRegistro } = await import("../src/server/registroVenta.js");
const { claveDelEnlace, listarVentasRegistradas, validarEntrada, ventasACsv } = await import("../src/services/registroDeVentas.js");

let url = "";
let servidor: ReturnType<express.Express["listen"]>;
const k = claveDelEnlace();

const registrar = (cuerpo: Record<string, unknown>) => enviar("registrar", cuerpo);
const factura = (cuerpo: Record<string, unknown>) => enviar("factura", cuerpo);

async function enviar(ruta: string, cuerpo: Record<string, unknown>) {
  const r = await fetch(`${url}/venta/${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ k, ...cuerpo }),
  });
  return { status: r.status, json: (await r.json()) as any };
}

beforeAll(async () => {
  await ensureSchema();
  // Carlos escribió y el bot le cotizó.
  const [carlos] = await sql<{ id: number }[]>`
    insert into conversations (phone, name) values ('593991234567', 'Carlos Pérez') returning id`;
  await sql`insert into messages (conversation_id, role, content) values (${carlos.id}, 'user', 'precio 205/55R16')`;
  await sql`insert into quotes (conversation_id, items, subtotal, tax, total) values (${carlos.id}, '[]', 100, 15, 115)`;
  // A Ana solo le mandamos una plantilla: ella nunca escribió.
  const [ana] = await sql<{ id: number }[]>`
    insert into conversations (phone, name) values ('593987000111', 'Ana') returning id`;
  await sql`insert into messages (conversation_id, role, content) values (${ana.id}, 'assistant', 'Hola Ana')`;

  const app = express();
  app.use("/venta", createRegistroVentaRouter());
  servidor = app.listen(0);
  url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  servidor?.close();
  await sql.end();
  const a = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
  await a.unsafe(`drop database if exists ${BASE}`);
  await a.end();
});

describe("el enlace", () => {
  it("sin clave o con clave mala no muestra la página", async () => {
    expect((await fetch(`${url}/venta`)).status).toBe(404);
    expect((await fetch(`${url}/venta?k=nada`)).status).toBe(404);
  });

  it("con la clave muestra el formulario", async () => {
    const r = await fetch(`${url}/venta?k=${k}`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("Registrar una venta");
    expect(html).toContain('id="vendedor"');
    expect(html).toContain('id="telefono"');
  });

  it("sin clave no se puede preguntar por un número, y no queda nada guardado", async () => {
    const r = await registrar({ k: "mala", vendedor: "Luis", telefono: "0991234567" });
    expect(r.status).toBe(404);
    expect(await listarVentasRegistradas()).toHaveLength(0);
  });
});

describe("validación del formulario", () => {
  it("pide el nombre y un número completo", () => {
    expect(validarEntrada({ vendedor: " ", telefono: "0991234567" })).toMatchObject({ ok: false, campo: "vendedor" });
    expect(validarEntrada({ vendedor: "Luis", telefono: "09912" })).toMatchObject({ ok: false, campo: "telefono" });
    expect(validarEntrada({ vendedor: "Luis", telefono: "" })).toMatchObject({ ok: false, campo: "telefono" });
  });

  it("acepta el número como lo escriba el vendedor", () => {
    for (const tel of ["0991234567", "+593 99 123 4567", "593991234567", "099-123-4567"]) {
      expect(validarEntrada({ vendedor: "Luis", telefono: tel })).toMatchObject({ ok: true, tel9: "991234567" });
    }
  });

  it("el servidor devuelve el campo que falló", async () => {
    const r = await registrar({ vendedor: "Luis", telefono: "123" });
    expect(r.status).toBe(400);
    expect(r.json).toMatchObject({ ok: false, campo: "telefono" });
  });
});

describe("paso 1: validar el número", () => {
  it("un número que le escribió al bot sale «sí» y se guarda con el vendedor", async () => {
    const r = await registrar({ vendedor: "  Luis   Mora ", telefono: "099 123 4567" });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      ok: true,
      yaRegistradaPor: null,
      venta: { vendedor: "Luis Mora", vinoDeWhatsapp: true, cliente: "Carlos Pérez", cotizaciones: 1, factura: null },
    });
    expect(r.json.venta.ultimoMensajeAt).toBeTruthy();
    const [fila] = await sql`select vendedor, tel9, vino_de_whatsapp from ventas_registradas where id = ${r.json.venta.id}`;
    expect(fila).toMatchObject({ vendedor: "Luis Mora", tel9: "991234567", vino_de_whatsapp: true });
  });

  it("el mismo número otra vez SE GUARDA igual, y avisa quién lo registró primero", async () => {
    const r = await registrar({ vendedor: "Pedro", telefono: "+593991234567" });
    expect(r.json).toMatchObject({ ok: true, yaRegistradaPor: "Luis Mora", venta: { vendedor: "Pedro", vinoDeWhatsapp: true } });
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from ventas_registradas where tel9 = '991234567'`;
    expect(n).toBe(2);
  });

  it("un número que no está en los chats sale «no» y también se guarda", async () => {
    const r = await registrar({ vendedor: "Pedro", telefono: "0990000001" });
    expect(r.json).toMatchObject({ ok: true, venta: { vinoDeWhatsapp: false, cliente: null } });
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from ventas_registradas where tel9 = '990000001'`;
    expect(n).toBe(1);
  });

  it("un chat donde el cliente nunca escribió no cuenta como venido de WhatsApp", async () => {
    const r = await registrar({ vendedor: "Pedro", telefono: "0987000111" });
    expect(r.json.venta).toMatchObject({ vinoDeWhatsapp: false });
  });
});

describe("paso 2: la factura o referencia", () => {
  it("se guarda sobre el registro recién validado", async () => {
    const paso1 = await registrar({ vendedor: "Marta", telefono: "0990000777" });
    const paso2 = await factura({ id: paso1.json.venta.id, telefono: "0990000777", factura: "  001-001-000123 " });
    expect(paso2.json).toMatchObject({ ok: true, venta: { id: paso1.json.venta.id, factura: "001-001-000123" } });
    const [fila] = await sql`select factura from ventas_registradas where id = ${paso1.json.venta.id}`;
    expect(fila.factura).toBe("001-001-000123");
  });

  it("no acepta una factura vacía", async () => {
    const paso1 = await registrar({ vendedor: "Marta", telefono: "0990000778" });
    const r = await factura({ id: paso1.json.venta.id, telefono: "0990000778", factura: "  " });
    expect(r.status).toBe(400);
  });

  it("no deja escribir sobre un registro ajeno adivinando el id", async () => {
    const paso1 = await registrar({ vendedor: "Marta", telefono: "0990000779" });
    const r = await factura({ id: paso1.json.venta.id, telefono: "0991111111", factura: "X-1" });
    expect(r.status).toBe(404);
    const [fila] = await sql`select factura from ventas_registradas where id = ${paso1.json.venta.id}`;
    expect(fila.factura).toBeNull();
  });

  it("sin la clave del enlace tampoco", async () => {
    const paso1 = await registrar({ vendedor: "Marta", telefono: "0990000780" });
    const r = await factura({ k: "mala", id: paso1.json.venta.id, telefono: "0990000780", factura: "X-1" });
    expect(r.status).toBe(404);
  });
});

describe("lo que ve el dueño", () => {
  it("la lista y el CSV traen vendedor, número y el sí/no", async () => {
    const ventas = await listarVentasRegistradas();
    expect(ventas.length).toBeGreaterThanOrEqual(4);
    const csv = ventasACsv(ventas);
    expect(csv).toContain("Vendedor;Telefono;Vino de WhatsApp");
    expect(csv).toMatch(/"Luis Mora";"0991234567";"SI";"Carlos Pérez"/);
    expect(csv).toContain("001-001-000123");
  });
});

describe("el freno", () => {
  it("corta al que manda demasiados registros seguidos desde el mismo origen", () => {
    reiniciarFrenoDeRegistro();
    const resultados = Array.from({ length: 61 }, () => pasaElFreno("1.2.3.4", 1000));
    expect(resultados.slice(0, 60).every(Boolean)).toBe(true);
    expect(resultados[60]).toBe(false);
    expect(pasaElFreno("1.2.3.4", 1000 + 11 * 60 * 1000)).toBe(true);
    reiniciarFrenoDeRegistro();
  });
});
