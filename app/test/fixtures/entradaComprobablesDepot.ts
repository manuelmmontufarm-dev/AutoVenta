/**
 * Entrada fija estilo Depot (facturas de Contífico + ventas del cruce + chats)
 * para comprobar que la fuente «registro» no cambió NADA del camino de
 * facturas: `comprobables-depot-antes.json` es la salida de `armarComprobables`
 * con esta entrada, generada sobre main ANTES del cambio (21-nov-2026).
 */
type Grupo = "bot" | "bot_y_asesor" | "asesor";
export function entradaDepot() {
  const chats = Array.from({ length: 40 }, (_, i) => {
    const mes = i < 15 ? "08" : i < 28 ? "09" : "10";
    const dia = String(1 + ((i * 7) % 27)).padStart(2, "0");
    return {
      id: i + 1, dia: `2026-${mes}-${dia}`, hora: (i * 5) % 24, conMedida: i % 3 !== 0, cotizado: i % 4 !== 0,
      conDiaDeVisita: i % 5 === 0, primerMensajeConAnuncio: i % 6 === 0 ? null : i % 2 === 0,
    };
  });
  const grupos: Grupo[] = ["bot", "bot_y_asesor", "asesor"];
  const ventas = chats.filter((c) => c.id % 3 === 0).map((c, k) => {
    const d = new Date(`${c.dia}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + (k % 9));
    const total = 115 * (1 + (k % 4));
    return {
      ticketId: c.id, total, sinIva: Math.round((total / 1.15) * 100) / 100, dia: d.toISOString().slice(0, 10),
      hora: k % 5 === 0 ? null : 8 + (k % 10), grupo: grupos[k % 3], primerDia: c.dia,
    };
  });
  const facturas = [
    ...ventas.map((v) => ({ dia: v.dia, hora: v.hora, llantas: [{ nombre: "KENDA 205/55R16", cantidad: 4, precio: 100 }] })),
    ...Array.from({ length: 30 }, (_, i) => ({
      dia: `2026-${i < 10 ? "08" : i < 20 ? "09" : "10"}-${String(1 + ((i * 11) % 27)).padStart(2, "0")}`,
      hora: i % 7 === 0 ? null : 7 + (i % 12),
      llantas: [{ nombre: "FALKEN 265/70R16", cantidad: 2, precio: i % 9 === 0 ? 10 : 150 }],
    })),
  ];
  return {
    hoy: "2026-10-23", disponible: true, ultimaSync: "2026-10-23T15:00:00.000Z",
    facturas, ventas, chats, primerDiaConAnuncio: "2026-09-19",
  };
}
