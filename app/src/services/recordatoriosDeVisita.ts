import { sql } from "../db/client.js";
import { negocio } from "../negocio/index.js";
import { sendApprovedTemplate } from "../wa/client.js";
import { appendMessage } from "./conversations.js";
import { isBotActive } from "./botPower.js";
import { emitLiveEvent } from "./liveEvents.js";
import { relojDeGuayaquil } from "./avisoDeLaManana.js";

/**
 * Los dos mensajes al CLIENTE alrededor de su visita (19-nov-2026).
 *
 * - `recordatorio` (`recordatorio_visita_v1`): la tarde de la víspera,
 *   «le recordamos su visita de mañana…», con [Sí voy] [Cambiar día].
 * - `no_llego` (`visita_no_llego_v1`): la mañana siguiente, si no vino ni
 *   compró, «ayer le esperábamos…», con [Agendar otro día] [Ya no las necesito].
 *
 * Elegidos con la investigación del 18-nov: un recordatorio sube la asistencia
 * (~23 % en el meta-análisis de BMJ Open 2016) y decir lo que se pierde ayuda
 * más que un aviso neutro. Uno por visita y uno por ausencia: nada de cadenas.
 *
 * Cada uno sale solo si su plantilla está APROBADA en Meta y con «Envío
 * automático» prendido en Ajustes → Seguimientos: ese casillero es el
 * interruptor. Con el bot apagado no sale nada (apagado = no le escribe solo
 * a nadie, ver botPower).
 */

export type TipoRecordatorio = "recordatorio" | "no_llego";

export const PLANTILLA_DE: Record<TipoRecordatorio, string> = {
  recordatorio: "recordatorio_visita_v1",
  no_llego: "visita_no_llego_v1",
};

/** Ventanas horarias (minutos del día en Guayaquil). La víspera por la tarde; la ausencia a media mañana. */
export const VENTANA: Record<TipoRecordatorio, { desde: number; hasta: number }> = {
  recordatorio: { desde: 17 * 60, hasta: 20 * 60 },
  no_llego: { desde: 10 * 60, hasta: 13 * 60 },
};

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function enVentana(tipo: TipoRecordatorio, ahora: Date): boolean {
  const { minutos } = relojDeGuayaquil(ahora);
  return minutos >= VENTANA[tipo].desde && minutos < VENTANA[tipo].hasta;
}

/** «YYYY-MM-DD» de Guayaquil desplazado `dias`. */
export function diaRelativo(ahora: Date, dias: number): string {
  return relojDeGuayaquil(new Date(ahora.getTime() + dias * 86_400_000)).dia;
}

/** «Juan Carlos» → «Juan». Un nombre de perfil raro («🔥», «.») no saluda a nadie. */
export function nombreParaSaludo(nombre: string | null | undefined): string {
  const primero = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  const limpio = primero.replace(/[^\p{L}'-]/gu, "");
  if (limpio.length < 2) return "estimado cliente";
  return limpio.charAt(0).toLocaleUpperCase("es") + limpio.slice(1).toLocaleLowerCase("es");
}

export interface DatosDeVisita {
  name: string | null;
  visit_date: Date;
  nearest_store: string | null;
  tire_size: string | null;
}

/**
 * Las variables en el orden de la plantilla de ESTE negocio. Con un solo local
 * (Competimotor) la plantilla lleva el nombre del local escrito y tiene una
 * variable menos; con varios (Depot) el local va como variable.
 */
export function variablesDe(tipo: TipoRecordatorio, v: DatosDeVisita, conLocal = negocio.locales.length > 1): string[] {
  const nombre = nombreParaSaludo(v.name);
  const dia = DIAS[new Date(`${relojDeGuayaquil(v.visit_date).dia}T12:00:00Z`).getUTCDay()];
  const local = v.nearest_store?.trim() || "nuestro local";
  const medida = v.tire_size?.trim() || "cotizadas";
  if (tipo === "recordatorio") return conLocal ? [nombre, dia, local, medida] : [nombre, dia, medida];
  return conLocal ? [nombre, local, medida] : [nombre, medida];
}

/** El texto tal como lo verá el cliente, para guardarlo en el chat. */
export function textoRenderizado(cuerpo: string | null, variables: string[], plantilla: string): string {
  if (!cuerpo || !/\{\{\d+\}\}/.test(cuerpo)) return `[Plantilla ${plantilla}]`;
  return cuerpo.replace(/\{\{(\d+)\}\}/g, (_m, n) => variables[Number(n) - 1] ?? "");
}

interface Candidato extends DatosDeVisita {
  id: number;
  phone: string;
  cycle: number;
  last_customer_message_at: Date | null;
}

/** Visitas abiertas de un día, sin opt-out ni molestia, que no se ganaron ni se perdieron. */
async function visitasDe(dia: string): Promise<Candidato[]> {
  return sql<Candidato[]>`
    select c.id, c.phone, c.name, c.current_cycle as cycle, c.visit_date, c.nearest_store, c.tire_size,
      c.last_customer_message_at
    from conversations c
    where c.status = 'open'
      and c.visit_date is not null
      and to_char(c.visit_date at time zone 'America/Guayaquil', 'YYYY-MM-DD') = ${dia}
      and c.opted_out_at is null
      and c.negative_sentiment_at is null
      and c.stage not in ('ganado', 'perdido')
      -- La visita que se conservó al reabrir una venta GANADA (la fecha no se
      -- borra mientras siga vigente, domain/vigenciaDeLaFecha.ts) es de alguien
      -- que ya compró: ni «le esperamos mañana» ni «no llegó».
      and not exists (
        select 1 from sales_history s
        where s.conversation_id = c.id and s.cycle = c.current_cycle - 1
          and s.outcome = 'ganado' and s.visit_date = c.visit_date
      )
    order by c.visit_date
  `;
}

/**
 * ¿Ya compró? Solo se responde con una fuente de facturas viva: sin ella no se
 * puede saber, y decirle «ayer le esperábamos» a quien sí vino es peor que no
 * escribir. Devuelve null cuando no se puede saber.
 */
async function comprasConocidas(ahora: Date): Promise<Map<number, string> | null> {
  try {
    const { cruceVigente, ultimaSyncFacturas } = await import("./ventasConfirmadas.js");
    const sync = ultimaSyncFacturas();
    if (!sync || ahora.getTime() - sync.getTime() > 36 * 3_600_000) return null;
    const { ventas } = await cruceVigente();
    return new Map(ventas.map((v) => [v.ticketId, v.dia]));
  } catch {
    return null;
  }
}

export interface ResultadoBarrido { tipo: TipoRecordatorio; enviados: number; omitidos: number; fallos: number }

export async function barrerRecordatorios(tipo: TipoRecordatorio, ahora = new Date()): Promise<ResultadoBarrido | null> {
  if (!enVentana(tipo, ahora)) return null;
  const plantilla = PLANTILLA_DE[tipo];
  const [cfg] = await sql<{ template_name: string | null; language: string; preview: string | null }[]>`
    select template_name, language, preview from follow_up_templates
    where template_key = ${plantilla} and automatic_send and approval_status = 'approved'
  `;
  if (!cfg?.template_name) return null;
  if (!(await isBotActive())) return null;

  const dia = diaRelativo(ahora, tipo === "recordatorio" ? 1 : -1);
  const candidatos = await visitasDe(dia);
  if (!candidatos.length) return { tipo, enviados: 0, omitidos: 0, fallos: 0 };

  let compras: Map<number, string> | null = null;
  if (tipo === "no_llego") {
    compras = await comprasConocidas(ahora);
    if (!compras) {
      console.log(`⏭️  «No llegó» sin enviar: no hay facturas recientes para saber quién compró.`);
      return { tipo, enviados: 0, omitidos: candidatos.length, fallos: 0 };
    }
  }

  const resultado: ResultadoBarrido = { tipo, enviados: 0, omitidos: 0, fallos: 0 };
  for (const c of candidatos) {
    // Si el cliente está escribiendo, la conversación ya está viva: un mensaje
    // automático encima estorba. Víspera: escribió en las últimas 6 h. Ausencia:
    // escribió desde el día de la visita (avisó que no podía, o que ya viene).
    const ultimo = c.last_customer_message_at?.getTime() ?? 0;
    const vivo = tipo === "recordatorio"
      ? ahora.getTime() - ultimo < 6 * 3_600_000
      : ultimo > 0 && relojDeGuayaquil(new Date(ultimo)).dia >= dia;
    const diaDeCompra = compras?.get(Number(c.id));
    const compro = Boolean(diaDeCompra && diaDeCompra >= diaRelativo(ahora, -14));
    if (vivo || compro) { resultado.omitidos += 1; continue; }

    const [fila] = await sql<{ id: number }[]>`
      insert into recordatorios_visita (conversation_id, cycle, tipo, dia_visita, plantilla)
      values (${c.id}, ${c.cycle}, ${tipo}, ${dia}, ${cfg.template_name})
      on conflict do nothing
      returning id
    `;
    if (!fila) continue; // ya salió (o se intentó) en otra vuelta
    const variables = variablesDe(tipo, c);
    try {
      const wamid = await sendApprovedTemplate({
        conversationId: c.id,
        to: c.phone,
        templateName: cfg.template_name,
        language: cfg.language,
        variables,
        callbackData: `recordatorio_visita:${fila.id}`,
        actor: "visit_reminder",
      });
      await sql`update recordatorios_visita set estado = 'enviado', provider_message_id = ${wamid ?? null} where id = ${fila.id}`;
      await appendMessage(c.id, "assistant", textoRenderizado(cfg.preview, variables, cfg.template_name), wamid, {
        authorKind: "bot",
        status: "sent",
        metadata: { recordatorioVisita: { tipo, plantilla: cfg.template_name, dia } },
        occurredAt: ahora,
      });
      emitLiveEvent("message", c.id);
      resultado.enviados += 1;
    } catch (error) {
      const texto = error instanceof Error ? error.message : String(error);
      await sql`update recordatorios_visita set estado = 'fallo', error = ${texto.slice(0, 500)} where id = ${fila.id}`;
      resultado.fallos += 1;
    }
  }
  return resultado;
}
