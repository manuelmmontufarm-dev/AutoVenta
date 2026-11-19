import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * «QUÉ MÁS TIENE» NO DEPENDE DE QUE EL MODELO SE ACUERDE (simulador, 18-nov):
 * en 205/55R16 el modelo contestó tres de tres veces en texto, sin herramientas,
 * y la segunda lámina nunca salió. La ruta directa llama `preparar_opciones`
 * con la lámina en pantalla y la herramienta arma la siguiente.
 */
process.env.NEGOCIO = "mundillantas";
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

let pieza: Record<string, unknown> | null = null;
const llamadas: Record<string, unknown>[] = [];

vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(async () => (pieza ? [{ metadata: pieza }] : []), { end: async () => undefined }),
}));
vi.mock("../src/services/conversations.js", () => ({ logFunnelEvent: async () => undefined }));
vi.mock("../src/agent/tools.js", () => ({
  buildTools: () => [{
    function: { name: "preparar_opciones" },
    execute: async (args: Record<string, unknown>) => {
      llamadas.push(args);
      return JSON.stringify({ mensaje_para_enviar: "• HAIDA RUNSPIRIT — $73.60 c/u · 4 = $294.40\n\n¿Cuál le cotizo?" });
    },
  }],
}));

const { tryMasOpcionesPorMarca } = await import("../src/services/masOpcionesPorMarca.js");
const ctx = { conversation: { id: 7, current_cycle: 1 } as never, customerPhone: "593999" };

beforeEach(() => {
  pieza = null;
  llamadas.length = 0;
});

describe("ruta directa «qué más tiene» (Competimotor)", () => {
  it("con la lámina por marca en pantalla: llama preparar_opciones con sus códigos y devuelve la lámina nueva", async () => {
    pieza = { piece: "options", codes: ["A0534", "A0230", "A0481"], sizeLabel: "205/55R16", seleccion: "primera", recomendado: "A0230" };
    const respuesta = await tryMasOpcionesPorMarca(ctx, "qué más tiene?");
    expect(respuesta).toContain("HAIDA RUNSPIRIT");
    expect(llamadas[0]).toMatchObject({ codes: ["A0534", "A0230", "A0481"], recomendado: "A0230" });
  });

  it("sin pedir más, no entra (contesta lo de siempre)", async () => {
    pieza = { piece: "options", codes: ["A0534"], sizeLabel: "205/55R16", seleccion: "primera" };
    expect(await tryMasOpcionesPorMarca(ctx, "la kenda por favor")).toBeNull();
    expect(llamadas).toHaveLength(0);
  });

  it("con una lámina que NO armó la regla (equivalentes, por aro), no entra", async () => {
    pieza = { piece: "options", codes: ["A0534"], sizeLabel: null };
    expect(await tryMasOpcionesPorMarca(ctx, "qué más tiene?")).toBeNull();
  });
});
