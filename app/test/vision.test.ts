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
    expect(args.max_tokens).toBe(150);
    expect(args.temperature).toBe(0);
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
