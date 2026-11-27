/**
 * CHAT 1974 (Competimotor, 27-nov-2026): cotizó 4 y el cliente dijo «Esta caro
 * solo dos necesito». En producción el bot contestó con los totales de 4
 * ($611.80 en efectivo) y ofreció otra marca. Lo que tiene que pasar: los
 * precios por 2 (tarjeta y efectivo) y la ficha en 2.
 *
 *   node scripts/sim/competimotor-flota.mjs --escenarios scripts/sim/escenarios-1974-cantidad.mjs --reps 3
 *
 * Mensajes del cliente textuales. Medida del inventario de Fénix del 27-nov.
 */
const textoDelTurno = (t) => JSON.stringify(t?.bot ?? "");
const ultimo = (turnos) => turnos.at(-1);

const checksDeDos = [
  ["el último turno contestó", (turnos) => (textoDelTurno(ultimo(turnos)).length > 4 ? null : "sin respuesta")],
  ["habla de 2 llantas", (turnos) => (/2 llantas/.test(textoDelTurno(ultimo(turnos))) ? null : `no dice «2 llantas»: ${textoDelTurno(ultimo(turnos)).slice(0, 300)}`)],
  ["no repite los totales de 4", (turnos) => {
    const t = textoDelTurno(ultimo(turnos));
    return /\b4 llantas: |— 4 llantas|\*4 llantas\*|671\.60|611\.80/.test(t) ? `trae el total de 4: ${t.slice(0, 300)}` : null;
  }],
  ["la ficha quedó en 2", (_t, e) => (e?.selected_quantity == null || Number(e.selected_quantity) === 2 ? null : `selected_quantity = ${e.selected_quantity}`)],
];

export const ESCENARIOS = [
  {
    id: "R1974", familia: "caro-cantidad", grupo: "completa",
    titulo: "1974 textual: cotiza 4 × 255/60R15 y «Esta caro solo dos necesito»",
    mensajes: ["¡Hola! Quiero más información", "255/60/15", "Si", "Esta  caro solo dos necesito"],
    checks: checksDeDos,
  },
  {
    id: "R1974b", familia: "caro-cantidad", grupo: "completa",
    titulo: "Variante: «muy caro, necesito solo 2» tras la cotización",
    mensajes: ["Buenas tardes", "precio de 255/60R15", "si cotíceme", "muy caro, necesito solo 2"],
    checks: checksDeDos,
  },
  {
    id: "R1974c", familia: "caro-cantidad", grupo: "completa",
    titulo: "Control: «está caro» sin cantidad sigue con lo de siempre (efectivo de 4)",
    mensajes: ["¡Hola! Quiero más información", "255/60/15", "Si", "Esta caro"],
    checks: [
      ["el último turno contestó", (turnos) => (textoDelTurno(ultimo(turnos)).length > 4 ? null : "sin respuesta")],
      ["sigue hablando de 4 (no se inventa otra cantidad)", (turnos) => (/2 llantas/.test(textoDelTurno(ultimo(turnos)).replace(/comprando 2 o 4 llantas/g, "")) ? "cambió la cantidad sin que la dijera" : null)],
    ],
  },
];
