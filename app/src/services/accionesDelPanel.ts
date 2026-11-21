/**
 * QUIÉN HIZO QUÉ EN EL PANEL (21-nov-2026, Manuel: «para saber a quién escribirle»).
 *
 * Cada acción del panel sobre un ticket —cerrar, añadir factura, reabrir,
 * tomar o devolver al bot, deshacer venta, descuentos, mover de etapa, mandar
 * un mensaje— deja una fila en `audit_events` (la tabla que ya existía; no se
 * inventó otra): `actor` = el usuario logueado («clave admin» si la llamada
 * entra con la clave sin usuario), `action`, `entity_id` = el ticket, y en
 * `before_value` / `after_value` la foto del ticket antes y después (etapa,
 * estado, quién atiende, ciclo) más el detalle. Las ventas de `/venta` quedan
 * con el nombre que escribe el vendedor.
 *
 * SOLO SE GUARDA, no se muestra en el panel (Manuel, 21-nov): cuando hace falta
 * se pregunta. La consulta está en docs/QUIEN-HIZO-QUE.md.
 *
 * Límite: lo que contestan desde el WhatsApp del teléfono (los ecos de Meta,
 * `author_kind = 'owner'`) no dice quién fue — es un solo número para todos.
 * Eso solo se sabe cuando escriben desde el panel.
 */
import type express from "express";
import { sql } from "../db/client.js";

/** Lo que se muestra cuando la llamada vino con `x-admin-key` y sin usuario. */
export const CLAVE_ADMIN = "clave admin";

/** El nombre de quien está usando el panel. */
export function quienEnElPanel(req: Pick<express.Request, "usuario">): string {
  return req.usuario?.nombre?.trim() || CLAVE_ADMIN;
}

export type AccionDelPanel =
  | "cerrar_ganado"
  | "cerrar_perdido"
  | "cerrar_sin_respuesta"
  | "agregar_factura"
  | "deshacer_venta"
  | "reabrir"
  | "tomar"
  | "devolver_al_bot"
  | "descuento"
  | "mover_etapa"
  | "mensaje"
  | "registrar_venta"
  | "anular_registro";

export interface FotoDelTicket {
  etapa: string;
  estado: string;
  atiende: string;
  ciclo: number;
}

/** Cómo está el ticket ahora: se toma antes de la acción para guardar el «antes». */
export async function fotoDelTicket(conversationId: number): Promise<FotoDelTicket | null> {
  try {
    const [c] = await sql<{ stage: string; status: string; assigned_to: string; current_cycle: number }[]>`
      select stage, status, assigned_to, current_cycle from conversations where id = ${conversationId}
    `;
    return c ? { etapa: c.stage, estado: c.status, atiende: c.assigned_to, ciclo: c.current_cycle } : null;
  } catch {
    return null;
  }
}

/**
 * Guarda una acción con el ticket antes (lo que se pasa) y después (se lee
 * acá) más el detalle. Nunca tumba la acción misma si la auditoría falla.
 */
export async function registrarAccion(
  conversationId: number,
  accion: AccionDelPanel,
  quien: string,
  detalle: Record<string, unknown> = {},
  antes: FotoDelTicket | null = null,
): Promise<void> {
  try {
    const despues = await fotoDelTicket(conversationId);
    await sql`
      insert into audit_events (actor, action, entity_type, entity_id, before_value, after_value)
      values (${quien.slice(0, 80)}, ${accion}, 'conversation', ${String(conversationId)},
        ${antes ? sql.json(antes as never) : null}, ${sql.json({ ...(despues ?? {}), ...detalle } as never)})
    `;
  } catch (error) {
    console.error(`⚠️ No se pudo guardar «${accion}» de ${quien} en la conv ${conversationId}:`, error);
  }
}

export interface AccionDelHistorial {
  accion: AccionDelPanel;
  quien: string;
  at: Date;
  detalle: Record<string, unknown>;
}

/** Las últimas acciones del ticket, la más nueva primero. */
export async function historialDelTicket(conversationId: number, limite = 30): Promise<AccionDelHistorial[]> {
  const filas = await sql<{ action: AccionDelPanel; actor: string; created_at: Date; after_value: Record<string, unknown> | null }[]>`
    select action, actor, created_at, after_value from audit_events
    where entity_type = 'conversation' and entity_id = ${String(conversationId)}
    order by created_at desc, id desc
    limit ${limite}
  `;
  return filas.map((f) => ({ accion: f.action, quien: f.actor, at: f.created_at, detalle: f.after_value ?? {} }));
}

/** Claves que nunca se guardan tal cual en la bitácora. */
const SECRETO = /clave|key|token|password|contrase|secret|pin|hash|authorization/i;

export function cuerpoSinSecretos(valor: unknown, profundidad = 0): unknown {
  if (valor == null || typeof valor !== "object") {
    return typeof valor === "string" && valor.length > 500 ? `${valor.slice(0, 500)}…` : valor;
  }
  if (Buffer.isBuffer(valor)) return `[archivo de ${valor.length} bytes]`;
  if (profundidad > 4) return "…";
  if (Array.isArray(valor)) {
    const lista = valor.slice(0, 50).map((v) => cuerpoSinSecretos(v, profundidad + 1));
    return valor.length > 50 ? [...lista, `… ${valor.length - 50} más`] : lista;
  }
  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, SECRETO.test(k) ? "[oculto]" : cuerpoSinSecretos(v, profundidad + 1)]),
  );
}

/**
 * Middleware: todo cambio hecho desde el panel queda en `audit_events` con el
 * usuario (o «clave admin»), la ruta, el cuerpo sin secretos y el código de
 * respuesta. Nunca frena ni rompe la respuesta.
 */
export function registrarCambioDelPanel(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  const actor = quienEnElPanel(req);
  const ruta = req.originalUrl.split("?")[0].slice(0, 300);
  const cuerpo = cuerpoSinSecretos(req.body ?? null);
  res.on("finish", () => {
    void sql`
      insert into audit_events (actor, action, entity_type, entity_id, before_value, after_value)
      values (${actor}, ${`${req.method} ${ruta}`}, 'panel', ${ruta},
        ${sql.json((cuerpo ?? null) as never)}, ${sql.json({ status: res.statusCode })})
    `.catch((e) => console.warn("⚠️ No se guardó la bitácora del panel:", e));
  });
  next();
}
