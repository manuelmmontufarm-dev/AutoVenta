import { describe, expect, it } from "vitest";
import { claveCelebracion, textoCelebracion, ventasParaCelebrar, type VentaParaCelebrar } from "../src/domain/celebrarVenta.js";
import type { NivelAviso } from "../src/services/advisorNotifications.js";

// Sin base ni WhatsApp: advisorNotifications lee config al importarse.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_no_se_conecta";

const { buildAdvisorMessage, completarEventosNuevos, NIVELES_DEFECTO, recibeEvento } =
  await import("../src/services/advisorNotifications.js");

const venta = (o: Partial<VentaParaCelebrar> = {}): VentaParaCelebrar => ({
  ticketId: 11366,
  dia: "2026-11-08",
  primerDia: "2026-11-03",
  total: 593.24,
  llantas: "4 × LLANTA 205/55R16 KENDA KR33A",
  facturas: [{ local: "Cumbayá" }],
  atendio: "bot",
  cotizado: true,
  ...o,
});

describe("qué ventas se festejan", () => {
  it("una venta del bot facturada hoy o ayer, sí", () => {
    expect(ventasParaCelebrar([venta()], "2026-11-08")).toHaveLength(1);
    expect(ventasParaCelebrar([venta({ dia: "2026-11-07" })], "2026-11-08")).toHaveLength(1);
  });

  it("el histórico NO: el primer arranque no puede festejar cien ventas viejas", () => {
    expect(ventasParaCelebrar([venta({ dia: "2026-11-06" }), venta({ dia: "2026-08-20" })], "2026-11-08")).toEqual([]);
  });

  it("ayer cruza el cambio de mes", () => {
    expect(ventasParaCelebrar([venta({ dia: "2026-10-31" })], "2026-11-01")).toHaveLength(1);
  });

  it("si el asesor escribió más que el bot, la venta es del asesor y no se festeja como del bot", () => {
    expect(ventasParaCelebrar([venta({ atendio: "asesor" })], "2026-11-08")).toEqual([]);
  });

  it("una sola vez por chat y día, aunque la bajada corra cada 10 minutos", () => {
    expect(claveCelebracion(venta())).toBe(claveCelebracion(venta({ total: 700 })));
    expect(claveCelebracion(venta())).not.toBe(claveCelebracion(venta({ ticketId: 1 })));
  });
});

describe("el mensaje", () => {
  it("abre con la cabecera de festejo y pone monto, llantas y local antes del nombre", () => {
    const texto = buildAdvisorMessage({
      conversationId: 11366, cycle: 1, eventType: "venta_confirmada", dedupeKey: "x",
      customer: "Francisco", phone: "593999999999", ...textoCelebracion(venta()),
    });
    const lineas = texto.split("\n");
    expect(lineas[0]).toBe("🎉 *¡VENTA DEL BOT!*");
    expect(lineas[2]).toBe("$593,24 · 4 × LLANTA 205/55R16 KENDA KR33A · Cumbayá");
    expect(lineas.indexOf("👤 Francisco")).toBeGreaterThan(2);
    expect(texto).toContain("compró 5 días después, con la cotización del bot");
    expect(lineas.at(-1)).toContain("/#/ticket/11366");
  });

  it("mismo día, sin cotización y sin local conocido", () => {
    const t = textoCelebracion(venta({ primerDia: "2026-11-08", cotizado: false, facturas: [{ local: "—" }] }));
    expect(t.reason).toBe("Escribió al bot y compró el mismo día");
    expect(t.details.filter(Boolean)).toHaveLength(2);
  });
});

describe("le llega a los niveles que Depot ya guardó", () => {
  // Lo que había en producción el 8-nov: un solo nivel, sin la categoría «ventas».
  const guardado: NivelAviso[] = [{ id: "admin", nombre: "Nivel 1", eventos: ["visita_hoy", "send_error"], generales: [] }];

  it("un nivel guardado antes de que existiera el festejo lo recibe", () => {
    expect(recibeEvento("admin", "venta_confirmada", completarEventosNuevos(guardado))).toBe(true);
  });

  it("si alguien lo desmarca y guarda, se queda apagado", () => {
    const desmarcado = guardado.map((n) => ({ ...n, vistos: ["venta_confirmada" as const] }));
    expect(recibeEvento("admin", "venta_confirmada", completarEventosNuevos(desmarcado))).toBe(false);
  });

  it("no duplica ni toca lo demás", () => {
    const [n] = completarEventosNuevos(completarEventosNuevos(guardado));
    expect(n.eventos).toEqual(["visita_hoy", "send_error", "venta_confirmada"]);
  });

  it("los dos niveles por defecto lo reciben", () => {
    for (const n of NIVELES_DEFECTO) expect(recibeEvento(n.id, "venta_confirmada"), n.id).toBe(true);
  });
});
