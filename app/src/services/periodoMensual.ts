import { sql } from "../db/client.js";

export interface PeriodoMensual {
  /** Instante del día 1 a las 00:00 de Guayaquil. */
  desde: Date;
  /** Instante del día 1 del mes siguiente: el corte de arriba, exclusivo. */
  hasta: Date;
}

/**
 * El mes que el panel está mirando.
 *
 * El dashboard arranca de cero cada mes: los contadores que se acumulan
 * (cotizaciones, llegadas al final, piezas, seguimientos, descuentos) cuentan
 * solo desde el día 1. Nada se borra — la base guarda todo el histórico igual;
 * lo que cambia es hasta dónde mira la lectura.
 *
 * El corte se calcula en hora de Guayaquil, no en UTC: el servidor corre en UTC
 * y el mes cambiaría a las 19:00 del último día, así que las cinco últimas horas
 * del mes se contarían en el siguiente y el negocio vería el panel reiniciarse
 * la tarde anterior.
 *
 * Es una sola consulta y devuelve `Date`s para que cada métrica reciba el mismo
 * corte como parámetro: dos métricas de la misma pantalla nunca pueden quedar
 * en meses distintos por haberse calculado con medio segundo de diferencia.
 */
export async function periodoMensualEnCurso(): Promise<PeriodoMensual> {
  const [fila] = await sql<{ desde: Date; hasta: Date }[]>`
    select
      (date_trunc('month', now() at time zone 'America/Guayaquil')
        at time zone 'America/Guayaquil') as desde,
      ((date_trunc('month', now() at time zone 'America/Guayaquil') + interval '1 month')
        at time zone 'America/Guayaquil') as hasta
  `;
  return { desde: fila.desde, hasta: fila.hasta };
}
