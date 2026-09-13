/**
 * Pruebas del 12-sep (Manuel en producción, conv 3): la forma del turno, el
 * beneficio de redes, el pago y el descuento. Cada caso es un mensaje real.
 */
import { describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { conPreguntaEnSuPropioMensaje } = await import("../src/domain/preguntaSola.js");
const { sinFraseColgando } = await import("../src/domain/fraseColgando.js");
const { soloQuitaOReordena } = await import("../src/domain/soloQuita.js");
const { estructurarTurno } = await import("../src/domain/estructuraDelTurno.js");
const { BENEFICIO_DE_REDES, preguntaPorBeneficios } = await import("../src/domain/beneficioDeRedes.js");
const { politicaDePagos, respondeElPago, sinPagoSinRespuesta } = await import("../src/domain/datosDelNegocio.js");
const { hablaDelDescuento, respondeElDescuento, respuestaDelDescuento } = await import("../src/domain/ahorro.js");
const { PASOS, correrPasos } = await import("../src/services/prepararSalida.js");

const bloques = (t: string) => t.split(/\n\s*-{3,}\s*\n/).map((b) => b.trim());

describe("la pregunta viaja con la frase que desemboca en ella", () => {
  // Guardián, 17:29:09: el separador partió la oración y el calco borró la pregunta.
  const DEL_GUARDIAN = "Perfecto. Para dejarle todo claro antes de su visita del lunes, ¿le queda mejor *Cumbayá* o *Quito Sur*?";

  it("parte en el punto, no en la coma", () => {
    expect(bloques(conPreguntaEnSuPropioMensaje(DEL_GUARDIAN).texto)).toEqual([
      "Perfecto.",
      "Para dejarle todo claro antes de su visita del lunes, ¿le queda mejor *Cumbayá* o *Quito Sur*?",
    ]);
  });

  it("si toda la frase desemboca en la pregunta, no se parte", () => {
    const t = "Para dejarle todo claro, ¿le queda mejor *Cumbayá* o *Quito Sur*?";
    expect(conPreguntaEnSuPropioMensaje(t)).toEqual({ texto: t, separada: false });
  });

  it("lo de siempre sigue igual", () => {
    expect(bloques(conPreguntaEnSuPropioMensaje("Listo. ¿A cuál local le queda mejor ir? 📍").texto))
      .toEqual(["Listo.", "¿A cuál local le queda mejor ir? 📍"]);
  });
});

describe("ningún mensaje sale cortado con su coma", () => {
  it("recorta hasta la última frase completa", () => {
    expect(sinFraseColgando("Perfecto. Para dejarle todo claro antes de su visita del lunes,").texto).toBe("Perfecto.");
  });

  it("si no queda nada, el bloque no sale", () => {
    expect(sinFraseColgando("Opciones enviadas\n---\nPara dejarle todo claro,").texto).toBe("Opciones enviadas");
    expect(sinFraseColgando("Le dejo las ubicaciones:").texto).toBeNull();
  });

  it("no toca un turno que termina bien", () => {
    const t = "Listo.\n---\n¿Le queda mejor *Cumbayá* o *Quito Sur*?";
    expect(sinFraseColgando(t)).toEqual({ texto: t, recortado: null });
  });
});

describe("después de separar la pregunta, solo se quita o se reordena", () => {
  const TURNO = "La opción de costo es la *KENDA KR203*.\n---\n¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍";

  it("quitar y reordenar pasan", () => {
    expect(soloQuitaOReordena(TURNO, "¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍")).toBe(true);
    expect(soloQuitaOReordena(TURNO, "¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍\n---\nLa opción de costo es la *KENDA KR203*.")).toBe(true);
  });

  it("agregar el beneficio detrás de la pregunta no pasa (producción, 17:16)", () => {
    expect(soloQuitaOReordena(TURNO, `${TURNO}\n---\n${BENEFICIO_DE_REDES}`)).toBe(false);
  });

  it("la forma del turno cumple la regla", () => {
    const crudo = "Le dejo la cotización 👍\n📍 *Depot Tire Cumbayá*: https://maps.app.goo.gl/x\n---\n¿Qué día cree que puede pasar? 📅";
    expect(soloQuitaOReordena(crudo, estructurarTurno(crudo).texto)).toBe(true);
  });

  it("la cadena descarta el cambio de un paso que agrega después del separador", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ctx = { conversation: { id: 1, current_cycle: 1, stage: "nuevo" }, tipo: "respuesta" } as never;
    const salida = await correrPasos([
      { nombre: "pregunta_en_su_propio_mensaje", corre: ["respuesta"], aplicar: async (t: string) => t },
      { nombre: "agrega", corre: ["respuesta"], aplicar: async (t: string) => `${t}\n---\n${BENEFICIO_DE_REDES}` },
      { nombre: "quita", corre: ["respuesta"], aplicar: async (t: string) => bloques(t)[1] },
    ] as never, TURNO, ctx);
    expect(salida.texto).toBe("¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("el beneficio automático ya no está en la cadena, y lo último es la red de frases colgando", () => {
    const nombres = PASOS.map((p) => p.nombre);
    expect(nombres).not.toContain("beneficio_de_redes_tras_cotizar");
    expect(nombres[nombres.length - 1]).toBe("sin_frase_colgando");
  });
});

describe("el beneficio de redes, solo si lo piden (Manuel, 12-sep)", () => {
  it.each([
    "¿Tienen algún beneficio?",
    "hay alguna promoción?",
    "qué más me dan por la compra",
    "tienen promociones o regalos?",
  ])("«%s» lo pide", (t) => expect(preguntaPorBeneficios(t)).toBe(true));

  it.each([
    "La promoción del 25% q son 103$.64 menos",
    "205/55R16",
    "Si se realiza el pago con tarjeta cuanto sube el valor",
  ])("«%s» no lo pide", (t) => expect(preguntaPorBeneficios(t)).toBe(false));

  it("sale antes del turno, para que la pregunta siga siendo lo último", async () => {
    const paso = PASOS.find((p) => p.nombre === "el_beneficio_se_responde")!;
    const salida = await paso.aplicar("¿A cuál local le queda mejor ir?", {
      conversation: { id: 1, current_cycle: 1 }, tipo: "respuesta", textoDelCliente: "¿Tienen algún beneficio?",
    } as never);
    expect(bloques(salida!)).toEqual([BENEFICIO_DE_REDES, "¿A cuál local le queda mejor ir?"]);
  });
});

describe("el pago: la respuesta y nada que la contradiga", () => {
  // Borrador corregido por el Guardián, 17:32:55.
  const DEL_GUARDIAN = "Sobre el pago con tarjeta, no le puedo confirmar un recargo desde aquí; ese valor se valida directamente en el local según la forma de pago.\n\n---\n\nPara afinarle la recomendación, dígame una sola cosa: ¿qué prioriza usted?";

  it("quita la frase de pago que no responde", () => {
    const limpio = sinPagoSinRespuesta(DEL_GUARDIAN);
    expect(limpio).not.toMatch(/no le puedo confirmar/);
    expect(limpio).toMatch(/qué prioriza usted/);
  });

  it("conserva la política aunque hable de tarjeta y efectivo", () => {
    const t = `${politicaDePagos()}\n---\n¿A cuál local le queda mejor ir?`;
    expect(sinPagoSinRespuesta(t)).toBe(t);
  });

  it("el paso deja la política y ninguna evasiva", async () => {
    const paso = PASOS.find((p) => p.nombre === "el_pago_se_responde")!;
    const salida = await paso.aplicar(DEL_GUARDIAN, {
      conversation: { id: 1, current_cycle: 1 }, tipo: "respuesta",
      textoDelCliente: "Si se realiza el pago con tarjeta cuanto sube el valor",
    } as never);
    expect(respondeElPago(salida!)).toBe(true);
    expect(salida).not.toMatch(/no le puedo confirmar/);
  });
});

describe("el descuento se contesta (caso 1, 17:16)", () => {
  const AHORRO = { porcentaje: 25, monto: 114.48, cantidad: 4 };

  it("lo reconoce", () => {
    expect(hablaDelDescuento("La promoción del 25% q son 103$.64 menos")).toBe(true);
    expect(hablaDelDescuento("¿el descuento ya está incluido?")).toBe(true);
    expect(hablaDelDescuento("¿tienen alguna promoción?")).toBe(false);
    expect(hablaDelDescuento("205/55R16")).toBe(false);
  });

  it("la respuesta dice el porcentaje y que ya está descontado", () => {
    const r = respuestaDelDescuento(AHORRO);
    expect(r).toMatch(/25 %/);
    expect(r).toMatch(/\$114\.48/);
    expect(respondeElDescuento(r, AHORRO)).toBe(true);
    expect(respondeElDescuento("¿Qué día podría pasar?", AHORRO)).toBe(false);
  });
});
