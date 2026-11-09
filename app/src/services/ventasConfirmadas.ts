/**
 * Ventas confirmadas: chats del bot que terminaron en una factura.
 *
 * De dónde sale esto: el Kanban solo sabe lo que alguien marcó «ganado» a mano,
 * y la venta se cierra en el local sin volver al sistema. Los cruces que se
 * hicieron a mano (26-ago, 12-sep, 27-sep) usaban el teléfono como llave: el
 * número que escribe al WhatsApp es el mismo que el local anota en la factura.
 * Manuel pidió verlo en vivo en Métricas en vez de pedir otro cruce cada vez.
 *
 * El teléfono solo no alcanza. Las reglas de abajo salen de los casos que el
 * cruce a mano tuvo que descartar, uno por uno:
 *  - factura anterior al primer mensaje → ya era cliente (Andrés Tamayo, Pablo C.);
 *  - la factura no tiene llantas a precio de venta → repuestos (Lucho) o una
 *    garantía de $10 (Dani R.);
 *  - el chat no pasó del saludo: sin medida, sin cotización y el cliente
 *    escribió uno o dos mensajes → compró, pero el bot no le vendió nada
 *    («Desconocido», «S»). Con tres o más mensajes el bot sí trabajó el chat
 *    aunque no hubiera medida: a Juan Manuel Durán le coordinó la visita.
 * Y si el asesor escribió más que el bot, la venta cuenta pero se atribuye al
 * asesor (JP, 8-sep).
 *
 * Las facturas llegan por la fuente que haya (`services/fuentes/`): Contífico
 * como siempre, o las importadas por archivo en el panel (Mundillantas, R-26).
 * Lo que era de Contífico —el paginado, la serie 001/002 → local, la llave—
 * vive en `fuentes/contifico.ts`; acá queda el CRUCE, que es igual para todos.
 */
import { sql } from "../db/client.js";
import { resolverPeriodo } from "./periodoMensual.js";
import { grupoDeAtencion, type GrupoAtencion } from "../domain/estadisticaVentas.js";
import { fuenteDeFacturas } from "./fuentes/index.js";
import type { FacturaVenta, LecturaDeFacturas } from "./fuentes/tipos.js";
import { tel9 } from "./fuentes/contifico.js";
import { claveCelebracion, textoCelebracion, ventasParaCelebrar } from "../domain/celebrarVenta.js";
import { notifyAdvisor } from "./advisorNotifications.js";
import { hoyEnEcuador } from "./settings.js";

// Siguen exportados desde acá para quien ya los importaba (tests incluidos);
// viven en el adaptador de Contífico porque son suyos.
export { local, normalizarFactura, paginaEnteraAnterior, tel9 } from "./fuentes/contifico.js";

const CADA_MS = 10 * 60_000;
/** Por debajo de esto una «llanta» facturada es una garantía o un ajuste, no una venta. */
const PRECIO_MINIMO_LLANTA = 25;

/** La forma de siempre; hoy es la factura de cualquier fuente. */
export type FacturaContifico = FacturaVenta;

export interface ConversacionParaCruce {
  id: number;
  phone: string;
  name: string | null;
  /** "YYYY-MM-DD" en hora de Guayaquil del primer contacto. */
  primerDia: string;
  tieneMedida: boolean;
  cotizaciones: number;
  mensajesCliente: number;
  mensajesBot: number;
  mensajesAsesor: number;
}

/** Con menos que esto y sin medida ni cotización, el chat no pasó del saludo. */
const MENSAJES_MINIMOS_CLIENTE = 3;

export type MotivoDescarte = "antes_del_chat" | "sin_llantas" | "solo_saludo";

export interface VentaConfirmada {
  ticketId: number;
  nombre: string | null;
  telefono: string;
  cliente: string;
  facturas: Array<{ documento: string; dia: string; total: number; local: string }>;
  total: number;
  /** Suma de `subtotal` de las mismas facturas que `total`. */
  sinIva: number;
  /** Día de la primera factura con llantas: con esto se reparte por mes. */
  dia: string;
  /** Hora de emisión de esa primera factura con llantas (0–23), si la fuente la trae. */
  hora: number | null;
  llantas: string;
  atendio: "bot" | "asesor";
  /** Más fino que `atendio`: ver `grupoDeAtencion`. Es el que usa Métricas comprobables. */
  grupo: GrupoAtencion;
  mensajesAsesor: number;
  mensajesBot: number;
  /** Día del primer contacto del chat: con `dia`, el rezago chat → factura. */
  primerDia: string;
  cotizado: boolean;
}

export interface CoincidenciaDescartada {
  ticketId: number;
  nombre: string | null;
  telefono: string;
  cliente: string;
  total: number;
  dia: string;
  motivo: MotivoDescarte;
}

/**
 * El cruce en sí, sin base ni red: facturas y conversaciones entran, ventas y
 * descartes salen. Separado para poder probar cada regla con los casos reales.
 */
/** Una factura de llantas de verdad: al menos una llanta cobrada a precio de venta. */
export const tieneLlantaDeVenta = (f: Pick<FacturaContifico, "llantas">) => f.llantas.some((l) => l.precio >= PRECIO_MINIMO_LLANTA);

export function cruzar(facturas: FacturaContifico[], conversaciones: ConversacionParaCruce[]) {
  const porTelefono = new Map<string, FacturaContifico[]>();
  for (const f of facturas) for (const t of f.telefonos) {
    if (!porTelefono.has(t)) porTelefono.set(t, []);
    porTelefono.get(t)!.push(f);
  }

  const ventas: VentaConfirmada[] = [];
  const descartes: CoincidenciaDescartada[] = [];
  for (const c of conversaciones) {
    const t = tel9(c.phone);
    const suyas = (t && porTelefono.get(t)) || [];
    if (!suyas.length) continue;
    const despues = suyas.filter((f) => f.dia >= c.primerDia).sort((a, b) => (a.dia < b.dia ? -1 : 1));
    const base = { ticketId: c.id, nombre: c.name, telefono: c.phone };

    if (!despues.length) {
      const ultima = suyas.reduce((a, b) => (a.dia > b.dia ? a : b));
      descartes.push({ ...base, cliente: ultima.cliente, total: ultima.total, dia: ultima.dia, motivo: "antes_del_chat" });
      continue;
    }
    const conLlantas = despues.filter(tieneLlantaDeVenta);
    const suma = despues.reduce((a, f) => a + f.total, 0);
    if (!conLlantas.length) {
      descartes.push({ ...base, cliente: despues[0].cliente, total: suma, dia: despues[0].dia, motivo: "sin_llantas" });
      continue;
    }
    if (!c.tieneMedida && c.cotizaciones === 0 && c.mensajesCliente < MENSAJES_MINIMOS_CLIENTE) {
      descartes.push({ ...base, cliente: conLlantas[0].cliente, total: suma, dia: conLlantas[0].dia, motivo: "solo_saludo" });
      continue;
    }
    // Todas las facturas desde el chat: la mano de obra del día siguiente es
    // parte de la misma venta (Patricio Soria, 26 y 27-ago).
    ventas.push({
      ...base,
      cliente: conLlantas[0].cliente,
      // El local viene del adaptador de la fuente (serie 001/002 en Contífico,
      // columna del Excel en archivo); sin dato, el guion de siempre.
      facturas: despues.map((f) => ({ documento: f.documento, dia: f.dia, total: f.total, local: f.local ?? "—" })),
      total: Math.round(suma * 100) / 100,
      sinIva: Math.round(despues.reduce((a, f) => a + (f.subtotal ?? f.total), 0) * 100) / 100,
      dia: conLlantas[0].dia,
      hora: conLlantas[0].hora ?? null,
      llantas: conLlantas.flatMap((f) => f.llantas).map((l) => `${l.cantidad} × ${l.nombre}`).join(" · "),
      atendio: c.mensajesAsesor > c.mensajesBot ? "asesor" : "bot",
      grupo: grupoDeAtencion(c.mensajesAsesor, c.mensajesBot),
      mensajesAsesor: c.mensajesAsesor,
      mensajesBot: c.mensajesBot,
      primerDia: c.primerDia,
      cotizado: c.cotizaciones > 0,
    });
  }
  ventas.sort((a, b) => (a.dia < b.dia ? 1 : -1));
  descartes.sort((a, b) => (a.dia < b.dia ? 1 : -1));
  return { ventas, descartes };
}

// ── Sincronización con la fuente de facturas ─────────────────────────────────

/** Qué se leyó en la última bajada: si el número de ventas se ve raro, esto dice por qué. */
export type LecturaContifico = LecturaDeFacturas;

const estado: {
  facturas: FacturaContifico[];
  lectura: LecturaContifico | null;
  ultimaSync: Date | null;
  error: string | null;
  enCurso: Promise<void> | null;
} = { facturas: [], lectura: null, ultimaSync: null, error: null, enCurso: null };

export async function sincronizarFacturas(): Promise<void> {
  const fuente = await fuenteDeFacturas();
  if (!fuente) return;
  if (estado.enCurso) return estado.enCurso;
  estado.enCurso = (async () => {
    try {
      const [{ desde }] = await sql<{ desde: string | null }[]>`
        select to_char(min(created_at) at time zone 'America/Guayaquil', 'YYYY-MM-DD') as desde from conversations`;
      if (!desde) {
        estado.facturas = [];
        estado.ultimaSync = new Date();
        estado.error = null;
        return;
      }
      const { facturas, lectura } = await fuente.sincronizar(desde);
      estado.lectura = lectura;
      estado.facturas = facturas;
      estado.ultimaSync = new Date();
      estado.error = null;
      await celebrarVentasNuevas();
    } catch (error) {
      estado.error = error instanceof Error ? error.message : String(error);
      console.error("⚠️  Ventas confirmadas: no se pudo leer la fuente de facturas —", estado.error);
    } finally {
      estado.enCurso = null;
    }
  })();
  return estado.enCurso;
}

/**
 * Festeja con los asesores cada venta del bot que la última bajada confirmó.
 * Una vez por venta: la clave de dedupe vive en `advisor_notifications`, así
 * que ni la bajada de cada 10 minutos ni un reinicio la repiten. NUNCA lanza:
 * un WhatsApp caído no puede dejar a Métricas sin facturas.
 */
async function celebrarVentasNuevas(): Promise<void> {
  try {
    const { ventas } = await cruceVigente();
    const nuevas = ventasParaCelebrar(ventas, hoyEnEcuador());
    if (!nuevas.length) return;
    const ciclos = await sql<{ id: string; current_cycle: number }[]>`
      select id, current_cycle from conversations where id = any(${nuevas.map((v) => v.ticketId)}::bigint[])
    `;
    const cicloDe = new Map(ciclos.map((c) => [Number(c.id), c.current_cycle]));
    for (const venta of nuevas) {
      const ciclo = cicloDe.get(venta.ticketId);
      if (ciclo == null) continue;
      const r = await notifyAdvisor({
        conversationId: venta.ticketId,
        cycle: ciclo,
        eventType: "venta_confirmada",
        dedupeKey: claveCelebracion(venta),
        ...textoCelebracion(venta),
      });
      if (r.sent) console.log(`🎉 Venta del bot festejada: ticket ${venta.ticketId} · $${venta.total}`);
    }
  } catch (error) {
    console.error("⚠️  No se pudo festejar la venta con los asesores:", error instanceof Error ? error.message : error);
  }
}

/** Las facturas de la última bajada (desde el primer chat del bot), para Métricas comprobables. */
export const facturasLeidas = (): readonly FacturaContifico[] => estado.facturas;
export const ultimaSyncFacturas = (): Date | null => estado.ultimaSync;

let timer: NodeJS.Timeout | null = null;
export function startVentasConfirmadasSync() {
  if (timer) return;
  // La fuente se decide en CADA corrida: subir facturas por archivo en el panel
  // enciende las ventas confirmadas sin reinicio; sin ninguna fuente, cada
  // corrida es un no-op barato.
  void sincronizarFacturas();
  timer = setInterval(() => void sincronizarFacturas(), CADA_MS);
  timer.unref?.();
}

async function conversacionesDe(telefonos: string[]): Promise<ConversacionParaCruce[]> {
  if (!telefonos.length) return [];
  const filas = await sql<{
    id: string; phone: string; name: string | null; primer_dia: string; tiene_medida: boolean;
    cotizaciones: number; mensajes_cliente: number; mensajes_bot: number; mensajes_asesor: number;
  }[]>`
    select c.id, c.phone, c.name,
      to_char(c.created_at at time zone 'America/Guayaquil', 'YYYY-MM-DD') as primer_dia,
      (c.tire_size is not null and c.tire_size <> '') as tiene_medida,
      (select count(*)::int from quotes q where q.conversation_id = c.id) as cotizaciones,
      (select count(*)::int from messages m where m.conversation_id = c.id and m.role = 'user') as mensajes_cliente,
      (select count(*)::int from messages m where m.conversation_id = c.id and m.role = 'assistant' and m.author_kind = 'bot') as mensajes_bot,
      (select count(*)::int from messages m where m.conversation_id = c.id and m.role = 'assistant' and m.author_kind is distinct from 'bot') as mensajes_asesor
    from conversations c
    where right(regexp_replace(c.phone, '\\D', '', 'g'), 9) = any(${telefonos}::text[])
  `;
  return filas.map((f) => ({
    id: Number(f.id), phone: f.phone, name: f.name, primerDia: f.primer_dia, tieneMedida: f.tiene_medida,
    cotizaciones: f.cotizaciones, mensajesCliente: f.mensajes_cliente, mensajesBot: f.mensajes_bot, mensajesAsesor: f.mensajes_asesor,
  }));
}

/**
 * El cruce no depende del mes: se hace una vez y cada mes del selector recorta
 * de ahí. Se rehace con facturas nuevas o al minuto (un chat puede haber sumado
 * mensajes del asesor y cambiar a quién se atribuye).
 */
let cruceGuardado: { at: number; sync: Date | null; resultado: ReturnType<typeof cruzar> } | null = null;
export async function cruceVigente() {
  if (cruceGuardado && cruceGuardado.sync === estado.ultimaSync && Date.now() - cruceGuardado.at < 60_000) return cruceGuardado.resultado;
  const telefonos = [...new Set(estado.facturas.flatMap((f) => f.telefonos))];
  const resultado = cruzar(estado.facturas, await conversacionesDe(telefonos));
  cruceGuardado = { at: Date.now(), sync: estado.ultimaSync, resultado };
  return resultado;
}

/** Lo que pinta la tarjeta de Métricas, recortado al mes que se está mirando. */
export async function resumenVentasConfirmadas(mes?: string | null) {
  // No espera a la fuente: la pantalla ya tardaba (Manuel, 25-sep). Si la
  // primera bajada no terminó, la tarjeta dice «sincronizando» y se llena sola
  // en la próxima recarga. Disponible con CUALQUIER fuente (R-26), no solo
  // con Contífico.
  const disponible = Boolean(await fuenteDeFacturas());

  const periodo = await resolverPeriodo(mes);
  const desdeDia = periodo.todos ? "0000-00-00" : periodo.clave + "-01";
  const hastaDia = periodo.todos ? "9999-99-99" : periodo.clave + "-99";
  const { ventas, descartes } = await cruceVigente();
  const delMes = <T extends { dia: string }>(xs: T[]) => xs.filter((x) => x.dia >= desdeDia && x.dia <= hastaDia);
  const v = delMes(ventas);
  const suma = (xs: VentaConfirmada[]) => Math.round(xs.reduce((a, x) => a + x.total, 0) * 100) / 100;
  const delBot = v.filter((x) => x.atendio === "bot");

  return {
    disponible,
    ultimaSync: estado.ultimaSync?.toISOString() ?? null,
    sincronizando: Boolean(estado.enCurso) && !estado.ultimaSync,
    error: estado.error,
    ultimaFactura: estado.lectura?.ultimoDia ?? null,
    lectura: estado.lectura,
    ventas: v.length,
    monto: suma(v),
    delBot: { ventas: delBot.length, monto: suma(delBot) },
    delAsesor: { ventas: v.length - delBot.length, monto: Math.round((suma(v) - suma(delBot)) * 100) / 100 },
    detalle: v,
    descartes: delMes(descartes),
  };
}
