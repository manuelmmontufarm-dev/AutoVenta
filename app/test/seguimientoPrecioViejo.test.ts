/**
 * Simulador Competimotor, 20-nov-2026, caso s12 de seguimientos (3 vueltas):
 * cotización del jueves 4 × KENDA KR203 a $104,65 ($418,60); el Excel del
 * viernes 8 am la deja a $112,99 con 2 en stock. El seguimiento de la 1 pm:
 *
 *  - r3: «…su cotización por *4 KENDA KR203 195/65R15* — *$418.60 total*.»
 *        → repetía el precio que ya no existe.
 *  - r2 y r3: «…\n\n---\n\n¿Le muestro las opciones…?» → el «---» separa
 *        mensajes en el turno normal, pero el seguimiento sale en UNO solo y el
 *        cliente leía la raya.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { montosViejosDeLaCotizacion, sinMontosViejos } = await import("../src/domain/precioViejo.js");
const { unSoloMensaje, pasosPara } = await import("../src/services/prepararSalida.js");

const COTIZACION_DEL_JUEVES = {
  total: "418.60",
  subtotal: "364.00",
  items: [{ code: "A0224", quantity: 4, salePriceWithTax: 104.65, segundaLlanta: null }],
};

const SALIO_EL_VIERNES =
  "🛞 Solo quería saber si desea revisar alguna duda sobre su cotización por *4 KENDA KR203 195/65R15* — *$418.60 total*.\n\n"
  + "---\n\n"
  + "¿Le muestro las opciones que tengo en 195/65R15?\n\n"
  + "⚠️ Recuerde que de esa llanta hoy hay *2* y la cotización es por *4*: el resto se lo confirma el asesor en el local.";

describe("el seguimiento no repite el precio que el Excel ya cambió (s12)", () => {
  const viernes = (codigo: string) => (codigo === "A0224" ? [112.99, 112.99] : null);
  const jueves = (codigo: string) => (codigo === "A0224" ? [104.65, 104.65] : null);

  it("con el precio cambiado, el total, la línea y el unitario de la cotización quedan viejos", () => {
    const viejos = montosViejosDeLaCotizacion(COTIZACION_DEL_JUEVES, viernes);
    expect(viejos.sort((a, b) => a - b)).toEqual([10465, 36400, 41860]);
  });

  it("si el precio no cambió, nada es viejo", () => {
    expect(montosViejosDeLaCotizacion(COTIZACION_DEL_JUEVES, jueves)).toEqual([]);
  });

  it("la línea con promo de la 2.ª llanta no se compara (se firma a lista)", () => {
    const conPromo = { ...COTIZACION_DEL_JUEVES, items: [{ ...COTIZACION_DEL_JUEVES.items[0], segundaLlanta: { unidades: 2 } }] };
    expect(montosViejosDeLaCotizacion(conPromo, viernes)).toEqual([]);
  });

  it("el producto que ya no está en el catálogo no se juzga", () => {
    expect(montosViejosDeLaCotizacion(COTIZACION_DEL_JUEVES, () => null)).toEqual([]);
  });

  it("el mensaje del viernes sale sin el $418.60 y con todo lo demás", () => {
    const viejos = montosViejosDeLaCotizacion(COTIZACION_DEL_JUEVES, viernes);
    const { texto, quitados } = sinMontosViejos(SALIO_EL_VIERNES, viejos);
    expect(quitados).toEqual(["$418.60"]);
    expect(texto).not.toMatch(/418/);
    expect(texto).toContain("su cotización por *4 KENDA KR203 195/65R15*.");
    expect(texto).toContain("hoy hay *2*");
  });

  it("quita el monto con su conector en las formas que usa el bot", () => {
    const viejos = [10465, 41860];
    expect(sinMontosViejos("Su cotización de $418.60 sigue vigente 😊", viejos).texto)
      .toBe("Su cotización sigue vigente 😊");
    expect(sinMontosViejos("La *KENDA KR203* — *$104.65 c/u con IVA* 👍", viejos).texto)
      .toBe("La *KENDA KR203* 👍");
    expect(sinMontosViejos("Cotización por un total de $418,60.", viejos).texto)
      .toBe("Cotización.");
  });

  it("un monto que no es de la cotización vieja no se toca", () => {
    const texto = "La *CONTINENTAL* queda en *$100.86 c/u*.";
    expect(sinMontosViejos(texto, [10465, 41860])).toEqual({ texto, quitados: [] });
  });

  it("no borra las rayas ni los emojis que no tocó", () => {
    const texto = "Hola $418.60\n---\n😊";
    expect(sinMontosViejos(texto, [41860]).texto).toBe("Hola\n---\n😊");
  });
});

describe("un seguimiento es un solo mensaje: sin «---» a la vista (s12)", () => {
  it("los bloques del turno pasan a ser párrafos", () => {
    const salida = unSoloMensaje(SALIO_EL_VIERNES);
    expect(salida).not.toMatch(/^\s*-{3,}\s*$/m);
    expect(salida).toContain("195/65R15* — *$418.60 total*.\n\n¿Le muestro las opciones");
  });

  it("también el separador pegado (\\n---\\n) y el que queda al borde", () => {
    expect(unSoloMensaje("---\nUno\n---\nDos\n---")).toBe("Uno\n\nDos");
  });

  it("un texto sin separador sale igual", () => {
    const texto = "📄 ¿Qué le pareció la cotización 195/65R15?\n📍 *Competimotor*: https://maps.app.goo.gl/x";
    expect(unSoloMensaje(texto)).toBe(texto);
  });

  it("los dos pasos corren solo en el seguimiento y son los últimos", () => {
    const seguimiento = pasosPara("seguimiento").map((p) => p.nombre);
    expect(seguimiento.slice(-2)).toEqual(["sin_precio_viejo_de_la_cotizacion", "seguimiento_en_un_solo_mensaje"]);
    for (const tipo of ["respuesta", "retomada", "plantilla"] as const) {
      const nombres = pasosPara(tipo).map((p) => p.nombre);
      expect(nombres, tipo).not.toContain("sin_precio_viejo_de_la_cotizacion");
      expect(nombres, tipo).not.toContain("seguimiento_en_un_solo_mensaje");
    }
  });
});
