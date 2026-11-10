import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppAPI } from "whatsapp-api-js/middleware/express";
import { idDeNovedad, resumenDeNovedad, separarLote } from "../src/domain/loteDelWebhook.js";

/**
 * 10-nov, 9:30–9:41: nueve leads de anuncio escribieron en once minutos y
 * ninguno se contestó ni apareció en el panel. Dos agujeros del webhook:
 *  · `handle_post` lee solo la PRIMERA novedad del lote — el resto se tira;
 *  · si nuestro handler lanza, devuelve 500 sin dejar rastro en el log.
 */

// Antes que cualquier import: `vi.mock` se iza y config.ts exige estas variables.
// La base no se toca (los handlers son de mentira); la URL solo tiene que existir.
vi.hoisted(() => {
  process.env.OPENAI_API_KEY ||= "test";
  process.env.WHATSAPP_TOKEN ||= "test";
  process.env.WHATSAPP_APP_SECRET ||= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
  process.env.WHATSAPP_PHONE_ID ||= "test";
  process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_no_se_usa";
});

const SECRET = "secret-de-esta-app";

const mensaje = (from: string, id: string, texto: string) => ({
  from, id, timestamp: "1794324600", type: "text", text: { body: texto },
  referral: { source_type: "ad", source_id: "120", headline: "Depot Tire" },
});
const contacto = (wa_id: string, name: string) => ({ wa_id, profile: { name } });

function lote(mensajes: unknown[], contactos: unknown[], statuses: unknown[] = []) {
  const value: Record<string, unknown> = {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "593000000000", phone_number_id: "PHONE" },
  };
  if (mensajes.length) { value.messages = mensajes; value.contacts = contactos; }
  if (statuses.length) value.statuses = statuses;
  return { object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value }] }] };
}

describe("separarLote", () => {
  it("un lote con dos leads se parte en dos payloads, cada uno con su contacto", () => {
    const partes = separarLote(lote(
      [mensaje("593967249449", "wamid.A", "¡Hola! Quiero más información"), mensaje("593984625542", "wamid.B", "215/55R16")],
      [contacto("593967249449", "Ana"), contacto("593984625542", "Beto")],
    )) as Array<{ entry: Array<{ changes: Array<{ value: { messages: Array<{ id: string }>; contacts: Array<{ profile: { name: string } }>; metadata: unknown } }> }> }>;
    expect(partes).toHaveLength(2);
    expect(partes.map((p) => p.entry[0].changes[0].value.messages[0].id)).toEqual(["wamid.A", "wamid.B"]);
    expect(partes.map((p) => p.entry[0].changes[0].value.contacts[0].profile.name)).toEqual(["Ana", "Beto"]);
    // La metadata (phone_number_id) viaja en cada parte: la librería la necesita.
    expect(partes[1].entry[0].changes[0].value.metadata).toEqual({ display_phone_number: "593000000000", phone_number_id: "PHONE" });
  });

  it("los statuses también se parten uno por uno", () => {
    const partes = separarLote(lote([], [], [
      { id: "wamid.S1", status: "delivered", recipient_id: "593999999991" },
      { id: "wamid.S2", status: "read", recipient_id: "593999999992" },
    ]));
    expect(partes).toHaveLength(2);
    expect(partes.map(idDeNovedad)).toEqual(["wamid.S1", "wamid.S2"]);
  });

  it("el resumen del log no lleva el teléfono entero ni el texto", () => {
    const [parte] = separarLote(lote([mensaje("593967249449", "wamid.A", "secreto")], [contacto("593967249449", "Ana")]));
    const r = resumenDeNovedad(parte);
    expect(r).toBe("mensaje text de ···9449 (wamid.A)");
    expect(r).not.toContain("secreto");
  });

  it("un payload que no es de mensajes vuelve tal cual", () => {
    const raro = { object: "x" };
    expect(separarLote(raro)).toEqual([raro]);
  });
});

// ── Cableado real: la ruta /webhook con la librería de verdad ──────────────

const waDePrueba = vi.hoisted(() => ({ instancia: null as unknown }));
const recibidos: string[] = [];
let fallar = false;
const wa = new WhatsAppAPI({ token: "t", appSecret: SECRET, webhookVerifyToken: "v" });
wa.on.message = async ({ message }) => {
  if (fallar) throw new Error("la base se cayó");
  recibidos.push(message.id);
};
wa.on.status = async () => {};
waDePrueba.instancia = wa;

vi.mock("../src/wa/client.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/wa/client.js")>();
  return { ...real, getWa: () => waDePrueba.instancia };
});

const { createServer } = await import("../src/server/webhook.js");

let base = "";
let server: ReturnType<ReturnType<typeof createServer>["listen"]>;
beforeAll(async () => {
  server = createServer().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => { recibidos.length = 0; fallar = false; });

async function post(payload: unknown) {
  // Como Meta: los caracteres fuera de ASCII van escapados (\u00e1) en los bytes firmados.
  const body = JSON.stringify(payload).replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  const firma = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
  return fetch(`${base}/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": firma },
    body,
  });
}

describe("POST /webhook", () => {
  it("con tres leads en el mismo lote, los tres llegan al bot", async () => {
    const res = await post(lote(
      [mensaje("593967249449", "wamid.1", "hola"), mensaje("593984625542", "wamid.2", "215/55R16"), mensaje("593999775207", "wamid.3", "255 70R16")],
      [contacto("593967249449", "A"), contacto("593984625542", "B"), contacto("593999775207", "C")],
    ));
    expect(res.status).toBe(200);
    expect(recibidos).toEqual(["wamid.1", "wamid.2", "wamid.3"]);
  });

  it("un contacto sin profile (producción, 10-nov ···8863) llega al bot sin nombre, no tumba el webhook", async () => {
    const nombres: Array<string | undefined> = [];
    const previo = wa.on.message;
    wa.on.message = async (args) => { nombres.push(args.name); recibidos.push(args.message.id); };
    try {
      const res = await post(lote(
        [mensaje("593980818863", "wamid.sinperfil", "¡Hola! Quiero más información")],
        [{ wa_id: "593980818863" }],
      ));
      expect(res.status).toBe(200);
      expect(recibidos).toEqual(["wamid.sinperfil"]);
      expect(nombres).toEqual([undefined]);
    } finally {
      wa.on.message = previo;
    }
  });

  it("si el handler falla, queda en el log y Meta reintenta (500)", async () => {
    fallar = true;
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(lote([mensaje("593967249449", "wamid.falla1", "hola")], [contacto("593967249449", "A")]));
    expect(res.status).toBe(500);
    expect(espia.mock.calls.some((c) => String(c[0]).includes("···9449 (wamid.falla1)"))).toBe(true);
    espia.mockRestore();
  });

  it("una novedad que falla siempre deja de rebotar a la tercera", async () => {
    fallar = true;
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});
    const p = lote([mensaje("593967249449", "wamid.veneno", "hola")], [contacto("593967249449", "A")]);
    expect((await post(p)).status).toBe(500);
    expect((await post(p)).status).toBe(500);
    expect((await post(p)).status).toBe(200);
    espia.mockRestore();
  });

  it("firma inválida sigue rechazándose", async () => {
    const body = JSON.stringify(lote([mensaje("593967249449", "wamid.x", "hola")], [contacto("593967249449", "A")]));
    const res = await fetch(`${base}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=00" },
      body,
    });
    expect(res.status).toBe(401);
    expect(recibidos).toEqual([]);
  });
});
