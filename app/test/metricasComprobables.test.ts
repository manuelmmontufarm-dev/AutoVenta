import { describe, expect, it } from "vitest";

/**
 * El armado de `metrics.comprobables` con facturas y conversaciones de
 * mentira: las reglas de dominio del plan (Sprint 1) como pruebas puras. Si
 * una se rompe, el panel muestra un número que no se puede comprobar contra
 * una factura o un mensaje — justo lo que Manuel pidió sacar el 23-oct.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_no_se_conecta";

const { armarComprobables, comprobablesVacios } = await import("../src/services/metricasComprobables.js");
type Entrada = Parameters<typeof armarComprobables>[0];
type Chat = Entrada["chats"][number];
type Venta = Entrada["ventas"][number];

const HOY = "2026-10-23"; // viernes

let id = 0;
const chat = (o: Partial<Chat> & { dia: string }): Chat => ({
  id: ++id, hora: 10, conMedida: true, cotizado: true, conDiaDeVisita: false, primerMensajeConAnuncio: false, ...o,
});
const venta = (c: Chat, o: Partial<Venta> & { dia: string }): Venta => ({
  ticketId: c.id, total: 460, sinIva: 400, hora: 12, grupo: "bot", primerDia: c.dia, ...o,
});
const llanta = (dia: string, hora: number | null = 12, precio = 100) => ({
  dia, hora, llantas: [{ nombre: "KENDA 205/55R16", cantidad: 4, precio }],
});

function caso() {
  id = 0;
  const c1 = chat({ dia: "2026-08-10", hora: 9, conDiaDeVisita: true });
  const c2 = chat({ dia: "2026-09-29", hora: 12, primerMensajeConAnuncio: true });
  const c3 = chat({ dia: "2026-10-13", hora: 20, conMedida: false, cotizado: false });
  const c4 = chat({ dia: "2026-10-14", hora: 12, conDiaDeVisita: true, primerMensajeConAnuncio: true });
  const c5 = chat({ dia: "2026-10-22", hora: 3, primerMensajeConAnuncio: null }); // sin mensajes del cliente
  const chats = [c1, c2, c3, c4, c5];
  const ventas = [
    venta(c1, { dia: "2026-08-12", grupo: "bot" }),
    venta(c2, { dia: "2026-10-04", grupo: "asesor", total: 230, sinIva: 200, hora: 16 }),
    venta(c4, { dia: "2026-10-14", grupo: "bot_y_asesor", total: 115, sinIva: 100, hora: null }),
  ];
  const facturas = [
    llanta("2026-08-12"), llanta("2026-10-04", 16), llanta("2026-10-14", null),
    llanta("2026-10-15", 9), llanta("2026-10-16", 19),
    llanta("2026-10-16", 10, 10), // garantía de $10: no es una factura de llantas
  ];
  return { chats, ventas, facturas };
}

const armar = (periodo: Entrada["periodo"], extra: Partial<Entrada> = {}) => {
  const { chats, ventas, facturas } = caso();
  return armarComprobables({
    periodo, hoy: HOY, disponible: true, ultimaSync: "2026-10-23T15:00:00.000Z",
    facturas, ventas, chats, primerDiaConAnuncio: "2026-09-19", ...extra,
  });
};

describe("ventas del período", () => {
  it("«todos»: n, con y sin IVA, rango y grupos que suman n", () => {
    const m = armar({ clave: "todos", todos: true });
    expect(m.ventas.n).toBe(3);
    expect(m.ventas.conIva).toBe(805);
    expect(m.ventas.sinIva).toBe(700);
    expect(m.ventas.sinIva).toBeLessThanOrEqual(m.ventas.conIva);
    expect(m.ventas.rango).toEqual({ bajo: 0.6, alto: 8.8 });
    expect(m.ventas.grupos).toEqual({ bot: { n: 1, conIva: 460 }, bot_y_asesor: { n: 1, conIva: 115 }, asesor: { n: 1, conIva: 230 } });
    const suma = Object.values(m.ventas.grupos).reduce((a, g) => a + g.n, 0);
    expect(suma).toBe(m.ventas.n);
  });

  it("un mes recorta por el día de la primera factura con llantas, no por el chat", () => {
    const m = armar({ clave: "2026-10", todos: false });
    expect(m.ventas.n).toBe(2); // c2 escribió en septiembre y compró en octubre: cuenta en octubre
    expect(m.participacion.periodo).toEqual({ llantasTienda: 4, delBot: 2, pct: 50 });
  });
});

describe("participación por semana", () => {
  const m = armar({ clave: "2026-10", todos: false });
  it("exactamente 12 semanas consecutivas, la última es la de hoy, sin importar el selector", () => {
    expect(m.participacion.semanas).toHaveLength(12);
    expect(m.participacion.semanas.at(-1)!.lunes).toBe("2026-10-19");
    expect(m.participacion.semanas[0].lunes).toBe("2026-08-03");
    expect(armar({ clave: "2026-08", todos: false }).participacion.semanas).toEqual(m.participacion.semanas);
  });
  it("cuenta llantas de la tienda (sin la garantía), las del bot, chats y chats con anuncio", () => {
    const s = m.participacion.semanas.find((x) => x.lunes === "2026-10-12")!;
    expect(s).toMatchObject({ llantasTienda: 3, delBot: 1, chats: 2, chatsConAnuncio: 1 });
  });
  it("antes del primer anuncio guardado no hay dato; después, sí o no", () => {
    const porLunes = Object.fromEntries(m.participacion.semanas.map((s) => [s.lunes, s.anuncios]));
    expect(porLunes["2026-09-07"]).toBe("sin_dato");
    expect(porLunes["2026-09-14"]).toBe("no"); // la semana que contiene el 19-sep ya tiene dato
    expect(porLunes["2026-10-12"]).toBe("no"); // 1 chat con anuncio: menos de 10
  });
  it("«si»: ≥ 10 chats con anuncio y ≥ 30 % de los chats", () => {
    id = 100;
    const ola = [
      ...Array.from({ length: 10 }, () => chat({ dia: "2026-10-06", primerMensajeConAnuncio: true })),
      ...Array.from({ length: 23 }, () => chat({ dia: "2026-10-07" })),
    ];
    const casiOla = [
      ...Array.from({ length: 10 }, () => chat({ dia: "2026-09-29", primerMensajeConAnuncio: true })),
      ...Array.from({ length: 24 }, () => chat({ dia: "2026-09-30" })),
    ];
    const r = armarComprobables({
      periodo: { clave: "todos", todos: true }, hoy: HOY, disponible: true, ultimaSync: null,
      facturas: [], ventas: [], chats: [...ola, ...casiOla], primerDiaConAnuncio: "2026-09-19",
    });
    const porLunes = Object.fromEntries(r.participacion.semanas.map((s) => [s.lunes, s.anuncios]));
    expect(porLunes["2026-10-05"]).toBe("si"); // 10 de 33 = 30,3 %
    expect(porLunes["2026-09-28"]).toBe("no"); // 10 de 34 = 29,4 %
  });
  it("sin ningún anuncio guardado en la base, todas sin dato", () => {
    const r = armar({ clave: "todos", todos: true }, { primerDiaConAnuncio: null });
    expect(new Set(r.participacion.semanas.map((s) => s.anuncios))).toEqual(new Set(["sin_dato"]));
  });
});

describe("embudo de la cohorte", () => {
  it("chats del período hasta la factura de cualquier fecha, con y sin día", () => {
    const m = armar({ clave: "2026-10", todos: false });
    expect(m.embudo).toEqual({
      chats: 3, conMedida: 2, cotizados: 2, conDiaDeVisita: 1, compraron: 1, madura: false,
      porDia: { conDia: { chats: 1, compraron: 1 }, sinDia: { chats: 2, compraron: 0 } },
    });
  });
  it("septiembre ya maduró: su chat más nuevo tiene más de 14 días", () => {
    const m = armar({ clave: "2026-09", todos: false });
    expect(m.embudo).toMatchObject({ chats: 1, compraron: 1, madura: true });
  });
});

describe("rezago y por llegar (todo el histórico)", () => {
  it("rezago por venta: 2, 5 y 0 días", () => {
    const m = armar({ clave: "2026-08", todos: false });
    expect(m.rezago.n).toBe(3);
    expect(m.rezago.medianaDias).toBe(2);
    expect(m.rezago.acumulado.map((a) => a.dias)).toEqual([1, 3, 7, 14, 30, 60]);
    expect(m.rezago.acumulado[0]).toEqual({ dias: 1, pct: 33.3 });
    expect(m.rezago.acumulado[2]).toEqual({ dias: 7, pct: 100 });
  });
  it("por llegar: tasa de cohortes ≥ 30 días, chats vivos de los últimos 60 que no compraron", () => {
    const m = armar({ clave: "todos", todos: true });
    // Cohortes maduras: solo el 10-ago (1 chat, 1 venta) → tasa 1. Vivos: c3 (edad 10) y c5 (edad 1).
    // F(24) − F(10) = 1 − 1 = 0 y F(15) − F(1) = 1 − 1/3 → esperado 0,7.
    expect(m.rezago.porLlegar).toEqual({ esperado: 0.7, bajo: 0, alto: 3, chatsVivos: 2 });
  });
});

describe("cuándo escriben y cuándo se factura", () => {
  const m = armar({ clave: "2026-10", todos: false });
  it("trae todas las franjas y los siete días, aunque estén en cero", () => {
    expect(m.cuando.escribenPorFranja.map((f) => f.franja)).toEqual(["madrugada", "manana", "mediodia", "tarde", "noche"]);
    expect(m.cuando.facturanPorFranja).toHaveLength(5);
    expect(m.cuando.escribenPorDia.map((d) => d.dia)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(m.cuando.facturanPorDia).toHaveLength(7);
    expect(m.cuando.escribenPorFranja.find((f) => f.franja === "tarde")).toEqual({ franja: "tarde", chats: 0, ventas: 0 });
  });
  it("las ventas van a la franja en que ESCRIBIÓ el cliente", () => {
    const porFranja = Object.fromEntries(m.cuando.escribenPorFranja.map((f) => [f.franja, f]));
    expect(porFranja.manana).toEqual({ franja: "manana", chats: 1, ventas: 1 });
    expect(porFranja.mediodia).toEqual({ franja: "mediodia", chats: 2, ventas: 2 });
    expect(porFranja.noche).toEqual({ franja: "noche", chats: 1, ventas: 0 });
    expect(porFranja.madrugada.chats).toBe(1);
  });
  it("facturan: por hora de emisión; sin hora no entra en franjas pero sí en días", () => {
    const porFranja = Object.fromEntries(m.cuando.facturanPorFranja.map((f) => [f.franja, f]));
    expect(porFranja.mediodia).toEqual({ franja: "mediodia", bot: 1, tienda: 1 });
    expect(porFranja.tarde).toEqual({ franja: "tarde", bot: 1, tienda: 1 });
    expect(porFranja.noche).toEqual({ franja: "noche", bot: 0, tienda: 1 });
    expect(m.cuando.facturanPorDia.reduce((a, d) => a + d.tienda, 0)).toBe(5);
    expect(m.cuando.facturanPorDia.reduce((a, d) => a + d.bot, 0)).toBe(3);
  });
  it("pocas ventas: todavía no es suficiente", () => {
    expect(m.cuando).toMatchObject({ ventasTotales: 3, suficiente: false });
  });
});

describe("sin datos", () => {
  it("vacío: la misma forma, en cero y no disponible", () => {
    const v = comprobablesVacios({ clave: "2026-10", todos: false });
    expect(v.disponible).toBe(false);
    expect(v.ventas.n).toBe(0);
    expect(v.ventas.rango).toEqual({ bajo: 0, alto: 3.7 });
    expect(v.participacion.semanas).toHaveLength(12);
    expect(v.cuando.escribenPorFranja).toHaveLength(5);
    expect(v.rezago.medianaDias).toBeNull();
  });
});

describe("la fixture real del 23-oct cumple las reglas del contrato", async () => {
  const fs = await import("node:fs");
  const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/comprobables-2026-10-23.json", import.meta.url), "utf8"));
  for (const clave of ["todos", "octubre"] as const) {
    const m = fixture[clave];
    it(`${clave}: grupos suman n, sin IVA ≤ con IVA, 12 semanas, franjas y días completos`, () => {
      expect(Object.values(m.ventas.grupos as Record<string, { n: number }>).reduce((a, g) => a + g.n, 0)).toBe(m.ventas.n);
      expect(m.ventas.sinIva).toBeLessThanOrEqual(m.ventas.conIva);
      expect(m.participacion.semanas).toHaveLength(12);
      expect(m.cuando.escribenPorFranja).toHaveLength(5);
      expect(m.cuando.facturanPorDia).toHaveLength(7);
    });
  }
  it("sin teléfonos ni nombres", () => {
    const texto = JSON.stringify(fixture);
    expect(texto).not.toMatch(/\d{9,}/);
    expect(texto).not.toMatch(/"(telefono|phone|nombre|name|cliente)"/);
  });
});
