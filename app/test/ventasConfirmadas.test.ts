import { describe, expect, it } from "vitest";

/**
 * Las reglas del cruce teléfono ↔ factura, una por cada caso que el cruce a
 * mano (26-ago, 12-sep, 27-sep) tuvo que decidir. Si alguien afloja una regla,
 * el número de Métricas vuelve a contar garantías, repuestos o clientes que el
 * bot ni atendió; si la aprieta, deja de contar ventas que sí hizo.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_no_se_conecta";

const { cruzar, normalizarFactura, tel9 } = await import("../src/services/ventasConfirmadas.js");
type Conv = Parameters<typeof cruzar>[1][number];

let n = 0;
function factura(o: {
  telefonos: string;
  fecha: string;
  total: number;
  lineas: Array<[nombre: string, cantidad: number, precio: number, descuento?: number]>;
  documento?: string;
}) {
  return normalizarFactura({
    tipo_documento: "FAC",
    anulado: false,
    documento: o.documento ?? `002-001-${String(++n).padStart(9, "0")}`,
    fecha_emision: o.fecha,
    total: String(o.total),
    cliente: { razon_social: "CLIENTE", telefonos: o.telefonos },
    detalles: o.lineas.map(([producto_nombre, cantidad, precio, descuento = 0]) => ({
      producto_nombre, cantidad: String(cantidad), precio: String(precio), porcentaje_descuento: String(descuento),
    })),
  })!;
}

function conv(o: Partial<Conv> & { phone: string }): Conv {
  return {
    id: ++n, name: "Cliente", primerDia: "2026-08-10", tieneMedida: true, cotizaciones: 1,
    mensajesCliente: 6, mensajesBot: 10, mensajesAsesor: 0, ...o,
  };
}

const LLANTA_KENDA = "KENDA 205/55R16 91 V KR203 TL";

describe("teléfono como llave", () => {
  it("empareja por los últimos 9 dígitos: 0999… en Contífico es 593999… en WhatsApp", () => {
    expect(tel9("593987109790")).toBe("987109790");
    const f = factura({ telefonos: "0987109790", fecha: "11/08/2026", total: 200, lineas: [[LLANTA_KENDA, 2, 86.96]] });
    const { ventas } = cruzar([f], [conv({ phone: "593987109790" })]);
    expect(ventas).toHaveLength(1);
    expect(ventas[0].total).toBe(200);
  });

  it("una factura con varios teléfonos llega a cualquiera de ellos", () => {
    const f = factura({ telefonos: "022345678 / 0987109790", fecha: "11/08/2026", total: 200, lineas: [[LLANTA_KENDA, 2, 86.96]] });
    expect(cruzar([f], [conv({ phone: "593987109790" })]).ventas).toHaveLength(1);
  });

  it("ignora facturas anuladas y documentos que no son factura", () => {
    const base = { documento: "002-001-000000999", fecha_emision: "11/08/2026", total: "200", cliente: { telefonos: "0987109790" }, detalles: [] };
    expect(normalizarFactura({ ...base, tipo_documento: "FAC", anulado: true })).toBeNull();
    expect(normalizarFactura({ ...base, tipo_documento: "PRE", anulado: false })).toBeNull();
  });
});

describe("lo que el cruce a mano descartó", () => {
  it("factura de antes del primer mensaje: ya era cliente (Andrés Tamayo, PITSTOP)", () => {
    const f = factura({ telefonos: "0991111111", fecha: "13/05/2026", total: 380.96, lineas: [[LLANTA_KENDA, 4, 80]] });
    const { ventas, descartes } = cruzar([f], [conv({ phone: "593991111111", primerDia: "2026-08-13" })]);
    expect(ventas).toHaveLength(0);
    expect(descartes[0].motivo).toBe("antes_del_chat");
  });

  it("repuestos sin llantas: vino por el bot pero no compró llantas (Lucho)", () => {
    const f = factura({ telefonos: "0999518944", fecha: "28/08/2026", total: 970.01, lineas: [["Toyota Fortuner V;B6", 2, 420]] });
    const { ventas, descartes } = cruzar([f], [conv({ phone: "593999518944" })]);
    expect(ventas).toHaveLength(0);
    expect(descartes[0].motivo).toBe("sin_llantas");
  });

  it("garantía: la llanta sale a precio de lista con 100 % de descuento (Dani R.)", () => {
    const f = factura({
      telefonos: "0987757618", fecha: "07/09/2026", total: 10,
      lineas: [["ENLLANTAJE CAMIONETA", 1, 4.35], ["255/50R20 XL 109V WILDPEAK A/T TRAIL", 1, 261.18, 100]],
    });
    const { ventas, descartes } = cruzar([f], [conv({ phone: "593987757618" })]);
    expect(ventas).toHaveLength(0);
    expect(descartes[0].motivo).toBe("sin_llantas");
  });

  it("chat que no pasó del saludo: compró Falken, pero el bot no le vendió nada («Desconocido»)", () => {
    const f = factura({ telefonos: "0962783707", fecha: "03/08/2026", total: 1157.41, lineas: [["LT265/75R16 123/120S WILDPEAK A/T 4W", 4, 335.49]] });
    const c = conv({ phone: "593962783707", primerDia: "2026-08-03", tieneMedida: false, cotizaciones: 0, mensajesCliente: 2 });
    const { ventas, descartes } = cruzar([f], [c]);
    expect(ventas).toHaveLength(0);
    expect(descartes[0].motivo).toBe("solo_saludo");
  });
});

describe("lo que el cruce a mano contó", () => {
  it("sin medida ni cotización pero el bot le coordinó la visita (Juan Manuel Durán)", () => {
    const f = factura({ telefonos: "0987109790", fecha: "11/08/2026", total: 200, lineas: [[LLANTA_KENDA, 2, 86.96]] });
    const c = conv({ phone: "593987109790", tieneMedida: false, cotizaciones: 0, mensajesCliente: 7 });
    expect(cruzar([f], [c]).ventas).toHaveLength(1);
  });

  it("la mano de obra del día siguiente se suma a la misma venta (Patricio Soria)", () => {
    const llantas = factura({ telefonos: "0995197552", fecha: "26/08/2026", total: 256.05, lineas: [["225/75R16C 120/116Q KR33A 12P TL KENDA", 2, 148.41]] });
    const obra = factura({ telefonos: "0995197552", fecha: "27/08/2026", total: 34.99, lineas: [["MANO DE OBRA", 1, 30.43]] });
    const { ventas } = cruzar([obra, llantas], [conv({ phone: "593995197552" })]);
    expect(ventas).toHaveLength(1);
    expect(ventas[0].total).toBe(291.04);
    expect(ventas[0].dia).toBe("2026-08-26");
    expect(ventas[0].facturas.map((f) => f.dia)).toEqual(["2026-08-26", "2026-08-27"]);
  });

  it("cuando el asesor escribió más que el bot, la venta se atribuye al asesor (JP)", () => {
    const f = factura({ telefonos: "0978801800", fecha: "08/09/2026", total: 307.67, lineas: [["KENDA 195/55R15 85V - KR20 TL", 4, 66]] });
    const { ventas } = cruzar([f], [conv({ phone: "593978801800", mensajesBot: 13, mensajesAsesor: 29 })]);
    expect(ventas[0].atendio).toBe("asesor");
  });

  it("si el asesor solo ayudó, sigue siendo del bot (Felipe Reascos: 16 del bot, 5 del asesor)", () => {
    const f = factura({ telefonos: "0991996929", fecha: "23/09/2026", total: 1418.67, lineas: [["LT265/70R17 121/118R WILDPEAK R/T01", 4, 411.21]] });
    const { ventas } = cruzar([f], [conv({ phone: "593991996929", cotizaciones: 0, mensajesBot: 16, mensajesAsesor: 5 })]);
    expect(ventas[0].atendio).toBe("bot");
  });

  it("reconoce la medida en los formatos de Contífico", () => {
    for (const nombre of ["LT265/70R17 123S WILDPEAK A/T 4W", "KENDA P215/75R15 100S - KR28 TL", "255/50ZR19 XL", "31X10.50R15 MT"]) {
      const f = factura({ telefonos: "0990000000", fecha: "20/09/2026", total: 400, lineas: [[nombre, 4, 100]] });
      expect(cruzar([f], [conv({ phone: "593990000000" })]).ventas, nombre).toHaveLength(1);
    }
  });
});
