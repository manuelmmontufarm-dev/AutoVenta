/**
 * FAMILIA 3: «el cliente escribió su medida» se anota como hecho en cada
 * entrante que todavía no lo tiene (`anotarMedidasEscritas`), con el lector de
 * la ficha. Chat 27418: «X favor el precio de llantas 255 / 45 R.20 pará un
 * jetour gracias» → `medida_escrita: ["255/45R20"]`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_anotar_falsa";

let sinHecho: { id: number; content: string }[] = [];
const escrito = new Map<number, unknown>();

vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(
    async (strings: TemplateStringsArray, ...valores: unknown[]) => {
      const consulta = strings.join(" ");
      if (/^\s*select/.test(consulta)) {
        expect(consulta).toMatch(/not \(metadata \?/);
        return sinHecho;
      }
      if (/update messages/.test(consulta)) {
        escrito.set(valores[1] as number, valores[0]);
        return [];
      }
      return [];
    },
    { end: async () => undefined, json: (v: unknown) => v },
  ),
}));

const { anotarMedidasEscritas } = await import("../src/services/medidasDelPedido.js");

beforeEach(() => {
  sinHecho = [];
  escrito.clear();
});

describe("anotarMedidasEscritas", () => {
  it("27418: anota la medida escrita a mano; un mensaje sin medida queda con lista vacía", async () => {
    sinHecho = [
      { id: 1, content: "¡Hola! Quiero más información" },
      { id: 2, content: "X favor el precio de llantas 255 / 45 R.20 pará un jetour gracias" },
    ];
    expect(await anotarMedidasEscritas(27418, 1)).toEqual(["255/45R20"]);
    expect(escrito.get(1)).toEqual({ medida_escrita: [] });
    expect(escrito.get(2)).toEqual({ medida_escrita: ["255/45R20"] });
  });

  it("sin entrantes pendientes no escribe nada", async () => {
    expect(await anotarMedidasEscritas(1, 1)).toEqual([]);
    expect(escrito.size).toBe(0);
  });
});
