/**
 * El gate del hub, por HTTP y con el router de verdad.
 *
 * Lo que se está protegiendo aquí no es una pantalla: detrás de `/api` están
 * los teléfonos de los clientes, las conversaciones y las ventas. El cambio de
 * este sprint le abrió una puerta nueva (sesión de usuario) a un router que ya
 * tenía una (`x-admin-key`), y las dos cosas que pueden salir mal son:
 *
 * 1. que la puerta nueva deje entrar a quien no debe, y
 * 2. que la puerta nueva CIERRE la vieja — el bot, los scripts y el panel
 *    central mandan la clave cruda y no saben nada de usuarios; si dejan de
 *    entrar, se cae la operación aunque el login se vea precioso.
 *
 * La lógica pura del token está en auth.test.ts. Esto prueba el cableado.
 */
import express from "express";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// `config.ts` y `admin.ts` leen el entorno AL IMPORTARSE: todo esto va antes
// del import dinámico de src/.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.GRAPH_BASE_URL ||= "http://127.0.0.1:9";
/**
 * `config.ts` exige DATABASE_URL para poder importarse, pero ninguna de las
 * rutas que se ejercen aquí (`/auth/*` y `/status`) toca la base: el pool de
 * `postgres` no conecta hasta la primera consulta. Se apunta a la base de
 * sistema para no crear una efímera que nadie va a usar.
 */
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

/**
 * Clave REAL en el entorno, como en botPowerEndpoint.test.ts: así el gate se
 * ejerce de verdad y la prueba no depende de si la máquina de quien la corre
 * tiene o no `ADMIN_KEY`. Con la clave puesta, la rama de fail-closed de
 * producción ni se toca.
 */
const ADMIN_KEY = "clave-de-prueba-login-hub";
process.env.ADMIN_KEY = ADMIN_KEY;
process.env.NODE_ENV = "test";

const { createAdminRouter } = await import("../src/server/admin.js");

interface Usuario {
  id: string;
  nombre: string;
  rol: "admin" | "asesor";
}

interface RespuestaLogin {
  ok: boolean;
  token?: string;
  user?: Usuario;
  permisos?: Record<string, boolean>;
  error?: string;
}

interface RespuestaStatus {
  ok: boolean;
  negocio?: string;
  usuario?: Usuario | null;
  permisos?: Record<string, boolean> | null;
  error?: string;
}

let server: Server;
let baseUrl: string;

async function login(userId: string, pin: string): Promise<{ status: number; body: RespuestaLogin }> {
  const r = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, pin }),
  });
  return { status: r.status, body: (await r.json()) as RespuestaLogin };
}

/** `/status` es la ruta que el hub usa para validar credenciales al arrancar. */
async function status(headers: Record<string, string>): Promise<{ status: number; body: RespuestaStatus }> {
  const r = await fetch(`${baseUrl}/api/status`, { headers });
  return { status: r.status, body: (await r.json()) as RespuestaStatus };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", createAdminRouter()); // mismo prefijo que webhook.ts
  server = await new Promise<Server>((listo) => {
    const s = app.listen(0, () => listo(s));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((listo) => server.close(() => listo()));
});

describe("antes de entrar", () => {
  it("la lista de usuarios es pública: sin ella no hay desplegable que llenar", async () => {
    const r = await fetch(`${baseUrl}/api/auth/users`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { users: Usuario[] };
    expect(body.users.map((u) => u.nombre)).toContain("Andres Tamayo");
    expect(JSON.stringify(body)).not.toContain("1234");
  });

  it("sin credenciales el hub no ve nada", async () => {
    const { status: code } = await status({});
    expect(code).toBe(401);
  });
});

describe("login", () => {
  it("entra con la clave acordada y devuelve quién es y qué puede ver", async () => {
    const { status: code, body } = await login("andres", "1234");
    expect(code).toBe(200);
    expect(body.user).toEqual({ id: "andres", nombre: "Andres Tamayo", rol: "admin" });
    expect(body.token).toBeTruthy();
    // Hoy todo en true, a propósito: lo que se prueba es que el hub RECIBE el
    // objeto, que es lo que le permitirá diferenciar sin tocar el gate.
    expect(body.permisos?.verFinanzas).toBe(true);
    expect(body.permisos?.usarCotizador).toBe(true);
  });

  it("el asesor entra igual, con su rol", async () => {
    const { body } = await login("asesor", "1234");
    expect(body.user?.rol).toBe("asesor");
  });

  it("la clave equivocada rebota con mensaje, no con un 500", async () => {
    const { status: code, body } = await login("manuel", "0000");
    expect(code).toBe(401);
    expect(body.token).toBeUndefined();
    expect(body.error).toMatch(/incorrect/i);
  });

  it("un usuario inventado responde exactamente igual que una clave mala", async () => {
    const inventado = await login("jocelyn", "1234");
    const claveMala = await login("manuel", "0000");
    // Mismo status y mismo texto: la pantalla de login no es el lugar para
    // averiguar quién trabaja aquí.
    expect(inventado.status).toBe(claveMala.status);
    expect(inventado.body.error).toBe(claveMala.body.error);
  });

  it("un cuerpo incompleto es un 400, no una excepción", async () => {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "manuel" }),
    });
    expect(r.status).toBe(400);
  });
});

describe("con la sesión abierta", () => {
  it("el token abre el hub y el servidor sabe quién está adentro", async () => {
    const { body: sesion } = await login("joaquin", "1234");
    const { status: code, body } = await status({ authorization: `Bearer ${sesion.token}` });
    expect(code).toBe(200);
    expect(body.usuario?.nombre).toBe("Joaquin Tamayo");
    expect(body.permisos?.verInbox).toBe(true);
  });

  it("un token torcido no abre nada", async () => {
    const { body: sesion } = await login("manuel", "1234");
    const roto = `${sesion.token!.slice(0, -1)}x`;
    expect((await status({ authorization: `Bearer ${roto}` })).status).toBe(401);
    expect((await status({ authorization: "Bearer no.es.un.token" })).status).toBe(401);

    // Firmado con otro secreto: el caso de quien conoce el formato pero no la
    // clave del servidor.
    const payload = `manuel.${Date.now() + 86_400_000}`;
    const impostor = `${payload}.${createHmac("sha256", "otra-clave").update(payload).digest("base64url")}`;
    expect((await status({ authorization: `Bearer ${impostor}` })).status).toBe(401);
  });
});

describe("compatibilidad con lo que ya estaba", () => {
  it("la clave cruda sigue abriendo: el panel central y los scripts no se enteran del login", async () => {
    const { status: code, body } = await status({ "x-admin-key": ADMIN_KEY });
    expect(code).toBe(200);
    // `usuario` en null es la señal de "entró por la puerta vieja". Que sea
    // explícito y no `undefined` es lo que deja al hub distinguir los casos.
    expect(body.usuario).toBeNull();
    expect(body.permisos).toBeNull();
  });

  it("una clave cruda equivocada sigue rebotando", async () => {
    expect((await status({ "x-admin-key": "otra-cosa" })).status).toBe(401);
  });

  it("el preflight del navegador deja pasar el header Authorization", async () => {
    // Sin esto el hub desplegado en Vercel no puede mandar el Bearer al
    // servidor de Railway: el navegador corta la petición antes de salir.
    const r = await fetch(`${baseUrl}/api/status`, { method: "OPTIONS" });
    expect(r.headers.get("access-control-allow-headers")).toMatch(/authorization/i);
    expect(r.headers.get("access-control-allow-headers")).toMatch(/x-admin-key/i);
  });
});
