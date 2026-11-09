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
