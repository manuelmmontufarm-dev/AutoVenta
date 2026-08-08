/**
 * ¿Estamos recibiendo copia de lo que un asesor escribe desde su WhatsApp?
 *
 * De dónde sale esto: ticket 1848 del 7-ago-2026. El bot estaba apagado, el
 * cliente escribió cinco mensajes —uno de ellos «221 cada una ?», así que
 * alguien le había dado un precio— y en el panel la conversación se veía como
 * un monólogo del cliente. Sin respuestas nuestras, sin monto, sin explicación.
 *
 * El código para guardar esas respuestas ya existe (`wa/echoes.ts`), pero
 * depende de dos cosas que viven fuera: la casilla `message_echoes` en Meta y
 * el app secret con el que se valida la firma. Si cualquiera de las dos falta,
 * los ecos se caían con un `console.error` que nadie lee, y desde el panel eso
 * era indistinguible de "no pasó nada".
 *
 * Esto lo vuelve un dato: cuántos ecos entraron, cuántos se descartaron y por
 * qué. `channelDiagnostics` comprueba la CONFIGURACIÓN en Meta; esto registra
 * la REALIDAD de lo que llega al webhook, que es lo que de verdad decide si el
 * panel muestra la conversación completa.
 */
import { sql } from "../db/client.js";

const KEY = "echo_health";

export type MotivoDescarte = "sin_app_secret" | "firma_invalida";

export interface EchoHealth {
  /** Respuestas de asesor guardadas desde WhatsApp. */
  guardados: number;
  ultimoGuardadoEn: string | null;
  /** Ecos que llegaron al webhook y se tiraron sin guardar. */
  descartados: number;
  ultimoDescarteEn: string | null;
  ultimoDescarteMotivo: MotivoDescarte | null;
}

const VACIO: EchoHealth = {
  guardados: 0,
  ultimoGuardadoEn: null,
  descartados: 0,
  ultimoDescarteEn: null,
  ultimoDescarteMotivo: null,
};

/**
 * Suma sobre el contador que ya está en la base, en una sola sentencia: dos
 * ecos del mismo lote no pueden pisarse el conteo.
 */
async function sumar(campo: "guardados" | "descartados", extra: Record<string, unknown>) {
  const inicial = { ...VACIO, [campo]: 1, ...extra };
  await sql`
    insert into settings (key, value)
    values (${KEY}, ${sql.json(inicial as never)})
    on conflict (key) do update set
      value = settings.value || ${sql.json(extra as never)}::jsonb || jsonb_build_object(
        -- El ::text no es decorativo: jsonb_build_object es variádica "any" y
        -- sin el cast Postgres no puede deducir el tipo del parámetro.
        ${campo}::text, coalesce((settings.value ->> ${campo}::text)::int, 0) + 1
      ),
      updated_at = now()
  `;
}

export async function registrarEcoGuardado(): Promise<void> {
  await sumar("guardados", { ultimoGuardadoEn: new Date().toISOString() });
}

export async function registrarEcoDescartado(motivo: MotivoDescarte): Promise<void> {
  await sumar("descartados", {
    ultimoDescarteEn: new Date().toISOString(),
    ultimoDescarteMotivo: motivo,
  });
}

export async function getEchoHealth(): Promise<EchoHealth> {
  const [row] = await sql<{ value: Partial<EchoHealth> }[]>`
    select value from settings where key = ${KEY}
  `;
  // Los guardados NO salen del contador: el contador nació con este código y un
  // panel recién actualizado diría "Meta nunca nos mandó un eco" en un negocio
  // donde sí llegaban. Los mensajes con origen 'echo' son la prueba retroactiva
  // —y la única que existe— de que el canal de ecos funciona.
  const [ecos] = await sql<{ total: number; ultimo: Date | null }[]>`
    select count(*)::int as total, max(created_at) as ultimo
    from messages where metadata->>'origen' = 'echo'
  `;
  return {
    ...VACIO,
    ...(row?.value ?? {}),
    guardados: Number(ecos?.total ?? 0),
    ultimoGuardadoEn: ecos?.ultimo?.toISOString() ?? null,
  };
}
