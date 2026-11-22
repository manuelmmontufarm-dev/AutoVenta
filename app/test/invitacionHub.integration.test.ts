/**
 * UNA CUENTA NUEVA ENTRA SIN ENLACE ESPECIAL (Manuel, 22-nov-2026).
 *
 * El 19-nov se exigió un enlace de invitación para activar una cuenta nueva.
 * En la práctica bloqueó a Joaquín y a Jenny en Competimotor: el login les
 * pedía «el enlace que te mandaron», y la app instalada en el teléfono abre sin
 * el `?invitacion=` aunque la hayas instalado desde el enlace. Manuel pidió que
 * funcione para todos sin complicarse: una cuenta pendiente se activa eligiendo
 * su nombre, creando su clave y dejando su email. El enlace sigue existiendo
 * (deja el nombre elegido) y uno viejo o repetido no estorba.
 *
 * Lo que NO cambia: una cuenta que ya tiene clave no se puede «re-activar», y
 * las de Depot siguen con la clave compartida.
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

describe.sequential("cuenta nueva sin enlace especial", () => {
  let codigo = "";

  it("crear la cuenta todavía da un enlace, que no queda en claro en ningún lado", async () => {
    const r = await post("/hub-users", { id: "jenny", nombre: "Jenny Paz Alvarez", rol: "admin" }, comoAdmin);
    expect(r.status).toBe(200);
    codigo = String(r.body.invitacion ?? "");
    expect(codigo).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    const usuario = r.body.usuario as Record<string, unknown>;
    expect(usuario.estadoClave).toBe("pendiente");
    expect(JSON.stringify(usuario)).not.toContain(codigo);

    const publica = await fetch(`${baseUrl}/api/auth/users`).then((x) => x.json()) as { users: Array<{ id: string; pendiente: boolean }> };
    expect(publica.users.find((u) => u.id === "jenny")?.pendiente).toBe(true);
    expect(JSON.stringify(publica)).not.toContain(codigo);
    const [fila] = await sql<{ value: unknown }[]>`select value from settings where key='hub_users'`;
    expect(JSON.stringify(fila.value)).not.toContain(codigo);
  });

  it("SIN el enlace (como abre la app instalada) crea su clave y entra", async () => {
    const ok = await post("/auth/activate", { userId: "jenny", email: "jenny@competimotor.ec", pin: "clave-de-jenny" });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    const login = await post("/auth/login", { userId: "jenny", pin: "clave-de-jenny" });
    expect(login.status).toBe(200);
    const compartida = await post("/auth/login", { userId: "jenny", pin: "1234" });
    expect(compartida.status).toBe(401);
  });

  it("una cuenta que ya tiene clave no se puede volver a activar, ni con el enlace", async () => {
    const sin = await post("/auth/activate", { userId: "jenny", email: "intruso@x.com", pin: "abcd1234" });
    expect(sin.status).toBe(400);
    const con = await post("/auth/activate", { userId: "jenny", email: "intruso@x.com", pin: "abcd1234", invitacion: codigo });
    expect(con.status).toBe(400);
  });

  it("un enlace viejo (o con otro código) no bloquea a nadie", async () => {
    await post("/hub-users", { id: "joaquin.c", nombre: "Joaquin Tamayo", rol: "admin" }, comoAdmin);
    const ok = await post("/auth/activate", { userId: "joaquin.c", email: "j@x.com", pin: "clave-1", invitacion: "x".repeat(24) });
    expect(ok.status).toBe(200);
  });

  it("restablecer la clave deja crear una nueva sin enlace", async () => {
    const r = await post("/hub-users/jenny/reset-clave", {}, comoAdmin);
    expect(r.status).toBe(200);
    expect((await post("/auth/activate", { userId: "jenny", email: "j@x.com", pin: "nueva-1" })).status).toBe(200);
  });

  it("si Manuel quiere, todavía puede sacar un enlace para una cuenta pendiente", async () => {
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
