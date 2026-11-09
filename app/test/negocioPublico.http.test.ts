/**
 * `GET /api/negocio` POR HTTP (R-09): el gate de verdad delante de la ruta.
 *
 * `negocioPublico.test.ts` fija la forma con la función pura; esto fija lo que
 * ve el panel por la red: sin credencial no sale nada (401) y con ella sale el
 * contrato exacto de MULTICLIENTE.md §3.2, para el perfil vivo de la instancia
 * (`NEGOCIO=mundillantas`).
 *
 * Se monta `exigirCredencial` —el mismo que usa `createAdminRouter`— con la
 * ruta sobre un express pelado: el router entero consulta la base al crearse
 * (`cargarUsuariosHub`) y esta prueba no necesita Postgres.
 */
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// `admin.ts` congela ADMIN_KEY y NODE_ENV al importarse, y el perfil se elige
// al cargar `negocio/index.ts`: todo va antes de los imports dinámicos.
const ADMIN_KEY = "clave-de-prueba-negocio";
process.env.ADMIN_KEY = ADMIN_KEY;
process.env.NODE_ENV = "test";
process.env.NEGOCIO = "mundillantas";
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.GRAPH_BASE_URL ||= "http://127.0.0.1:9";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { exigirCredencial } = await import("../src/server/admin.js");
const { negocioPublico } = await import("../src/server/negocioPublico.js");
const { COMPACT_PLAYBOOK } = await import("../src/agent/compactPlaybook.js");

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  const router = express.Router();
  router.use(exigirCredencial);
  router.get("/negocio", (_req, res) => res.json(negocioPublico()));
  app.use("/api", router);
  server = await new Promise<Server>((listo) => {
    const s = app.listen(0, "127.0.0.1", () => listo(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((listo) => server.close(() => listo()));
});

describe("GET /api/negocio · el gate", () => {
  it("sin credencial: 401 y nada del negocio", async () => {
    const res = await fetch(`${base}/api/negocio`);
    expect(res.status).toBe(401);
    const cuerpo = await res.json();
    expect(cuerpo).toEqual({ ok: false, error: "Clave de administración requerida" });
  });

  it("con una clave equivocada: 401", async () => {
    const res = await fetch(`${base}/api/negocio`, { headers: { "x-admin-key": "otra" } });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/negocio · el contrato exacto de §3.2", () => {
  it("con x-admin-key: 200 y el perfil de Mundillantas, clave por clave", async () => {
    const res = await fetch(`${base}/api/negocio`, { headers: { "x-admin-key": ADMIN_KEY } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual({
      id: "mundillantas",
      nombre: "Mundillantas",
      ciudad: "Santo Domingo",
      telefono: "[PENDIENTE] número de WhatsApp del bot (Jenny dio los de los asesores, no el del bot)",
      identidades: [
        { id: "mundillantas", nombre: "Mundillantas", locales: ["matriz", "local2"] },
        { id: "competimotor", nombre: "Competimotor", locales: ["competimotor"] },
      ],
      locales: [
        { slug: "matriz", nombre: "Mundillantas Falken", nombreCorto: "Mundillantas Falken", claveHorario: "matriz" },
        { slug: "local2", nombre: "Mundillantas Kenda", nombreCorto: "Mundillantas Kenda", claveHorario: "local2" },
        { slug: "competimotor", nombre: "Competimotor", nombreCorto: "Competimotor", claveHorario: "competimotor" },
      ],
      marcas: ["Kenda", "Falken", "Winrun", "Maxxis"],
      vendedor: { nombre: "[PENDIENTE] nombre del vendedor" },
      playbook: COMPACT_PLAYBOOK,
      // Con las respuestas de Jenny del 6-nov ya no faltan las direcciones,
      // las formas de pago, los textos de impuestos ni los logos.
      faltantes: [
        "teléfono",
        "vendedor · nombre",
        "piezas · qué incluye toda compra",
        "piezas · frase del precio sin descuento",
        "Mundillantas Kenda · pin (Jenny reenvió el mismo de Falken el 6-nov; puesto el de Falken)",
        "garantías por marca: meses del seguro contra impacto y años de fábrica (en 0 hasta que Jenny los dé)",
        "domingo cerrado es un SUPUESTO del pitch (lunes–sábado confirmado)",
      ],
    });
  });

  it("el playbook que viaja es el de Mundillantas, no el de Depot", async () => {
    const res = await fetch(`${base}/api/negocio`, { headers: { "x-admin-key": ADMIN_KEY } });
    const { playbook } = await res.json();
    expect(playbook).toContain("Contrato comercial Competimotor y Mundillantas");
    expect(playbook).not.toContain("Contrato comercial Depot");
  });
});
