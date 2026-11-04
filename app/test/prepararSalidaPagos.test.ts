/**
 * FIJACIÓN DE DEPOT + POLÍTICA POR CLIENTE en los pasos de pago de la salida.
 *
 * Primera mitad (fijación): la salida de HOY de Depot, byte a byte, escrita
 * ANTES de mover la política de pagos a `negocio/politicas/depot.ts`. Si una
 * de estas pruebas se rompe, el contrato con Depot cambió.
 *
 * Segunda mitad (Sprint 4, R-12/R-13): con una política sin formas de pago,
 * los pasos `sin_descuento_negado` y `el_pago_se_responde` devuelven el texto
 * sin tocar (sin `---` colgando) y el beneficio de redes en null no se
 * menciona en ninguna salida.
 */
import { describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { politicaDePagos } = await import("../src/domain/datosDelNegocio.js");
const { BENEFICIO_DE_REDES } = await import("../src/domain/beneficioDeRedes.js");
const { PASOS } = await import("../src/services/prepararSalida.js");
const { hechoDePagos } = await import("../src/services/guardian.js");

const paso = (nombre: string) => PASOS.find((p) => p.nombre === nombre)!;
const ctx = (textoDelCliente: string | null) =>
  ({ conversation: { id: 1, current_cycle: 1 }, tipo: "respuesta", textoDelCliente }) as never;

// La política de pagos de Depot, TAL CUAL salía el 4-nov-2026 (dc50dab).
const PAGOS_DEPOT =
  "Con tarjeta *no* es más caro: no sube, es el mismo precio y se puede diferir a 3 y 6 meses "
  + "sin intereses. Si paga en efectivo sí hay un descuento, que se lo confirman en el local. "
  + "También se acepta transferencia.";

// El beneficio de redes de Depot, tal cual lo redactó Joaquín el 10-sep-2026.
const BENEFICIO_DEPOT =
  "🎁 Y tiene un beneficio adicional por venir de nuestras redes sociales: además de los servicios "
  + "incluidos en la instalación de sus llantas, le obsequiamos una alineación + rotación "
  + "completamente GRATIS a los 10.000 km.\n\n"
  + "Cuando venga a realizar su compra, recuerde mencionar este beneficio a su asesor para que "
  + "pueda registrarlo. 🚗✅";

describe("fijación de Depot: la política de pagos sale byte a byte como hoy", () => {
  it("politicaDePagos() es la frase canónica de Depot", () => {
    expect(politicaDePagos()).toBe(PAGOS_DEPOT);
  });

  it("el beneficio de redes es el texto de Joaquín, byte a byte", () => {
    expect(BENEFICIO_DE_REDES).toBe(BENEFICIO_DEPOT);
  });

  it("hechoDePagos lleva la política canónica al guardián", () => {
    expect(hechoDePagos()).toBe(
      `Formas de pago (política del negocio, el bot PUEDE afirmarlo y no debe mandarlo al asesor): ${PAGOS_DEPOT} `
      + "Que en efectivo hay un descuento es CIERTO: NO lo borres, NO digas que el precio es el mismo en efectivo ni que no hay descuento, "
      + "y NO agregues una cifra (el monto lo confirman en el local).",
    );
  });

  it("el_pago_se_responde: la evasiva se reemplaza por la política entera", async () => {
    const salida = (await paso("el_pago_se_responde").aplicar(
      "No puedo confirmar recargos de tarjeta por este medio.",
      ctx("¿si pago con tarjeta sube el valor?"),
    ))!;
    expect(salida).toBe(PAGOS_DEPOT);
  });

  it("el_pago_se_responde: conserva el resto del turno detrás de '---'", async () => {
    const salida = (await paso("el_pago_se_responde").aplicar(
      "Los recargos de tarjeta no los puedo confirmar.\n---\n¿A cuál local le queda mejor ir?",
      ctx("¿aceptan tarjeta?"),
    ))!;
    expect(salida).toBe(`${PAGOS_DEPOT}\n---\n¿A cuál local le queda mejor ir?`);
  });

  it("sin_descuento_negado: la negación inventada se reemplaza por la política", async () => {
    const salida = (await paso("sin_descuento_negado").aplicar(
      "No hay descuento adicional por efectivo.",
      ctx("ok"),
    ))!;
    expect(salida).toBe(PAGOS_DEPOT);
  });

  it("el_beneficio_se_responde: la pregunta por beneficios trae el texto de Joaquín", async () => {
    const salida = (await paso("el_beneficio_se_responde").aplicar(
      "¿Le ayudo con algo más?",
      ctx("¿tienen alguna promoción por redes sociales?"),
    ))!;
    expect(salida).toBe(`${BENEFICIO_DEPOT}\n---\n¿Le ayudo con algo más?`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Segunda mitad: los mismos pasos con otra política (R-12, R-13).
// ─────────────────────────────────────────────────────────────────────────────

async function pasosCon(cambios: Partial<import("../src/negocio/politica.js").PoliticaComercial>) {
  vi.resetModules();
  vi.doMock("../src/negocio/politica.js", async (original) => {
    const real = await original<typeof import("../src/negocio/politica.js")>();
    return { ...real, politica: { ...real.politica, ...cambios } };
  });
  const { PASOS: pasos } = await import("../src/services/prepararSalida.js");
  const { hechoDePagos: hecho } = await import("../src/services/guardian.js");
  vi.doUnmock("../src/negocio/politica.js");
  return { paso: (nombre: string) => pasos.find((p) => p.nombre === nombre)!, hecho };
}

describe("sin formas de pago en la política, los pasos de pago no tocan el texto", () => {
  const sinPagos = { formasDePago: [], cuotasSinIntereses: null, descuentoEnEfectivo: null };

  it("el_pago_se_responde devuelve el borrador intacto, sin «---» colgando", async () => {
    const { paso } = await pasosCon(sinPagos);
    const borrador = "No puedo confirmar recargos de tarjeta por este medio.\n---\n¿A cuál local le queda mejor ir?";
    expect(await paso("el_pago_se_responde").aplicar(borrador, ctx("¿con tarjeta sube?"))).toBe(borrador);
  });

  it("sin_descuento_negado no inyecta ninguna política", async () => {
    const { paso } = await pasosCon(sinPagos);
    expect(await paso("sin_descuento_negado").aplicar("No hay descuento en efectivo.", ctx("ok"))).toBe("No hay descuento en efectivo.");
  });

  it("el guardián no recibe formas de pago como hecho y tacha las que se prometan", async () => {
    const { hecho } = await pasosCon(sinPagos);
    expect(hecho()).not.toMatch(/sin intereses|no sube|hay un descuento/);
    expect(hecho()).toMatch(/NO están confirmadas/);
  });
});

describe("con formas de pago pero sin descuento ni cuotas", () => {
  const soloFormas = { formasDePago: ["efectivo", "transferencia"], cuotasSinIntereses: null, descuentoEnEfectivo: null };

  it("el candado del descuento negado se apaga", async () => {
    const { paso } = await pasosCon(soloFormas);
    expect(await paso("sin_descuento_negado").aplicar("No hay descuento en efectivo.", ctx("ok"))).toBe("No hay descuento en efectivo.");
  });

  it("una evasiva se reemplaza por las formas de pago, sin prometer cuotas", async () => {
    const { paso } = await pasosCon(soloFormas);
    const salida = (await paso("el_pago_se_responde").aplicar("Eso se lo confirma el asesor.", ctx("¿cómo puedo pagar?")))!;
    expect(salida.startsWith("Se acepta efectivo y transferencia.\n---\n")).toBe(true);
    expect(salida).not.toMatch(/meses|sin intereses|no sube|descuento/i);
  });
});

describe("sin beneficio de redes en la política", () => {
  it("el_beneficio_se_responde no lo menciona", async () => {
    const { paso } = await pasosCon({ beneficioDeRedes: null });
    const borrador = "¿Le ayudo con algo más?";
    expect(await paso("el_beneficio_se_responde").aplicar(borrador, ctx("¿tienen alguna promoción por redes sociales?"))).toBe(borrador);
  });
});
