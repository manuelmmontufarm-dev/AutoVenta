/**
 * EL VENDEDOR REGISTRA UNA VENTA Y SE VALIDA CONTRA LOS CHATS (20-nov-2026).
 *
 * Puente hasta que leamos las facturas: el vendedor escribe su nombre y el
 * número del comprador en `/venta`; acá se busca ese número en `conversations`
 * (misma llave `tel9` del cruce de facturas) y se guarda el resultado.
 *
 * «Vino de WhatsApp» = hay una conversación con ese número Y el cliente escribió
 * al menos una vez. Un chat que solo tiene mensajes nuestros (una plantilla que
 * nadie contestó) no cuenta: el cliente no vino por ahí.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "../db/client.js";
import { isStage, type Stage } from "../domain/pipeline.js";
import { tel9 } from "./fuentes/contifico.js";
import { setStage } from "./conversations.js";
import { emitLiveEvent } from "./liveEvents.js";
import { getVentaRegistradaConfig } from "./settings.js";

// ── La clave del enlace ──────────────────────────────────────────────────────

const ADMIN_KEY = process.env.ADMIN_KEY ?? "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * La página es pública pero no adivinable: el enlace lleva una clave corta
 * derivada de ADMIN_KEY (sin variable nueva ni tabla). Quien no tiene el enlace
 * no puede preguntar «¿este número le escribió al negocio?». Cambiar ADMIN_KEY
 * cambia el enlace. Sin ADMIN_KEY en producción la página queda apagada, igual
 * que las sesiones del panel.
 */
export const REGISTRO_HABILITADO = Boolean(ADMIN_KEY) || !IS_PRODUCTION;

function derivar(proposito: string): string {
  return createHmac("sha256", ADMIN_KEY || "autoventa-registro-dev").update(proposito).digest("hex").slice(0, 12);
}

/** La clave del enlace que se les pasa a los vendedores. */
export const claveDelEnlace = (): string => derivar("registro-de-ventas:vendedores");

/**
 * La clave del enlace del DUEÑO, para ver todos los registros. Es otra distinta
 * a propósito: el enlace de los vendedores no sirve para ver la lista.
 */
export const claveDeRegistros = (): string => derivar("registro-de-ventas:dueno");

function coincide(clave: unknown, esperada: string): boolean {
  if (!REGISTRO_HABILITADO || typeof clave !== "string") return false;
  const a = Buffer.from(clave);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const claveValida = (clave: unknown): boolean => coincide(clave, claveDelEnlace());
export const claveDeRegistrosValida = (clave: unknown): boolean => coincide(clave, claveDeRegistros());

// ── Lo que escribe el vendedor ───────────────────────────────────────────────

export interface EntradaDeVenta {
  vendedor: string;
  telefono: string;
}

export type Validacion =
  | { ok: true; entrada: EntradaDeVenta; tel9: string }
  | { ok: false; campo: "vendedor" | "telefono"; error: string };

const limpiar = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Pura: revisa y normaliza lo que llega del formulario. */
export function validarEntrada(cuerpo: { vendedor?: unknown; telefono?: unknown }): Validacion {
  const vendedor = limpiar(cuerpo.vendedor, 60);
  if (vendedor.length < 2) return { ok: false, campo: "vendedor", error: "Escribe tu nombre." };

  const digitos = String(cuerpo.telefono ?? "").replace(/\D/g, "");
  // Ecuador: 09XXXXXXXX (10) o 5939XXXXXXXX (12). Se acepta de 9 a 13 para no
  // rechazar un número extranjero, pero menos de 9 no puede cruzarse con nada.
  if (digitos.length < 9 || digitos.length > 13) {
    return { ok: false, campo: "telefono", error: "El número debe tener 10 dígitos, por ejemplo 0991234567." };
  }
  const llave = tel9(digitos);
  if (!llave) return { ok: false, campo: "telefono", error: "Revisa el número del cliente." };

  return { ok: true, entrada: { vendedor, telefono: digitos }, tel9: llave };
}

// ── El cruce con los chats ───────────────────────────────────────────────────

export interface ChatEncontrado {
  conversationId: number;
  cliente: string | null;
  ultimoMensajeAt: Date | null;
  cotizaciones: number;
}

/** El chat de ese número, solo si el cliente escribió alguna vez. */
export async function buscarChat(llave: string): Promise<ChatEncontrado | null> {
  const filas = await sql<{ id: number; name: string | null; ultimo: Date | null; cotizaciones: number }[]>`
    select c.id, c.name,
           (select max(m.created_at) from messages m where m.conversation_id = c.id and m.role = 'user') as ultimo,
           (select count(*)::int from quotes q where q.conversation_id = c.id) as cotizaciones
    from conversations c
    where right(regexp_replace(c.phone, '\\D', '', 'g'), 9) = ${llave}
    order by c.updated_at desc
  `;
  const conChat = filas.find((f) => f.ultimo);
  if (!conChat) return null;
  return {
    conversationId: Number(conChat.id),
    cliente: conChat.name?.trim() || null,
    ultimoMensajeAt: conChat.ultimo,
    cotizaciones: conChat.cotizaciones,
  };
}

/**
 * Qué le hizo el registro al ticket del chat:
 *  - `marcado_ganado`: el ticket estaba abierto (o perdido) y lo pasamos a «ganado»;
 *  - `ya_ganado`: ya estaba ganado (a mano o por otro registro) y no se tocó;
 *  - `sin_chat`: el número no cruzó con ningún chat donde el cliente escribiera;
 *  - null: registro anterior al 21-nov, que no tocaba el ticket.
 */
export type EfectoEnTicket = "marcado_ganado" | "ya_ganado" | "sin_chat";

export interface VentaRegistrada {
  id: number;
  vendedor: string;
  telefono: string;
  factura: string | null;
  vinoDeWhatsapp: boolean;
  cliente: string | null;
  ultimoMensajeAt: Date | null;
  cotizaciones: number;
  dia: string;
  createdAt: Date;
  conversationId: number | null;
  efectoEnTicket: EfectoEnTicket | null;
  anuladaAt: Date | null;
}

interface Fila {
  id: number; vendedor: string; telefono: string; factura: string | null;
  vino_de_whatsapp: boolean; cliente: string | null; ultimo_mensaje_at: Date | null;
  cotizaciones: number; dia: string; created_at: Date;
  conversation_id: number | null; efecto_en_ticket: EfectoEnTicket | null; anulada_at: Date | null;
}

const COLUMNAS = sql`id, vendedor, telefono, factura, vino_de_whatsapp, cliente, ultimo_mensaje_at, cotizaciones, dia::text as dia, created_at,
  conversation_id, efecto_en_ticket, anulada_at`;

const aVenta = (f: Fila): VentaRegistrada => ({
  id: Number(f.id), vendedor: f.vendedor, telefono: f.telefono, factura: f.factura,
  vinoDeWhatsapp: f.vino_de_whatsapp, cliente: f.cliente, ultimoMensajeAt: f.ultimo_mensaje_at,
  cotizaciones: f.cotizaciones, dia: f.dia, createdAt: f.created_at,
  conversationId: f.conversation_id == null ? null : Number(f.conversation_id),
  efectoEnTicket: f.efecto_en_ticket, anuladaAt: f.anulada_at,
});

export interface ResultadoDelRegistro {
  venta: VentaRegistrada;
  /** Si ese número ya se había registrado hoy: quién fue el primero. Es un aviso; igual se guarda. */
  yaRegistradaPor: string | null;
}

/**
 * PASO 1: busca el chat y guarda. SIEMPRE guarda una fila nueva — repetido,
 * mal tipeado o sin chat, todo queda. Si el número ya estaba hoy (día de
 * Ecuador) se avisa quién lo registró primero, por el obsequio.
 *
 * Y si el número cruza con un chat, ese ticket pasa a «ganado» (21-nov-2026):
 * ver `marcarTicketPorLaVenta`.
 */
export async function registrarVenta(entrada: EntradaDeVenta, llave: string): Promise<ResultadoDelRegistro> {
  const chat = await buscarChat(llave);
  const { venta, yaRegistradaPor } = await sql.begin(async (tx) => {
    const [previa] = await tx<{ vendedor: string }[]>`
      select vendedor from ventas_registradas
      where tel9 = ${llave} and dia = (now() at time zone 'America/Guayaquil')::date
        and anulada_at is null
      order by created_at asc limit 1
    `;
    const [nueva] = await tx<Fila[]>`
      insert into ventas_registradas
        (vendedor, telefono, tel9, vino_de_whatsapp, conversation_id, cliente, ultimo_mensaje_at, cotizaciones, dia)
      values
        (${entrada.vendedor}, ${entrada.telefono}, ${llave}, ${Boolean(chat)},
         ${chat?.conversationId ?? null}, ${chat?.cliente ?? null}, ${chat?.ultimoMensajeAt ?? null},
         ${chat?.cotizaciones ?? 0}, (now() at time zone 'America/Guayaquil')::date)
      returning ${COLUMNAS}
    `;
    return { venta: aVenta(nueva), yaRegistradaPor: previa?.vendedor ?? null };
  });
  const efecto = await marcarTicketPorLaVenta(venta.id, chat?.conversationId ?? null, venta.vendedor);
  return { venta: { ...venta, efectoEnTicket: efecto }, yaRegistradaPor };
}

/** El motivo con el que queda el cierre: lo ve el panel y lo lee la anulación. */
export const motivoDeVentaRegistrada = (vendedor: string) => `Venta registrada por ${vendedor}`;

/**
 * EL REGISTRO MARCA EL TICKET (21-nov-2026).
 *
 * Un solo chat: el mismo que `buscarChat` eligió y que el vendedor acaba de ver
 * en pantalla («Sí vino de WhatsApp», con ese nombre) — el más reciente donde el
 * cliente escribió. Si el número cruza con más de un chat (el mismo cliente
 * guardado como 09… y como 593…), los otros no se tocan: marcarlos todos
 * inflaría los ganados con una sola venta. Si no cruza con ninguno, solo queda
 * el registro (`sin_chat`): no hay ticket que marcar.
 *
 * El ticket es el CICLO vigente del chat. Ya ganado → no se toca (`ya_ganado`).
 * Abierto o perdido → «ganado» con el `setStage` de siempre (transición, embudo,
 * `sales_history`, seguimientos cancelados), con el motivo «Venta registrada por
 * <vendedor>». Un perdido también: la venta registrada es el hecho; el
 * «perdido» era una suposición. Se guarda dónde estaba, por si el vendedor
 * corrige el número (`anularRegistro`).
 */
async function marcarTicketPorLaVenta(
  ventaId: number,
  conversationId: number | null,
  vendedor: string,
): Promise<EfectoEnTicket> {
  if (conversationId == null) {
    await sql`update ventas_registradas set efecto_en_ticket = 'sin_chat' where id = ${ventaId}`;
    return "sin_chat";
  }
  const [chat] = await sql<{ stage: Stage; current_cycle: number; closed_reason: string | null }[]>`
    select stage, current_cycle, closed_reason from conversations where id = ${conversationId}
  `;
  if (!chat) {
    await sql`update ventas_registradas set efecto_en_ticket = 'sin_chat' where id = ${ventaId}`;
    return "sin_chat";
  }
  if (chat.stage === "ganado") {
    await sql`
      update ventas_registradas set cycle = ${chat.current_cycle}, efecto_en_ticket = 'ya_ganado'
      where id = ${ventaId}
    `;
    emitLiveEvent("sync", conversationId);
    return "ya_ganado";
  }
  await setStage(conversationId, "ganado", { actor: "owner", reason: motivoDeVentaRegistrada(vendedor) });
  await sql`
    update ventas_registradas
    set cycle = ${chat.current_cycle}, efecto_en_ticket = 'marcado_ganado',
        etapa_anterior = ${chat.stage}, motivo_anterior = ${chat.closed_reason}
    where id = ${ventaId}
  `;
  emitLiveEvent("sync", conversationId);
  return "marcado_ganado";
}

export interface ResultadoDeLaAnulacion {
  venta: VentaRegistrada;
  /** true si el ticket volvió a la etapa en que estaba antes del registro. */
  ticketDevuelto: boolean;
}

/**
 * «CORREGIR EL NÚMERO»: el vendedor se equivocó de número y el registro marcó
 * como ganado el chat de otra persona. La fila queda (todo registro queda),
 * pero anulada, y el ticket vuelve a donde estaba — solo si nadie lo movió
 * después: sigue en el mismo ciclo, sigue ganado, su último movimiento es este
 * registro y no hay otro registro vivo para ese ticket. Si cualquiera de esas
 * cosas no se cumple, el ticket no se toca: deshacer lo de otro es peor.
 *
 * Igual que la factura: pide el número además del id, y solo dentro de 24 h.
 */
export async function anularRegistro(id: number, llave: string): Promise<ResultadoDeLaAnulacion | null> {
  const [fila] = await sql<(Fila & { cycle: number | null; etapa_anterior: string | null; motivo_anterior: string | null })[]>`
    update ventas_registradas set anulada_at = now()
    where id = ${id} and tel9 = ${llave} and anulada_at is null and created_at > now() - interval '24 hours'
    returning ${COLUMNAS}, cycle, etapa_anterior, motivo_anterior
  `;
  if (!fila) return null;
  const venta = aVenta(fila);
  if (fila.efecto_en_ticket !== "marcado_ganado" || fila.conversation_id == null || fila.cycle == null) {
    return { venta, ticketDevuelto: false };
  }
  const conversationId = Number(fila.conversation_id);
  const [estado] = await sql<{ vigente: boolean; ultimo_a: string | null; ultimo_motivo: string | null; otros: number }[]>`
    select
      (c.current_cycle = ${fila.cycle} and c.stage = 'ganado') as vigente,
      t.to_stage as ultimo_a, t.reason as ultimo_motivo,
      (select count(*)::int from ventas_registradas o
        where o.conversation_id = c.id and o.cycle = ${fila.cycle}
          and o.anulada_at is null and o.id <> ${id}) as otros
    from conversations c
    left join lateral (
      select to_stage, reason from stage_transitions
      where conversation_id = c.id and cycle = ${fila.cycle}
      order by created_at desc, id desc limit 1
    ) t on true
    where c.id = ${conversationId}
  `;
  const esNuestro = estado?.vigente
    && estado.ultimo_a === "ganado"
    && estado.ultimo_motivo === motivoDeVentaRegistrada(fila.vendedor)
    && estado.otros === 0;
  if (!esNuestro) return { venta, ticketDevuelto: false };

  const anterior: Stage = fila.etapa_anterior && isStage(fila.etapa_anterior) && fila.etapa_anterior !== "ganado"
    ? fila.etapa_anterior
    : "seguimiento_venta";
  await setStage(conversationId, anterior, {
    actor: "system",
    reason: anterior === "perdido"
      ? fila.motivo_anterior ?? "perdido"
      : "Registro de venta anulado: el vendedor corrigió el número",
  });
  // Un perdido vuelve a escribir su fila de `sales_history` (setStage la
  // reescribe). Uno abierto no tiene fila: la de «ganado» que dejó el registro
  // contaría una venta que no fue.
  if (anterior !== "perdido") {
    await sql`
      delete from sales_history
      where conversation_id = ${conversationId} and cycle = ${fila.cycle} and outcome = 'ganado'
    `;
  }
  emitLiveEvent("sync", conversationId);
  return { venta, ticketDevuelto: true };
}

// ── Lo que ve el panel ───────────────────────────────────────────────────────

export interface VentaDelTicket {
  id: number;
  vendedor: string;
  registradaEn: Date;
  factura: string | null;
}

/**
 * La venta registrada del ticket (ciclo vigente del chat), o null. Si hay más
 * de un registro vivo, el que tiene factura; entre iguales, el primero.
 */
export async function ventaDelTicket(conversationId: number): Promise<VentaDelTicket | null> {
  const [fila] = await sql<{ id: number; vendedor: string; created_at: Date; factura: string | null }[]>`
    select v.id, v.vendedor, v.created_at, v.factura
    from ventas_registradas v
    join conversations c on c.id = v.conversation_id and v.cycle = c.current_cycle
    where v.conversation_id = ${conversationId} and v.anulada_at is null
    order by (v.factura is not null) desc, v.created_at asc
    limit 1
  `;
  return fila ? { id: Number(fila.id), vendedor: fila.vendedor, registradaEn: fila.created_at, factura: fila.factura } : null;
}

/**
 * ¿Se puede cerrar este ticket como «ganado» desde el panel? Con el interruptor
 * apagado (hoy), siempre. Encendido, solo si la venta está registrada.
 */
export async function ganadoPermitido(conversationId: number): Promise<boolean> {
  const { exigirParaGanado } = await getVentaRegistradaConfig();
  if (!exigirParaGanado) return true;
  return Boolean(await ventaDelTicket(conversationId));
}

export const ERROR_GANADO_SIN_REGISTRO =
  "Para cerrar como ganado, primero registra la venta (botón «Registrar venta» en la ficha).";

/**
 * PASO 2: la factura o referencia, sobre el registro recién hecho. Pide el
 * número además del id para que nadie escriba sobre un registro ajeno
 * adivinando ids, y solo dentro del mismo día.
 */
export async function guardarFactura(id: number, llave: string, factura: unknown): Promise<VentaRegistrada | null> {
  const texto = limpiar(factura, 40);
  if (!texto) return null;
  const [fila] = await sql<Fila[]>`
    update ventas_registradas set factura = ${texto}
    where id = ${id} and tel9 = ${llave} and anulada_at is null and created_at > now() - interval '24 hours'
    returning ${COLUMNAS}
  `;
  if (fila?.conversation_id != null) emitLiveEvent("sync", Number(fila.conversation_id));
  return fila ? aVenta(fila) : null;
}

export async function listarVentasRegistradas(limite = 2000): Promise<VentaRegistrada[]> {
  const filas = await sql<Fila[]>`
    select ${COLUMNAS} from ventas_registradas order by created_at desc limit ${limite}
  `;
  return filas.map(aVenta);
}

/** CSV para abrir en Excel (con BOM y `;`, como lo espera un Excel en español). */
export function ventasACsv(ventas: VentaRegistrada[]): string {
  const celda = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const filas = ventas.map((v) => [
    v.dia, v.vendedor, v.telefono, v.vinoDeWhatsapp ? "SI" : "NO", v.cliente ?? "",
    v.ultimoMensajeAt ? v.ultimoMensajeAt.toISOString().slice(0, 10) : "", v.cotizaciones, v.factura ?? "",
    efectoEnPalabras(v),
  ].map(celda).join(";"));
  return "﻿" + ["Dia;Vendedor;Telefono;Vino de WhatsApp;Cliente en el chat;Ultimo mensaje;Cotizaciones;Factura o referencia;Ticket", ...filas].join("\r\n");
}

/** Lo que el registro le hizo al ticket, en palabras (lista del dueño y CSV). */
export function efectoEnPalabras(v: Pick<VentaRegistrada, "efectoEnTicket" | "anuladaAt">): string {
  if (v.anuladaAt) return "Anulado (número corregido)";
  switch (v.efectoEnTicket) {
    case "marcado_ganado": return "Marcado ganado";
    case "ya_ganado": return "Ya estaba ganado";
    case "sin_chat": return "Sin chat";
    default: return "";
  }
}
