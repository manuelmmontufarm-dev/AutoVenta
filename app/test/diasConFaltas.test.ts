import { describe, expect, it } from "vitest";
import { claveFonetica, diaEnTexto, fechaDeCalendario, franjaHoraria, relativoEnTexto } from "../src/domain/diasEnEspanol.js";
import { extractCustomerCommitment, fechaDelDia, preguntamosElDia } from "../src/domain/customerCommitment.js";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

/**
 * El caso que abrió esta batería: conversación 9878, lunes 24-ago-2026.
 *
 *   BOT     11:57  «…solo confírmeme qué día sería cuando lo tenga definido.»
 *   CLIENTE 11:58  «X eso el juebes»
 *   BOT     11:58  «Listo, jueves de 4 a 5 pm en Depot Tire Quito Sur.»
 *
 * El bot entendió. El extractor no: buscaba la cadena «jueves». Sin fecha
 * registrada no hubo aviso al asesor, no salió el cupón, y a las 14:58 y a las
 * 09:58 del día siguiente le preguntaron otra vez qué día venía.
 */
const LUNES_11_58 = new Date("2026-08-24T16:58:20.000Z");

describe("los días como los escribe la gente", () => {
  it("reconoce el «juebes» que costó la visita del 24-ago", () => {
    expect(diaEnTexto("X eso el juebes")).toEqual({ nombre: "jueves", indice: 4 });
  });

  it.each([
    ["juebes", "jueves"], ["gueves", "jueves"], ["hueves", "jueves"], ["jeuves", "jueves"],
    ["juevez", "jueves"], ["savado", "sabado"], ["sabbado", "sabado"], ["sábado", "sabado"],
    ["mierkoles", "miercoles"], ["mihercoles", "miercoles"], ["miercules", "miercoles"],
    ["domigo", "domingo"], ["lunez", "lunes"], ["lunnes", "lunes"], ["biernes", "viernes"],
    ["martez", "martes"],
  ])("«%s» es %s", (escrito, esperado) => {
    expect(diaEnTexto(escrito)?.nombre).toBe(esperado);
  });

  it("acepta la abreviatura que se teclea con prisa", () => {
    expect(diaEnTexto("el sab paso")?.nombre).toBe("sabado");
    expect(diaEnTexto("vier en la tarde")?.nombre).toBe("viernes");
    expect(diaEnTexto("mier temprano")?.nombre).toBe("miercoles");
  });

  /*
   * El riesgo de un matcher difuso no es que falle: es que acierte de más. Un
   * «¿cuándo vienes?» leído como viernes agenda una visita que nadie prometió y
   * dispara el aviso al asesor y el cupón.
   */
  it.each([
    "cuando vienes", "por partes", "a las nueve", "el dominio de la web",
    "que llueve", "no sabes", "mi marca", "aparte de eso", "entrega a domicilio",
  ])("«%s» NO es un día", (frase) => {
    expect(diaEnTexto(frase)).toBeNull();
  });

  it("la clave fonética une lo que suena igual", () => {
    expect(claveFonetica("savado")).toBe(claveFonetica("sábado"));
    expect(claveFonetica("juebes")).toBe(claveFonetica("jueves"));
  });

  it("«pasado mañana» no es mañana", () => {
    expect(relativoEnTexto("paso pasado mañana")).toBe("pasado_manana");
    expect(relativoEnTexto("paso mañana")).toBe("manana");
    // «en la mañana» sigue siendo una hora del día, no el día siguiente.
    expect(relativoEnTexto("paso en la mañana")).toBeNull();
  });
});

describe("la hora que dijo el cliente", () => {
  it.each([
    ["X la tarde de 4 a 5 x yo soy de probincia", "de 4 a 5 pm", 16],
    ["de 3 a 5 pm", "de 3 a 5 pm", 15],
    ["paso a las 4", "a las 4 pm", 16],
    ["a las 9 am", "a las 9 am", 9],
    ["en la tarde", "en la tarde", 16],
    ["al mediodia", "al mediodía", 12],
  ])("«%s» → %s", (texto, etiqueta, hora) => {
    expect(franjaHoraria(texto)).toEqual({ etiqueta, hora });
  });

  it("sin hora dicha no se inventa ninguna", () => {
    expect(franjaHoraria("el jueves")).toBeNull();
  });
});

describe("el cierre completo de la conversación 9878", () => {
  const PREGUNTA_DEL_BOT =
    "Para dejarle avisado al asesor, solo confírmeme qué día sería cuando lo tenga definido.";

  it("«X eso el juebes» registra el jueves, no null", () => {
    expect(preguntamosElDia(PREGUNTA_DEL_BOT)).toBe(true);
    const compromiso = extractCustomerCommitment("X eso el juebes", LUNES_11_58, {
      respondiendoAlDia: true,
    });
    // Jueves 27-ago-2026, 10:00 de Guayaquil.
    expect(compromiso?.visitDate?.toISOString()).toBe("2026-08-27T15:00:00.000Z");
  });

  it("la hora del cliente manda sobre el relleno del día", () => {
    const compromiso = extractCustomerCommitment("el juebes de 4 a 5", LUNES_11_58, {
      respondiendoAlDia: true,
    });
    expect(compromiso?.visitTimeLabel).toBe("de 4 a 5 pm");
    // 16:00 de Guayaquil, la hora que él dijo — no las 10:00 de relleno.
    expect(compromiso?.visitDate?.toISOString()).toBe("2026-08-27T21:00:00.000Z");
  });

  /*
   * El mensaje de las 11:57: dio la hora y dijo que venía, pero todavía no el
   * día. Vale como compromiso —el asesor tiene que saberlo— y NO como fecha:
   * el bot sigue debiendo preguntar el día, que es justo lo que hizo.
   */
  it("«de 4 a 5 … ese día paso» queda anotado sin inventarle una fecha", () => {
    const compromiso = extractCustomerCommitment(
      "X la tarde de 4 a 5  x yo soy de probincia i ese día paso x ai",
      LUNES_11_58,
    );
    expect(compromiso).not.toBeNull();
    expect(compromiso?.visitDate).toBeUndefined();
    expect(compromiso?.visitTimeLabel).toBe("de 4 a 5 pm");
    // `solo_hora`: vale para anotar y para avisar al asesor, pero NO para emitir
    // el cupón — «por confirmar su visita» sería mentira sin día.
    expect(compromiso?.tipo).toBe("solo_hora");
  });

  it("distingue las tres firmezas del compromiso", () => {
    expect(extractCustomerCommitment("X eso el juebes", LUNES_11_58, { respondiendoAlDia: true })?.tipo)
      .toBe("fecha");
    expect(extractCustomerCommitment("paso esta semana", LUNES_11_58)?.tipo).toBe("tramo");
    expect(extractCustomerCommitment("paso a las 4", LUNES_11_58)?.tipo).toBe("solo_hora");
  });
});

describe("fechaDelDia (lo que recibe agendar_visita del modelo)", () => {
  it("traduce lo que el modelo entendió", () => {
    expect(fechaDelDia("jueves", LUNES_11_58)?.toISOString()).toBe("2026-08-27T15:00:00.000Z");
    expect(fechaDelDia("mañana", LUNES_11_58)?.toISOString()).toBe("2026-08-25T15:00:00.000Z");
    expect(fechaDelDia("2026-09-03", LUNES_11_58)?.toISOString()).toBe("2026-09-03T15:00:00.000Z");
  });

  it("devuelve null cuando no hay día que registrar", () => {
    expect(fechaDelDia("", LUNES_11_58)).toBeNull();
    expect(fechaDelDia("esta semana", LUNES_11_58)).toBeNull();
  });
});

/**
 * El eslabón que el simulador destapó el 26-ago.
 *
 * Con el bot ya no preguntando el día —porque su turno anterior lo dio por
 * cerrado— «X eso el juebes» volvía a perderse: `preguntamosElDia` era la única
 * llave y esa llave depende de que nuestro mensaje termine en pregunta.
 */
describe("preguntamosElDia · la respuesta seca no puede depender del signo de pregunta", () => {
  it("reconoce la pregunta explícita, como siempre", () => {
    expect(preguntamosElDia("¿Qué día podría pasar?")).toBe(true);
    expect(preguntamosElDia("¿Cuándo puede venir al local?")).toBe(true);
  });

  it("también cuenta cuando nuestro mensaje puso un día sobre la mesa", () => {
    expect(preguntamosElDia("Listo, *jueves de 4 a 5 pm* en *Depot Tire Quito Sur*.")).toBe(true);
    expect(preguntamosElDia("Le esperamos el sábado en Cumbayá 🤝")).toBe(true);
  });

  it("no convierte cualquier mensaje en una pregunta por el día", () => {
    expect(preguntamosElDia("¿Le queda mejor Cumbayá o Quito Sur?")).toBe(false);
    expect(preguntamosElDia("4 × KENDA KR29: $777.20")).toBe(false);
    // Habla de la visita pero sin ningún día: no hay a qué contestar.
    expect(preguntamosElDia("Puede pasar sin compromiso a verlas.")).toBe(false);
  });

  /*
   * El otro lado del filtro. Ahora que basta con que NOSOTROS hayamos nombrado
   * un día —«atendemos de lunes a viernes»—, una pregunta del cliente que
   * mencione un día no puede convertirse en visita agendada.
   */
  it("una pregunta del cliente nunca agenda nada", () => {
    const ctx = { respondiendoAlDia: true };
    expect(extractCustomerCommitment("¿Abren el sábado?", LUNES_11_58, ctx)).toBeNull();
    expect(extractCustomerCommitment("atienden el domingo", LUNES_11_58, ctx)).toBeNull();
    expect(extractCustomerCommitment("a que hora abren el jueves", LUNES_11_58, ctx)).toBeNull();
    // Pero con verbo de visita sí, aunque lleve signo de pregunta.
    expect(extractCustomerCommitment("¿le parece si paso el jueves?", LUNES_11_58, ctx)).not.toBeNull();
  });
});

/**
 * La confabulación que cazó el simulador: con solo la hora dicha, los HECHOS le
 * prohibían preguntar el día y el modelo se inventó uno («jueves»). El bloque
 * de hechos tiene que distinguir las dos situaciones.
 */
describe("los HECHOS no pueden decir que hay un día cuando no lo hay", () => {
  it("con hora y sin día, pide la fecha y prohíbe inventarla", async () => {
    const { salesFactsPrompt } = await import("../src/agent/agent.js");
    const texto = salesFactsPrompt({
      tireSize: "235/75R15", vehicle: null, vehicleYear: null,
      selectedProductCode: null, selectedQuantity: 4,
      nearestStore: "Depot Tire Quito Sur",
      visitDate: null, visitTimeLabel: "de 4 a 5 pm",
      customerCommitment: "X la tarde de 4 a 5 x yo soy de probincia i ese día paso x ai",
      lastQuote: null, escalones: null,
    });
    expect(texto).toMatch(/el DÍA todavía NO lo dijo/);
    expect(texto).toMatch(/PROHIBIDO escribir un día de la semana/);
    expect(texto).not.toMatch(/PROHIBIDO volver a preguntar qué día viene/);
    expect(texto).toMatch(/agendar_visita/);
  });

  it("con el día registrado, prohíbe repreguntarlo y no pide fecha", async () => {
    const { salesFactsPrompt } = await import("../src/agent/agent.js");
    const texto = salesFactsPrompt({
      tireSize: "235/75R15", vehicle: null, vehicleYear: null,
      selectedProductCode: null, selectedQuantity: 4,
      nearestStore: "Depot Tire Quito Sur",
      visitDate: new Date("2026-08-27T21:00:00.000Z"), visitTimeLabel: "de 4 a 5 pm",
      customerCommitment: "X eso el juebes",
      lastQuote: null, escalones: null,
    });
    expect(texto).toMatch(/jueves 27 de agosto de 4 a 5 pm/);
    expect(texto).toMatch(/PROHIBIDO volver a preguntar qué día viene/);
    expect(texto).not.toMatch(/PROHIBIDO escribir un día de la semana/);
  });
});

/**
 * Cazado en el simulador el 26-ago: el cliente reagendó con «mejor el 3 de
 * septiembre», el bot le dijo que sí, y el registro se quedó en el jueves
 * anterior. El extractor solo sabía de días de la semana — y el asesor habría
 * esperado a alguien que ya no venía ese día.
 */
describe("fechas de calendario", () => {
  const AHORA = new Date("2026-08-26T21:00:00.000Z"); // miércoles 26-ago, 16:00

  it.each([
    ["mejor el 3 de septiembre", 8, 3, 2026],
    ["el 3 de setiembre", 8, 3, 2026],   // ambas grafías son correctas en español
    ["3 sep", 8, 3, 2026],
    ["el 15 de diciembre", 11, 15, 2026],
    ["3/9", 8, 3, 2026],
  ])("«%s»", (texto, mes, dia, anio) => {
    expect(fechaDeCalendario(texto, AHORA)).toEqual({ mes, dia, anio });
  });

  it("una fecha ya pasada se entiende para el año que viene", () => {
    expect(fechaDeCalendario("el 1 de enero", AHORA)?.anio).toBe(2027);
  });

  it("una medida de llanta NO es una fecha", () => {
    expect(fechaDeCalendario("205/55R16 por favor", AHORA)).toBeNull();
    expect(fechaDeCalendario("medidas 235/75R15", AHORA)).toBeNull();
    expect(fechaDeCalendario("necesito 4 llantas", AHORA)).toBeNull();
  });

  it("el reagendamiento entra como compromiso con fecha", () => {
    const c = extractCustomerCommitment("disculpe mejor el 3 de septiembre a la misma hora", AHORA, {
      respondiendoAlDia: true,
    });
    expect(c?.tipo).toBe("fecha");
    expect(c?.visitDate?.toISOString().slice(0, 10)).toBe("2026-09-03");
  });

  it("fechaDelDia también la traduce para agendar_visita", () => {
    expect(fechaDelDia("3 de septiembre", AHORA)?.toISOString().slice(0, 10)).toBe("2026-09-03");
  });
});
