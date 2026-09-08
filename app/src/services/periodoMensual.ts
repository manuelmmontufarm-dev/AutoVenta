import { sql } from "../db/client.js";

/** Clave del período que significa "sin recorte": todo el histórico. */
export const TODOS = "todos";

export interface PeriodoMensual {
  /** "YYYY-MM", o `todos`. */
  clave: string;
  /** Instante del día 1 a las 00:00 de Guayaquil (o el principio de todo). */
  desde: Date;
  /** Día 1 del mes siguiente: el corte de arriba, exclusivo (o el fin de todo). */
  hasta: Date;
  /** true cuando no hay recorte: la lectura abarca el histórico completo. */
  todos: boolean;
}

/** Un mes con datos, para el selector del panel. */
export interface MesConDatos {
  /** "YYYY-MM". */
  clave: string;
  /** Conversaciones que empezaron ese mes. */
  conversaciones: number;
}

const FORMATO_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Qué mes está mirando el panel.
 *
 * El dashboard arranca de cero cada mes: los contadores que se acumulan cuentan
 * solo desde el día 1. Nada se borra — la base guarda todo el histórico igual;
 * lo que cambia es hasta dónde mira la lectura, y con `mes` el usuario puede
 * mover esa ventana a un mes anterior o quitarla del todo (`todos`).
 *
 * El corte se calcula en hora de Guayaquil, no en UTC: el servidor corre en UTC
 * y el mes cambiaría a las 19:00 del último día, así que las cinco últimas horas
 * del mes se contarían en el siguiente y el negocio vería el panel reiniciarse
 * la tarde anterior.
 *
 * Devuelve `Date`s para que cada métrica reciba el mismo corte como parámetro:
 * dos números de la misma pantalla nunca pueden quedar en meses distintos por
 * haberse calculado con medio segundo de diferencia. `todos` no es un caso
 * aparte en las consultas — son los mismos dos bordes, abiertos de par en par,
 * así que ninguna query necesita una rama para el histórico completo.
 */
export async function resolverPeriodo(mes?: string | null): Promise<PeriodoMensual> {
  const pedido = (mes ?? "").trim().toLowerCase();

  if (pedido === TODOS) {
    return {
      clave: TODOS,
      desde: new Date("1970-01-01T00:00:00.000Z"),
      hasta: new Date("9999-12-31T00:00:00.000Z"),
      todos: true,
    };
  }

  // Un mes ilegible cae al mes en curso: la pantalla siempre tiene que pintar
  // algo, y lo más parecido a lo que el usuario quería es "ahora".
  const clave = FORMATO_MES.test(pedido) ? pedido : null;

  const [fila] = await sql<{ clave: string; desde: Date; hasta: Date }[]>`
    with inicio as (
      select case
        when ${clave}::text is null
          then date_trunc('month', now() at time zone 'America/Guayaquil')
        else (${clave}::text || '-01')::date::timestamp
      end as dia1
    )
    select
      to_char(dia1, 'YYYY-MM') as clave,
      (dia1 at time zone 'America/Guayaquil') as desde,
      ((dia1 + interval '1 month') at time zone 'America/Guayaquil') as hasta
    from inicio
  `;
  return { clave: fila.clave, desde: fila.desde, hasta: fila.hasta, todos: false };
}

/** El mes en curso, sin preguntar: el que ve quien abre el panel. */
export function periodoMensualEnCurso(): Promise<PeriodoMensual> {
  return resolverPeriodo(null);
}

/**
 * Los meses que tienen algo que mostrar, del más nuevo al más viejo.
 *
 * Se listan por conversaciones nacidas en el mes, en hora de Guayaquil. El mes
 * en curso va siempre, aunque todavía esté vacío: el selector no puede abrirse
 * sin la opción que está seleccionada.
 */
export async function mesesConDatos(): Promise<MesConDatos[]> {
  const filas = await sql<{ clave: string; conversaciones: number }[]>`
    select
      to_char(date_trunc('month', created_at at time zone 'America/Guayaquil'), 'YYYY-MM') as clave,
      count(*)::int as conversaciones
    from conversations
    group by 1
    order by 1 desc
  `;
  const actual = (await periodoMensualEnCurso()).clave;
  if (!filas.some((fila) => fila.clave === actual)) {
    filas.unshift({ clave: actual, conversaciones: 0 });
  }
  return filas.map((fila) => ({
    clave: fila.clave,
    conversaciones: Number(fila.conversaciones),
  }));
}
