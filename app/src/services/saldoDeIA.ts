/**
 * SALDO DE OPENAI: AVISAR ANTES DE QUE SE ACABE (24-nov-2026).
 *
 * Manuel: «también un aviso si baja de 3 dólares los tokens».
 *
 * LO QUE SE PUEDE LEER Y LO QUE NO (probado el 24-nov contra la API real):
 *
 *  · El SALDO que queda NO se puede leer por API. Ni con la clave del bot ni
 *    con la de administrador: `/v1/dashboard/billing/credit_grants` contesta
 *    403 a las dos (solo responde a la sesión del navegador).
 *  · La clave del bot (`sk-proj-…`) tampoco puede leer el GASTO: 403 en
 *    `/v1/organization/costs`.
 *  · La clave de ADMINISTRADOR (`sk-admin-…`, variable `OPENAI_ADMIN_KEY`) sí
 *    lee el gasto de toda la organización, por día.
 *
 * Así que el saldo no se inventa: soporte ANOTA lo que ve en la página de
 * OpenAI (al recargar) y desde ese momento se le resta lo gastado:
 *
 *  · con `OPENAI_ADMIN_KEY`: lo que OpenAI dice que gastó la ORGANIZACIÓN
 *    ENTERA. Es la cuenta buena, porque el crédito es uno solo y hoy lo gastan
 *    Depot, Competimotor y el simulador con claves del mismo proyecto. El dato
 *    de OpenAI llega con unos minutos de atraso.
 *  · sin ella: lo que registró ESTE bot en `ai_runs`, a la tarifa de la factura
 *    mensual. Es una ESTIMACIÓN y se marca así: no ve lo que gastan los otros
 *    servicios ni el simulador, así que el saldo real puede ser menor.
 *
 * UNA VEZ POR CRUCE. El aviso es un incidente `saldo_bajo`: se abre al bajar
 * del umbral (y avisa), y no se vuelve a abrir mientras siga abierto. Se cierra
 * en silencio cuando soporte anota un saldo nuevo por encima del umbral.
 *
 * Sin saldo anotado no hay aviso: no se sabe cuánto queda, y decir un número
 * sería inventarlo. El otro aviso (`avisosASoporte.ts`) cubre el caso de todos
 * modos: si el crédito se acaba, el primer turno que falle avisa con la causa.
 */
import { z } from "zod";
import { config } from "../config.js";
import { sql } from "../db/client.js";
import { textoDeSaldoBajo } from "../domain/falloDelBot.js";
import { negocio } from "../negocio/index.js";
import { avisarASoporte } from "./avisosASoporte.js";
import { costoDeTokens } from "./billing.js";

export const UMBRAL_POR_DEFECTO_USD = 3;

/** `openai` = gasto de la organización leído de OpenAI; `bot` = estimado con lo que registró este bot. */
export type FuenteDelGasto = "openai" | "bot";

export interface SaldoAnotado {
  saldoUsd: number;
  umbralUsd: number;
  anotadoAt: Date;
  anotadoPor: string | null;
  /** Lo que OpenAI ya contaba gastado ese día (UTC) al anotar; null sin clave de administrador. */
  costoDelDiaAlAnotar: number | null;
}

export interface EstadoDelSaldo {
  anotado: SaldoAnotado;
  gastadoUsd: number;
  restanteUsd: number;
  fuente: FuenteDelGasto;
  /** true cuando el gasto es una estimación (fuente `bot`). */
  aproximado: boolean;
  bajo: boolean;
}

const EntradaSchema = z.object({
  saldoUsd: z.coerce.number().min(0, "El saldo no puede ser negativo").max(100_000),
  umbralUsd: z.coerce.number().min(0).max(10_000).default(UMBRAL_POR_DEFECTO_USD),
});

const centavos = (n: number): number => Math.round(n * 100) / 100;

/** Medianoche UTC del día de `fecha`, en segundos: los días de OpenAI son UTC. */
const inicioDelDiaUtc = (fecha: Date): number =>
  Math.floor(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()) / 1000);

// ── Lo que gastó la organización, según OpenAI ───────────────────────────────

/** Total en USD de los días (UTC) desde `desdeUnix`. Lanza si OpenAI no contesta. */
async function costoDeOpenAIDesde(desdeUnix: number): Promise<number> {
  let total = 0;
  let pagina: string | null = null;
  // 180 días por página; con una recarga al mes nunca hay segunda página, pero
  // el tope evita un bucle si la API cambiara.
  for (let i = 0; i < 6; i += 1) {
    const url = new URL("https://api.openai.com/v1/organization/costs");
    url.searchParams.set("start_time", String(desdeUnix));
    url.searchParams.set("bucket_width", "1d");
    url.searchParams.set("limit", "180");
    if (pagina) url.searchParams.set("page", pagina);
    const respuesta = await fetch(url, {
      headers: { Authorization: `Bearer ${config.openai.adminKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!respuesta.ok) throw new Error(`OpenAI contestó ${respuesta.status} al pedir los costos`);
    const cuerpo = (await respuesta.json()) as {
      data?: { results?: { amount?: { value?: number | string } }[] }[];
      has_more?: boolean;
      next_page?: string | null;
    };
    for (const dia of cuerpo.data ?? []) {
      for (const r of dia.results ?? []) total += Number(r.amount?.value ?? 0) || 0;
    }
    if (!cuerpo.has_more || !cuerpo.next_page) break;
    pagina = cuerpo.next_page;
  }
  return total;
}

/** Para pruebas: en vez de salir a OpenAI, el costo sale de esta función. */
let lectorDeCostos: ((desdeUnix: number) => Promise<number>) | null = null;
export function _usarLectorDeCostos(fn: typeof lectorDeCostos): void {
  lectorDeCostos = fn;
}

const hayLecturaDeOpenAI = (): boolean => Boolean(lectorDeCostos || config.openai.adminKey);
const leerCostos = (desdeUnix: number): Promise<number> =>
  (lectorDeCostos ?? costoDeOpenAIDesde)(desdeUnix);

/**
 * Lo que registró este bot desde `desde`, a la tarifa de la factura mensual.
 * Solo modelos de OpenAI: este saldo es el de la cuenta de OpenAI, y lo que
 * atiende Claude se paga en otra cuenta (Anthropic).
 */
async function costoRegistradoPorElBot(desde: Date): Promise<number> {
  const filas = await sql<{ model: string; inp: string | null; cached: string | null; outp: string | null }[]>`
    select model, sum(input_tokens) as inp, sum(cached_input_tokens) as cached, sum(output_tokens) as outp
    from ai_runs where created_at >= ${desde} and model not like 'claude-%' group by model
  `;
  return filas.reduce(
    (total, f) => total + costoDeTokens(f.model, Number(f.inp ?? 0), Number(f.cached ?? 0), Number(f.outp ?? 0)),
    0,
  );
}

// ── El saldo anotado ─────────────────────────────────────────────────────────

export async function leerSaldoAnotado(): Promise<SaldoAnotado | null> {
  const [fila] = await sql<{
    saldo_usd: string; umbral_usd: string; anotado_at: Date; anotado_por: string | null;
    costo_del_dia_al_anotar: string | null;
  }[]>`
    select saldo_usd, umbral_usd, anotado_at, anotado_por, costo_del_dia_al_anotar from saldo_de_ia where id = 1
  `;
  if (!fila) return null;
  return {
    saldoUsd: Number(fila.saldo_usd),
    umbralUsd: Number(fila.umbral_usd),
    anotadoAt: fila.anotado_at,
    anotadoPor: fila.anotado_por,
    costoDelDiaAlAnotar: fila.costo_del_dia_al_anotar === null ? null : Number(fila.costo_del_dia_al_anotar),
  };
}

/**
 * Soporte anota el saldo que ve en OpenAI en este momento (normalmente al
 * recargar). Con clave de administrador se guarda además cuánto llevaba gastado
 * el día: OpenAI entrega el gasto por DÍA entero, y sin esa foto lo gastado
 * antes de anotar se restaría dos veces.
 *
 * Deja el aviso listo para el próximo cruce: cierra el incidente `saldo_bajo`.
 */
export async function anotarSaldo(input: unknown, quien: string | null, ahora = new Date()): Promise<EstadoDelSaldo> {
  const { saldoUsd, umbralUsd } = EntradaSchema.parse(input ?? {});
  let costoDelDia: number | null = null;
  if (hayLecturaDeOpenAI()) {
    try {
      costoDelDia = await leerCostos(inicioDelDiaUtc(ahora));
    } catch (error) {
      throw new Error(
        "No pude leer el gasto de hoy en OpenAI, así que no guardé el saldo (quedaría mal calculado). "
          + `Intenta de nuevo en un minuto. (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }
  await sql`
    insert into saldo_de_ia (id, saldo_usd, umbral_usd, anotado_at, anotado_por, costo_del_dia_al_anotar, updated_at)
    values (1, ${saldoUsd}, ${umbralUsd}, ${ahora}, ${quien}, ${costoDelDia}, ${ahora})
    on conflict (id) do update set
      saldo_usd = excluded.saldo_usd, umbral_usd = excluded.umbral_usd, anotado_at = excluded.anotado_at,
      anotado_por = excluded.anotado_por, costo_del_dia_al_anotar = excluded.costo_del_dia_al_anotar,
      updated_at = excluded.updated_at
  `;
  await sql`
    update incidentes_del_bot set estado = 'cerrado', cerrado_at = ${ahora}
    where tipo = 'saldo_bajo' and estado = 'abierto'
  `;
  const estado = await estadoDelSaldo();
  if (!estado) throw new Error("El saldo no quedó guardado");
  return estado;
}

/** Cuánto queda, con la mejor fuente disponible. null = nadie anotó un saldo todavía. */
export async function estadoDelSaldo(): Promise<EstadoDelSaldo | null> {
  const anotado = await leerSaldoAnotado();
  if (!anotado) return null;
  // Se anotó con la foto del día → se resta con la misma fuente. Si la clave de
  // administrador se quitó después, o se anotó sin ella, se estima con el bot.
  const conOpenAI = hayLecturaDeOpenAI() && anotado.costoDelDiaAlAnotar !== null;
  const gastado = conOpenAI
    ? Math.max(0, (await leerCostos(inicioDelDiaUtc(anotado.anotadoAt))) - (anotado.costoDelDiaAlAnotar ?? 0))
    : await costoRegistradoPorElBot(anotado.anotadoAt);
  const restante = anotado.saldoUsd - gastado;
  return {
    anotado,
    gastadoUsd: centavos(gastado),
    restanteUsd: centavos(restante),
    fuente: conOpenAI ? "openai" : "bot",
    aproximado: !conOpenAI,
    bajo: restante < anotado.umbralUsd,
  };
}

export type ResultadoDeLaRevision = "sin_anotar" | "ok" | "avisado" | "ya_avisado" | "sin_dato";

/**
 * La revisión periódica. Avisa UNA vez al cruzar el umbral hacia abajo.
 * Si no se puede saber el saldo (OpenAI no contesta), no avisa: se reintenta
 * en la próxima vuelta. Nunca lanza.
 */
export async function revisarSaldo(ahora = new Date()): Promise<ResultadoDeLaRevision> {
  try {
    const estado = await estadoDelSaldo();
    if (!estado) return "sin_anotar";
    if (!estado.bajo) {
      // Volvió a estar por encima (se subió el saldo o se bajó el umbral): el
      // aviso queda listo para el próximo cruce.
      await sql`
        update incidentes_del_bot set estado = 'cerrado', cerrado_at = ${ahora}
        where tipo = 'saldo_bajo' and estado = 'abierto'
      `;
      return "ok";
    }
    // El incidente abierto es la memoria de «ya avisé este cruce»; el índice
    // único hace que de dos revisiones a la vez solo una lo abra.
    const abierto = await sql<{ id: number }[]>`
      insert into incidentes_del_bot (tipo, causa, detalle, abierto_at, ultimo_fallo_at, ultimo_aviso_at)
      values (
        'saldo_bajo', 'saldo_bajo',
        ${`Quedan $${estado.restanteUsd.toFixed(2)} (umbral $${estado.anotado.umbralUsd.toFixed(2)}, fuente ${estado.fuente})`},
        ${ahora}, ${ahora}, ${ahora}
      )
      on conflict (tipo, causa) where estado = 'abierto' do nothing
      returning id
    `;
    if (!abierto.length) return "ya_avisado";
    await avisarASoporte({
      clase: "saldo_bajo",
      texto: textoDeSaldoBajo({
        cliente: negocio.nombre, restanteUsd: estado.restanteUsd,
        umbralUsd: estado.anotado.umbralUsd, aproximado: estado.aproximado,
      }),
      incidenteId: Number(abierto[0].id),
    });
    return "avisado";
  } catch (error) {
    console.warn("⚠️ No se pudo revisar el saldo de OpenAI:", error instanceof Error ? error.message : error);
    return "sin_dato";
  }
}

/** Cada cuánto se revisa. El dato de OpenAI se actualiza con minutos de atraso: más seguido no ve nada nuevo. */
const REVISION_MS = 5 * 60 * 1000;

/** Arranca la revisión periódica. Se llama una vez, al levantar el servicio. */
export function iniciarVigilanciaDelSaldo(): void {
  const vuelta = (): void => {
    void revisarSaldo().then((resultado) => {
      if (resultado === "avisado") console.log("🟠 Saldo de OpenAI bajo: aviso enviado a soporte");
    });
  };
  setTimeout(vuelta, 45_000).unref();
  setInterval(vuelta, REVISION_MS).unref();
}
