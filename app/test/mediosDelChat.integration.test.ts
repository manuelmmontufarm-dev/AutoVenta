import { beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

/**
 * FOTOS, AUDIOS Y ARCHIVOS DEL CHAT (23-nov-2026).
 *
 * Manuel: «que se puedan leer las imágenes, audios, fotos, lo que sea… es
 * importante que esto no falle nunca». Lo que estas pruebas cuidan:
 *  · el archivo se guarda y se devuelve tal cual, con su tipo;
 *  · si Meta no lo entregó al llegar, se vuelve a pedir al abrirlo;
 *  · guardar un archivo NUNCA lanza: el mensaje sigue su camino;
 *  · la lista de mensajes dice qué archivo hay, sin cargar sus bytes.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";

const BASE = "autoventa_medios_chat_test";
process.env.DATABASE_URL = `postgresql://${process.env.USER}@localhost/${BASE}`;

const admin = postgres(`postgresql://${process.env.USER}@localhost/postgres`, { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { ensureSchema } = await import("../src/db/schema.js");
const { sql } = await import("../src/db/client.js");
const { appendMessage, getOrCreateConversation } = await import("../src/services/conversations.js");
const { getHubMessages } = await import("../src/services/hubData.js");
const medios = await import("../src/services/mediosDelChat.js");
const { medioDeEco } = await import("../src/domain/echoPayload.js");

const FOTO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
let conversacion = 0;
const idDe = async (wa: string) => Number((await sql`select id from messages where wa_message_id = ${wa}`)[0].id);

beforeAll(async () => {
  await ensureSchema();
  conversacion = (await getOrCreateConversation("593900000777", "Cliente de prueba")).id;
});

describe("guardar y abrir el archivo de un mensaje", () => {
  it("una foto del cliente se guarda y se devuelve igual", async () => {
    await appendMessage(conversacion, "user", "[El cliente mandó una foto. Se lee: 205/55R16]", "wamid.FOTO");
    expect(await medios.guardarMedio({ waMessageId: "wamid.FOTO", kind: "image", mime: "image/jpeg", waMediaId: "M1", bytes: FOTO })).toBe(true);
    const medio = await medios.medioDelMensaje(await idDe("wamid.FOTO"), async () => { throw new Error("no debería bajar nada"); });
    expect(medio?.mime).toBe("image/jpeg");
    expect(medio?.nombre).toBe("foto.jpg");
    expect(medio?.bytes.equals(FOTO)).toBe(true);
  });

  it("si Meta no lo entregó al llegar, se baja al abrirlo y queda guardado", async () => {
    await appendMessage(conversacion, "user", "[El cliente mandó un audio que no se pudo escuchar.]", "wamid.AUDIO");
    let bajadas = 0;
    const bajar = async (id: string) => { bajadas++; return id === "M2" ? { bytes: Buffer.from("OggS-audio"), mimeType: "audio/ogg; codecs=opus" } : null; };
    // Al llegar, Meta falló: queda la fila sin bytes.
    expect(await medios.bajarYGuardarMedio({ waMessageId: "wamid.AUDIO", kind: "audio", waMediaId: "M2" }, async () => null)).toBe(false);
    const id = await idDe("wamid.AUDIO");
    const primero = await medios.medioDelMensaje(id, bajar);
    expect(primero?.mime).toBe("audio/ogg");
    expect(primero?.bytes.toString()).toBe("OggS-audio");
    // La segunda vez sale de la base, sin volver a Meta.
    await medios.medioDelMensaje(id, bajar);
    expect(bajadas).toBe(1);
  });

  it("sin archivo y sin forma de bajarlo: null, no un error", async () => {
    await appendMessage(conversacion, "user", "hola", "wamid.TEXTO");
    expect(await medios.medioDelMensaje(await idDe("wamid.TEXTO"), async () => null)).toBeNull();
    await medios.guardarMedio({ waMessageId: "wamid.PERDIDO", kind: "image", waMediaId: "M9" });
    await appendMessage(conversacion, "user", "[foto]", "wamid.PERDIDO");
    expect(await medios.medioDelMensaje(await idDe("wamid.PERDIDO"), async () => { throw new Error("Meta caído"); })).toBeNull();
  });

  it("guardar nunca lanza, y un archivo sobre el tope no se guarda", async () => {
    expect(await medios.guardarMedio({ waMessageId: "", kind: "image", bytes: FOTO })).toBe(false);
    const enorme = Buffer.alloc(medios.TOPE_MEDIO_BYTES + 1);
    expect(await medios.guardarMedio({ waMessageId: "wamid.ENORME", kind: "video", bytes: enorme })).toBe(false);
    expect(await medios.bajarYGuardarMedio({ waMessageId: "wamid.X", kind: "image", waMediaId: "M3" }, async () => { throw new Error("red"); })).toBe(false);
  });

  it("volver a guardar sin bytes no borra los que ya estaban", async () => {
    await medios.guardarMedio({ waMessageId: "wamid.FOTO", kind: "image", waMediaId: "M1" });
    const medio = await medios.medioDelMensaje(await idDe("wamid.FOTO"), async () => null);
    expect(medio?.bytes.equals(FOTO)).toBe(true);
  });
});

describe("la lista de mensajes del panel", () => {
  it("dice qué archivo trae cada mensaje, sin sus bytes", async () => {
    await appendMessage(conversacion, "user", "[archivo]", "wamid.PDF");
    await medios.guardarMedio({ waMessageId: "wamid.PDF", kind: "document", mime: "application/pdf", filename: "Proforma 12.pdf", bytes: Buffer.from("%PDF") });
    const lista = await getHubMessages(conversacion);
    const por = (texto: string) => lista.find((m) => m.contenido.startsWith(texto));
    expect(por("[El cliente mandó una foto")?.media).toEqual({ kind: "image", mime: "image/jpeg", nombre: "foto.jpg" });
    expect(por("[archivo]")?.media).toEqual({ kind: "document", mime: "application/pdf", nombre: "Proforma 12.pdf" });
    expect(por("hola")?.media).toBeUndefined();
    expect(JSON.stringify(lista)).not.toContain("bytes");
  });
});

describe("piezas puras", () => {
  it("limpia el tipo y arma un nombre presentable", () => {
    expect(medios.mimeLimpio("audio/ogg; codecs=opus", "audio")).toBe("audio/ogg");
    expect(medios.mimeLimpio(null, "sticker")).toBe("image/webp");
    expect(medios.mimeLimpio("<script>", "document")).toBe("application/octet-stream");
    expect(medios.nombreDeArchivo("audio", "audio/ogg", null)).toBe("audio.ogg");
    expect(medios.nombreDeArchivo("document", "application/pdf", "../../etc/pa:ss.pdf")).toBe(".. .. etc pa ss.pdf");
    expect(medios.nombreDeArchivo("document", "application/x-raro", "")).toBe("archivo");
  });

  it("saca el archivo de un eco del asesor", () => {
    expect(medioDeEco({ id: "e1", to: "593", type: "image", image: { id: "IMG1", mime_type: "image/jpeg" } }))
      .toEqual({ kind: "image", id: "IMG1", mime: "image/jpeg", filename: null });
    expect(medioDeEco({ id: "e2", to: "593", type: "audio", audio: { id: "AUD1", mime_type: "audio/ogg; codecs=opus" } })?.kind).toBe("audio");
    expect(medioDeEco({ id: "e3", to: "593", type: "document", document: { id: "DOC1", filename: "Factura.pdf" } })?.filename).toBe("Factura.pdf");
    expect(medioDeEco({ id: "e4", to: "593", type: "text", text: { body: "hola" } })).toBeNull();
    expect(medioDeEco({ id: "e5", to: "593", type: "image", image: { caption: "sin id" } })).toBeNull();
  });
});
