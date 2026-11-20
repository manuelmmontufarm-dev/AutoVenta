import { z } from "zod";
import { sql } from "../db/client.js";
import { sendAdvisorTemplate } from "../wa/client.js";
import { candadoPeriodico } from "./dailyReportDelivery.js";

/**
 * El aviso de la mañana a los asesores (19-nov-2026).
 *
 * Meta solo deja mandarle texto libre a quien escribió al número del negocio en
 * las últimas 24 h; fuera de eso el aviso muere con 131047. Hasta hoy la salida
 * era recordarle a alguien que le pida al asesor «mandá cualquier mensaje»
 * (`advisorWindow.ts`), y dependía de que alguien hiciera caso.
 *
 * Ahora, todas las mañanas, cada asesor activo recibe una plantilla aprobada
 * (`avisos_del_dia_v1`, ~1 ¢) con un solo botón: «Listo». Al tocarlo, ese toque
 * cuenta como un mensaje suyo y la ventana queda abierta 24 h: todos los avisos
 * del día le llegan gratis. Sale todos los días, sin mirar la ventana, porque
 * Manuel lo prefirió así: un hábito diario es más fácil que uno a veces.
 */

export const AvisoMananaSchema = z.object({
  activo: z.boolean().default(true),
  /** Hora local de Guayaquil, «HH:MM». */
  hora: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  /** Nombre exacto de la plantilla aprobada en Meta. */
  plantilla: z.string().min(1).max(512).default("avisos_del_dia_v1"),
  idioma: z.string().min(1).max(20).default("es"),
});
export type AvisoManana = z.infer<typeof AvisoMananaSchema>;

export interface ResultadoAvisoManana {
  dia: string;
  enviadoEn: string;
  total: number;
  enviados: number;
  fallos: { nombre: string; error: string }[];
  manual: boolean;
}

const CLAVE_CONFIG = "aviso_manana";
const CLAVE_RESULTADO = "aviso_manana_resultado";
const candado = candadoPeriodico("aviso_manana_ultimo");

/** El texto de la plantilla lo fija Meta; el botón también. Sirve para reconocer el toque. */
export const BOTON_LISTO = "Listo";

export async function getAvisoManana(): Promise<AvisoManana> {
  const [fila] = await sql<{ value: unknown }[]>`select value from settings where key = ${CLAVE_CONFIG}`;
  const parsed = AvisoMananaSchema.safeParse(fila?.value ?? {});
  return parsed.success ? parsed.data : AvisoMananaSchema.parse({});
}

export async function saveAvisoManana(input: unknown): Promise<AvisoManana> {
  const valor = AvisoMananaSchema.parse(input ?? {});
  await sql`
    insert into settings (key, value) values (${CLAVE_CONFIG}, ${sql.json(valor)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  return valor;
}

export async function ultimoResultadoAvisoManana(): Promise<ResultadoAvisoManana | null> {
  const [fila] = await sql<{ value: unknown }[]>`select value from settings where key = ${CLAVE_RESULTADO}`;
  return (fila?.value as ResultadoAvisoManana | undefined) ?? null;
}

/** Día y minuto del día en Guayaquil: el negocio vive en esa hora, no en UTC. */
export function relojDeGuayaquil(ahora: Date): { dia: string; minutos: number } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(ahora).map((p) => [p.type, p.value]),
  );
  return {
    dia: `${partes.year}-${partes.month}-${partes.day}`,
    minutos: (Number(partes.hour) % 24) * 60 + Number(partes.minute),
  };
}

/**
 * ¿Toca mandarlo ahora? Solo desde la hora configurada hasta el mediodía: si el
 * proceso estuvo caído toda la mañana, mandarlo a las 4 pm ya no sirve para lo
 * que es («recibir hoy los avisos») y confunde.
 */
export function tocaAvisoManana(cfg: Pick<AvisoManana, "activo" | "hora">, ahora: Date): boolean {
  if (!cfg.activo) return false;
  const [h, m] = cfg.hora.split(":").map(Number);
  const desde = h * 60 + m;
  const { minutos } = relojDeGuayaquil(ahora);
  return minutos >= desde && minutos < Math.max(desde + 60, 12 * 60);
}

/** «Joaquín Tamayo» → «Joaquín». La plantilla saluda por el nombre. */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] || "equipo";
}

/**
 * Manda la plantilla a todos los asesores activos, una vez por día.
 * `forzar` (botón «Enviar ahora» del panel) se salta la hora y el candado.
 */
export async function enviarAvisoDeLaManana(
  opciones: { ahora?: Date; forzar?: boolean } = {},
): Promise<ResultadoAvisoManana | null> {
  const ahora = opciones.ahora ?? new Date();
  const cfg = await getAvisoManana();
  const { dia } = relojDeGuayaquil(ahora);
  if (!opciones.forzar) {
    if (!tocaAvisoManana(cfg, ahora)) return null;
    if (!(await candado.reclamar(dia))) return null;
  }
  const asesores = await sql<{ nombre: string; telefono: string }[]>`
    select nombre, telefono from advisors where active and telefono <> '' order by prioridad, id
  `;
  const fallos: ResultadoAvisoManana["fallos"] = [];
  let enviados = 0;
  for (const asesor of asesores) {
    try {
      await sendAdvisorTemplate({
        to: asesor.telefono,
        templateName: cfg.plantilla,
        language: cfg.idioma,
        variables: [primerNombre(asesor.nombre)],
      });
      enviados += 1;
    } catch (error) {
      fallos.push({ nombre: asesor.nombre, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const resultado: ResultadoAvisoManana = {
    dia, enviadoEn: ahora.toISOString(), total: asesores.length, enviados, fallos,
    manual: Boolean(opciones.forzar),
  };
  await sql`
    insert into settings (key, value) values (${CLAVE_RESULTADO}, ${sql.json(resultado as never)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  return resultado;
}
