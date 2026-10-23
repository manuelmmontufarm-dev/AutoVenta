/**
 * MÉTRICAS COMPROBABLES: SOLO LO QUE SALE DE UNA FACTURA, UN MENSAJE O UN HECHO GUARDADO.
 *
 * Manuel, 23-oct: «updatear las estadísticas para que muestren solo lo que se
 * comprueba de forma real». Hasta acá Métricas mostraba «Vendido/Ganados», el
 * embudo hasta «Ganado» y las ventas por plantilla, todo contado sobre
 * `sales_history.outcome = 'ganado'`, que alguien marca a mano en el Kanban (o
 * no marca). Desde que Depot exige el teléfono de WhatsApp en la factura, el
 * cruce chat ↔ factura de Contífico (`ventasConfirmadas.ts`) es la única venta
 * que no depende de eso. Este módulo arma, sobre ese cruce, los cinco bloques
 * que pinta el panel: ventas, parte de las llantas de la tienda, embudo hasta
 * la factura, rezago (y lo que falta por llegar) y cuándo escriben y facturan.
 *
 * Con 26 ventas al 23-oct, toda cifra va con su `n` y su rango: ver
 * `domain/estadisticaVentas.ts`.
 *
 * El tipo `MetricasComprobables` es el contrato con el panel
 * (`hub/src/data/types.ts`): se copia IGUAL en los dos lados.
 */
import { sql } from "../db/client.js";
import { config } from "../config.js";
import { resolverPeriodo } from "./periodoMensual.js";
import {
  cruceVigente,
  facturasLeidas,
  tieneLlantaDeVenta,
  ultimaSyncFacturas,
  type FacturaContifico,
  type VentaConfirmada,
} from "./ventasConfirmadas.js";
import {
  FRANJAS,
  curvaAcumulada,
  diaDeGuayaquil,
  diaDeLaSemana,
  diasEntre,
  franjaDeHora,
  lunesDe,
  mediana,
  rangoPoisson,
  sumarDias,
  ventasPorLlegar,
} from "../domain/estadisticaVentas.js";

// ── Contrato (idéntico a hub/src/data/types.ts) ─────────────────────────────

export type Franja = "madrugada" | "manana" | "mediodia" | "tarde" | "noche";
// madrugada [00,06) · manana [06,11) · mediodia [11,14) · tarde [14,18) · noche [18,24), hora de Guayaquil

export type GrupoAtencion = "bot" | "bot_y_asesor" | "asesor";
// bot: el asesor escribió 0 o 1 mensajes · asesor: el asesor escribió más que el bot · bot_y_asesor: el resto

export interface MetricasComprobables {
  disponible: boolean;               // false: no hay Contífico o todavía no se leyó
  ultimaSync: string | null;         // ISO
  /** Período del selector (mes o «todos»). */
  periodo: { clave: string; todos: boolean };

  /** Bloque 1 — ventas comprobadas DEL PERÍODO (por día de la primera factura con llantas). */
  ventas: {
    n: number;
    conIva: number;                  // suma de `total` de las facturas de esas ventas
    sinIva: number;                  // suma de `subtotal` de las mismas facturas
    rango: { bajo: number; alto: number }; // IC 95 % exacto de Poisson sobre n (Garwood), 1 decimal
    grupos: Record<GrupoAtencion, { n: number; conIva: number }>;
  };

  /** Bloque 2 — participación en las facturas de llantas de toda la tienda. */
  participacion: {
    periodo: { llantasTienda: number; delBot: number; pct: number }; // pct 0–100, 1 decimal
    /** Últimas 12 semanas (lunes, hora de Guayaquil), de la más vieja a la más nueva, SIEMPRE (no depende del selector). */
    semanas: Array<{
      lunes: string;                 // "YYYY-MM-DD"
      llantasTienda: number;         // facturas FAC no anuladas con al menos una llanta a precio ≥ $25
      delBot: number;                // ventas comprobadas cuya primera factura cae esa semana
      chats: number;                 // conversaciones creadas esa semana
      chatsConAnuncio: number;       // de esas, cuyo primer mensaje del cliente trae metadata.anuncio
      anuncios: "si" | "no" | "sin_dato"; // sin_dato: semana anterior al primer mensaje con metadata.anuncio en la base; si: chatsConAnuncio ≥ 10 y ≥ 30 % de chats
    }>;
  };

  /** Bloque 3 — embudo de la COHORTE: chats creados en el período, hasta la factura (de cualquier fecha). */
  embudo: {
    chats: number;
    conMedida: number;               // conversations.tire_size no vacío
    cotizados: number;               // al menos una fila en quotes
    conDiaDeVisita: number;          // conversations.visit_date no nulo
    compraron: number;               // ventas comprobadas de esos chats
    /** La cohorte todavía no maduró si su chat más nuevo tiene < 14 días. */
    madura: boolean;
    /** Conversión según si acordaron día (cohorte del período). */
    porDia: { conDia: { chats: number; compraron: number }; sinDia: { chats: number; compraron: number } };
  };

  /** Bloque 4 — rezago chat → factura, con TODO el histórico (no depende del selector). */
  rezago: {
    n: number;                       // ventas con las que se calcula
    medianaDias: number | null;
    acumulado: Array<{ dias: 1 | 3 | 7 | 14 | 30 | 60; pct: number }>; // % de ventas con rezago ≤ dias
    /** Ventas esperadas en los próximos 14 días de chats ya abiertos que aún no compraron. */
    porLlegar: { esperado: number; bajo: number; alto: number; chatsVivos: number };
  };

  /** Bloque 5 — cuándo, con TODO el histórico (no depende del selector). */
  cuando: {
    ventasTotales: number;
    suficiente: boolean;             // ventasTotales ≥ 40 (≥ 5 esperadas por celda en 7 días + margen)
    escribenPorFranja: Array<{ franja: Franja; chats: number; ventas: number }>;  // por hora de creación del chat
    escribenPorDia: Array<{ dia: 0 | 1 | 2 | 3 | 4 | 5 | 6; chats: number; ventas: number }>; // 0 = domingo
    facturanPorFranja: Array<{ franja: Franja; bot: number; tienda: number }>;    // por hora_emision de la factura
    facturanPorDia: Array<{ dia: 0 | 1 | 2 | 3 | 4 | 5 | 6; bot: number; tienda: number }>;
  };
}

// ── Armado puro ──────────────────────────────────────────────────────────────

/** Lo que se necesita de cada conversación. Sin teléfono ni nombre: el contrato no los lleva. */
export interface ChatParaMetricas {
  id: number;
  /** "YYYY-MM-DD" de creación, hora de Guayaquil. */
  dia: string;
  /** Hora de creación (0–23), hora de Guayaquil. */
  hora: number;
  conMedida: boolean;
  cotizado: boolean;
  conDiaDeVisita: boolean;
  /** ¿El primer mensaje del cliente trae `metadata.anuncio`? Null si el chat no tiene mensajes del cliente. */
  primerMensajeConAnuncio: boolean | null;
}

type Venta = Pick<VentaConfirmada, "ticketId" | "total" | "sinIva" | "dia" | "hora" | "grupo" | "primerDia">;
type Factura = Pick<FacturaContifico, "dia" | "hora" | "llantas">;
type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const SEMANAS = 12;
const CORTES_REZAGO: Array<1 | 3 | 7 | 14 | 30 | 60> = [1, 3, 7, 14, 30, 60];
/** Edad mínima de una cohorte diaria para entrar en la tasa: antes todavía le faltan ventas. */
const COHORTE_MADURA_TASA = 30;
/** El embudo de un período madura cuando su chat más nuevo ya tiene esto: ≤14 días llega el 80 % de las ventas. */
const COHORTE_MADURA_EMBUDO = 14;
/** Con menos ventas, el reparto por franja y día es tentativo (≥ 5 esperadas por celda en 7 días + margen). */
const VENTAS_SUFICIENTES = 40;
const DIAS: DiaSemana[] = [0, 1, 2, 3, 4, 5, 6];

const plata = (x: number) => Math.round(x * 100) / 100;
const pct1 = (parte: number, todo: number) => (todo ? Math.round((1000 * parte) / todo) / 10 : 0);

export function armarComprobables(o: {
  periodo: { clave: string; todos: boolean };
  /** Hoy en Guayaquil, "YYYY-MM-DD". */
  hoy: string;
  disponible: boolean;
  ultimaSync: string | null;
  facturas: readonly Factura[];
  ventas: readonly Venta[];
  chats: readonly ChatParaMetricas[];
  /** Día del primer mensaje con `metadata.anuncio` en la base (desde el 19-sep). Antes, no hay dato. */
  primerDiaConAnuncio: string | null;
}): MetricasComprobables {
  const enPeriodo = (dia: string) => o.periodo.todos || dia.startsWith(o.periodo.clave);
  const llantasTienda = o.facturas.filter(tieneLlantaDeVenta);
  const chatPorId = new Map(o.chats.map((c) => [c.id, c]));
  const ventaPorChat = new Map(o.ventas.map((v) => [v.ticketId, v]));

  // Bloque 1
  const ventasP = o.ventas.filter((v) => enPeriodo(v.dia));
  const grupos: Record<GrupoAtencion, { n: number; conIva: number }> = {
    bot: { n: 0, conIva: 0 }, bot_y_asesor: { n: 0, conIva: 0 }, asesor: { n: 0, conIva: 0 },
  };
  for (const v of ventasP) {
    grupos[v.grupo].n += 1;
    grupos[v.grupo].conIva += v.total;
  }
  for (const g of Object.values(grupos)) g.conIva = plata(g.conIva);

  // Bloque 2
  const lunesHoy = lunesDe(o.hoy);
  const semanas = Array.from({ length: SEMANAS }, (_, i) => {
    const lunes = sumarDias(lunesHoy, -7 * (SEMANAS - 1 - i));
    const deLaSemana = (dia: string) => lunesDe(dia) === lunes;
    const chats = o.chats.filter((c) => deLaSemana(c.dia));
    const chatsConAnuncio = chats.filter((c) => c.primerMensajeConAnuncio === true).length;
    const anuncios: "si" | "no" | "sin_dato" =
      !o.primerDiaConAnuncio || sumarDias(lunes, 6) < o.primerDiaConAnuncio
        ? "sin_dato"
        : chatsConAnuncio >= 10 && chatsConAnuncio >= 0.3 * chats.length ? "si" : "no";
    return {
      lunes,
      llantasTienda: llantasTienda.filter((f) => deLaSemana(f.dia)).length,
      delBot: o.ventas.filter((v) => deLaSemana(v.dia)).length,
      chats: chats.length,
      chatsConAnuncio,
      anuncios,
    };
  });
  const llantasTiendaP = llantasTienda.filter((f) => enPeriodo(f.dia)).length;

  // Bloque 3
  const cohorte = o.chats.filter((c) => enPeriodo(c.dia));
  const compro = (c: ChatParaMetricas) => ventaPorChat.has(c.id);
  const conDia = cohorte.filter((c) => c.conDiaDeVisita);
  const sinDia = cohorte.filter((c) => !c.conDiaDeVisita);
  const masNuevo = cohorte.reduce<string | null>((a, c) => (!a || c.dia > a ? c.dia : a), null);

  // Bloque 4
  const rezagos = o.ventas.map((v) => Math.max(0, diasEntre(v.primerDia, v.dia)));
  const porDiaDeChat = new Map<string, { chats: number; compraron: number }>();
  for (const c of o.chats) {
    const d = porDiaDeChat.get(c.dia) ?? { chats: 0, compraron: 0 };
    d.chats += 1;
    if (compro(c)) d.compraron += 1;
    porDiaDeChat.set(c.dia, d);
  }
  let chatsMaduros = 0;
  let ventasMaduras = 0;
  for (const [dia, d] of porDiaDeChat) {
    if (diasEntre(dia, o.hoy) < COHORTE_MADURA_TASA) continue;
    chatsMaduros += d.chats;
    ventasMaduras += d.compraron;
  }
  const porLlegar = ventasPorLlegar({
    hoy: o.hoy,
    rezagos,
    tasa: chatsMaduros ? ventasMaduras / chatsMaduros : 0,
    chatsPorDia: [...porDiaDeChat].map(([dia, d]) => ({ dia, chats: d.chats - d.compraron })),
  });

  // Bloque 5
  const franjaDelChatDe = (v: Venta) => {
    const c = chatPorId.get(v.ticketId);
    return c ? franjaDeHora(c.hora) : null;
  };
  const diaDelChatDe = (v: Venta) => {
    const c = chatPorId.get(v.ticketId);
    return c ? diaDeLaSemana(c.dia) : null;
  };

  return {
    disponible: o.disponible,
    ultimaSync: o.ultimaSync,
    periodo: { clave: o.periodo.clave, todos: o.periodo.todos },
    ventas: {
      n: ventasP.length,
      conIva: plata(ventasP.reduce((a, v) => a + v.total, 0)),
      sinIva: plata(ventasP.reduce((a, v) => a + v.sinIva, 0)),
      rango: rangoPoisson(ventasP.length),
      grupos,
    },
    participacion: {
      periodo: { llantasTienda: llantasTiendaP, delBot: ventasP.length, pct: pct1(ventasP.length, llantasTiendaP) },
      semanas,
    },
    embudo: {
      chats: cohorte.length,
      conMedida: cohorte.filter((c) => c.conMedida).length,
      cotizados: cohorte.filter((c) => c.cotizado).length,
      conDiaDeVisita: conDia.length,
      compraron: cohorte.filter(compro).length,
      madura: !masNuevo || diasEntre(masNuevo, o.hoy) >= COHORTE_MADURA_EMBUDO,
      porDia: {
        conDia: { chats: conDia.length, compraron: conDia.filter(compro).length },
        sinDia: { chats: sinDia.length, compraron: sinDia.filter(compro).length },
      },
    },
    rezago: {
      n: rezagos.length,
      medianaDias: mediana(rezagos),
      acumulado: curvaAcumulada(rezagos, CORTES_REZAGO),
      porLlegar,
    },
    cuando: {
      ventasTotales: o.ventas.length,
      suficiente: o.ventas.length >= VENTAS_SUFICIENTES,
      escribenPorFranja: FRANJAS.map((franja) => ({
        franja,
        chats: o.chats.filter((c) => franjaDeHora(c.hora) === franja).length,
        ventas: o.ventas.filter((v) => franjaDelChatDe(v) === franja).length,
      })),
      escribenPorDia: DIAS.map((dia) => ({
        dia,
        chats: o.chats.filter((c) => diaDeLaSemana(c.dia) === dia).length,
        ventas: o.ventas.filter((v) => diaDelChatDe(v) === dia).length,
      })),
      facturanPorFranja: FRANJAS.map((franja) => ({
        franja,
        bot: o.ventas.filter((v) => v.hora != null && franjaDeHora(v.hora) === franja).length,
        tienda: llantasTienda.filter((f) => f.hora != null && franjaDeHora(f.hora) === franja).length,
      })),
      facturanPorDia: DIAS.map((dia) => ({
        dia,
        bot: o.ventas.filter((v) => diaDeLaSemana(v.dia) === dia).length,
        tienda: llantasTienda.filter((f) => diaDeLaSemana(f.dia) === dia).length,
      })),
    },
  };
}

/**
 * Lo que va cuando no hay números que dar (sin Contífico, primera bajada sin
 * terminar o error): la misma forma, en cero y con `disponible: false`, para
 * que el panel diga «sin Contífico» o «leyendo facturas…» y no invente nada.
 */
export function comprobablesVacios(periodo: { clave: string; todos: boolean }): MetricasComprobables {
  return armarComprobables({
    periodo, hoy: diaDeGuayaquil(new Date()), disponible: false, ultimaSync: null,
    facturas: [], ventas: [], chats: [], primerDiaConAnuncio: null,
  });
}

// ── Lectura de la base ───────────────────────────────────────────────────────

async function leerChats(): Promise<{ chats: ChatParaMetricas[]; primerDiaConAnuncio: string | null }> {
  // El primer mensaje del cliente de cada chat con `distinct on`: el anuncio
  // llega con ese mensaje (`index.ts`, `recibirMensaje`). Un chat sin mensajes
  // del cliente queda en null y no cuenta como «con anuncio».
  const [filas, [primero]] = await Promise.all([
    sql<{
      id: string; dia: string; hora: number; con_medida: boolean; cotizado: boolean; con_dia: boolean;
      con_anuncio: boolean | null;
    }[]>`
      select c.id,
        to_char(c.created_at at time zone 'America/Guayaquil', 'YYYY-MM-DD') as dia,
        extract(hour from c.created_at at time zone 'America/Guayaquil')::int as hora,
        (c.tire_size is not null and c.tire_size <> '') as con_medida,
        exists (select 1 from quotes q where q.conversation_id = c.id) as cotizado,
        (c.visit_date is not null) as con_dia,
        p.con_anuncio
      from conversations c
      left join (
        select distinct on (conversation_id) conversation_id,
          coalesce(metadata ? 'anuncio', false) as con_anuncio
        from messages
        where role = 'user'
        order by conversation_id, created_at, id
      ) p on p.conversation_id = c.id
    `,
    sql<{ dia: string | null }[]>`
      select to_char(min(created_at) at time zone 'America/Guayaquil', 'YYYY-MM-DD') as dia
      from messages where metadata ? 'anuncio'
    `,
  ]);
  return {
    chats: filas.map((f) => ({
      id: Number(f.id), dia: f.dia, hora: Number(f.hora), conMedida: f.con_medida, cotizado: f.cotizado,
      conDiaDeVisita: f.con_dia, primerMensajeConAnuncio: f.con_anuncio,
    })),
    primerDiaConAnuncio: primero?.dia ?? null,
  };
}

/**
 * Las consultas de chats se hacen una vez por sync de facturas o al minuto,
 * como `cruceVigente`: cambiar de mes en el selector recorta de acá.
 */
let chatsGuardados: { at: number; sync: Date | null; datos: Awaited<ReturnType<typeof leerChats>> } | null = null;
async function chatsVigentes() {
  const sync = ultimaSyncFacturas();
  if (chatsGuardados && chatsGuardados.sync === sync && Date.now() - chatsGuardados.at < 60_000) return chatsGuardados.datos;
  const datos = await leerChats();
  chatsGuardados = { at: Date.now(), sync, datos };
  return datos;
}

/** `metrics.comprobables` del mes que mira el panel (o «todos»). */
export async function resumenComprobables(mes?: string | null): Promise<MetricasComprobables> {
  const periodo = await resolverPeriodo(mes);
  const sync = ultimaSyncFacturas();
  // Sin Contífico o sin la primera bajada no hay ventas que dar: no espera a
  // Contífico, igual que la tarjeta de ventas confirmadas.
  if (!config.contifico || !sync) return comprobablesVacios(periodo);
  const [{ ventas }, { chats, primerDiaConAnuncio }] = await Promise.all([cruceVigente(), chatsVigentes()]);
  return armarComprobables({
    periodo,
    hoy: diaDeGuayaquil(new Date()),
    disponible: true,
    ultimaSync: sync.toISOString(),
    facturas: facturasLeidas(),
    ventas,
    chats,
    primerDiaConAnuncio,
  });
}
