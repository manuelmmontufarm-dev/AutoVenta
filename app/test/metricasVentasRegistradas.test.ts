import { describe, expect, it } from "vitest";

/**
 * Métricas → Ventas de un negocio SIN sistema contable (Competimotor con Fénix,
 * 21-nov-2026): las ventas salen de `ventas_registradas` con factura y monto.
 * Y Depot (con Contífico) tiene que salir idéntico a antes del cambio.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_no_se_conecta";

const { armarComprobables } = await import("../src/services/metricasComprobables.js");
const { ventasDelRegistro } = await import("../src/services/ventasRegistradasMetricas.js");
const { entradaDepot } = await import("./fixtures/entradaComprobablesDepot.js");
type Registro = Parameters<typeof ventasDelRegistro>[0][number];
type Chat = Parameters<typeof ventasDelRegistro>[1][number];

const HOY = "2026-11-21";
const NOV = { clave: "2026-11", todos: false };

const reg = (o: Partial<Registro> & { conversationId: number | null; dia: string }): Registro => ({
  factura: "860", monto: 437, anulada: false, vendedor: "Panel", hora: 12, creadoAt: `${o.dia}T17:31:48.000Z`, ...o,
});
// Abg Jumbo: escribió el 20-nov, ganado con la factura 860 por $437 el 21-nov.
const jumbo: Chat = { id: 469, nombre: "Abg Jumbo", primerDia: "2026-11-20", mensajesBot: 12, mensajesAsesor: 0 };
const otro: Chat = { id: 596, nombre: "Luis", primerDia: "2026-11-18", mensajesBot: 4, mensajesAsesor: 6 };
const tercero: Chat = { id: 600, nombre: "Ana", primerDia: "2026-11-19", mensajesBot: 5, mensajesAsesor: 0 };

const chatsMetricas = [jumbo, otro, tercero].map((c) => ({
  id: c.id, dia: c.primerDia, hora: 11, conMedida: true, cotizado: true, conDiaDeVisita: false, primerMensajeConAnuncio: false,
}));

function armarRegistro(registros: Registro[], periodo = NOV) {
  const { ventas, detalle } = ventasDelRegistro(registros, [jumbo, otro, tercero], 0.15);
  return armarComprobables({
    periodo, hoy: HOY, disponible: true, ultimaSync: null, facturas: [], ventas, chats: chatsMetricas,
    primerDiaConAnuncio: null, fuente: "registro", registradas: detalle,
  });
}

describe("negocio sin sistema contable: ventas del registro", () => {
  it("1 venta (ticket 469, $437): cantidad, con IVA, sin IVA /1,15, embudo, rezago y hora", () => {
    const m = armarRegistro([reg({ conversationId: 469, dia: "2026-11-21", hora: 12 })]);
    expect(m.fuente).toBe("registro");
    expect(m.disponible).toBe(true);
    expect(m.ventas.n).toBe(1);
    expect(m.ventas.conIva).toBe(437);
    expect(m.ventas.sinIva).toBe(380); // 437 / 1,15
    expect(m.ventas.rango).toEqual({ bajo: 0, alto: 5.6 });
    expect(m.ventas.grupos.bot).toEqual({ n: 1, conIva: 437 });
    // Del chat a la factura: los 3 chats de noviembre, 1 compró.
    expect(m.embudo.chats).toBe(3);
    expect(m.embudo.compraron).toBe(1);
    // Cuánto tardan: del 20 al 21-nov = 1 día.
    expect(m.rezago.n).toBe(1);
    expect(m.rezago.medianaDias).toBe(1);
    // Cuándo se factura: la hora del registro (12 h = mediodía), sin facturas de la tienda.
    expect(m.cuando.facturanPorFranja.find((f) => f.franja === "mediodia")).toEqual({ franja: "mediodia", bot: 1, tienda: 0 });
    expect(m.cuando.facturanPorFranja.reduce((a, f) => a + f.tienda, 0)).toBe(0);
    // Parte de la tienda: no hay facturas de la tienda que comparar.
    expect(m.participacion.periodo.llantasTienda).toBe(0);
    expect(m.registradas).toEqual([{
      ticketId: 469, nombre: "Abg Jumbo", total: 437, dia: "2026-11-21", grupo: "bot",
      facturas: [{ numero: "860", dia: "2026-11-21", monto: 437, vendedor: "Panel" }],
    }]);
  });

  it("2 ventas en dos chats se suman y cada una va a su grupo", () => {
    const m = armarRegistro([
      reg({ conversationId: 469, dia: "2026-11-21" }),
      reg({ conversationId: 596, dia: "2026-11-20", factura: "901", monto: 230, hora: 16 }),
    ]);
    expect(m.ventas.n).toBe(2);
    expect(m.ventas.conIva).toBe(667);
    expect(m.ventas.sinIva).toBe(580);
    expect(m.ventas.grupos.bot_y_asesor).toEqual({ n: 1, conIva: 230 }); // bot 4 + asesor 6 = de los dos
    expect(m.embudo.compraron).toBe(2);
    expect(m.registradas.map((r) => r.ticketId)).toEqual([469, 596]); // la más nueva primero
  });

  it("una venta con 2 facturas es UNA venta por la suma; la misma factura escrita dos veces cuenta una vez", () => {
    const m = armarRegistro([
      reg({ conversationId: 469, dia: "2026-11-21", factura: "860", monto: 437, creadoAt: "2026-11-21T17:31:00.000Z" }),
      reg({ conversationId: 469, dia: "2026-11-22", factura: "871", monto: 60, hora: 9, creadoAt: "2026-11-22T14:00:00.000Z" }),
      reg({ conversationId: 469, dia: "2026-11-22", factura: " 860 ", monto: 437, creadoAt: "2026-11-22T15:00:00.000Z" }),
    ]);
    expect(m.ventas.n).toBe(1);
    expect(m.ventas.conIva).toBe(497);
    expect(m.registradas[0].facturas.map((f) => f.numero)).toEqual(["860", "871"]);
    // El día y la hora de la venta son los del primer registro.
    expect(m.registradas[0].dia).toBe("2026-11-21");
    expect(m.cuando.facturanPorFranja.find((f) => f.franja === "mediodia")?.bot).toBe(1);
  });

  it("no cuentan: anulada, sin factura, sin monto, sin chat", () => {
    const m = armarRegistro([
      reg({ conversationId: 469, dia: "2026-11-21" }),
      reg({ conversationId: 596, dia: "2026-11-21", factura: "902", monto: 300, anulada: true }),
      reg({ conversationId: 600, dia: "2026-11-21", factura: null, monto: null }),
      reg({ conversationId: 600, dia: "2026-11-21", factura: "903", monto: null }),
      reg({ conversationId: null, dia: "2026-11-21", factura: "904", monto: 115 }),
    ]);
    expect(m.ventas.n).toBe(1);
    expect(m.ventas.conIva).toBe(437);
    expect(m.embudo.compraron).toBe(1);
  });

  it("el período recorta las ventas y su detalle; «todos» las trae", () => {
    const registros = [reg({ conversationId: 469, dia: "2026-11-21" })];
    expect(armarRegistro(registros, { clave: "2026-10", todos: false }).ventas.n).toBe(0);
    expect(armarRegistro(registros, { clave: "2026-10", todos: false }).registradas).toEqual([]);
    expect(armarRegistro(registros, { clave: "todos", todos: true }).ventas.n).toBe(1);
  });

  it("sin registros: disponible y en cero (no «sin Contífico»)", () => {
    const m = armarRegistro([]);
    expect(m.disponible).toBe(true);
    expect(m.fuente).toBe("registro");
    expect(m.ventas.n).toBe(0);
  });
});

describe("Depot (con Contífico) sale idéntico a antes del cambio", async () => {
  const fs = await import("node:fs");
  const antes = JSON.parse(fs.readFileSync(new URL("./fixtures/comprobables-depot-antes.json", import.meta.url), "utf8"));
  for (const [clave, periodo] of [["todos", { clave: "todos", todos: true }], ["octubre", { clave: "2026-10", todos: false }]] as const) {
    it(clave, () => {
      const { fuente, registradas, ...resto } = armarComprobables({ ...entradaDepot(), periodo });
      expect(fuente).toBe("facturas");
      expect(registradas).toEqual([]);
      expect(JSON.parse(JSON.stringify(resto))).toEqual(antes[clave]);
    });
  }
});
