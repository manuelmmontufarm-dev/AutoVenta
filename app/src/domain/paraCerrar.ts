/**
 * PARA CERRAR: a quién empujar hoy para llegar a la venta (Manuel, 24-oct).
 *
 * Entra solo quien ya aceptó una cotización Y eligió local (la consulta lo
 * filtra; aquí llega esa lista). El volumen es alto —~500 chats al mes—, así
 * que la pestaña no puede ser otra bandeja que se llena sola. Reglas:
 *
 *  1. Para cerrar: el último mensaje es del cliente (o el bot contestó, pero
 *     ningún asesor). Le toca escribir a una persona.
 *  2. Empujando: un asesor ya escribió y el cliente no ha contestado. Lista
 *     llana, se acumula; sale con la ✕ o cuando el número aparece en una
 *     factura. Si el cliente contesta, vuelve sola a Para cerrar.
 *  3. Archivo: 14 días sin texto de nadie. No sale en ninguna lista, pero se
 *     puede buscar y sacar de ahí.
 *  4. Tope del día: el equipo contacta 10 por día; la lista muestra los que
 *     faltan, ordenados por puntaje (plata, cita cerca, conversación fresca).
 *
 * Nada se recupera releyendo textos: quién escribió último sale de
 * `messages.author_kind` y la compra del cruce con Contífico.
 */
import { diaDeGuayaquil, diasEntre } from "./estadisticaVentas.js";
import { medirCurva, probabilidadEn, type Curva } from "./llegada.js";

export const TOPE_DIARIO = 10;
export const DIAS_PARA_ARCHIVAR = 14;
const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;
/** WhatsApp deja escribir texto libre hasta 24 h después del último mensaje del cliente. */
const VENTANA_MS = 24 * HORA_MS;

/**
 * TEMPERATURA: qué tan probable es que todavía compre (Manuel, 26-oct).
 *
 * Sale de la curva de llegada medida con las ventas reales (`domain/llegada.ts`),
 * que se recalcula sola con cada factura nueva de Contífico:
 *  · reloj «fecha» si el cliente dijo un día; si no, reloj «silencio» desde su
 *    último mensaje.
 *  · caliente = su día es hoy o después / escribió hoy.
 *  · ultima   = ya pasó su día (o calló), pero la curva dice que todavía llegan.
 *  · fria     = desde el corte de la curva (+1 día de margen): ya no viene.
 *
 * Cortes por defecto mientras haya menos de 5 ventas en un reloj: 2 días desde
 * la fecha, 5 días callado (medidos a mano el 26-oct: 0 de 81 y 0 de 177).
 */
export type Temperatura = "caliente" | "ultima" | "fria";
export type Reloj = "fecha" | "silencio";
export const DIAS_FECHA_FRIA = 2;
export const DIAS_CALLADO_FRIO = 5;

export interface Estadistica {
  fecha: Curva;
  silencio: Curva;
  /** Cuándo se calculó (ISO). */
  calculada: string;
  /** Última bajada de facturas de Contífico (ISO), o null si todavía no hay. */
  ultimaFactura: string | null;
}

export const ESTADISTICA_POR_DEFECTO: Estadistica = {
  fecha: medirCurva([], "2026-01-01", DIAS_FECHA_FRIA),
  silencio: medirCurva([], "2026-01-01", DIAS_CALLADO_FRIO),
  calculada: new Date(0).toISOString(),
  ultimaFactura: null,
};

export interface Lectura { temperatura: Temperatura; reloj: Reloj; dias: number; probabilidad: number }

export function leerTemperatura(
  f: Pick<FilaParaCerrar, "visita" | "ultimoCliente">, ahora: Date, est: Estadistica = ESTADISTICA_POR_DEFECTO,
): Lectura {
  const hoy = diaDeGuayaquil(ahora);
  if (f.visita) {
    const dias = diasEntre(diaDeGuayaquil(f.visita), hoy);
    const t = dias <= 0 ? "caliente" : dias < est.fecha.corte ? "ultima" : "fria";
    return { temperatura: t, reloj: "fecha", dias, probabilidad: probabilidadEn(est.fecha, dias) };
  }
  if (!f.ultimoCliente) return { temperatura: "fria", reloj: "silencio", dias: 999, probabilidad: 0 };
  const dias = diasEntre(diaDeGuayaquil(f.ultimoCliente), hoy);
  const t = dias <= 0 ? "caliente" : dias < est.silencio.corte ? "ultima" : "fria";
  return { temperatura: t, reloj: "silencio", dias, probabilidad: probabilidadEn(est.silencio, dias) };
}

export const temperatura = (f: Pick<FilaParaCerrar, "visita" | "ultimoCliente">, ahora: Date, est?: Estadistica) =>
  leerTemperatura(f, ahora, est).temperatura;

/** Una conversación que ya aceptó precio y local, como la lee la consulta. */
export interface FilaParaCerrar {
  ticketId: number;
  nombre: string | null;
  telefono: string;
  medida: string | null;
  llantas: string;
  total: number;
  local: string;
  visita: Date | null;
  visitaHora: string | null;
  compromiso: string | null;
  ultimoCliente: Date | null;
  /** Último mensaje de una persona del negocio (hub o eco del celular), no del bot. */
  ultimoAsesor: Date | null;
  /** ¿Un asesor había escrito antes del último mensaje del cliente? */
  asesorAntesDelCliente: boolean;
  descartadoAt: Date | null;
  pospuestoHasta: Date | null;
  pospuestoEn: Date | null;
  revividoAt: Date | null;
  /** El teléfono aparece en una factura de Contífico con llantas, posterior a la cotización. */
  compro: boolean;
}

export interface ClienteParaCerrar {
  ticketId: number;
  nombre: string | null;
  telefono: string;
  medida: string | null;
  llantas: string;
  total: number;
  local: string;
  visita: string | null;
  visitaHora: string | null;
  compromiso: string | null;
  ultimoCliente: string | null;
  /** Le habían escrito, no contestaba, y volvió a escribir. */
  volvio: boolean;
  /** false = pasaron 24 h desde su último mensaje: solo plantilla. */
  ventanaAbierta: boolean;
  temperatura: Temperatura;
  /** Qué reloj manda, cuántos días lleva y la P(todavía compra) que da la curva. */
  reloj: Reloj;
  dias: number;
  probabilidad: number;
  puntaje: number;
}

export interface ClienteEmpujando {
  ticketId: number;
  nombre: string | null;
  medida: string | null;
  llantas: string;
  total: number;
  local: string;
  ultimoAsesor: string;
  /** El día que dijo que viene: Empujando también sale en el calendario. */
  visita: string | null;
  visitaHora: string | null;
  /** Días que le quedan antes de pasar al archivo. */
  seArchivaEn: number;
  temperatura: Temperatura;
  reloj: Reloj;
  dias: number;
  probabilidad: number;
}

export interface ClienteArchivado {
  ticketId: number;
  nombre: string | null;
  telefono: string;
  medida: string | null;
  llantas: string;
  total: number;
  local: string;
  ultimoTexto: string | null;
  /** Salió por la ✕, no por los 14 días. */
  sacado: boolean;
}

export interface ParaCerrar {
  tope: number;
  contactadosHoy: number;
  paraCerrar: ClienteParaCerrar[];
  empujando: ClienteEmpujando[];
  archivo: ClienteArchivado[];
  pospuestos: number;
  compraron: number;
  /** La curva de llegada con la que se pintó todo: se muestra en «Cómo se calcula». */
  estadistica: Estadistica;
}

const max = (...ds: Array<Date | null>): Date | null =>
  ds.reduce<Date | null>((a, d) => (d && (!a || d > a) ? d : a), null);

/**
 * Cuánto conviene escribirle primero. Plata en juego (1 punto cada $100),
 * cita cerca (hoy/mañana pesa más que cualquier monto chico; una cita que ya
 * pasó sin compra también es urgente), conversación fresca (se apaga en 6 días)
 * y un extra si volvió a escribir después de que le escribimos.
 */
export function puntaje(f: FilaParaCerrar, ahora: Date): number {
  const plata = f.total / 100;
  let cita = 0;
  if (f.visita) {
    const dias = diasEntre(diaDeGuayaquil(ahora), diaDeGuayaquil(f.visita));
    cita = dias < 0 ? 10 : dias <= 1 ? 15 : dias <= 3 ? 6 : 2;
  }
  const horas = f.ultimoCliente ? (ahora.getTime() - f.ultimoCliente.getTime()) / HORA_MS : Infinity;
  const fresco = Math.max(0, 12 - horas / 12);
  return Math.round((plata + cita + fresco + (f.asesorAntesDelCliente ? 6 : 0)) * 100) / 100;
}

export function clasificar(filas: readonly FilaParaCerrar[], ahora: Date, est: Estadistica = ESTADISTICA_POR_DEFECTO): ParaCerrar {
  const hoy = diaDeGuayaquil(ahora);
  const out: ParaCerrar = {
    tope: TOPE_DIARIO, contactadosHoy: 0, paraCerrar: [], empujando: [], archivo: [], pospuestos: 0, compraron: 0, estadistica: est,
  };
  const iso = (d: Date | null) => d?.toISOString() ?? null;

  for (const f of filas) {
    if (f.ultimoAsesor && diaDeGuayaquil(f.ultimoAsesor) === hoy) out.contactadosHoy++;
    if (f.compro) { out.compraron++; continue; }

    const ultimoTexto = max(f.ultimoCliente, f.ultimoAsesor, f.revividoAt);
    // La ✕ vale hasta que el cliente vuelve a escribir.
    const sacado = Boolean(f.descartadoAt && (!f.ultimoCliente || f.descartadoAt >= f.ultimoCliente));
    const vencido = !ultimoTexto || ahora.getTime() - ultimoTexto.getTime() > DIAS_PARA_ARCHIVAR * DIA_MS;
    const base = { ticketId: f.ticketId, nombre: f.nombre, medida: f.medida, llantas: f.llantas, total: f.total, local: f.local };

    if (sacado || vencido) {
      out.archivo.push({ ...base, telefono: f.telefono, ultimoTexto: iso(ultimoTexto), sacado });
      continue;
    }

    const leTocaAlCliente = f.ultimoAsesor && (!f.ultimoCliente || f.ultimoAsesor > f.ultimoCliente);
    if (leTocaAlCliente) {
      const pasaron = Math.floor((ahora.getTime() - ultimoTexto.getTime()) / DIA_MS);
      out.empujando.push({ ...base, ultimoAsesor: f.ultimoAsesor!.toISOString(), visita: iso(f.visita), visitaHora: f.visitaHora, seArchivaEn: Math.max(1, DIAS_PARA_ARCHIVAR - pasaron), ...leerTemperatura(f, ahora, est) });
      continue;
    }

    // «Me dijo que cobra el 30»: fuera de la lista hasta esa fecha, salvo que escriba antes.
    const pospuesto = f.pospuestoHasta && f.pospuestoHasta > ahora && (!f.ultimoCliente || !f.pospuestoEn || f.pospuestoEn >= f.ultimoCliente);
    if (pospuesto) { out.pospuestos++; continue; }

    out.paraCerrar.push({
      ...base,
      telefono: f.telefono,
      visita: iso(f.visita),
      visitaHora: f.visitaHora,
      compromiso: f.compromiso,
      ultimoCliente: iso(f.ultimoCliente),
      volvio: f.asesorAntesDelCliente,
      ventanaAbierta: Boolean(f.ultimoCliente && ahora.getTime() - f.ultimoCliente.getTime() < VENTANA_MS),
      ...leerTemperatura(f, ahora, est),
      puntaje: puntaje(f, ahora),
    });
  }

  // Los que ya no vienen van al fondo, aunque tengan más plata en juego.
  out.paraCerrar.sort((a, b) => Number(a.temperatura === "fria") - Number(b.temperatura === "fria") || b.puntaje - a.puntaje || (b.ultimoCliente ?? "").localeCompare(a.ultimoCliente ?? ""));
  out.empujando.sort((a, b) => b.ultimoAsesor.localeCompare(a.ultimoAsesor));
  out.archivo.sort((a, b) => (b.ultimoTexto ?? "").localeCompare(a.ultimoTexto ?? ""));
  return out;
}
