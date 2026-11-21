/**
 * Los datos del reporte del día, modelo simple.
 *
 * Tres preguntas, tres consultas: quién dio fecha para venir, qué se cotizó hoy
 * y qué se vendió con factura. Lo demás (ventana de 20:00 a 20:00, paleta,
 * cuántos escribieron, la semana, cuántos piden asesor) sale del reporte
 * original (`buildDailyReport`) para que los dos cuenten el día con el mismo
 * corte y no haya dos definiciones de «hoy».
 *
 * Tres decisiones que no se ven en el PDF:
 *
 *  · **La hora es la que dijo el cliente, o ninguna.** La hora dentro de
 *    `visit_date` casi nunca la dijo nadie (ver `etiquetaVisita`): sólo se
 *    muestra `visit_time_label`. Sin ella la fila dice «en el día».
 *  · **«Tenían fecha y ya pasó» no afirma que no vinieron.** La venta se cierra
 *    en el local sin volver al sistema; lo único que se sabe es que la fecha
 *    pasó, el chat sigue abierto y no hay factura cruzada. Por eso el rótulo
 *    pide confirmar, no rescatar.
 *  · **Lo cotizado se cuenta por persona.** Quien pidió tres cotizaciones hoy
 *    es una fila con la última, no tres: la lista es de gente a quien escribir.
 */
import { config } from "../config.js";
import { sql } from "../db/client.js";
import { buildDailyReport, type ReporteDiario } from "./dailyReport.js";
import { cruceVigente, sincronizarFacturas, ultimaSyncFacturas, type VentaConfirmada } from "./ventasConfirmadas.js";
import type {
  CotizacionDelDia, DiaDeVisitas, EstadoCotizacion, NoVino, PersonaConFecha, ReporteSimple, VentaConfirmadaDelDia,
} from "../render/reporteSimplePdf.js";

/** Cuántos días hacia adelante dibuja la agenda. */
const DIAS_AGENDA = 7;
/** Una fecha vencida hace más de esto ya no es tarea de nadie. */
const DIAS_VENCIDA = 14;
/** Cuánto se espera a la fuente de facturas si este proceso aún no la leyó. */
const ESPERA_FACTURAS_MS = 45_000;

const linkTicket = (id: number) => `${config.hub.publicUrl}/#/ticket/${id}`;

/** Mediodía de Quito de un día dado: sumar días desde aquí nunca cruza de fecha. */
const mediodia = (dia: string) => new Date(`${dia}T12:00:00-05:00`);

function sumarDias(dia: string, n: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(mediodia(dia).getTime() + n * 86_400_000));
}

function partesDelDia(dia: string) {
  const fecha = mediodia(dia);
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", ...o }).format(fecha).replace(".", "");
  return { corto: fmt({ weekday: "short" }).slice(0, 3), largo: fmt({ weekday: "long" }), numero: fmt({ day: "numeric" }) };
}

/**
 * «4 × Falken Ziex 205/55R16» a partir de los ítems de la cotización.
 *
 * Los ítems son JSON libre que escribió el bot, así que se lee a la defensiva:
 * si no hay nada reconocible queda la medida del chat, y si tampoco, null.
 */
export function llantasDe(items: unknown, medida: string | null): string | null {
  const lista = Array.isArray(items) ? items as Array<Record<string, unknown>> : [];
  const primero = lista[0];
  const nombre = primero && [primero.descripcion, primero.description, primero.nombre].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  if (!nombre) return medida;
  const cantidad = Number(primero.cantidad ?? primero.quantity ?? 0);
  const texto = `${cantidad > 0 ? `${cantidad} × ` : ""}${nombre.trim()}`;
  const corto = texto.length > 58 ? `${texto.slice(0, 57).trimEnd()}…` : texto;
  return lista.length > 1 ? `${corto} + ${lista.length - 1} más` : corto;
}

export interface FilaVisita {
  id: number; phone: string; name: string | null; tire_size: string | null; nearest_store: string | null;
  visit_time_label: string | null; dia: string; total: string | number | null; items: unknown;
}

export interface FilaCotizada {
  id: number; phone: string; name: string | null; tire_size: string | null; stage: string; status: string;
  total: string | number; items: unknown; created_at: Date; last_customer_message_at: Date | null;
  dia_visita: string | null;
}

/**
 * Arma el modelo a partir de filas ya leídas. Sin base ni reloj: todo lo que
 * decide algo (qué es mañana, quién ya pasó, a quién se empuja) se prueba aquí.
 */
export function armarReporteSimple(input: {
  base: ReporteDiario;
  visitas: FilaVisita[];
  cotizadas: FilaCotizada[];
  ventas: VentaConfirmada[];
}): ReporteSimple {
  const { base } = input;
  const hoy = base.diaClave;
  const conFactura = new Set(input.ventas.filter((v) => v.dia >= sumarDias(hoy, -DIAS_VENCIDA)).map((v) => v.ticketId));

  const persona = (v: FilaVisita): PersonaConFecha => ({
    nombre: v.name ?? v.phone,
    link: linkTicket(Number(v.id)),
    hora: v.visit_time_label?.trim() || null,
    llantas: llantasDe(v.items, v.tire_size),
    local: v.nearest_store,
    monto: v.total == null ? null : Number(v.total),
  });

  const futuras = input.visitas.filter((v) => v.dia > hoy);
  const dias: DiaDeVisitas[] = Array.from({ length: DIAS_AGENDA }, (_, i) => {
    const clave = sumarDias(hoy, i + 1);
    const p = partesDelDia(clave);
    return {
      corto: p.corto.toUpperCase(),
      numero: p.numero,
      titulo: `${i === 0 ? "Mañana · " : ""}${p.largo} ${p.numero}`,
      // Primero quien dio hora: es a quien se espera en un momento concreto.
      personas: futuras.filter((v) => v.dia === clave)
        .sort((a, b) => Number(Boolean(b.visit_time_label)) - Number(Boolean(a.visit_time_label)) || Number(b.total ?? 0) - Number(a.total ?? 0))
        .map(persona),
    };
  });

  const ayer = sumarDias(hoy, -1);
  const noVinieron: NoVino[] = input.visitas
    .filter((v) => v.dia <= hoy && !conFactura.has(Number(v.id)))
    .sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : Number(b.total ?? 0) - Number(a.total ?? 0)))
    .map((v) => {
      const p = partesDelDia(v.dia);
      return { ...persona(v), cuando: v.dia === hoy ? "hoy" : v.dia === ayer ? "ayer" : `${p.corto} ${p.numero}` };
    });

  const estadoDe = (c: FilaCotizada): EstadoCotizacion => {
    if (c.dia_visita && c.dia_visita > hoy) return "con_fecha";
    return c.last_customer_message_at && c.last_customer_message_at.getTime() > c.created_at.getTime() ? "pensando" : "sin_respuesta";
  };
  // Un chat cerrado (ganado o perdido) cuenta en la plata cotizada del día,
  // pero no es alguien a quien haya que escribirle.
  const filas: CotizacionDelDia[] = input.cotizadas
    .filter((c) => c.status === "open" && c.stage !== "ganado" && c.stage !== "perdido")
    .map((c) => {
      const estado = estadoDe(c);
      const p = c.dia_visita ? partesDelDia(c.dia_visita) : null;
      return {
        nombre: c.name ?? c.phone,
        link: linkTicket(Number(c.id)),
        llantas: llantasDe(c.items, c.tire_size),
        monto: Number(c.total),
        estado,
        ...(estado === "con_fecha" && p ? { nota: `viene ${p.corto} ${p.numero}` } : {}),
      };
    })
    .sort((a, b) => b.monto - a.monto);

  const delDia = input.ventas.filter((v) => v.dia === hoy);
  const vendidas: VentaConfirmadaDelDia[] = delDia.map((v) => {
    const factura = v.facturas.find((f) => f.dia === hoy) ?? v.facturas[0];
    const llantas = v.llantas.length > 70 ? `${v.llantas.slice(0, 69).trimEnd()}…` : v.llantas;
    return {
      nombre: v.nombre ?? v.cliente ?? v.telefono,
      link: linkTicket(v.ticketId),
      llantas,
      factura: factura?.documento ?? "—",
      local: factura?.local && factura.local !== "—" ? factura.local : null,
      total: v.total,
    };
  }).sort((a, b) => b.total - a.total);

  const suma = (xs: Array<number | null>) => Math.round(xs.reduce<number>((s, x) => s + (x ?? 0), 0) * 100) / 100;

  return {
    negocio: base.negocio,
    paleta: base.paleta,
    fuente: base.fuente,
    dia: base.dia,
    diaClave: hoy,
    linkOportunidades: base.linkOportunidades,
    embudo: {
      escribieron: base.resumen.clientesQueEscribieron,
      cotizados: input.cotizadas.length,
      dieronFecha: base.resumen.visitasAgendadas,
      compraron: vendidas.length,
    },
    vienen: {
      dias,
      total: futuras.length,
      monto: suma(futuras.map((v) => (v.total == null ? null : Number(v.total)))),
      noVinieron,
    },
    cotizado: {
      total: input.cotizadas.length,
      monto: suma(input.cotizadas.map((c) => Number(c.total))),
      filas,
      semana: base.semana.dias.map((d) => ({ etiqueta: d.etiqueta, monto: d.monto })),
    },
    vendido: { total: vendidas.length, monto: suma(vendidas.map((v) => v.total)), filas: vendidas },
    enElPanel: { pidenAsesor: base.pidenAsesor.total, errores: base.errores.total },
  };
}

/**
 * Las ventas con factura que conoce este proceso.
 *
 * NUNCA lanza: sin fuente de facturas, o con la fuente caída, el reporte sale
 * igual sin la sección verde — que es exactamente como sale un día sin ventas.
 */
async function ventasConFactura(): Promise<VentaConfirmada[]> {
  try {
    if (!ultimaSyncFacturas()) {
      await Promise.race([
        sincronizarFacturas(),
        new Promise<void>((resolve) => setTimeout(resolve, ESPERA_FACTURAS_MS).unref?.()),
      ]);
    }
    return (await cruceVigente()).ventas;
  } catch (error) {
    console.warn("⚠️ Reporte del día: no se pudieron leer las ventas con factura —", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function buildReporteSimple(ahora = new Date(), baseYaArmada?: ReporteDiario): Promise<ReporteSimple> {
  const base = baseYaArmada ?? await buildDailyReport(ahora);
  const desde = new Date(base.desde);
  const hasta = new Date(base.hasta);
  const piso = sumarDias(base.diaClave, -DIAS_VENCIDA);

  const DIA_VISITA = sql`to_char(coalesce(c.visit_date at time zone 'America/Guayaquil', c.pickup_date::timestamp), 'YYYY-MM-DD')`;

  const visitas = await sql<FilaVisita[]>`
    select c.id, c.phone, c.name, c.tire_size, c.nearest_store, c.visit_time_label,
      ${DIA_VISITA} as dia, q.total, q.items
    from conversations c
    left join lateral (
      select total, items from quotes
      where conversation_id = c.id and cycle = c.current_cycle
      order by created_at desc limit 1
    ) q on true
    where c.status = 'open' and c.stage not in ('ganado', 'perdido')
      and coalesce(c.visit_date, c.pickup_date::timestamptz) is not null
      and ${DIA_VISITA} >= ${piso}
  `;

  const cotizadas = await sql<FilaCotizada[]>`
    select distinct on (q.conversation_id)
      c.id, c.phone, c.name, c.tire_size, c.stage, c.status, c.last_customer_message_at,
      q.total, q.items, q.created_at, ${DIA_VISITA} as dia_visita
    from quotes q
    join conversations c on c.id = q.conversation_id
    where q.created_at >= ${desde} and q.created_at < ${hasta}
    order by q.conversation_id, q.created_at desc
  `;

  return armarReporteSimple({ base, visitas: [...visitas], cotizadas: [...cotizadas], ventas: await ventasConFactura() });
}

/**
 * El WhatsApp que acompaña al PDF. Mismo orden que el documento y las mismas
 * cifras: muchas noches es lo único que se lee.
 */
export function textoDelReporteSimple(r: ReporteSimple): string {
  const dinero = (valor: number) => `$${Math.round(valor).toLocaleString("en-US")}`;
  const manana = r.vienen.dias[0]?.personas.length ?? 0;
  const sinFecha = r.cotizado.filas.filter((f) => f.estado !== "con_fecha").length;
  const lineas = [`📊 *Reporte del día — ${r.dia}*`, ""];
  lineas.push(r.vienen.total
    ? `🗓 ${r.vienen.total} con fecha para venir · ${dinero(r.vienen.monto)}${manana ? ` (mañana: ${manana})` : ""}`
    : "🗓 Nadie dio fecha para los próximos días");
  lineas.push(r.cotizado.total
    ? `📄 ${r.cotizado.total} cotizados hoy · ${dinero(r.cotizado.monto)}${sinFecha ? ` (${sinFecha} sin fecha todavía)` : ""}`
    : "📄 Hoy no salió ninguna cotización");
  if (r.vendido.total > 0) lineas.push(`✅ ${r.vendido.total} ${r.vendido.total === 1 ? "venta confirmada" : "ventas confirmadas"} con factura · ${dinero(r.vendido.monto)}`);
  if (r.vienen.noVinieron.length) lineas.push(`📞 ${r.vienen.noVinieron.length} tenían fecha y ya pasó: confirmar si vinieron`);
  lineas.push("", "📎 El PDF de abajo trae quién viene cada día y a quién hay que escribirle.", `🔗 ${r.linkOportunidades}`);
  return lineas.join("\n");
}
