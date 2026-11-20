import { z } from "zod";
import { sql } from "../db/client.js";
import { sendAdvisorTemplate, sendAdvisorText } from "../wa/client.js";
import { primerNombre } from "./avisoDeLaManana.js";

/**
 * El aviso al asesor por PLANTILLA cuando su ventana de 24 h está cerrada
 * (20-nov-2026).
 *
 * Meta acepta el texto libre al asesor y después lo rechaza por el webhook con
 * el 131047 si esa persona no le escribió al bot en 24 h. La plantilla de la
 * mañana (`avisos_del_dia_v1`) reabre la ventana solo si tocan «Listo»; el
 * que no lo toca se quedaba sin NINGÚN aviso del día (Competimotor, 18–20 nov:
 * todos los avisos rebotaron). Ahora ese aviso se reenvía una vez como
 * plantilla, que sí llega con la ventana cerrada, con el texto entero en una
 * línea. Su botón «Ver aviso» reabre la ventana y devuelve los avisos completos.
 *
 * La plantilla vive en la cuenta de WhatsApp de cada cliente: si no existe ahí,
 * el envío falla y queda la alerta de siempre (no se pierde nada respecto a hoy).
 */

export const BOTON_VER_AVISO = "Ver aviso";

/** Lo que se agrega al `error` del aviso: marca que ya se intentó por plantilla. */
export const MARCA_PLANTILLA = "reenviado con plantilla";

const ConfigSchema = z.object({
  activo: z.boolean().default(true),
  plantilla: z.string().min(1).max(512).default("aviso_asesor_v1"),
  idioma: z.string().min(1).max(20).default("es"),
});
export type ConfigAvisoPorPlantilla = z.infer<typeof ConfigSchema>;

export async function getConfigAvisoPorPlantilla(): Promise<ConfigAvisoPorPlantilla> {
  try {
    const [fila] = await sql<{ value: unknown }[]>`select value from settings where key = 'aviso_asesor_plantilla'`;
    const parsed = ConfigSchema.safeParse(fila?.value ?? {});
    if (parsed.success) return parsed.data;
  } catch {
    // sin settings legibles, el defecto: intentar la plantilla no rompe nada
  }
  return ConfigSchema.parse({});
}

/**
 * Meta rechaza variables de plantilla con saltos de línea, tabs o más de 4
 * espacios seguidos. El aviso se aplana a una línea separada por « · » y se
 * corta para que el cuerpo entero quede bajo los 1.024 caracteres.
 */
export function avisoEnUnaLinea(texto: string, max = 700): string {
  const linea = texto
    .replace(/\t/g, " ")
    .replace(/\s*\n+\s*/g, " · ")
    .replace(/ {2,}/g, " ")
    .replace(/(?:· ){2,}/g, "· ")
    .replace(/^[\s·]+|[\s·]+$/g, "")
    .trim();
  if (!linea) return "revisa el panel";
  return linea.length <= max ? linea : `${linea.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Reenvía UN aviso rechazado por ventana cerrada como plantilla. Devuelve true
 * si Meta la aceptó (el aviso vuelve a 'sent' con el wamid nuevo; si la
 * plantilla también falla, el webhook la marca 'failed' por el camino normal).
 */
export async function reenviarAvisoConPlantilla(aviso: {
  id: number;
  recipient_name: string;
  recipient_phone: string;
  message: string;
  detalle: string;
}): Promise<boolean> {
  const cfg = await getConfigAvisoPorPlantilla();
  if (!cfg.activo) return false;
  try {
    const wamid = await sendAdvisorTemplate({
      to: aviso.recipient_phone,
      templateName: cfg.plantilla,
      language: cfg.idioma,
      variables: [primerNombre(aviso.recipient_name), avisoEnUnaLinea(aviso.message)],
    });
    await sql`
      update advisor_notifications
      set status = 'sent', provider_message_id = ${wamid ?? null}, sent_at = now(),
          delivered_at = null, error = ${`${aviso.detalle} · ${MARCA_PLANTILLA}`}, updated_at = now()
      where id = ${aviso.id}
    `;
    return true;
  } catch (error) {
    console.warn(
      `⚠️ Tampoco salió la plantilla del aviso a ${aviso.recipient_name}:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/**
 * El asesor tocó «Ver aviso»: su ventana ya está abierta, así que se le mandan
 * completos (con formato) los avisos de las últimas 24 h que solo le llegaron
 * como plantilla. Como mucho los 5 más recientes, del más viejo al más nuevo.
 */
export async function entregarAvisosCompletos(telefono: string): Promise<number> {
  const numero = telefono.replace(/\D/g, "");
  const filas = await sql<{ message: string }[]>`
    select message from (
      select message, sent_at from advisor_notifications
      where recipient_phone = ${numero}
        and error like ${`%${MARCA_PLANTILLA}%`}
        and sent_at > now() - interval '24 hours'
      order by sent_at desc limit 5
    ) t order by sent_at
  `;
  let enviados = 0;
  for (const fila of filas) {
    try {
      await sendAdvisorText(fila.message, numero);
      enviados += 1;
    } catch (error) {
      console.warn("⚠️ No se pudo entregar el aviso completo:", error instanceof Error ? error.message : error);
    }
  }
  return enviados;
}
