import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  contenidoDeEco,
  esPayloadDeEco,
  extraerEcos,
  firmaValida,
  tipoDeEco,
  type EchoMessage,
} from "../src/domain/echoPayload.js";
import {
  _resetRegistroEnviados,
  esEnvioPropio,
  registrarEnviado,
} from "../src/wa/outboundRegistry.js";

const SECRET = "app-secret-de-prueba";

function payload(field: string, mensajes: unknown[]): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field,
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "593982801766", phone_number_id: "1" },
              [field]: mensajes,
            },
          },
        ],
      },
    ],
  });
}

const ecoTexto = (over: Partial<EchoMessage> = {}) => ({
  from: "593982801766",
  to: "593993676947",
  id: "wamid.ECO1",
  timestamp: "1785941000",
  type: "text",
  text: { body: "¿Cuál es su nombre para la cotización?" },
  ...over,
});

describe("esPayloadDeEco: distinguir un eco de un mensaje entrante", () => {
  it("reconoce message_echoes y smb_message_echoes", () => {
    expect(esPayloadDeEco(payload("message_echoes", [ecoTexto()]))).toBe(true);
    expect(esPayloadDeEco(payload("smb_message_echoes", [ecoTexto()]))).toBe(true);
  });

  it("deja pasar los mensajes normales a handle_post", () => {
    expect(esPayloadDeEco(payload("messages", [ecoTexto()]))).toBe(false);
    expect(esPayloadDeEco(payload("calls", []))).toBe(false);
  });

  it("no revienta con un body que no es JSON", () => {
    expect(esPayloadDeEco("no soy json")).toBe(false);
    expect(extraerEcos("<html>")).toEqual([]);
  });
});

describe("firmaValida: nadie puede inyectar mensajes falsos en un historial", () => {
  const body = payload("message_echoes", [ecoTexto()]);
  const buena = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

  it("acepta la firma que calcula Meta con el app secret", () => {
    expect(firmaValida(body, buena, SECRET)).toBe(true);
  });

  it("rechaza firma de otro secret, ausente, vacía o de otro cuerpo", () => {
    expect(firmaValida(body, buena, "otro-secret")).toBe(false);
    expect(firmaValida(body, undefined, SECRET)).toBe(false);
    expect(firmaValida(body, "sha256=", SECRET)).toBe(false);
    expect(firmaValida(payload("message_echoes", []), buena, SECRET)).toBe(false);
  });

  it("no revienta cuando la firma tiene otro largo (timingSafeEqual)", () => {
    expect(firmaValida(body, "sha256=abcd", SECRET)).toBe(false);
  });
});

describe("extraerEcos", () => {
  it("saca los mensajes del campo que sea", () => {
    expect(extraerEcos(payload("message_echoes", [ecoTexto()]))).toHaveLength(1);
    expect(extraerEcos(payload("smb_message_echoes", [ecoTexto()]))).toHaveLength(1);
  });

  it("descarta los que no traen id o destinatario: sin eso no hay dónde guardarlos", () => {
    const ecos = extraerEcos(
      payload("message_echoes", [ecoTexto(), { ...ecoTexto(), id: undefined }, { ...ecoTexto(), to: undefined }]),
    );
    expect(ecos).toHaveLength(1);
  });
});

describe("contenidoDeEco: el agente lee esta columna", () => {
  it("usa el texto y el caption cuando existen", () => {
    expect(contenidoDeEco(ecoTexto() as EchoMessage)).toBe("¿Cuál es su nombre para la cotización?");
    expect(
      contenidoDeEco({ id: "1", to: "x", type: "image", image: { caption: "Así se ven" } }),
    ).toBe("Así se ven");
  });

  it("describe QUÉ se mandó cuando no hay texto, en vez de dejarlo en blanco", () => {
    expect(contenidoDeEco({ id: "1", to: "x", type: "image" })).toMatch(/imagen/);
    expect(contenidoDeEco({ id: "1", to: "x", type: "audio" })).toMatch(/nota de voz/);
    expect(contenidoDeEco({ id: "1", to: "x", type: "document", document: { filename: "cot.pdf" } }))
      .toMatch(/cot\.pdf/);
    expect(contenidoDeEco({ id: "1", to: "x", type: "location", location: { name: "Quito Sur" } }))
      .toBe("📍 Quito Sur");
  });
});

describe("tipoDeEco", () => {
  it("mapea al tipo de la columna messages.type", () => {
    expect(tipoDeEco({ id: "1", to: "x", type: "text" })).toBe("text");
    expect(tipoDeEco({ id: "1", to: "x", type: "image" })).toBe("image");
    expect(tipoDeEco({ id: "1", to: "x", type: "document" })).toBe("pdf");
    expect(tipoDeEco({ id: "1", to: "x", type: "location" })).toBe("location");
    expect(tipoDeEco({ id: "1", to: "x", type: "contacts" })).toBe("text");
  });
});

describe("registro de envíos propios: el bot no se pausa por su propio eco", () => {
  beforeEach(() => _resetRegistroEnviados());

  it("reconoce lo que mandó este proceso", () => {
    registrarEnviado("wamid.MIO");
    expect(esEnvioPropio("wamid.MIO")).toBe(true);
  });

  it("no reclama como propio lo que escribió el asesor desde WhatsApp", () => {
    registrarEnviado("wamid.MIO");
    expect(esEnvioPropio("wamid.DEL_ASESOR")).toBe(false);
  });

  it("ignora un id vacío en vez de guardar basura", () => {
    registrarEnviado(undefined);
    expect(esEnvioPropio("undefined")).toBe(false);
  });
});
