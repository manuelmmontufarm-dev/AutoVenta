import { describe, expect, it, vi } from "vitest";

/**
 * EL CANDADO DE «SIN MEDIDA DEL CLIENTE NO HAY COTIZACIÓN» (1-sep-2026).
 *
 * Conv 13862: «Suzuki SZ 2016, ¿qué llantas me recomienda?» → el bot dedujo
 * 225/70R16 y cotizó. En el simulador el modelo, con el hecho y las reglas
 * nuevas, ya no intenta cotizar — pero la regla de esta casa es que lo que
 * tiene que ser cierto sí o sí no depende del modelo. Esta prueba ejercita el
 * candado determinístico de `generar_cotizacion` directamente.
 */
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_candado_medida_falso";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

vi.mock("../src/services/catalog.js", () => ({
  ensureCatalogReady: async () => ({}),
  searchBySize: () => [],
  searchAlternatives: () => [],
  searchByText: () => [],
  findByCode: () => undefined,
  resolveCatalogReference: () => undefined,
}));
vi.mock("../src/services/conversations.js", () => ({
  appendMessage: async () => undefined,
  logQuote: async () => undefined,
  logQuoteArtifact: async () => undefined,
  setStage: async () => undefined,
  updateConversationFacts: async () => undefined,
}));
vi.mock("../src/db/client.js", () => ({ sql: Object.assign(async () => [], { end: async () => undefined, json: (v: unknown) => v }) }));
vi.mock("../src/wa/client.js", () => ({ sendImage: async () => "wamid", sendPdf: async () => "wamid" }));

const { buildTools } = await import("../src/agent/tools.js");

function cotizar(ctxExtra: Record<string, unknown>) {
  const tools = buildTools({
    conversation: { id: 1, phone: "593999", name: "Víctor", stage: "seleccionando", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: "593999",
    currentUserText: "No sé la medida, cotíceme la 2 nomás",
    ...ctxExtra,
  } as never);
  const tool = tools.find((t) => t.function.name === "generar_cotizacion")!;
  return tool.execute({ items: [{ code: "K503B600", cantidad: 4 }], nombre_cliente: null, incluir_pdf: false });
}

describe("generar_cotizacion con la medida sin confirmar", () => {
  it("se bloquea aunque el cliente la pida con todas sus letras, y dice qué hacer", async () => {
    const r = JSON.parse(await cotizar({ medidaSinConfirmar: true, aceptoCotizacion: true }));
    expect(r.error).toMatch(/Cotización bloqueada/);
    expect(r.error).toMatch(/dedujo el bot/);
    expect(r.error).toMatch(/foto del costado/);
    expect(r.error).toMatch(/buscar_llanta/);
  });

  it("sin la bandera no es este candado el que frena", async () => {
    const r = JSON.parse(await cotizar({ medidaSinConfirmar: false, aceptoCotizacion: true }));
    expect(r.error ?? "").not.toMatch(/dedujo el bot/);
  });
});
