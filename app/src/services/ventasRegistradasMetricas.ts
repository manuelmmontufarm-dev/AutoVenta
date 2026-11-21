/**
 * VENTAS DE MÉTRICAS PARA UN NEGOCIO SIN SISTEMA CONTABLE CONECTADO.
 *
 * Manuel, 21-nov-2026: Competimotor factura en Fénix y todavía no hay conector,
 * así que Métricas → Ventas salía vacía («Sin Contífico»). Pero desde el 21-nov
 * cada venta queda en `ventas_registradas` con su número de factura y su monto:
 * la registra el vendedor en `/venta` (validando el número del comprador contra
 * los chats) o el asesor al cerrar el ticket como ganado en el panel. Mientras
 * no haya conector, ESA es la venta comprobable: un número de factura escrito
 * por una persona, atado a un chat del bot.
 *
 * Reglas (las mismas que pide el panel para cerrar como ganado):
 *  - solo registros NO anulados, con factura Y monto, y atados a un chat
 *    (`conversation_id`): un número que nunca le escribió al bot no es venta
 *    del bot;
 *  - una venta = un chat. Si el ticket tiene varias facturas (dos compras, o la
 *    mano de obra al día siguiente) se SUMAN, igual que el cruce de Contífico
 *    suma todas las facturas del chat (`ventasConfirmadas.ts`). La misma
 *    factura escrita dos veces («001-001-860» y « 001-001-860 ») cuenta una vez;
 *  - el día y la hora son los del PRIMER registro con factura (hora de
 *    Guayaquil): eso es «cuándo se factura» sin la hora de emisión real;
 *  - sin IVA = monto / (1 + IVA del negocio): el registro solo trae el total.
 *
 * Lo que NO se puede sin el detalle de la factura —qué llantas, cuántas
 * facturas de llantas hizo la tienda en total— queda vacío y el panel dice
 * «Disponible cuando conectemos su sistema contable».
 *
 * Solo LEE `ventas_registradas`: quién escribe ahí es `registroDeVentas.ts`.
 */
import { sql } from "../db/client.js";
import { grupoDeAtencion, type GrupoAtencion } from "../domain/estadisticaVentas.js";

/** Un registro de `ventas_registradas` con lo que hace falta para contarlo. */
export interface RegistroParaMetricas {
  conversationId: number | null;
  factura: string | null;
  monto: number | null;
  anulada: boolean;
  vendedor: string;
  /** "YYYY-MM-DD" del registro, hora de Guayaquil. */
  dia: string;
  /** Hora del registro (0–23), hora de Guayaquil. */
  hora: number;
  /** Para ordenar dentro del mismo día. ISO. */
  creadoAt: string;
}

/** El chat de la venta: de él salen el rezago y quién atendió. */
export interface ChatDeLaVenta {
  id: number;
  nombre: string | null;
  /** "YYYY-MM-DD" de creación del chat, hora de Guayaquil. */
  primerDia: string;
  mensajesBot: number;
  mensajesAsesor: number;
}

/** Una venta en la forma que `armarComprobables` ya sabe contar. */
export interface VentaDelRegistro {
  ticketId: number;
  total: number;
  sinIva: number;
  dia: string;
  hora: number | null;
  grupo: GrupoAtencion;
  primerDia: string;
}

/** Lo que pinta el detalle plegado de «Ventas comprobadas» con esta fuente. Sin teléfono. */
export interface VentaRegistradaDetalle {
  ticketId: number;
  nombre: string | null;
  facturas: Array<{ numero: string; dia: string; monto: number; vendedor: string }>;
  total: number;
  dia: string;
  grupo: GrupoAtencion;
}

const plata = (x: number) => Math.round(x * 100) / 100;
const normalizarFactura = (f: string) => f.replace(/\s+/g, "").toLowerCase();

/** ¿Este registro cuenta como venta comprobada? */
export const registroCuenta = (r: RegistroParaMetricas): boolean =>
  !r.anulada && r.conversationId != null && Boolean(r.factura?.trim()) && r.monto != null && r.monto > 0;

/**
 * Puro: registros y chats entran; ventas (una por chat) y su detalle salen,
 * de la más nueva a la más vieja, como el cruce de Contífico.
 */
export function ventasDelRegistro(
  registros: readonly RegistroParaMetricas[],
  chats: readonly ChatDeLaVenta[],
  iva: number,
): { ventas: VentaDelRegistro[]; detalle: VentaRegistradaDetalle[] } {
  const chatPorId = new Map(chats.map((c) => [c.id, c]));
  const porChat = new Map<number, RegistroParaMetricas[]>();
  for (const r of registros) {
    if (!registroCuenta(r)) continue;
    const id = r.conversationId!;
    if (!chatPorId.has(id)) continue; // chat borrado: sin chat no hay venta del bot
    if (!porChat.has(id)) porChat.set(id, []);
    porChat.get(id)!.push(r);
  }

  const ventas: VentaDelRegistro[] = [];
  const detalle: VentaRegistradaDetalle[] = [];
  for (const [id, suyos] of porChat) {
    const chat = chatPorId.get(id)!;
    const ordenados = [...suyos].sort((a, b) => (a.creadoAt < b.creadoAt ? -1 : a.creadoAt > b.creadoAt ? 1 : 0));
    const vistas = new Set<string>();
    const facturas: VentaRegistradaDetalle["facturas"] = [];
    for (const r of ordenados) {
      const clave = normalizarFactura(r.factura!);
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      facturas.push({ numero: r.factura!.trim(), dia: r.dia, monto: r.monto!, vendedor: r.vendedor });
    }
    const primero = ordenados[0];
    const total = plata(facturas.reduce((a, f) => a + f.monto, 0));
    const grupo = grupoDeAtencion(chat.mensajesAsesor, chat.mensajesBot);
    ventas.push({
      ticketId: id,
      total,
      sinIva: plata(total / (1 + iva)),
      dia: primero.dia,
      hora: primero.hora,
      grupo,
      primerDia: chat.primerDia,
    });
    detalle.push({ ticketId: id, nombre: chat.nombre, facturas, total, dia: primero.dia, grupo });
  }
  ventas.sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0));
  detalle.sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0));
  return { ventas, detalle };
}

// ── Lectura de la base ───────────────────────────────────────────────────────

/** Los registros con factura y monto y los chats a los que apuntan. Tabla chica: se lee entera. */
export async function leerVentasRegistradas(iva: number) {
  const filas = await sql<{
    conversation_id: string | null; factura: string | null; monto: string | null; anulada: boolean;
    vendedor: string; dia: string; hora: number; creado_at: Date;
  }[]>`
    select conversation_id, factura, monto, (anulada_at is not null) as anulada, vendedor,
      to_char(created_at at time zone 'America/Guayaquil', 'YYYY-MM-DD') as dia,
      extract(hour from created_at at time zone 'America/Guayaquil')::int as hora,
      created_at as creado_at
    from ventas_registradas
    where anulada_at is null and conversation_id is not null and factura is not null and monto is not null
  `;
  const registros: RegistroParaMetricas[] = filas.map((f) => ({
    conversationId: f.conversation_id == null ? null : Number(f.conversation_id),
    factura: f.factura,
    monto: f.monto == null ? null : Number(f.monto),
    anulada: f.anulada,
    vendedor: f.vendedor,
    dia: f.dia,
    hora: Number(f.hora),
    creadoAt: new Date(f.creado_at).toISOString(),
  }));
  const ids = [...new Set(registros.filter(registroCuenta).map((r) => r.conversationId!))];
  const chats = ids.length
    ? (await sql<{ id: string; name: string | null; primer_dia: string; mensajes_bot: number; mensajes_asesor: number }[]>`
        select c.id, c.name,
          to_char(c.created_at at time zone 'America/Guayaquil', 'YYYY-MM-DD') as primer_dia,
          (select count(*)::int from messages m where m.conversation_id = c.id and m.role = 'assistant' and m.author_kind = 'bot') as mensajes_bot,
          (select count(*)::int from messages m where m.conversation_id = c.id and m.role = 'assistant' and m.author_kind is distinct from 'bot') as mensajes_asesor
        from conversations c
        where c.id = any(${ids}::bigint[])
      `).map((c) => ({
        id: Number(c.id), nombre: c.name, primerDia: c.primer_dia, mensajesBot: c.mensajes_bot, mensajesAsesor: c.mensajes_asesor,
      }))
    : [];
  return ventasDelRegistro(registros, chats, iva);
}
