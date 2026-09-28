/**
 * Ventas confirmadas: chats del bot que terminaron en una factura de Contífico.
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
 * Contífico devuelve los documentos más o menos del más nuevo al más viejo —
 * no estrictamente: la página 2 trae facturas del 29-jul junto a las de
 * septiembre— y la API ignora los filtros de fecha. Se piden páginas desde la 1
 * hasta una que sea ENTERA anterior al primer chat del bot: unas cinco, no las
 * ~60 del histórico. Cortar en la primera fecha vieja perdía medio agosto.
 */
import { sql } from "../db/client.js";
import { config } from "../config.js";
import { resolverPeriodo } from "./periodoMensual.js";

const CADA_MS = 10 * 60_000;
const MAX_PAGINAS = 25;
/** Por debajo de esto una «llanta» facturada es una garantía o un ajuste, no una venta. */
const PRECIO_MINIMO_LLANTA = 25;
/** 205/55R16, LT265/70R17, 255/50ZR19, 31X10.50R15. */
const LLANTA = /\d{2,3}\s*\/\s*\d{2}\s*Z?R\s*\d{2}|\d{2}\s*X\s*\d{1,2}[.,]\d{2}\s*R\s*\d{2}/i;

export interface FacturaContifico {
  documento: string;
  /** "YYYY-MM-DD", día de emisión. */
  dia: string;
  total: number;
  cliente: string;
  telefonos: string[];
  llantas: Array<{ nombre: string; cantidad: number; precio: number }>;
}

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
  /** Día de la primera factura con llantas: con esto se reparte por mes. */
  dia: string;
  llantas: string;
  atendio: "bot" | "asesor";
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

export const tel9 = (s: unknown): string | null => {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
};

export const local = (documento: string) =>
  documento.startsWith("002-") ? "Cumbayá" : documento.startsWith("001-") ? "Quito Sur" : "—";

function diaDeContifico(s: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

interface DocumentoWire {
  tipo_documento?: string;
  anulado?: boolean;
  documento?: string;
  fecha_emision?: string;
  total?: string | number;
  cliente?: { razon_social?: string | null; telefonos?: string | null } | null;
  detalles?: Array<{
    producto_nombre?: string | null;
    cantidad?: string | number;
    precio?: string | number;
    porcentaje_descuento?: string | number;
  }> | null;
}

export function normalizarFactura(doc: DocumentoWire): FacturaContifico | null {
  if (doc.tipo_documento !== "FAC" || doc.anulado) return null;
  const dia = diaDeContifico(doc.fecha_emision);
  if (!dia || !doc.documento) return null;
  const telefonos = [...new Set(String(doc.cliente?.telefonos ?? "").split(/[^\d]+/).map(tel9).filter((t): t is string => Boolean(t)))];
  return {
    documento: doc.documento,
    dia,
    total: Number(doc.total) || 0,
    cliente: (doc.cliente?.razon_social ?? "").trim(),
    telefonos,
    llantas: (doc.detalles ?? [])
      .filter((l) => LLANTA.test(l.producto_nombre ?? ""))
      // El precio que se cobró, no el de lista: una garantía viene con la
      // llanta a $261 y 100 % de descuento (Dani R., 7-sep).
      .map((l) => ({
        nombre: (l.producto_nombre ?? "").trim(),
        cantidad: Number(l.cantidad) || 0,
        precio: (Number(l.precio) || 0) * (1 - (Number(l.porcentaje_descuento) || 0) / 100),
      })),
  };
}

/**
 * El cruce en sí, sin base ni red: facturas y conversaciones entran, ventas y
 * descartes salen. Separado para poder probar cada regla con los casos reales.
 */
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
    const conLlantas = despues.filter((f) => f.llantas.some((l) => l.precio >= PRECIO_MINIMO_LLANTA));
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
      facturas: despues.map((f) => ({ documento: f.documento, dia: f.dia, total: f.total, local: local(f.documento) })),
      total: Math.round(suma * 100) / 100,
      dia: conLlantas[0].dia,
      llantas: conLlantas.flatMap((f) => f.llantas).map((l) => `${l.cantidad} × ${l.nombre}`).join(" · "),
      atendio: c.mensajesAsesor > c.mensajesBot ? "asesor" : "bot",
      cotizado: c.cotizaciones > 0,
    });
  }
  ventas.sort((a, b) => (a.dia < b.dia ? 1 : -1));
  descartes.sort((a, b) => (a.dia < b.dia ? 1 : -1));
  return { ventas, descartes };
}

// ── Sincronización con Contífico ────────────────────────────────────────────

/** Qué se leyó en la última bajada: si el número de ventas se ve raro, esto dice por qué. */
export interface LecturaContifico {
  paginas: number;
  documentos: number;
  facturas: number;
  conTelefono: number;
  primerDia: string | null;
  ultimoDia: string | null;
  llave: "facturas" | "catalogo";
}

const estado: {
  facturas: FacturaContifico[];
  lectura: LecturaContifico | null;
  ultimaSync: Date | null;
  error: string | null;
  enCurso: Promise<void> | null;
} = { facturas: [], lectura: null, ultimaSync: null, error: null, enCurso: null };

/** ¿Ya no hace falta seguir? Solo cuando la página ENTERA es anterior al primer chat. */
export function paginaEnteraAnterior(dias: Array<string | null>, desde: string): boolean {
  const masNueva = dias.reduce<string | null>((a, d) => (d && (!a || d > a) ? d : a), null);
  return masNueva !== null && masNueva < desde;
}

const llave = () => config.contifico!.facturasApiKey || config.contifico!.apiKey;

async function traerPagina(pagina: number): Promise<{ results: DocumentoWire[]; next: unknown }> {
  const url = new URL(`${config.contifico!.baseUrl}/documento/`);
  url.searchParams.set("tipo_registro", "CLI");
  url.searchParams.set("page", String(pagina));
  const ctrl = new AbortController();
  const corte = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(url, { headers: { Authorization: llave(), Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Contífico respondió HTTP ${res.status} al leer facturas`);
    const cuerpo = (await res.json()) as { results?: DocumentoWire[]; next?: unknown } | DocumentoWire[];
    return Array.isArray(cuerpo) ? { results: cuerpo, next: null } : { results: cuerpo.results ?? [], next: cuerpo.next };
  } finally {
    clearTimeout(corte);
  }
}

export async function sincronizarFacturas(): Promise<void> {
  if (!config.contifico) return;
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
      const facturas: FacturaContifico[] = [];
      let paginas = 0;
      let documentos = 0;
      for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
        const { results, next } = await traerPagina(pagina);
        paginas = pagina;
        documentos += results.length;
        for (const doc of results) {
          const f = normalizarFactura(doc);
          if (f && f.dia >= desde) facturas.push(f);
        }
        const dias = results.map((doc) => diaDeContifico(doc.fecha_emision));
        if (!next || !results.length || paginaEnteraAnterior(dias, desde)) break;
      }
      const diasLeidos = facturas.map((f) => f.dia).sort();
      estado.lectura = {
        paginas, documentos, facturas: facturas.length,
        conTelefono: facturas.filter((f) => f.telefonos.length).length,
        primerDia: diasLeidos[0] ?? null, ultimoDia: diasLeidos.at(-1) ?? null,
        llave: config.contifico!.facturasApiKey ? "facturas" : "catalogo",
      };
      estado.facturas = facturas;
      estado.ultimaSync = new Date();
      estado.error = null;
    } catch (error) {
      estado.error = error instanceof Error ? error.message : String(error);
      console.error("⚠️  Ventas confirmadas: no se pudo leer Contífico —", estado.error);
    } finally {
      estado.enCurso = null;
    }
  })();
  return estado.enCurso;
}

let timer: NodeJS.Timeout | null = null;
export function startVentasConfirmadasSync() {
  if (!config.contifico || timer) return;
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

/** Lo que pinta la tarjeta de Métricas, recortado al mes que se está mirando. */
export async function resumenVentasConfirmadas(mes?: string | null) {
  // No espera a Contífico: la pantalla ya tardaba (Manuel, 25-sep). Si la
  // primera bajada no terminó, la tarjeta dice «sincronizando» y se llena sola
  // en la próxima recarga.
  const disponible = Boolean(config.contifico);

  const periodo = await resolverPeriodo(mes);
  const desdeDia = periodo.todos ? "0000-00-00" : periodo.clave + "-01";
  const hastaDia = periodo.todos ? "9999-99-99" : periodo.clave + "-99";
  const telefonos = [...new Set(estado.facturas.flatMap((f) => f.telefonos))];
  const { ventas, descartes } = cruzar(estado.facturas, await conversacionesDe(telefonos));
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
