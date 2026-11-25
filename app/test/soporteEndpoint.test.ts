/**
 * AJUSTES → BOT → «AVISOS A SOPORTE» ES SOLO DE SOPORTE (24-nov-2026).
 *
 * El saldo de OpenAI, el umbral y el botón «Probar aviso» son de soporte de
 * AutoVenta (el usuario `manuel`, o la clave cruda). Un administrador del
 * negocio —Andrés, Joaquín— no los ve ni los cambia: no es su cuenta de OpenAI
 * y el aviso no es para él. Esconder la pestaña en el panel no alcanza; lo
 * decide el servidor. Se levanta el router de verdad contra Postgres de verdad.
 */
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.GRAPH_BASE_URL ||= "http://127.0.0.1:9";
delete process.env.OPENAI_ADMIN_KEY;
const ADMIN_KEY = "clave-de-prueba-soporte";
process.env.ADMIN_KEY = ADMIN_KEY;
process.env.NODE_ENV = "test";

const BASE = `autoventa_soporteapi_${process.pid}`;
const ADMIN_URL = `postgresql://${process.env.USER}@localhost/postgres`;
process.env.DATABASE_URL = `postgresql://${process.env.USER}@localhost/${BASE}`;

const admin = postgres(ADMIN_URL, { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

vi.mock("../src/wa/client.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/wa/client.js")>();
  return { ...real, sendAdvisorText: vi.fn(async () => "wamid.TEXTO"), sendAdvisorTemplate: vi.fn(async () => "wamid.PLANTILLA") };
});

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { createAdminRouter } = await import("../src/server/admin.js");
const { crearToken } = await import("../src/server/auth.js");
const app = await import("../src/services/avisosEnLaApp.js");

let server: Server;
let baseUrl: string;
let pushes: string[] = [];

type Quien = "manuel" | "andres" | "clave";
async function pedir(quien: Quien, metodo: string, ruta: string, cuerpo?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const credencial: Record<string, string> = quien === "clave"
    ? { "x-admin-key": ADMIN_KEY }
    : { Authorization: `Bearer ${crearToken(quien)}` };
  const r = await fetch(`${baseUrl}/api${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...credencial },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  await ensureSchema();
  await sql`delete from advisors`;
  await sql`
    insert into advisors (nombre, telefono, rol, active, prioridad, ventana_hasta)
    values ('Manuel Montufar', '593990008763', 'admin', true, 1, now() + interval '10 hours')
  `;
  await app.guardarSuscripcion({
    userId: "manuel", userName: "Manuel Montufar", advisorPhone: "593990008763",
    suscripcion: { endpoint: "https://push.example.test/manuel-iphone", keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } },
  });
  app._usarTransportePush(async (_sub, cuerpo) => { pushes.push(cuerpo); });

  const servidor = express();
  servidor.use(express.json());
  servidor.use("/api", createAdminRouter());
  server = await new Promise<Server>((listo) => {
    const s = servidor.listen(0, () => listo(s));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60_000);

afterAll(async () => {
  await new Promise<void>((listo) => server.close(() => listo()));
  await sql.end();
  const cierre = postgres(ADMIN_URL, { prepare: false, max: 1 });
  await cierre.unsafe(`drop database if exists ${BASE}`);
  await cierre.end();
});

describe("Ajustes → Bot → Avisos a soporte", () => {
  it("un administrador del negocio no puede ver, anotar ni probar: 403 en las tres", async () => {
    expect((await pedir("andres", "GET", "/hub/soporte")).status).toBe(403);
    expect((await pedir("andres", "PUT", "/hub/soporte/saldo", { saldoUsd: 50 })).status).toBe(403);
    expect((await pedir("andres", "POST", "/hub/soporte/probar")).status).toBe(403);
    expect(await sql`select 1 from saldo_de_ia`).toHaveLength(0);
    expect(await sql`select 1 from avisos_a_soporte`).toHaveLength(0);
    expect(pushes).toHaveLength(0);
  });

  it("soporte ve el estado; sin saldo anotado no hay número inventado", async () => {
    const r = await pedir("manuel", "GET", "/hub/soporte");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      ok: true, saldo: null, aparatosConLaApp: 1, leeElGastoDeOpenAI: false, umbralPorDefecto: 3,
      incidentesAbiertos: [], avisos: [],
    });
  });

  it("soporte anota el saldo y el umbral, y el panel los devuelve", async () => {
    const guardado = await pedir("manuel", "PUT", "/hub/soporte/saldo", { saldoUsd: "25.50", umbralUsd: "10" });
    expect(guardado.status).toBe(200);
    expect(guardado.body).toMatchObject({ ok: true, restanteUsd: 25.5, bajo: false, fuente: "bot" });
    const r = await pedir("clave", "GET", "/hub/soporte");
    expect(r.body.saldo).toMatchObject({ saldoUsd: 25.5, umbralUsd: 10, anotadoPor: "manuel", restanteUsd: 25.5, aproximado: true });

    const malo = await pedir("manuel", "PUT", "/hub/soporte/saldo", { saldoUsd: -3 });
    expect(malo.status).toBe(400);
  });

  it("«Probar aviso» suena en el aparato de soporte y queda en la lista", async () => {
    pushes = [];
    const r = await pedir("manuel", "POST", "/hub/soporte/probar");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, push: 1, whatsapp: "texto" });
    expect(pushes).toHaveLength(1);
    expect(JSON.parse(pushes[0]).titulo).toMatch(/prueba de aviso$/);
    const estado = await pedir("manuel", "GET", "/hub/soporte");
    expect((estado.body.avisos as { clase: string }[])[0].clase).toBe("prueba");
  });
});
