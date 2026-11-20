/**
 * Tres conversaciones de PRUEBA DE LA FLOTA (una por grupo), para comprobar
 * que el corredor funciona mientras llegan las 40 de verdad
 * (`datos/competimotor-40.mjs`). No miden al bot a fondo: miden que la
 * cañería de cada modalidad hace lo que dice.
 *
 *   node scripts/sim/competimotor-flota.mjs --escenarios scripts/sim/escenarios-prueba-competimotor.mjs --reps 1
 *
 * Medidas tomadas del inventario real de Fénix (6-nov): 265/70R16 y 205/55R16
 * están entre las que más modelos tienen.
 */
const medida = (re) => (estado) => (re.test(String(estado?.tire_size ?? "")) ? null : `tire_size es ${JSON.stringify(estado?.tire_size)}`);

export const ESCENARIOS = [
  {
    id: "PF-E1", familia: "prueba", grupo: "etapa",
    titulo: "Etapa: ya cotizado 265/70R16, pregunta por tarjeta y pide 2",
    prefijo: ["Buenas tardes", ["necesito 4 llantas", "265/70R16 para una hilux"]],
    estadoEsperadoPrefijo: [["la medida quedó en la ficha", medida(/265\/70\s*R?\s*16/i)]],
    mensajes: [["cuanto sale con tarjeta?", "y si llevo solo 2"]],
    checks: [
      ["el turno contestó algo", (turnos) => (turnos[0]?.bot?.length ? null : "sin respuesta")],
      ["la medida sigue siendo 265/70R16", (_t, e) => medida(/265\/70\s*R?\s*16/i)(e)],
    ],
  },
  {
    id: "PF-C1", familia: "prueba", grupo: "completa",
    titulo: "Completa: desde el hola hasta pedir precio de 205/55R16",
    mensajes: ["hola", "precio de llantas 205/55R16", "son para un mazda 3"],
    checks: [
      ["la medida quedó en la ficha", (_t, e) => medida(/205\/55\s*R?\s*16/i)(e)],
    ],
  },
  {
    id: "PF-T1", familia: "prueba", grupo: "tiempo",
    titulo: "Tiempo: escribe la medida mientras el bot todavía piensa el saludo",
    mensajes: [
      "hola buenas",
      { texto: "tienen 205/55R16?", pausaAntesMs: 5000 },
      { textos: ["son 4", "para un corolla"], pausaEntreMs: 3000 },
    ],
    checks: [
      ["la medida quedó en la ficha", (_t, e) => medida(/205\/55\s*R?\s*16/i)(e)],
    ],
  },
];
