/**
 * Celebración de una venta del bot (pedido de Manuel, 8-nov-2026).
 *
 * La venta se cierra en el local y vuelve al sistema recién cuando Contífico
 * trae la factura y el cruce la liga al chat (`services/ventasConfirmadas.ts`).
 * Hasta ahora eso solo se veía en Métricas; ahora además le llega a los
 * asesores un mensaje de festejo, una vez por venta.
 *
 * Todo lo de aquí es puro: qué ventas se festejan y con qué texto. El envío
 * (y el «una sola vez») lo pone `notifyAdvisor` con su clave de dedupe.
 */

/** Lo que hace falta de una venta confirmada para festejarla. */
export interface VentaParaCelebrar {
  ticketId: number;
  /** Día de la primera factura con llantas, "YYYY-MM-DD". */
  dia: string;
  /** Día del primer mensaje del chat, "YYYY-MM-DD". */
  primerDia: string;
  total: number;
  llantas: string;
  facturas: Array<{ local: string }>;
  atendio: "bot" | "asesor";
  cotizado: boolean;
}

/** "YYYY-MM-DD" del día anterior, sin zona horaria de por medio. */
function diaAnterior(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number {
  const ms = Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * Las ventas que merecen festejo ahora mismo:
 *  - las que atendió el bot (si el asesor escribió más que el bot, la venta es
 *    del asesor: mismo criterio que la tarjeta de Métricas);
 *  - facturadas hoy o ayer. El cruce recorre TODO el histórico desde agosto; sin
 *    este corte, el primer arranque festejaría cien ventas viejas de golpe.
 *    Ayer entra porque una factura de las 23:50 llega en la bajada de las 00:05.
 */
export function ventasParaCelebrar<V extends VentaParaCelebrar>(ventas: V[], hoy: string): V[] {
  const ayer = diaAnterior(hoy);
  return ventas.filter((v) => v.atendio === "bot" && v.dia >= ayer && v.dia <= hoy);
}

/** Clave de dedupe: un festejo por chat y día de compra, aunque el servidor reinicie. */
export const claveCelebracion = (v: Pick<VentaParaCelebrar, "ticketId" | "dia">) =>
  `${v.ticketId}:venta_confirmada:${v.dia}`;

const dinero = (n: number) =>
  `$${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** «Escribió el 3 nov y compró hoy (5 días después)». */
function rezago(v: VentaParaCelebrar): string {
  const dias = diasEntre(v.primerDia, v.dia);
  if (dias === 0) return "Escribió al bot y compró el mismo día";
  if (dias === 1) return "Escribió al bot y compró al día siguiente";
  return `Escribió al bot y compró ${dias} días después`;
}

/** Título, detalle y cierre del mensaje. La cabecera 🎉 la pone `cabeceraDeEvento`. */
export function textoCelebracion(v: VentaParaCelebrar): {
  title: string;
  details: string[];
  reason: string;
  action: string;
} {
  const locales = [...new Set(v.facturas.map((f) => f.local).filter((l) => l && l !== "—"))];
  return {
    title: "¡El bot cerró una venta! Llegó la factura 🥳",
    details: [dinero(v.total), v.llantas, locales.join(" y ")],
    reason: v.cotizado ? `${rezago(v)}, con la cotización del bot` : rezago(v),
    action: "Felicitaciones, equipo 👏 ¡Vamos por la siguiente!",
  };
}
