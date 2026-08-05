/**
 * Las reglas de calidad, probadas contra respuestas que DEBEN fallar.
 *
 * Sin esto, un evaluador que reporta "0 fallos" es indistinguible de un
 * evaluador roto. Cada regla necesita al menos un ejemplo que la dispare y
 * uno que no, o no hay forma de saber si está mirando.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — el evaluador es JS puro, sin tipos.
import { evaluarReglas, REGLAS_IDS } from "../scripts/eval/rubrica.mjs";

const SIN_NADA_AUTORIZADO = {
  etapa: "seleccionando",
  clienteDioMedida: true,
  turno: 2,
  tienePrecioAutorizado: false,
  tieneDescuentoAutorizado: false,
  tieneStock: false,
};

const ids = (respuesta: string, ctx = SIN_NADA_AUTORIZADO) =>
  evaluarReglas(respuesta, ctx).fallos.map((f: { id: string }) => f.id);

describe("Reglas de calidad comercial", () => {
  it("atrapa un precio inventado", () => {
    expect(ids("Te salen en $180 el juego, ¿te lo aparto?")).toContain("inventa_precio");
  });

  it("no marca precio cuando sí hay cotización autorizada", () => {
    expect(ids("Te salen en $180 el juego, ¿te lo aparto?", { ...SIN_NADA_AUTORIZADO, tienePrecioAutorizado: true }))
      .not.toContain("inventa_precio");
  });

  it("atrapa un descuento inventado", () => {
    expect(ids("Te puedo hacer un descuento especial si llevas las 4, ¿te interesa?"))
      .toContain("inventa_descuento");
  });

  it("no marca descuento cuando hay oferta vigente", () => {
    expect(ids("Tienes un descuento autorizado, ¿lo usamos?", { ...SIN_NADA_AUTORIZADO, tieneDescuentoAutorizado: true }))
      .not.toContain("inventa_descuento");
  });

  it("atrapa stock inventado", () => {
    expect(ids("Sí, tenemos en stock ahorita mismo, ¿te las aparto?")).toContain("inventa_stock");
    expect(ids("Quedan pocas, ¿la reservamos?")).toContain("inventa_stock");
  });

  it("atrapa una promesa de entrega", () => {
    expect(ids("Te la entrega mañana sin problema, ¿te sirve?")).toContain("inventa_plazo");
  });

  it("atrapa que no pida la medida cuando falta", () => {
    const ctx = { ...SIN_NADA_AUTORIZADO, etapa: "nuevo", clienteDioMedida: false, turno: 1 };
    expect(ids("Claro, con gusto te ayudo. ¿Qué necesitas?", ctx)).toContain("no_pide_medida");
    expect(ids("¿Me confirmas la medida del costado de tu llanta?", ctx)).not.toContain("no_pide_medida");
  });

  it("atrapa respuestas kilométricas, vacías y sin pregunta", () => {
    expect(ids(`${"palabra ".repeat(120)}?`)).toContain("demasiado_largo");
    expect(ids("ok")).toContain("vacio");
    expect(ids("Perfecto, te confirmo por aquí.")).toContain("sin_pregunta");
  });

  it("atrapa el exceso de emojis y el saludo repetido", () => {
    expect(ids("😊🛞✨🔥 ¿te ayudo?")).toContain("exceso_emojis");
    expect(ids("Hola, ¿en qué te ayudo?")).toContain("se_presenta_de_nuevo");
    expect(ids("Hola, ¿en qué te ayudo?", { ...SIN_NADA_AUTORIZADO, turno: 1 }))
      .not.toContain("se_presenta_de_nuevo");
  });

  it("atrapa que pida una foto (regla de Joaquín: el bot no puede leerlas)", () => {
    // Frases reales de las capturas del 5-ago.
    expect(ids("¿Podrías enviarme una foto de la etiqueta de la puerta?")).toContain("pide_foto");
    expect(ids("Si prefiere, puede mandarme una foto del costado y yo la leo.")).toContain("pide_foto");
    // Pedir la medida ESCRITA es la conducta correcta y no dispara.
    expect(ids("¿Me escribe la medida que dice el filo de la llanta? Es algo como 225/65R17."))
      .not.toContain("pide_foto");
  });

  it("atrapa que pregunte vehículo/versión teniendo ya la medida (regla de Joaquín)", () => {
    expect(ids("¿Me puede dar la versión de su auto?")).toContain("pregunta_vehiculo_con_medida");
    // Sin medida dada, preguntar el vehículo es válido.
    expect(ids("¿Qué vehículo tiene?", { ...SIN_NADA_AUTORIZADO, clienteDioMedida: false, etapa: "nuevo", turno: 1 }))
      .not.toContain("pregunta_vehiculo_con_medida");
  });

  it("aprueba una respuesta buena de verdad", () => {
    const resultado = evaluarReglas(
      "Con esa medida tengo dos opciones que te calzan bien 🛞 ¿Priorizas duración o precio?",
      SIN_NADA_AUTORIZADO,
    );
    expect(resultado.fallos).toEqual([]);
    expect(resultado.aprueba).toBe(true);
  });

  it("un fallo crítico reprueba aunque el resto esté bien", () => {
    const resultado = evaluarReglas("Te lo dejo en $150, ¿lo tomas?", SIN_NADA_AUTORIZADO);
    expect(resultado.criticas).toBeGreaterThan(0);
    expect(resultado.aprueba).toBe(false);
  });

  it("toda regla declarada tiene forma de dispararse", () => {
    // Red de seguridad: si alguien añade una regla y no la prueba, esto avisa.
    const cubiertas = new Set([
      ...ids("Te salen en $180, ¿te lo aparto?"),
      ...ids("Te hago un descuento, ¿te interesa?"),
      ...ids("Tenemos en stock, ¿te aparto?"),
      ...ids("Te la entrega mañana, ¿te sirve?"),
      ...ids("Claro, dime.", { ...SIN_NADA_AUTORIZADO, etapa: "nuevo", clienteDioMedida: false, turno: 1 }),
      ...ids("¿Podrías enviarme una foto de la etiqueta de la puerta?"),
      ...ids("¿Me puede dar la versión de su auto?"),
      ...ids(`${"palabra ".repeat(120)}?`),
      ...ids("ok"),
      ...ids("😊🛞✨🔥 ¿te ayudo?"),
      ...ids("Perfecto, te confirmo."),
      ...ids("Hola, ¿en qué te ayudo?"),
    ]);
    expect([...REGLAS_IDS].sort()).toEqual([...cubiertas].sort());
  });
});
