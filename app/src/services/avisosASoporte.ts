/**
 * AVISOS A SOPORTE: «EL BOT NO RESPONDIÓ» (24-nov-2026).
 *
 * Manuel, textual: «necesito que a mí me llegue una notificación ese rato si
 * por a o b razón no responde el bot, como ahorita que me quedé sin tokens».
 * Ese día el bot dejó 13 alertas en el panel y a nadie le sonó el teléfono.
 *
 * A QUIÉN. A soporte de AutoVenta (el usuario `manuel`, que existe en el panel
 * de todos los clientes), no a los asesores del negocio: ellos no pueden
 * recargar OpenAI ni arreglar un token. No pasa por los niveles de Ajustes →
 * Avisos a propósito: un aviso de «el bot está caído» no puede depender de una
 * casilla que el cliente puede desmarcar.
 *
 * POR DÓNDE. Por la app del teléfono (web push), a todos los aparatos donde
 * ese usuario activó las notificaciones: no depende de la ventana de 24 h de
 * WhatsApp ni de que el canal de WhatsApp funcione. Y ADEMÁS por WhatsApp a su
 * número: texto libre con la ventana abierta, plantilla (`aviso_asesor_v1`) con
 * la ventana cerrada, que es justo cuando el texto libre rebota con el 131047.
 *
 * SIN SPAM. Un incidente abierto por causa, a lo sumo (índice único parcial en
 * `incidentes_del_bot`): el primer fallo avisa, los siguientes solo suman, hay
 * un recordatorio espaciado mientras siga fallando y un aviso cuando vuelve.
 * Las reglas y los textos están en `domain/falloDelBot.ts`.
 *
 * QUÉ NO ES UN FALLO. El bot apagado a propósito y el chat en manos de un
 * asesor. El turno ya se corta antes de llegar a los puntos que llaman a
 * `reportarFalloDelBot`, y además el candado está repetido ACÁ
 * (`calladoAProposito`): una puerta nueva que se olvide de preguntar no puede
 * convertir un silencio decidido en una alarma.
 *
 * Nada de esto lanza: un aviso que falla no puede tumbar el turno que lo disparó.
 */
import { config } from "../config.js";
import { sql } from "../db/client.js";
import {
  CAUSAS_DE_IA, causaDelFallo, decidirAviso, puedeCerrarse,
  textoDeCaida, textoDeRecordatorio, textoDeVuelta,
  type CausaDeFallo, type TextoDeAviso,
} from "../domain/falloDelBot.js";
import { negocio } from "../negocio/index.js";
import { sendAdvisorTemplate, sendAdvisorText } from "../wa/client.js";
import { primerNombre } from "./avisoDeLaManana.js";
import { avisoEnUnaLinea, getConfigAvisoPorPlantilla } from "./avisoPorPlantilla.js";
import { enviarPushAUsuarios } from "./avisosEnLaApp.js";
import { isBotActive } from "./botPower.js";
import { usuarioHubPorId } from "./hubUsers.js";
import { asesorDelUsuario, estadoDeVentana } from "./ventanaDelAsesor.js";

/**
 * Quién es soporte de AutoVenta en el panel de cualquier cliente. La misma
 * lista que usa el panel para mostrar la pestaña Bot (`hub/src/screens/Ajustes.tsx`).
 */
export const USUARIOS_DE_SOPORTE: readonly string[] = ["manuel"];

export const esUsuarioDeSoporte = (id: string | null | undefined): boolean =>
  Boolean(id && USUARIOS_DE_SOPORTE.includes(id));

export type ClaseDeAviso = "caida" | "recordatorio" | "vuelta" | "saldo_bajo" | "prueba";

export interface ResultadoDelAviso {
  /** A cuántos teléfonos salió por la app. */
  push: number;
  /** Qué pasó con el WhatsApp: «texto», «plantilla», «sin_numero» o «fallo». */
  whatsapp: "texto" | "plantilla" | "sin_numero" | "fallo";
}

/** El WhatsApp al número de soporte: texto con la ventana abierta, plantilla si no. */
async function mandarWhatsApp(texto: TextoDeAviso, link: string): Promise<{
  estado: ResultadoDelAviso["whatsapp"]; detalle: string | null;
}> {
  let ultimoError: string | null = null;
  let hubo = false;
  for (const id of USUARIOS_DE_SOPORTE) {
    const asesor = await asesorDelUsuario({ id, nombre: usuarioHubPorId(id)?.nombre ?? id }).catch(() => null);
    if (!asesor) continue;
    hubo = true;
    const ventana = estadoDeVentana(asesor.ventana_hasta);
    try {
      if (ventana === "abierta" || ventana === "por_vencer") {
        await sendAdvisorText([`*${texto.titulo}*`, texto.cuerpo, `🔗 ${link}`].join("\n"), asesor.telefono);
        return { estado: "texto", detalle: null };
      }
      const plantilla = await getConfigAvisoPorPlantilla();
      if (!plantilla.activo) {
        ultimoError = "ventana de 24 h cerrada y la plantilla de respaldo está apagada";
        continue;
      }
      await sendAdvisorTemplate({
        to: asesor.telefono,
        templateName: plantilla.plantilla,
        language: plantilla.idioma,
        variables: [primerNombre(asesor.nombre), avisoEnUnaLinea(`${texto.titulo} · ${texto.cuerpo}`)],
      });
      return { estado: "plantilla", detalle: null };
    } catch (error) {
      ultimoError = error instanceof Error ? error.message : String(error);
    }
  }
  if (!hubo) return { estado: "sin_numero", detalle: "soporte no está en la lista de asesores con número" };
  return { estado: "fallo", detalle: ultimoError };
}

/**
 * Manda UN aviso a soporte por los dos caminos y lo deja anotado en
 * `avisos_a_soporte`. Nunca lanza.
 */
export async function avisarASoporte(input: {
  clase: ClaseDeAviso;
  texto: TextoDeAviso;
  conversationId?: number | null;
  incidenteId?: number | null;
}): Promise<ResultadoDelAviso> {
  const ruta = input.conversationId ? `#/ticket/${input.conversationId}` : "#/avisos";
  const link = `${config.hub.publicUrl}/${ruta}`;
  // Sin etiqueta compartida: con la misma, el teléfono reemplaza el aviso
  // anterior en silencio y el recordatorio no suena.
  const etiqueta = `soporte-${input.clase}-${input.incidenteId ?? "x"}-${Date.now()}`;
  const [push, whatsapp] = await Promise.all([
    enviarPushAUsuarios(USUARIOS_DE_SOPORTE, { titulo: input.texto.titulo, cuerpo: input.texto.cuerpo, ruta, etiqueta }),
    mandarWhatsApp(input.texto, link).catch((error) => ({
      estado: "fallo" as const, detalle: error instanceof Error ? error.message : String(error),
    })),
  ]);
  const llego = push > 0 || whatsapp.estado === "texto" || whatsapp.estado === "plantilla";
  console[llego ? "log" : "error"](
    `${llego ? "📣" : "🚨"} Aviso a soporte (${input.clase}): «${input.texto.titulo}» — app: ${push} teléfono(s), `
      + `WhatsApp: ${whatsapp.estado}${whatsapp.detalle ? ` (${whatsapp.detalle})` : ""}`
      + (llego ? "" : " — NO LE LLEGÓ A NADIE: soporte no tiene la app activada ni número con ventana o plantilla."),
  );
  try {
    await sql`
      insert into avisos_a_soporte (
        incidente_id, clase, titulo, cuerpo, conversation_id, push_enviados, whatsapp, whatsapp_detalle
      ) values (
        ${input.incidenteId ?? null}, ${input.clase}, ${input.texto.titulo}, ${input.texto.cuerpo},
        ${input.conversationId ?? null}, ${push}, ${whatsapp.estado}, ${whatsapp.detalle?.slice(0, 500) ?? null}
      )
    `;
  } catch (error) {
    console.error("⚠️ No se pudo anotar el aviso a soporte:", error instanceof Error ? error.message : error);
  }
  return { push, whatsapp: whatsapp.estado };
}

// ── El incidente ─────────────────────────────────────────────────────────────

const TIPO = "bot_no_responde";

interface FilaIncidente {
  id: number;
  causa: CausaDeFallo;
  fallos: number;
  conversaciones: string[];
  recordatorios: number;
  abierto_at: Date;
  ultimo_fallo_at: Date;
  ultimo_aviso_at: Date | null;
}

/** ¿Hay incidentes abiertos? En memoria unos segundos: el camino feliz no paga una consulta por turno. */
const ABIERTOS_TTL_MS = 20_000;
let abiertos: { hay: boolean; at: number } | null = null;

export function olvidarIncidentesAbiertos(): void {
  abiertos = null;
}

async function chatAfectado(conversationId: number | null | undefined): Promise<string | null> {
  if (!conversationId) return null;
  const [fila] = await sql<{ name: string | null; phone: string }[]>`
    select name, phone from conversations where id = ${conversationId}
  `;
  if (!fila) return null;
  return fila.name ? `${fila.name} (${fila.phone})` : fila.phone;
}

/**
 * ¿El bot está callado porque alguien lo decidió? Devuelve el motivo, o null si
 * de verdad le tocaba contestar.
 */
async function calladoAProposito(conversationId: number | null, ahora: Date): Promise<string | null> {
  if (!(await isBotActive())) return "el bot está apagado a propósito";
  if (conversationId === null) return null;
  const [chat] = await sql<{ assigned_to: string | null; bot_paused_until: Date | null }[]>`
    select assigned_to, bot_paused_until from conversations where id = ${conversationId}
  `;
  if (chat?.assigned_to === "human") return "el chat lo tiene un asesor";
  if (chat?.bot_paused_until && chat.bot_paused_until.getTime() > ahora.getTime()) return "el bot está en pausa en ese chat";
  return null;
}

/**
 * Un turno se quedó sin respuesta por un fallo. Abre el incidente (o le suma)
 * y avisa a soporte si toca. Devuelve qué hizo, para las pruebas y el log.
 *
 * `causa` se pasa cuando quien llama ya sabe qué fue (WhatsApp rechazó el
 * envío, el turno se colgó); si no, se lee del error.
 */
export async function reportarFalloDelBot(input: {
  error?: unknown;
  causa?: CausaDeFallo;
  conversationId?: number | null;
  /** En qué puerta falló, para el log: «turno», «retomada», «envío». */
  puerta?: string;
  ahora?: Date;
}): Promise<"abrir" | "recordar" | "nada" | "error"> {
  const ahora = input.ahora ?? new Date();
  try {
    const causa = input.causa ?? causaDelFallo(input.error);
    const detalle = input.error === undefined || input.error === null
      ? null
      : (input.error instanceof Error ? input.error.message : String(input.error)).slice(0, 500);
    const conv = input.conversationId ?? null;
    const motivoDelSilencio = await calladoAProposito(conv, ahora);
    if (motivoDelSilencio) {
      console.log(`🤫 Fallo sin aviso a soporte (${causa}, conv ${conv ?? "—"}): ${motivoDelSilencio}.`);
      return "nada";
    }
    const [fila] = await sql<(FilaIncidente & { nuevo: boolean })[]>`
      insert into incidentes_del_bot (
        tipo, causa, detalle, conversaciones, abierto_at, ultimo_fallo_at, ultimo_aviso_at
      ) values (
        ${TIPO}, ${causa}, ${detalle},
        ${conv === null ? sql`'{}'::bigint[]` : sql`array[${conv}]::bigint[]`},
        ${ahora}, ${ahora}, ${ahora}
      )
      on conflict (tipo, causa) where estado = 'abierto' do update set
        fallos = incidentes_del_bot.fallos + 1,
        ultimo_fallo_at = excluded.ultimo_fallo_at,
        conversaciones = case
          when cardinality(excluded.conversaciones) = 0
            or excluded.conversaciones <@ incidentes_del_bot.conversaciones
            then incidentes_del_bot.conversaciones
          else incidentes_del_bot.conversaciones || excluded.conversaciones
        end
      returning id, causa, fallos, conversaciones, recordatorios, abierto_at, ultimo_fallo_at,
        ultimo_aviso_at, (xmax = 0) as nuevo
    `;
    abiertos = { hay: true, at: Date.now() };
    const decision = decidirAviso(
      { nuevo: fila.nuevo, ultimoAvisoAt: fila.ultimo_aviso_at, recordatorios: Number(fila.recordatorios) },
      ahora,
    );
    console.warn(
      `🚨 El bot no respondió (${causa}${input.puerta ? `, ${input.puerta}` : ""}) en la conv ${conv ?? "—"}: `
        + `incidente ${fila.id}, fallo n.º ${fila.fallos} → ${decision === "nada" ? "sin aviso nuevo" : decision}`,
    );
    if (decision === "nada") return "nada";
    if (decision === "abrir") {
      await avisarASoporte({
        clase: "caida",
        texto: textoDeCaida({ cliente: negocio.nombre, causa, chat: await chatAfectado(conv) }),
        conversationId: conv,
        incidenteId: Number(fila.id),
      });
      return "abrir";
    }
    // El recordatorio se cobra con un UPDATE condicionado: de dos fallos que
    // llegan juntos al cumplirse el intervalo, solo uno lo manda.
    const cobrado = await sql`
      update incidentes_del_bot
      set ultimo_aviso_at = ${ahora}, recordatorios = recordatorios + 1
      where id = ${fila.id} and estado = 'abierto' and ultimo_aviso_at = ${fila.ultimo_aviso_at}
      returning id
    `;
    if (!cobrado.length) return "nada";
    await avisarASoporte({
      clase: "recordatorio",
      texto: textoDeRecordatorio({
        cliente: negocio.nombre, causa, chatsAfectados: fila.conversaciones.length,
        desde: fila.abierto_at, ahora,
      }),
      conversationId: conv,
      incidenteId: Number(fila.id),
    });
    return "recordar";
  } catch (error) {
    console.error("⚠️ No se pudo registrar el fallo del bot:", error instanceof Error ? error.message : error);
    return "error";
  }
}

/**
 * El bot respondió. Si había un incidente abierto de esa clase y los fallos ya
 * no son frescos, se cierra y soporte recibe el «volvió a responder».
 *
 *  · `ia`: el modelo contestó. Cierra los incidentes de OpenAI.
 *  · `turno`: el mensaje le llegó al cliente. Cierra el resto (envío rechazado,
 *    turno colgado, error interno).
 *
 * Una respuesta de texto fijo (el saludo, una recotización) no llama a `ia`:
 * que salga el saludo no significa que OpenAI haya vuelto.
 */
export async function reportarBotResponde(clase: "ia" | "turno", ahora = new Date()): Promise<boolean> {
  try {
    if (abiertos && !abiertos.hay && Date.now() - abiertos.at < ABIERTOS_TTL_MS) return false;
    const filas = await sql<FilaIncidente[]>`
      select id, causa, fallos, conversaciones, recordatorios, abierto_at, ultimo_fallo_at, ultimo_aviso_at
      from incidentes_del_bot where tipo = ${TIPO} and estado = 'abierto'
    `;
    abiertos = { hay: filas.length > 0, at: Date.now() };
    const deEstaClase = filas.filter((f) => CAUSAS_DE_IA.includes(f.causa) === (clase === "ia"));
    const listos = deEstaClase.filter((f) => puedeCerrarse(f.ultimo_fallo_at, ahora));
    if (!listos.length) return false;
    // El cierre también se cobra condicionado: dos turnos que aciertan a la vez
    // no mandan dos «volvió».
    const cerrados = await sql<FilaIncidente[]>`
      update incidentes_del_bot set estado = 'cerrado', cerrado_at = ${ahora}
      where id = any(${listos.map((f) => Number(f.id))}) and estado = 'abierto'
      returning id, causa, fallos, conversaciones, recordatorios, abierto_at, ultimo_fallo_at, ultimo_aviso_at
    `;
    if (!cerrados.length) return false;
    abiertos = null;
    // Un solo «volvió» aunque se cierren dos causas a la vez: cuenta desde la
    // más vieja y junta los chats de todas.
    const primero = [...cerrados].sort((a, b) => a.abierto_at.getTime() - b.abierto_at.getTime())[0];
    const chats = new Set(cerrados.flatMap((f) => f.conversaciones.map(String)));
    await avisarASoporte({
      clase: "vuelta",
      texto: textoDeVuelta({
        cliente: negocio.nombre, causa: primero.causa, chatsAfectados: chats.size,
        desde: primero.abierto_at, ahora,
      }),
      incidenteId: Number(primero.id),
    });
    return true;
  } catch (error) {
    console.error("⚠️ No se pudo cerrar el incidente del bot:", error instanceof Error ? error.message : error);
    return false;
  }
}

// ── Para el panel ────────────────────────────────────────────────────────────

export interface EstadoDeSoporte {
  incidentesAbiertos: { id: number; causa: string; fallos: number; chats: number; desde: string }[];
  avisos: { id: number; clase: string; titulo: string; cuerpo: string; push: number; whatsapp: string; cuando: string }[];
}

/** Los incidentes abiertos y los últimos avisos que salieron, para Ajustes → Bot. */
export async function estadoDeSoporte(limite = 15): Promise<EstadoDeSoporte> {
  const [incidentes, avisos] = await Promise.all([
    sql<{ id: number; causa: string; fallos: number; conversaciones: string[]; abierto_at: Date }[]>`
      select id, causa, fallos, conversaciones, abierto_at from incidentes_del_bot
      where estado = 'abierto' order by abierto_at
    `,
    sql<{ id: number; clase: string; titulo: string; cuerpo: string; push_enviados: number; whatsapp: string; created_at: Date }[]>`
      select id, clase, titulo, cuerpo, push_enviados, whatsapp, created_at from avisos_a_soporte
      order by created_at desc limit ${limite}
    `,
  ]);
  return {
    incidentesAbiertos: incidentes.map((i) => ({
      id: Number(i.id), causa: i.causa, fallos: Number(i.fallos), chats: i.conversaciones.length,
      desde: i.abierto_at.toISOString(),
    })),
    avisos: avisos.map((a) => ({
      id: Number(a.id), clase: a.clase, titulo: a.titulo, cuerpo: a.cuerpo,
      push: Number(a.push_enviados), whatsapp: a.whatsapp, cuando: a.created_at.toISOString(),
    })),
  };
}
