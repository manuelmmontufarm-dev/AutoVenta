/**
 * CADA UNO ENTRA CON SU CLAVE, Y LA CUENTA NUEVA SOLO SE ACTIVA CON SU ENLACE
 * (Manuel, 19-nov-2026: usuarios del panel para Carlos Andrés, Carlos Romero y
 * Jenny en Competimotor).
 *
 * La clave por usuario ya existía: una cuenta creada desde Ajustes queda
 * «pendiente» y su primer ingreso es crear la clave. El hueco: `/auth/users` es
 * pública y dice qué cuentas están pendientes, así que cualquiera que abriera el
 * login podía crearle la clave a una cuenta de administrador antes que su dueño.
 * Ahora una cuenta nueva trae un código de invitación de un solo uso (solo su
 * hash se guarda) y se activa únicamente con él.
 *
 * Las cuentas de Depot no cambian: la clave compartida sigue abriendo las de
 * siempre, y una cuenta pendiente creada ANTES de esto (sin código) se activa
 * como hasta ahora.
 */
import postgres from "postgres";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.GRAPH_BASE_URL ||= "http://127.0.0.1:9";
const ADMIN_KEY = "clave-de-prueba-invitacion";
process.env.ADMIN_KEY = ADMIN_KEY;
process.env.NODE_ENV = "test";
delete process.env.NEGOCIO;

const BASE = `autoventa_invitacion_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { createAdminRouter } = await import("../src/server/admin.js");
const { cargarUsuariosHub, reiniciarFrenoDeLoginParaPruebas } = await import("../src/services/hubUsers.js")
  .then(async (m) => ({ ...m, reiniciarFrenoDeLoginParaPruebas: (await import("../src/server/auth.js")).reiniciarFrenoDeLogin }));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await ensureSchema();
  await cargarUsuariosHub();
  const app = express();
  app.use(express.json());
  app.use("/api", createAdminRouter());
  server = await new Promise<Server>((listo) => { const s = app.listen(0, () => listo(s)); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((listo) => server.close(() => listo()));
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

const comoAdmin = { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY };
async function post(ruta: string, body: unknown, headers: Record<string, string> = { "Content-Type": "application/json" }) {
  const r = await fetch(`${baseUrl}/api${ruta}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

describe.sequential("enlace de invitación de un solo uso", () => {
  let codigo = "";

  it("crear la cuenta devuelve el código UNA vez; la lista pública no lo muestra ni la base lo guarda en claro", async () => {
    const r = await post("/hub-users", { id: "jenny", nombre: "Jenny Paz Alvarez", rol: "admin" }, comoAdmin);
    expect(r.status).toBe(200);
    codigo = String(r.body.invitacion ?? "");
    expect(codigo).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    const usuario = r.body.usuario as Record<string, unknown>;
    expect(usuario.estadoClave).toBe("pendiente");
    expect(usuario.invitacionVigente).toBe(true);
    expect(JSON.stringify(usuario)).not.toContain(codigo);

    const publica = await fetch(`${baseUrl}/api/auth/users`).then((x) => x.json()) as { users: Array<{ id: string; pendiente: boolean }> };
    expect(publica.users.find((u) => u.id === "jenny")?.pendiente).toBe(true);
    expect(JSON.stringify(publica)).not.toContain(codigo);
    const [fila] = await sql<{ value: unknown }[]>`select value from settings where key='hub_users'`;
    expect(JSON.stringify(fila.value)).not.toContain(codigo);
  });

  it("sin el código, o con otro, nadie puede crearle la clave", async () => {
    const sin = await post("/auth/activate", { userId: "jenny", email: "intruso@x.com", pin: "abcd1234" });
    expect(sin.status).toBe(400);
    expect(String(sin.body.error)).toMatch(/enlace de invitaci[oó]n/i);
    const otro = await post("/auth/activate", { userId: "jenny", email: "intruso@x.com", pin: "abcd1234", invitacion: "x".repeat(24) });
    expect(otro.status).toBe(400);
  });

  it("con el código: crea su clave, entra, y el código ya no sirve", async () => {
    const ok = await post("/auth/activate", { userId: "jenny", email: "jenny@competimotor.ec", pin: "clave-de-jenny", invitacion: codigo });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    const otraVez = await post("/auth/activate", { userId: "jenny", email: "otro@x.com", pin: "otra-clave", invitacion: codigo });
    expect(otraVez.status).toBe(400);
    const login = await post("/auth/login", { userId: "jenny", pin: "clave-de-jenny" });
    expect(login.status).toBe(200);
    const compartida = await post("/auth/login", { userId: "jenny", pin: "1234" });
    expect(compartida.status).toBe(401);
  });

  it("restablecer la clave da un enlace nuevo, y solo ese activa", async () => {
    const r = await post("/hub-users/jenny/reset-clave", {}, comoAdmin);
    expect(r.status).toBe(200);
    const nuevo = String(r.body.invitacion ?? "");
    expect(nuevo).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(nuevo).not.toBe(codigo);
    expect((await post("/auth/activate", { userId: "jenny", email: "j@x.com", pin: "nueva-1", invitacion: codigo })).status).toBe(400);
    expect((await post("/auth/activate", { userId: "jenny", email: "j@x.com", pin: "nueva-1", invitacion: nuevo })).status).toBe(200);
  });

  it("si Manuel perdió el enlace de una cuenta pendiente, puede pedir otro", async () => {
    await post("/hub-users", { id: "carlos.romero", nombre: "Carlos Romero", rol: "admin" }, comoAdmin);
    const r = await post("/hub-users/carlos.romero/invitacion", {}, comoAdmin);
    expect(r.status).toBe(200);
    expect(String(r.body.invitacion)).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });
});

describe.sequential("Depot entra como siempre", () => {
  it("los de siempre siguen con la clave compartida", async () => {
    reiniciarFrenoDeLoginParaPruebas();
    expect((await post("/auth/login", { userId: "andres", pin: "1234" })).status).toBe(200);
    expect((await post("/auth/login", { userId: "joaquin", pin: "1234" })).status).toBe(200);
  });

  it("una cuenta pendiente creada ANTES del enlace (sin código) se activa como hasta hoy", async () => {
    const [fila] = await sql<{ value: Array<Record<string, unknown>> }[]>`select value from settings where key='hub_users'`;
    const lista = [...fila.value, { id: "vieja", nombre: "Cuenta vieja", rol: "asesor", claveCompartida: false, pinHash: null, email: null }];
    await sql`update settings set value=${sql.json(lista as never)} where key='hub_users'`;
    await cargarUsuariosHub();
    expect((await post("/auth/activate", { userId: "vieja", email: "v@x.com", pin: "clave-vieja" })).status).toBe(200);
  });
});
