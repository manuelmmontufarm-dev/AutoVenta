import { beforeEach, describe, expect, it, vi } from "vitest";

// El módulo importa config (exige env): valores de prueba ANTES del import.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

// El SDK de OpenAI se reemplaza por un doble: la prueba es del contrato de
// describirFotoDeLlanta (qué texto devuelve y cuándo devuelve null), no del HTTP.
const crear = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: crear } };
  },
}));

const { describirFotoDeLlanta } = await import("../src/services/vision.js");

const respuesta = (content: string | null) => ({ choices: [{ message: { content } }] });
const FOTO = Buffer.from("bytes-de-la-foto");

describe("Visión — las fotos del cliente se vuelven texto vendible", () => {
  // Con llaves a propósito: mockReset() devuelve el spy y vitest tomaría esa
  // función como teardown, llamando al mock al terminar cada prueba.
  beforeEach(() => {
    crear.mockReset();
  });

  it("devuelve la línea leída cuando el modelo sí ve la medida", async () => {
    crear.mockResolvedValue(respuesta("225/65R17 Falken Wildpeak A/T 102H DOT 3521"));
    const texto = await describirFotoDeLlanta(FOTO, "image/jpeg");
    expect(texto).toBe("225/65R17 Falken Wildpeak A/T 102H DOT 3521");
  });

  it("manda la imagen como data URL base64 con su mime real", async () => {
    crear.mockResolvedValue(respuesta("205/55R16"));
    await describirFotoDeLlanta(FOTO, "image/png");
    const args = crear.mock.calls[0][0];
    const url = args.messages[1].content[0].image_url.url;
    expect(url).toBe(`data:image/png;base64,${FOTO.toString("base64")}`);
    expect(args.max_completion_tokens).toBe(400);
    if (String(args.model).startsWith("gpt-5")) {
      expect(args.reasoning_effort).toBe("low");
      expect(args.verbosity).toBe("low");
    } else {
      expect(args.temperature).toBe(0);
    }
  });

  /**
   * Leer una foto es UNA llamada por foto, no un turno del loop: paga el mejor
   * modelo de visión. Si esto se cae al modelo barato del loop, un dígito mal
   * leído cotiza la llanta equivocada y nadie se entera hasta la tienda.
   */
  it("lee con visionModel, nunca con el modelo barato del loop", async () => {
    const { config } = await import("../src/config.js");
    crear.mockResolvedValue(respuesta("225/65R17"));
    await describirFotoDeLlanta(FOTO, "image/jpeg");
    expect(crear.mock.calls[0][0].model).toBe(config.openai.visionModel);
  });

  it("el caption del cliente viaja en el mensaje para orientar la lectura", async () => {
    crear.mockResolvedValue(respuesta("225/65R17 Falken Wildpeak A/T"));
    await describirFotoDeLlanta(FOTO, "image/jpeg", "esa llanta mi amigo, a cómo me da");
    const contenido = crear.mock.calls[0][0].messages[1].content;
    // La imagen se queda en [0] con o sin caption: el pie de foto se suma, no desplaza.
    expect(contenido[0].type).toBe("image_url");
    const texto = contenido.find((p: { type: string }) => p.type === "text");
    expect(texto.text).toBe(
      "El cliente escribió junto a la foto: esa llanta mi amigo, a cómo me da",
    );
  });

  it("sin caption manda solo la imagen (el llamador viejo sigue igual)", async () => {
    crear.mockResolvedValue(respuesta("205/55R16"));
    await describirFotoDeLlanta(FOTO, "image/jpeg");
    const contenido = crear.mock.calls[0][0].messages[1].content;
    expect(contenido).toHaveLength(1);
    expect(contenido[0].type).toBe("image_url");
  });

  it("un caption en blanco no ensucia el mensaje", async () => {
    crear.mockResolvedValue(respuesta("205/55R16"));
    await describirFotoDeLlanta(FOTO, "image/jpeg", "   ");
    expect(crear.mock.calls[0][0].messages[1].content).toHaveLength(1);
  });

  it("FOTO_SIN_DATOS es null: no hay nada que pasarle al agente", async () => {
    crear.mockResolvedValue(respuesta("FOTO_SIN_DATOS"));
    expect(await describirFotoDeLlanta(FOTO, "image/jpeg")).toBeNull();
  });

  it("una respuesta vacía también es null", async () => {
    crear.mockResolvedValue(respuesta("   "));
    expect(await describirFotoDeLlanta(FOTO, "image/jpeg")).toBeNull();
  });

  it("si la API falla devuelve null en vez de lanzar (no puede tumbar el webhook)", async () => {
    crear.mockImplementation(async () => {
      throw new Error("429 rate limit");
    });
    expect(await describirFotoDeLlanta(FOTO, "image/jpeg")).toBeNull();
  });
});
