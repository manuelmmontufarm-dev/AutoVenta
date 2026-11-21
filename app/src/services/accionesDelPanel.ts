/**
 * QUIÉN HIZO QUÉ EN EL PANEL (21-nov-2026, Manuel: «para saber a quién escribirle»).
 *
 * Cada acción del panel sobre un ticket —cerrar, añadir factura, reabrir,
 * tomar o devolver al bot, deshacer venta, descuentos, mover de etapa, mandar
 * un mensaje— deja una fila en `audit_events` (la tabla que ya existía; no se
 * inventó otra) con el usuario logueado. Si la llamada entra con la clave
 * administrativa sin usuario, queda «clave admin». Las ventas de `/venta`
 * quedan con el nombre que escribe el vendedor.
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

/** Guarda una acción. Nunca tumba la acción misma si la base de auditoría falla. */
export async function registrarAccion(
  conversationId: number,
  accion: AccionDelPanel,
  quien: string,
  detalle: Record<string, unknown> = {},
): Promise<void> {
  try {
    await sql`
      insert into audit_events (actor, action, entity_type, entity_id, after_value)
      values (${quien.slice(0, 80)}, ${accion}, 'conversation', ${String(conversationId)}, ${sql.json(detalle as never)})
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
