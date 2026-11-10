/**
 * Revisión ronda 4 del sprint 5 — `sinElLocalLejano` solo toca el MAPA y la
 * oración que PROPONE la visita al local lejano. Nunca una dirección, un
 * horario, una oración que nombre dos locales, ni nada si el perfil no tiene
 * otro local. Y el local lejano se lee con su nombre (`comoLoNombran`), no con
 * el patrón suelto «quito» / «el sur».
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_medida_falsa";

const { localesQueLeQuedanLejos, sinElLocalLejano } = await import("../src/domain/localLejano.js");
const { borradorNiegaElStock } = await import("../src/services/alternativaDelCatalogo.js");

const aplicar = (cliente: string, texto: string) => sinElLocalLejano(texto, localesQueLeQuedanLejos(cliente)).texto;

describe("bloqueante · solo el mapa y la propuesta de visita", () => {
  it("SANO: la dirección de cada local no se cambia («Quito Sur me queda lejos»)", () => {
    const texto = "Quito Sur está en Galo Molina y Alonso de Angulo. Cumbayá está en La del Establo.";
    expect(aplicar("Quito Sur me queda lejos", texto)).toBe(texto);
  });

  it("SANO: el horario de cada local no se cambia", () => {
    const texto = "El de Quito Sur abre de 8:30 a 17:00; el de Cumbayá de 8:00 a 18:00.";
    expect(aplicar("Quito Sur me queda lejos", texto)).toBe(texto);
  });

  it("SANO: «Nuestros locales están en Quito: *Cumbayá* y *Quito Sur*» no se toca, y «Quito me queda lejos» no es Quito Sur", () => {
    const texto = "Nuestros locales están en Quito: *Cumbayá* y *Quito Sur*. Por ahora no tenemos local fuera de Quito.\n📍 *Depot Tire Quito Sur*: https://maps.app.goo.gl/NQeNN8csyAnRkJDJ7";
    expect(localesQueLeQuedanLejos("Quito me queda lejos")).toEqual([]);
    expect(localesQueLeQuedanLejos("el sur me queda lejos")).toEqual([]);
    expect(aplicar("Quito me queda lejos", texto)).toBe(texto);
    expect(aplicar("Quito Sur me queda lejos", "Nuestros locales están en Quito: *Cumbayá* y *Quito Sur*.")).toBe("Nuestros locales están en Quito: *Cumbayá* y *Quito Sur*.");
  });

  it("sigue: el mapa y la pregunta del día del local lejano pasan al otro (con y sin tilde)", () => {
    const texto = "📍 *Depot Tire Cumbayá*: https://maps.app.goo.gl/QnMBPXKc1o8igbsp8\n\n---\n\n¿Qué día cree que puede pasar por *Cumbayá*? 📅";
    for (const cliente of ["Cumbayá me queda lejos", "cumbaya me queda lejos"]) {
      const salida = aplicar(cliente, texto);
      expect(salida).not.toMatch(/Cumbay/);
      expect(salida).toContain("📍 *Depot Tire Quito Sur*: https://maps.app.goo.gl/NQeNN8csyAnRkJDJ7");
      expect(salida).toContain("¿Qué día cree que puede pasar por *Quito Sur*?");
    }
  });

  it("sin otro local en el perfil no se toca nada", () => {
    const texto = "¿Qué día cree que puede pasar por *Cumbayá*? 📅";
    expect(sinElLocalLejano(texto, localesQueLeQuedanLejos("Cumbayá me queda lejos").concat(localesQueLeQuedanLejos("Quito Sur me queda lejos"))).texto).toBe(texto);
  });
});

describe("menor 2 · «el borrador niega el stock» exige el objeto", () => {
  it.each([
    "No hay problema, le espero el sábado en Cumbayá",
    "No tengo ese dato a mano",
    "No tengo confirmado el horario del domingo",
    "Nuestros locales están en Quito: *Cumbayá* y *Quito Sur*. Por ahora no tenemos local fuera de Quito.",
  ])("«%s» → false", (t) => { expect(borradorNiegaElStock(t)).toBe(false); });

  it.each([
    "Tengo la medida 33x12.5 rin 15, pero no pude validar el stock en este momento con el catálogo.",
    "No tengo stock en esa medida",
    "En 33X12.5R15 no tengo la Falken",
    "no me aparece disponibilidad para 4",
  ])("«%s» → true", (t) => { expect(borradorNiegaElStock(t)).toBe(true); });
});
