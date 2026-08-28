/**
 * EL GUARDIÁN REVISA; NO ABRE UNA VENTA NUEVA CON EL CATÁLOGO.
 *
 * Dos correcciones reales del 27-ago-2026 mostraron la familia:
 * - conv 11986: el borrador no nombraba llantas ni precios y el guardián armó
 *   una vitrina nueva, incluida FALKEN WILDPEAK M/T a $282.10.
 * - conv 11972: el borrador decía correctamente que no había stock vendible y
 *   el guardián ofreció 1 KENDA KR20 a $82.42.
 *
 * La rúbrica previene; este candado determinístico corre DESPUÉS del guardián
 * y garantiza que una corrección no agregue esos hechos aunque la IA reincida.
 */
import { describe, expect, it } from "vitest";
import { frenarHechosNuevosDelGuardian } from "../src/domain/guardianNoVendeSolo.js";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const PRODUCTOS = [
  { code: "K-KR20", brand: "KENDA", design: "KR20" },
  { code: "F-WPMT", brand: "FALKEN", design: "WILDPEAK M/T" },
  { code: "F-WPAT4", brand: "FALKEN", design: "WILDPEAK A/T 4W" },
  { code: "W-MAXAT", brand: "WINRUN", design: "MAXCLAW A/T" },
];

const BORRADOR_11986 =
  "Para afinarle la recomendación sobre las opciones que le envié, dígame una sola cosa: ¿qué prioriza usted?\n\n" +
  "1) *Costo* — la más conveniente de precio\n" +
  "2) *Equilibrio* — la que mejor balancea precio y rendimiento\n" +
  "3) *Premium* — la de máxima calidad y durabilidad\n\n" +
  "Con eso le dejo la opción exacta para su medida.";

const CORRECCION_11986 =
  "En su medida *265/70R17*, para recomendarle bien, trabajaría solo con las opciones que tengo disponibles hoy:\n\n" +
  "1) *Costo* — *WINRUN MAXCLAW A/T* a *$157.39 c/u* con IVA\n" +
  "2) *Equilibrio* — *FALKEN WILDPEAK M/T* a *$282.10 c/u* con IVA\n" +
  "3) *Premium* — *FALKEN WILDPEAK A/T 4W* a *$296.55 c/u* con IVA\n\n" +
  "¿Qué prioriza usted: costo, equilibrio o premium?";

const BORRADOR_11972 =
  "En 195/55R15 no tengo stock disponible ahora mismo.\n" +
  "Puedo pedir que un asesor le confirme llegada o buscarle una medida equivalente del mismo aro, ¿cuál prefiere?";

const CORRECCION_11972 =
  "En *195/55R15* hoy tengo disponible *1 unidad KENDA KR20* a *$82.42 c/u con IVA*.\n" +
  "Para completar el juego, un asesor puede confirmarle llegada o conseguir el resto por pedido; " +
  "también puedo buscarle una medida equivalente del mismo aro si desea.";

describe("el guardián no vende por su cuenta", () => {
  it("la regla de no abrir ofertas manda sobre las reglas inferiores de stock", async () => {
    const { INSTRUCCIONES } = await import("../src/services/guardian.js");

    expect(INSTRUCCIONES).toContain("LA REGLA 0 MANDA SOBRE TODAS LAS DEMÁS");
    expect(INSTRUCCIONES).toContain(
      "el catálogo por sí solo NO autoriza a nombrar alternativas",
    );
  });

  it("conv 11986: frena la vitrina y los precios que no estaban en el borrador", () => {
    const salida = frenarHechosNuevosDelGuardian(BORRADOR_11986, CORRECCION_11986, PRODUCTOS);

    expect(salida.texto).toBe(BORRADOR_11986);
    expect(salida.bloqueado).toBe(true);
    expect(salida.motivos).toContain("precio_nuevo");
    expect(salida.motivos).toContain("producto_nuevo");
  });

  it("conv 11972: frena la oferta de una sola unidad y el precio agregado", () => {
    const salida = frenarHechosNuevosDelGuardian(BORRADOR_11972, CORRECCION_11972, PRODUCTOS);

    expect(salida.texto).toBe(BORRADOR_11972);
    expect(salida.bloqueado).toBe(true);
    expect(salida.motivos).toContain("precio_nuevo");
    expect(salida.motivos).toContain("producto_nuevo");
    expect(salida.motivos).toContain("juego_incompleto");
  });

  it("también frena 2 o 3 unidades aunque producto y precio ya estuvieran en el borrador", () => {
    for (const cantidad of [2, 3]) {
      const borrador = "La KENDA KR20 cuesta $82.42 c/u.";
      const correccion = `La KENDA KR20 cuesta $82.42 c/u y hoy puedo ofrecerle ${cantidad} unidades.`;
      const salida = frenarHechosNuevosDelGuardian(borrador, correccion, PRODUCTOS);

      expect(salida.texto).toBe(borrador);
      expect(salida.motivos).toContain("juego_incompleto");
    }
  });

  it("deja pasar una corrección que solo quita una opción agotada", () => {
    const borrador = "Le recomiendo la KENDA KR20 o la FALKEN WILDPEAK M/T. ¿Cuál prefiere?";
    const correccion = "Le recomiendo la KENDA KR20. ¿Desea que le cotice el juego?";

    expect(frenarHechosNuevosDelGuardian(borrador, correccion, PRODUCTOS)).toEqual({
      texto: correccion,
      bloqueado: false,
      motivos: [],
    });
  });

  it("deja corregir una cifra cuando el borrador ya estaba hablando de precio", () => {
    const borrador = "La KENDA KR20 cuesta $84.20 c/u.";
    const correccion = "La KENDA KR20 cuesta $82.42 c/u con IVA.";

    expect(frenarHechosNuevosDelGuardian(borrador, correccion, PRODUCTOS).bloqueado).toBe(false);
  });
});
