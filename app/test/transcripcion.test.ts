import { beforeEach, describe, expect, it, vi } from "vitest";

// El módulo importa config (exige env): valores de prueba ANTES del import.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

// El SDK de OpenAI se reemplaza por un doble: la prueba es del contrato de
// transcribirAudio (qué texto devuelve y cuándo devuelve null), no del HTTP.
// toFile también se dobla porque es un named export del mismo módulo.
const crear = vi.fn();
const aArchivo = vi.fn(async (bytes: Buffer, nombre: string, opciones: { type: string }) => ({
  nombre,
  tipo: opciones.type,
  bytes,
}));
vi.mock("openai", () => ({
  default: class {
    audio = { transcriptions: { create: crear } };
  },
  toFile: (...args: unknown[]) => (aArchivo as unknown as (...a: unknown[]) => unknown)(...args),
}));

const { transcribirAudio } = await import("../src/services/transcripcion.js");

const AUDIO = Buffer.from("bytes-de-la-nota-de-voz");
const OGG = "audio/ogg; codecs=opus";

describe("Transcripción — las notas de voz del cliente se vuelven texto vendible", () => {
  // Con llaves a propósito: mockReset() devuelve el spy y vitest tomaría esa
  // función como teardown, llamando al mock al terminar cada prueba.
  beforeEach(() => {
    crear.mockReset();
    aArchivo.mockClear();
  });

  it("devuelve lo que dijo el cliente cuando el audio sí se entiende", async () => {
    crear.mockResolvedValue({ text: "  Buenas, necesito cuatro llantas 205/55R16  " });
    const texto = await transcribirAudio(AUDIO, OGG);
    expect(texto).toBe("Buenas, necesito cuatro llantas 205/55R16");
  });

  it("manda el ogg de WhatsApp con su mime real y el modelo de config", async () => {
    crear.mockResolvedValue({ text: "265/70R17" });
    await transcribirAudio(AUDIO, OGG);
    expect(aArchivo).toHaveBeenCalledWith(AUDIO, "audio.ogg", { type: OGG });
    const args = crear.mock.calls[0][0];
    expect(args.model).toBe("whisper-1");
    expect(args.file).toMatchObject({ nombre: "audio.ogg", tipo: OGG });
  });

  it("sesga a español y al vocabulario de llantas (si no, «205/55R16» sale en letras)", async () => {
    crear.mockResolvedValue({ text: "quiero precio" });
    await transcribirAudio(AUDIO, OGG);
    const args = crear.mock.calls[0][0];
    expect(args.language).toBe("es");
    expect(args.prompt).toContain("205/55R16");
    expect(args.prompt).toContain("Kenda");
    expect(args.prompt).toContain("Falken");
  });

  it("un audio mudo es null: no hay nada que pasarle al agente", async () => {
    crear.mockResolvedValue({ text: "   " });
    expect(await transcribirAudio(AUDIO, OGG)).toBeNull();
  });

  it("si la API falla devuelve null en vez de lanzar (no puede tumbar el webhook)", async () => {
    crear.mockImplementation(async () => {
      throw new Error("429 rate limit");
    });
    expect(await transcribirAudio(AUDIO, OGG)).toBeNull();
  });
});
