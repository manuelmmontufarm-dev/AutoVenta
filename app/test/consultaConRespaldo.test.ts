/**
 * T115 conv 11274 (ancla H08), 30-ago-2026: el cliente preguntó por Falken y
 * la respuesta ni la nombró; preguntó la fabricación y el bot dijo «no tengo
 * el dato» sin llamar a respaldo_marcas. En la corrida de las 19:32 el modelo
 * hizo las dos cosas bien y en la de las 21:22 las dos mal, con el mismo
 * código: moneda al aire. Estos detectores ponen la obligación por escrito.
 */
import { describe, expect, it } from "vitest";

// prepararSalida arrastra config.ts, que exige el entorno completo.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

import {
  aroPedido,
  marcaElegidaASecas,
  ultimaMarcaPedida,
  marcaPreguntada,
  ofrecioAsesor,
  pidioCotizacionExplicita,
  pidioHumanoExplicito,
  ordenDeConsultarRespaldo,
  ordenDeNombrarLaMarca,
  ordenDeNotificarLoPrometido,
  preguntaTecnicaDeRespaldo,
} from "../src/domain/consultaConRespaldo.js";

describe("marcaPreguntada", () => {
  it("reconoce la pregunta real de la conv 11274", () => {
    expect(
      marcaPreguntada("Disponen de llantas \n255 70 R16 A / T \nNecesito 4 unid.\nEn Falken\nMe confirma por favor \nGracias"),
    ).toBe("FALKEN");
  });

  it("reconoce «¿Tienen Kenda?» (P10 del corpus)", () => {
    expect(marcaPreguntada("¿Tienen Kenda?")).toBe("KENDA");
  });

  it("«Kendall» es Kenda (conv 5698: pidió Kendall y recibió Winrun en silencio)", () => {
    expect(marcaPreguntada("Necesito un par de llantas marca Kendall en 185 60 Rin 14")).toBe("KENDA");
  });

  it("nombrar la marca sin preguntar por ella no dispara", () => {
    // «mis falken rozan cargado» describe las llantas puestas, no pide stock.
    expect(marcaPreguntada("mis falken rozan cargado")).toBeNull();
  });

  it("una marca desconocida no dispara: mejor callar que inventar", () => {
    expect(marcaPreguntada("¿Tienen llantas Marcapoco?")).toBeNull();
  });

  it("la orden nombra la marca y prohíbe callarla", () => {
    const orden = ordenDeNombrarLaMarca("FALKEN");
    expect(orden).toContain("FALKEN");
    expect(orden).toMatch(/PROHIBIDO/);
  });
});

describe("preguntaTecnicaDeRespaldo", () => {
  it.each([
    "De que fabricación es",
    "El frenado en mojado de que clase",
    "¿Cuánto duran estas llantas?",
    "¿Qué garantía tienen?",
    "de donde son estas llantas",
  ])("«%s» exige consultar respaldo_marcas", (texto) => {
    expect(preguntaTecnicaDeRespaldo(texto)).toBe(true);
  });

  it.each([
    "¿Cuánto cuestan?",
    "Necesito 4 llantas 195/55R15",
    "¿A qué hora cierran?",
  ])("«%s» no es pregunta técnica", (texto) => {
    expect(preguntaTecnicaDeRespaldo(texto)).toBe(false);
  });

  it("la orden exige la herramienta antes de rendirse", () => {
    expect(ordenDeConsultarRespaldo()).toContain("respaldo_marcas");
  });
});

/**
 * T115 conv 9887 turnos 9-10, 30-ago-2026: el dedupe de preguntas corre
 * primero en la cadena, el Ángel Guardián reescribe DESPUÉS y reintrodujo la
 * pregunta del local dos turnos seguidos. La cadena debe volver a pasar el
 * dedupe tras el guardián — este test fija ese orden para siempre.
 */
describe("orden de la cadena de salida", () => {
  it("el dedupe de preguntas corre otra vez después del Ángel Guardián", async () => {
    const { PASOS } = await import("../src/services/prepararSalida.js");
    const nombres = PASOS.map((p) => p.nombre);
    const guardian = nombres.indexOf("angel_guardian");
    const dedupeTardio = nombres.indexOf("sin_pregunta_consecutiva_tras_guardian");
    const freno = nombres.indexOf("guardian_no_vende_solo");
    expect(guardian).toBeGreaterThanOrEqual(0);
    expect(dedupeTardio).toBeGreaterThan(guardian);
    // Después del freno comercial, para juzgar el texto ya definitivo.
    expect(dedupeTardio).toBeGreaterThan(freno);
    // Y antes de que insistir decida agregar la pregunta que falta.
    expect(dedupeTardio).toBeLessThan(nombres.indexOf("insistir_con_lo_que_falta"));
  });
});


describe("ofrecioAsesor (T115 conv 8288, corrida 4)", () => {
  it.each([
    "Le puedo dejar como siguiente paso que un asesor le confirme cuándo vuelve a ingresar esa medida",
    "¿Desea que le pase con un asesor para que le confirme ingreso de 165/80R13?",
    "Ya le aviso a un asesor para que le ayude",
    "Dejé el caso con el asesor del local",
  ])("«%s» es ofrecer/prometer asesor", (t) => {
    expect(ofrecioAsesor(t)).toBe(true);
  });

  it.each([
    "Nuestros asesores están de 08:30 a 17:30",
    "Opciones enviadas: KENDA KR33 · WINRUN R380",
  ])("«%s» no lo es", (t) => {
    expect(ofrecioAsesor(t)).toBe(false);
  });

  it("la orden exige ejecutar o soltar la zanahoria", () => {
    const orden = ordenDeNotificarLoPrometido();
    expect(orden).toContain("notificar_vendedor");
    expect(orden).toMatch(/PROHIBIDO/);
  });
});


describe("las obligaciones del modelo débil (nivel 2 del T115, 31-ago)", () => {
  it.each([
    "Quiero hablar con una persona",
    "páseme con un asesor",
    "que me llame alguien por favor",
  ])("«%s» es solicitud humana explícita", (t) => {
    expect(pidioHumanoExplicito(t)).toBe(true);
  });

  it("preguntar por el horario no es pedir un humano", () => {
    expect(pidioHumanoExplicito("¿Hasta qué hora atienden?")).toBe(false);
  });

  it.each([
    "Mándame una cotización de 225/65R17",
    "cotízame 4",
    "necesito una proforma",
  ])("«%s» es pedido explícito de cotización", (t) => {
    expect(pidioCotizacionExplicita(t)).toBe(true);
  });

  it("preguntar el precio no es pedir la cotización formal", () => {
    expect(pidioCotizacionExplicita("¿qué precio tienen?")).toBe(false);
  });
});


/** Producción, 31-ago 13:21 (Manuel en vivo): «una rin 15 porf» recibió la
 *  guía de medida en vez de opciones y tuvo que repetirlo. P03 manda mostrar. */
describe("aroPedido", () => {
  it.each([
    ["una rin 15 porf", 15],
    ["Rin 15", 15],
    ["Buenas tardes don Rin 15", 15],
    ["aro 17 por favor", 17],
  ])("«%s» → aro %i", (t, aro) => {
    expect(aroPedido(t)).toBe(aro);
  });

  it.each([
    "225/65R17",           // medida completa: manda la medida, no el aro
    "205 55 16",
    "tengo rines de lujo", // sin número
    "a las 15 paso",       // hora, no aro
  ])("«%s» no dispara el aro", (t) => {
    expect(aroPedido(t)).toBeNull();
  });
});


/**
 * Producción, 31-ago-2026, conv 671: «necesito falken r17 265 70» terminó en
 * cotización de KENDA, y al pedir «las falken» el anti-duplicado repitió «su
 * cotización sigue vigente por \$961.32» — la de la otra marca.
 */
describe("ultimaMarcaPedida — la marca pedida es una restricción viva", () => {
  it("la conversación real de la conv 671", () => {
    expect(ultimaMarcaPedida([
      "necesito falken r17 265 70",
      "cuanto sale las 4?",
      "y de las falken?",
      "coticeme 4 at",
    ])).toBe("FALKEN");
  });

  it("la última marca pedida manda", () => {
    expect(ultimaMarcaPedida(["¿tienen Falken?", "mejor quiero kenda"])).toBe("KENDA");
  });

  it("«cualquier marca» libera la restricción", () => {
    expect(ultimaMarcaPedida(["necesito falken 205/55R16", "cualquier marca está bien"])).toBeNull();
  });

  it("sin marca pedida no hay restricción", () => {
    expect(ultimaMarcaPedida(["205/55R16", "cuanto sale las 4?"])).toBeNull();
  });

  it("nombrar la marca sin pedirla no restringe", () => {
    expect(ultimaMarcaPedida(["mis falken rozan cargado"])).toBeNull();
  });
});


/** Producción, 31-ago 23:59: «las. winrun» tras la vitrina era una ELECCIÓN y
 *  el bot preguntó «¿le cotizo?». Y «cual es la prosedencia» —con S, como
 *  escribe la gente— no disparaba la consulta de la ficha. */
describe("la elección a secas y el typo real", () => {
  it.each([
    ["las. winrun", "WINRUN"],
    ["la falken", "FALKEN"],
    ["mejor la kenda", "KENDA"],
    ["dele pue la winrun", "WINRUN"],
  ])("«%s» elige %s", (t, marca) => {
    expect(marcaElegidaASecas(t)).toBe(marca);
  });

  it.each([
    "mis winrun rozan cargado",
    "¿la winrun qué precio tiene?",
    "las llantas para camioneta",
  ])("«%s» NO es elección a secas", (t) => {
    expect(marcaElegidaASecas(t)).toBeNull();
  });

  it("la elección actualiza la marca pedida vigente (el candado deja de exigir la vieja)", () => {
    expect(ultimaMarcaPedida(["necesito falken r17 265 70", "las. winrun"])).toBe("WINRUN");
  });

  it("«cual es la prosedencia» dispara la ficha aunque venga con S", () => {
    expect(preguntaTecnicaDeRespaldo("cual es la prosedencia")).toBe(true);
    expect(preguntaTecnicaDeRespaldo("de qué procedencia son?")).toBe(true);
  });
});
