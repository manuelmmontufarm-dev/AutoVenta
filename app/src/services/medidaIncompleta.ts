/**
 * MEDIA MEDIDA EN PULGADAS → SE PREGUNTA EL ANCHO. SIN MODELO.
 *
 * Producción, 12-sep-2026 17:40 (conv 3): «¿Dispone llantas MT 30.5 r15?» →
 * «la opción que tengo es KENDA KR29 en medida 235/75R15». Esa tarde se frenó
 * la búsqueda por aro, y el simulador mostró por qué no alcanza: el modelo
 * cambió de herramienta —la búsqueda por medida en una corrida, la del catálogo
 * en otra— y en la primera el Guardián le agregó dos métricas del aro 15.
 *
 * Lo que tiene que pasar sí o sí no se le pide al modelo. Con diámetro y aro
 * pero sin ancho, la respuesta es fija: falta el ancho, y estas son las medidas
 * en pulgadas que sí hay en ese aro.
 */
import { config } from "../config.js";
import { ensureCatalogReady, searchByRim } from "./catalog.js";
import { medidasEnPulgadasCercanas } from "../domain/catalog.js";
import { flotacionIncompleta } from "../domain/tireSize.js";
import { logFunnelEvent } from "./conversations.js";

function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/** Puro: la respuesta, con las medidas en pulgadas que hay en ese aro. */
export function preguntaDelAncho(
  incompleta: { diameter: number; rim: number },
  enPulgadas: readonly string[],
): string {
  const lista = enPulgadas.length
    ? ` En aro ${incompleta.rim} tengo en pulgadas ${enumerar(enPulgadas.map((m) => `*${m}*`))}.`
    : "";
  return `Para *${incompleta.diameter} R${incompleta.rim}* me falta el ancho, la cifra del medio `
    + `(${incompleta.diameter}x__R${incompleta.rim}).${lista}`
    + "\n---\n¿Qué ancho dice en el costado de su llanta?";
}

export async function tryMedidaIncompleta(
  ctx: { conversation: { id: number } },
  texto: string,
): Promise<string | null> {
  if (!config.openai.directSalesRoutesEnabled) return null;
  const incompleta = flotacionIncompleta(texto);
  if (!incompleta) return null;
  await ensureCatalogReady();
  const enPulgadas = medidasEnPulgadasCercanas(searchByRim(incompleta.rim), incompleta.diameter);
  console.log(`📏 Media medida en pulgadas en la conv ${ctx.conversation.id} (${incompleta.diameter} R${incompleta.rim}): se pregunta el ancho.`);
  await logFunnelEvent(ctx.conversation.id, "respuesta_directa", { route: "medida_incompleta" }).catch(() => undefined);
  return preguntaDelAncho(incompleta, enPulgadas);
}
