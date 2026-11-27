/**
 * SPRINT 4 — familia F-05 de la auditoría de Competimotor (26-nov-2026):
 * seguimientos y recordatorios fuera de lugar o con datos falsos.
 *
 * Los textos son los REALES de la base de Competimotor (chats 1273, 1011, 538,
 * 1247, 1790, 1375, 1456, 302), incluido el doble espacio de «X viernes  negro».
 * Las horas, en hora de Ecuador.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { leerVisita, porQueNoEsVisita, fechaParaAgendar } = await import("../src/domain/fechaDeVisita.js");
const { pidioTiempo } = await import("../src/domain/clientePosterga.js");
const { motivoParaNoSeguir } = await import("../src/domain/sinSeguimiento.js");
const { buildContextualFollowUpMessage, seguimientoSinContenido } = await import("../src/domain/followUpMessages.js");
type FollowUpMessageContext = import("../src/domain/followUpMessages.js").FollowUpMessageContext;
const { variablesDe, medidaQueSePuedeAfirmar } = await import("../src/services/recordatoriosDeVisita.js");
const { mereceRescate } = await import("../src/domain/rescateDeChat.js");
const { tipoDeCierreDelTurno } = await import("../src/domain/cierreTurno.js");

const ec = (iso: string) => new Date(`${iso}-05:00`);

// ── B. Visita inventada (1790) ───────────────────────────────────────────────
describe("B · un día dentro de una pregunta o del nombre de la promo no es visita", () => {
  const ahora = ec("2026-11-26T06:55:00"); // jueves
  const preguntando = { respondiendoAlDia: true };

  it("1790: «X viernes  negro  hay más descuento» (doble espacio) no registra visita", () => {
    expect(leerVisita("X viernes  negro  hay más descuento", ahora, preguntando)).toBeNull();
    expect(porQueNoEsVisita("X viernes  negro  hay más descuento")).toBe("pregunta");
  });

  it("agendar_visita tampoco puede registrarla con el día del modelo", () => {
    const r = fechaParaAgendar({ dia: "viernes", textoDelCliente: "X viernes  negro  hay más descuento", ahora, respondiendoAlDia: true });
    expect(r.fecha).toBeNull();
    expect(r.noEsVisita).toBe("pregunta");
  });

  it("1273 real: el día en una oración y la pregunta en otra → agendar_visita sí registra el miércoles (como en prod)", () => {
    const audio = "[El cliente mandó un audio. Dice: Mi pana, yo creo que para el día miércoles. Y parece que está cerca de Santo Domingo, o sea, en la vía que veo parece que vive ahí. Cuénteme una cosita más. Comprando el jueguito de llantas, ¿qué viene? ¿Llantas, alineación o solo venden las llantas? Cuénteme eso.]";
    expect(porQueNoEsVisita(audio)).toBeNull();
    const r = fechaParaAgendar({ dia: "miércoles", textoDelCliente: audio, ahora: ec("2026-11-23T11:57:00"), respondiendoAlDia: true });
    expect(r.noEsVisita).toBeUndefined();
    expect(new Date(r.fecha!.getTime() - 5 * 3_600_000).getUTCDay()).toBe(3);
  });

  it("1011: «la próxima semana voy… sin fondos» no se agenda con el día que pase el modelo", () => {
    const r = fechaParaAgendar({ dia: "jueves", textoDelCliente: "Mi amigo la próxima semana voy por qué me quedé ahora sin fondos gracias", ahora, respondiendoAlDia: true });
    expect(r.fecha).toBeNull();
    // Y el pipeline tampoco: «ahora» (de «me quedé ahora sin fondos») no es «hoy» (prod: visit_date 23-nov 15:00).
    expect(leerVisita("Mi amigo la próxima semana voy por qué me quedé ahora sin fondos gracias", ahora, preguntando)?.visitDate).toBeUndefined();
  });

  it.each([
    "el viernes hay más descuento?",
    "el viernes hay más descuento",
    "el sábado atienden?",
    "el sábado atienden",
    "black friday hay descuento",
    "Para el black friday",
    "viernes de descuentos",
    "y el viernes negro?",
  ])("«%s» no es visita", (texto) => {
    expect(leerVisita(texto, ahora, preguntando)?.visitDate ?? null).toBeNull();
  });

  it.each([
    ["Para el viernes", 5],                     // 1375, sano
    ["voy el sábado", 6],                        // 302, sano
    ["Mi pana, yo creo que para el día miércoles.", 3], // 1273 antes del audio, sano
    ["el viernes voy, hay parqueadero?", 5],     // pregunta lateral con verbo de visita: sigue valiendo
  ])("sano: «%s» sigue registrando el día", (texto, diaSemana) => {
    const r = leerVisita(texto, ahora, preguntando);
    expect(r?.visitDate).toBeTruthy();
    expect(new Date(r!.visitDate!.getTime() - 5 * 3_600_000).getUTCDay()).toBe(diaSemana);
  });
});

// ── A. El cliente pidió tiempo ───────────────────────────────────────────────
const AUDIO_1273 = "[El cliente mandó un audio. Dice: Ahí yo le escribo mi pana, porque cuando ya si ya vuelta reúno los billetes yo ahí le escribo para ver si están al mismo precio o han bajado o han subido.]";
const MSG_1011 = "Mi amigo la próxima semana voy por qué me quedé ahora sin fondos gracias";
const MSG_538 = "Yo le aviso por a ora estoy ocupado";
const MSG_1247 = "Por ahora no gracias";

describe("A · pedir tiempo es un hecho, no un «escríbame en 3 horas»", () => {
  it.each([AUDIO_1273, MSG_1011, MSG_538, MSG_1247])("pidioTiempo: %s", (texto) => {
    expect(pidioTiempo(texto)).toBe(true);
  });

  it.each([
    "voy el sábado",
    "[El cliente mandó un audio. Dice: Muy bien mi panita, muy bien. Entonces si no pasa nada el día miércoles yo lo visito tipo una de la tarde.]",
    "cuánto cuesta en efectivo?",
    "Si",
    "225/65R17",
  ])("no es pedir tiempo: %s", (texto) => {
    expect(pidioTiempo(texto)).toBe(false);
  });

  it("Competimotor (respetarPlazo): 1273 y 1011 quedan sin seguimiento automático", () => {
    expect(motivoParaNoSeguir({ ultimo: AUDIO_1273, rachaDelCliente: [AUDIO_1273], respetarPlazo: true })).toBe("pidio_tiempo");
    expect(motivoParaNoSeguir({ ultimo: MSG_1011, rachaDelCliente: [MSG_1011], respetarPlazo: true })).toBe("pidio_tiempo");
    // El «Ok» después del plazo no lo deshace (538).
    expect(motivoParaNoSeguir({ ultimo: "Ok", anterior: MSG_538, rachaDelCliente: ["Ok", MSG_538], respetarPlazo: true }))
      .not.toBeNull();
  });

  it("Depot (sin respetarPlazo): idéntico a antes", () => {
    expect(motivoParaNoSeguir({ ultimo: AUDIO_1273, rachaDelCliente: [AUDIO_1273] })).toBeNull();
    expect(motivoParaNoSeguir({ ultimo: MSG_1011, rachaDelCliente: [MSG_1011] })).toBeNull();
  });

  it("1247: «Por ahora no gracias» al asesor no se rescata con «¿Le puedo ayudar…?» (Competimotor)", () => {
    expect(mereceRescate({ ultimoDelCliente: MSG_1247, visitaRegistrada: false, respetarPlazo: true }).rescatar).toBe(false);
    // Depot igual que antes.
    expect(mereceRescate({ ultimoDelCliente: MSG_1247, visitaRegistrada: false }).rescatar).toBe(true);
  });

  it("538: el «Ok» que sigue a «yo le aviso» cierra el turno (Competimotor), no repregunta el día", () => {
    expect(tipoDeCierreDelTurno("Ok", MSG_538, { plazoCierraElAcuse: true })).toBe("acuse_del_cierre");
    expect(tipoDeCierreDelTurno("Ok", MSG_538)).toBeNull(); // Depot igual que antes
  });
});

// ── «Quedo pendiente» no se manda jamás (todos los clientes) ─────────────────
describe("un seguimiento que solo dice «quedo pendiente» no sale", () => {
  it.each([
    "Claro, quedo pendiente de su mensaje cuando pueda retomarlo 👍",
    "Claro, quedamos pendientes de su mensaje cuando pueda retomarlo 👍",
    "Quedo atento 🤝",
    "Quedo pendiente de su confirmación 👍",
    "Claro, quedo atento a su mensaje cuando pueda.",
  ])("vacío: %s", (texto) => {
    expect(seguimientoSinContenido(texto)).toBe(true);
  });

  it.each([
    "✅ Perfecto, le esperamos el *miércoles 25 de noviembre tipo una de la tarde* en Competimotor. Si tiene cualquier pregunta antes de pasar, dígame nomás 😊",
    "🛞 Para recomendarle opciones reales, ¿me confirma la medida que aparece en el costado de su llanta?",
    "😊 ¿Cómo vio la opción KENDA KR628? Si le sirve, ¿se la cotizo?",
    "Quedo pendiente: su cotización de 4 llantas TOWNHALL TH-AT802 sigue en $524.40. ¿Se la separo?",
  ])("con contenido: %s", (texto) => {
    expect(seguimientoSinContenido(texto)).toBe(false);
  });
});

// ── C. Con visita registrada no se repregunta el día (1375, un solo local) ──
describe("C · con un solo local y visita registrada, el seguimiento confirma", () => {
  const ctx: FollowUpMessageContext = {
    stage: "seguimiento_venta",
    tireSize: "265/75R16",
    nearestStore: null,
    storeNames: ["Competimotor"],
    customerCommitment: "Para el viernes",
    visitDate: new Date("2026-11-27T15:00:00Z"),
    quoteNumber: "COT-MWTX147F",
  };
  const ahora = ec("2026-11-24T16:48:00");

  it("1375: el segundo no pregunta «¿Qué día le quedaría más cómodo?»", () => {
    const texto = buildContextualFollowUpMessage(ctx, "in_window_second", ahora);
    expect(texto).not.toMatch(/qu[eé] d[ií]a/i);
    expect(texto).toMatch(/viernes 27 de noviembre/);
    expect(texto).toMatch(/Competimotor/);
  });

  it("Depot (dos locales, sin local elegido) sigue preguntando a cuál local, igual que antes", () => {
    const texto = buildContextualFollowUpMessage({ ...ctx, storeNames: ["Depot Tire Cumbayá", "Depot Tire Quito Sur"] }, "in_window_second", ahora);
    expect(texto).toMatch(/Cumbay/);
  });
});

describe("C · el recordatorio nombra lo COTIZADO, no la medida de la ficha", () => {
  it("302: se cotizó 275/55R20 y la ficha dice 285/50R20", () => {
    const v = { name: "Cliente", visit_date: new Date("2026-11-21T15:00:00Z"), nearest_store: null, tire_size: "285/50R20", medida_cotizada: "275/55R20" };
    expect(variablesDe("recordatorio", v, false)).toEqual(["Cliente", "sábado", "275/55R20"]);
    expect(medidaQueSePuedeAfirmar(v)).toBe("275/55R20");
  });
  it("1456: sin cotización no se afirma «ya tenemos listas sus llantas»", () => {
    const v = { name: "x", visit_date: new Date("2026-11-25T15:00:00Z"), nearest_store: "Competimotor", tire_size: "305/50R20", medida_cotizada: null };
    expect(medidaQueSePuedeAfirmar(v)).toBeNull();
  });
});

// ── D. Dos seguimientos distintos, cada uno con su pregunta de sí/no ────────
describe("D · Competimotor: el segundo seguimiento no repite la lista del primero", () => {
  const lista = {
    cantidad: 4,
    lista: [
      { n: 1, codigo: "A0058", nombre: "FALKEN ZE310R", precio: 202.4, total: 809.6 },
      { n: 2, codigo: "TOU-046", nombre: "TOURADOR FORCE A/T X", precio: 131.99, total: 527.96 },
    ],
  };
  const base: FollowUpMessageContext = {
    stage: "medida_confirmada",
    tireSize: "225/65R17",
    optionsCount: 2,
    optionsList: lista,
    optionsNames: ["FALKEN ZE310R", "TOURADOR FORCE A/T X"],
    storeNames: ["Competimotor"],
  };
  const conPregunta: FollowUpMessageContext = {
    ...base,
    seguimientoConPregunta: {
      incluido: "Comprando las 4 le incluye instalación, alineación, balanceo, nitrógeno y revisión de 20 puntos, sin costo",
      direccion: "Vía Quevedo km 1½ y Juan León Mera",
    },
    recomendada: { nombre: "TOURADOR FORCE A/T X", efectivo: 120.5, cantidad: 4 },
  };

  it("463 (sin cotización): la recomendada con precio en efectivo y una de sí/no que el «sí» sabe abrir, sin la lista", () => {
    const uno = buildContextualFollowUpMessage(conPregunta, "in_window_first");
    expect(uno).toMatch(/TOURADOR FORCE A\/T X/);
    expect(uno).toMatch(/efectivo/i);
    expect(uno).toMatch(/\$120\.50/);
    expect(uno).toMatch(/¿se la cotizo\?$/);
    expect(uno).not.toMatch(/^\d · /m);
  });

  it("con cotización: «sigue vigente», el precio en efectivo y «¿Se la separo?»", () => {
    const uno = buildContextualFollowUpMessage({ ...conPregunta, stage: "cotizacion_enviada", quoteNumber: "COT-X" }, "in_window_first");
    expect(uno).toBe("🛞 Su cotización de *4 llantas TOURADOR FORCE A/T X 225/65R17* sigue vigente. Pagando en efectivo o transferencia le queda en *$120.50* c/u (*$482.00* las 4). ¿Se la separo?");
  });

  it("segundo: lo incluido + ubicación + «¿le agendo una cita?», distinto del primero", () => {
    const uno = buildContextualFollowUpMessage(conPregunta, "in_window_first");
    const dos = buildContextualFollowUpMessage(conPregunta, "in_window_second");
    expect(dos).toMatch(/nitrógeno/);
    expect(dos).toMatch(/Vía Quevedo/);
    expect(dos).toMatch(/¿Le agendo una cita\?/);
    expect(dos).not.toMatch(/^\d · /m);
    expect(dos).not.toBe(uno);
  });

  it("sin medida, se sigue pidiendo la medida (633, 845, 884: sí revivían)", () => {
    const sinMedida = buildContextualFollowUpMessage({ stage: "nuevo", seguimientoConPregunta: conPregunta.seguimientoConPregunta }, "in_window_first");
    expect(sinMedida).toBe("🛞 Para recomendarle opciones reales, ¿me confirma la medida que aparece en el costado de su llanta?");
  });

  it("Depot (sin seguimientoConPregunta): la lista de siempre", () => {
    const uno = buildContextualFollowUpMessage(base, "in_window_first");
    expect(uno).toMatch(/^🛞 Estas son las opciones 225\/65R17 que le mostré:/);
  });
});
