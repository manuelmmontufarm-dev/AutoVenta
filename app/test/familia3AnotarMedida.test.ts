/**
 * FAMILIA 3: «el cliente escribió su medida» se anota como hecho en cada
 * entrante que todavía no lo tiene (`anotarMedidasEscritas`), con el lector de
 * la ficha. Chat 27418: «X favor el precio de llantas 255 / 45 R.20 pará un
 * jetour gracias» → `medida_escrita: ["255/45R20"]`.
 *
 * Y la ficha solo la pisa una medida escrita DESPUÉS de lo último que le
 * dijimos: el día del deploy, en un chat abierto, la primera pasada anota
 * mensajes viejos sin el hecho, y una «195/65R15» de hace tres turnos no puede
 * volver a ser la medida de trabajo si la ficha ya está en «205/55R16»
 * (revisión de la coordinadora, sprint 3).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { medidaNuevaParaLaFicha } from "../src/domain/medidaDelCliente.js";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_anotar_falsa";

const hace = (min: number) => new Date(Date.now() - min * 60_000);

let sinHecho: { id: number; content: string; created_at: Date }[] = [];
let ultimoSaliente: Date | null = null;
const escrito = new Map<number, unknown>();

vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(
    async (strings: TemplateStringsArray, ...valores: unknown[]) => {
      const consulta = strings.join(" ");
      if (/update messages/.test(consulta)) {
        escrito.set(valores[1] as number, valores[0]);
        return [];
      }
      if (/direction='outbound'/.test(consulta)) return ultimoSaliente ? [{ created_at: ultimoSaliente }] : [];
      if (/not \(metadata \?/.test(consulta)) return sinHecho;
      return [];
    },
    { end: async () => undefined, json: (v: unknown) => v },
  ),
}));

const { anotarMedidasEscritas } = await import("../src/services/medidasDelPedido.js");

beforeEach(() => {
  sinHecho = [];
  ultimoSaliente = null;
  escrito.clear();
});

describe("anotarMedidasEscritas", () => {
  it("27418: anota la medida escrita a mano; un mensaje sin medida queda con lista vacía", async () => {
    sinHecho = [
      { id: 1, content: "¡Hola! Quiero más información", created_at: hace(2) },
      { id: 2, content: "X favor el precio de llantas 255 / 45 R.20 pará un jetour gracias", created_at: hace(1) },
    ];
    ultimoSaliente = hace(1.5);
    expect(await anotarMedidasEscritas(27418, 1)).toEqual({ anotadas: ["255/45R20"], paraLaFicha: "255/45R20" });
    expect(escrito.get(1)).toEqual({ medida_escrita: [] });
    expect(escrito.get(2)).toEqual({ medida_escrita: ["255/45R20"] });
  });

  it("hilo viejo sin hecho: «195/65R15» de antes se anota, pero con «hola» nuevo la ficha no cambia", async () => {
    sinHecho = [
      { id: 1, content: "195/65R15", created_at: hace(60) },
      { id: 2, content: "hola", created_at: hace(1) },
    ];
    // Después de la 195/65R15 hablamos (y la ficha quedó en 205/55R16).
    ultimoSaliente = hace(30);
    const r = await anotarMedidasEscritas(1, 1);
    expect(escrito.get(1)).toEqual({ medida_escrita: ["195/65R15"] });
    expect(r.anotadas).toEqual(["195/65R15"]);
    expect(r.paraLaFicha).toBeNull();
  });

  it("sin entrantes pendientes no escribe nada", async () => {
    expect(await anotarMedidasEscritas(1, 1)).toEqual({ anotadas: [], paraLaFicha: null });
    expect(escrito.size).toBe(0);
  });
});

describe("medidaNuevaParaLaFicha", () => {
  const filas = [
    { medidas: ["195/65R15"], created_at: hace(60) },
    { medidas: [], created_at: hace(1) },
  ];
  it("lo anterior al último saliente no va a la ficha", () => {
    expect(medidaNuevaParaLaFicha(filas, hace(30))).toBeNull();
  });
  it("lo posterior sí, la última", () => {
    expect(medidaNuevaParaLaFicha([...filas, { medidas: ["205/55R16", "215/60R16"], created_at: hace(0.5) }], hace(30))).toBe("215/60R16");
  });
  it("sin ningún saliente en el ciclo, cuenta todo", () => {
    expect(medidaNuevaParaLaFicha(filas, null)).toBe("195/65R15");
  });
});

describe("una sola regla para la ficha: la ÚLTIMA medida que el cliente escribió en el mensaje", () => {
  const FRASE = "tengo 205/55R16 pero quiero 215/55R16";

  it("«tengo 205/55R16 pero quiero 215/55R16» → 215/55R16 (antes `index.ts` guardaba 205/55R16)", async () => {
    const { medidaCanonica } = await import("../src/domain/tireSize.js");
    const { medidaEscritaEnElMensaje, medidasParaElHecho } = await import("../src/domain/medidaDelCliente.js");
    expect(medidaCanonica(FRASE)).toBe("205/55R16"); // lo que hacía index.ts: la primera
    expect(medidaEscritaEnElMensaje(FRASE)).toBe("215/55R16");
    expect(medidasParaElHecho(FRASE)).toEqual(["205/55R16", "215/55R16"]);
  });

  it("y el agente llega a la misma: la ficha del hecho anotado es 215/55R16", async () => {
    const { medidasParaElHecho } = await import("../src/domain/medidaDelCliente.js");
    expect(medidaNuevaParaLaFicha([{ medidas: medidasParaElHecho(FRASE), created_at: hace(0.5) }], hace(5))).toBe("215/55R16");
  });

  it("el orden es el del texto aunque mezcle flotación y métrica", async () => {
    const { medidaEscritaEnElMensaje } = await import("../src/domain/medidaDelCliente.js");
    expect(medidaEscritaEnElMensaje("tengo 31x10.50R15 pero quiero 265/70R15")).toBe("265/70R15");
    expect(medidaEscritaEnElMensaje("tengo 265/70R15 pero quiero 31x10.50R15")).toBe("31X10.5R15");
  });

  it("con una sola medida, es esa (y una flotación con espacios no se parte)", async () => {
    const { medidaEscritaEnElMensaje } = await import("../src/domain/medidaDelCliente.js");
    expect(medidaEscritaEnElMensaje("X favor el precio de llantas 255 / 45 R.20 pará un jetour gracias")).toBe("255/45R20");
    expect(medidaEscritaEnElMensaje("necesito 33 x 12.50 R15")).toBe("33X12.5R15");
    expect(medidaEscritaEnElMensaje("hola")).toBeNull();
  });
});
