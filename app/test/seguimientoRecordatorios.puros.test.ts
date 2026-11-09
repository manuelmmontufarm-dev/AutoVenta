/**
 * SPRINT 2 · RECORDATORIOS AUTOMÁTICOS — las pruebas puras (sin base de datos).
 *
 * Auditoría del 9-nov-2026. Cada bloque nombra la sub-familia y el chat real:
 *
 * - 2d (39282, 40097): `ofreceJuegoIncompleto` lee una NEGACIÓN («solo hay 1
 *   unidad, no puedo ofrecerla») como una oferta de 1 llanta y el candado
 *   `guardian_no_vende_solo` devuelve el borrador que el propio Guardián acaba
 *   de calificar de error.
 * - 2c1 (38924, 39667, 39282): el gate previo `motivoParaNoSeguir` solo conoce
 *   frases exactas y devuelve null con lo que el cliente dijo de verdad.
 * - 2c3 (21106): el texto fijo de compra a distancia afirma una compra («Quedó
 *   en marcha su compra…») que el cliente nunca anunció.
 *
 * Estas pruebas están en ROJO a propósito hasta que el sprint arregle el código.
 * Las marcadas «guarda» pasan hoy y no pueden dejar de pasar.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

import { frenarHechosNuevosDelGuardian } from "../src/domain/guardianNoVendeSolo.js";
import { motivoParaNoSeguir } from "../src/domain/sinSeguimiento.js";
import { buildContextualFollowUpMessage } from "../src/domain/followUpMessages.js";

// ---------------------------------------------------------------------------
// 2d · la negación no es una oferta
// ---------------------------------------------------------------------------

/** El borrador de 39282 (11-07 08:30): el menú que el cliente ya había rechazado. */
const MENU_39282 =
  "🛞 Estas son las opciones 265/65R18 que le mostré:\n"
  + "1 · KENDA KR50 — $207.11 c/u · 4 = $828.44\n"
  + "2 · FALKEN ZIEX CT60 A/S — $254.05 c/u · 4 = $1016.20\n"
  + "¿Le cotizo la 1 o la 2?";

/** Las dos correcciones reales del Guardián en 39282 (alertas guardian_hecho_nuevo_bloqueado). */
const CORRECCION_1 =
  "Para doble propósito en *265/65R18* le confirmé la *Falken Wildpeak A/T 4W*, pero hoy solo hay *1 unidad*, "
  + "así que no puedo ofrecerla para juego de 4. Si desea, puedo revisar con el asesor si se puede conseguir el juego completo por pedido.";
const CORRECCION_2 =
  "Entiendo 👍 Para *doble propósito A/T* en 265/65R18 hoy solo me aparece la *FALKEN WILDPEAK A/T 4W*, pero hay *1 unidad disponible*, "
  + "así que no puedo ofrecerle el juego de 4 por stock. Si más adelante desea revisar otra opción disponible, con gusto le ayudo.";
/** 40097 (11-08 18:12): «solo 3, no la manejo vendible» se leyó como si ofreciera 3. */
const CORRECCION_40097 =
  "Sí tengo la FALKEN WILDPEAK R/T01, pero hoy aparecen 3 unidades y para juego de 4 no la manejo vendible. Es una R/T para uso 4x4 mixto.";

describe("2d · ofreceJuegoIncompleto no lee una negación como oferta", () => {
  const PRODUCTOS = [
    { code: "356525", brand: "FALKEN", design: "WILDPEAK A/T 4W" },
    { code: "K516B803", brand: "KENDA", design: "KR50" },
  ];

  it.each([
    ["39282, 1.ª corrección", CORRECCION_1],
    ["39282, 2.ª corrección", CORRECCION_2],
    ["40097, el turno normal", CORRECCION_40097],
    ["la frase mínima del informe", "…solo hay 1 unidad, no puedo ofrecerla…"],
    ["«no hay juego»", "Para esa medida hoy no hay juego completo, solo 2 llantas disponibles; no se la puedo cotizar por stock."],
  ])("%s: el candado la deja pasar", (_caso, correccion) => {
    // La Wildpeak A/T 4W ya se la había nombrado el bot al cliente (11-06 15:00): es «lo ya dicho».
    const yaDicho = `${MENU_39282}\nEn su medida 265/65R18 me aparece Falken Wildpeak A/T 4W, pero solo con 1 llanta disponible.`;
    const r = frenarHechosNuevosDelGuardian(MENU_39282, correccion, PRODUCTOS, yaDicho);
    expect(r.motivos).not.toContain("juego_incompleto");
    expect(r.bloqueado).toBe(false);
    expect(r.texto).toBe(correccion);
  });

  // Revisión ronda 1, bloqueante 1: la negación tiene que regir el VERBO de la
  // oferta; un «no» cualquiera («no alcanzan», «no le puedo hacer descuento») no
  // la anula, y una propuesta de venta en CUALQUIER cláusula sigue siendo oferta.
  it.each([
    "Hoy hay 3 unidades disponibles, no alcanzan para el juego, ¿le cotizo las 3?",
    "Hoy solo tengo 2 llantas, no alcanzan para el juego; si desea, le cotizo esas 2.",
    "Tengo 3 llantas disponibles, no le puedo hacer descuento, ¿se las cotizo?",
    "Solo quedan 3 llantas, no hay juego de 4, pero le consigo la cuarta por pedido.",
    "Hay 1 unidad disponible y no puedo garantizar la segunda, ¿le sirve?",
  ])("guarda · sigue siendo oferta aunque diga «no»: %s", (correccion) => {
    const r = frenarHechosNuevosDelGuardian("En 195/55R15 no tengo stock disponible ahora mismo.", correccion, [], "", []);
    expect(r.bloqueado).toBe(true);
    expect(r.motivos).toContain("juego_incompleto");
  });

  // Revisión ronda 2: la propuesta no puede depender de una lista cerrada de verbos.
  it.each([
    "Tengo 3 llantas, no puedo ofrecerle la cuarta; ¿le interesan las 3?",
    "Hay 2 unidades disponibles, no puedo cotizarle el juego, pero si quiere le vendo esas 2.",
    "Quedan 2 llantas de esa, no puedo cotizarle el juego completo. ¿Las aparta?",
  ])("guarda · sigue siendo oferta con cualquier verbo de propuesta: %s", (correccion) => {
    const r = frenarHechosNuevosDelGuardian("En 195/55R15 no tengo stock disponible ahora mismo.", correccion, [], "", []);
    expect(r.bloqueado).toBe(true);
  });

  // Y las correcciones BUENAS que explican y vuelven al menú o al juego completo salen.
  it.each([
    "Hoy solo hay 2 llantas de la Wildpeak, así que no puedo ofrecerla. ¿Le cotizo la 1 o la 2 del menú?",
    "De la Wildpeak hay 1 unidad, no se la puedo cotizar para juego. La KR50 sí está en juego de 4: ¿le cotizo la 1?",
    "Hoy solo hay 1 unidad de la Wildpeak, no puedo ofrecerla. ¿Le cotizo la 1 o la 2?",
    "Hay 2 unidades de esa, no puedo ofrecerlas; ¿le cotizo el juego de 4 de la KR50?",
  ])("la corrección buena sale: %s", (correccion) => {
    const r = frenarHechosNuevosDelGuardian(MENU_39282, correccion, [], MENU_39282);
    expect(r.motivos).not.toContain("juego_incompleto");
  });

  // GUARDA — lo que el candado SÍ debe frenar (caso 11972 y variantes).
  it.each([
    ["11972: ofrece 1 KENDA a un precio",
      "En *195/55R15* hoy tengo disponible *1 unidad KENDA KR20* a *$82.42 c/u con IVA*.\nPara completar el juego, un asesor puede confirmarle llegada."],
    ["ofrece 1 unidad y pregunta", "Solo le puedo ofrecer 1 unidad de la KENDA KR50, ¿se la cotizo?"],
    ["ofrece 2 llantas", "Le ofrezco 2 llantas de esa medida, ¿se las cotizo?"],
    ["hay 3 unidades disponibles y propone cotizarlas", "Hoy hay 3 unidades disponibles de esa medida, ¿le cotizo las 3?"],
  ])("guarda · %s sigue bloqueada", (_caso, correccion) => {
    const r = frenarHechosNuevosDelGuardian("En 195/55R15 no tengo stock disponible ahora mismo.", correccion, [], "", []);
    expect(r.bloqueado).toBe(true);
    expect(r.motivos).toContain("juego_incompleto");
  });
});

// ---------------------------------------------------------------------------
// 2c1 · el gate previo con lo que el cliente dijo de verdad
// ---------------------------------------------------------------------------

describe("2c1 · motivoParaNoSeguir reconoce las frases reales", () => {
  it.each([
    ["39282", "Ninguna gracias, necesito llantas doble propósito"],
    ["38924", "Está muy lejos le agradezco"],
    ["39667 (1)", "No nos espere"],
    ["39667 (2)", "Encontramos las BFGoodrich"],
    ["variante singular", "No me espere, gracias"],
    ["variante plural", "Ningunas gracias"],
    ["variante encontré", "Ya encontré unas llantas, gracias"],
  ])("%s: «%s» deja de devolver null", (_chat, frase) => {
    expect(motivoParaNoSeguir({ ultimo: frase })).not.toBeNull();
  });

  // GUARDA — la venta viva no se corta (el mismo cuidado que TRAE_RESTRICCION_DE_LLANTA).
  it.each([
    "Está muy lejos pero voy el sábado",
    "Queda lejos, igual paso mañana por el local",
    "¿Ninguna de esas viene en rin 17?",
    "Necesito llantas doble propósito",
    "Encontré la medida en el costado, es 265/65R18",
    "Gracias, déjeme pensarlo",
  ])("guarda · «%s» sigue siendo venta viva", (frase) => {
    const motivo = motivoParaNoSeguir({ ultimo: frase });
    // «déjeme pensarlo» ya tenía su regla propia; solo importa que no sea ninguna de las nuevas.
    if (motivo !== null) expect(["el_cliente_avisa", "espera_que_le_avisen", "cierre_del_cliente"]).toContain(motivo);
    expect(motivo).not.toBe("compro_en_otro_lugar");
  });
});

// Revisión ronda 1, bloqueante 2: el rechazo no cancela una venta viva.
describe("2c1 · un mensaje que sigue vendiendo no es un rechazo", () => {
  it.each([
    "No nos espere hoy, mañana sí vamos",
    "No nos espere hoy, vamos otro día",
    "Está muy lejos Cumbayá, ¿tienen local en el sur?",
    "Es muy lejos el norte, voy al de la Shyris mejor",
    "Encontré la llanta en su página, la KR601, ¿tienen?",
    "Encontré las llantas que buscaba en su catálogo, ¿me cotiza 4?",
    "Conseguí unas Kenda más baratas, me mejora el precio?",
    "ninguna de esas gracias, ¿tiene en rin 17?",
  ])("guarda · «%s» sigue con seguimiento", (frase) => {
    expect(motivoParaNoSeguir({ ultimo: frase, rachaDelCliente: [frase] })).toBeNull();
  });

  it("un «No nos espere» viejo no cuenta si un mensaje POSTERIOR de la racha reactiva la venta", () => {
    expect(motivoParaNoSeguir({
      ultimo: "¿Entonces mañana sí me atienden?",
      rachaDelCliente: ["¿Entonces mañana sí me atienden?", "No nos espere"],
    })).toBeNull();
    expect(motivoParaNoSeguir({
      ultimo: "Gracias, voy el sábado",
      rachaDelCliente: ["Gracias, voy el sábado", "Está muy lejos le agradezco"],
    })).toBeNull();
  });

  it("guarda · 39667: «No nos espere» + «Gracias» + «Muy amable» sigue cancelando", () => {
    expect(motivoParaNoSeguir({
      ultimo: "Muy amable",
      rachaDelCliente: ["Muy amable", "Gracias", "No nos espere", "Encontramos las BFGoodrich"],
    })).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2c3 · el texto fijo de compra a distancia no afirma una compra
// ---------------------------------------------------------------------------

describe("2c3 · la compra a distancia sin compra anunciada", () => {
  const FUERA_DE_QUITO = {
    stage: "cotizacion_enviada" as const,
    tireSize: "265/65R18",
    selectedProductCode: "K516B803",
    selectedProductLabel: "KENDA KR50",
    quoteNumber: "COT-21106",
    sinVisita: "compra_a_distancia" as const,
  };

  it.each(["in_window_first", "in_window_second"] as const)("%s no dice que la compra «quedó en marcha»", (kind) => {
    const texto = buildContextualFollowUpMessage(FUERA_DE_QUITO, kind);
    expect(texto).not.toMatch(/en marcha/i);
    expect(texto).not.toMatch(/su compra/i);
    expect(texto).toMatch(/cotizaci[oó]n de KENDA KR50/i);
    expect(texto).toMatch(/coordinar el pago y el env[ií]o/i);
    expect(texto).toMatch(/asesor/i);
  });

  it("guarda · sin mapas ni día (21766)", () => {
    for (const kind of ["in_window_first", "in_window_second"] as const) {
      expect(buildContextualFollowUpMessage(FUERA_DE_QUITO, kind)).not.toMatch(/maps\.app|goo\.gl|qué día|cuál local/i);
    }
  });
});
