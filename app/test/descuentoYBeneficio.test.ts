/**
 * Pruebas de Manuel, 12-sep 21:42 y 21:45 (conv 3), con los textos reales.
 *
 * 21:42 · 4 × WINRUN R330 a $58.25 (antes $77.66).
 *   CLIENTE: «La promoción del 25% q son 58 menos»
 *   BOT:     «Así es: su cotización ya trae el 25 % de descuento, $77.64 menos…
 *             Sí, esa es la idea: el precio ya le quedó en $58.25 c/u…»
 *   $58.25 es el precio por llanta; el descuento es $19.41 por llanta y $77.64
 *   en las cuatro. El bot confirmó una cifra que no es el descuento y dio solo
 *   el total, que además se parece al precio de antes ($77.66).
 *
 * 21:45 · «¿Tienen algún beneficio o promoción?» → el beneficio de redes y,
 *   detrás, «Sí. Con la compra se incluye instalación, alineación y balanceo…».
 */
import { describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const estado = vi.hoisted(() => ({ ahorro: null as unknown }));
vi.mock("../src/services/ahorroVigente.js", () => ({ ahorroVigente: async () => estado.ahorro }));

const { ahorroDeLaCotizacion, respuestaDelDescuento } = await import("../src/domain/ahorro.js");
const { BENEFICIO_DE_REDES } = await import("../src/domain/beneficioDeRedes.js");
const { sinFrasesDelTema } = await import("../src/domain/respuestaDelTema.js");
const { PASOS } = await import("../src/services/prepararSalida.js");

const bloques = (t: string) => t.split(/\n\s*-{3,}\s*\n/).map((b) => b.trim());
const R330 = ahorroDeLaCotizacion([{ quantity: 4, listPriceWithTax: 77.66, salePriceWithTax: 58.25 }])!;
const KR203 = ahorroDeLaCotizacion([{ quantity: 4, listPriceWithTax: 114.47, salePriceWithTax: 85.85 }])!;
const paso = (nombre: string) => PASOS.find((p) => p.nombre === nombre)!;
const ctx = (textoDelCliente: string) =>
  ({ conversation: { id: 1, current_cycle: 1 }, tipo: "respuesta", textoDelCliente }) as never;

describe("el descuento: la cifra del cliente se compara con la cotización (21:42)", () => {
  it("58 es el precio por llanta, no el descuento: se aclara y no se confirma", () => {
    const r = respuestaDelDescuento(R330, "La promoción del 25% q son 58 menos");
    expect(r).not.toMatch(/así es/i);
    expect(r).toMatch(/\$58\.25\*? es el precio por llanta/);
    expect(r).toMatch(/\$77\.66/);
    expect(r).toMatch(/\$19\.41\*? por llanta/);
    expect(r).toMatch(/\$77\.64\*? en las 4 llantas/);
  });

  it("si dice el ahorro de verdad, se confirma", () => {
    expect(respuestaDelDescuento(R330, "La promoción del 25% q son 77.64 menos")).toMatch(/^Así es/);
    expect(respuestaDelDescuento(R330, "son 19.41 menos por llanta")).toMatch(/^Así es/);
  });

  it("el total a pagar tampoco es el descuento", () => {
    expect(respuestaDelDescuento(R330, "con el descuento queda en 233")).toMatch(/\$233\.00\*? es el total/);
  });

  it("otra cifra cualquiera se aclara (caso 1: 103$.64 sobre la KR203)", () => {
    const r = respuestaDelDescuento(KR203, "La promoción del 25% q son 103$.64 menos");
    expect(r).not.toMatch(/así es/i);
    expect(r).toMatch(/\$28\.62/);
    expect(r).toMatch(/\$114\.48/);
  });

  it("otro porcentaje también se aclara", () => {
    const r = respuestaDelDescuento(R330, "me dijeron que era el 30% de descuento");
    expect(r).not.toMatch(/así es/i);
    expect(r).toMatch(/25 %/);
  });

  it("sin cifras, solo la respuesta", () => {
    const r = respuestaDelDescuento(R330, "¿el descuento ya está incluido?");
    expect(r).not.toMatch(/así es|le aclaro/i);
    expect(r).toMatch(/25 %/);
    expect(r).toMatch(/descontado/);
  });

  it("con una sola llanta no dice «por llanta»", () => {
    const una = ahorroDeLaCotizacion([{ quantity: 1, listPriceWithTax: 77.66, salePriceWithTax: 58.25 }])!;
    expect(respuestaDelDescuento(una, "¿el descuento ya está incluido?")).not.toMatch(/por llanta/);
  });

  it("el paso quita la confirmación del modelo y deja la pregunta de cierre", async () => {
    estado.ahorro = R330;
    const salida = await paso("el_descuento_se_responde").aplicar(
      "Sí, esa es la idea: el precio ya le quedó en $58.25 c/u con IVA para la WINRUN R330.\n---\n¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍",
      ctx("La promoción del 25% q son 58 menos"),
    );
    expect(salida).not.toMatch(/esa es la idea|así es/i);
    const bs = bloques(salida!);
    expect(bs).toHaveLength(2);
    expect(bs[1]).toBe("¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍");
  });

  it("sin cotización no toca nada", async () => {
    estado.ahorro = null;
    const t = "Sí, esa es la idea.";
    expect(await paso("el_descuento_se_responde").aplicar(t, ctx("La promoción del 25% q son 58 menos"))).toBe(t);
  });
});

describe("el beneficio reemplaza lo que el modelo dijo de lo incluido (21:45)", () => {
  // corrected_text del Guardián, 20:45:55 hora de Quito.
  const DEL_GUARDIAN = "Sí. Con la compra se incluye instalación, alineación y balanceo, seguro gratuito contra golpes/cortes/daños de la llanta, mantenimiento gratis cada 10.000 km y revisión gratuita del vehículo.\n\n---\n¿Qué prioriza usted?\n\n1) *Costo* — la más conveniente de precio\n2) *Equilibrio* — la que mejor balancea precio y rendimiento\n3) *Premium* — la de máxima calidad y durabilidad";

  it("sale el beneficio y el menú, sin el párrafo repetido", async () => {
    const salida = await paso("el_beneficio_se_responde").aplicar(DEL_GUARDIAN, ctx("¿Tienen algún beneficio o promoción?"));
    const bs = bloques(salida!);
    expect(bs[0]).toBe(BENEFICIO_DE_REDES);
    expect(salida).not.toMatch(/Con la compra se incluye/);
    expect(bs).toHaveLength(2);
    expect(bs[1]).toMatch(/1\) \*Costo\* — la más conveniente de precio/);
  });

  it("lo que no habla de beneficios se queda", async () => {
    const t = "La *KENDA KR20* es la de equilibrio.\n---\n¿Qué prioriza usted?";
    const salida = await paso("el_beneficio_se_responde").aplicar(t, ctx("¿Tienen algún beneficio o promoción?"));
    expect(bloques(salida!)).toEqual([BENEFICIO_DE_REDES, "La *KENDA KR20* es la de equilibrio.", "¿Qué prioriza usted?"]);
  });
});

describe("sinFrasesDelTema", () => {
  const deLlantas = (f: string) => /llanta/i.test(f);

  it("una pregunta del tema se queda: suele ser el cierre", () => {
    const t = "Tengo esa llanta.\n---\n¿Le cotizo la llanta?";
    expect(sinFrasesDelTema(t, deLlantas).texto).toBe("¿Le cotizo la llanta?");
  });

  it("las líneas del menú numerado no se tocan", () => {
    const t = "¿Qué prioriza?\n1) *Costo* — la llanta más barata";
    expect(sinFrasesDelTema(t, deLlantas)).toEqual({ texto: t, quitadas: [] });
  });

  it("un «Sí.» suelto sale solo si se le quitó su frase", () => {
    expect(sinFrasesDelTema("Sí. La llanta viene con garantía.", deLlantas).texto).toBe("");
    expect(sinFrasesDelTema("Sí.\n---\n¿Algo más?", deLlantas).texto).toBe("Sí.\n---\n¿Algo más?");
  });
});
