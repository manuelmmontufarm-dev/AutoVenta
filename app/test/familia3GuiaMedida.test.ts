/**
 * FAMILIA 3 en `guia_medida`: a quien ya escribió su medida no se le manda la
 * guía para escribirla ni «si me confirma la medida completa del costado…».
 *
 * Simulador, 20-oct, chat 29523 repetido: «245 60 15 dispone?», «Me ayuda con
 * el modelo de la llanta 235 60 15», «Si una foto» → guía de medida + «Con aro
 * 15 ya podemos avanzar. Si me confirma la medida completa del costado…».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_guia_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";
process.env.SELLER_PHONE ??= "test";

let entrantes: { content: string; metadata?: unknown }[] = [];
let guiasEnviadas = 0;

vi.mock("../src/db/client.js", () => ({
  sql: async (strings: TemplateStringsArray) => {
    const consulta = strings.join(" ");
    if (/direction='inbound'/.test(consulta)) {
      const ahora = Date.now();
      return [...entrantes].reverse().map((m, i) => ({ metadata: {}, ...m, created_at: new Date(ahora - (i + 1) * 30_000) }));
    }
    return [];
  },
}));
vi.mock("../src/services/conversations.js", () => ({
  updateConversationFacts: async () => undefined,
  logFunnelEvent: async () => undefined,
  appendMessage: async () => { guiasEnviadas++; return true; },
}));
vi.mock("../src/wa/client.js", () => ({ sendImage: async () => "wamid", sendPdf: async () => "wamid" }));
vi.mock("../src/render/quoteImage.js", async (original) => ({
  ...(await original<object>()),
  renderMedidaGuideImage: async () => Buffer.from("png"),
}));

const { buildTools } = await import("../src/agent/tools.js");

async function guia(loPidio = false): Promise<Record<string, unknown>> {
  const tools = buildTools({
    conversation: { id: 29523, phone: "593999", name: "J", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: "593999",
    customerName: "J",
    currentUserText: "Si una foto",
  } as never);
  const tool = tools.find((t) => t.function.name === "guia_medida")!;
  return JSON.parse(await tool.execute({ aro: 15, lo_pidio_el_cliente: loPidio }));
}

beforeEach(() => {
  entrantes = [];
  guiasEnviadas = 0;
});

describe("29523 — escribió «245 60 15» y «235 60 15»", () => {
  beforeEach(() => {
    entrantes = [
      { content: "245 60 15 dispone?", metadata: { medida_escrita: ["245/60R15"] } },
      { content: "Me ayuda con el modelo de la llanta 235 60 15", metadata: { medida_escrita: ["235/60R15"] } },
      { content: "Si una foto", metadata: { medida_escrita: [] } },
    ];
  });

  it("la guía no sale y la herramienta le dice que trabaje con su medida", async () => {
    const r = await guia();
    expect(String(r.error)).toContain("YA escribió su medida");
    expect(String(r.error)).toContain("235/60R15");
    expect(r.mensaje_para_enviar).toBeUndefined();
    expect(guiasEnviadas).toBe(0);
  });

  it("si el cliente dice que no sabe dónde mirar, la guía sí sale", async () => {
    const r = await guia(true);
    expect(r.error).toBeUndefined();
    expect(guiasEnviadas).toBe(1);
  });
});
