/**
 * AVISOS EN LA APP DEL TELÉFONO (22-nov-2026).
 *
 * Manuel instaló el panel como app y pidió repartir los avisos así:
 *
 *  · por WHATSAPP lo que pide actuar ya (el cliente quiere un asesor, está
 *    listo para pagar, hay una cita, el Excel de stock, el resumen del día);
 *  · por la APP lo que conviene saber pero no pide hacer nada (cotización
 *    enviada, venta confirmada).
 *
 * Y la app tiene que «detectar» cuándo un asesor activa las notificaciones:
 * desde ese momento sus avisos de la segunda lista dejan de salir por WhatsApp
 * y le llegan por la app. Quien no la activó sigue recibiendo todo por
 * WhatsApp, como siempre: nadie se queda sin aviso por no tener la app.
 *
 * Los urgentes siguen por WhatsApp para todos, y a quien tiene la app le llegan
 * ADEMÁS por ahí: si su ventana de 24 h está cerrada el WhatsApp rebota (Meta
 * 131047) y la notificación de la app no depende de esa ventana.
 */
import webpush from "web-push";
import { config } from "../config.js";
import { sql } from "../db/client.js";
import { tel9 } from "./fuentes/contifico.js";
import type { AdvisorEventType } from "./advisorNotifications.js";

/**
 * Lo que va por la app cuando el asesor la tiene activada. Fuente única: Ajustes
 * y el historial leen de acá. «Cliente nuevo asignado» y «respondió a una
 * cotización vieja» todavía no existen como avisos; cuando existan, van aquí.
 */
export const EVENTOS_POR_LA_APP: readonly AdvisorEventType[] = ["quote_created", "venta_confirmada"];

export const vaPorLaApp = (evento: AdvisorEventType): boolean => EVENTOS_POR_LA_APP.includes(evento);

// ── Claves de firma (VAPID) ──────────────────────────────────────────────────

let claves: { publicKey: string; privateKey: string } | null = null;

/** Las claves con que se firman los avisos. Se crean solas la primera vez. */
export async function clavesPush(): Promise<{ publicKey: string; privateKey: string }> {
  if (claves) return claves;
  const [fila] = await sql<{ public_key: string; private_key: string }[]>`
    select public_key, private_key from push_keys where id = 1
  `;
  if (fila) {
    claves = { publicKey: fila.public_key, privateKey: fila.private_key };
    return claves;
  }
  const nuevas = webpush.generateVAPIDKeys();
  // Dos arranques a la vez: gana el primero y los dos leen lo mismo.
  await sql`
    insert into push_keys (id, public_key, private_key)
    values (1, ${nuevas.publicKey}, ${nuevas.privateKey})
    on conflict (id) do nothing
  `;
  const [guardada] = await sql<{ public_key: string; private_key: string }[]>`
    select public_key, private_key from push_keys where id = 1
  `;
  claves = { publicKey: guardada.public_key, privateKey: guardada.private_key };
  return claves;
}

export function olvidarClavesPush(): void {
  claves = null;
}

// ── Suscripciones ────────────────────────────────────────────────────────────

export interface SuscripcionEntrante {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function leerSuscripcion(valor: unknown): SuscripcionEntrante | null {
  const s = valor as Partial<SuscripcionEntrante> | null;
  const endpoint = String(s?.endpoint ?? "");
  const p256dh = String(s?.keys?.p256dh ?? "");
  const auth = String(s?.keys?.auth ?? "");
  if (!/^https:\/\/[^\s]{10,1000}$/.test(endpoint) || p256dh.length < 20 || auth.length < 8) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/**
 * Guarda (o actualiza) el teléfono que activó las notificaciones. `advisorPhone`
 * es el número de WhatsApp de ese asesor en la lista de avisos: con él se sabe
 * qué avisos dejar de mandarle por WhatsApp. Vacío = solo quiere ver el historial.
 */
export async function guardarSuscripcion(input: {
  userId: string;
  userName: string;
  advisorPhone: string | null;
  suscripcion: SuscripcionEntrante;
  userAgent?: string | null;
}): Promise<void> {
  const telefono = input.advisorPhone ? String(input.advisorPhone).replace(/\D/g, "") : null;
  await sql`
    insert into push_subscriptions (user_id, user_name, advisor_phone, endpoint, p256dh, auth, user_agent)
    values (${input.userId}, ${input.userName}, ${telefono || null}, ${input.suscripcion.endpoint},
      ${input.suscripcion.keys.p256dh}, ${input.suscripcion.keys.auth}, ${(input.userAgent ?? "").slice(0, 300) || null})
    on conflict (endpoint) do update set
      user_id = excluded.user_id, user_name = excluded.user_name, advisor_phone = excluded.advisor_phone,
      p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, failed_count = 0
  `;
}

export async function borrarSuscripcion(endpoint: string): Promise<void> {
  await sql`delete from push_subscriptions where endpoint = ${endpoint}`;
}

/** El asesor (teléfono) que este usuario dijo ser al activar las notificaciones. */
export async function telefonoDelUsuario(userId: string): Promise<string | null> {
  const [fila] = await sql<{ advisor_phone: string | null }[]>`
    select advisor_phone from push_subscriptions
    where user_id = ${userId} and advisor_phone is not null
    order by created_at desc limit 1
  `;
  return fila?.advisor_phone ?? null;
}

/**
 * Los asesores (por los últimos 9 dígitos de su número) que tienen la app
 * activada en algún teléfono. Si la tabla no se puede leer, nadie: el aviso
 * sale por WhatsApp como siempre, que es el lado seguro.
 */
export async function asesoresConApp(): Promise<Set<string>> {
  try {
    const filas = await sql<{ advisor_phone: string }[]>`
      select distinct advisor_phone from push_subscriptions
      where advisor_phone is not null and failed_count < 5
    `;
    return new Set(filas.map((f) => tel9(f.advisor_phone)).filter((t): t is string => Boolean(t)));
  } catch (error) {
    console.error("⚠️ No se pudo leer push_subscriptions:", error instanceof Error ? error.message : error);
    return new Set();
  }
}

// ── Envío ────────────────────────────────────────────────────────────────────

export interface AvisoPush {
  titulo: string;
  cuerpo: string;
  /** A dónde lleva el toque, dentro del panel: `#/ticket/12`. */
  ruta?: string;
  /** Avisos con la misma etiqueta se reemplazan en vez de apilarse. */
  etiqueta?: string;
}

/** Quién firma los avisos ante Apple/Google: la dirección pública del panel de este negocio. */
function asuntoVapid(): string {
  const url = String(config.hub.publicUrl ?? "");
  return /^https:\/\//.test(url) ? url : "https://autoventa.app";
}

/** Para pruebas: en vez de salir a internet, el aviso se entrega a esta función. */
let transporte: ((sub: { endpoint: string }, cuerpo: string) => Promise<unknown>) | null = null;
export function _usarTransportePush(fn: typeof transporte): void {
  transporte = fn;
}

/**
 * Manda el aviso a todos los teléfonos de esos asesores. Nunca lanza: un aviso
 * de la app que falla no puede tumbar el flujo que lo disparó. Devuelve a
 * cuántos teléfonos salió.
 */
export async function enviarPushAAsesores(telefonos: string[], aviso: AvisoPush): Promise<number> {
  const llaves = [...new Set(telefonos.map((t) => tel9(t)).filter((t): t is string => Boolean(t)))];
  if (!llaves.length) return 0;
  try {
    const subs = await sql<FilaDeSuscripcion[]>`
      select id, endpoint, p256dh, auth from push_subscriptions
      where advisor_phone is not null and failed_count < 5
        and right(regexp_replace(advisor_phone, '\\D', '', 'g'), 9) = any(${llaves})
    `;
    return await entregarPush(subs, aviso);
  } catch (error) {
    console.error("⚠️ No se pudo mandar el aviso por la app:", error instanceof Error ? error.message : error);
    return 0;
  }
}

/**
 * Manda el aviso a todos los teléfonos donde ESOS USUARIOS del panel activaron
 * las notificaciones, sean o no asesores de la lista de avisos. Es el camino de
 * los avisos a soporte (24-nov-2026: «el bot no respondió», «saldo bajo»): van
 * a la persona, no a un nivel de asesor, y no dependen de la ventana de 24 h
 * de WhatsApp. Nunca lanza.
 */
export async function enviarPushAUsuarios(userIds: readonly string[], aviso: AvisoPush): Promise<number> {
  const ids = [...new Set(userIds.map((u) => u.trim()).filter(Boolean))];
  if (!ids.length) return 0;
  try {
    const subs = await sql<FilaDeSuscripcion[]>`
      select id, endpoint, p256dh, auth from push_subscriptions
      where failed_count < 5 and user_id = any(${ids})
    `;
    return await entregarPush(subs, aviso);
  } catch (error) {
    console.error("⚠️ No se pudo mandar el aviso por la app:", error instanceof Error ? error.message : error);
    return 0;
  }
}

interface FilaDeSuscripcion { id: number; endpoint: string; p256dh: string; auth: string }

/** El envío en sí, igual para asesores y para usuarios. Devuelve a cuántos teléfonos salió. */
async function entregarPush(subs: FilaDeSuscripcion[], aviso: AvisoPush): Promise<number> {
  if (!subs.length) return 0;
  const { publicKey, privateKey } = await clavesPush();
  const cuerpo = JSON.stringify(aviso);
  let enviados = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      if (transporte) await transporte({ endpoint: s.endpoint }, cuerpo);
      else {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          cuerpo,
          { vapidDetails: { subject: asuntoVapid(), publicKey, privateKey }, TTL: 6 * 60 * 60, urgency: "high" },
        );
      }
      enviados += 1;
      await sql`update push_subscriptions set last_ok_at = now(), failed_count = 0 where id = ${s.id}`;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      // 404/410: el teléfono desinstaló la app o revocó el permiso. Se borra:
      // ese asesor vuelve a recibir por WhatsApp sin que nadie haga nada.
      if (status === 404 || status === 410) await sql`delete from push_subscriptions where id = ${s.id}`;
      else await sql`update push_subscriptions set failed_count = failed_count + 1 where id = ${s.id}`;
    }
  }));
  return enviados;
}

// ── Historial ────────────────────────────────────────────────────────────────

export interface AvisoDelHistorial {
  id: number;
  evento: string;
  mensaje: string;
  canal: "whatsapp" | "app";
  estado: string;
  conversationId: number | null;
  cliente: string | null;
  cuando: string;
}

/**
 * Los avisos de los últimos días, lo más nuevo primero. Con `telefono` solo los
 * de ese asesor; sin él (un administrador que no recibe avisos) todos, uno por
 * aviso aunque haya salido a varios asesores.
 */
export async function historialDeAvisos(telefono: string | null, dias = 14, limite = 200): Promise<AvisoDelHistorial[]> {
  const llave = telefono ? tel9(telefono) : null;
  const filas = await sql<{
    id: number; event_type: string; message: string; channel: string; status: string;
    conversation_id: number | null; cliente: string | null; created_at: Date;
  }[]>`
    select distinct on (n.dedupe_key) n.id, n.event_type, n.message, n.channel, n.status,
      n.conversation_id, coalesce(c.name, c.phone) as cliente, n.created_at
    from advisor_notifications n
    left join conversations c on c.id = n.conversation_id
    where n.created_at > now() - make_interval(days => ${dias})
      and (${llave}::text is null or right(regexp_replace(n.recipient_phone, '\\D', '', 'g'), 9) = ${llave})
    order by n.dedupe_key, n.created_at desc
  `;
  return filas
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(0, limite)
    .map((f) => ({
      id: Number(f.id),
      evento: f.event_type,
      mensaje: f.message,
      canal: f.channel === "app" ? "app" : "whatsapp",
      estado: f.status,
      conversationId: f.conversation_id == null ? null : Number(f.conversation_id),
      cliente: f.cliente,
      cuando: f.created_at.toISOString(),
    }));
}
