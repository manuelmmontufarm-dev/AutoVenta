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

  it("atrapa que pida el dato sin ofrecer nada (ticket 2150)", () => {
    // La regla vieja `pide_foto` (Joaquín, 5-ago) reprobaba cualquier mención a
    // una foto porque el bot era ciego. Desde services/vision.ts sí las lee y la
    // migración 012 repuso esa vía: pedir la foto dejó de ser el error. El error
    // es pedir y no dar nada, que es lo que colgó el ticket 2150.
    expect(ids("¿Podrías enviarme una foto de la etiqueta de la puerta?")).toContain("pide_sin_ofrecer");
    expect(ids("¿Me escribe la medida que dice el filo de la llanta?")).toContain("pide_sin_ofrecer");

    // Pedir la foto ofreciendo algo concreto en la misma respuesta SÍ pasa: es
    // exactamente la conducta que el dueño pidió.
    expect(ids("Tenemos llantas en aros del 13 al 22. ¿Me dice su medida, o me manda una foto del costado y la leo?"))
      .not.toContain("pide_sin_ofrecer");
    expect(ids("Pase por Quito Sur y se lo medimos en 2 minutos. ¿O me dice la medida del costado?"))
      .not.toContain("pide_sin_ofrecer");

    // Si salió una pieza, ya se le ofreció algo aunque el texto solo pregunte.
    expect(ids("¿Me dice la medida, o prefiere mandarme una foto del costado?", { ...SIN_NADA_AUTORIZADO, mandoPieza: true }))
      .not.toContain("pide_sin_ofrecer");
  });

  it("no cuenta como oferta un «no tengo»", () => {
    // La negación invierte el sentido: era la frase que el dueño mandó eliminar.
    expect(ids("No tengo una medida verificada para ese modelo. ¿Me manda una foto de la etiqueta?"))
      .toContain("pide_sin_ofrecer");
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
