/**
 * Reporte del día para los asesores.
 *
 * Sale a las 20:00 de Ecuador y cubre desde las 20:00 del día anterior: el
 * corte es la hora en que la tienda cierra, así que un reporte = un día de
 * trabajo, y lo que entra después de las 20:00 aparece mañana en vez de partir
 * la noche por la mitad.
 *
 * Qué lleva y por qué: exactamente las tres divisiones del tab Oportunidades,
 * porque el reporte no es un informe aparte — es el tab en el bolsillo del
 * asesor cuando cierra la tienda. Si el reporte contara otra cosa, el asesor
 * tendría que traducir; así abre el link y ve lo mismo que acaba de leer.
 *
 *  · Cotizados — ya recibieron precio, están a un empujón del cierre.
 *  · Piden asesor — pidieron humano, van a llamar, o el bot no alcanzó.
 *  · Errores — sólo lo que se rompió DENTRO del chat (ver alertTaxonomy).
 *    Lo técnico va aparte y sólo con el número: es del desarrollador.
 *
 * Se queda corto a propósito: cada lista se recorta y el resto se cuenta. Un
 * PDF de cuatro páginas a las ocho de la noche no lo lee nadie.
 */
import { business, config } from "../config.js";
import { sql } from "../db/client.js";
import type { Stage } from "../domain/pipeline.js";
import { clasificarAlerta, etiquetaTecnica } from "./alertTaxonomy.js";
import { DEFAULT_PIECES_CONFIG, getPiecesConfig } from "./settings.js";

/** Cuántas filas se listan por sección antes de resumir el resto en «y N más». */
const TOPE_POR_SECCION = 12;

/** Cuántos días cubre la portada de gráficos. Siete = la semana que se cerró. */
const DIAS_SEMANA = 7;

/**
 * Las fases del kanban que sí se pueden contar.
 *
 * `nuevo` queda fuera a propósito: es la etapa en la que nace la conversación,
 * no una a la que alguien la mueve, y el historial de los tickets viejos no
 * tiene esa fila. Contarla daría un número que parece cero cuando en realidad
 * es «no se sabe» — el mismo «?» que muestra el panel.
 */
const FASES: Array<{ etapa: Stage; nombre: string; corto: string }> = [
  { etapa: "medida_confirmada", nombre: "Medida confirmada", corto: "Medida" },
  { etapa: "seleccionando", nombre: "Eligiendo opciones", corto: "Eligiendo" },
  { etapa: "cotizacion_enviada", nombre: "Cotización enviada", corto: "Cotización" },
  { etapa: "seguimiento_venta", nombre: "Seguimiento hasta venta", corto: "Seguimiento" },
  { etapa: "ganado", nombre: "Ganado", corto: "Ganado" },
  { etapa: "perdido", nombre: "Perdido", corto: "Perdido" },
];

/**
 * Cuántos días de silencio antes de que una conversación deje de ser tarea.
 *
 * «Cotizados» y «Piden asesor» son pendientes acumulados, no cosas que pasaron
 * hoy, y eso está bien — son plata sin cerrar. Lo que no está bien es que sean
 * ETERNOS: un envío manual reasigna el chat a `humano` y nunca vuelve al bot,
 * así que sin este corte «piden asesor» acaba siendo el censo de todo chat que
 * un humano tocó alguna vez. Medido contra la base real de Depot: 202 filas.
 * Con dos semanas de corte queda lo que de verdad sigue vivo.
 */
const DIAS_VIVO = 14;

/** Hora de corte, en hora de Ecuador. */
export const HORA_DE_CORTE = 20;

export interface FilaCliente {
  conversationId: number;
  nombre: string;
  telefono: string;
  motivo: string;
  /** Etiqueta de fecha ya legible («viene mañana», «no vino»), o null. */
  cuando: string | null;
  /** true = prometió venir y la fecha ya pasó. Es el más urgente de todos. */
  vencida: boolean;
  monto: number | null;
  medida: string | null;
  local: string | null;
  esperaDesde: string | null;
  link: string;
}

export interface FilaError {
  conversationId: number;
  nombre: string;
  motivo: string;
  link: string;
}

export interface FilaTecnica {
  telefono: string;
  etiqueta: string;
  veces: number;
}

/** Un día de la semana, medido con el mismo corte de 20:00 que el reporte. */
export interface DiaSemana {
  /** YYYY-MM-DD del día que esa ventana cierra. */
  clave: string;
  /** «lun 4» — lo que cabe bajo una barra del eje. */
  etiqueta: string;
  /** true = el día que este reporte cierra. Se pinta distinto en los gráficos. */
  esHoy: boolean;
  cotizaciones: number;
  monto: number;
  escribieron: number;
  ganadas: number;
  montoGanado: number;
}

/**
 * Cuánta gente entró a una columna del kanban.
 *
 * Se cuenta por conversación y ciclo, no por fila del historial: un ticket que
 * rebota entre «eligiendo» y «cotización enviada» tres veces es una persona que
 * llegó a cotización, no tres.
 */
export interface FaseKanban {
  etapa: Stage;
  nombre: string;
  /** «Seguimiento» en vez de «Seguimiento hasta venta»: es lo que cabe en un eje. */
  corto: string;
  hoy: number;
  semana: number;
}

export interface ReporteDiario {
  negocio: string;
  /**
   * La misma paleta y la misma fuente de precio que el negocio eligió en
   * Ajustes para las piezas de cotización. El reporte no inventa una identidad
   * propia: si el dueño cambia el color de sus cotizaciones, el reporte de la
   * noche cambia con ellas.
   */
  paleta: string;
  fuente: string;
  generadoEn: string;
  desde: string;
  hasta: string;
  /** «viernes 8 de agosto, 20:00 → sábado 9 de agosto, 20:00» */
  periodo: string;
  /** «sábado 9 de agosto» — el día que el reporte cierra. */
  dia: string;
  /** Clave de deduplicación del envío: YYYY-MM-DD del día de cierre. */
  diaClave: string;
  hubUrl: string;
  linkOportunidades: string;
  resumen: {
    clientesNuevos: number;
    clientesQueEscribieron: number;
    cotizacionesEnviadas: number;
    montoCotizado: number;
    visitasAgendadas: number;
    ventasGanadas: number;
    montoGanado: number;
    /**
     * Plata cotizada que sigue SIN cerrarse: la suma de todos los «Cotizados»
     * pendientes, no sólo los del día. Es la única cifra del reporte que no
     * mira hacia atrás — dice cuánto hay sobre la mesa esperando un empujón, y
     * es la que justifica que el asesor abra el panel un domingo.
     */
    montoEnJuego: number;
  };
  /**
   * La semana que se cierra hoy, para los gráficos de la portada.
   *
   * Un solo día no dice nada: seis cotizaciones son muchas o pocas según cómo
   * vinieron los cinco días anteriores. Los siete días usan el mismo corte de
   * 20:00, así que el último de la serie es exactamente el del resumen — el
   * asesor puede leer la barra de hoy y la cifra de arriba y cuadran.
   */
  semana: {
    dias: DiaSemana[];
    cotizaciones: number;
    montoCotizado: number;
    escribieron: number;
    ganadas: number;
    montoGanado: number;
  };
  /** Entradas a cada columna del kanban. Sin `nuevo`: ver la constante FASES. */
  fases: FaseKanban[];
  /** Todo lo cotizado desde que el bot existe. El «total» contra el «hoy». */
  acumulado: { cotizaciones: number; montoCotizado: number };
  cotizados: { filas: FilaCliente[]; total: number };
  pidenAsesor: { filas: FilaCliente[]; total: number };
  errores: { filas: FilaError[]; total: number };
  tecnicos: { filas: FilaTecnica[]; total: number };
}

/**
 * Instante exacto de las 20:00 de Ecuador en un día dado.
 *
 * Ecuador continental no tiene horario de verano — es UTC-5 todo el año, sin
 * excepción — así que el desfase se puede escribir literal y el resultado es
 * exacto. Hacerlo con Intl daría lo mismo por muchas más líneas.
 */
function corteDelDia(diaISO: string): Date {
  return new Date(`${diaISO}T${String(HORA_DE_CORTE).padStart(2, "0")}:00:00-05:00`);
}

/** Día calendario en Guayaquil (YYYY-MM-DD). */
function diaGuayaquil(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(fecha);
}

function fechaLarga(fecha: Date): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    weekday: "long", day: "numeric", month: "long",
  }).format(fecha);
}

/** «lun 4» — el eje de los gráficos, en los caracteres que caben debajo. */
function diaCorto(fecha: Date): string {
  const partes = new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil", weekday: "short", day: "numeric",
  }).formatToParts(fecha);
  const dia = partes.find((p) => p.type === "weekday")?.value ?? "";
  const numero = partes.find((p) => p.type === "day")?.value ?? "";
  return `${dia.replace(".", "").slice(0, 3)} ${numero}`;
}

function horaCorta(fecha: Date): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(fecha);
}

/**
 * La ventana que cubre el reporte que se cierra en `ahora`.
 *
 * Antes de las 20:00 el día todavía no cerró, así que el reporte vigente es el
 * de ayer: pedirlo a las 3 de la tarde devuelve el último período completo, no
 * medio día suelto. Esto es lo que hace que el endpoint de vista previa sirva a
 * cualquier hora sin inventar un período a medias.
 */
export function ventanaDelReporte(ahora = new Date()): { desde: Date; hasta: Date; diaClave: string } {
  const hoy = diaGuayaquil(ahora);
  const corteHoy = corteDelDia(hoy);
  const hasta = ahora >= corteHoy ? corteHoy : corteDelDia(diaGuayaquil(new Date(corteHoy.getTime() - 86_400_000)));
  return { desde: new Date(hasta.getTime() - 86_400_000), hasta, diaClave: diaGuayaquil(new Date(hasta.getTime() - 60_000)) };
}

function linkTicket(id: number): string {
  return `${config.hub.publicUrl}/#/ticket/${id}`;
}

/**
 * «hoy 15:00», «mañana 09:30», «vie 14 ago 16:00» — el plazo en lo mínimo.
 *
 * Las fechas lejanas van en formato corto y no como «viernes 14 de agosto»
 * porque esta etiqueta se pinta dentro de una pastilla al lado de la medida y
 * el local: la versión larga ocupaba media tarjeta y se partía en dos líneas.
 */
function etiquetaCuando(visita: Date | null, compromiso: string | null, ahora: Date): string | null {
  if (visita) {
    const dia = diaGuayaquil(visita);
    const hoy = diaGuayaquil(ahora);
    const manana = diaGuayaquil(new Date(ahora.getTime() + 86_400_000));
    const hora = horaCorta(visita);
    if (dia === hoy) return `hoy ${hora}`;
    if (dia === manana) return `mañana ${hora}`;
    const mes = new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", month: "short" })
      .format(visita).replace(".", "");
    return `${diaCorto(visita)} ${mes} ${hora}`;
  }
  return compromiso ? compromiso.slice(0, 60) : null;
}

interface FilaCruda {
  id: number;
  phone: string;
  name: string | null;
  stage: string;
  assigned_to: string;
  tire_size: string | null;
  nearest_store: string | null;
  visit_date: Date | null;
  pickup_date: Date | null;
  customer_commitment: string | null;
  follow_up_reason: string | null;
  last_customer_message_at: Date | null;
  updated_at: Date;
  total: string | number | null;
  human_requested: boolean;
}

function aFila(row: FilaCruda, motivo: string, ahora: Date): FilaCliente {
  const visita = row.visit_date ?? row.pickup_date;
  return {
    conversationId: Number(row.id),
    nombre: row.name ?? row.phone,
    telefono: row.phone,
    motivo,
    cuando: etiquetaCuando(visita, row.customer_commitment, ahora),
    vencida: Boolean(visita && visita.getTime() < ahora.getTime() - 86_400_000),
    monto: row.total == null ? null : Number(row.total),
    medida: row.tire_size,
    local: row.nearest_store,
    esperaDesde: row.last_customer_message_at?.toISOString() ?? null,
    link: linkTicket(Number(row.id)),
  };
}

const CAMPOS_CLIENTE = sql`
  c.id, c.phone, c.name, c.stage, c.assigned_to, c.tire_size, c.nearest_store,
  c.visit_date, c.pickup_date, c.updated_at, c.last_customer_message_at,
  case when c.customer_commitment_cycle = c.current_cycle then c.customer_commitment end as customer_commitment,
  case when c.follow_up_reason_cycle = c.current_cycle then c.follow_up_reason end as follow_up_reason,
  q.total,
  exists (
    select 1 from bot_alerts a
    where a.conversation_id = c.id and a.cycle = c.current_cycle
      and a.type = 'human_requested' and a.status in ('open', 'snoozed')
  ) as human_requested
`;

const COTIZACION_VIGENTE = sql`
  left join lateral (
    select total from quotes
    where conversation_id = c.id and cycle = c.current_cycle
    order by created_at desc limit 1
  ) q on true
`;

export async function buildDailyReport(ahora = new Date()): Promise<ReporteDiario> {
  const { desde, hasta, diaClave } = ventanaDelReporte(ahora);
  const vivoDesde = new Date(hasta.getTime() - DIAS_VIVO * 86_400_000);

  const [metricas] = await sql<{
    nuevos: number; escribieron: number; cotizaciones: number; monto: string | number | null;
    visitas: number; ganadas: number; monto_ganado: string | number | null;
  }[]>`
    select
      (select count(*)::int from conversations where created_at >= ${desde} and created_at < ${hasta}) as nuevos,
      (select count(distinct conversation_id)::int from messages
        where direction = 'inbound' and created_at >= ${desde} and created_at < ${hasta}) as escribieron,
      (select count(*)::int from quotes where created_at >= ${desde} and created_at < ${hasta}) as cotizaciones,
      (select coalesce(sum(total), 0) from quotes where created_at >= ${desde} and created_at < ${hasta}) as monto,
      -- Visitas del día = clientes que dijeron cuándo vienen. El aviso
      -- 'visita_comprometida' se crea justo en ese instante y ya viene
      -- deduplicado por fecha prometida, así que contar sus filas es contar
      -- promesas nuevas, no repeticiones de la misma.
      (select count(*)::int from bot_alerts
        where type = 'visita_comprometida' and created_at >= ${desde} and created_at < ${hasta}) as visitas,
      (select count(*)::int from sales_history
        where outcome = 'ganado' and closed_at >= ${desde} and closed_at < ${hasta}) as ganadas,
      (select coalesce(sum(total), 0) from sales_history
        where outcome = 'ganado' and closed_at >= ${desde} and closed_at < ${hasta}) as monto_ganado
  `;

  // La semana, ventana por ventana.
  //
  // Los cortes se generan desde `hasta` hacia atrás en pasos de un día, así que
  // el último tramo de la serie ES el del resumen de arriba: la barra de hoy y
  // la cifra grande de «cotizado hoy» salen del mismo período o el reporte se
  // contradice a sí mismo. Van como una sola consulta con subconsultas por
  // tramo —siete filas, no siete viajes a la base— porque esto corre a las
  // 20:00 en la instancia chica de Railway.
  const semanaDesde = new Date(hasta.getTime() - DIAS_SEMANA * 86_400_000);
  const serie = await sql<{
    inicio: Date; cotizaciones: number; monto: string | number | null;
    escribieron: number; ganadas: number; monto_ganado: string | number | null;
  }[]>`
    with tramos as (
      select generate_series(
        ${semanaDesde}::timestamptz,
        ${new Date(hasta.getTime() - 86_400_000)}::timestamptz,
        interval '1 day'
      ) as inicio
    )
    select
      t.inicio,
      (select count(*)::int from quotes q
        where q.created_at >= t.inicio and q.created_at < t.inicio + interval '1 day') as cotizaciones,
      (select coalesce(sum(q.total), 0) from quotes q
        where q.created_at >= t.inicio and q.created_at < t.inicio + interval '1 day') as monto,
      (select count(distinct m.conversation_id)::int from messages m
        where m.direction = 'inbound'
          and m.created_at >= t.inicio and m.created_at < t.inicio + interval '1 day') as escribieron,
      (select count(*)::int from sales_history s
        where s.outcome = 'ganado'
          and s.closed_at >= t.inicio and s.closed_at < t.inicio + interval '1 day') as ganadas,
      (select coalesce(sum(s.total), 0) from sales_history s
        where s.outcome = 'ganado'
          and s.closed_at >= t.inicio and s.closed_at < t.inicio + interval '1 day') as monto_ganado
    from tramos t
    order by t.inicio
  `;

  // Entradas a cada columna del kanban.
  //
  // `count(distinct (conversation_id, cycle))` y no `count(*)`: el ticket que
  // rebota de «eligiendo» a «cotización enviada» y vuelve deja dos filas en el
  // historial, pero es una sola persona que llegó a cotizar. Contar filas
  // inflaba justo las columnas del medio, que son las que más rebotan.
  const entradas = await sql<{ etapa: string; hoy: number; semana: number }[]>`
    select
      to_stage as etapa,
      count(distinct (conversation_id, cycle))
        filter (where created_at >= ${desde} and created_at < ${hasta})::int as hoy,
      count(distinct (conversation_id, cycle))::int as semana
    from stage_transitions
    where created_at >= ${semanaDesde} and created_at < ${hasta}
      and to_stage <> 'nuevo'
    group by to_stage
  `;

  const [historico] = await sql<{ cotizaciones: number; monto: string | number | null }[]>`
    select count(*)::int as cotizaciones, coalesce(sum(total), 0) as monto from quotes
  `;

  // Cotizados: mismo criterio que el tab (etapa cotizacion_enviada o
  // seguimiento_venta, abiertos), mismo orden — primero el que prometió venir y
  // no vino, luego el plazo más cercano, luego el monto más alto.
  const cotizados = await sql<FilaCruda[]>`
    select ${CAMPOS_CLIENTE}
    from conversations c
    ${COTIZACION_VIGENTE}
    where c.status = 'open' and c.stage in ('cotizacion_enviada', 'seguimiento_venta')
      and coalesce(c.last_customer_message_at, c.updated_at) >= ${vivoDesde}
    order by
      (c.visit_date is not null and c.visit_date < ${new Date(ahora.getTime() - 86_400_000)}) desc,
      coalesce(c.visit_date, c.pickup_date::timestamptz, 'infinity'::timestamptz) asc,
      q.total desc nulls last
  `;

  // Piden asesor = quien de verdad está ESPERANDO una respuesta.
  //
  // «Está en manos humanas» no sirve como criterio: un envío manual desde el
  // panel reasigna el chat a `humano` y nunca lo devuelve al bot, así que en la
  // base real de Depot 202 de 368 conversaciones abiertas figuran como humanas
  // — más de la mitad del censo. De esas, sólo 23 tienen el último mensaje del
  // cliente (nadie contestó) y sólo 5 pidieron un asesor explícitamente. Esos
  // son los que hay que atender; el resto ya fueron atendidos y siguen abiertos
  // porque nadie los cierra.
  const asesor = await sql<FilaCruda[]>`
    select ${CAMPOS_CLIENTE}
    from conversations c
    ${COTIZACION_VIGENTE}
    where c.status = 'open'
      and coalesce(c.last_customer_message_at, c.updated_at) >= ${vivoDesde}
      and (
        exists (
          select 1 from bot_alerts a
          where a.conversation_id = c.id and a.cycle = c.current_cycle
            and a.type = 'human_requested' and a.status in ('open', 'snoozed')
        )
        or (
          c.assigned_to = 'human'
          and (
            select m.direction from messages m
            where m.conversation_id = c.id order by m.created_at desc limit 1
          ) = 'inbound'
        )
      )
    order by coalesce(c.last_customer_message_at, c.updated_at) asc
  `;

  const alertas = await sql<{
    type: string; summary: string; exact_reason: string;
    conversation_id: number; name: string | null; phone: string;
  }[]>`
    select a.type, a.summary, a.exact_reason, a.conversation_id, c.name, c.phone
    from bot_alerts a
    join conversations c on c.id = a.conversation_id
    where a.status in ('open', 'snoozed')
      and (a.snoozed_until is null or a.snoozed_until <= now())
      -- Sólo lo que se rompió DENTRO de la ventana. El tab del panel sigue
      -- mostrando todo lo abierto —ahí es una bandeja de tareas—, pero el
      -- reporte es un parte diario: un error de hace cinco días no es noticia
      -- de hoy, y arrastrarlo hacía que el reporte abriera con «74 errores».
      and a.created_at >= ${desde} and a.created_at < ${hasta}
    order by case a.priority when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
      a.created_at desc
  `;

  const errores: FilaError[] = [];
  const tecnicosPorNumero = new Map<string, FilaTecnica>();
  for (const alerta of alertas) {
    const clase = clasificarAlerta(alerta.type);
    if (clase === "operativo") continue;
    if (clase === "conversacion") {
      errores.push({
        conversationId: Number(alerta.conversation_id),
        nombre: alerta.name ?? alerta.phone,
        motivo: alerta.summary,
        link: linkTicket(Number(alerta.conversation_id)),
      });
      continue;
    }
    // Técnicas: se agrupan por número. Diez fallos de envío al mismo cliente son
    // un bug, no diez tareas — y así el bloque no le tapa la vista al asesor.
    const previa = tecnicosPorNumero.get(alerta.phone);
    if (previa) previa.veces += 1;
    else tecnicosPorNumero.set(alerta.phone, { telefono: alerta.phone, etiqueta: etiquetaTecnica(alerta.type), veces: 1 });
  }
  const tecnicos = [...tecnicosPorNumero.values()];

  // Sobre el total, no sobre las doce que se listan: recortar la lista es una
  // decisión de lectura, no puede achicar la plata que hay en juego.
  const montoEnJuego = cotizados.reduce((suma, row) => suma + Number(row.total ?? 0), 0);

  function motivoCotizado(row: FilaCruda): string {
    const visita = row.visit_date ?? row.pickup_date;
    if (visita && visita.getTime() < ahora.getTime() - 86_400_000) return "Dijo que venía y no apareció — rescatar";
    if (row.customer_commitment) return `Dijo: ${row.customer_commitment.slice(0, 80)}`;
    if (visita) return "Visita agendada — confirmar y tener las llantas listas";
    return row.follow_up_reason ?? "Cotización enviada — empujar el cierre";
  }

  function motivoAsesor(row: FilaCruda): string {
    if (row.human_requested) return "Pidió hablar con un asesor";
    return row.follow_up_reason ?? "El chat está en manos del equipo";
  }

  // Si Ajustes no se puede leer, el reporte sale igual con la paleta por
  // defecto: un color no vale un reporte que no llega.
  const piezas = await getPiecesConfig().catch(() => DEFAULT_PIECES_CONFIG);

  const dias: DiaSemana[] = serie.map((fila) => {
    // La etiqueta es la del día en que se TRABAJÓ: la ventana abre a las 20:00
    // y cierra a las 20:00 del día siguiente, así que fechar el tramo por su
    // inicio pondría el trabajo del martes bajo el rótulo del lunes.
    const cierre = new Date(fila.inicio.getTime() + 86_400_000 - 60_000);
    return {
      clave: diaGuayaquil(cierre),
      etiqueta: diaCorto(cierre),
      esHoy: diaGuayaquil(cierre) === diaClave,
      cotizaciones: fila.cotizaciones,
      monto: Number(fila.monto ?? 0),
      escribieron: fila.escribieron,
      ganadas: fila.ganadas,
      montoGanado: Number(fila.monto_ganado ?? 0),
    };
  });

  const porEtapa = new Map(entradas.map((fila) => [fila.etapa, fila]));
  // Se recorre FASES y no el resultado de la consulta: una columna sin
  // movimiento tiene que aparecer en cero, no desaparecer del gráfico. Un hueco
  // en el kanban es información, y además el orden lo fija el pipeline, no el
  // azar de lo que la base devuelva primero.
  const fases: FaseKanban[] = FASES.map(({ etapa, nombre, corto }) => ({
    etapa, nombre, corto,
    hoy: porEtapa.get(etapa)?.hoy ?? 0,
    semana: porEtapa.get(etapa)?.semana ?? 0,
  }));

  return {
    negocio: business.name,
    paleta: piezas.paleta,
    fuente: piezas.fuente,
    generadoEn: ahora.toISOString(),
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
    periodo: `${fechaLarga(desde)}, ${horaCorta(desde)} → ${fechaLarga(hasta)}, ${horaCorta(hasta)}`,
    dia: fechaLarga(new Date(hasta.getTime() - 60_000)),
    diaClave,
    hubUrl: config.hub.publicUrl,
    linkOportunidades: `${config.hub.publicUrl}/#/opportunities`,
    resumen: {
      clientesNuevos: metricas?.nuevos ?? 0,
      clientesQueEscribieron: metricas?.escribieron ?? 0,
      cotizacionesEnviadas: metricas?.cotizaciones ?? 0,
      montoCotizado: Number(metricas?.monto ?? 0),
      visitasAgendadas: metricas?.visitas ?? 0,
      ventasGanadas: metricas?.ganadas ?? 0,
      montoGanado: Number(metricas?.monto_ganado ?? 0),
      montoEnJuego,
    },
    semana: {
      dias,
      cotizaciones: dias.reduce((s, d) => s + d.cotizaciones, 0),
      montoCotizado: dias.reduce((s, d) => s + d.monto, 0),
      escribieron: dias.reduce((s, d) => s + d.escribieron, 0),
      ganadas: dias.reduce((s, d) => s + d.ganadas, 0),
      montoGanado: dias.reduce((s, d) => s + d.montoGanado, 0),
    },
    fases,
    acumulado: {
      cotizaciones: historico?.cotizaciones ?? 0,
      montoCotizado: Number(historico?.monto ?? 0),
    },
    cotizados: { filas: cotizados.slice(0, TOPE_POR_SECCION).map((r) => aFila(r, motivoCotizado(r), ahora)), total: cotizados.length },
    pidenAsesor: { filas: asesor.slice(0, TOPE_POR_SECCION).map((r) => aFila(r, motivoAsesor(r), ahora)), total: asesor.length },
    errores: { filas: errores.slice(0, TOPE_POR_SECCION), total: errores.length },
    tecnicos: { filas: tecnicos.slice(0, TOPE_POR_SECCION), total: tecnicos.length },
  };
}
