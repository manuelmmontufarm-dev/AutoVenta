/**
 * Interruptor global del bot.
 *
 * Apaga las dos vías por las que el bot habla solo: la respuesta automática a
 * un mensaje entrante y los seguimientos programados. Nada más se toca.
 *
 * Lo que SIGUE funcionando con el bot apagado, a propósito:
 * - Se reciben y guardan los mensajes del cliente (el webhook sigue en pie),
 *   así que el dueño los ve en el hub y no se pierde ninguna venta.
 * - El dueño puede responder a mano desde el panel — apagar el bot no es
 *   apagar el WhatsApp.
 *
 * Vive en `settings` como el resto de la configuración, así que se apaga desde
 * el panel sin redeploy. El TTL del cache es corto **a propósito**: un
 * interruptor de emergencia que tarda un minuto en surtir efecto no sirve, y
 * el worker de seguimientos corre en otro proceso donde invalidar el cache en
 * memoria no alcanza.
 *
 * Con qué estado NACE una instalación lo decide `BOT_POWER_DEFAULT`:
 * - sin definir (o "on") → encendido, como siempre. Es lo correcto para el
 *   staging y para cualquier deploy que ya estaba trabajando.
 * - "off" → apagado hasta que alguien lo encienda desde el panel. Es lo que
 *   quiere un cliente recién conectado: el webhook ya recibe mensajes reales
 *   antes de que el catálogo, el prompt y las pruebas estén listos, y nadie
 *   quiere que el bot conteste solo mientras tanto.
 */
import { z } from "zod";
import { sql } from "../db/client.js";

export const BotPowerSchema = z.object({
  activo: z.boolean().default(true),
  /** Cuándo se apagó (ISO). null mientras está encendido. */
  apagadoAt: z.string().nullable().default(null),
  /** Nota opcional del dueño: "probando", "catálogo desactualizado"… */
  motivo: z.string().max(200).default(""),
});

export type BotPower = z.infer<typeof BotPowerSchema>;

export const BOT_POWER_ON: BotPower = BotPowerSchema.parse({});

/**
 * Estado con el que nace la instalación (ver cabecera). Se lee en cada llamada
 * y no al importar el módulo: el worker y la API son procesos distintos y las
 * pruebas cambian el entorno en caliente.
 */
function defaultPower(): BotPower {
  const raw = (process.env.BOT_POWER_DEFAULT ?? "on").trim().toLowerCase();
  if (raw !== "off" && raw !== "apagado" && raw !== "false" && raw !== "0") return BOT_POWER_ON;
  return {
    activo: false,
    // No hubo un apagado: nunca se encendió. Poner una fecha aquí haría que el
    // panel dijera "apagado desde <el arranque>", que es una media verdad.
    apagadoAt: null,
    motivo: "Nunca se ha encendido en este servidor",
  };
}

/**
 * Corto a propósito: es un interruptor de emergencia (ver cabecera).
 * Configurable solo para que las pruebas no tengan que dormir 5 s reales; en
 * producción no se define y manda el default.
 */
const CACHE_TTL_MS = Number(process.env.BOT_POWER_CACHE_MS ?? 5_000);
let cache: { value: BotPower; at: number } | null = null;

export async function getBotPower(): Promise<BotPower> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    const [row] = await sql<{ value: unknown }[]>`
      select value from settings where key = 'bot_power'
    `;
    // Sin fila nadie ha decidido nada todavía: manda el default de la
    // instalación. Con fila, manda lo guardado (y si viniera corrupta, se cae
    // también al default en vez de inventar un estado).
    const parsed = row ? BotPowerSchema.safeParse(row.value) : null;
    const value = parsed?.success ? parsed.data : defaultPower();
    cache = { value, at: Date.now() };
    return value;
  } catch {
    // Con la DB caída se devuelve el default de la instalación, no un "sí"
    // fijo: en un cliente que nace apagado, un error de lectura no puede ser
    // la forma en que el bot se enciende solo y le escribe a gente real.
    // Donde el default es encendido, esto se comporta como antes: una consulta
    // caída no deja mudo al negocio.
    return defaultPower();
  }
}

/** Atajo para los puntos donde solo importa el sí/no. */
export async function isBotActive(): Promise<boolean> {
  return (await getBotPower()).activo;
}

/**
 * Excepción de pruebas: con el bot apagado, estos teléfonos SÍ reciben
 * respuesta. Así el dueño apaga el bot para los clientes reales y sigue
 * probando desde su propio chat sin encenderlo para todo el mundo.
 *
 * Quiénes: los números de `BOT_APAGADO_EXCEPTO` (separados por coma) y, si esa
 * variable no está definida, el teléfono del vendedor (Ajustes → Canal /
 * SELLER_PHONE). Solo aplica a la respuesta al mensaje entrante: los
 * seguimientos programados quedan apagados también para estos números, porque
 * apagado significa que el bot no le escribe solo a nadie.
 */
export async function contestaAunApagado(telefono: string): Promise<boolean> {
  const soloDigitos = (t: string) => t.replace(/\D+/g, "");
  const quien = soloDigitos(telefono);
  if (!quien) return false;
  const crudo = process.env.BOT_APAGADO_EXCEPTO;
  let lista: string[];
  if (crudo !== undefined) {
    lista = crudo.split(",").map(soloDigitos).filter(Boolean);
  } else {
    const { getChannelConfig } = await import("./channel.js");
    const vendedor = soloDigitos((await getChannelConfig()).sellerPhone);
    lista = vendedor ? [vendedor] : [];
  }
  return lista.includes(quien);
}

/**
 * Lo que el panel PUEDE mandar, y nada más.
 *
 * NO es `BotPowerSchema.partial()`: en zod 4 `.partial()` deja vivos los
 * `.default()`, así que un `{ motivo: "x" }` volvía con `activo: true` metido
 * de contrabando y **encendía el bot** en una llamada que solo quería corregir
 * la nota. Con campos opcionales de verdad, «no vino» sigue siendo `undefined`
 * y se distingue de «vino vacío».
 *
 * `apagadoAt` no está a propósito: la marca la pone el servidor (ver abajo).
 */
const BotPowerInputSchema = z.object({
  activo: z.boolean().optional(),
  motivo: z.string().max(200).optional(),
});

export async function setBotPower(input: unknown): Promise<BotPower> {
  const partial = BotPowerInputSchema.parse(input ?? {});
  const current = await getBotPower();
  const activo = partial.activo ?? current.activo;
  const next: BotPower = {
    activo,
    // La marca de tiempo la pone el servidor, no el cliente: es lo que se
    // muestra en el panel como «apagado desde…». Reapagar algo ya apagado
    // conserva la marca del primer apagado: lo que importa es desde cuándo el
    // negocio está mudo, no la última vez que alguien tocó el botón.
    apagadoAt: activo ? null : (current.activo ? new Date().toISOString() : current.apagadoAt),
    // El motivo describe el estado ACTUAL, no solo el apagado. Antes se borraba
    // al encender, y por eso «ya está el catálogo» o «terminé de probar» se
    // perdían: el panel y el aviso a los asesores solo podían explicar por qué
    // se había apagado, nunca por qué se volvió a encender. Sin motivo nuevo se
    // conserva el de antes SOLO si el estado no cambió; en un cambio de estado
    // el motivo viejo describía la situación contraria y sería una mentira.
    motivo: partial.motivo ?? (activo === current.activo ? current.motivo : ""),
  };
  await sql`
    insert into settings (key, value)
    values ('bot_power', ${sql.json(next)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  cache = { value: next, at: Date.now() };
  return next;
}
