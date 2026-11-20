/**
 * Ruta directa: «NO GRACIAS» A SECAS DESPUÉS DE UNA LÁMINA O UNA COTIZACIÓN
 * (Manuel, 20-nov, tras el PR #65).
 *
 * «No gracias» no es venta perdida: es «no quiero esa» o «quiero otra opción».
 * Hasta hoy el bot contestaba la despedida fija («Entendido, gracias por
 * avisar. Quedamos a las órdenes…») y ahí terminaba la venta (simulador
 * Competimotor, CM28: lámina con Townhall y Kenda en 215/65R16, «no gracias»,
 * despedida). Con `politica.noGraciasPideOtraOpcion`:
 *  · con la lámina por marca en pantalla, sale la lámina con las de la medida
 *    que no vio (la misma ruta de «qué más tiene»): nunca repite la misma;
 *  · si ya las vio todas, o hubo cotización sin lámina, pregunta qué busca.
 * Una sola vez por ciclo: el segundo «no gracias» se despide como siempre, sin
 * insistir. Sin lámina ni cotización en el ciclo tampoco entra.
 *
 * El desistimiento explícito («no gracias ya no», «ya no», «ya compré») no es
 * «no gracias» a secas (`esNoGraciasASecas`) y se despide como hoy.
 * Depot: interruptor apagado, despedida aprobada de siempre.
 */
import { sql } from "../db/client.js";
import { politica } from "../negocio/politica.js";
import { esNoGraciasASecas } from "../domain/cierreTurno.js";
import { logFunnelEvent } from "./conversations.js";
import { laminaConLasQueNoVio, type MasOpcionesContext } from "./masOpcionesPorMarca.js";

/** Lo que la herramienta lee en lugar del «no gracias»: un pedido de más (`pideMasOpciones`). */
const PEDIDO_DE_OTRAS_OPCIONES = "¿qué otras opciones tiene?";

export const PREGUNTA_TRAS_NO_GRACIAS =
  "Entendido 👍 ¿Qué busca: algo más económico, otra marca u otro tipo de llanta? Así le muestro la opción que mejor le sirva.";

const RUTA = "otra_opcion_tras_no_gracias";

export async function tryOtraOpcionTrasNoGracias(ctx: MasOpcionesContext, text: string): Promise<string | null> {
  if (!politica.noGraciasPideOtraOpcion || !esNoGraciasASecas(text)) return null;
  const { id, current_cycle: ciclo } = ctx.conversation;
  const [estado] = await sql<{ lamina: boolean; cotizacion: boolean; ya_ofrecida: boolean }[]>`
    select
      exists(select 1 from messages where conversation_id=${id} and cycle=${ciclo}
        and metadata->>'piece'='options' and coalesce(status, 'sent') <> 'failed') as lamina,
      exists(select 1 from quotes where conversation_id=${id} and cycle=${ciclo}) as cotizacion,
      exists(select 1 from funnel_events where conversation_id=${id} and cycle=${ciclo}
        and type='respuesta_directa' and data->>'route'=${RUTA}) as ya_ofrecida
  `;
  if (!estado || (!estado.lamina && !estado.cotizacion) || estado.ya_ofrecida) return null;
  const lamina = estado.lamina ? await laminaConLasQueNoVio(ctx, PEDIDO_DE_OTRAS_OPCIONES) : null;
  console.log(`🔁 «No gracias» a secas en la conv ${id}: ${lamina ? "lámina con las que no vio" : "pregunta qué busca"}.`);
  await logFunnelEvent(id, "respuesta_directa", { route: RUTA, con: lamina ? "lamina" : "pregunta" }).catch(() => undefined);
  return lamina ?? PREGUNTA_TRAS_NO_GRACIAS;
}
