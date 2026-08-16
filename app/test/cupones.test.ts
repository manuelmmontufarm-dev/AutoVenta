import { describe, expect, it } from "vitest";

import {
  esCodigoCupon,
  extraerCupones,
  formatearPorcentaje,
  generarCodigoCupon,
  mensajeCupon,
  normalizarCodigoCupon,
  PALABRAS_CUPON,
  recordatorioCupon,
} from "../src/domain/coupons.js";

/**
 * El cupón es lo único que va a atar una factura de Contífico a un chat del
 * bot: el cajero teclea el código en la descripción y nosotros lo leemos de
 * ahí. Todo lo que se prueba aquí sale de esa realidad — un mostrador con cola,
 * un código dictado en voz alta y un campo de texto libre donde el cajero
 * escribe lo que quiere.
 */
describe("forma del código", () => {
  it("es prefijo + palabra de la lista + dos dígitos", () => {
    for (let i = 0; i < 200; i += 1) {
      const codigo = generarCodigoCupon();
      expect(codigo).toMatch(/^DT-[A-Z]+\d{2}$/);
      expect(esCodigoCupon(codigo)).toBe(true);
    }
  });

  it("con azar fijo el código es reproducible", () => {
    expect(generarCodigoCupon(() => 0)).toBe(`DT-${PALABRAS_CUPON[0]}00`);
  });

  it("las palabras se escriben de un tirón: sin tildes, sin ñ y cortas", () => {
    for (const palabra of PALABRAS_CUPON) {
      expect(palabra).toMatch(/^[A-Z]{3,6}$/);
    }
  });

  it("no hay palabras repetidas (dos iguales achican el surtido en silencio)", () => {
    expect(new Set(PALABRAS_CUPON).size).toBe(PALABRAS_CUPON.length);
  });
});

describe("leer lo que teclea el cajero", () => {
  it("acepta las formas en que se dicta y se escribe", () => {
    for (const escrito of ["DT-PUMA47", "dt puma 47", "DTPUMA47", "puma47", "  Dt-Puma-47  "]) {
      expect(normalizarCodigoCupon(escrito)).toBe("DT-PUMA47");
    }
  });

  it("perdona la tilde que mete el corrector del teléfono", () => {
    expect(normalizarCodigoCupon("PUMÁ47")).toBe("DT-PUMA47");
  });

  // Adivinar una palabra a partir de un dedazo puede dar el cupón de OTRO
  // cliente: el descuento se lo lleva quien no era y la venta queda atribuida
  // al chat equivocado. Preferimos que en caja relean el papel.
  it("no adivina: una palabra que no está en la lista no es cupón", () => {
    for (const invalido of ["DT-PERRO47", "DT-PUM47", "DT-PUMA4", "DT-PUMA477", "DT-XKQZ13", ""]) {
      expect(normalizarCodigoCupon(invalido)).toBeNull();
    }
  });
});

describe("barrer las descripciones de las facturas", () => {
  it("encuentra el código en medio del texto que escribió el cajero", () => {
    const descripcion = "VENTA 4 LLANTAS 205/55R16 - cupon dt puma 47 aplicado 2% - cliente Juan";
    expect(extraerCupones(descripcion)).toEqual(["DT-PUMA47"]);
  });

  it("encuentra varios y no repite", () => {
    expect(extraerCupones("DT-TIGRE05 y tambien DT-RAYO88, DT-TIGRE05")).toEqual(
      ["DT-TIGRE05", "DT-RAYO88"],
    );
  });

  it("no inventa cupones donde no los hay", () => {
    for (const texto of ["FACTURA 001-002-000123456", "RUC 1792146739001", "descuento 10%", ""]) {
      expect(extraerCupones(texto)).toEqual([]);
    }
  });
});

describe("el mensaje al cliente", () => {
  const mensaje = mensajeCupon({ codigo: "DT-PUMA47", porcentaje: 2, numeroCotizacion: "COT-MSUX5R4W" });

  it("pone el código donde se ve y nombra la cotización", () => {
    expect(mensaje).toContain("*DT-PUMA47*");
    expect(mensaje).toContain("COT-MSUX5R4W");
  });

  // Lo que pidió Andrés el 15-ago: si el cliente cree que el descuento es
  // automático, no lo pide, y sin que lo pida la venta queda sin atribuir.
  it("avisa que SIN el código se pierde el descuento", () => {
    expect(mensaje).toMatch(/si no lo presenta/i);
    expect(mensaje).toMatch(/antes de pagar/i);
    expect(mensaje).toContain("2 %");
  });

  it("el recordatorio corto también dice qué se pierde", () => {
    const corto = recordatorioCupon({ codigo: "DT-RAYO88", porcentaje: 2 });
    expect(corto).toContain("DT-RAYO88");
    expect(corto).toMatch(/sin ese c[oó]digo/i);
  });

  it("funciona sin número de cotización (prometió visita antes de cotizar)", () => {
    expect(mensajeCupon({ codigo: "DT-LOBO10", porcentaje: 2 })).toContain("su cotización");
  });
});

describe("porcentaje", () => {
  it("sin decimales inútiles y con coma ecuatoriana", () => {
    expect(formatearPorcentaje(2)).toBe("2 %");
    expect(formatearPorcentaje(2.5)).toBe("2,5 %");
  });
});
