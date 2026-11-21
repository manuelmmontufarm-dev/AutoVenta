/**
 * LA FICHA DEL CICLO ANTERIOR: lo que el bot sabe de la última compra del
 * cliente cuando el chat empieza un ciclo nuevo (conv 469, Competimotor, 21-nov).
 *
 * El bot solo lee su ciclo. Cuando la venta ganada se cerró y el cliente volvió
 * a escribir («Me confirma amigo si consiguió las llantas»), el ciclo nuevo
 * empezaba con la ficha vacía y el bot le pidió la medida desde cero a alguien
 * que ya había comprado 4 llantas. La regla aprobada (Manuel, 21-nov): cada
 * vez que se abre un ciclo nuevo —por cierre o por silencio— el bot recibe un
 * resumen CORTO y FIJO del ciclo anterior, hecho con datos guardados
 * (`sales_history`, `ventas_registradas`, `quotes`, el último mensaje de una
 * persona), nunca con texto adivinado.
 *
 * Desde el 21-nov «ganado» se marca cuando el cliente YA compró (el panel pide
 * factura y monto): el ciclo nuevo lo atiende el bot, y es esta ficha la que
 * evita que trate como desconocido a quien acaba de comprar.
 *
 * Con la ficha de una venta GANADA el bot no vuelve a pedir la medida de lo que
 * ya compró, y si el cliente pregunta por su pedido lo pasa al asesor.
 *
 * Pura: el lector de la base vive en `services/fichaDelCicloAnterior.ts`.
 */

export interface FichaDelCicloAnterior {
  cycle: number;
  resultado: "ganado" | "perdido";
  cerradoEn: Date;
  /** `sales_history.reason`: la nota del cierre («Compro 235/75R15 TOWNHALL MT») o el motivo. */
  nota: string | null;
  medida: string | null;
  /** «4 × KENDA KR601 235/75R15» (de la cotización) o el código elegido. */
  llanta: string | null;
  cotizacion: { numero: string | null; cantidad: number | null; total: number | null } | null;
  /** El registro de la venta (`ventas_registradas`): factura y monto, si el asesor los cargó. */
  venta?: { factura: string | null; monto: number | null } | null;
  local: string | null;
  /** Fecha de entrega/llegada (`pickup_date`, columna `date`). */
  entrega: Date | null;
  visita: Date | null;
  ultimoDelAsesor: { texto: string; en: Date } | null;
}

const MOTIVOS_SIN_VENTA: Array<[RegExp, string]> = [
  [/^reinicio por inactividad/i, "no se cerró: el chat se reinició por silencio, sin compra registrada"],
  [/^sin_respuesta$/i, "perdida: dejó de contestar"],
];

const enGuayaquil = (d: Date, conHora: boolean) =>
  d.toLocaleString("es-EC", {
    timeZone: "America/Guayaquil", weekday: "long", day: "numeric", month: "long",
    ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).replace(",", "");

/** Una columna `date` llega a medianoche UTC: se lee por su día calendario, no en Guayaquil. */
const diaDeColumnaDate = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 17)).toLocaleDateString("es-EC", {
    timeZone: "America/Guayaquil", weekday: "long", day: "numeric", month: "long",
  }).replace(",", "");

const recorte = (t: string, n: number) => {
  const limpio = t.replace(/\s+/g, " ").trim();
  return limpio.length > n ? `${limpio.slice(0, n - 1)}…` : limpio;
};

function lineaDeResultado(f: FichaDelCicloAnterior): string {
  const cuando = enGuayaquil(f.cerradoEn, true);
  if (f.resultado === "ganado") {
    return `Resultado: GANADA — el cliente YA COMPRÓ — el ${cuando}.${f.nota ? ` Nota del asesor al cerrar: «${recorte(f.nota, 160)}».` : ""}`;
  }
  const sinVenta = MOTIVOS_SIN_VENTA.find(([re]) => re.test(f.nota ?? ""));
  if (sinVenta) return `Resultado: ${sinVenta[1]} (${cuando}).`;
  return `Resultado: perdida (${cuando})${f.nota && f.nota !== "perdido" ? `: «${recorte(f.nota, 160)}»` : ""}.`;
}

/** El bloque de hechos que va al vendedor y al Ángel Guardián. Null si no hay ficha. */
export function textoDeLaFicha(ficha: FichaDelCicloAnterior | null | undefined): string | null {
  if (!ficha) return null;
  const c = ficha.cotizacion;
  const lineas = [
    lineaDeResultado(ficha),
    ficha.medida || ficha.llanta
      ? [ficha.medida ? `Medida: ${ficha.medida}` : null, ficha.llanta ? `Llanta: ${ficha.llanta}` : null]
        .filter(Boolean).join(" · ")
      : null,
    c && (c.numero || c.total != null)
      ? `Cotización: ${[
          c.numero ? `${c.numero} (no le escribas el número)` : null,
          c.cantidad ? `${c.cantidad} llanta${c.cantidad === 1 ? "" : "s"}` : null,
          c.total != null ? `total $${c.total.toFixed(2)}` : null,
        ].filter(Boolean).join(", ")}`
      : null,
    ficha.venta && (ficha.venta.factura || ficha.venta.monto != null)
      ? `Venta registrada: ${[
          ficha.venta.factura ? `factura ${ficha.venta.factura}` : null,
          ficha.venta.monto != null ? `monto $${ficha.venta.monto.toFixed(2)}` : null,
        ].filter(Boolean).join(", ")}`
      : null,
    ficha.local ? `Local: ${ficha.local}` : null,
    ficha.entrega ? `Fecha de entrega/llegada: ${diaDeColumnaDate(ficha.entrega)}` : null,
    ficha.visita ? `Visita: ${enGuayaquil(ficha.visita, false)}` : null,
    ficha.ultimoDelAsesor
      ? `Lo último que le escribió el asesor (${enGuayaquil(ficha.ultimoDelAsesor.en, true)}): «${recorte(ficha.ultimoDelAsesor.texto, 200)}»`
      : null,
  ].filter((l): l is string => Boolean(l));

  const instruccion = ficha.resultado === "ganado"
    ? "Este cliente YA TE COMPRÓ. PROHIBIDO pedirle otra vez la medida, el aro o una foto de lo que ya compró, PROHIBIDO volver a cotizarle esa compra y PROHIBIDO presentarte como si no lo conocieras. Si pregunta por su pedido —si llegaron o se consiguieron las llantas, la entrega, la instalación, el pago, la factura o la garantía— NO lo resuelvas tú ni le prometas nada: dile en una línea que le pasas con el asesor que lo atendió y llama notificar_vendedor con motivo caso_sin_resolver. Solo si pide algo NUEVO (otra medida, otro carro) atiéndelo como siempre, sin pedirle lo que ya está en esta ficha."
    : "Esa compra no se cerró: es contexto. Si vuelve por lo mismo, confírmale lo que ya está aquí en vez de pedírselo de nuevo; si viene por otra cosa, atiéndelo como siempre.";

  return [
    `FICHA DE LA COMPRA ANTERIOR (ciclo ${ficha.cycle}, datos guardados — no los completes ni los adivines):`,
    ...lineas.map((l) => `- ${l}`),
    instruccion,
  ].join("\n");
}
