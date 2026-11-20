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
import { tel9 } from "./fuentes/contifico.js";

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

export function claveValida(clave: unknown): boolean {
  if (!REGISTRO_HABILITADO || typeof clave !== "string") return false;
  const a = Buffer.from(clave);
  const b = Buffer.from(claveDelEnlace());
  return a.length === b.length && timingSafeEqual(a, b);
}

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
}

interface Fila {
  id: number; vendedor: string; telefono: string; factura: string | null;
  vino_de_whatsapp: boolean; cliente: string | null; ultimo_mensaje_at: Date | null;
  cotizaciones: number; dia: string; created_at: Date;
}

const COLUMNAS = sql`id, vendedor, telefono, factura, vino_de_whatsapp, cliente, ultimo_mensaje_at, cotizaciones, dia::text as dia, created_at`;

const aVenta = (f: Fila): VentaRegistrada => ({
  id: Number(f.id), vendedor: f.vendedor, telefono: f.telefono, factura: f.factura,
  vinoDeWhatsapp: f.vino_de_whatsapp, cliente: f.cliente, ultimoMensajeAt: f.ultimo_mensaje_at,
  cotizaciones: f.cotizaciones, dia: f.dia, createdAt: f.created_at,
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
 */
export async function registrarVenta(entrada: EntradaDeVenta, llave: string): Promise<ResultadoDelRegistro> {
  const chat = await buscarChat(llave);
  return sql.begin(async (tx) => {
    const [previa] = await tx<{ vendedor: string }[]>`
      select vendedor from ventas_registradas
      where tel9 = ${llave} and dia = (now() at time zone 'America/Guayaquil')::date
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
}

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
    where id = ${id} and tel9 = ${llave} and created_at > now() - interval '24 hours'
    returning ${COLUMNAS}
  `;
  return fila ? aVenta(fila) : null;
}

export async function listarVentasRegistradas(limite = 500): Promise<VentaRegistrada[]> {
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
  ].map(celda).join(";"));
  return "﻿" + ["Dia;Vendedor;Telefono;Vino de WhatsApp;Cliente en el chat;Ultimo mensaje;Cotizaciones;Factura o referencia", ...filas].join("\r\n");
}
