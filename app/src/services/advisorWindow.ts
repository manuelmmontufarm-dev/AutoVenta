import { business } from "../config.js";
import { sql } from "../db/client.js";
import { avisarAsesoresGlobal } from "./advisorNotifications.js";

/**
 * La ventana de 24 horas de cada asesor, y el aviso antes de que se cierre.
 *
 * El 8-ago se descubrió que Joaquín no había recibido NINGUNO de sus avisos.
 * Primero por un número mal tecleado; corregido eso, siguió sin recibirlos: Meta
 * rechaza con 131047 cualquier texto libre a quien no le haya escrito al número
 * del negocio en las últimas 24 horas. La alternativa oficial son las plantillas
 * aprobadas, que cuestan y hay que hacer aprobar. Manuel eligió lo otro: que el
 * sistema avise cuando la ventana se está por cerrar, y él le pide al asesor que
 * mande un mensaje para reabrirla.
 *
 * Por eso este módulo no manda nada al cliente ni toca el embudo: solo mira
 * quién puede ser alcanzado y avisa a tiempo a quien sí puede serlo.
 */

/** Cuánto dura la ventana de Meta desde el último mensaje del asesor. */
const VENTANA_MS = 24 * 60 * 60 * 1000;

/** Con cuánta anticipación se pide reabrirla. */
const AVISAR_ANTES_MS = 3 * 60 * 60 * 1000;

/** Mínimo entre dos recordatorios del mismo asesor: uno al día, no uno por ciclo. */
const ENTRE_AVISOS_MS = 20 * 60 * 60 * 1000;

export interface AsesorVentana {
  nombre: string;
  telefono: string;
  ventana_hasta: Date | null;
  ventana_avisada_en: Date | null;
}

export type MotivoVentana = "nunca_escribio" | "por_vencer" | "vencida";

/**
 * Decisión pura: ¿hay que pedir que reabran la ventana de este asesor?
 *
 * Separada de la base para poder probar los bordes con un reloj fijo. Los tres
 * motivos existen porque el mensaje cambia: a quien nunca escribió hay que
 * explicarle que no ha recibido nada; a quien está por vencer, solo recordarle.
 */
export function debeAvisarVentana(
  asesor: Pick<AsesorVentana, "ventana_hasta" | "ventana_avisada_en">,
  ahora: Date,
): MotivoVentana | null {
  const ultimoAviso = asesor.ventana_avisada_en?.getTime();
  if (ultimoAviso && ahora.getTime() - ultimoAviso < ENTRE_AVISOS_MS) return null;

  if (!asesor.ventana_hasta) return "nunca_escribio";
  const restante = asesor.ventana_hasta.getTime() - ahora.getTime();
  if (restante <= 0) return "vencida";
  if (restante <= AVISAR_ANTES_MS) return "por_vencer";
  return null;
}

/** «2 h 10 min», «45 min». Redondear a horas dice "1 h" cuando quedan 5 minutos. */
function restante(hasta: Date, ahora: Date): string {
  const minutos = Math.max(0, Math.floor((hasta.getTime() - ahora.getTime()) / 60_000));
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (!horas) return `${minutos} min`;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

/**
 * Texto del recordatorio. Lo importante no es el diagnóstico sino la acción:
 * quien lo lee tiene que saber a quién escribirle y qué pedirle, sin entender
 * qué es una ventana de 24 horas ni un error 131047.
 */
export function mensajeVentana(
  asesor: Pick<AsesorVentana, "nombre" | "ventana_hasta">,
  motivo: MotivoVentana,
  ahora: Date,
): string {
  const cabecera = {
    nunca_escribio: `📵 *${asesor.nombre} no puede recibir avisos*`,
    vencida: `📵 *${asesor.nombre} dejó de recibir avisos*`,
    por_vencer: `⏳ *${asesor.nombre} deja de recibir avisos pronto*`,
  }[motivo];

  const detalle = {
    nunca_escribio: "Nunca le ha escrito al WhatsApp del bot, así que WhatsApp no deja mandarle nada.",
    vencida: "Pasaron más de 24 h desde su último mensaje al bot y WhatsApp cerró el canal.",
    por_vencer:
      asesor.ventana_hasta
        ? `Le quedan ${restante(asesor.ventana_hasta, ahora)} de las 24 h que da WhatsApp desde su último mensaje.`
        : "Le queda poco de las 24 h que da WhatsApp.",
  }[motivo];

  return [
    cabecera,
    detalle,
    `👉 Pídele que mande *cualquier mensaje* al ${business.phone}. Con eso se reabre por 24 h más.`,
  ].join("\n");
}

/**
 * Un mensaje entrante de un asesor reabre su ventana.
 *
 * Devuelve false si el número no es de ningún asesor, que es el caso normal
 * (casi todo lo que entra es de clientes). No corta ni desvía nada: el mensaje
 * sigue su camino al pipeline como cualquier otro. Un asesor puede estar
 * probando el bot, y callarlo por figurar en la lista sería peor que el problema
 * que esto resuelve.
 */
export async function registrarMensajeDeAsesor(
  telefono: string,
  cuando = new Date(),
): Promise<boolean> {
  const normalizado = telefono.replace(/\D/g, "");
  if (!normalizado) return false;
  const filas = await sql`
    update advisors
    set ventana_hasta = ${new Date(cuando.getTime() + VENTANA_MS)},
        ventana_avisada_en = null,
        updated_at = now()
    where telefono = ${normalizado}
    returning id
  `;
  return filas.length > 0;
}

/**
 * Revisa a todos los asesores activos y pide reabrir las ventanas que se cierran.
 *
 * El aviso sale por `avisarAsesoresGlobal`, que escribe a todos los activos: al
 * que se está quedando sin ventana probablemente no le llegue —es justo el
 * problema— pero a los demás sí, y son ellos los que pueden ir a pedírselo.
 */
export async function revisarVentanasDeAsesores(ahora = new Date()): Promise<number> {
  const asesores = await sql<AsesorVentana[]>`
    select nombre, telefono, ventana_hasta, ventana_avisada_en
    from advisors where active and telefono <> '' order by prioridad, id
  `;
  let avisados = 0;
  for (const asesor of asesores) {
    const motivo = debeAvisarVentana(asesor, ahora);
    if (!motivo) continue;
    const { enviados } = await avisarAsesoresGlobal(mensajeVentana(asesor, motivo, ahora));
    // Se marca aunque no salga ninguno: si WhatsApp está caído, insistir cada
    // quince minutos no lo arregla y sí llena el log.
    await sql`
      update advisors set ventana_avisada_en = ${ahora}, updated_at = now()
      where telefono = ${asesor.telefono}
    `;
    if (enviados > 0) avisados += 1;
  }
  return avisados;
}
