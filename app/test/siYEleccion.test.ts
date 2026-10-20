/**
 * EL SÍ Y LA ELECCIÓN (auditoría 19-oct-2026, familias 1 y 2).
 *
 * Familia 1 — el cliente dice que sí y el bot no cotiza (47 chats): el acuse
 * era una lista cerrada anclada, y «Si, por favor» (con coma), «Si porfavor»,
 * «Claro que si» no entraban. Sin acuse, `generar_cotizacion` se bloqueaba y el
 * Guardián volvía a poner «¿Se la cotizo?».
 *
 * Familia 2 — cotiza lo que nadie eligió (≥19 cotizaciones): a «¿Le cotizo la
 * 1, la 2 o la 3?» el cliente contestó «Ok gracias», «👍🏼», «Las 4…» y el bot
 * eligió por su cuenta.
 *
 * La regla de dominio: un sí solo autoriza lo que la última oferta NOMBRÓ. Si la
 * oferta no nombró una llanta (un menú), no hay nada que firmar: se pregunta cuál.
 *
 * Todos los textos son los de producción (chat y hora en cada caso).
 */
import { describe, expect, it } from "vitest";
import {
  esAcuseSimple,
  esMenuDeOpciones,
  menuDeCotizarAbierto,
  ofertaDeCotizacionAceptada,
  ofertaDeCotizacionVigenteAceptada,
  ofertaDeCotizarAceptada,
  preguntaCualLeCotizo,
  respondeQueSi,
  soloAcuseOCantidad,
  ultimaOfertaDeCotizar,
} from "../src/domain/ofertaAceptada.js";
import { autorizaCotizacionEnEsteTurno, escalonContestado, respuestaDePreferencia } from "../src/domain/salesIntent.js";
import { equivalenteSinConsentimiento } from "../src/domain/equivalentePendiente.js";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
const { loQueEligio } = await import("../src/services/cotizarLoElegido.js");

// Chat 29029, 17-oct 07:16 — las dos filas del turno del bot.
const SE_LA_COTIZO_29029 =
  "Para la medida *215/65R16*, le mostré la opción *FALKEN WILDPEAK A/T TRAIL* — *$143.65 c/u con IVA*.\n¿Se la cotizo? 😊";
// Chat 26030, 12-oct 17:04 — caso sano.
const LE_COTIZO_LA_26030 = "¿Le cotizo la *FALKEN WILDPEAK A/T 4W* en *235/70R16*? 😊";
// Chat 29367, 17-oct 15:27 — el menú de tres.
const MENU_29367 =
  "1 · WINRUN MAXCLAW A/T — $159.49 c/u · 4 = $637.96\n2 · KENDA KR628 — $184.81 c/u · 4 = $739.24\n3 · FALKEN WILDPEAK A/T 4W — $296.55 c/u · 4 = $1186.20\n¿Le cotizo la 1, la 2 o la 3?";
const MENU_DE_DOS = "1 · WINRUN MAXCLAW A/T — $124.76 c/u · 4 = $499.04\n2 · KENDA KR50 — $127.93 c/u · 4 = $511.72\n¿Le cotizo la 1 o la 2?";

describe("familia 1 — el sí que no se reconocía", () => {
  const FALLARON = [
    "Si, por favor", // 29029, 17-oct 07:19
    "Si porfavor", // 26675, 13-oct 17:44
    "Claro que si", // 25889, 12-oct 09:45
    "Sí claro",
    "Ok si",
    "Si. Por favor",
    "Siii",
    "Sí por favor", // 26841, 14-oct 16:35
    "si por fa",
    "Sii porfavorr",
    "Ok, gracias 👍🏼",
    "X favor", // 29022, 17-oct 06:45 — eligió la ZE310R y «¿Se la cotizo?»
    "Si por favor q", // 26841, 14-oct 16:35 — la «q» de tecla resbalada
  ];
  it.each(FALLARON)("«%s» a «¿Se la cotizo?» es un sí", (si) => {
    expect(ofertaDeCotizacionAceptada(SE_LA_COTIZO_29029, si, SE_LA_COTIZO_29029)).toBe(true);
    expect(ofertaDeCotizarAceptada(SE_LA_COTIZO_29029, si, SE_LA_COTIZO_29029)).toBe(true);
  });

  const SANOS = ["Si por favor", "Si", "Dale", "Si porfa", "Gracias", "👍"];
  it.each(SANOS)("«%s» sigue siendo un sí (casos sanos 26030, 28812)", (si) => {
    expect(ofertaDeCotizacionAceptada(SE_LA_COTIZO_29029, si)).toBe(true);
    expect(ofertaDeCotizacionAceptada(LE_COTIZO_LA_26030, si)).toBe(true);
  });

  const NO_SON_ACUSE = [
    "si, pero en aro 17",
    "Si, ¿y en aro 17?",
    "si pero mejor 2 llantas",
    "no",
    "No gracias",
    "ok no",
    "si no hay otra",
    "Gracias ya compré en otro lugar",
    "si tiene en rin 16",
  ];
  it.each(NO_SON_ACUSE)("«%s» NO es un acuse (trae otra cosa o es un no)", (texto) => {
    expect(esAcuseSimple(texto)).toBe(false);
    expect(ofertaDeCotizacionAceptada(SE_LA_COTIZO_29029, texto)).toBe(false);
  });

  it("el «¿Se la cotizo?» del seguimiento del día siguiente abre la misma oferta", () => {
    const seguimiento = "🛞 Le escribo por la *WINRUN MAXCLAW A/T* en 225/70R16 a $124.76 c/u. Si le sirve, ¿se la cotizo?";
    expect(ofertaDeCotizacionAceptada(seguimiento, "Si, por favor")).toBe(true);
  });

  it("chat 25741: «¿Le cotizo la 3, *FALKEN WILDPEAK A/T TRAIL*?» nombra una llanta y «Si por favor» la acepta", () => {
    expect(ofertaDeCotizacionAceptada("¿Le cotizo la 3, *FALKEN WILDPEAK A/T TRAIL*?", "Si por favor")).toBe(true);
  });

  it("«Las 4» / «el juego» a una oferta de UNA llanta es un sí (chat 21710)", () => {
    expect(respondeQueSi("Las 4")).toBe(true);
    expect(respondeQueSi("Si, el juego")).toBe(true);
    expect(respondeQueSi("Si, por favor")).toBe(true);
    expect(respondeQueSi("Si pero en aro 17")).toBe(false);
    // chat 26030, 12-oct 17:03, a «Es la única que tengo… ¿Se la cotizo?»
    expect(respondeQueSi("Si esa mismo necesito")).toBe(true);
  });
});

describe("familia 2 — un acuse a un menú no elige nada", () => {
  it("reconoce el menú de tres y el de dos, y no confunde la oferta de una sola", () => {
    expect(esMenuDeOpciones(MENU_29367)).toBe(true);
    expect(esMenuDeOpciones(MENU_DE_DOS)).toBe(true);
    expect(esMenuDeOpciones("¿Le cotizo la 3, *FALKEN WILDPEAK A/T TRAIL*?")).toBe(false);
    expect(esMenuDeOpciones(SE_LA_COTIZO_29029)).toBe(false);
    expect(esMenuDeOpciones(LE_COTIZO_LA_26030)).toBe(false);
  });

  const ACUSES_AL_MENU = [
    "Ok gracias", // 29367, 17-oct 15:28 → cotizó la 3 ($1.186,20)
    "Gracias", // 27512, 15-oct 09:38 → cotizó la 1
    "👍🏼", // 28116, 15-oct 14:45 → cotizó la 2
    "Muchas gracias",
    "Por favor",
    "Si",
  ];
  it.each(ACUSES_AL_MENU)("«%s» a «¿Le cotizo la 1, la 2 o la 3?» no acepta ninguna", (acuse) => {
    expect(ofertaDeCotizacionAceptada(MENU_29367, acuse, MENU_29367)).toBe(false);
    expect(ofertaDeCotizarAceptada(MENU_29367, acuse, MENU_29367)).toBe(false);
    expect(ofertaDeCotizacionVigenteAceptada(
      [{ role: "assistant", content: "Opciones enviadas: FALKEN · KENDA · WINRUN" }, { role: "assistant", content: MENU_29367 }],
      acuse,
    )).toBe(false);
    expect(soloAcuseOCantidad(acuse)).toBe(true);
  });

  it("el menú sigue abierto aunque el bot haya contestado otra cosa en el medio (chat 28606)", () => {
    const historial = [
      { role: "assistant", content: "Opciones enviadas: FALKEN AZENIS FK520L · KENDA KR20 · WINRUN R330" },
      { role: "assistant", content: "1 · WINRUN R330 — $77.62 c/u · 4 = $310.48\n2 · KENDA KR20 — $94.54 c/u · 4 = $378.16\n3 · FALKEN AZENIS FK520L — $160.56 c/u · 4 = $642.24" },
      { role: "assistant", content: "¿Le cotizo la 1, la 2 o la 3?" },
      { role: "user", content: "Que ciudad" },
      { role: "assistant", content: "Estamos en *Quito, Ecuador*.\n\nLocales:\n*Depot Tire Cumbayá* y *Depot Tire Quito Sur*.\n\n¿Desea que le envíe las ubicaciones por mapa?" },
      { role: "user", content: "4 llantas\nQuiero" },
    ];
    expect(menuDeCotizarAbierto(historial)).toBe(3);
    // Con la cotización ya enviada, el menú se cerró.
    expect(menuDeCotizarAbierto([...historial.slice(0, 3), { role: "assistant", content: "Cotización COT-MVB8KU38 enviada por $310.48" }])).toBe(0);
    // Con una oferta de UNA llanta después del menú, ya no hay menú.
    expect(menuDeCotizarAbierto([...historial.slice(0, 3), { role: "user", content: "la 2" }, { role: "assistant", content: LE_COTIZO_LA_26030 }])).toBe(0);
    expect(menuDeCotizarAbierto([{ role: "assistant", content: MENU_DE_DOS }])).toBe(2);
  });

  const CANTIDAD_SOLA = [
    "Las 4 por favor con tarjeta", // 27265, 14-oct 12:59 → cotizó la 1
    "No no las 4 están bien", // 27066, 14-oct 09:55 → cotizó la 1
    "4 llantas\nQuiero", // 28606, 16-oct 12:23 → cotizó la Winrun
    "Las 4",
    "necesito 2",
    "Quiero",
  ];
  it.each(CANTIDAD_SOLA)("con el menú abierto, «%s» no autoriza cotizar (no dice cuál)", (texto) => {
    expect(autorizaCotizacionEnEsteTurno(texto, false, { menuSinElegir: true })).toBe(false);
  });

  const ELIGEN = [
    "La 2 por favor", // 25901, 12-oct 10:50
    "Coticemos la 1", // 26123, 13-oct 11:20
    "Mi disculpas por favor quiero la opción 2", // 26841
    "la más barata",
    "3",
  ];
  it.each(ELIGEN)("con el menú abierto, «%s» sí elige y autoriza", (texto) => {
    expect(autorizaCotizacionEnEsteTurno(texto, false, { menuSinElegir: true })).toBe(true);
  });

  it("sin menú, la cantidad sigue autorizando como siempre («Las 4» a «¿Se la cotizo?», chat 21710)", () => {
    expect(autorizaCotizacionEnEsteTurno("Las 4", false)).toBe(true);
    expect(autorizaCotizacionEnEsteTurno("necesito 2", false)).toBe(true);
  });

  it("la pregunta que corresponde nombra las posiciones que hay y la cantidad si la dijo", () => {
    expect(preguntaCualLeCotizo(3)).toBe("¿Cuál le cotizo, la 1, la 2 o la 3?");
    expect(preguntaCualLeCotizo(2)).toBe("¿Cuál le cotizo, la 1 o la 2?");
    expect(preguntaCualLeCotizo(3, 4)).toBe("Perfecto, 4 llantas.\n---\n¿Cuál le cotizo, la 1, la 2 o la 3?");
  });

  it("«4 llantas» / «Las 4» / «Ok gracias» son acuse o cantidad sola; «Las 4 por favor con tarjeta» trae una pregunta de pago", () => {
    expect(soloAcuseOCantidad("4 llantas\nQuiero")).toBe(true);
    expect(soloAcuseOCantidad("Las 4")).toBe(true);
    expect(soloAcuseOCantidad("Las 4 por favor con tarjeta")).toBe(false);
    expect(soloAcuseOCantidad("la 2")).toBe(false);
    expect(soloAcuseOCantidad("y en aro 17?")).toBe(false);
  });
});

describe("familia 2 — la ruta directa pregunta cuál en vez de elegir", () => {
  const vitrina = [
    { codigo: "W", marca: "WINRUN", diseno: "MAXCLAW A/T", medida: "265/70R17" },
    { codigo: "K", marca: "KENDA", diseno: "KR628", medida: "265/70R17" },
    { codigo: "F", marca: "FALKEN", diseno: "WILDPEAK A/T 4W", medida: "265/70R17" },
  ];
  const escalones = {
    economica: { codigo: "W", nombre: "WINRUN MAXCLAW A/T", precio_con_iva: 159.49 },
    equilibrada: { codigo: "K", nombre: "KENDA KR628", precio_con_iva: 184.81 },
    premium: { codigo: "F", nombre: "FALKEN WILDPEAK A/T 4W", precio_con_iva: 296.55 },
  };

  it("«Ok gracias» al menú → «¿Cuál le cotizo, la 1, la 2 o la 3?» (chat 29367)", () => {
    expect(loQueEligio("Ok gracias", "¿Le cotizo la 1, la 2 o la 3?", null, vitrina, escalones, 3))
      .toEqual({ pregunta: "¿Cuál le cotizo, la 1, la 2 o la 3?", menuSinElegir: true });
  });

  it("«4 llantas / Quiero» con el menú abierto → pregunta cuál, con la cantidad (chat 28606)", () => {
    expect(loQueEligio("4 llantas\nQuiero", "¿Desea que le envíe las ubicaciones por mapa?", null, vitrina, escalones, 3))
      .toEqual({ pregunta: "Perfecto, 4 llantas.\n---\n¿Cuál le cotizo, la 1, la 2 o la 3?", menuSinElegir: true, cantidad: 4 });
  });

  it("«La 2 por favor» sigue eligiendo la 2 (chat 25901)", () => {
    expect(loQueEligio("La 2 por favor", "¿Le cotizo la 1, la 2 o la 3?", null, vitrina, escalones, 3))
      .toMatchObject({ codigo: "K" });
  });

  it("«Precio» con UNA sola opción en la lámina no es la respuesta a ningún menú (chat 27992)", () => {
    const unica = { economica: { codigo: "K20", nombre: "KENDA KR20", precio_con_iva: 84.95 }, equilibrada: { codigo: "K20", nombre: "KENDA KR20", precio_con_iva: 84.95 }, premium: { codigo: "K20", nombre: "KENDA KR20", precio_con_iva: 84.95 } };
    const vit = [{ codigo: "K20", marca: "KENDA", diseno: "KR20", medida: "195/45R15" }];
    expect(loQueEligio("Precio", "¿Le cotizo la *KENDA KR20* en *195/45R15*? 😊", null, vit, unica, 0)).toBeNull();
    expect(escalonContestado("Precio", "¿Le cotizo la *KENDA KR20* en *195/45R15*? 😊", null, { huboMenu: false })).toBeNull();
  });
});

describe("familia 2 — la equivalente única no se firma sin su sí (chat 27992)", () => {
  const base = {
    medidaProducto: "195/45R15",
    nombreProducto: "KENDA KR20",
    medidasDelCliente: ["185/45R15"],
    ultimoMensajeDelBot: "¿Le cotizo la *KENDA KR20* en *195/45R15*? 😊",
    textosDelCliente: ["¡Hola! Quiero más información", "185/45/R15"],
  };
  it("«Precio» a «¿Le cotizo la KR20 en 195/45R15?» NO es su sí", () => {
    expect(equivalenteSinConsentimiento({ ...base, textoDelCliente: "Precio" })).toBe(true);
  });
  it("«Si, por favor» a esa misma pregunta SÍ es su sí", () => {
    expect(equivalenteSinConsentimiento({ ...base, textoDelCliente: "Si, por favor" })).toBe(false);
    expect(equivalenteSinConsentimiento({ ...base, textoDelCliente: "Claro que si" })).toBe(false);
  });
  it("nombrarla sigue contando como elegirla («la kenda»)", () => {
    expect(equivalenteSinConsentimiento({ ...base, textoDelCliente: "la kenda" })).toBe(false);
  });
});

describe("la oferta viva: el sí puede contestar la pregunta de un turno atrás (simulador, chat 27992)", () => {
  const pregunta = "¿Le cotizo la *KENDA KR20* en *195/45R15*? 😊";
  it("«Precio» → precio sin pregunta (recortada por el anti-calco) → «Si»: la oferta sigue siendo la de la KR20", () => {
    expect(ultimaOfertaDeCotizar([
      { role: "assistant", content: pregunta },
      { role: "user", content: "Precio" },
      { role: "assistant", content: "La opción de costo es la *KENDA KR20* — *$84.95 c/u con IVA*, en *195/45R15* (equivalente de su aro)." },
      { role: "user", content: "Si" },
    ])).toBe(pregunta);
  });
  it("con la cotización ya enviada, o tres mensajes del cliente en el medio, ya no hay oferta viva", () => {
    expect(ultimaOfertaDeCotizar([
      { role: "assistant", content: pregunta },
      { role: "assistant", content: "Cotización COT-MV9UI40A enviada por $339.80" },
      { role: "user", content: "Si" },
    ])).toBeNull();
    expect(ultimaOfertaDeCotizar([
      { role: "assistant", content: pregunta },
      { role: "user", content: "a" }, { role: "user", content: "b" }, { role: "user", content: "c" },
      { role: "user", content: "Si" },
    ])).toBeNull();
  });
});

describe("familia 2 — «otra marca de mejor calidad» es una pregunta, no un escalón (chat 27097)", () => {
  it.each([
    "Y en otra marca de mejor calidad",
    "¿hay de mejor calidad?",
    "tiene otra mas barata?",
    "¿Cuál es la mejor?",
  ])("«%s» no elige escalón", (texto) => {
    expect(respuestaDePreferencia(texto)).toBeNull();
  });
  it.each([
    ["la mejor", "premium"],
    ["Premium", "premium"],
    ["la más barata", "precio"],
    ["La 2 por favor", "equilibrada"],
    ["mejor calidad", "premium"],
  ])("«%s» sigue eligiendo %s", (texto, esperado) => {
    expect(respuestaDePreferencia(texto)).toBe(esperado);
  });
});
