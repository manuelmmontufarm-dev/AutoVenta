/**
 * Emisión y canje del cupón de confirmación.
 *
 * El circuito completo, y conviene tenerlo entero en la cabeza porque ninguna
 * pieza sirve sola:
 *
 *   1. El cliente dice cuándo viene  →  el bot le emite un código (aquí).
 *   2. El cliente lo dicta en caja   →  el cajero le aplica el 2 % adicional
 *                                       y copia el código en la descripción
 *                                       de la factura de Contífico.
 *   3. Nosotros LEEMOS esas descripciones  →  sabemos qué cotización del bot
 *                                             terminó en venta de verdad.
 *
 * No escribimos nada en Contífico. Eso es deliberado: no tenemos (ni queremos)
 * permiso de facturación, y el dato que necesitamos lo pone gratis el cajero
 * que ya está tecleando la factura.
 *
 * NACE APAGADO, y no es una precaución de rutina: el cupón promete plata en
 * caja. Si el bot empieza a emitir códigos antes de que Depot capacite a los
 * cajeros, el cliente llega con un código que nadie sabe honrar — peor que no
 * haber prometido nada. El interruptor está en Ajustes y lo prende Depot el día
 * que dé la luz verde.
 */
import { sql } from "../db/client.js";
import {
  ahorroDelCupon,
  etiquetaCupon,
  etiquetaVigencia,
  generarCodigoCupon,
  mensajeCupon,
  type MotivoCupon,
  normalizarCodigoCupon,
  vigenciaDelCupon,
} from "../domain/coupons.js";
import { renderCouponTicket } from "../render/couponTicket.js";
import { appendMessage } from "./conversations.js";
import { getCouponConfig, getPiecesConfig } from "./settings.js";
import { sendCustomerText, sendImage } from "../wa/client.js";

/** Postgres: violación de índice único. */
const CLAVE_DUPLICADA = "23505";

/**
 * Intentos de generar un código libre antes de rendirse.
 *
 * Con 6.400 combinaciones y el volumen de Depot, la primera casi siempre entra.
 * Cinco intentos cubren de sobra el día lejano en que el surtido esté cargado;
 * si ni así, se prefiere no emitir a emitir algo repetido: un código duplicado
 * atribuiría la venta al chat equivocado, que es exactamente lo que este
 * sistema existe para evitar.
 */
const INTENTOS_CODIGO = 5;

export interface CuponEmitido {
  codigo: string;
  porcentaje: number;
  /** true si ya existía: el cliente no recibe un segundo descuento. */
  yaExistia: boolean;
  /** Para nombrarlo en el mensaje: el 2 % se suma sobre ESA cotización. */
  numeroCotizacion: string | null;
}

export interface CuponVigente {
  codigo: string;
  porcentaje: number;
  estado: string;
  emitidoEn: Date;
  canjeadoEn: Date | null;
  canjeadoPor: string | null;
}

/**
 * El cupón vivo de una conversación, si lo hay.
 *
 * Lo usan los avisos de visita para recordarle al asesor —y por su intermedio
 * al cliente— que el código existe. No emite nada: solo consulta.
 */
export async function getCouponForConversation(
  conversationId: number,
  cycle: number,
): Promise<CuponVigente | null> {
  const [fila] = await sql<{
    code: string; extra_pct: string | number; status: string;
    issued_at: Date; redeemed_at: Date | null; redeemed_by: string | null;
  }[]>`
    select code, extra_pct, status, issued_at, redeemed_at, redeemed_by
    from confirmation_coupons
    where conversation_id = ${conversationId} and cycle = ${cycle} and status <> 'anulado'
    limit 1
  `;
  return fila
    ? {
        codigo: fila.code,
        porcentaje: Number(fila.extra_pct),
        estado: fila.status,
        emitidoEn: fila.issued_at,
        canjeadoEn: fila.redeemed_at,
        canjeadoPor: fila.redeemed_by,
      }
    : null;
}

/**
 * Emite el cupón de una conversación, si corresponde.
 *
 * Devuelve null cuando el cupón está apagado — que es el estado por defecto y
 * el que rige hasta que Depot dé la luz verde. Nunca lanza: un fallo emitiendo
 * un descuento no puede tumbar la respuesta al cliente, que es lo que de verdad
 * importa en ese turno.
 *
 * Es idempotente por (conversación, ciclo): si el cliente cambia la fecha de
 * visita tres veces, sigue siendo UN cupón. Lo garantiza el índice único
 * parcial de la migración 017, no una consulta previa — dos mensajes que
 * lleguen a la vez no pueden colarse por el hueco entre el `select` y el
 * `insert`.
 */
export async function emitirCuponDeConfirmacion(input: {
  conversationId: number;
  cycle: number;
  /** «visita» al confirmar el día; «seguimiento» cuando lo regala el último seguimiento. */
  motivo?: MotivoCupon;
  ahora?: Date;
}): Promise<CuponEmitido | null> {
  try {
    const cfg = await getCouponConfig();
    if (!cfg.activo) return null;

    // SIN COTIZACIÓN NO HAY CUPÓN (19-oct). El ticket dice «son $X menos sobre
    // su cotización» y nombra las llantas: sin cotización no hay sobre qué
    // descontar, y un 2 % de nada no se siente como premio.
    const [cotizacion] = await sql<{ id: number; quote_number: string | null }[]>`
      select id, quote_number from quotes
      where conversation_id = ${input.conversationId} and cycle = ${input.cycle}
      order by created_at desc limit 1
    `;
    if (!cotizacion) return null;
    const numeroCotizacion = cotizacion.quote_number ?? null;
    const [conv] = await sql<{ visit_date: Date | null }[]>`
      select visit_date from conversations where id = ${input.conversationId}
    `;
    const validoHasta = vigenciaDelCupon({ ahora: input.ahora ?? new Date(), visita: conv?.visit_date ?? null });
    const motivo: MotivoCupon = input.motivo ?? "visita";

    const yaTiene = await getCouponForConversation(input.conversationId, input.cycle);
    if (yaTiene) {
      return {
        codigo: yaTiene.codigo, porcentaje: yaTiene.porcentaje,
        yaExistia: true, numeroCotizacion,
      };
    }

    for (let intento = 0; intento < INTENTOS_CODIGO; intento += 1) {
      const codigo = generarCodigoCupon();
      try {
        await sql`
          insert into confirmation_coupons (code, conversation_id, cycle, quote_id, extra_pct, motivo, valid_until)
          values (${codigo}, ${input.conversationId}, ${input.cycle}, ${cotizacion.id}, ${cfg.porcentaje}, ${motivo}, ${validoHasta})
        `;
        return { codigo, porcentaje: cfg.porcentaje, yaExistia: false, numeroCotizacion };
      } catch (error) {
        if ((error as { code?: string })?.code !== CLAVE_DUPLICADA) throw error;
        // Puede chocar por el código (se reintenta con otro) o por la
        // conversación (otro mensaje ganó la carrera: ese cupón es el bueno).
        const existente = await getCouponForConversation(input.conversationId, input.cycle);
        if (existente) {
          return {
            codigo: existente.codigo, porcentaje: existente.porcentaje,
            yaExistia: true, numeroCotizacion,
          };
        }
      }
    }
    console.warn(`🎟️ No se pudo emitir cupón para la conversación ${input.conversationId}: códigos agotados`);
    return null;
  } catch (error) {
    console.warn("🎟️ Falló la emisión del cupón:", error instanceof Error ? error.message : error);
    return null;
  }
}

export type MotivoRechazo = "formato" | "no_existe" | "ya_canjeado" | "anulado" | "vencido";

export interface CuponConsultado {
  codigo: string;
  porcentaje: number;
  conversationId: number;
  /** Con quién hay que cotejarlo: el cliente que lo recibió por WhatsApp. */
  cliente: string | null;
  telefono: string | null;
  medida: string | null;
  totalCotizado: number | null;
  local: string | null;
  visita: Date | null;
  emitidoEn: Date;
}

export type ResultadoConsulta =
  | { ok: true; cupon: CuponConsultado }
  | { ok: false; motivo: MotivoRechazo; detalle: string };

/**
 * Verifica un código SIN canjearlo — el paso que de verdad se hace en caja.
 *
 * Existe separado del canje por una razón práctica: en el mostrador primero se
 * comprueba que el código sea real y de quién es, y recién cuando la venta se
 * cierra se aplica el descuento. Si «verificar» quemara el cupón, un cliente
 * que se arrepiente a mitad de la compra se quedaría sin él y con el código
 * marcado como usado.
 *
 * Devuelve además con quién cotejarlo (nombre, teléfono, medida, total y qué
 * día dijo que venía): eso es lo que convierte «el código existe» en «este
 * código es de la persona que tengo enfrente».
 */
export async function consultarCupon(entrada: string): Promise<ResultadoConsulta> {
  const codigo = normalizarCodigoCupon(entrada);
  if (!codigo) {
    return {
      ok: false,
      motivo: "formato",
      detalle: "Ese código no tiene la forma de un cupón de Depot (ejemplo: DT-PUMA47). Reléalo con el cliente.",
    };
  }
  const [fila] = await sql<{
    conversation_id: number; extra_pct: string | number; status: string;
    issued_at: Date; redeemed_at: Date | null; redeemed_by: string | null;
    valid_until: Date | null;
    nombre: string | null; telefono: string | null; medida: string | null;
    local: string | null; visita: Date | null; total: string | number | null;
  }[]>`
    select cc.conversation_id, cc.extra_pct, cc.status, cc.issued_at,
           cc.redeemed_at, cc.redeemed_by, cc.valid_until,
           c.name as nombre, c.phone as telefono, c.tire_size as medida,
           c.nearest_store as local, c.visit_date as visita, q.total
    from confirmation_coupons cc
    join conversations c on c.id = cc.conversation_id
    left join lateral (
      select total from quotes
      where conversation_id = cc.conversation_id and cycle = cc.cycle
      order by created_at desc limit 1
    ) q on true
    where cc.code = ${codigo}
  `;
  if (!fila) {
    return { ok: false, motivo: "no_existe", detalle: `El código ${codigo} no fue emitido por el bot.` };
  }
  if (fila.status === "anulado") {
    return { ok: false, motivo: "anulado", detalle: `El código ${codigo} fue anulado.` };
  }
  if (fila.status === "canjeado") {
    const cuando = fila.redeemed_at?.toLocaleString("es-EC", { timeZone: "America/Guayaquil" }) ?? "antes";
    const quien = fila.redeemed_by ? ` por ${fila.redeemed_by}` : "";
    return { ok: false, motivo: "ya_canjeado", detalle: `El código ${codigo} ya se canjeó el ${cuando}${quien}.` };
  }
  // El ticket dice «válido hasta»: si caja lo honrara después, la fecha
  // impresa no valdría nada y el próximo cliente no tendría por qué apurarse.
  if (fila.valid_until && fila.valid_until.getTime() < Date.now()) {
    return {
      ok: false,
      motivo: "vencido",
      detalle: `El código ${codigo} venció el ${etiquetaVigencia(fila.valid_until)}.`,
    };
  }
  return {
    ok: true,
    cupon: {
      codigo,
      porcentaje: Number(fila.extra_pct),
      // bigint de Postgres llega como texto; el hub arma el link al chat con
      // esto y el tipo promete número.
      conversationId: Number(fila.conversation_id),
      cliente: fila.nombre,
      telefono: fila.telefono,
      medida: fila.medida,
      totalCotizado: fila.total == null ? null : Number(fila.total),
      local: fila.local,
      visita: fila.visita,
      emitidoEn: fila.issued_at,
    },
  };
}

export type ResultadoCanje =
  | { ok: true; cupon: CuponConsultado }
  | { ok: false; motivo: MotivoRechazo; detalle: string };

/**
 * Canjea un código en caja.
 *
 * Los motivos de rechazo van separados a propósito: en el mostrador, «ese
 * código no existe» y «ese código ya se usó» llevan a acciones distintas —
 * releer el papel en el primer caso, llamar al asesor en el segundo. Un
 * «inválido» genérico obliga al cajero a adivinar cuál de los dos es.
 */
export async function canjearCupon(
  entrada: string,
  canjeadoPor: string | null,
): Promise<ResultadoCanje> {
  const consulta = await consultarCupon(entrada);
  if (!consulta.ok) return consulta;

  // La condición sobre `status` hace de candado: si dos cajas canjean el mismo
  // código a la vez, solo una actualiza la fila y la otra se va por el camino
  // de «ya canjeado». Sin ella, el 2 % se aplicaría dos veces.
  const actualizadas = await sql`
    update confirmation_coupons
    set status = 'canjeado', redeemed_at = now(), redeemed_by = ${canjeadoPor}
    where code = ${consulta.cupon.codigo} and status = 'emitido'
  `;
  if (actualizadas.count === 0) {
    return {
      ok: false,
      motivo: "ya_canjeado",
      detalle: `El código ${consulta.cupon.codigo} acaba de canjearse en otra caja.`,
    };
  }
  return { ok: true, cupon: consulta.cupon };
}

export interface ResumenCupones {
  emitidos: number;
  canjeados: number;
  /** De cada 100 cupones emitidos, cuántos volvieron. Es la tasa de atribución. */
  tasaCanje: number;
  ultimos: Array<{
    codigo: string; estado: string; porcentaje: number;
    conversationId: number; emitidoEn: string; canjeadoEn: string | null; canjeadoPor: string | null;
  }>;
}

/** Lo que se ve en el panel: el pulso del programa y los últimos movimientos. */
export async function resumenCupones(dias = 30): Promise<ResumenCupones> {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const filas = await sql<{
    code: string; status: string; extra_pct: string | number; conversation_id: number;
    issued_at: Date; redeemed_at: Date | null; redeemed_by: string | null;
  }[]>`
    select code, status, extra_pct, conversation_id, issued_at, redeemed_at, redeemed_by
    from confirmation_coupons where issued_at >= ${desde}
    order by issued_at desc
  `;
  const canjeados = filas.filter((f) => f.status === "canjeado").length;
  return {
    emitidos: filas.length,
    canjeados,
    tasaCanje: filas.length ? Math.round((canjeados / filas.length) * 100) : 0,
    ultimos: filas.slice(0, 50).map((f) => ({
      codigo: f.code,
      estado: f.status,
      porcentaje: Number(f.extra_pct),
      conversationId: f.conversation_id,
      emitidoEn: f.issued_at.toISOString(),
      canjeadoEn: f.redeemed_at?.toISOString() ?? null,
      canjeadoPor: f.redeemed_by,
    })),
  };
}

/** La línea del cupón para los detalles de un aviso al asesor. */
export async function lineaCuponParaAviso(
  conversationId: number,
  cycle: number,
): Promise<string | null> {
  const cupon = await getCouponForConversation(conversationId, cycle).catch(() => null);
  return cupon ? etiquetaCupon({ codigo: cupon.codigo, porcentaje: cupon.porcentaje }) : null;
}

interface ItemCotizado {
  brand?: string;
  design?: string;
  sizeLabel?: string;
  quantity?: number;
}

/** «4 × FALKEN WILDPEAK A/T 4W 265/60R18» — sin SKU, que nunca va al cliente. */
function llantasDeLaCotizacion(items: unknown): string | null {
  const primera = Array.isArray(items) ? (items[0] as ItemCotizado | undefined) : undefined;
  if (!primera?.brand) return null;
  const nombre = [primera.brand, primera.design, primera.sizeLabel].filter(Boolean).join(" ");
  return primera.quantity ? `${primera.quantity} × ${nombre}` : nombre;
}

/**
 * Manda el ticket con QR del cupón que todavía no lo recibió. Es la ÚNICA
 * puerta por la que sale un cupón al cliente: el turno normal, la retomada
 * tras un asesor y el último seguimiento llaman aquí después de su propio
 * mensaje, así el ticket llega siempre DESPUÉS de «Listo, le esperamos el…» y
 * nunca dos veces.
 *
 * - `emitidoDesde`: los turnos solo mandan el cupón que se emitió EN ese turno.
 *   Si se emitió con el bot apagado (contestaba una persona), no se le aparece
 *   al cliente horas después en medio de otra conversación.
 * - La imagen se reclama ANTES de mandarla (`ticket_sent_at`), así dos puertas
 *   a la vez no duplican el ticket. Si el render o Meta fallan, el código sale
 *   igual como texto: lo que no puede pasar es emitir un cupón que el cliente
 *   nunca ve.
 *
 * Nunca lanza: un fallo aquí no puede tumbar el turno que ya respondió.
 */
export async function enviarTicketDeCupon(input: {
  conversationId: number;
  cycle: number;
  to: string;
  emitidoDesde?: Date;
  actor?: "bot" | "worker";
}): Promise<boolean> {
  try {
    const desde = input.emitidoDesde ?? new Date(0);
    const [cupon] = await sql<{
      id: number; code: string; extra_pct: string | number; motivo: string;
      valid_until: Date | null; items: unknown; total: string | number | null;
      nearest_store: string | null; visit_date: Date | null; visit_time_label: string | null;
    }[]>`
      update confirmation_coupons cc set ticket_sent_at = now()
      from conversations c
      left join lateral (
        select items, total from quotes
        where conversation_id = c.id and cycle = ${input.cycle}
        order by created_at desc limit 1
      ) q on true
      where cc.conversation_id = ${input.conversationId} and cc.cycle = ${input.cycle}
        and c.id = cc.conversation_id
        and cc.status = 'emitido' and cc.ticket_sent_at is null
        and cc.issued_at >= ${desde}
      returning cc.id, cc.code, cc.extra_pct, cc.motivo, cc.valid_until,
        q.items, q.total, c.nearest_store, c.visit_date, c.visit_time_label
    `;
    if (!cupon) return false;

    const porcentaje = Number(cupon.extra_pct);
    const motivo: MotivoCupon = cupon.motivo === "seguimiento" ? "seguimiento" : "visita";
    const ahorro = cupon.total == null ? null : ahorroDelCupon(Number(cupon.total), porcentaje);
    const leyenda = mensajeCupon({
      codigo: cupon.code, porcentaje, motivo, ahorro, validoHasta: cupon.valid_until,
    });
    const actor = input.actor ?? "bot";
    const metadata = { piece: "coupon", couponCode: cupon.code, motivo };

    try {
      const piezas = await getPiecesConfig();
      const png = await renderCouponTicket({
        codigo: cupon.code,
        porcentaje,
        motivo,
        ahorro,
        llantas: llantasDeLaCotizacion(cupon.items),
        local: cupon.nearest_store,
        visita: cupon.visit_date
          ? [etiquetaVigencia(cupon.visit_date), cupon.visit_time_label?.trim()].filter(Boolean).join(", ")
          : null,
        validoHasta: cupon.valid_until,
        paleta: piezas.paleta,
        fuente: piezas.fuente,
      });
      const filename = `Cupon-${cupon.code}.png`;
      const providerId = await sendImage(input.conversationId, input.to, png, leyenda, filename, actor);
      await appendMessage(input.conversationId, "assistant", leyenda, providerId, {
        type: "image", authorKind: "bot", status: "sent", metadata: { ...metadata, filename },
      });
    } catch (error) {
      console.error(`🎟️ El ticket ${cupon.code} no salió como imagen; va como texto:`, error);
      const providerId = await sendCustomerText(input.conversationId, input.to, leyenda, actor)
        .catch(() => undefined);
      await appendMessage(input.conversationId, "assistant", leyenda, providerId, {
        authorKind: "bot", status: providerId ? "sent" : "failed",
        metadata: { ...metadata, ticketError: error instanceof Error ? error.message : String(error) },
      });
      if (!providerId) {
        // Ni imagen ni texto: se suelta la marca para que la próxima puerta lo intente.
        await sql`update confirmation_coupons set ticket_sent_at = null where id = ${cupon.id}`;
        return false;
      }
    }
    console.log(`🎟️ Cupón ${cupon.code} (${motivo}) enviado a la conv ${input.conversationId}.`);
    return true;
  } catch (error) {
    console.warn("🎟️ Falló el envío del ticket del cupón:", error instanceof Error ? error.message : error);
    return false;
  }
}
