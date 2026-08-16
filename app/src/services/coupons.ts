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
  etiquetaCupon,
  generarCodigoCupon,
  normalizarCodigoCupon,
} from "../domain/coupons.js";
import { getCouponConfig } from "./settings.js";

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
}): Promise<CuponEmitido | null> {
  try {
    const cfg = await getCouponConfig();
    if (!cfg.activo) return null;

    // La cotización vigente del ciclo, para dejar atado qué se cotizó. Puede no
    // haber ninguna (el cliente prometió visita antes de cotizar) y el cupón
    // vale igual: lo que identifica la venta es la conversación.
    const [cotizacion] = await sql<{ id: number; quote_number: string | null }[]>`
      select id, quote_number from quotes
      where conversation_id = ${input.conversationId} and cycle = ${input.cycle}
      order by created_at desc limit 1
    `;
    const numeroCotizacion = cotizacion?.quote_number ?? null;

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
          insert into confirmation_coupons (code, conversation_id, cycle, quote_id, extra_pct)
          values (${codigo}, ${input.conversationId}, ${input.cycle}, ${cotizacion?.id ?? null}, ${cfg.porcentaje})
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

export type ResultadoCanje =
  | { ok: true; codigo: string; porcentaje: number; conversationId: number }
  | { ok: false; motivo: "formato" | "no_existe" | "ya_canjeado" | "anulado"; detalle: string };

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
  const codigo = normalizarCodigoCupon(entrada);
  if (!codigo) {
    return {
      ok: false,
      motivo: "formato",
      detalle: "Ese código no tiene la forma de un cupón de Depot (ejemplo: DT-PUMA47). Reléalo con el cliente.",
    };
  }

  const [fila] = await sql<{
    id: number; conversation_id: number; extra_pct: string | number;
    status: string; redeemed_at: Date | null; redeemed_by: string | null;
  }[]>`
    select id, conversation_id, extra_pct, status, redeemed_at, redeemed_by
    from confirmation_coupons where code = ${codigo}
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

  // La condición sobre `status` hace de candado: si dos cajas canjean el mismo
  // código a la vez, solo una actualiza la fila y la otra se va por el camino
  // de «ya canjeado». Sin ella, el 2 % se aplicaría dos veces.
  const actualizadas = await sql`
    update confirmation_coupons
    set status = 'canjeado', redeemed_at = now(), redeemed_by = ${canjeadoPor}
    where id = ${fila.id} and status = 'emitido'
  `;
  if (actualizadas.count === 0) {
    return { ok: false, motivo: "ya_canjeado", detalle: `El código ${codigo} acaba de canjearse en otra caja.` };
  }
  return {
    ok: true,
    codigo,
    porcentaje: Number(fila.extra_pct),
    conversationId: fila.conversation_id,
  };
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
