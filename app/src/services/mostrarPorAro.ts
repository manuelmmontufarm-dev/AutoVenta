/**
 * EL ARO ALCANZA PARA MOSTRAR — Y SE MUESTRA DESDE AQUÍ, SIN MODELO.
 *
 * Conv 3 de Manuel, 8-sep-2026, 14:48 Quito: «Una llanta ron 15». El turno
 * fue una sola llamada, `guia_medida`, y salió la guía con el pie «usted ya
 * nos dijo aro 15: con eso cotizamos» seguida del texto «confírmeme la
 * medida completa». Ni una llanta en pantalla. El playbook ya decía «el aro
 * solo alcanza para mostrar opciones» y el agente tiene una vuelta forzada
 * para obligar la búsqueda — pero las dos dependen de que el detector lea el
 * aro y de que el modelo haga caso. Igual que `cotizarLoElegido` y
 * `recotizar`: lo que tiene que pasar sí o sí, pasa acá con las MISMAS
 * herramientas del agente (`buscar_por_aro_y_tipo` + `preparar_opciones`),
 * para que los candados de tipo, de anchos rechazados y de aro sigan siendo
 * los mismos.
 *
 * Cuándo corre: el cliente acaba de dar un aro (o contestó el número a «¿qué
 * aro?»), no escribió una medida completa, la ficha no tiene una medida
 * confirmada de ese aro, y en este ciclo todavía no salió ninguna lámina.
 * Si la búsqueda no encuentra nada o la herramienta se niega, sigue el
 * agente, que sabe explicar por qué.
 */
import { sql } from "../db/client.js";
import { buildTools, type AgentContext } from "../agent/tools.js";
import { aroRespondido, medidaConfirmadaPorCliente } from "../domain/medidaConfirmada.js";
import { tipoSolicitadoEn } from "../domain/opcionesCandados.js";
import { logFunnelEvent } from "./conversations.js";

export interface MostrarPorAroContext {
  conversation: AgentContext["conversation"];
  customerPhone: string;
  customerName?: string;
  previousOutbound: string | null;
}

interface OpcionDeBusqueda { code?: string; codigo?: string }

/** Puro: ¿este mensaje es «solo el aro»? Devuelve el aro o null. */
export function aroParaMostrar(texto: string, previousOutbound: string | null): number | null {
  return aroRespondido(texto, previousOutbound);
}

export async function tryMostrarPorAro(ctx: MostrarPorAroContext, texto: string): Promise<string | null> {
  const aro = aroParaMostrar(texto, ctx.previousOutbound);
  if (aro === null) return null;
  const [estado] = await sql<{ tire_size: string | null; has_options: boolean; entrantes: string[] }[]>`
    select c.tire_size,
      exists(select 1 from messages m where m.conversation_id=c.id and m.cycle=c.current_cycle and m.metadata->>'piece'='options') as has_options,
      coalesce((select array_agg(m.content order by m.created_at) from messages m
        where m.conversation_id=c.id and m.cycle=c.current_cycle and m.direction='inbound'), '{}') as entrantes
    from conversations c where c.id=${ctx.conversation.id}
  `;
  if (!estado || estado.has_options) return null;
  // Con una medida confirmada por el cliente de ESTE aro, manda la medida y
  // la muestra el camino normal (buscar_llanta), no esta ruta.
  const medidaDeEsteAro = estado.tire_size && new RegExp(`R${aro}\\b`, "i").test(estado.tire_size)
    && medidaConfirmadaPorCliente(estado.tire_size, [...estado.entrantes, texto]);
  if (medidaDeEsteAro) return null;

  const tools = buildTools({
    conversation: ctx.conversation,
    customerPhone: ctx.customerPhone,
    customerName: ctx.customerName,
    currentUserText: texto,
  });
  const buscar = tools.find((t) => t.function.name === "buscar_por_aro_y_tipo");
  const preparar = tools.find((t) => t.function.name === "preparar_opciones");
  if (!buscar || !preparar) return null;
  const tipo = tipoSolicitadoEn([texto]);
  let encontrado: { encontrado?: boolean; opciones?: OpcionDeBusqueda[] };
  try {
    encontrado = JSON.parse(await buscar.execute({ aro, tipo, uso: null }));
  } catch (error) {
    console.error("❌ Mostrar por aro falló al buscar; sigue el agente:", error);
    return null;
  }
  const codes = (encontrado.opciones ?? []).map((o) => String(o.code ?? o.codigo ?? "")).filter(Boolean);
  if (!encontrado.encontrado || !codes.length) return null;
  // La recomendada por defecto es la del medio de la escalera (equilibrio);
  // solo se entrega si el cliente la pide, y el motivo es el criterio real.
  const recomendado = codes[Math.min(1, codes.length - 1)];
  let salida: { mensaje_para_enviar?: string; error?: string };
  try {
    salida = JSON.parse(await preparar.execute({
      codes,
      nombre_cliente: ctx.customerName ?? "Cliente",
      recomendado,
      motivo: "Equilibra precio y rendimiento para el uso diario",
      cantidad: null,
    }));
  } catch (error) {
    console.error("❌ Mostrar por aro falló al preparar opciones; sigue el agente:", error);
    return null;
  }
  if (salida.error || !salida.mensaje_para_enviar) {
    console.log(`↩️ Mostrar por aro ${aro} no pudo mandar la lámina en la conv ${ctx.conversation.id} (${salida.error?.slice(0, 120)}); sigue el agente.`);
    return null;
  }
  console.log(`🛞 Opciones por aro ${aro} desde la ruta directa en la conv ${ctx.conversation.id}: ${codes.join(", ")}`);
  await logFunnelEvent(ctx.conversation.id, "respuesta_directa", { route: "mostrar_por_aro", aro }).catch(() => undefined);
  return salida.mensaje_para_enviar;
}
