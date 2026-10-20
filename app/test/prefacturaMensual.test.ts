/**
 * Pre-facturas del mes: que el corte sea el mes de Quito (no el de UTC), que
 * IA y mantenimiento salgan separadas con su IVA y sumen el total del hub, y
 * que el PDF se pueda armar con los datos de Depot.
 *
 * Puro: sin base ni WhatsApp. postgres.js no abre conexión hasta la primera
 * consulta, y aquí no hay ninguna.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://nadie@localhost/no_se_conecta";

const { periodoACobrar, prefacturasDelMes, textoDePrefacturas, prefacturasEnPdf } = await import("../src/services/prefacturaMensual.js");
const { DEPOT } = await import("../src/negocio/negocios/depot.js");

const SEPTIEMBRE = {
  period: "2026-09",
  desde: "2026-09-01",
  hasta: "2026-09-30",
  uso: { inputTokens: 64_728_185, cachedInputTokens: 40_894_720, outputTokens: 1_042_422, runs: 12_147, usd: 150.17, usdConIva: 172.7 },
  ivaTokens: 22.53,
  mantenimiento: 80,
  ivaMantenimiento: 12,
  total: 264.7,
  vence: "2026-10-02",
  enCurso: false,
  pagado: false,
  pagadoEl: null,
};

describe("el mes que se cobra", () => {
  it("a las 23:30 del 30-sep en Quito todavía es septiembre: se cobra agosto", () => {
    expect(periodoACobrar(new Date("2026-10-01T04:30:00Z"))).toBe("2026-08");
  });
  it("a las 00:01 del 1-oct en Quito ya cerró septiembre", () => {
    expect(periodoACobrar(new Date("2026-10-01T05:01:00Z"))).toBe("2026-09");
  });
  it("en enero se cobra diciembre del año anterior", () => {
    expect(periodoACobrar(new Date("2027-01-01T06:00:00Z"))).toBe("2026-12");
  });
});

describe("dos pre-facturas, cada una con su IVA", () => {
  const [ia, mant] = prefacturasDelMes(SEPTIEMBRE);

  it("IA y mantenimiento por separado, con el detalle que usa la contadora", () => {
    expect(ia).toMatchObject({ ref: "DT-IA-2026-09", detalle: "CONSUMO INTELIGENCIA ARTIFICIAL SEPTIEMBRE", subtotal: 150.17, iva: 22.53, total: 172.7 });
    expect(mant).toMatchObject({ ref: "DT-MANT-2026-09", detalle: "MENSUALIDAD SEPTIEMBRE", subtotal: 80, iva: 12, total: 92 });
  });

  it("las dos suman exactamente el total del hub", () => {
    expect(Math.round((ia.total + mant.total) * 100) / 100).toBe(SEPTIEMBRE.total);
  });

  it("el mes en curso marca PRELIMINAR solo la de IA", () => {
    const [iaEnCurso, mantEnCurso] = prefacturasDelMes({ ...SEPTIEMBRE, enCurso: true });
    expect(iaEnCurso.preliminar).toBe(true);
    expect(mantEnCurso.preliminar).toBe(false);
  });

  it("el WhatsApp trae los dos totales y avisa de meses sin pagar", () => {
    const texto = textoDePrefacturas(SEPTIEMBRE, [{ ...SEPTIEMBRE, period: "2026-08", total: 216.71 }]);
    expect(texto).toContain("$172.70");
    expect(texto).toContain("$92.00");
    expect(texto).toContain("$264.70");
    expect(texto).toContain("agosto 2026 sigue sin marcarse pagado");
  });
});

describe("datos de facturación de Depot", () => {
  it("se factura a PITSTOP S.A.S., la razón social, no a la marca", () => {
    expect(DEPOT.facturacion?.cliente).toMatchObject({ razonSocial: "PITSTOP S.A.S.", ruc: "1793220112001" });
    expect(DEPOT.facturacion?.emisor.ruc).toBe("1708782253001");
  });

  it("los dos PDF se arman", async () => {
    const docs = await prefacturasEnPdf(SEPTIEMBRE);
    expect(docs.map((d) => d.filename)).toEqual([
      "prefactura-depot-2026-09-ia.pdf",
      "prefactura-depot-2026-09-mantenimiento.pdf",
    ]);
    for (const { pdf } of docs) expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
