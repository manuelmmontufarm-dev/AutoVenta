/**
 * ELEGIR ES COTIZAR — Y LA COTIZACIÓN SALE DE AQUÍ, NO DEL MODELO.
 *
 * Conv 3 de Manuel, 7-sep-2026, y su réplica en el simulador ese mismo día:
 * con la lámina en pantalla, «deme la premium», «cotizeme la winrun», «deme
 * la r380» y el «1» del menú recibieron la orden determinística de llamar
 * generar_cotizacion con el código exacto… y el modelo igual buscó de nuevo,
 * reenvió una lámina de Winrun o pidió «la medida exacta». Es la misma
 * lección de `recotizar.ts`: lo que tiene que pasar sí o sí no se le pide al
 * modelo. Cuando el cliente señala una llanta de la última lámina —por
 * número, escalón, marca o modelo—, la cotización se genera acá con la MISMA
 * herramienta del agente (precio Interbot, descuento, stock corto, alerta y
 * artefacto salen de un solo lugar), y el agente no corre.
 *
 * Lo que NO hace: cotizar con la medida deducida por el VEHÍCULO (regla del
 * 1-sep, conv 13862) — ahí sigue el agente, que pide la medida. Con el aro
 * dado por el cliente sí se cotiza: cada opción de la lámina lleva su medida.
 *
 * Si la herramienta se niega (stock, otra medida, equivalente sin su sí), la
 * pregunta que ella misma propone («¿Le cotizo la X en MEDIDA?») sale tal
 * cual; si no propone ninguna, sigue el agente, que sabe explicar el motivo.
 */
import { sql } from "../db/client.js";
import { buildTools, type AgentContext } from "../agent/tools.js";
import { getAgentSalesFacts } from "../agent/agent.js";
import { eleccionDeLaVitrina, type OpcionDeVitrina } from "../domain/eleccionDeVitrina.js";
import { mencionaVehiculo } from "../domain/vehiculoEnTexto.js";
import {
  cantidadDelTexto, escalonContestado, esReferenciaPluralAlMenu, pideVariasOpciones,
} from "../domain/salesIntent.js";
import { findByCode } from "./catalog.js";
import { buildStoreLinksBlockOnce } from "./storeLinks.js";
import { preguntamosElLocal } from "../domain/storeSelection.js";
import { composeBlocks } from "./quoteMessages.js";
import { logFunnelEvent } from "./conversations.js";

export interface CotizarLoElegidoContext {
  conversation: AgentContext["conversation"];
  customerPhone: string;
  customerName?: string;
  previousOutbound: string | null;
  mensajeCitado?: string | null;
}

interface Escalon { codigo?: string; nombre?: string; precio_con_iva?: number }
type Escalones = Partial<Record<"economica" | "equilibrada" | "premium", Escalon | null>>;

function esPedidoDeAmbasOpcionesDe(texto: string, previousOutbound: string | null): boolean {
  return esReferenciaPluralAlMenu(texto, previousOutbound);
}

/** Puro: qué llanta señaló el cliente, o qué pregunta corresponde si señaló varias. */
export function loQueEligio(
  texto: string,
  previousOutbound: string | null,
  mensajeCitado: string | null | undefined,
  vitrina: readonly OpcionDeVitrina[],
  escalones: Escalones | null,
): { codigo: string; etiqueta: string | null } | { pregunta: string } | { respuesta: string } | null {
  // «LAS DOS / LOS DOS VALORES» HABLA DE LA LÁMINA. Con el menú arriba basta
  // «las 2»; si nombra valores, precios u opciones vale aunque el menú haya
  // quedado atrás (12-sep, conv 3, 17:21: tras un reenvío, «Deme los dos
  // valores de la kenda» recotizó 2 llantas). Y si nombra una marca con dos
  // opciones en la lámina, son esas dos.
  if (escalones && (esReferenciaPluralAlMenu(texto, previousOutbound) || pideVariasOpciones(texto))) {
    const todas = [...new Map(
      [escalones.economica, escalones.equilibrada, escalones.premium]
        .filter((o): o is Escalon => Boolean(o?.codigo))
        .map((o) => [o.codigo, o]),
    ).values()];
    const minusculas = texto.toLowerCase();
    const marcas = [...new Set(vitrina.map((o) => o.marca.toUpperCase()).filter(Boolean))]
      .filter((marca) => new RegExp(`\\b${marca.toLowerCase()}\\b`).test(minusculas));
    const deLaMarca = marcas.length === 1
      ? todas.filter((o) => (o.nombre ?? "").toUpperCase().startsWith(marcas[0]))
      : todas;
    const opciones = deLaMarca.length >= 2 ? deLaMarca : todas;
    if (opciones.length === 2 && (deLaMarca.length === 2 || pideVariasOpciones(texto) || esPedidoDeAmbasOpcionesDe(texto, previousOutbound))) {
      const lineas = opciones.map((o) => {
        const precio = Number(o.precio_con_iva);
        return `• *${o.nombre ?? "Opción"}*${Number.isFinite(precio) ? `: *$${precio.toFixed(2)} c/u con IVA*` : ""}`;
      });
      return {
        respuesta: `Claro, estas son las dos:\n${lineas.join("\n")}\n¿Cuál quiere que le cotice?`,
      };
    }
    return { pregunta: "¿Se refiere a la opción 2 o quiere que compare dos de las opciones?" };
  }
  const escalon = escalonContestado(texto, previousOutbound, mensajeCitado, { huboMenu: Boolean(escalones) });
  if (escalon && escalones) {
    const codigo = escalones[escalon === "precio" ? "economica" : escalon]?.codigo;
    if (codigo && vitrina.some((o) => o.codigo === codigo)) {
      const etiqueta = escalon === "precio" ? "de costo" : escalon === "premium" ? "premium" : "de equilibrio";
      return { codigo, etiqueta };
    }
  }
  const eleccion = eleccionDeLaVitrina(texto, vitrina);
  if (!eleccion) return null;
  if (eleccion.tipo === "una") return { codigo: eleccion.opcion.codigo, etiqueta: null };
  const nombre = `${eleccion.opciones[0].marca} ${eleccion.opciones[0].diseno}`;
  const medidas = eleccion.opciones.map((o) => `*${o.medida ?? "?"}*`);
  return {
    pregunta: `La *${nombre}* la tengo en ${medidas.length} medidas: ${medidas.join(" y ")}. ¿Cuál es la suya? Con eso se la cotizo al toque.`,
  };
}

/**
 * ¿HAY QUE CONFIRMAR LA MEDIDA ANTES DE FIRMAR?
 *
 * Devuelve la medida que hay que confirmar, o `null` si se puede cotizar
 * derecho.
 *
 * Conv 18684 (10-sep-2026). El cliente escribió «para un nissan Qashqai 2020
 * rin 17», pidió deportivas, la lámina salió con tres medidas distintas del
 * aro 17 y él contestó «Falken por favor el juego 4 llantas». Se firmó una
 * cotización de 4 × 215/45R17 por $642.24. La medida de fábrica de ese carro es
 * 225/60R17 — él lo dijo dos minutos después: «pero si le entran a las medidas
 * originales».
 *
 * Lo que el cliente eligió ahí fue una MARCA, no una medida: con tres medidas
 * en pantalla, «la Falken» no distingue ninguna. Y había un carro sobre la
 * mesa, o sea una medida de fábrica concreta que el bot nunca comprobó.
 *
 * Las tres condiciones tienen que darse juntas, porque cada una sola describe
 * un caso que ya funciona bien:
 *
 *  · Con la medida escrita por el cliente no hay nada que confirmar.
 *  · Con una sola medida en pantalla, elegir SÍ dice cuál es.
 *  · Sin carro en la ficha —el «rin 14» del 7-sep que Manuel aprobó— el
 *    cliente dio un aro y nada más, y cualquier medida de ese aro es la
 *    apuesta que él acepta al elegir. Ahí se firma, como pidió.
 */
export function medidaPorConfirmarAntesDeCotizar(input: {
  vitrina: readonly OpcionDeVitrina[];
  codigoElegido: string;
  medidaConfirmadaPorCliente: boolean;
  /**
   * El carro, de la ficha O de lo que el cliente escribió en este ciclo. Las
   * dos puertas hacen falta: `vehicle` solo se guarda cuando corre
   * `fitment_vehiculo`, y el caso del 18684 entró por la ruta del aro, así que
   * el Qashqai vivía únicamente en el texto del cliente.
   */
  vehiculo: string | null;
}): string | null {
  if (input.medidaConfirmadaPorCliente) return null;
  if (!input.vehiculo) return null;
  const medidas = new Set(input.vitrina.map((o) => o.medida).filter((m): m is string => Boolean(m)));
  if (medidas.size <= 1) return null;
  const elegida = input.vitrina.find((o) => o.codigo === input.codigoElegido)?.medida ?? null;
  return elegida;
}

/**
 * LA CONFIRMACIÓN PIDE LEER EL COSTADO, NO DECIR QUE SÍ.
 *
 * 12-sep (conv 3, 17:39), Qashqai 2020 rin 17: «¿Su llanta dice 215/40R17?».
 * Un Qashqai no usa perfil 40, y una pregunta de sí o no sobre la medida de la
 * lámina invita a contestar «sí» sin mirar. Se dice de qué medida es la que
 * eligió, porque es un dato, y se pregunta qué dice SU llanta.
 */
export function preguntaDeMedidaPorConfirmar(input: { nombre: string; medida: string }): string {
  return `Para no cotizarle una medida que no es la suya: la *${input.nombre}* que eligió viene en *${input.medida}*, y en ese aro hay varias medidas.`
    + "\n---\n¿Qué medida dice en el costado de su llanta? Con ese dato le armo la cotización. 🤝";
}

export async function tryCotizarLoElegido(ctx: CotizarLoElegidoContext, texto: string): Promise<string | null> {
  const [pieza] = await sql<{ metadata: Record<string, unknown> | null }[]>`
    select metadata from messages
    where conversation_id=${ctx.conversation.id} and cycle=${ctx.conversation.current_cycle}
      and metadata->>'piece'='options'
    order by created_at desc limit 1
  `;
  const codigos = Array.isArray(pieza?.metadata?.codes) ? pieza.metadata.codes.map(String) : [];
  if (!codigos.length) return null;
  const vitrina: OpcionDeVitrina[] = codigos
    .map((c) => findByCode(c))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({ codigo: p.code, marca: p.brand ?? "", diseno: p.design ?? "", medida: p.sizeLabel ?? null }));
  const escalones = (pieza?.metadata?.escalones ?? null) as Escalones | null;
  const elegido = loQueEligio(texto, ctx.previousOutbound, ctx.mensajeCitado, vitrina, escalones);
  if (!elegido) return null;
  if ("respuesta" in elegido) return elegido.respuesta;
  if ("pregunta" in elegido) {
    console.log(`🔎 Señaló una llanta con dos medidas en la conv ${ctx.conversation.id}: se pregunta cuál.`);
    return elegido.pregunta;
  }
  // La medida deducida por el vehículo no se firma (1-sep): sigue el agente.
  const facts = await getAgentSalesFacts(ctx.conversation.id);
  if (facts.medidaConfirmadaPorCliente === false && !facts.aroDelCliente) return null;

  // Con un carro sobre la mesa y varias medidas en pantalla, elegir es elegir
  // una MARCA: antes de firmar se confirma la medida en una línea (conv 18684).
  const entrantes = await sql<{ content: string }[]>`
    select content from messages
    where conversation_id=${ctx.conversation.id} and cycle=${ctx.conversation.current_cycle}
      and direction='inbound'
    order by created_at desc limit 12
  `;
  const carroEnElTexto = [texto, ...entrantes.map((m) => m.content)].find((t) => mencionaVehiculo(t)) ?? null;
  const porConfirmar = medidaPorConfirmarAntesDeCotizar({
    vitrina,
    codigoElegido: elegido.codigo,
    medidaConfirmadaPorCliente: facts.medidaConfirmadaPorCliente !== false,
    vehiculo: facts.vehicle ?? carroEnElTexto,
  });
  if (porConfirmar) {
    const cual = vitrina.find((o) => o.codigo === elegido.codigo);
    const nombre = cual ? `${cual.marca} ${cual.diseno}`.trim() : "esa";
    console.log(`🛑 Varias medidas en pantalla y un carro en la ficha (conv ${ctx.conversation.id}): se confirma ${porConfirmar} antes de cotizar.`);
    return preguntaDeMedidaPorConfirmar({ nombre, medida: porConfirmar });
  }

  const producto = findByCode(elegido.codigo);
  if (!producto) return null;
  // El número que eligió el escalón no es una cantidad (chat 18134).
  const cantidad = cantidadDelTexto(texto, ctx.previousOutbound, ctx.mensajeCitado) ?? facts.selectedQuantity ?? 4;
  const tools = buildTools({
    conversation: ctx.conversation,
    customerPhone: ctx.customerPhone,
    customerName: ctx.customerName,
    currentUserText: texto,
    mensajeCitado: ctx.mensajeCitado,
    // Elegir de la lámina ES la autorización (misma señal que el agente pone).
    aceptoCotizacion: true,
    recomendacionEntregada: true,
  });
  const tool = tools.find((t) => t.function.name === "generar_cotizacion");
  if (!tool) return null;
  let salida: { enviada?: boolean; error?: string; siguiente_paso?: string } & Record<string, unknown>;
  try {
    salida = JSON.parse(await tool.execute({ items: [{ code: producto.code, cantidad }], nombre_cliente: null }));
  } catch (error) {
    console.error("❌ Cotizar lo elegido falló; sigue el agente:", error);
    return null;
  }
  if (!salida.enviada || salida.error) {
    // La herramienta ya sabe qué preguntar («¿Le cotizo la X en MEDIDA?»):
    // esa pregunta sale sola, sin que el modelo la reescriba.
    const pregunta = /«([^»]*¿[^»]*cotizo[^»]*\?)»/i.exec(salida.siguiente_paso ?? "")?.[1];
    if (pregunta) {
      console.log(`🛑 Lo elegido necesita su sí en la conv ${ctx.conversation.id}: ${salida.error?.slice(0, 120)}`);
      return pregunta;
    }
    console.log(`↩️ Lo elegido no se pudo cotizar directo en la conv ${ctx.conversation.id} (${salida.error?.slice(0, 120)}); sigue el agente.`);
    return null;
  }
  console.log(`✅ Cotización directa de lo elegido en la conv ${ctx.conversation.id}: ${cantidad} × ${producto.code} (${producto.brand} ${producto.design})`);
  await logFunnelEvent(ctx.conversation.id, "respuesta_directa", { route: "cotizar_lo_elegido" }).catch(() => undefined);
  const precio = producto.minimumPriceWithTax ? ` — *$${producto.minimumPriceWithTax.toFixed(2)} c/u con IVA*` : "";
  const mapas = preguntamosElLocal(ctx.previousOutbound) ? "" : await buildStoreLinksBlockOnce(ctx.conversation.id);
  return composeBlocks(
    elegido.etiqueta
      ? `La opción ${elegido.etiqueta} es la *${producto.brand} ${producto.design}*${precio}. Le dejo la cotización 👍`
      : `Listo, le cotizo la *${producto.brand} ${producto.design}*${precio} 👍`,
    mapas ? `Puede pasar sin compromiso a verlas y probarlas en su vehículo.\n${mapas}` : null,
  );
}
