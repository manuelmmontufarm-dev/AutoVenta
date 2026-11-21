/**
 * «uno», «la dos», «opción tres» y los botones 1 / 2 / 3 (Competimotor, 20-nov-2026).
 *
 * Capacitación: Carlos vio que, con la lista de 3 opciones en pantalla, el
 * cliente que contestaba «uno» recibía otra vez «¿Le cotizo la 1, la 2 o la
 * 3?». Estos escenarios arrancan todos desde la misma lista (grupo `etapa`) y
 * comprueban que cada forma de elegir cotiza LA llanta correcta, en el mismo
 * turno, sin repreguntar; y que las cantidades con letras («quiero dos»,
 * «mejor solo uno») siguen siendo cantidades.
 *
 *   node scripts/sim/competimotor-flota.mjs --escenarios scripts/sim/escenarios-opcion-letras-botones.mjs \
 *     --catalogo-archivo scripts/sim/datos/competimotor-inventario-20nov.xls --reps 3
 *
 * Las llantas esperadas son las del inventario de Fénix del 20-nov (INV_NOV.XLS,
 * el que está cargado en producción): con otro inventario la lista cambia y el
 * prefijo lo dice en voz alta (no se juzga sobre una lista distinta).
 */

// La lista que sale para 4 llantas 205/55R16 con el inventario del 20-nov.
const TRES = ["TOWNHALL TH161", "WINRUN R330", "KENDA KR20"];
// Y para 4 llantas 185/60R14 (solo dos opciones).
const DOS = ["TOWNHALL TH-161", "KENDA KR20"];

const PREGUNTA_TRES = /¿Le cotizo la 1, la 2 o la 3\?/;
const PREGUNTA_DOS = /¿Le cotizo la 1 o la 2\?/;
const REPREGUNTA = /¿(?:Le|Cuál le) cotizo,? la 1/i;

const textoDe = (items) => JSON.stringify(items ?? []).toUpperCase();
const cantidadDe = (items) => {
  const m = JSON.stringify(items ?? []).match(/"(?:cantidad|quantity|qty)"\s*:\s*(\d+)/i);
  return m ? Number(m[1]) : null;
};

/** El prefijo dejó la lista en pantalla con la pregunta (y sus botones, si se esperan). */
const listaEnPantalla = (pregunta, botones) => [
  ["la última pregunta del bot es la de la lista", (e) => (pregunta.test(e?.ultimo_del_bot?.texto ?? "") ? null : `último del bot: ${JSON.stringify(e?.ultimo_del_bot?.texto)}`)],
  ["salió con botones", (e) => {
    const n = e?.ultimo_del_bot?.botones?.length ?? 0;
    return n === botones ? null : `${n} botones (se esperaban ${botones})`;
  }],
  ["todavía no hay cotización", (e) => (e?.cotizaciones?.length ? `ya hay ${e.cotizaciones.length}` : null)],
];

/** El turno N cotizó esa llanta, con esa cantidad, y no volvió a preguntar cuál. */
const cotizo = (nombre, cantidad = 4, turno = 0) => [
  [`turno ${turno + 1}: cotizó la ${nombre}`, (t, e) => {
    if (!t[turno]?.cotizacionesNuevas) return `no salió cotización en el turno ${turno + 1}; el bot dijo: ${JSON.stringify(t[turno]?.bot?.map((b) => b.texto))}`;
    const ultima = e?.cotizaciones?.at(-1);
    const partes = nombre.toUpperCase().split(/\s+/);
    return partes.every((p) => textoDe(ultima?.items).includes(p)) ? null : `cotizó otra: ${textoDe(ultima?.items).slice(0, 160)}`;
  }],
  [`turno ${turno + 1}: por ${cantidad} llantas`, (_t, e) => {
    const n = cantidadDe(e?.cotizaciones?.at(-1)?.items);
    return n === cantidad ? null : `cantidad ${n}`;
  }],
  [`turno ${turno + 1}: no repreguntó cuál`, (t) => {
    const repite = (t[turno]?.bot ?? []).find((b) => REPREGUNTA.test(b.texto ?? ""));
    return repite ? `repreguntó: «${repite.texto}»` : null;
  }],
];

/** El turno N NO eligió una opción: ni cotización ni opción nombrada como elegida. */
const noEligio = (turno = 0) => [
  [`turno ${turno + 1}: no cotizó (no dijo cuál)`, (t) => (t[turno]?.cotizacionesNuevas ? `cotizó ${t[turno].cotizacionesNuevas}` : null)],
];

const PREFIJO_TRES = [["hola"], ["precio de 4 llantas 205/55R16"]];
const PREFIJO_DOS = [["hola"], ["precio de 4 llantas 185/60R14"]];
const tocar = (n) => [{ boton: { tocar: n } }];

const etapa = (id, titulo, prefijo, esperado, mensajes, checks) => ({
  id, familia: "opcion-en-letras", grupo: "etapa", titulo, prefijo, estadoEsperadoPrefijo: esperado, mensajes, checks,
});
const L3 = listaEnPantalla(PREGUNTA_TRES, 3);
const L2 = listaEnPantalla(PREGUNTA_DOS, 2);

export const ESCENARIOS = [
  // ── Con letras (lo que reportó Carlos) ──
  etapa("OL1", "«uno» → la 1", PREFIJO_TRES, L3, ["uno"], cotizo(TRES[0])),
  etapa("OL2", "«la dos» → la 2", PREFIJO_TRES, L3, ["la dos"], cotizo(TRES[1])),
  etapa("OL3", "«opción tres» → la 3", PREFIJO_TRES, L3, ["opción tres"], cotizo(TRES[2])),
  etapa("OL4", "«la dos porfa» → la 2", PREFIJO_TRES, L3, ["la dos porfa"], cotizo(TRES[1])),
  etapa("OL5", "«el tres» → la 3", PREFIJO_TRES, L3, ["el tres"], cotizo(TRES[2])),

  // ── Tocando los botones ──
  etapa("BT1", "toca el botón 1", PREFIJO_TRES, L3, [tocar(1)], cotizo(TRES[0])),
  etapa("BT2", "toca el botón 2", PREFIJO_TRES, L3, [tocar(2)], cotizo(TRES[1])),
  etapa("BT3", "toca el botón 3", PREFIJO_TRES, L3, [tocar(3)], cotizo(TRES[2])),
  etapa("BT4", "dos opciones: toca el botón 2", PREFIJO_DOS, L2, [tocar(2)], cotizo(DOS[1])),
  etapa("OL6", "dos opciones: «la uno»", PREFIJO_DOS, L2, ["la uno"], cotizo(DOS[0])),

  // ── Cantidades con letras: no eligen, y la elección después no las cambia ──
  etapa("CQ1", "«quiero dos» no elige; después «la dos» cotiza 2 de la 2",
    PREFIJO_TRES, L3, ["quiero dos", "la dos"], [...noEligio(0), ...cotizo(TRES[1], 2, 1)]),
  etapa("CQ2", "«mejor solo uno» no elige; después toca el 3 y cotiza 1 de la 3",
    PREFIJO_TRES, L3, ["mejor solo uno", tocar(3)], [...noEligio(0), ...cotizo(TRES[2], 1, 1)]),

  // ── Meta rechaza los botones: sale el mismo texto, y «la 2» escrito sigue cotizando ──
  etapa("FB1", "botones rechazados → la pregunta sale como texto",
    [["hola"], [{ graph: { rechazarBotones: true } }, "precio de 4 llantas 205/55R16"]],
    listaEnPantalla(PREGUNTA_TRES, 0), ["la 2"], cotizo(TRES[1])),
];
