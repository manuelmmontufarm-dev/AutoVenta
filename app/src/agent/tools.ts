/**
 * Herramientas del agente (function calling con schemas Zod validados).
 * Las definiciones se convierten al formato de tools de OpenAI; Zod valida
 * los argumentos antes de ejecutar la lógica de negocio.
 *
 * Cada tool devuelve JSON en string; el agente redacta la respuesta al cliente.
 * El LLM extrae los datos, pero la lógica de negocio (búsqueda, precios, PDF)
 * es determinista — cero precios alucinados.
 */
import { z } from "zod";
import { business } from "../config.js";
import { PREGUNTA_DE_CIERRE } from "../domain/preguntaPendiente.js";
import {
  catalogCandidates,
  catalogStatus,
  ensureCatalogReady,
  applyInterbotPrices,
  findByCode,
  searchAlternatives,
  searchBySize,
  searchByText,
  searchWithLadder,
  type CatalogItem,
} from "../services/catalog.js";

import { aroDeMedida, enLaMedidaConfirmada } from "../domain/catalog.js";
import { alcanzaParaVender, avisoStockCorto, recordatorioStockCorto } from "../domain/stockCorto.js";
import { faltanteDeLaCotizacionVigente } from "../services/stockCorto.js";
import { getInterbotPrice, refreshPriceForSize } from "../services/interbotPrices.js";
import {
  buildQuote,
  pngToQuotePdf,
  renderComparisonPdf,
  renderQuotePdf,
} from "../services/quotePdf.js";
import {
  buildCierreOpciones,
  buildComparisonCaption,
  buildComparisonMessageDetallado,
  buildCustomerOptionsMessageDetallado,
  textoDeLaCotizacion,
  buildStoreLinksBlock,
  buildVisitDayQuestion,
  buildStoreChoiceBlocks,
  buildVisitPlanQuestion,
  composeBlocks,
  warrantyForBrand,
} from "../services/quoteMessages.js";
import {
  appendMessage,
  logQuote,
  logQuoteArtifact,
  lastOutboundText,
  registrarCompromisoDeVisita,
  registrarMedidaQueNoCoincide,
  setExplicitStore,
  setStage,
  updateConversationFacts,
  type Conversation,
} from "../services/conversations.js";
import {
  applicableBenefitTexts,
  buildBenefitsBlockOnce,
  debeLlevarIncluyeEnTexto,
  requestsBenefitsAgain,
} from "../services/benefits.js";
import { brandProfilesForRender } from "../services/brandProfiles.js";
import { getAiConfig, getPiecesConfig } from "../services/settings.js";
import { researchVehicleFitment } from "../services/vehicleFitmentResearch.js";
import { arosDeCandidatos, arosDeMedidas, invitacionPorAroAmbiguo } from "../domain/fitmentResearch.js";
import { aroVigenteDeLaVisita, rangoDeAros } from "../domain/aros.js";
import { nearestStore, resolveSector } from "../domain/locations.js";
import { extractFlotationSizes, formatFlotationSize, formatTireSize, parseTireSize, type TireSize } from "../domain/tireSize.js";
import { marcaPreguntada, ultimaMarcaPedida } from "../domain/consultaConRespaldo.js";
import {
  autorizaCotizacionEnEsteTurno, canGenerateFinalQuote, cantidadParaPrepararOpciones, describeUso, escalonesDeOpciones,
  pidePrecio, pideRecomendacion, respuestaDePreferencia,
} from "../domain/salesIntent.js";
import { getTirePatternProfile } from "../domain/tireKnowledge.js";
import {
  catalogoDeTipos, escalonDeMarca, infoTipo, normalizarTipo, ordenDeMarca, tipoDeProducto,
} from "../domain/tireTypes.js";
import { nivelDeLinea, ordenDeNivel, reglasEscalera } from "../domain/escalera.js";
import { costoPorKm, respaldoCompleto, respaldoDeMarca } from "../domain/respaldoMarcas.js";
import {
  debeBloquearReenvio, medidaDesdeContenido, opcionesQueAlcanzan, tipoSolicitadoEn,
} from "../domain/opcionesCandados.js";
import {
  medidaEstaPedida, medidasDeProductos, medidasPermitidas, mensajesDeLaVisitaActual,
} from "../domain/medidaPedida.js";
import { ahorroDeLaCotizacion } from "../domain/ahorro.js";
import { avisoDeCantidad, esCantidadInusual } from "../domain/cantidadGrande.js";
import { medidasDelPedido } from "../services/medidasDelPedido.js";
import { sendImage, sendPdf } from "../wa/client.js";
import {
  renderCompareImage,
  renderMedidaGuideImage,
  renderOptionsImage,
  renderQuoteImage,
  toRenderLine,
} from "../render/quoteImage.js";
import { sql } from "../db/client.js";
import { cancelPendingFollowUps, createBotAlert, scheduleConversationFollowUps } from "../services/followUps.js";
import { attachDiscountOfferToQuote, getActiveDiscountOffer, materializePendingDiscount } from "../services/discountOffers.js";
import { calculateDiscount } from "../domain/discounts.js";
import { notifyAdvisor } from "../services/advisorNotifications.js";
import { avisarVisitaComprometida, etiquetaVisita } from "../services/visitAlerts.js";
import { emitirCuponDeConfirmacion } from "../services/coupons.js";
import { mensajeCupon } from "../domain/coupons.js";
import { franjaHoraria } from "../domain/diasEnEspanol.js";
import { fechaDelDia } from "../domain/customerCommitment.js";
import type { StoreHours } from "../services/settings.js";
import { resendLatestQuoteImage } from "../services/directSalesRoutes.js";
import { restriccionesDeLlanta, violaRestriccionesDeLlanta } from "../domain/restriccionesLlanta.js";

export interface AgentContext {
  conversation: Conversation;
  customerPhone: string;
  customerName?: string;
  currentUserText: string;
  /**
   * El mensaje NUESTRO que el cliente citó con el reply de WhatsApp, ya
   * resuelto a texto. Null/ausente cuando no hubo reply: ahí se vuelve a la
   * heurística de «lo último que dijimos». Ver `outboundTextByWaMessageId`.
   */
  mensajeCitado?: string | null;
  /** Fase elegida para este turno; puede retroceder sin mover el Kanban guardado. */
  faseOperativa?: Conversation["stage"];
  /** El mensaje actual aceptó una oferta comercial hecha en el turno anterior. */
  aceptoOfertaComercial?: boolean;
  /** El mensaje actual aceptó específicamente una oferta de cotización. */
  aceptoCotizacion?: boolean;
  /** `preparar_opciones` entregó una recomendación con precio en este turno:
   *  la cotización de 4 sale sola, sin pedir permiso (Manuel, 31-ago). */
  recomendacionEntregada?: boolean;
  /** La intención activa es un servicio fuera del catálogo de llantas. */
  consultaFueraDeCatalogo?: boolean;
  comparedThisTurn?: boolean;
  resumedFromHuman?: boolean;
  discountNotice?: { source: "pending" | "offer"; id: number };
  storeHours?: StoreHours;
  /**
   * Lo que el bot HIZO este turno: cada herramienta con sus argumentos y un
   * recorte del resultado. Lo llena el loop del agente y lo lee el Ángel
   * Guardián — sin esto, el guardián solo ve lo que el bot DICE, y un «no
   * aparece en catálogo» tras una búsqueda mal escrita se le pasa entero
   * (Wildpeak A/T4W, 14-ago).
   */
  toolTrace?: Array<{ herramienta: string; argumentos: string; resultado: string }>;
}

export interface AgentTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  execute(args: unknown): Promise<string>;
}

function defineTool<T extends z.ZodTypeAny>(input: {
  name: string;
  description: string;
  schema: T;
  run: (args: z.output<T>) => Promise<string>;
}): AgentTool {
  return {
    type: "function",
    function: {
      name: input.name,
      description: input.description,
      parameters: z.toJSONSchema(input.schema) as Record<string, unknown>,
    },
    // NADA que pase por aquí puede lanzar (16-ago).
    //
    // Antes esto era `input.run(input.schema.parse(args))`. Los dos pedazos
    // lanzaban y nadie los capturaba: ni el bucle del agente, ni runAgent, ni
    // el handler del webhook — la excepción moría en un console.error del
    // pipeline y el cliente se quedaba sin ninguna respuesta y sin alerta al
    // asesor.
    //
    // 1) `parse` → `safeParse`. El modelo no está obligado a cumplir el
    //    esquema (no se manda `strict: true`), y además `parseArguments`
    //    devuelve {} cuando los argumentos vienen truncados por
    //    max_completion_tokens: con eso, toda tool con campos requeridos
    //    lanzaba ZodError garantizado. Ahora el error vuelve al modelo como
    //    resultado de tool, que es algo que sabe leer y corregir en la
    //    siguiente ronda.
    // 2) `run` también se envuelve: dentro hay Postgres, la API del Interbot,
    //    WheelSize y buildQuote — que lanza a propósito cuando un descuento
    //    ya no cabe en el total.
    execute: async (args) => {
      const parsed = input.schema.safeParse(args);
      if (!parsed.success) {
        const detalle = parsed.error.issues
          .map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`)
          .join("; ");
        return JSON.stringify({
          error: `Argumentos inválidos para ${input.name} — ${detalle}. Corrígelos y vuelve a llamarla; si no puedes, sigue el turno por otro camino.`,
        });
      }
      try {
        return await input.run(parsed.data);
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        console.error(`❌ La herramienta ${input.name} falló:`, mensaje);
        return JSON.stringify({
          error: `La herramienta ${input.name} no pudo completarse (${mensaje}). No la repitas igual: avanza con lo que ya sabes, pide el dato que falte o deriva al asesor.`,
        });
      }
    },
  };
}

function storeSchedule(name: string, hours?: StoreHours): string {
  if (!hours) return business.schedule;
  const schedule = name.includes("Cumbayá") ? hours.cumbaya : hours.quitoSur;
  const fmt = (period: { open: string; close: string; closed: boolean }) => period.closed ? "cerrado" : `${period.open}–${period.close}`;
  return `lunes a viernes ${fmt(schedule.weekday)}; sábado y domingo ${fmt(schedule.weekend)}`;
}

/** Cómo se le nombra al cliente cada escalón de marca. */
const ESCALONES = ["premium", "equilibrio", "equilibrio", "economica"] as const;

/**
 * Etiqueta del escalón para UNA llanta concreta: primero por línea (la
 * escalera del 13-ago distingue las Kenda intermedias de las de entrada) y,
 * si la línea no está clasificada, por marca como siempre.
 */
function etiquetaEscalon(brand: string, design: string): (typeof ESCALONES)[number] {
  const nivel = nivelDeLinea(brand, design);
  if (nivel === "PREMIUM") return "premium";
  if (nivel === "INTERMEDIA") return "equilibrio";
  if (nivel === "ECONOMICA") return "economica";
  return ESCALONES[Math.min(escalonDeMarca(brand), ESCALONES.length - 1)];
}

/**
 * Deja UNA opción por escalón de marca, la más barata disponible de cada uno.
 *
 * El cliente pidió mandar 3 y no 6: «así ni le confundimos tanto al mijin».
 *
 * OJO con lo que hace y lo que NO hace: PREFIERE lo disponible dentro de cada
 * escalón, pero no excluye lo agotado. Si un escalón de marca solo tiene
 * agotadas, sale una agotada — a propósito, porque `buscar_por_aro_y_tipo`
 * quiere mostrar que la marca existe en ese aro aunque haya que encargarla.
 * Quien necesite garantizar stock tiene que filtrar ANTES de llamar (ver
 * `conStock`); confiar en esta función para eso fue el bug del 7-ago.
 */
function tresOpciones<T extends { brand: string; design: string; minimumPriceWithTax: number; availability: string }>(
  productos: readonly T[],
): T[] {
  const porEscalon = new Map<number, T>();
  for (const p of productos) {
    // La LÍNEA manda sobre la marca (escalera 13-ago): una Kenda KR628 es
    // intermedia y una KR203 es económica; meterlas al mismo cajón «Kenda»
    // dejaba escaleras con dos del mismo nivel y ninguna económica real.
    const nivel = nivelDeLinea(p.brand, p.design);
    const escalon = nivel ? ordenDeNivel(nivel) : escalonDeMarca(p.brand);
    const actual = porEscalon.get(escalon);
    const mejorQue = (a: T, b: T) => {
      const disp = (x: T) => (x.availability === "available" ? 0 : x.availability === "check" ? 1 : 2);
      if (disp(a) !== disp(b)) return disp(a) < disp(b);
      return a.minimumPriceWithTax < b.minimumPriceWithTax;
    };
    if (!actual || mejorQue(p, actual)) porEscalon.set(escalon, p);
  }
  return [...porEscalon.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

/**
 * Recorta la lista que se le manda al modelo SIN perder ningún escalón.
 *
 * `buscar_llanta` devolvía `exact.slice(0, 8)` más 5 alternativas: 1.097 tokens
 * medidos, en un bloque que se paga a tarifa plena (va detrás del corte del
 * caché) y que además entra al historial de todas las iteraciones siguientes.
 * Y su propio `siguiente_paso` le ordena al modelo usar «máximo 3 códigos»:
 * se pagaban trece productos para que eligiera tres.
 *
 * Un `slice` más corto se podía comer un nivel entero de la escalera, así que
 * primero se reserva el mejor de cada escalón (la misma regla que usa
 * `tresOpciones`) y solo después se rellena con el resto en su orden original.
 * Resultado: nunca devuelve menos variedad de niveles que antes, y en la
 * práctica devuelve más, porque `tresOpciones` mira la lista COMPLETA y no
 * solo los ocho primeros.
 */
function recorteConEscalera<T extends { brand: string; design: string; minimumPriceWithTax: number; availability: string }>(
  productos: readonly T[],
  tope: number,
): T[] {
  if (productos.length <= tope) return [...productos];
  const elegidos = tresOpciones(productos).slice(0, tope);
  for (const p of productos) {
    if (elegidos.length >= tope) break;
    if (!elegidos.includes(p)) elegidos.push(p);
  }
  // Se devuelve en el orden original del catálogo, que ya viene ordenado por
  // coincidencia y disponibilidad; la escalera decide QUIÉN entra, no en qué
  // orden se presenta.
  return productos.filter((p) => elegidos.includes(p));
}

/**
 * Búsqueda por ARO en el catálogo real, con filtro opcional por tipo.
 *
 * Vivía dentro de `buscar_por_aro_y_tipo`. Se sacó porque el candado de
 * `fitment_vehiculo` necesita exactamente esto: cuando la investigación del
 * vehículo no da medida, el aro que dijo el cliente es lo único que queda para
 * ofrecerle algo real del stock. Una sola implementación = un solo criterio de
 * qué hay en un aro y cuáles tres se muestran.
 *
 * Quien la llame debe haber hecho `ensureCatalogReady()` antes.
 */
function opcionesEnAro(aro: number, tipo: string | null, medidaConfirmada?: string | null): {
  pedido: string | null;
  enElAro: CatalogItem[];
  delTipo: CatalogItem[];
  seleccion: CatalogItem[];
  /** La medida de la ficha, y solo si es de ESTE aro. Null = no manda aquí. */
  suMedida: string | null;
  /** Tiene medida confirmada en este aro y de ese tipo no hay NADA en ella. */
  sinTipoEnSuMedida: boolean;
} {
  const pedido = tipo ? normalizarTipo(tipo) : null;
  // Se busca por aro en el catálogo real y se filtra por el tipo que dice la
  // base del cliente; el tipo NO viene de Contífico.
  const enElAro = searchByText(`R${aro}`, 60).filter((item) => item.size?.rim === aro);
  const delTipo = pedido
    ? enElAro.filter((item) => normalizarTipo(tipoDeProducto(item.code, item.design) ?? "") === pedido)
    : enElAro;
  // Su medida le gana al aro (25-ago). El aro se compara aparte y a propósito:
  // si el cliente CAMBIÓ de rines —el caso que esta misma herramienta invita a
  // atender— su medida vieja ya no aplica, y filtrar por ella dejaría la
  // búsqueda en cero. Fuera de ese caso, lo que él confirmó manda sobre el aro.
  const suMedida = aroDeMedida(medidaConfirmada) === aro ? medidaConfirmada ?? null : null;
  // «Con stock» es parte del requisito: si en su medida el tipo existe pero
  // TODO está agotado, quedarse ahí dejaría al cliente con una sola opción
  // incotizable (generar_cotizacion bloquea agotadas) y le esconderíamos las
  // equivalentes vendibles del aro. Agotado en su medida = como si no hubiera.
  const enSuMedida = conStock(enLaMedidaConfirmada(delTipo, suMedida));
  return {
    pedido: pedido || null,
    enElAro,
    delTipo,
    // Con algo vendible en su medida, la selección sale SOLO de ahí; si no
    // hay, se cae al aro completo — pero eso deja de ser silencioso
    // (`sinTipoEnSuMedida`).
    seleccion: tresOpciones(enSuMedida.length ? enSuMedida : delTipo),
    suMedida,
    sinTipoEnSuMedida: Boolean(suMedida) && !enSuMedida.length,
  };
}

/** Aros que existen en el mercado ecuatoriano; fuera de este rango es ruido del modelo. */
const ARO_MIN = 12;
const ARO_MAX = 24;

/**
 * Lo que se puede vender HOY.
 *
 * El candado de fitment le promete al vendedor opciones ofrecibles, no un
 * inventario de recuerdos: mandarle a un cliente tres llantas en cero es peor
 * que decirle que no hay, porque pregunta por una y recién ahí se entera.
 * Va aparte de `tresOpciones` porque esa función la comparten búsquedas que SÍ
 * quieren mostrar lo agotado (`buscar_por_aro_y_tipo`).
 */
function conStock(items: readonly CatalogItem[]): CatalogItem[] {
  return items.filter((item) => item.stock > 0);
}

/**
 * Último recurso del candado de fitment: una muestra real del stock.
 *
 * Se barre aro por aro porque el catálogo no expone un "dame todo" y esto usa
 * el mismo camino que el resto de las búsquedas. Son opciones REALES y
 * disponibles, pero no una recomendación para ese vehículo — la `regla` de la
 * tool obliga a decirlo. Corre solo cuando no hubo ni medida investigada ni aro
 * del cliente, que es la única forma de que el bot no tenga nada que ofrecer.
 *
 * Filtra por stock aquí adentro para que el nombre sea cierto: si el catálogo
 * está en cero, esto devuelve vacío y el candado se calla en vez de mentir.
 */
function muestraDelStock(): CatalogItem[] {
  const todo: CatalogItem[] = [];
  for (let aro = ARO_MIN; aro <= ARO_MAX; aro++) {
    todo.push(...tresOpciones(conStock(opcionesEnAro(aro, null).enElAro)));
  }
  return tresOpciones(todo);
}

/**
 * Aros que hoy tienen algo vendible.
 *
 * Es lo concreto que se le puede dar a alguien que todavía no sabe su medida:
 * «¿qué aro usa?» en seco es una pregunta más, pero «¿qué aro usa? tenemos del
 * 13 al 20» ya es una oferta. Se calcula del stock real para no prometer un aro
 * que no existe.
 */
function arosConStock(): number[] {
  const aros: number[] = [];
  for (let aro = ARO_MIN; aro <= ARO_MAX; aro++) {
    if (conStock(opcionesEnAro(aro, null).enElAro).length) aros.push(aro);
  }
  return aros;
}

/** Une listas del catálogo sin repetir códigos (una misma llanta cae por varias medidas). */
function sinRepetir(...listas: CatalogItem[][]): CatalogItem[] {
  const porCodigo = new Map<string, CatalogItem>();
  for (const lista of listas) for (const item of lista) if (!porCodigo.has(item.code)) porCodigo.set(item.code, item);
  return [...porCodigo.values()];
}

/** De dónde salieron las opciones; cambia lo que el vendedor puede afirmar sobre ellas. */
type OrigenOpciones = "medida_investigada" | "aro_del_cliente" | "medida_cercana" | "muestra_del_stock";

/**
 * CANDADO de `fitment_vehiculo`: convierte la investigación en algo vendible.
 *
 * El problema que resuelve no es de búsqueda sino de final de turno: hasta el
 * 7-ago, cuando la investigación no daba medida, la tool respondía una
 * limitación y una pregunta, y ahí se acababa la conversación. El cliente había
 * dicho su carro y su aro y aun así no vio ni una llanta.
 *
 * La regla es que si el catálogo tiene stock, de aquí sale al menos una opción,
 * degradando por escalones y diciendo siempre de qué escalón vino:
 *   a) las medidas que la investigación propuso, cruzadas contra el catálogo;
 *   b) el aro que dijo el cliente — dato suyo, no inferido;
 *   c) las medidas más cercanas que SÍ existen (mismo aro, ancho ±10mm);
 *   d) una muestra del stock, que ya no es una recomendación para ese vehículo.
 *
 * LOS CUATRO escalones exigen STOCK, no solo existencia. Que solo lo exigiera
 * el (a) fue el bug del 7-ago: una medida agotada se reportaba en
 * `medidas_agotadas` y volvía a salir como opción #1 por la puerta del aro, y
 * con el catálogo entero en cero el candado devolvía tres llantas invendibles
 * declarándolas «muestra del stock». La invariante correcta es: hay stock ⇒ hay
 * al menos una opción; no hay stock ⇒ `[]` y `origen: null`. El candado promete
 * no callarse teniendo qué vender, no promete tener qué vender.
 */
async function opcionesDeFitment(
  medidas: readonly string[],
  aro: number | null,
): Promise<{ opciones: CatalogItem[]; origen: OrigenOpciones | null; medidasConStock: string[]; medidasAgotadas: string[] }> {
  await ensureCatalogReady();
  const parseadas = medidas
    .map((etiqueta) => ({ etiqueta, size: parseTireSize(etiqueta) }))
    .filter((m): m is { etiqueta: string; size: TireSize } => m.size !== null);

  const listasDisponibles: CatalogItem[][] = [];
  const medidasConStock: string[] = [];
  const medidasAgotadas: string[] = [];
  for (const { etiqueta, size } of parseadas) {
    const hits = searchBySize(size);
    if (!hits.length) continue;
    const disponibles = conStock(hits);
    if (disponibles.length) {
      listasDisponibles.push(disponibles);
      medidasConStock.push(etiqueta);
    } else {
      medidasAgotadas.push(etiqueta);
    }
  }

  const porMedida = tresOpciones(sinRepetir(...listasDisponibles));
  if (porMedida.length) return { opciones: porMedida, origen: "medida_investigada", medidasConStock, medidasAgotadas };

  if (aro) {
    // Se filtra por stock ANTES de elegir las tres: `opcionesEnAro` comparte
    // `tresOpciones` con `buscar_por_aro_y_tipo`, que sí muestra agotadas. Si se
    // filtrara después, un escalón de marca cuya única llanta está en cero
    // dejaría fuera a la disponible de ese mismo escalón.
    const delAro = tresOpciones(conStock(opcionesEnAro(aro, null).enElAro));
    if (delAro.length) return { opciones: delAro, origen: "aro_del_cliente", medidasConStock, medidasAgotadas };
  }

  // `searchAlternatives` ya filtra stock en el catálogo real; se vuelve a
  // filtrar para que la invariante no dependa de las tripas de esa búsqueda.
  const cercanas = tresOpciones(conStock(sinRepetir(...parseadas.map(({ size }) => searchAlternatives(size)))));
  if (cercanas.length) return { opciones: cercanas, origen: "medida_cercana", medidasConStock, medidasAgotadas };

  const muestra = muestraDelStock();
  return { opciones: muestra, origen: muestra.length ? "muestra_del_stock" : null, medidasConStock, medidasAgotadas };
}

/** Qué puede afirmar el vendedor sobre unas opciones, según de dónde salieron. */
const REGLA_POR_ORIGEN: Record<OrigenOpciones, string> = {
  medida_investigada:
    "Estas opciones SON de la medida investigada. Mándalas ya con preparar_opciones (una premium, una de equilibrio, una económica) y di en UNA línea que la medida se confirma al instalar.",
  aro_del_cliente:
    "La investigación no dio una medida con stock, pero el cliente dijo su ARO y estas opciones son de ese aro. Ofrécelas como lo que son —opciones de su aro— y de paso pídele la medida exacta. No afirmes que son las de fábrica de su vehículo.",
  medida_cercana:
    "No hay stock de las medidas investigadas. Estas son las medidas más cercanas que SÍ existen. Dilo tal cual: son parecidas, no las de fábrica, y hay que confirmar en el local antes de montar.",
  muestra_del_stock:
    "Esto es una MUESTRA del stock, no una recomendación para ese vehículo. Mándala solo para que vea marcas y precios, y en la misma respuesta pide la medida o la foto del costado.",
};

function dateLabel(): string {
  return new Date().toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Guayaquil",
  });
}

/**
 * De la referencia que el agente conserva a la llanta concreta que se cotiza.
 *
 * Devuelve la lista, no un producto, porque los tres desenlaces piden respuestas
 * distintas y antes se trataban igual —como «no existe»—:
 *
 *  · **Una** — es esa; se cotiza.
 *  · **Varias** — el cliente pidió un modelo que Depot tiene en varias
 *    versiones. Eso es una PREGUNTA («¿la M/T o la A/T3W?»), no una negativa.
 *  · **Ninguna** — ahí sí no existe.
 *
 * El desempate fuerte es la medida que la conversación ya confirmó: sin ella,
 * «Falken Wildpeak M/T» son las ocho medidas que Depot surte de ese modelo y
 * nunca resolvía. Con ella, es una.
 */
/**
 * Las llantas de la última pieza que el cliente tiene EN PANTALLA (opciones o
 * comparativa). Es lo único que él pudo haber señalado al decir «la Falken».
 */
async function productosPresentados(conversationId: number): Promise<CatalogItem[]> {
  const [artifact] = await sql<{ products: Array<{ code?: string; brand?: string; design?: string }> }[]>`
    select products from quote_artifacts
    where conversation_id=${conversationId}
      and cycle=(select current_cycle from conversations where id=${conversationId})
      and kind in ('options','comparison')
    order by created_at desc, id desc limit 1
  `;
  return (Array.isArray(artifact?.products) ? artifact.products : [])
    .map((item) => findByCode(String(item.code ?? "")))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

async function resolvePresentedProduct(conversationId: number, reference: string): Promise<CatalogItem[]> {
  const products = await productosPresentados(conversationId);
  const clean = reference.trim().toLowerCase().replace(/[$,]/g, "");
  const numeric = Number(clean);
  const matches = products.filter((product) => {
    const labels = [product.code, product.id, product.design, `${product.brand} ${product.design}`]
      .map((value) => value.trim().toLowerCase());
    if (labels.includes(clean)) return true;
    return Number.isFinite(numeric) && (
      Math.round(product.minimumPriceWithTax) === Math.round(numeric) ||
      Math.abs(product.minimumPriceWithTax - numeric) < 0.01
    );
  });
  // Lo que ya se le mostró al cliente manda: si la referencia señala una de las
  // opciones de la pieza que tiene en pantalla, es esa y no hay nada que buscar.
  if (matches.length === 1) return matches;

  const [facts] = await sql<{ tire_size: string | null }[]>`
    select tire_size from conversations where id=${conversationId}
  `;
  return catalogCandidates(reference, facts?.tire_size ?? null);
}

/** «FALKEN WILDPEAK M/T (265/70R17) — código LT2657017WPMT» */
function etiquetaOpcion(item: CatalogItem): string {
  const medida = item.sizeLabel ? ` (${item.sizeLabel})` : "";
  return `${item.brand} ${item.design}${medida} — código ${item.code}`;
}

/**
 * Envía una pieza visual (cotización o comparativa) por WhatsApp.
 * Nunca lanza: si el render o el envío fallan, devuelve ok=false y el flujo
 * cae al PDF — el cliente jamás se queda sin su cotización (fallo del demo 20-jul).
 *
 * Devuelve `error` con la etapa y el motivo exacto. Antes solo iba a
 * console.error, así que una imagen que no salía era indistinguible de una que
 * sí: el cliente recibía el texto y en el panel no quedaba rastro.
 */
/**
 * ¿Alcanza con la foto, o el texto tiene que traer la cotización entera?
 *
 * Solo la foto cuando la pieza salió Y el dueño eligió «imagen_primero» en
 * Ajustes. El texto completo queda para los dos casos en que hace falta de
 * verdad: cuando el dueño pidió expresamente «texto_completo», y siempre que la
 * pieza NO haya salido — ahí el texto es lo único que le queda al cliente. Si no
 * se puede leer la configuración, se asume texto completo: de más información
 * nadie se queda sin cotización.
 */
async function soloLaFoto(imagenEnviada: boolean): Promise<boolean> {
  if (!imagenEnviada) return false;
  try {
    return (await getAiConfig()).formato === "imagen_primero";
  } catch {
    return false;
  }
}

async function sendVisual(
  conversationId: number,
  to: string,
  render: () => Promise<Buffer>,
  caption: string,
  filename: string,
  what: string,
): Promise<{ ok: boolean; providerId?: string; png?: Buffer; error?: string }> {
  let png: Buffer | undefined;
  let etapa: "render" | "envío" = "render";
  try {
    png = await render();
    etapa = "envío";
    const providerId = await sendImage(conversationId, to, png, caption, filename);
    return { ok: true, providerId, png };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    console.error(`❌ Imagen de ${what} falló en ${etapa}:`, err);
    return { ok: false, png, error: `${etapa}: ${motivo}` };
  }
}

export function buildTools(ctx: AgentContext) {
  const buscarLlanta = defineTool({
    name: "buscar_llanta",
    description:
      "Busca llantas en el catálogo real por medida exacta. Devuelve opciones con marca, precio final para el cliente (IVA incluido) y disponibilidad. Si no hay stock exacto, incluye alternativas del mismo aro que podrían servir al vehículo. Úsala SIEMPRE antes de mencionar precios o disponibilidad. Si el cliente dio una medida de flotación en pulgadas (30x9.5R15, 31x10.5R15, 33x12.50R15) manda SOLO `flotacion` con el texto tal cual lo escribió.",
    schema: z.object({
      flotacion: z
        .string()
        .nullable()
        .default(null)
        .describe("Medida de flotación tal como la escribió el cliente, ej. '30x9.5r15'. Null si dio una medida métrica."),
      width: z.number().int().describe("Ancho en mm, ej. 185"),
      aspect: z
        .number()
        .int()
        .nullable()
        .describe("Perfil, ej. 65. Null si el cliente dio una medida sin perfil como 185R14"),
      rim: z.number().int().describe("Aro en pulgadas, ej. 14"),
    }),
    run: async ({ width, aspect, rim, flotacion }) => {
      await ensureCatalogReady();

      // Medidas en pulgadas (30x9.5R15). El catálogo las trae escritas de dos
      // formas — "30X9.5R15LT" y "30X9.50R15LT" — así que se busca por la forma
      // canónica: si no, la mitad del stock queda invisible.
      if (flotacion) {
        const medida = extractFlotationSizes(flotacion)[0];
        if (medida) {
          const etiqueta = formatFlotationSize(medida);
          const encontradas = searchByText(etiqueta.replace(/R\d+$/, ""), 40)
            .filter((item) => item.sizeLabel === etiqueta);
          await updateConversationFacts(ctx.conversation.id, { tireSize: etiqueta });
          return JSON.stringify({
            medida: etiqueta,
            resultados: tresOpciones(encontradas).map(toolItem),
            total_en_esa_medida: encontradas.length,
            regla: encontradas.some((i) => i.stock > 0)
              ? "PROHIBIDO listarlas en texto: llama preparar_opciones para que salga la imagen."
              : "Ninguna tiene stock. Dilo claro y ofrece consultar con el asesor; no inventes que llegará.",
          });
        }
      }

      const size = { width, aspect, rim };
      const exact = searchBySize(size);
      const alternatives = exact.some((i) => i.stock > 0) ? [] : searchAlternatives(size);
      // Aquí NO se consulta al Interbot a propósito. Se probó y se sacó el
      // 16-ago: `buscar_llanta` es la herramienta más frecuente del bot y le
      // añadía una ida y vuelta (hasta 20 s en el peor caso) a cada búsqueda,
      // para un beneficio marginal — el cliente ve los precios en la PIEZA, y
      // el playbook prohíbe listarlos en texto. La confirmación contra el
      // Interbot vive donde se enseña el número: `preparar_opciones` y
      // `generar_cotizacion`.
      await updateConversationFacts(ctx.conversation.id, { tireSize: formatTireSize(size) });
      return JSON.stringify({
        medida: formatTireSize(size),
        resultados: recorteConEscalera(exact, 5).map(toolItem),
        alternativas_mismo_aro: recorteConEscalera(alternatives, 3).map(toolItem),
        siguiente_paso: "PROHIBIDO escribir estas opciones como lista en el chat. Para mostrárselas al cliente llama preparar_opciones con máximo 3 códigos (una premium, una de equilibrio y una económica) — esa herramienta manda la imagen. Si escribes precios y disponibilidad en texto, el cliente recibe un muro y no ve la pieza.",
      });
    },
  });

  const buscarCatalogo = defineTool({
    name: "buscar_catalogo",
    description:
      "Busca el catálogo real por texto: medida completa, código, marca, diseño o combinaciones como '205/55R16 Falken' y 'KR203'. Devuelve máximo 8 opciones ordenadas por coincidencia y disponibilidad. Úsala cuando el cliente escriba una referencia o una consulta libre.",
    schema: z.object({
      consulta: z.string().min(2).max(100),
    }),
    run: async ({ consulta }) => {
      await ensureCatalogReady();
      const MOSTRAR =
        "PROHIBIDO escribir estas opciones como lista en el chat. Para mostrárselas al cliente llama preparar_opciones con máximo 3 códigos (una premium, una de equilibrio y una económica) — esa herramienta manda la imagen. Si escribes precios y disponibilidad en texto, el cliente recibe un muro y no ve la pieza.";
      // Búsqueda en escalera: lo exacto y, si no hay, QUÉ SÍ HAY. El catálogo
      // nunca responde con un `[]` mudo — eso es lo que empujaba al modelo a
      // inventar un «no aparece en catálogo» (14-ago). Y no se escala al
      // asesor: con estos datos el bot arma solo una respuesta precisa.
      const escalera = searchWithLadder(consulta, 8);
      if (!escalera.sinCoincidenciaExacta) {
        return JSON.stringify({
          consulta,
          resultados: escalera.resultados.map(toolItem),
          siguiente_paso: MOSTRAR,
        });
      }

      const sizeLabel = escalera.medidaPedida;
      const enEsaMedida = escalera.enEsaMedida;
      const elModeloEnOtrasMedidas = escalera.modeloEnOtrasMedidas;
      const estado = catalogStatus();
      // Catálogo vacío o caído: aquí NO se puede afirmar que algo no existe.
      // Es un problema del sistema, no una respuesta comercial.
      const catalogoCaido = estado.items === 0 || Boolean(estado.error);

      return JSON.stringify({
        consulta,
        resultados: [],
        sin_coincidencia_exacta: true,
        medida_pedida: sizeLabel,
        en_esa_medida: enEsaMedida.map(toolItem),
        ese_modelo_en_otras_medidas: elModeloEnOtrasMedidas.map(toolItem),
        catalogo: { items: estado.items, error: estado.error },
        siguiente_paso: catalogoCaido
          ? "El catálogo no está disponible ahora mismo: NO afirmes que no tenemos nada. Dile que lo confirmas en un momento y avisa con notificar_vendedor."
          : [
              "NO digas «no tenemos» en seco: responde con lo que estos datos SÍ dicen, en una sola frase corta y honesta.",
              enEsaMedida.length
                ? `En ${sizeLabel} SÍ hay stock (mira 'en_esa_medida'): dile que ese modelo exacto no lo manejas en esa medida y muéstrale lo que sí hay con preparar_opciones.`
                : null,
              elModeloEnOtrasMedidas.length
                ? "Ese modelo SÍ existe en otras medidas (mira 'ese_modelo_en_otras_medidas'): dilo, nombrando las medidas, por si cambió de aro."
                : null,
              !enEsaMedida.length && !elModeloEnOtrasMedidas.length
                ? "Ni el modelo ni la medida están en el catálogo: ahí sí dilo claro y ofrece buscar por su vehículo o por aro para no dejarlo sin nada."
                : null,
              MOSTRAR,
            ].filter(Boolean).join(" "),
      });
    },
  });

  const buscarPorAroYTipo = defineTool({
    name: "buscar_por_aro_y_tipo",
    description:
      "Busca por ARO y (opcional) TIPO de llanta: H/T, A/T, R/T, M/T, turismo, turismo SUV, turismo UHP, comercial. EL ARO SOLO YA ALCANZA: si el cliente dijo 'para rin 19' o 'aro 16' sin decir el tipo, llámala igual con tipo: null y te devuelve todas las medidas que existen en ese aro. Úsala también cuando pida 'una R17 A/T' o 'todo terreno para aro 16', o cuando cambió los aros y ya no sirve la medida original. El aro le gana al vehículo: si el cliente dio aro y carro en el mismo mensaje, usa esta y no fitment_vehiculo. Devuelve las medidas que existen en ese aro con su tipo y precio.",
    schema: z.object({
      aro: z.number().int().min(12).max(24).describe("Aro en pulgadas, ej. 17"),
      tipo: z
        .string()
        .nullable()
        .default(null)
        .describe("Tipo pedido: A/T, H/T, R/T, M/T, turismo, turismo SUV, turismo UHP, comercial. Null si no lo dijo."),
      uso: z
        .string()
        .nullable()
        .default(null)
        .describe("Uso que declaró el cliente, si lo dijo (ciudad, mixto, trabajo pesado)."),
    }),
    run: async ({ aro, tipo, uso }) => {
      await ensureCatalogReady();
      // La medida que el cliente ya confirmó entra al filtro. Sin esto, «una
      // A/T» con 265/65R18 en la ficha devolvía A/T de cualquier medida del
      // aro 18 (25-ago): el aro llega por el parámetro, la medida se quedaba
      // en la conversación.
      const [ficha] = await sql<{ tire_size: string | null }[]>`
        select tire_size from conversations where id=${ctx.conversation.id}
      `;
      const { pedido, enElAro, delTipo, seleccion, suMedida, sinTipoEnSuMedida } =
        opcionesEnAro(aro, tipo, ficha?.tire_size);

      // El ancho que el cliente rechazó no vuelve a salir por esta puerta.
      // 31-ago (conv 3 c20, producción): «ya no 185, ¿qué otras tiene?» y esta
      // búsqueda devolvió dos 185 igual — el rechazo se filtraba en
      // `preparar_opciones` pero no aquí, y el modelo eligió los códigos de
      // esta lista. La restricción se lee de los mensajes de la visita, con el
      // mismo criterio que `preparar_opciones`.
      const inboundVisita = await sql<{ content: string; created_at: Date }[]>`
        select content, created_at from messages
        where conversation_id=${ctx.conversation.id}
          and cycle=${ctx.conversation.current_cycle}
          and direction='inbound'
        order by created_at desc limit 12
      `;
      const restricciones = restriccionesDeLlanta([
        ...mensajesDeLaVisitaActual(inboundVisita).map((m) => m.content).reverse(),
        ctx.currentUserText,
      ]);
      const delTipoPermitido = delTipo.filter(
        (p) => !violaRestriccionesDeLlanta(p.sizeLabel, restricciones),
      );
      // Hay stock en el aro pero TODO es del ancho rechazado: eso no es «no
      // encontrado» a secas — la respuesta honesta es que no hay otra medida.
      if (delTipo.length && !delTipoPermitido.length) {
        return JSON.stringify({
          encontrado: false,
          aro,
          tipo_pedido: pedido || null,
          anchos_rechazados: restricciones.anchosRechazados,
          medidas_que_hay_pero_rechazo: [...new Set(delTipo.map((p) => p.sizeLabel))],
          regla:
            `En el aro ${aro} TODO el stock es de anchos que el cliente YA rechazó (${restricciones.anchosRechazados.join(", ")}). `
            + "Díselo con todas las letras — «en ese aro solo manejo esa medida y usted me dijo que ya no la quiere» — y "
            + "PROHIBIDO volver a mandarle esas opciones o la pieza. Ofrece las dos salidas reales: que te diga marca, modelo y año "
            + "de su vehículo para confirmar qué medida alternativa sí le calza, o que un asesor se lo confirme en el local.",
        });
      }
      // La selección original (que prefiere su medida confirmada) se respeta
      // mientras sobreviva al filtro; si el rechazo la vació, se rearma la
      // escalera con lo que sí se puede ofrecer.
      const seleccionFiltrada = seleccion.filter(
        (p) => !violaRestriccionesDeLlanta(p.sizeLabel, restricciones),
      );
      const seleccionPermitida = seleccionFiltrada.length
        ? seleccionFiltrada
        : tresOpciones(
            conStock(delTipoPermitido).length ? conStock(delTipoPermitido) : delTipoPermitido,
          );

      if (!delTipo.length) {
        return JSON.stringify({
          encontrado: false,
          aro,
          tipo_pedido: pedido || null,
          hay_en_el_aro: enElAro.length,
          tipos_disponibles_en_ese_aro: [
            ...new Set(enElAro.map((i) => tipoDeProducto(i.code, i.design)).filter(Boolean)),
          ],
          regla:
            "No hay stock de ese tipo en ese aro. Dile qué tipos SÍ hay en ese aro y pregunta el uso; no inventes que llegará ni ofrezcas otro tipo como si fuera el pedido.",
        });
      }

      const info = pedido ? infoTipo(pedido) : null;
      return JSON.stringify({
        encontrado: true,
        aro,
        tipo_pedido: pedido || null,
        que_es_ese_tipo: info
          ? { nombre: info.nombre, definicion: info.definicion, cuando_va: info.cuandoOfrecerla, cuando_no: info.noOfrecerlaSi }
          : null,
        uso_declarado: uso,
        su_medida: suMedida,
        sin_tipo_en_su_medida: sinTipoEnSuMedida,
        // Tres y no seis: una por escalón de marca.
        opciones: seleccionPermitida.map(toolItem),
        otras_en_ese_aro: delTipoPermitido.length - seleccionPermitida.length,
        ...(restricciones.anchosRechazados.length
          ? { anchos_rechazados_excluidos: restricciones.anchosRechazados }
          : {}),
        regla: [
          "PROHIBIDO listarlas en texto. Llama preparar_opciones con estos códigos para que salga la imagen (una premium, una de equilibrio, una económica). Si el cliente no dijo el uso ni el tipo, se lo preguntas DESPUÉS de mandarle la imagen — nunca retengas las opciones para preguntar primero. No afirmes un tipo que no venga en 'tipo'.",
          restricciones.anchosRechazados.length
            ? `Se EXCLUYERON los anchos ${restricciones.anchosRechazados.join(", ")} que el cliente rechazó: no los vuelvas a ofrecer ni a cotizar.`
            : null,
          // Estas opciones NO son de su medida y hay que decirlo. `preparar_opciones`
          // ya hornea el aviso de equivalentes en el mensaje que sale verbatim
          // (candado 3), así que aquí basta con que el modelo no las presente
          // como suyas mientras tanto.
          sinTipoEnSuMedida
            ? `En su medida ${suMedida} NO hay ${pedido ?? "de ese tipo"}: estas son de OTRAS medidas del aro ${aro}. Dilo con todas las letras —«en su ${suMedida} no me queda ${pedido ?? "de ese tipo"}, estas son equivalentes que sí le entran»— y nombra la medida de cada una. Nunca las llames «su medida».`
            : null,
        ].filter(Boolean).join(" "),
      });
    },
  });

  const respaldoMarcas = defineTool({
    name: "respaldo_marcas",
    description:
      "Origen, garantía de fábrica, seguro contra daños y rendimiento en km de cada marca (Falken, Kenda, Winrun), con los argumentos para justificar la diferencia de precio entre niveles. Úsala SIEMPRE que el cliente pregunte cuánto dura una llanta, de dónde es una marca, qué garantía o seguro tiene, o por qué una cuesta más que otra — y también cuando dude entre dos niveles: el costo por kilómetro es el argumento más fuerte. Pasa la marca y el precio cotizado si los tienes para recibir el costo por km ya calculado.",
    schema: z.object({
      marca: z
        .string()
        .nullable()
        .default(null)
        .describe("Marca puntual si la pregunta es sobre una (FALKEN, KENDA, WINRUN). Null = las tres, para comparar."),
      precio_con_iva: z
        .number()
        .nullable()
        .default(null)
        .describe("Precio por llanta ya cotizado, si existe: devuelve el costo por km de esa marca."),
    }),
    run: async ({ marca, precio_con_iva }) => {
      const completo = respaldoCompleto();
      const una = marca ? respaldoDeMarca(marca) : null;
      const costo = marca && precio_con_iva ? costoPorKm(marca, precio_con_iva) : null;
      return JSON.stringify({
        ...(una ? { marca: una } : { marcas: completo.marcas }),
        ...(costo ? { costo_por_km: costo } : {}),
        servicios_incluidos: completo.serviciosIncluidos,
        argumentos_para_subir_de_nivel: completo.argumentosParaSubirDeNivel,
        ejemplos_de_respuesta: completo.ejemplos,
        regla: [
          "El rendimiento en km es APROXIMADO y se dice así siempre, con su condición: depende del uso y del mantenimiento — y ahí mismo ofreces el mantenimiento gratuito y la rotación cada 10.000 km incluidos.",
          "Di siempre «hasta X meses» de seguro, nunca «X meses» a secas. Son dos respaldos distintos: garantía de fábrica (5 años, defectos) y seguro contra daños (meses según marca) — no los mezcles.",
          "NO detalles condiciones, exclusiones ni procedimiento del seguro. Si el cliente pregunta la letra chica o ya tiene una llanta dañada, escala con notificar_vendedor: tú no evalúas ni apruebas reclamos.",
          "GITI está en ingreso y sin condiciones definidas: no la cotices ni le prometas plazos.",
          "En uso de obra, cantera o carga pesada el rendimiento baja: dilo ANTES de dar la cifra.",
          "Nunca desprestigies la económica: se argumenta hacia arriba (la premium rinde más), no hacia abajo.",
        ].join(" "),
      });
    },
  });

  const tiposDeLlanta = defineTool({
    name: "tipos_de_llanta",
    description:
      "Explica los tipos de llanta que maneja Depot Tire y cuándo conviene cada uno. Úsala cuando el cliente no sabe qué tipo necesita o pregunta la diferencia entre A/T, H/T, M/T, etc.",
    schema: z.object({}),
    run: async () =>
      JSON.stringify({
        tipos: catalogoDeTipos().map((t) => ({
          tipo: t.clave, nombre: t.nombre, que_es: t.definicion,
          cuando_va: t.cuandoOfrecerla, cuando_no: t.noOfrecerlaSi,
        })),
        orden_de_marca: ordenDeMarca(),
        regla:
          "Usa estas definiciones tal cual; no inventes ventajas. Pregunta el uso del vehículo antes de recomendar un tipo.",
      }),
  });

  /**
   * La guía visual de la medida, con el aro marcado como dato clave.
   *
   * Existe porque «¿qué medida necesita?» es una pregunta que el cliente no
   * siempre sabe contestar, y responderle con más texto no ayuda: hay seis
   * números impresos en el costado y ninguno viene rotulado. La imagen convierte
   * la pregunta en algo que se resuelve mirando la llanta, y en la misma pieza
   * legitima la otra vía —mandar la foto— para el que ni así la ubica.
   *
   * No consulta el catálogo ni menciona precios: se manda ANTES de saber qué
   * llanta usa el cliente, que es cuando hace falta.
   */
  const guiaMedida = defineTool({
    name: "guia_medida",
    description:
      "Envía la imagen que explica cómo se lee la medida en el costado de la llanta, con el ARO (rin) marcado como el dato clave, y devuelve el texto que la acompaña. Úsala la PRIMERA vez que tengas que pedir la medida o el aro: en vez de preguntar en seco, el cliente ve dónde mirar. Y úsala SIEMPRE que el cliente diga que no sabe su medida, que no la encuentra, que no sabe dónde mirar o pregunte qué significan esos números — en ese caso pasa lo_pidio_el_cliente: true y se le manda otra vez aunque ya la haya recibido.",
    schema: z.object({
      aro: z
        .number()
        .int()
        .min(ARO_MIN)
        .max(ARO_MAX)
        .nullable()
        .default(null)
        .describe("Aro que el cliente YA dijo, si lo dijo. Cambia el pie de la imagen de «pídalo» a «confirmado». Null si todavía no lo sabes."),
      lo_pidio_el_cliente: z
        .boolean()
        .default(false)
        .describe("true SOLO si el cliente acaba de decir que no sabe la medida, que no la encuentra o que no sabe dónde mirar. false cuando la mandas tú por iniciativa propia al pedir la medida."),
    }),
    run: async ({ aro, lo_pidio_el_cliente }) => {
      // Mismo criterio que el candado de opciones: la pieza se manda una vez por
      // ciclo. Repetir una infografía que el cliente ya tiene en pantalla se lee
      // como que el bot no lo escuchó.
      //
      // Pero el candado es para el envío por INICIATIVA del bot. Si el cliente
      // dice «no sé dónde ver la medida», negarse a reenviarla es exactamente lo
      // contrario de escucharlo: pidió ayuda y se le contesta con un párrafo de
      // texto describiendo la imagen que existe y no se le manda. Pasó el 12-ago
      // en un chat que ya tenía cotización — la guía había salido al principio y
      // el candado la bloqueó justo cuando hacía falta.
      const [previa] = await sql<{ id: number }[]>`
        select id from messages
        where conversation_id=${ctx.conversation.id}
          and cycle=${ctx.conversation.current_cycle}
          and type='image'
          and metadata->>'piece'='medida_guide'
        limit 1
      `;
      if (previa && !lo_pidio_el_cliente) {
        return JSON.stringify({
          error:
            "La guía de la medida ya salió en esta conversación por iniciativa tuya y el cliente la tiene en pantalla. No la repitas sola: pregúntale directo el aro o la medida, o dile que mande la foto del costado. (Si él dice que no sabe o no la encuentra, vuelve a llamarme con lo_pidio_el_cliente: true.)",
        });
      }

      const visual = await sendVisual(
        ctx.conversation.id,
        ctx.customerPhone,
        async () =>
          // Sin brandProfiles a propósito: la guía no muestra ni una marca.
          renderMedidaGuideImage({
            dateLabel: dateLabel(),
            aroDelCliente: aro,
            ...(await getPiecesConfig()),
          }),
        "Así se lee la medida en el costado de la llanta 🛞",
        `Medida-${business.name.replace(/\s/g, "")}.png`,
        "guía de medida",
      );
      await appendMessage(
        ctx.conversation.id,
        "assistant",
        visual.ok ? "Guía de medida enviada" : "Guía de medida NO enviada",
        visual.providerId,
        {
          type: "image",
          authorKind: "bot",
          status: visual.ok ? "sent" : "failed",
          metadata: { piece: "medida_guide", ...(visual.error ? { renderError: visual.error } : {}) },
        },
      );

      // Si la imagen no salió, el texto tiene que explicar solo lo que la pieza
      // explicaba. La petición nunca puede quedarse sin las dos vías.
      const pedido = aro
        ? `Con aro ${aro} ya podemos avanzar. Si me confirma la medida completa del costado (ej. 225/65R17), le cotizo exacto.`
        : "Lo que más necesito es el *aro* — el número después de la R (ej. la R*17* de 225/65R17). Sin ese dato no le puedo asegurar que la llanta entre.";
      return JSON.stringify({
        imagen_enviada: visual.ok,
        aro_del_cliente: aro,
        mensaje_para_enviar: composeBlocks(
          visual.ok
            ? pedido
            : `${pedido}\nLa medida está impresa en el costado de la llanta, en formato 225/65R17.`,
          "¿Me dice la medida, o prefiere mandarme una foto del costado y la leo yo? 📸",
        ),
        regla:
          "Responde exactamente con mensaje_para_enviar, con sus separadores '---' intactos. La imagen ya explica los seis números: no los repitas en texto. Si el cliente contesta con el aro, con la medida o con una foto, sigue de una hacia las opciones.",
      });
    },
  });

  /**
   * La salida del callejón sin salida.
   *
   * Ticket 2150 del 8-ago-2026: el cliente escribió «xfavor ya le envío y q me
   * ayude con una cotización» y el bot contestó «apenas me envíe la foto con la
   * medida le hago la cotización». Tres turnos seguidos pidiendo lo mismo, cero
   * ofrecido. El dueño terminó mandando las opciones a mano.
   *
   * El prompt ya prohibía cerrar un turno con una petición sola, pero cuando no
   * hay medida NI aro NI vehículo no había una sola herramienta que el modelo
   * pudiera llamar: con las manos vacías lo único que le queda es preguntar, y
   * pregunta para siempre. Esta tool le da con qué contestar.
   *
   * Los dos pasos van aquí y no en el prompt porque son una decisión de negocio,
   * no un criterio del modelo: primero se pide el aro ofreciendo cuáles hay; si
   * el cliente vuelve a pedir sin darlo, se le muestra stock real y se le
   * explica por qué el aro manda. Que la pieza de la guía ya haya salido es el
   * rastro determinista de que "ya se le pidió una vez".
   */
  const opcionesSinMedida = defineTool({
    name: "opciones_sin_medida",
    description:
      "Úsala cuando el cliente pide opciones, precio o cotización y NO tienes medida, ni aro, ni vehículo. Ese pedido NUNCA se contesta solo con una pregunta: esta herramienta te dice qué toca según cuántas veces ya se lo pediste. La primera vez te devuelve los aros que sí hay en stock para que pidas el aro ofreciendo algo concreto; si el cliente ya lo pidió otra vez sin darlo, te devuelve una muestra real del stock para que la mandes con preparar_opciones y le expliques por qué el aro decide. Si el cliente SÍ dio un aro va buscar_por_aro_y_tipo, y si dio vehículo va fitment_vehiculo — esta es solo para cuando no hay nada.",
    schema: z.object({}),
    run: async () => {
      await ensureCatalogReady();
      const aros = arosConStock();
      const rango = rangoDeAros(aros);

      // ¿Ya se le pidió el aro en este ciclo? La guía de medida es el rastro:
      // el prompt manda mandarla justo la primera vez que se pide la medida, así
      // que si ya salió, esta es la segunda vez que el cliente pregunta.
      const [guiaPrevia] = await sql<{ id: number }[]>`
        select id from messages
        where conversation_id=${ctx.conversation.id}
          and cycle=${ctx.conversation.current_cycle}
          and type='image'
          and metadata->>'piece'='medida_guide'
        limit 1
      `;

      if (!guiaPrevia) {
        return JSON.stringify({
          paso: "pedir_el_aro",
          aros_en_stock: aros,
          rango_para_decir: rango,
          regla: rango
            ? `Todavía no se le ha pedido el aro con la guía. Manda guia_medida (con aro: null) y en el texto dile que manejamos del ${rango} — así la pregunta viene con una oferta y no en seco. NO llames preparar_opciones en este turno: sin aro no sabes qué mostrarle. Si el cliente contesta con el aro, sigues de una con buscar_por_aro_y_tipo.`
            : "Todavía no se le ha pedido el aro con la guía. Manda guia_medida (con aro: null). No prometas aros: hoy el catálogo no tiene stock que puedas nombrar.",
        });
      }

      // Segunda vez: ya se le pidió y volvió a pedir sin dar el aro. Aquí sí
      // sale la pieza, con stock real y el límite dicho en la misma respuesta.
      const muestra = muestraDelStock();
      if (!muestra.length) {
        return JSON.stringify({
          paso: "sin_stock_que_mostrar",
          regla:
            "El catálogo no tiene stock que mostrar. No inventes opciones: explícale en una línea que el aro es lo que decide si la llanta entra e invítalo a pasar por el local para medirlo.",
        });
      }
      return JSON.stringify({
        paso: "mostrar_muestra_e_invitar",
        opciones: muestra.map(toolItem),
        aros_en_stock: aros,
        rango_para_decir: rango,
        // Solo los nombres: la dirección escrita no se manda nunca (va el link
        // de Maps con ubicacion_locales), y si el modelo la ve, la escribe.
        locales: business.stores.map((s) => s.name),
        regla:
          "Llama preparar_opciones con estos códigos AHORA: el cliente pidió opciones dos veces y esta vez las ve. En el texto que acompaña la pieza van tres cosas y ninguna más: (1) que es una muestra de lo que manejamos, NO su medida; (2) en UNA línea, por qué el aro manda — si no coincide, la llanta no entra, y por eso no le puedes afirmar precio todavía; (3) la invitación a pasar por el local a que se lo midan. PROHIBIDO afirmar que estas llantas le sirven a su carro, y PROHIBIDO cotizar sobre ellas. Si en algún momento dice el aro o el vehículo, esto se descarta y vas por buscar_por_aro_y_tipo o fitment_vehiculo.",
      });
    },
  });

  const fitmentVehiculo = defineTool({
    name: "fitment_vehiculo",
    description:
      "Dado un vehículo (marca, modelo y año), investiga qué medidas le van y te devuelve YA las opciones del catálogo que puedes mandar. Úsala cuando el cliente no dio la medida. Si ya dio una medida escrita, esa manda y va buscar_llanta; si dio solo un aro sin vehículo, va buscar_por_aro_y_tipo. Si dijo aro Y vehículo, puedes usar cualquiera de las dos, pero si usas esta manda SIEMPRE el 'aro': con él la investigación distingue la generación correcta y las opciones salen mucho mejor apuntadas. Devuelve siempre 'opciones' con lo que hay en stock, así que nunca te quedas sin algo que ofrecer. Si necesitas la medida exacta puedes pedirla escrita O pedir una foto del costado de la llanta — las dos sirven, sabes leer fotos.",
    schema: z.object({
      marca: z.string().describe("Marca del vehículo, ej. Chevrolet"),
      modelo: z.string().describe("Modelo, ej. Sail, D-Max, Hilux"),
      anio: z.number().int().min(1950).max(2030).nullable().default(null),
      aro: z
        .number()
        .int()
        .min(12)
        .max(24)
        .nullable()
        .default(null)
        .describe("Aro en pulgadas si el cliente lo dijo (ej. 19 de 'para rin 19'). Null si no lo dijo. Mándalo siempre que lo sepas: es lo que distingue una versión de otra."),
    }),
    run: async ({ marca, modelo, anio, aro }) => {
      const vehicle = `${marca} ${modelo}${anio ? ` ${anio}` : ""}`.trim();
      await updateConversationFacts(ctx.conversation.id, { vehicle, ...(anio ? { vehicleYear: anio } : {}) });
      const result = await researchVehicleFitment(marca, modelo, anio, aro);
      const { opciones, origen, medidasConStock, medidasAgotadas } = await opcionesDeFitment(result.sizes, aro);

      // El caso «o rin 15 o rin 17». Solo se calcula cuando el cliente NO dijo
      // su aro: si lo dijo, la ambigüedad ya la resolvió él y recordársela sería
      // devolverle una duda que no tiene.
      const arosPosibles = arosDeCandidatos(result.candidatos);
      const arosConStock = arosDeMedidas(medidasConStock);
      const invitacionAro = aro ? null : invitacionPorAroAmbiguo(result.vehicle, arosConStock);

      // El candado: la respuesta lleva opciones aunque la investigación haya
      // fallado. Lo único que cambia es qué puede AFIRMAR el vendedor sobre
      // ellas, y eso lo dice `origen_opciones` junto con su regla.
      const reglaOrigen = origen ? REGLA_POR_ORIGEN[origen] : null;
      return JSON.stringify({
        encontrado: result.status !== "not_found",
        medidas: result.sizes,
        aros_posibles: arosPosibles,
        aros_con_stock: arosConStock,
        ...(invitacionAro ? { invitacion_por_aro_ambiguo: invitacionAro } : {}),
        // Cada medida con su respaldo: el vendedor necesita saber cuál puede
        // defender y cuál solo ofrecer con reservas.
        candidatos: result.candidatos.map((c) => ({ medida: c.medida, confianza: c.confianza, porque: c.porque })),
        compatibilidad_confirmada: result.status === "verified",
        estado: result.status,
        aro_del_cliente: aro,
        nota: result.note,
        fuentes: result.sources,
        medidas_con_stock: medidasConStock,
        medidas_agotadas: medidasAgotadas,
        opciones: opciones.map(toolItem),
        origen_opciones: origen,
        siguiente_pregunta: result.nextQuestion,
        regla: [
          "PROHIBIDO cerrar el turno con la limitación y una pregunta sola: en 'opciones' ya tienes llantas reales del catálogo, listas para preparar_opciones sin volver a buscar.",
          reglaOrigen,
          result.sources.length ? "Menciona la fuente cuando afirmes una medida." : null,
          // El aro ambiguo se resuelve en el local, no por chat: preguntar la
          // versión a alguien que no la sabe mata la conversación, y con stock
          // en los dos aros la duda es un motivo para venir, no un bloqueo.
          invitacionAro
            ? `Ese vehículo tiene DOS aros de fábrica y hay stock para los dos. Di 'invitacion_por_aro_ambiguo' tal cual en vez de preguntar la versión, y cierra invitándolo a pasar. No elijas un aro por él ni afirmes que su carro usa uno solo.`
            : null,
          "Si necesitas la medida exacta, pídela de las dos formas: escrita del filo de la llanta (ej. 225/65R17) o una foto del costado. Sabes leer fotos, así que la foto es una vía válida y para mucha gente es la más fácil. Si el cliente no ubica la medida, manda guia_medida: la imagen le muestra dónde está el aro.",
        ]
          .filter(Boolean)
          .join(" "),
      });
    },
  });

  const prepararOpciones = defineTool({
    name: "preparar_opciones",
    description:
      "Envía la imagen de opciones al cliente y devuelve el texto corto que la acompaña. Úsala después de confirmar la medida. Manda como máximo TRES: una premium, una de equilibrio y una económica — más opciones confunden y bajan el cierre. Elige UNA como recomendación con un motivo concreto: la herramienta decide sola si el texto la ofrece o ya se la entrega (se la entrega cuando el cliente pidió precio o pidió que le recomienden). Responde con el texto que devuelve, sin reescribir precios.",
    schema: z.object({
      codes: z.array(z.string().min(1)).min(1).max(6),
      nombre_cliente: z.string().default("Cliente"),
      recomendado: z
        .string()
        .min(1)
        .describe(
          "Código de la opción que TÚ recomiendas, de entre las de codes. Se entrega en este turno si el cliente ya pidió precio o recomendación; si no, queda guardada para cuando la pida.",
        ),
      motivo: z
        .string()
        .min(8)
        .max(140)
        .describe(
          "Una sola frase de por qué esa: el criterio real (uso, duración, precio). Sin inventar ventajas técnicas no verificadas. Es lo que acompaña a la recomendación cuando se entrega.",
        ),
      cantidad: z
        .number()
        .int()
        .min(1)
        .max(500)
        .nullable()
        .default(null)
        .describe(
          "Cantidad de LLANTAS que el cliente pidió de forma inequívoca. Null si no dijo cantidad o si el número pertenece al modelo del carro, una hora, las marcas/opciones o el menú. Sin cantidad se usa el juego de 4 llantas; PROHIBIDO preguntar.",
        ),
    }),
    run: async ({ codes, nombre_cliente, recomendado, motivo, cantidad }) => {
      await ensureCatalogReady();
      const encontrados = codes
        .map((code) => findByCode(code))
        .filter((product): product is NonNullable<typeof product> => Boolean(product));
      if (!encontrados.length) {
        return JSON.stringify({ error: "No se encontraron los productos seleccionados" });
      }
      // Tope de tres, una por escalón de marca. El cliente lo pidió explícito:
      // seis opciones confunden y el cliente termina sin elegir ninguna.
      // CANDADO 2 — respeto del tipo pedido. El 6-ago-2026 (ticket 1286) el
      // cliente pidió «265/70/17 AT» y recibió un FALKEN WILDPEAK M/T y una
      // KENDA sin tipo verificado: dos de tres no eran lo que pidió. El modelo
      // elige los códigos, pero el filtro por tipo no se negocia.
      const inbound = await sql<{ content: string; created_at: Date }[]>`
        select content, created_at from messages
        where conversation_id=${ctx.conversation.id}
          and cycle=${ctx.conversation.current_cycle}
          and direction='inbound'
        order by created_at desc limit 12
      `;
      const restricciones = restriccionesDeLlanta([
        ...mensajesDeLaVisitaActual(inbound).map((m) => m.content).reverse(),
        ctx.currentUserText,
      ]);
      const encontradosPermitidos = encontrados.filter(
        (product) => !violaRestriccionesDeLlanta(product.sizeLabel, restricciones),
      );
      if (!encontradosPermitidos.length) {
        return JSON.stringify({
          error: "opciones_rechazadas_por_el_cliente",
          anchos_rechazados: restricciones.anchosRechazados,
          regla:
            "PROHIBIDO reenviar, recomendar o cotizar esas opciones: el cliente ya rechazó ese ancho por calce, roce o consumo. Busca una medida que respete su restricción o deriva al asesor si el calce requiere confirmación.",
        });
      }
      // EL ARO DEL CLIENTE MANDA. 31-ago (conv 3 c20): venía de «una rin 15»,
      // rechazó el 185, y el modelo barato buscó una 205/55R16 inventada — la
      // pieza salió con aro 16 para un cliente de aro 15. El aro dicho por el
      // cliente es un dato suyo: una opción de otro aro solo pasa si él nombró
      // esa medida completa con sus propias palabras.
      const textosDeLaVisita = [
        ...mensajesDeLaVisitaActual(inbound).map((m) => m.content).reverse(),
        ctx.currentUserText,
      ];
      const aroVigente = aroVigenteDeLaVisita(textosDeLaVisita);
      const medidasDichas = medidasPermitidas(textosDeLaVisita, null);
      const coherentes = aroVigente
        ? encontradosPermitidos.filter(
            (p) => p.size?.rim === aroVigente || medidaEstaPedida(p.sizeLabel, medidasDichas),
          )
        : encontradosPermitidos;
      if (aroVigente && !coherentes.length) {
        return JSON.stringify({
          error: "opciones_de_otro_aro",
          aro_del_cliente: aroVigente,
          aros_de_las_opciones: [...new Set(encontradosPermitidos.map((p) => p.size?.rim).filter(Boolean))],
          regla:
            `El cliente pidió aro ${aroVigente} y TODAS estas opciones son de otro aro: no se le mandan. `
            + `Busca con buscar_por_aro_y_tipo (aro: ${aroVigente}) y arma la pieza con lo que esa búsqueda devuelva; `
            + "si ahí no hay nada que respete lo que pidió, díselo con todas las letras en vez de mostrarle otra cosa.",
        });
      }
      const tipoPedido = tipoSolicitadoEn([
        ctx.currentUserText,
        ...inbound.map((m) => m.content),
      ]);
      let avisoTipo: string | null = null;
      let candidatos = coherentes;
      if (tipoPedido) {
        const coinciden = coherentes.filter(
          (p) => tipoDeProducto(p.code, p.design) === tipoPedido,
        );
        const resto = coherentes.filter((p) => !coinciden.includes(p));
        if (coinciden.length >= 2) candidatos = coinciden;
        else if (coinciden.length === 1) candidatos = [...coinciden, ...resto];
        else {
          avisoTipo = `El cliente pidió ${tipoPedido} y ninguna de estas opciones es de ese tipo verificado: dilo en una línea y ofrece lo más cercano.`;
        }
      }
      // Solo se enseña lo que alcanza para la compra (Joaquín, 26-ago): con
      // menos de un juego, elegir esa opción termina en un aviso de stock corto
      // que desdice la pieza. Va ANTES del tope de tres para que las tres que
      // se muestran sean tres vendibles. Ver `opcionesQueAlcanzan`.
      const [cantidadDelCliente] = await sql<{ selected_quantity: number | null }[]>`
        select selected_quantity from conversations where id=${ctx.conversation.id}
      `;
      const cantidadResuelta = cantidadParaPrepararOpciones({
        declarada: cantidad,
        guardada: cantidadDelCliente?.selected_quantity,
        textoActual: ctx.currentUserText,
        ultimoMensajeNuestro: await lastOutboundText(ctx.conversation.id),
        mensajeCitado: ctx.mensajeCitado,
      });
      // Convs 11366, 11005 y 11357, 26–27-ago-2026: antes el webhook escribía
      // 5 por «Arrizo 5», 3 por «las 3 marcas» y 5 por «pasado las 5» ANTES de
      // que el agente entendiera el mensaje. Ahora la ficha se toca aquí: por
      // argumento estructurado o, si el modelo lo omitió, por una frase que el
      // respaldo reconoce sin ambigüedad. El default 4 no se finge confirmado.
      if (cantidadResuelta.guardar) {
        await updateConversationFacts(ctx.conversation.id, {
          selectedQuantity: cantidadResuelta.cantidad,
        });
      }
      const vendibles = opcionesQueAlcanzan(
        candidatos, cantidadResuelta.cantidad,
      );
      // NINGUNA con stock: no se dibuja la pieza. Antes esto era imposible
      // —la red de emergencia devolvía todo— y por eso salían llantas
      // rotuladas «Sin stock» en la vitrina (conv 11302, 27-ago). Decirlo en
      // una línea y ofrecer al asesor vende más que una imagen de lo que no hay.
      if (!vendibles.length) {
        return JSON.stringify({
          error: "sin_stock_en_la_medida",
          regla: "NINGUNA de esas llantas tiene stock. NO mandes la pieza de opciones. "
            + "Dile al cliente en una línea que en esa medida no hay stock ahora mismo, "
            + "ofrécele que el asesor se lo confirme o consiga por pedido, y pregúntale "
            + "si quiere que le busques una medida equivalente.",
        });
      }
      // Tope de tres, una por escalón de marca. El cliente lo pidió explícito:
      // seis opciones confunden y el cliente termina sin elegir ninguna.
      const products = vendibles.length > 3 ? tresOpciones(vendibles) : vendibles;

      // CANDADO 3 — la medida de lo que se enseña. El 13-ago (chat 5499) el
      // cliente pidió 265/70R16 y esta pieza salió con 215/60R16, 245/70R16 y
      // 225/70R16: tres medidas, ninguna la suya, y rotulada con la de la
      // primera. Aquí no se bloquea —enseñar equivalencias es válido y a veces
      // es la única venta posible— pero deja de ser silencioso: el agente
      // recibe la orden de decir que son de otra medida, y la imagen no se
      // rotula con una medida que no representa a todas.
      const medidasMostradas = medidasDeProductos(products);
      const [medidaDeLaConversacion] = await sql<{ tire_size: string | null }[]>`
        select tire_size from conversations where id=${ctx.conversation.id}
      `;
      // Misma ventana que el candado de la cotización: lo que pidió en otra
      // visita no vuelve «de su medida» a una llanta que no lo es.
      const permitidasOpciones = medidasPermitidas(
        [ctx.currentUserText, ...mensajesDeLaVisitaActual(inbound).map((m) => m.content)],
        medidaDeLaConversacion?.tire_size,
      );
      const fueraDeMedida = products.filter(
        (p) => !medidaEstaPedida(p.sizeLabel, permitidasOpciones),
      );
      const avisoMedida = fueraDeMedida.length
        ? `OJO: el cliente pidió ${permitidasOpciones.join(" o ")} y ${
            fueraDeMedida.length === products.length ? "NINGUNA de estas opciones es de esa medida" : "algunas de estas opciones son de otra medida"
          } (${fueraDeMedida.map((p) => `${p.design} es ${p.sizeLabel}`).join("; ")}). ` +
          "Dilo con todas las letras en tu respuesta —«en su medida no me queda, estas son equivalentes que sí le entran»— y nombra la medida de cada una. " +
          "NUNCA le digas que son de su medida, y no cotices ninguna hasta que él acepte la equivalencia."
        : null;
      // La aclaración va HORNEADA en el mensaje, no solo en la regla: este
      // turno sale verbatim por exactToolReply, así que el modelo nunca tiene
      // oportunidad de agregarla. Confiar en la regla fue el hueco que el
      // guardián corrigió 12 veces en la semana del 14-ago («el borrador no
      // aclara que son equivalentes»): la orden existía y nadie podía cumplirla.
      const avisoMedidaCliente = fueraDeMedida.length && permitidasOpciones.length
        ? (fueraDeMedida.length === products.length
            ? `⚠️ Ojo: en *${permitidasOpciones.join(" / ")}* no me queda disponibilidad exacta. Estas son *equivalentes* de su aro: ${fueraDeMedida.map((p) => `${p.design} en ${p.sizeLabel}`).join(", ")}. Se confirma el calce al montar.`
            : `⚠️ Ojo: no todas son de su medida *${permitidasOpciones.join(" / ")}* — ${fueraDeMedida.map((p) => `${p.design} es ${p.sizeLabel}`).join(", ")} (equivalentes de su aro).`)
        : null;

      // CANDADO 1 — anti-reenvío. Tickets 1288 y 1415 del 6-ago-2026: la misma
      // pieza de opciones salió hasta 4 veces en la misma conversación y el
      // cliente lo único que quería era el precio. Si ya la tiene en pantalla,
      // no se reenvía: se le responde lo que preguntó.
      const sizeLabelActual = products[0]?.sizeLabel ?? null;
      const [previo] = await sql<{ metadata: Record<string, unknown> | null; content: string; minutos: number }[]>`
        select content, metadata,
               extract(epoch from (now() - created_at))/60 as minutos
        from messages
        where conversation_id=${ctx.conversation.id}
          and cycle=${ctx.conversation.current_cycle}
          and type='image'
          and metadata->>'piece'='options'
        order by created_at desc limit 1
      `;
      const previoNormalizado = previo
          ? {
            sizeLabel:
              (previo.metadata?.sizeLabel as string | undefined) ??
              medidaDesdeContenido(previo.content),
            minutos: Number(previo.minutos),
            codes: Array.isArray(previo.metadata?.codes)
              ? previo.metadata.codes.map(String)
              : undefined,
          }
        : null;
      if (debeBloquearReenvio(previoNormalizado, sizeLabelActual, ctx.currentUserText, products.map((p) => p.code))) {
        const minutos = Math.max(1, Math.round(previoNormalizado!.minutos));
        return JSON.stringify({
          error: `Las opciones de ${sizeLabelActual ?? "esa medida"} YA se enviaron hace ${minutos} min y el cliente las tiene en pantalla. PROHIBIDO reenviarlas. Si pidió precio o eligió un modelo, llama generar_cotizacion con ese modelo (4 unidades si no dijo cantidad). Si preguntó otra cosa, respóndela directo en texto.`,
        });
      }

      // EL PRECIO DE LA PIEZA SE CONFIRMA CONTRA EL INTERBOT (16-ago).
      //
      // Interbot es la fuente del precio de venta real. Pero la pieza de
      // opciones dibujaba `item.minimumPriceWithTax`, que es el catálogo en
      // memoria, y a ese campo solo lo reescribe `applyInterbotPrices` durante
      // el barrido COMPLETO — que desde el 12-ago corre una vez por semana
      // (miércoles 15:00). O sea: si Depot cambiaba un precio un jueves, la
      // pieza enseñaba el viejo hasta el miércoles siguiente, mientras
      // `generar_cotizacion` —que sí pregunta en el momento— firmaba el nuevo.
      // El cliente veía un número en la imagen y otro en la cotización.
      //
      // Aquí se pregunta por las medidas que se están mostrando (una consulta
      // por medida, no el barrido de ~156) y se vuelca sobre los productos que
      // van a salir dibujados. Es la MISMA fuente y el MISMO momento que usa la
      // cotización, así que los dos números coinciden por construcción.
      const medidasAConfirmar = [...new Set(products.map((p) => p.sizeLabel).filter(Boolean))] as string[];
      await Promise.all(medidasAConfirmar.map((medida) => refreshPriceForSize(medida)));
      applyInterbotPrices(products);

      // La recomendación tiene que ser una de las opciones mostradas. Si el
      // modelo apunta a otra cosa, se cae a la primera en vez de recomendar algo
      // que el cliente no está viendo.
      const recommended =
        products.find((product) => product.code === recomendado) ?? products[0];

      // Pieza visual del catálogo (agrupada por marca). Si falla, el texto
      // sigue siendo la respuesta — el cliente nunca se queda sin opciones.
      //
      // El rótulo solo se pone cuando las tres SON de la misma medida. Con un
      // grupo mezclado, «Opciones disponibles en 215/60R16» —la medida de la
      // primera— es sencillamente falso para las otras dos, y es lo que el
      // cliente del 5499 vio antes de que le firmaran otra medida.
      const sizeLabel = medidasMostradas.length === 1 ? sizeLabelActual : null;
      // Los beneficios vigentes van a la FRANJA de la pieza (P-07): la imagen
      // los dice resaltados y el texto ya no los repite cuando la imagen salió.
      const beneficiosPieza = await applicableBenefitTexts({
        brands: products.map((product) => product.brand),
      });
      const visual = await sendVisual(
        ctx.conversation.id,
        ctx.customerPhone,
        async () =>
          renderOptionsImage({
            dateLabel: dateLabel(),
            sizeLabel,
            // Con esto cada tarjeta sale marcada: verde MEDIDA EXACTA, o el
            // sello rojo de equivalente. Es la medida que el cliente pidió.
            medidaPedida: permitidasOpciones[0] ?? null,
            benefits: beneficiosPieza,
            ...(await getPiecesConfig()),
            brandProfiles: await brandProfilesForRender(),
            products: await Promise.all(products.map((product) => toRenderLine(product))),
          }),
        `Opciones disponibles${sizeLabel ? ` en ${sizeLabel}` : ""} 🏁`,
        `Opciones-${business.name.replace(/\s/g, "")}.png`,
        "opciones",
      );
      const resumenProductos = products.map((p) => `${p.brand} ${p.design}`).join(" · ");
      // Los tres escalones DE LO QUE ESTÁ EN PANTALLA, para que la respuesta
      // a la pregunta de preferencia («la más barata», «la del medio», «la
      // mejor») se pueda entregar al siguiente turno sin volver a buscar.
      // Quedan también en la metadata del mensaje: es de ahí que los hechos
      // del agente (getAgentSalesFacts) los recuperan en el turno siguiente.
      const escalones = escalonesDeOpciones(
        products.map((p) => ({
          codigo: p.code,
          nombre: `${p.brand} ${p.design}`,
          precio_con_iva: p.minimumPriceWithTax,
        })),
      );
      await appendMessage(
        ctx.conversation.id,
        "assistant",
        visual.ok
          ? `Opciones enviadas: ${resumenProductos}`
          : `Imagen de opciones NO enviada (${resumenProductos})`,
        visual.providerId,
        {
          type: "image",
          authorKind: "bot",
          status: visual.ok ? "sent" : "failed",
          // sizeLabel queda en metadata para que el candado anti-reenvío pueda
          // comparar medidas sin tener que parsear el texto del caption.
          // `products.map(...)` y no `codes` (16-ago). El candado anti-reenvío
          // compara lo guardado aquí contra `products.map((p) => p.code)` del
          // turno siguiente, y `debeBloquearReenvio` se DESACTIVA en cuanto los
          // dos conjuntos difieren. Guardar los códigos crudos del modelo —hasta
          // 6, sin filtrar por catálogo ni por tipo, sin capar a 3— hacía que
          // casi nunca coincidieran: el candado se apagaba solo y la pieza de
          // opciones volvía a salir. Lo que hay que comparar son las tarjetas
          // que el cliente tiene en pantalla.
          // `equivalentes` es el HECHO de que el bot le dijo con todas las letras
          // «en su medida no me queda, estas son equivalentes». Sin él, esa
          // declaración vivía un solo turno: el cliente aceptaba («me gusta la
          // Falken», «ok») y la cotización de la equivalente se bloqueaba por
          // ser «otra medida», porque nadie había anotado que él ya la aceptó.
          // Eso es la mitad del caso 4732 —«nunca le mandó la cotización»— y
          // por qué esto se guarda en vez de confiar en el historial.
          metadata: {
            piece: "options",
            codes: products.map((p) => p.code),
            sizeLabel,
            escalones,
            ...(avisoMedidaCliente ? { equivalentes: medidasDeProductos(fueraDeMedida) } : {}),
            ...(visual.error ? { renderError: visual.error } : {}),
          },
        },
      );
      // La imagen es la pieza principal: sin ella el cliente recibe solo el
      // texto largo, que es justo lo que el cliente pidió evitar. Antes esto
      // fallaba en silencio; ahora queda alerta y el asesor puede reaccionar.
      if (!visual.ok) {
        await createBotAlert({
          conversationId: ctx.conversation.id,
          cycle: ctx.conversation.current_cycle,
          type: "send_error",
          priority: "high",
          summary: `No se pudo enviar la imagen de opciones (${products.length} productos)`,
          exactReason: visual.error ?? "Motivo desconocido",
          suggestedAction:
            "El cliente recibió las opciones solo en texto. Revisar el error y reenviar la pieza si hace falta.",
          dedupeKey: `${ctx.conversation.id}:${ctx.conversation.current_cycle}:options_image_error:${codes.join(",")}`,
        });
      }
      await logQuoteArtifact({
        conversationId: ctx.conversation.id,
        kind: "options",
        products: products.map((product) => ({
          id: product.id,
          code: product.code,
          brand: product.brand,
          design: product.design,
          size: product.sizeLabel,
        })),
      });
      // La imagen es el mensaje: si salió, el texto no la presenta ni la
      // resume — y el INCLUYE tampoco va en texto, porque la franja de la
      // pieza ya lo dice resaltado (P-07, reunión 25-ago: «se manda dos
      // veces»). El texto solo lo lleva si la imagen falló (nadie se queda
      // sin la info) o si el cliente preguntó expresamente qué incluye.
      // El cliente preguntó por una marca puntual y la pieza no la trae: se le
      // dice ANTES de las opciones, con los datos de esta misma búsqueda.
      // T115 conv 11274 (ancla H08), 30-ago: pidió Falken 255/70R16, recibió
      // KENDA y WINRUN, y ningún texto le dijo si había Falken o no — el
      // mensaje sale de esta plantilla, así que el aviso tiene que nacer aquí.
      const marcaPedida = marcaPreguntada(ctx.currentUserText ?? "");
      const avisoMarcaCliente =
        marcaPedida && !products.some((p) => (p.brand ?? "").toUpperCase().includes(marcaPedida))
          ? `De *${marcaPedida}* no tengo disponibilidad en esta medida por ahora; estas son las alternativas que sí le puedo entregar:`
          : null;
      const clientePidioIncluye = requestsBenefitsAgain(ctx.currentUserText);
      const beneficios = debeLlevarIncluyeEnTexto(visual.ok, clientePidioIncluye)
        ? await buildBenefitsBlockOnce(
            ctx.conversation.id,
            ctx.conversation.current_cycle,
            { brands: products.map((product) => product.brand) },
            clientePidioIncluye,
          )
        : null;
      // La recomendación se entrega en este mismo turno cuando el cliente ya
      // preguntó el precio, ya pidió que le recomienden, ya contó PARA QUÉ la
      // quiere (familia 2 del guardián: «¿necesita recomendación?» con la
      // recomendación ya preparada), o ya contestó la pregunta de preferencia.
      const preferencia = respuestaDePreferencia(ctx.currentUserText);
      const dijoSuUso = [ctx.currentUserText, ...inbound.map((m) => m.content)].some((texto) =>
        describeUso(texto ?? ""),
      );
      const entregarRecomendacion =
        pidePrecio(ctx.currentUserText) ||
        pideRecomendacion(ctx.currentUserText) ||
        dijoSuUso ||
        preferencia !== null;
      // Si contestó la preferencia, la recomendada ES la de ese escalón — no
      // la que eligió el modelo: «la más barata» no admite otra respuesta.
      const porPreferencia = preferencia
        ? products.find((p) => p.code === escalones[preferencia === "precio" ? "economica" : preferencia]?.codigo)
        : undefined;
      const entregada = porPreferencia ?? recommended;
      const recomendacion = `${entregada.brand} ${entregada.design}`;
      // El `motivo` lo escribió el modelo para SU recomendada. Si la
      // preferencia del cliente eligió OTRA llanta, ese motivo describe a la
      // equivocada y saldría verbatim en el cierre («la mejor duración» sobre
      // la más barata): el escalón elegido trae su propio porqué.
      const motivoDelEscalon: Record<string, string> = {
        precio: "es la de mejor precio de las tres",
        equilibrada: "es el punto medio entre precio y rendimiento",
        premium: "es la premium de las tres",
      };
      const motivoLimpio =
        porPreferencia && porPreferencia.code !== recommended.code
          ? motivoDelEscalon[preferencia!]
          : motivo.trim().replace(/\.$/, "");
      // La recomendación entregada AUTORIZA la cotización de este turno: el
      // cliente ya dio la señal (precio, recomendación, uso o menú) y la
      // política del corpus permite el juego de 4 como propuesta.
      if (entregarRecomendacion) ctx.recomendacionEntregada = true;
      return JSON.stringify({
        imagen_enviada: visual.ok,
        ...(avisoTipo ? { aviso: avisoTipo } : {}),
        ...(avisoMedida ? { aviso_medida: avisoMedida } : {}),
        medidas_mostradas: medidasMostradas,
        recomendacion,
        motivo_recomendacion: motivoLimpio,
        recomendacion_entregada: entregarRecomendacion,
        escalones,
        mensaje_para_enviar: composeBlocks(
          (await soloLaFoto(visual.ok))
            ? null
            : buildCustomerOptionsMessageDetallado(products, nombre_cliente),
          avisoMarcaCliente,
          avisoMedidaCliente,
          beneficios,
          buildCierreOpciones({
            entregarRecomendacion,
            recomendacion,
            motivo: motivoLimpio,
            precioConIva: entregada.minimumPriceWithTax ?? null,
            // El cierre no puede prometer «la opción exacta para su medida» en
            // dos casos: cuando hay equivalentes en la pieza (guardián del
            // 26-ago) y cuando NO SABEMOS su medida —buscó por aro o por
            // vehículo—. El 27-ago (conv 3, «tiene at rin 16?») el menú salió
            // prometiendo «para su medida» sin que el cliente hubiera dado
            // ninguna, y el guardián lo corrigió llevándose el menú entero: el
            // turno terminó pidiéndole otra vez la medida en vez de avanzar.
            hayEquivalentes: fueraDeMedida.length > 0 || permitidasOpciones.length === 0,
            // El menú ofrece SOLO los escalones que la pieza trae: con dos
            // opciones el del medio queda vacío y ofrecerlo igual es prometer
            // algo que no se puede entregar (conv 3, 27-ago).
            escalonesDisponibles: (["precio", "equilibrada", "premium"] as const).filter(
              (k) => escalones[k === "precio" ? "economica" : k] != null,
            ),
          }),
        ),
        regla: [
          "Responde usando exactamente mensaje_para_enviar, con sus separadores '---' intactos. No sumes alternativas ni repitas en texto lo que ya muestra la imagen.",
          entregarRecomendacion
            ? "El cliente YA pidió precio, recomendación, dijo su uso o contestó su preferencia: el texto le entrega la recomendación y AHORA MISMO, EN ESTE MISMO TURNO, llamas generar_cotizacion por `recomendacion` con 4 llantas (o la cantidad que el cliente haya dicho). PROHIBIDO preguntarle si la quiere y PROHIBIDO terminar el turno sin la cotización: ya te dio la señal."
            : "NO adelantes la recomendación en este turno: el texto cierra con el menú de preferencia (1 Costo / 2 Equilibrio / 3 Premium). Si el cliente responde «1», «2», «3», «costo», «equilibrio», «premium» (o «la más barata», «la del medio», «la mejor»), entrega la opción de ESE escalón de `escalones` — nombre y precio con IVA — y ofrece cotizarla por 4 llantas, sin volver a preguntar nada. Si responde un sí genérico, dile en UNA frase que irías por `recomendacion` porque `motivo_recomendacion`.",
          // La única excepción a «no agregues texto»: avisar que la medida no
          // es la suya. Callarlo es lo que terminó en una cotización firmada
          // por otra medida (5499).
          avisoMedida ? `EXCEPCIÓN OBLIGATORIA: ${avisoMedida}` : null,
        ].filter(Boolean).join(" "),
      });
    },
  });

  const enviarComparacion = defineTool({
    name: "enviar_comparacion",
    description:
      "Genera y envía un PDF comparativo de 2–3 llantas distintas. Úsala cuando el cliente esté dudando explícitamente entre modelos concretos. La comparación es por unidad y nunca suma las opciones como una compra.",
    schema: z.object({
      codes: z.array(z.string().min(1)).min(2).max(3),
    }),
    run: async ({ codes }) => {
      await ensureCatalogReady();
      const products = codes.map((code) => findByCode(code));
      if (products.some((product) => !product)) {
        return JSON.stringify({ error: "Uno de los códigos ya no existe; vuelve a buscar" });
      }
      const selected = products.filter(
        (product): product is NonNullable<typeof product> => Boolean(product),
      );
      if (new Set(selected.map((product) => product.id)).size !== selected.length) {
        return JSON.stringify({ error: "La comparación exige modelos distintos" });
      }
      // Pieza visual primero (lo que pidió el cliente); el PDF queda de respaldo.
      const imageName = `Comparativa-${business.name.replace(/\s/g, "")}.png`;
      const visual = await sendVisual(
        ctx.conversation.id,
        ctx.customerPhone,
        async () =>
          renderCompareImage({
            dateLabel: dateLabel(),
            sizeLabel: selected[0]?.sizeLabel ?? null,
            ...(await getPiecesConfig()),
            brandProfiles: await brandProfilesForRender(),
            products: await Promise.all(selected.map((product) => toRenderLine(product))),
          }),
        "Comparativa para que elijas con calma 🏁",
        imageName,
        "comparativa",
      );
      let filename = imageName;
      let providerId = visual.providerId;
      let respaldoError: string | undefined;
      if (!visual.ok) {
        // El PDF de respaldo también puede fallar. Si lanzaba aquí, la tool
        // reventaba y el cliente se quedaba sin comparativa Y sin respuesta.
        try {
          const pdf = await renderComparisonPdf(selected);
          filename = `Comparativa-${business.name.replace(/\s/g, "")}.pdf`;
          providerId = await sendPdf(
            ctx.conversation.id,
            ctx.customerPhone,
            pdf,
            filename,
            "Comparativa de llantas por unidad 📄",
          );
        } catch (err) {
          respaldoError = err instanceof Error ? err.message : String(err);
          console.error("❌ PDF de respaldo de la comparativa falló:", err);
        }
      }
      const entregada = visual.ok || !respaldoError;
      await appendMessage(
        ctx.conversation.id,
        "assistant",
        entregada
          ? `Comparativa enviada: ${selected.map((product) => `${product.brand} ${product.design}`).join(" · ")}`
          : `Comparativa NO entregada: ${selected.map((product) => `${product.brand} ${product.design}`).join(" · ")}`,
        providerId,
        {
          type: visual.ok ? "image" : "pdf",
          authorKind: "bot",
          status: entregada ? "sent" : "failed",
          metadata: {
            piece: "comparison",
            filename,
            codes,
            ...(visual.error ? { renderError: visual.error } : {}),
            ...(respaldoError ? { pdfError: respaldoError } : {}),
          },
        },
      );
      if (!entregada) {
        await createBotAlert({
          conversationId: ctx.conversation.id,
          cycle: ctx.conversation.current_cycle,
          type: "send_error",
          priority: "critical",
          summary: "No se pudo enviar la comparativa (ni imagen ni PDF)",
          exactReason: `Imagen: ${visual.error ?? "desconocido"}. PDF: ${respaldoError}`,
          suggestedAction: "El cliente quedó sin la comparativa. Revisar el error y contactarlo desde el ticket.",
          dedupeKey: `${ctx.conversation.id}:${ctx.conversation.current_cycle}:comparison_send_error:${codes.join(",")}`,
        });
      }
      await logQuoteArtifact({
        conversationId: ctx.conversation.id,
        kind: "comparison",
        products: selected.map((product) => ({
          id: product.id,
          code: product.code,
          brand: product.brand,
          design: product.design,
          size: product.sizeLabel,
        })),
        filename,
        providerId,
      });
      const comparisonText = composeBlocks(
        (await soloLaFoto(visual.ok))
          ? buildComparisonCaption(selected)
          : buildComparisonMessageDetallado(selected),
        buildTechnicalGuidance(selected, ctx.currentUserText),
        "¿Para qué la usa más: ciudad y carretera, o también caminos mixtos e irregulares?",
      );
      return JSON.stringify({
        enviada: true,
        modelos: selected.map((product) => `${product.brand} ${product.design}`),
        mensaje_para_enviar: comparisonText,
        perfiles_tecnicos: selected.map((product) => ({
          modelo: `${product.brand} ${product.design}`,
          perfil: getTirePatternProfile(product.brand, product.design),
        })),
        regla:
          "Responde con mensaje_para_enviar sin saludo y, si preguntó por uso, agrega solo conclusiones respaldadas por perfiles_tecnicos. El PDF ya fue enviado. NO generes cotización.",
      });
    },
  });

  const generarCotizacion = defineTool({
    name: "generar_cotizacion",
    description:
      "Genera la cotización y se la envía al cliente por WhatsApp automáticamente. Úsala en cuanto modelo y cantidad estén confirmados, incluso si la cantidad apareció en un mensaje anterior. No pidas una confirmación adicional: cotiza y después pregunta si está bien. Devuelve los totales con IVA para que los menciones en el chat.",
    schema: z.object({
      items: z
        .array(
          z.object({
            code: z.string().describe("Código del producto tal como lo devolvió buscar_llanta"),
            // Sin tope duro desde el 27-ago. El de 8 no era una regla del
            // negocio escrita en ningún lado: era un límite del esquema que
            // nadie le había contado al modelo, y con «quiero 20 llantas» el
            // bot se quedó sin poder cotizar y sin qué decir. Ahora más de
            // `TOPE_SIN_CONFIRMAR` se CONFIRMA con el cliente y después se
            // cotiza. Ver `domain/cantidadGrande.ts`.
            cantidad: z.number().int().min(1).max(500),
          }),
        )
        .length(1)
        .describe("Una sola llanta ya elegida; las alternativas se comparan antes"),
      // Opcional A PROPÓSITO (caso Eulalia, 19-ago): siendo obligatorio, el
      // modelo se inventó «¿la cotizo a su nombre o como cliente final?» para
      // llenarlo — tres turnos y 1 h 48 min entre el «¿se la cotizo?» y la
      // cotización. El nombre ya viene gratis del perfil de WhatsApp.
      nombre_cliente: z
        .string()
        .nullable()
        .optional()
        .describe(
          "Nombre del cliente SOLO si él lo dijo en la conversación. Si no, mándalo null: se usa el del perfil de WhatsApp. PROHIBIDO preguntar el nombre, «¿a nombre de quién?» o «¿cliente final?» para cotizar.",
        ),
      incluir_pdf: z
        .boolean()
        .optional()
        .describe("true SOLO si el cliente pidió explícitamente el PDF/documento"),
    }),
    run: async ({ items, nombre_cliente: nombreDicho, incluir_pdf = false }) => {
      const nombre_cliente = nombreDicho?.trim() || ctx.customerName || "Cliente";
      // «2» después del menú de preferencia es el ESCALÓN, no la cantidad.
      // Visto en vivo el 26-ago (conv 3): el cliente contestó «2» al menú
      // 1 Costo / 2 Equilibrio / 3 Premium, el modelo eligió bien la llanta
      // equilibrada… y cotizó DOS unidades. Candado determinístico: si el
      // mensaje es el puro número del menú, la cantidad no fue dicha — juego
      // de 4 con su aclaración horneada. El prompt ya lo pide; esto lo
      // garantiza aunque el turno lo atienda el modelo barato del canary.
      // LA CANTIDAD RARA SE AVISA (Manuel, 27-ago): fuera de 4–8 el bot nombra
      // el número al mandar la pieza, en una línea. No se pregunta —eso cuesta
      // un turno para llegar a la misma respuesta—: si se equivocó lo ve y lo
      // corrige, y si no, ya tiene su precio. Ver `domain/cantidadGrande.ts`.
      let avisoJuego: string | null = null;
      const eleccionDeMenu = (ctx.currentUserText ?? "").trim().match(/^(?:la\s+|el\s+|opci[oó]n\s+)?([123])\)?\.?$/i);
      if (eleccionDeMenu && items[0].cantidad === Number(eleccionDeMenu[1])) {
        const [ultimoSaliente] = await sql<{ content: string | null }[]>`
          select content from messages
          where conversation_id=${ctx.conversation.id} and cycle=${ctx.conversation.current_cycle}
            and role='assistant' and type='text'
          order by created_at desc limit 1
        `;
        if (ultimoSaliente?.content?.includes("¿qué prioriza usted?")) {
          items = [{ ...items[0], cantidad: 4 }];
          avisoJuego = "Se la hice por juego de 4 llantas; si necesita otra cantidad, me avisa y se la ajusto al toque.";
        }
      }
      const [facts] = await sql<{ selected_quantity: number | null; tire_size: string | null }[]>`
        select selected_quantity, tire_size from conversations where id=${ctx.conversation.id}
      `;
      const quantityWasConfirmed = facts?.selected_quantity != null || items[0]?.cantidad === 4;
      const autorizada = !ctx.consultaFueraDeCatalogo && (
        Boolean(ctx.recomendacionEntregada)
        || autorizaCotizacionEnEsteTurno(ctx.currentUserText, Boolean(ctx.aceptoCotizacion))
      );
      if (
        !autorizada
        || !canGenerateFinalQuote(ctx.currentUserText, ctx.comparedThisTurn, quantityWasConfirmed)
      ) {
        return JSON.stringify({
          error:
            "Cotización bloqueada: este turno no autorizó cotizar llantas, está comparando o acaba de decir que no. No uses una cantidad guardada ni el juego completo de cuatro llantas como permiso de compra. Responde la consulta actual sin empujar una cotización.",
        });
      }
      // El local ya elegido manda en TODAS las preguntas de visita de esta
      // herramienta: re-preguntarlo es el hallazgo «re-pregunta» que el Ángel
      // Guardián corrigió 4 veces el 15-ago (convs 6275 y 6375) — y el texto
      // salía fijo de aquí, así que el arreglo va aquí y no en el prompt.
      const [datosVisita] = await sql<{ nearest_store: string | null }[]>`
        select nearest_store from conversations where id=${ctx.conversation.id}
      `;
      const localElegido = datosVisita?.nearest_store ?? null;
      // Lo que el cliente dijo en ESTA visita, en orden — alimenta las
      // restricciones y la marca pedida, y se lee ANTES del anti-duplicado
      // porque ese candado también tiene que respetarlas.
      const inboundParaContexto = await sql<{ content: string; created_at: Date }[]>`
        select content, created_at from messages
        where conversation_id=${ctx.conversation.id}
          and cycle=${ctx.conversation.current_cycle}
          and direction='inbound'
        order by created_at asc, id asc
      `;
      const textosDeLaVisita = [
        ...mensajesDeLaVisitaActual([...inboundParaContexto].reverse())
          .map((m) => m.content)
          .reverse(),
        ctx.currentUserText,
      ];
      // LA MARCA PEDIDA ES UNA RESTRICCIÓN, IGUAL QUE LA MEDIDA. Producción,
      // 31-ago (conv 671): pidió «falken r17 265 70», se cotizó KENDA, y al
      // pedir «las falken» el anti-duplicado le repitió la cotización de la
      // otra marca. Ver domain/consultaConRespaldo.ultimaMarcaPedida.
      const marcaPedidaVigente = ultimaMarcaPedida(textosDeLaVisita);

      // Candado anti-duplicado (caso KLEVER, 5-ago: dos números de cotización
      // para la misma compra en 10 minutos). Determinístico: si YA existe una
      // cotización reciente por el MISMO producto y cantidad, no se genera
      // otra — se le recuerda al cliente la vigente. El prompt también lo
      // prohíbe, pero el prompt es una petición; esto es un candado.
      const [reciente] = await sql<{ quote_number: string; total: string | number; items: unknown }[]>`
        select quote_number, total, items from quotes
        where conversation_id=${ctx.conversation.id} and cycle=${ctx.conversation.current_cycle}
          and created_at > now() - interval '30 minutes'
        order by created_at desc limit 1
      `;
      if (reciente?.quote_number) {
        const lineasPrevias = Array.isArray(reciente.items) ? reciente.items as Array<{ code?: string; quantity?: number; brand?: string }> : [];
        const mismoPedido = lineasPrevias.length === items.length
          && lineasPrevias.every((l, i) => l.code === items[i]?.code && l.quantity === items[i]?.cantidad);
        // «Sigue vigente» SOLO si la vigente es de la marca que el cliente
        // está pidiendo: la de KENDA no responde un pedido de FALKEN.
        const marcaCoincide = !marcaPedidaVigente
          || lineasPrevias.some((l) => String(l.brand ?? "").toUpperCase().includes(marcaPedidaVigente));
        if (mismoPedido && marcaCoincide) {
          return JSON.stringify({
          mensaje_para_enviar: `Su cotización sigue vigente por $${Number(reciente.total).toFixed(2)} 👍\n---\n${
            localElegido
              ? `¿Qué día le queda bien pasar por *${localElegido}* a verlas?`
              : "¿Le queda mejor Cumbayá o Quito Sur para pasar a verlas?"
          }`,
          });
        }
      }
      await ensureCatalogReady();
      const restricciones = restriccionesDeLlanta(textosDeLaVisita);
      // CANDADO DE MEDIDA — cotizar es firmar un precio, y el precio depende
      // de la medida. El 13-ago (chat 5499) el cliente pidió 265/70R16, el
      // modelo derivó a una búsqueda por aro y firmó una 225/70R16: $82,84
      // menos en el juego, con número de cotización que el cliente podía
      // presentar en el local. Aquí no se corrige al modelo con una
      // sugerencia: no se firma una medida que el cliente nunca pidió.
      //
      // Y solo cuenta lo que pidió en ESTA visita. El 26-ago (conv 4732) el
      // mismo cliente había comprado 13 días antes en 265/65R17 y volvió por
      // una 235/70R15: como el ciclo solo rota al cerrar la conversación, las
      // dos medidas figuraban «pedidas» y el candado se dio vuelta —bloqueó la
      // equivalente correcta y aprobó la de hace 13 días—. Ver
      // `mensajesDeLaVisitaActual`.
      const permitidas = await medidasDelPedido(
        ctx.conversation.id, ctx.conversation.current_cycle, ctx.currentUserText,
      );
      const lines = [];
      /**
       * Lo que se pidió contra lo que hay HOY (P-02, reunión del 25-ago).
       *
       * Joaquín: «hay una medida 195/55R15 con UNA unidad y el bot cotiza las 4
       * llantas de esa unidad». No se bloquea la cotización: el stock que llega
       * de Contífico viene desfasado y negarse pierde la venta justo cuando en
       * bodega sí están — que es el caso más común. Se avisa.
       */
      let stockCorto: { stock_hoy: number; solicitadas: number } | null = null;
      for (const item of items) {
        const candidatos = await resolvePresentedProduct(ctx.conversation.id, item.code);
        if (candidatos.length > 1) {
          // NO es «no hay». El cliente pidió un modelo que Depot surte en
          // varias versiones y hay que preguntarle cuál — decirle que no existe
          // es mentirle y matar la venta, que es lo que pasaba con las
          // populares (Wildpeak, 12-ago).
          return JSON.stringify({
            error: `«${item.code}» no señala una sola llanta: hay ${candidatos.length} que encajan.`,
            opciones: candidatos.slice(0, 5).map(etiquetaOpcion),
            siguiente_paso:
              "NO le digas al cliente que no hay. Tiene lo que pidió, en varias versiones. " +
              "Pregúntale cuál quiere con una frase corta (la diferencia entre ellas en media línea) " +
              "y vuelve a llamar preparar_cotizacion con el CÓDIGO exacto de la que elija.",
          });
        }
        let product = candidatos[0];
        if (!product) {
          return JSON.stringify({
            error: `Código ${item.code} no existe en el catálogo. Vuelve a buscar la llanta.`,
          });
        }
        if (product.availability === "out") {
          return JSON.stringify({
            error: `${product.brand} ${product.design} está agotada. Busca otra opción disponible antes de cotizar.`,
          });
        }
        if (violaRestriccionesDeLlanta(product.sizeLabel, restricciones)) {
          return JSON.stringify({
            error: `MEDIDA RECHAZADA: el cliente ya descartó el ancho ${product.sizeLabel ?? "de esa llanta"} por calce, roce o consumo. No se cotiza.`,
            siguiente_paso:
              "Busca una opción que respete la restricción que dio el cliente o deriva al asesor si hace falta confirmar equivalencias. No vuelvas a ofrecer la medida rechazada.",
          });
        }
        // CANDADO DE MARCA — gemelo del de medida. Producción, 31-ago
        // (conv 671): «necesito falken r17 265 70» terminó en cotización de
        // KENDA. Cotizar es firmar; si el cliente pidió una marca, la firma es
        // de ESA marca. Rescate antes de bloquear: si entre lo presentado hay
        // una sola de la marca pedida (afinada por tipo si lo dijo), esa es la
        // que él está señalando y esa se cotiza. Ninguna o varias → error con
        // instrucciones, nunca una cotización de otra marca en silencio.
        if (marcaPedidaVigente && !(product.brand ?? "").toUpperCase().includes(marcaPedidaVigente)) {
          const presentadosDeLaMarca = (await productosPresentados(ctx.conversation.id)).filter(
            (candidato) =>
              (candidato.brand ?? "").toUpperCase().includes(marcaPedidaVigente)
              && candidato.availability !== "out"
              && !violaRestriccionesDeLlanta(candidato.sizeLabel, restricciones)
              && (permitidas.length === 0 || medidaEstaPedida(candidato.sizeLabel, permitidas)),
          );
          const tipo = tipoSolicitadoEn([ctx.currentUserText]);
          const afinados = tipo
            ? presentadosDeLaMarca.filter((c) => `${c.design} ${c.sizeLabel}`.toUpperCase().includes(tipo.toUpperCase()))
            : presentadosDeLaMarca;
          const candidatosDeMarca = afinados.length ? afinados : presentadosDeLaMarca;
          if (candidatosDeMarca.length === 1) {
            const delaMarca = candidatosDeMarca[0];
            console.log(
              `🔁 Cotización redirigida a la marca pedida: ${item.code} (${product.brand}) → `
              + `${delaMarca.code} (${delaMarca.brand}) en la conv ${ctx.conversation.id}`,
            );
            await createBotAlert({
              conversationId: ctx.conversation.id,
              cycle: ctx.conversation.current_cycle,
              type: "marca_no_coincide",
              priority: "medium",
              summary: `Se corrigió la marca antes de cotizar: ${product.brand} → ${delaMarca.brand}`,
              exactReason:
                `El bot iba a cotizar ${product.brand} ${product.design} y el cliente pidió ${marcaPedidaVigente}. `
                + `Se cotizó ${delaMarca.brand} ${delaMarca.design} ${delaMarca.sizeLabel} (código ${delaMarca.code}), presentada en pantalla.`,
              suggestedAction: "Revisar que la cotización enviada sea la marca que el cliente está pidiendo.",
              dedupeKey: `${ctx.conversation.id}:${ctx.conversation.current_cycle}:marca_redirigida:${delaMarca.code}`,
            }).catch(() => undefined);
            items = [{ ...items[0], code: delaMarca.code }];
            product = delaMarca;
          } else {
            return JSON.stringify({
              error: `MARCA PEDIDA: el cliente pidió ${marcaPedidaVigente} y esta llanta es ${product.brand ?? "de otra marca"}. No se cotiza otra marca en silencio.`,
              ...(candidatosDeMarca.length > 1
                ? { opciones: candidatosDeMarca.slice(0, 5).map(etiquetaOpcion) }
                : {}),
              siguiente_paso: candidatosDeMarca.length > 1
                ? `Hay varias ${marcaPedidaVigente} presentadas: pregúntale cuál quiere (la diferencia en media línea) y vuelve a cotizar con ese código.`
                : `Busca ${marcaPedidaVigente} en la medida con buscar_llanta y muéstrala; si no hay, dilo con claridad y ofrece alternativas SIN cotizarlas hasta que él acepte el cambio de marca.`,
            });
          }
        }
        if (!medidaEstaPedida(product.sizeLabel, permitidas)) {
          // RESCATE ANTES DE BLOQUEAR — el caso 4732 no fue el modelo eligiendo
          // mal una llanta: fue arrastrando el CÓDIGO de la compra anterior
          // («la Falken» del 13-ago) cuando el cliente estaba señalando la
          // Falken que acababa de ver en pantalla, el mismo modelo en su
          // medida. Si entre las opciones presentadas hay UNA sola de ese
          // mismo modelo y su medida sí está pedida, esa es la que el cliente
          // señaló y esa se cotiza. No es adivinar una medida: es respetar la
          // que él vio y aceptó. Cualquier duda —ninguna o varias— cae al
          // bloqueo de siempre.
          const mismoModelo = (await productosPresentados(ctx.conversation.id)).filter(
            (candidato) =>
              `${candidato.brand} ${candidato.design}`.trim().toLowerCase()
                === `${product.brand} ${product.design}`.trim().toLowerCase()
              && medidaEstaPedida(candidato.sizeLabel, permitidas)
              && candidato.availability !== "out",
          );
          if (mismoModelo.length === 1) {
            const enPantalla = mismoModelo[0];
            console.log(
              `🔁 Cotización redirigida a la opción presentada: ${item.code} (${product.sizeLabel}) → `
              + `${enPantalla.code} (${enPantalla.sizeLabel}) en la conv ${ctx.conversation.id}`,
            );
            await createBotAlert({
              conversationId: ctx.conversation.id,
              cycle: ctx.conversation.current_cycle,
              type: "medida_no_coincide",
              priority: "medium",
              summary: `Se corrigió la medida antes de cotizar: ${product.sizeLabel} → ${enPantalla.sizeLabel}`,
              exactReason:
                `El bot iba a cotizar ${product.brand} ${product.design} ${product.sizeLabel} (código ${item.code}), `
                + `que no es de lo que pidió el cliente (${permitidas.join(" o ")}). Se cotizó la misma llanta en `
                + `${enPantalla.sizeLabel} (código ${enPantalla.code}), que es la que él tenía en pantalla.`,
              suggestedAction: "Revisar que la cotización enviada sea la medida que el cliente está comprando.",
              dedupeKey: `${ctx.conversation.id}:${ctx.conversation.current_cycle}:medida_redirigida:${enPantalla.code}`,
            }).catch(() => undefined);
            items = [{ ...items[0], code: enPantalla.code }];
            product = enPantalla;
          }
        }
        if (!medidaEstaPedida(product.sizeLabel, permitidas)) {
          await registrarMedidaQueNoCoincide(ctx.conversation, {
            pedida: permitidas.join(" o "),
            cotizada: product.sizeLabel ?? "sin medida",
            producto: `${product.brand} ${product.design}`,
          });
          return JSON.stringify({
            error: `MEDIDA DISTINTA: el cliente pidió ${permitidas.join(" o ")} y ${product.brand} ${product.design} es ${product.sizeLabel ?? "de otra medida"}. No se cotiza.`,
            siguiente_paso:
              `Cotiza una llanta de ${permitidas.join(" o ")}. Si en esa medida no hay stock, NO la cambies por tu cuenta: ` +
              `dile al cliente con todas las letras que en su medida no tienes y ofrécele la equivalente nombrando su medida completa ` +
              `(«en su ${permitidas[0]} no me queda; le entra la ${product.sizeLabel}, ¿se la cotizo?»). Solo cuando él acepte, ` +
              `búscala con buscar_llanta y ahí sí cotízala.`,
          });
        }
        // El cero ya lo atajó `availability === "out"`; lo que queda aquí es el
        // stock corto de verdad: 1, 2 o 3 unidades contra un juego de 4. Va
        // DESPUÉS del candado de medida: si el rescate cambió la llanta, el
        // stock que importa es el de la que de verdad se va a cotizar.
        //
        // LA CAJA TAMBIÉN SABE DECIR QUE NO (27-ago, conv 11720). Hasta hoy
        // esto solo AVISABA: se firmaba el juego completo y detrás salía «hoy
        // tengo 1 y usted pidió 4». Un aviso pegado detrás de una promesa no
        // deshace la promesa — el cliente se lleva al local un papel por
        // $423.52 de una llanta de la que hay una. Por debajo de
        // `alcanzaParaVender` no se firma: se dice cuántas hay y se ofrece.
        // Por encima —3 de 4, el desfase de Contífico del que habló Joaquín—
        // se firma y se avisa, igual que antes.
        if (!alcanzaParaVender(product.stock, item.cantidad)) {
          await createBotAlert({
            conversationId: ctx.conversation.id,
            cycle: ctx.conversation.current_cycle,
            type: "stock_insuficiente",
            priority: "high",
            summary: `No se firmó el juego: ${item.cantidad} pedidas y ${product.stock} en catálogo`,
            exactReason:
              `El bot iba a cotizar ${item.cantidad} × ${product.brand} ${product.design} ${product.sizeLabel} ` +
              `y hoy hay ${product.stock} en el catálogo. Por debajo de la mitad de lo pedido no se firma: ` +
              "se le dijo al cliente cuántas hay y se le ofreció el pedido o la equivalente.",
            suggestedAction:
              `Confirmar en bodega cuántas ${product.brand} ${product.design} ${product.sizeLabel} hay de verdad. ` +
              "Si están, avisale al cliente y se cotiza el juego completo.",
            dedupeKey: `${ctx.conversation.id}:${ctx.conversation.current_cycle}:stock_no_alcanza:${product.code}`,
          }).catch(() => undefined);
          console.warn(
            `🚫 Cotización no firmada por stock en la conv ${ctx.conversation.id}: ` +
            `${item.cantidad} pedidas, ${product.stock} de ${product.code}`,
          );
          return JSON.stringify({
            error: "stock_no_alcanza",
            stock_hoy: product.stock,
            solicitadas: item.cantidad,
            llanta: `${product.brand} ${product.design} ${product.sizeLabel}`,
            regla:
              `NO se cotiza. De ${product.brand} ${product.design} ${product.sizeLabel} hoy hay ` +
              `${product.stock} y el pedido es de ${item.cantidad}: firmar el juego completo sería prometerle ` +
              "al cliente algo que no está. Dile en UNA línea cuántas hay hoy, sin rodeos, y ofrécele en el " +
              "MISMO mensaje las dos salidas: (1) cotizarle las que hay ahora, (2) que el asesor le consiga " +
              "el resto por pedido. Si acepta las que hay, vuelve a llamar generar_cotizacion con esa cantidad. " +
              "PROHIBIDO cotizar la cantidad original, y PROHIBIDO terminar el turno solo con la mala noticia.",
          });
        }
        if (item.cantidad > product.stock) {
          stockCorto = { stock_hoy: product.stock, solicitadas: item.cantidad };
        }
        // El precio que se imprime se confirma contra el Interbot AQUÍ, con UNA
        // consulta por la medida que se está cotizando. Antes esto dependía del
        // barrido completo cada 15 min (12-ago: ~15.000 consultas diarias a su
        // servidor); ahora el barrido solo refresca la vitrina y el número que
        // firma la cotización se pregunta en el momento. Si el Interbot no
        // contesta, queda el del último barrido y la cotización sale igual.
        await refreshPriceForSize(product.sizeLabel ?? "");
        const vivo = getInterbotPrice(product.code);
        const hoyConIva = vivo
          ? (vivo.tienePromo && vivo.precioPromoConIva ? vivo.precioPromoConIva : vivo.pvpMinConIva)
          : product.minimumPriceWithTax;
        const antesConIva =
          vivo && vivo.pvpFullConIva > hoyConIva ? vivo.pvpFullConIva : product.customerPriceWithTax;

        lines.push({
          code: product.code,
          description: `Llanta ${product.brand} ${product.design} ${product.sizeLabel}`,
          quantity: item.cantidad,
          // Se quita el IVA con la MISMA tasa con la que `buildQuote` lo vuelve
          // a sumar (`business.taxRate`, quotePdf.ts:93). Antes se quitaba con
          // `product.taxRate`, que es otra cosa y puede valer 0: la ruta de
          // Google Sheets lo pone literalmente en 0 (services/catalog.ts:107) y
          // Contífico lo deja en 0 para cualquier producto sin `porcentaje_iva`
          // (domain/catalog.ts:167). Con tasa 0 el unitario entraba con el IVA
          // ya dentro y buildQuote le sumaba otro 15%: unas llantas anunciadas
          // a $480 se firmaban en $552. Donde las dos tasas coinciden —que es
          // el caso de Contífico con porcentaje_iva 15— esto no cambia nada.
          unitPrice: hoyConIva / (1 + business.taxRate),
          brand: product.brand,
          design: product.design,
          sizeLabel: product.sizeLabel,
          listPriceWithTax: antesConIva > hoyConIva ? antesConIva : hoyConIva,
          salePriceWithTax: hoyConIva,
          availability: product.availability,
          imageUrl: product.imageUrl,
          loadSpeed: product.loadSpeed,
          warrantyFactory: warrantyForBrand(product.brand).factory,
          warrantyRoadHazard: warrantyForBrand(product.brand).roadHazard,
        });
      }
      const baseQuote = buildQuote(lines, nombre_cliente, ctx.customerPhone);
      const baseCents = Math.round(baseQuote.total * 100);
      let activeDiscount = await getActiveDiscountOffer(ctx.conversation.id);
      if (!activeDiscount) {
        activeDiscount = await materializePendingDiscount(ctx.conversation.id, baseCents);
      }
      // El descuento se RECALCULA contra esta cotización (16-ago).
      //
      // `getActiveDiscountOffer` devuelve la oferta viva del CICLO, no de una
      // cotización concreta, y su `discountAmountCents` es un monto fijo que se
      // calculó una sola vez contra la cotización que existía cuando el asesor
      // lo autorizó. Reinyectarlo tal cual en una cotización posterior daba dos
      // resultados malos: un descuento desproporcionado si la nueva era más
      // barata, y —cuando ya no cabía— un throw de `buildQuote` que, sin
      // captura en ninguna capa, dejaba al cliente sin ninguna respuesta.
      //
      // Con `kind` + `valueCents` se recalcula: un 10 % sigue siendo el 10 % de
      // lo que se está firmando ahora. Si aun así no cabe (un monto fijo mayor
      // que el total nuevo), se sigue SIN descuento en vez de tumbar el turno:
      // el aviso de la oferta lo da igual `withDiscountNotice`.
      let descuentoAplicado: { amount: number; reason: string; condition: string; expiresAt: Date | null } | undefined;
      if (activeDiscount) {
        try {
          const recalculado = calculateDiscount(baseCents, activeDiscount.kind, activeDiscount.valueCents);
          descuentoAplicado = {
            amount: recalculado.discountAmountCents / 100,
            reason: activeDiscount.reason,
            condition: activeDiscount.condition,
            expiresAt: activeDiscount.expiresAt,
          };
        } catch (error) {
          console.warn(
            `⚠️ El descuento ${activeDiscount.id} no cabe en esta cotización (base $${baseQuote.total}); se cotiza sin él:`,
            error instanceof Error ? error.message : error,
          );
        }
      }
      const quote = buildQuote(lines, nombre_cliente, ctx.customerPhone, descuentoAplicado);
      // El número de venta es el de cotización con otra etiqueta, NO un resumen
      // de sus dígitos: `quote.number` es base36 de la fecha («COT-MSUX5R4W»),
      // así que quitarle las letras dejaba cero, uno o dos caracteres. En la
      // base de Depot eso produjo 148 cotizaciones con solo 68 números
      // distintos, 28 de ellos literalmente «AV-», y ese texto es el que sale
      // en el aviso al asesor. Conservando el sufijo entero es único por
      // construcción.
      const saleNumber = `AV-${quote.number.replace(/^COT-/, "")}`;
      const [product] = await resolvePresentedProduct(ctx.conversation.id, items[0].code);
      if (!product) throw new Error("La opción confirmada dejó de ser inequívoca; vuelve a mostrar las opciones antes de cotizar");

      // Los números que el cliente lee en el chat salen de la MISMA cotización
      // que se firma, no del catálogo en memoria. `lines[0]` ya trae el precio
      // confirmado contra el Interbot unas líneas más arriba; leerlo otra vez de
      // `product.minimumPriceWithTax` era lo que hacía que el total del chat y
      // el de la pieza pudieran no coincidir.
      const preciosFirmados = lines.length === 1
        ? {
            unitarioConIva: lines[0].salePriceWithTax,
            listaConIva: lines[0].listPriceWithTax,
            total: quote.total,
          }
        : undefined;

      // Los mismos beneficios que van en el texto van dibujados en la pieza,
      // filtrados por marca y cantidad de esta compra concreta.
      const beneficiosPieza = await applicableBenefitTexts({
        brands: [product.brand],
        quantity: items[0].cantidad,
      });

      // Imagen de cotización (pieza principal); PDF si lo piden o si falla.
      const imageName = `Cotizacion-${business.name.replace(/\s/g, "")}-${quote.number}.png`;
      const visual = await sendVisual(
        ctx.conversation.id,
        ctx.customerPhone,
        async () =>
          renderQuoteImage({
            number: quote.number,
            dateLabel: dateLabel(),
            ...(await getPiecesConfig()),
            brandProfiles: await brandProfilesForRender(),
            benefits: beneficiosPieza,

            lines: [await toRenderLine(product, items[0].cantidad)],
            subtotal: quote.subtotal,
            iva: quote.tax,
            total: quote.total,
            discountAmount: quote.discountAmount,
            discountCondition: quote.discountCondition,
            offerExpiresAt: quote.offerExpiresAt,
          }),
        `Cotización lista${quote.offerExpiresAt ? ` · oferta hasta ${quote.offerExpiresAt.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}` : ""} 🏁`,
        imageName,
        `cotización ${quote.number}`,
      );
      let filename = imageName;
      let providerId = visual.providerId;
      let pdfEnviado = false;
      if (!visual.ok || incluir_pdf) {
        try {
          // Mismo diseño que la imagen cuando el render funcionó; el PDF
          // clásico de pdfmake queda solo como último recurso.
          const pdf = visual.png
            ? await pngToQuotePdf(visual.png)
            : await renderQuotePdf(quote);
          const pdfName = `Cotizacion-${business.name.replace(/\s/g, "")}-${quote.number}.pdf`;
          const pdfId = await sendPdf(
            ctx.conversation.id,
            ctx.customerPhone,
            pdf,
            pdfName,
            "Su cotización 📄",
          );
          pdfEnviado = true;
          if (!visual.ok) {
            filename = pdfName;
            providerId = pdfId;
          }
        } catch (err) {
          console.error(`❌ PDF de cotización ${quote.number} falló:`, err);
        }
      }
      if (!visual.ok && !pdfEnviado) {
        await createBotAlert({
          conversationId: ctx.conversation.id,
          cycle: ctx.conversation.current_cycle,
          type: "send_error",
          priority: "critical",
          summary: `No se pudo enviar la cotización ${quote.number}`,
          exactReason: `Cotización ${quote.number} generada pero no se pudo enviar imagen ni PDF.`,
          suggestedAction: "Revisar el error y contactar al cliente desde el ticket.",
          dedupeKey: `${ctx.conversation.id}:${ctx.conversation.current_cycle}:quote_send_error:${quote.number}`,
        });
      }
      await appendMessage(
        ctx.conversation.id,
        "assistant",
        `Cotización ${quote.number} enviada por $${quote.total.toFixed(2)}`,
        providerId,
        {
          type: visual.ok ? "image" : "pdf",
          authorKind: "bot",
          status: visual.ok || pdfEnviado ? "sent" : "failed",
          metadata: {
            piece: "quote",
            filename,
            quoteNumber: quote.number,
            ...(visual.error ? { renderError: visual.error } : {}),
          },
        },
      );
      const quoteId = await logQuote(
        ctx.conversation.id,
        quote.lines,
        quote.subtotal,
        quote.tax,
        quote.total,
        quote.number,
        saleNumber,
        activeDiscount ?? undefined,
      );
      if (activeDiscount) await attachDiscountOfferToQuote(activeDiscount.id, quoteId);
      await updateConversationFacts(ctx.conversation.id, {
        selectedProductCode: product.code,
        selectedQuantity: items[0].cantidad,
      });
      await logQuoteArtifact({
        conversationId: ctx.conversation.id,
        quoteId,
        kind: "quote",
        products: quote.lines,
        filename,
        providerId,
      });
      await setStage(ctx.conversation.id, "cotizacion_enviada", {
        actor: "customer",
        reason: "Cliente confirmó un modelo y cantidad",
      });
      if (stockCorto) {
        await createBotAlert({
          conversationId: ctx.conversation.id,
          cycle: ctx.conversation.current_cycle,
          type: "stock_insuficiente",
          priority: "high",
          summary: `Stock corto en ${quote.number}: ${stockCorto.solicitadas} pedidas y ${stockCorto.stock_hoy} en catálogo`,
          exactReason: `${stockCorto.solicitadas} × ${product.brand} ${product.design} ${product.sizeLabel} (código ${product.code}); el catálogo marca ${stockCorto.stock_hoy}.`,
          suggestedAction: "Confirmar en bodega cuántas hay de verdad y avisarle al cliente antes de que venga al local.",
          // Por conversación, ciclo y producto: una segunda cotización del mismo
          // producto en el mismo ciclo no vuelve a avisar, pero una oportunidad
          // nueva (ciclo nuevo) sí — el stock de la semana pasada no dice nada.
          dedupeKey: `${ctx.conversation.id}:${ctx.conversation.current_cycle}:stock_insuficiente:${product.code}`,
        });
      }
      const quoteAlertKey = `${ctx.conversation.id}:${ctx.conversation.current_cycle}:quote_created:${quote.number}`;
      await createBotAlert({
        conversationId: ctx.conversation.id,
        cycle: ctx.conversation.current_cycle,
        type: "quote_created",
        priority: "medium",
        summary: `Nueva cotización ${quote.number} por $${quote.total.toFixed(2)}`,
        exactReason: `${items[0].cantidad} × ${product.brand} ${product.design} ${product.sizeLabel}`,
        suggestedAction: "Revisar la cotización y acompañar al cliente si pide ayuda o confirma visita.",
        dedupeKey: quoteAlertKey,
      });
      await notifyAdvisor({
        conversationId: ctx.conversation.id,
        cycle: ctx.conversation.current_cycle,
        eventType: "quote_created",
        dedupeKey: quoteAlertKey,
        title: `Nueva cotización ${quote.number}`,
        reason: `${items[0].cantidad} × ${product.brand} ${product.design} ${product.sizeLabel}`,
        action: "Revisar el ticket y dar seguimiento si el cliente necesita ayuda para concretar.",
        details: [
          `💵 Total: $${quote.total.toFixed(2)}`,
          `🔖 Número de venta: ${saleNumber}`,
          descuentoAplicado ? `🏷️ Descuento extra: $${descuentoAplicado.amount.toFixed(2)} · ${descuentoAplicado.condition}` : "",
        ],
      });
      // El aviso va HORNEADO en el texto, no en la `regla`: este turno sale
      // verbatim por exactToolReply y ahí el modelo no tiene dónde agregarlo
      // (misma lección que el aviso de equivalentes, 20-ago). Y pegado a la
      // cotización, no como bloque aparte: el tope son 4 bloques y el último
      // —el que pide día y local— es el objetivo del turno.
      const avisoStock = stockCorto
        ? avisoStockCorto(stockCorto.stock_hoy, stockCorto.solicitadas)
        : null;
      const avisoCantidad = !avisoJuego && esCantidadInusual(items[0].cantidad)
        ? avisoDeCantidad(items[0].cantidad)
        : null;
      const cierre = buildStoreChoiceBlocks();
      return JSON.stringify({
        enviada: true,
        numero: quote.number,
        subtotal: quote.subtotal,
        iva: quote.tax,
        total_con_iva: quote.total,
        numero_venta: saleNumber,
        ...(stockCorto ? { stock_insuficiente: stockCorto } : {}),
        mensaje_para_enviar: composeBlocks(
          [
            // Con la foto enviada, aquí no va NADA de la cotización: la pieza ya
            // la muestra. Ver `textoDeLaCotizacion`.
            textoDeLaCotizacion(
              await soloLaFoto(visual.ok),
              { product, quantity: items[0].cantidad },
              nombre_cliente,
              descuentoAplicado
                ? {
                    amount: descuentoAplicado.amount,
                    finalTotal: quote.total,
                    condition: descuentoAplicado.condition,
                    expiresAt: descuentoAplicado.expiresAt,
                  }
                : undefined,
              preciosFirmados,
            ),
            avisoCantidad,
            avisoStock,
            avisoJuego,
          ].filter(Boolean).join("\n\n"),
          // Misma regla que el turno de opciones (P-07): la pieza de la
          // cotización ya trae la franja INCLUYE resaltada. Sin este candado,
          // quitar el texto de las opciones solo MUDABA la duplicación un
          // turno: el candado por contenido de buildBenefitsBlockOnce nunca
          // se ponía y el bloque reaparecía en texto junto a esta imagen.
          debeLlevarIncluyeEnTexto(visual.ok, requestsBenefitsAgain(ctx.currentUserText))
            ? await buildBenefitsBlockOnce(
                ctx.conversation.id,
                ctx.conversation.current_cycle,
                { brands: [product.brand], quantity: items[0].cantidad },
                requestsBenefitsAgain(ctx.currentUserText),
              )
            : null,
          // El cierre va en DOS mensajes cuando todavía no eligió local: los
          // links en uno y la pregunta sola en el siguiente (Joaquín, 26-ago —
          // ver `buildStoreChoiceBlocks`). Con el local ya elegido no hay nada
          // que preguntar ahí y queda un solo bloque: el día, con la cifra del
          // descuento.
          ...(localElegido
            ? [buildVisitPlanQuestion({
                conDescuentoAutorizado: Boolean(descuentoAplicado),
                locales: business.stores.map((store) => store.name),
                localElegido,
                ahorro: ahorroDeLaCotizacion(quote.lines),
              })]
            : [cierre.ubicaciones, cierre.pregunta]),
        ),
        regla: [
          localElegido
            ? `Responde exactamente con mensaje_para_enviar, con sus separadores '---' intactos. La cotización ya fue enviada y Manuel ya fue notificado. El cliente YA eligió local (${localElegido}): NO vuelvas a preguntarle cuál. Tu objetivo es UNO: que diga qué día viene. No cierres ningún turno sin esa pregunta hasta tener la respuesta.`
            : "Responde exactamente con mensaje_para_enviar, con sus separadores '---' intactos: son mensajes distintos a propósito y juntarlos arruina el cierre. La cotización ya fue enviada y Manuel ya fue notificado. En ESTE turno tu objetivo es UNO SOLO: que el cliente diga a cuál local le queda mejor ir. NO le preguntes todavía qué día viene — eso se le pregunta recién cuando haya elegido local, y ahí va con el monto del descuento.",
          stockCorto
            ? `Hoy hay ${stockCorto.stock_hoy} de esa llanta y el cliente pidió ${stockCorto.solicitadas}: el aviso ya va en mensaje_para_enviar. NO prometas las que faltan ni des fecha de llegada — el resto lo confirma el asesor.`
            : null,
        ].filter(Boolean).join(" "),
      });
    },
  });

  const reenviarCotizacion = defineTool({
    name: "reenviar_cotizacion",
    description:
      "Reenvía la imagen de la última cotización cuando el cliente la pide otra vez o dice que no le llegó. No crea otro número ni recalcula precios.",
    schema: z.object({}),
    run: async () => {
      const message = await resendLatestQuoteImage(ctx.conversation.id, ctx.customerPhone).catch((error) => {
        console.error("❌ No se pudo reenviar la cotización:", error);
        return null;
      });
      if (!message) return JSON.stringify({ error: "No existe una cotización previa que se pueda reenviar." });

      /**
       * La pieza que se reenvía dice «4 unidades cotizadas» — y si hoy hay 3,
       * el reenvío estaba volviendo a prometer las 4 sin una palabra (conv
       * 11061, 26-ago: el aviso salió a las 12:04:11 y el reenvío de las
       * 12:04:46 lo tapó). El recordatorio va HORNEADO en el texto porque este
       * turno sale verbatim y el modelo no tiene dónde agregarlo.
       */
      const corto = await faltanteDeLaCotizacionVigente(ctx.conversation.id, ctx.conversation.current_cycle);
      return JSON.stringify({
        enviada: true,
        mensaje_para_enviar: corto
          ? `${message}\n---\n${recordatorioStockCorto(corto.stockHoy, corto.cantidad)}`
          : message,
        ...(corto ? { stock_insuficiente: { stock_hoy: corto.stockHoy, solicitadas: corto.cantidad } } : {}),
      });
    },
  });

  const localMasCercano = defineTool({
    name: "local_mas_cercano",
    description:
      "Usa una ubicación compartida (lat/lng) o un sector conocido para elegir el local más cercano. Nunca inventes coordenadas ni distancias.",
    schema: z.object({
      lat: z.number().nullable().default(null),
      lng: z.number().nullable().default(null),
      sector: z.string().nullable().default(null),
    }),
    run: async ({ lat, lng, sector }) => {
      const [saved] = await sql<{
        nearest_store: string | null;
        location_label: string | null;
        visit_date: Date | null;
        customer_commitment: string | null;
      }[]>`select nearest_store, location_label, visit_date, customer_commitment from conversations where id=${ctx.conversation.id}`;
      const visitKnown = Boolean(saved?.visit_date || saved?.customer_commitment);
      const currentMessageChangesLocation = /\b(?:ubicacion|direcci[oó]n|local|cumbay[aá]|quito|sur|sector|vivo|estoy|pin)\b/i.test(ctx.currentUserText);
      // Si el cliente acaba de contestar la fecha, no vuelvas a dibujar todo
      // el local ni a preguntar lo mismo. Esto cubre también un Kanban atrasado.
      if (saved?.nearest_store && visitKnown && !currentMessageChangesLocation) {
        const plan = saved.customer_commitment?.trim() || "la fecha indicada";
        return JSON.stringify({
          local: saved.nearest_store,
          mensaje_para_enviar: `Perfecto: *${plan} en ${saved.nearest_store}*. Ya quedó registrado para el asesor.\n\n${PREGUNTA_DE_CIERRE}`,
          regla: "Responde exactamente con mensaje_para_enviar. No repitas dirección, descuento, local ni fecha.",
        });
      }
      if (saved?.nearest_store && saved.location_label?.startsWith("Local elegido explícitamente")) {
        const explicit = business.stores.find((store) => store.name === saved.nearest_store);
        if (explicit) {
          // El cliente ya eligió: va SOLO su mapa —el otro reabre una decisión
          // tomada— y va SIEMPRE, sin el candado de «una vez por conversación».
          // Desde que la pregunta de visita lleva los links pegados (25-ago),
          // ese candado se gastaba antes y dejaba justo a este turno sin mapa:
          // el peor sitio para perderlo, porque es el turno en el que el cliente
          // decide a dónde va. Una línea con un link no es un parrafote.
          const mapas = buildStoreLinksBlock(explicit.name, { soloDestacado: true });
          return JSON.stringify({
            local: explicit.name,
            maps: explicit.mapsUrl ?? null,
            // Un solo bloque, con la pregunta al final. Si el mapa sale como
            // mensaje aparte queda él de último saliente y `preguntamosElDia`
            // ya no reconoce el «el viernes» que llega en el turno siguiente.
            mensaje_para_enviar: [
              visitKnown
                ? `Perfecto, queda confirmado *${explicit.name}*. Ya registré también cuándo viene; no necesita repetir esos datos.`
                : `Perfecto, queda confirmado *${explicit.name}*.`,
              mapas,
              visitKnown ? "" : "¿Qué día puede pasar? 📅",
            ].filter(Boolean).join("\n"),
            regla: visitKnown
              ? "Responde exactamente con mensaje_para_enviar. No vuelvas a preguntar local ni fecha."
              : "Responde exactamente con mensaje_para_enviar, con el link de Maps incluido, y pregunta únicamente la fecha.",
          });
        }
      }
      const resolved = lat != null && lng != null ? { lat, lng, label: "ubicación compartida" } : sector ? resolveSector(sector) : null;
      // No saber de qué sector escribe NO es un callejón sin salida.
      //
      // Antes esta rama devolvía un error que mandaba a pedir el pin de
      // WhatsApp, y ahí se quedaba el hilo: «la gente se queda sin ubicación
      // porque el bot espera el pin» (Joaquín, 25-ago). El cliente no necesita
      // que adivinemos su sector para elegir local — necesita ver los dos y
      // decidir. Así que los links salen igual y el pin baja a ofrecimiento.
      if (!resolved) {
        // La pregunta es la de siempre —día Y local, con los dos mapas pegados—
        // y no una inventada aquí. Importa por lo que pasa DESPUÉS: a este
        // mensaje el cliente contesta «al sur por favor el viernes», y esos dos
        // hechos solo se registran si nuestro último mensaje puso los dos
        // locales sobre la mesa (`preguntamosElLocal`) y preguntó el día
        // (`preguntamosElDia`). El «¿de qué sector nos escribe?» que salía antes
        // no cumplía ninguna de las dos: por eso el seguimiento volvía a
        // preguntar el lugar que el cliente ya había dicho.
        const sale = await latestSaleNumber(ctx.conversation.id);
        const descuentoVivo = Boolean(await getActiveDiscountOffer(ctx.conversation.id));
        return JSON.stringify({
          local: null,
          sector_reconocido: false,
          mensaje_para_enviar: [
            buildVisitPlanQuestion({
              conDescuentoAutorizado: descuentoVivo,
              locales: business.stores.map((store) => store.name),
              conCotizacion: Boolean(sale),
            }),
            "Si prefiere, compárteme su ubicación de WhatsApp y le digo cuál le queda más cerca. 📲",
          ].filter(Boolean).join("\n"),
          regla:
            "Responde exactamente con mensaje_para_enviar. PROHIBIDO condicionar los links a que el cliente mande el pin o diga su sector: los mapas ya van en el mensaje. El pin es opcional y solo sirve si él pide que le digamos cuál le queda más cerca.",
        });
      }
      const { store, distanceKm } = nearestStore(business.stores, resolved.lat, resolved.lng);
      await updateConversationFacts(ctx.conversation.id, {
        locationLabel: resolved.label,
        nearestStore: store.name,
      });
      await setStage(ctx.conversation.id, "seguimiento_venta", {
        actor: "customer",
        reason: "Cliente compartió ubicación después de cotizar",
      });
      const sale = await latestSaleNumber(ctx.conversation.id);
      const descuentoVivo = Boolean(await getActiveDiscountOffer(ctx.conversation.id));
      const horario = storeSchedule(store.name, ctx.storeHours);
      // La ubicación quedó resuelta: va el mapa del local recomendado, solo ese
      // y sin candado. Es LA respuesta de este turno —el cliente acaba de decir
      // dónde está— y perderlo porque los links ya salieron con la pregunta de
      // visita sería dejarlo justo donde empezó esta corrección.
      const mapas = buildStoreLinksBlock(store.name, { soloDestacado: true });
      return JSON.stringify({
        local: store.name,
        distancia_km: distanceKm,
        maps: store.mapsUrl ?? null,
        horario,
        ubicacion_cliente: resolved.label,
        distancia_es_aproximada: sector != null,
        numero_venta: sale,
        // Todo en UN bloque y la pregunta por el día al final: con el mapa como
        // mensaje aparte, el último saliente dejaba de contener la pregunta y
        // `preguntamosElDia` ya no entendía el «el viernes» de la respuesta.
        mensaje_para_enviar: [
          `📍 El local recomendado es *${store.name}*.`,
          mapas,
          `🕐 ${horario}`,
          sale ? `🔖 Al llegar, indica tu número de venta *${sale}* para ubicar tu cotización.` : "",
          // Sin esta línea el turno terminaba en "te esperamos": cortés y sin
          // fecha. La ubicación es el mejor momento para pedir el día porque el
          // cliente acaba de decidir a dónde va.
          visitKnown
            ? `✅ Visita registrada: ${saved?.customer_commitment?.trim() || "fecha confirmada"}.`
            : buildVisitDayQuestion(descuentoVivo, Boolean(sale)),
        ].filter(Boolean).join("\n"),
        regla: visitKnown
          ? "Responde exactamente con mensaje_para_enviar. La visita ya está registrada: no preguntes otra vez el día ni repitas el argumento del descuento."
          : "Responde exactamente con mensaje_para_enviar, incluida la pregunta por el día. Ya tienes el local: pide únicamente la fecha.",
      });
    },
  });

  /**
   * La ubicación se manda, no se cuenta.
   *
   * Antes no existía: el modelo tenía las direcciones en el prompt y, cuando el
   * cliente pedía «la ubicación por este medio», contestaba escribiéndolas —dos
   * locales, calle y referencia, en un párrafo que no lleva a nadie a ninguna
   * parte y que encima se repetía cada vez que se hablaba de la visita. Ahora
   * las direcciones NO están en el prompt (ver agent/prompts.ts) y este es el
   * único camino para responder dónde queda un local: el link de Maps.
   *
   * Y aprovecha el turno: si todavía falta el día o el local, la pregunta va
   * pegada al link, que es justo cuando el cliente está decidiendo a dónde va.
   */
  const ubicacionLocales = defineTool({
    name: "ubicacion_locales",
    description:
      "Manda la ubicación de los locales como link de Google Maps. Úsala SIEMPRE que el cliente pregunte dónde quedan, pida la dirección, el mapa, cómo llegar o que le compartas la ubicación. La dirección NUNCA se escribe con palabras: se manda este link.",
    schema: z.object({
      local: z
        .enum(["Depot Tire Cumbayá", "Depot Tire Quito Sur"])
        .nullable()
        .default(null)
        .describe(
          "El local por el que preguntó. null si preguntó en general o todavía no elige: ahí van los dos links y la pregunta por cuál le queda mejor.",
        ),
    }),
    run: async ({ local }) => {
      const [saved] = await sql<{
        nearest_store: string | null;
        visit_date: Date | null;
        customer_commitment: string | null;
        has_quote: boolean;
      }[]>`
        select c.nearest_store, c.visit_date, c.customer_commitment,
          exists(select 1 from quotes q where q.conversation_id=c.id and q.cycle=c.current_cycle) as has_quote
        from conversations c where c.id=${ctx.conversation.id}
      `;
      const elegido = local ?? saved?.nearest_store ?? null;
      const mapas = buildStoreLinksBlock(elegido, { soloDestacado: Boolean(elegido) });
      if (!mapas) {
        return JSON.stringify({
          error: "No hay links de Maps configurados. Ofrece pasar la ubicación con un asesor.",
        });
      }
      const visita = saved?.customer_commitment?.trim() || null;
      const conCotizacion = Boolean(saved?.has_quote);
      const visitaCerrada = Boolean(elegido && (saved?.visit_date || visita));
      const descuentoVivo = Boolean(await getActiveDiscountOffer(ctx.conversation.id));
      const cierre = visitaCerrada
        ? `Le esperamos ${visita ?? "el día que quedamos"} en *${elegido}*. 🏁`
        : buildVisitPlanQuestion({
            conDescuentoAutorizado: descuentoVivo,
            locales: business.stores.map((store) => store.name),
            localElegido: elegido,
            conCotizacion,
            // Aquí el mapa ES la respuesta —el cliente preguntó dónde quedan—,
            // así que va arriba, en su propio bloque, y la pregunta cierra.
            // Sin este `false` los links saldrían dos veces en el mismo turno.
            enlaces: false,
          });
      return JSON.stringify({
        local: elegido,
        visita_registrada: visitaCerrada,
        mensaje_para_enviar: composeBlocks(mapas, cierre),
        regla: visitaCerrada
          ? "Responde exactamente con mensaje_para_enviar. Ya tienes local y día: no los vuelvas a preguntar y NO escribas la dirección en texto."
          : "Responde exactamente con mensaje_para_enviar, con sus separadores '---' intactos. NUNCA escribas la dirección, la calle ni referencias de cómo llegar: el link ya lo hace. Y NUNCA condiciones los mapas a que el cliente diga su sector o mande el pin — ya van en el mensaje.",
      });
    },
  });

  /**
   * EL BOT ESCRIBE LO QUE PROMETE.
   *
   * Hasta el 26-ago la fecha de visita solo entraba por una regex que corría
   * ANTES del modelo, sobre el texto crudo del cliente. El 24-ago un cliente
   * escribió «X eso el juebes»: el modelo entendió y contestó «Listo, jueves de
   * 4 a 5 pm», la regex no reconoció el typo, y la visita no existió para
   * nadie. Sin `visit_date` no hubo aviso al asesor, no salió el cupón, y el
   * portón `visita_agendada` dejó pasar dos seguimientos preguntándole otra vez
   * qué día venía.
   *
   * La regex ahora tolera faltas (ver `diasEnEspanol`), pero el arreglo de
   * fondo es este: si el bot lo dice, el bot lo escribe. Ninguna promesa del
   * chat puede depender de que una expresión regular haya adivinado igual que
   * el modelo.
   */
  const agendarVisita = defineTool({
    name: "agendar_visita",
    description:
      "Registra el día (y la hora, si la dijo) en que el cliente confirmó que va a pasar por el local. Llámala SIEMPRE en el mismo turno en que el cliente confirma, cambia o precisa su visita — aunque lo escriba con faltas («el juebes», «savado»), aunque solo dé la hora, y aunque tú ya lo hayas confirmado en palabras. Sin esta llamada el asesor no se entera, no sale el cupón, y el bot le vuelve a preguntar el día que acaba de darte.",
    schema: z.object({
      dia: z
        .string()
        .describe(
          "El día tal como lo entendiste: «jueves», «mañana», «pasado mañana», «hoy», «esta semana», o una fecha «2026-08-27». Si el cliente dio la hora pero todavía no el día, manda cadena vacía.",
        ),
      franja: z
        .string()
        .nullable()
        .default(null)
        .describe("La hora que dijo, en sus palabras: «de 4 a 5 pm», «en la tarde», «a las 9». null si no dijo hora."),
      local: z
        .enum(["Depot Tire Cumbayá", "Depot Tire Quito Sur"])
        .nullable()
        .default(null)
        .describe("El local al que va, si ya lo eligió en esta conversación. null si todavía no lo dijo."),
    }),
    run: async ({ dia, franja, local }) => {
      const ahora = new Date();
      const fecha = fechaDelDia(dia, ahora);
      const franjaTexto = franja?.trim() || null;
      // La hora que resuelva el texto del cliente manda sobre el relleno del
      // día: «jueves de 4 a 5» es el jueves a las 16:00, no a las 10:00.
      const hora = franjaTexto ? franjaHoraria(franjaTexto)?.hora ?? null : null;
      const conHora = fecha && hora !== null
        ? new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate(), hora + 5, 0, 0))
        : fecha;
      const etiquetaFranja = franjaTexto ? franjaHoraria(franjaTexto)?.etiqueta ?? franjaTexto : null;

      if (!conHora && !etiquetaFranja) {
        return JSON.stringify({
          error: "No entendí qué día ni a qué hora viene. Pregúntale el día concreto antes de registrar nada.",
        });
      }
      if (local) await setExplicitStore(ctx.conversation.id, local);
      // Por `registrarCompromisoDeVisita` y no por `updateConversationFacts`:
      // si el cliente dio la hora un turno antes, esa hora se pega a este día.
      const registrado = await registrarCompromisoDeVisita(ctx.conversation.id, {
        texto: [dia.trim(), franjaTexto].filter(Boolean).join(" ").slice(0, 180)
          || ctx.currentUserText.trim().slice(0, 180),
        visitDate: conHora,
        visitTimeLabel: etiquetaFranja,
      });

      const [guardado] = await sql<{ nearest_store: string | null }[]>`
        select nearest_store from conversations where id=${ctx.conversation.id}
      `;
      const localFinal = local ?? guardado?.nearest_store ?? null;

      // Los dos efectos que el 24-ago no ocurrieron. Van con `await` porque el
      // cupón se anexa al mensaje, y el aviso al asesor es justamente lo que
      // convierte esta llamada en algo más que una fila en una tabla.
      await avisarVisitaComprometida({
        conversationId: ctx.conversation.id,
        cycle: ctx.conversation.current_cycle,
        texto: ctx.currentUserText.trim().slice(0, 200) || dia,
        visitDate: registrado.visitDate,
        visitTimeLabel: registrado.visitTimeLabel,
      }).catch((error) => console.error("⚠️ No se pudo avisar la visita:", error));
      const cupon = await emitirCuponDeConfirmacion({
        conversationId: ctx.conversation.id,
        cycle: ctx.conversation.current_cycle,
      }).catch(() => null);

      // Los seguimientos vigentes se planearon contra un estado que ya cambió:
      // se rehacen para que salgan confirmando la visita, no preguntándola.
      await cancelPendingFollowUps(ctx.conversation.id, "visita_registrada", ctx.conversation.current_cycle)
        .catch(() => undefined);
      await scheduleConversationFollowUps(ctx.conversation.id, ahora).catch(() => undefined);

      const cuando = registrado.visitDate
        ? etiquetaVisita(registrado.visitDate, registrado.visitTimeLabel)
        : `${registrado.visitTimeLabel} (falta el día)`;
      const confirmacion = registrado.visitDate
        ? `Listo, le esperamos el *${cuando}*${localFinal ? ` en *${localFinal}*` : ""}. Queda avisado el asesor 🤝`
        : `Anotado *${registrado.visitTimeLabel}*${localFinal ? ` en *${localFinal}*` : ""}. ¿Qué día sería?`;
      const bloques = [confirmacion];
      if (cupon && !cupon.yaExistia) {
        bloques.push(mensajeCupon({
          codigo: cupon.codigo,
          porcentaje: cupon.porcentaje,
        }));
      }

      return JSON.stringify({
        visita_registrada: Boolean(registrado.visitDate),
        cuando,
        local: localFinal,
        mensaje_para_enviar: composeBlocks(...bloques),
        regla: registrado.visitDate
          ? "Responde exactamente con mensaje_para_enviar, con sus separadores '---' intactos. La visita YA está registrada: no vuelvas a preguntar el día ni el local."
          : "Responde exactamente con mensaje_para_enviar: tienes la hora pero te falta el día, y es lo único que debes pedir.",
      });
    },
  });

  const notificarVendedor = defineTool({
    name: "notificar_vendedor",
    description:
      "Alerta al vendedor humano por WhatsApp. Úsala cuando el cliente confirme compra/reserva, pida hablar con una persona, pida despacho a una ciudad sin local, o tenga un caso que no puedas resolver. Incluye un resumen accionable: qué llanta, cuántas, a qué precio, y qué necesita el cliente.",
    schema: z.object({
      motivo: z
        .enum(["compra", "pide_humano", "envio_fuera_de_cobertura", "caso_sin_resolver"])
        .describe(
          "Por qué escalas: compra = confirmó que compra o reserva y va a un local; pide_humano = pidió hablar con una persona; envio_fuera_de_cobertura = pide despacho a una ciudad donde no hay local; caso_sin_resolver = cualquier otra cosa que no puedas responder",
        ),
      resumen: z
        .string()
        .describe("Resumen para el vendedor: producto, cantidad, total, estado del cliente"),
    }),
    run: async ({ motivo, resumen }) => {
      const [facts] = await sql<{ location_label: string | null; nearest_store: string | null }[]>`
        select location_label, nearest_store from conversations where id = ${ctx.conversation.id}
      `;
      const ubicacion = facts?.location_label ?? null;
      const local = facts?.nearest_store ?? null;

      // La ubicación y el local solo son requisito para COORDINAR una visita:
      // sin ellos el asesor no sabe a qué tienda ir a esperar al cliente. Para
      // escalar NO son requisito, y exigirlos era el bug: el 8-ago un cliente de
      // Yantzaza pidió despacho, nunca compartió pin —no hay local que
      // recomendarle— y la guarda dejó el aviso sin salir. Un caso que el bot no
      // puede resolver tiene que llegar a un humano aunque no sepamos dónde vive.
      if (motivo === "compra" && (!ubicacion || !local)) {
        return JSON.stringify({
          error:
            "Antes del handoff de compra necesitas la ubicación del cliente y el local recomendado. Pide ubicación y usa local_mas_cercano. Si el caso es otro (pide un humano, pide envío, no puedes resolverlo), vuelve a llamarme con el motivo correcto.",
        });
      }

      const plan = {
        compra: {
          eventType: "customer_ready_to_buy" as const,
          title: "Cliente listo para comprar",
          action: `Coordinar la compra en ${local}.`,
          alertAction: `Abrir la conversación de ${ctx.customerName ?? ctx.customerPhone} y coordinar la venta.`,
        },
        pide_humano: {
          eventType: "human_requested" as const,
          title: "Cliente pidió hablar con un asesor",
          action: "Abrir el ticket y responder personalmente dentro de la ventana de 24 horas.",
          alertAction: `Responder personalmente a ${ctx.customerName ?? ctx.customerPhone}: pidió un humano.`,
        },
        envio_fuera_de_cobertura: {
          eventType: "envio_fuera_de_cobertura" as const,
          title: "Cliente pide despacho fuera de cobertura",
          action:
            "Confirmarle si se puede despachar, a qué costo y en cuántos días. El bot ya le dijo que un asesor lo revisa.",
          alertAction:
            "Cotizar el envío o decirle que no se puede. El bot no tiene cómo resolverlo solo.",
        },
        caso_sin_resolver: {
          eventType: "caso_sin_resolver" as const,
          title: "Caso que el bot no puede resolver",
          action: "Abrir el ticket y contestarle personalmente.",
          alertAction: `Revisar la conversación de ${ctx.customerName ?? ctx.customerPhone}: el bot se quedó sin respuesta.`,
        },
      }[motivo];

      const dedupeKey = `${ctx.conversation.id}:${ctx.conversation.current_cycle}:${plan.eventType}`;
      const contexto = [
        ubicacion ? `Ubicación: ${ubicacion}.` : "Sin ubicación compartida.",
        local ? `Local: ${local}.` : "Sin local asignado.",
      ].join(" ");

      await createBotAlert({
        conversationId: ctx.conversation.id,
        cycle: ctx.conversation.current_cycle,
        type: plan.eventType,
        priority: "high",
        summary: resumen.slice(0, 300),
        exactReason: contexto,
        suggestedAction: plan.alertAction,
        dedupeKey,
      });
      await notifyAdvisor({
        conversationId: ctx.conversation.id,
        cycle: ctx.conversation.current_cycle,
        eventType: plan.eventType,
        dedupeKey,
        title: plan.title,
        reason: resumen.slice(0, 500),
        action: plan.action,
        details: [
          ubicacion ? `📍 ${ubicacion}` : "",
          local ? `🏬 ${local}` : "",
        ].filter(Boolean),
      });
      // Solo la compra confirmada mueve el kanban: escalar no es avanzar en el
      // embudo, y un cliente que pide envío puede seguir en "cotización enviada".
      if (motivo === "compra") {
        await setStage(ctx.conversation.id, "seguimiento_venta", {
          actor: "customer",
          reason: "Cliente confirmó interés/visita",
        });
      }
      return JSON.stringify({ notificado: true, motivo });
    },
  });

  return [
    buscarLlanta,
    buscarCatalogo,
    buscarPorAroYTipo,
    tiposDeLlanta,
    respaldoMarcas,
    guiaMedida,
    opcionesSinMedida,
    fitmentVehiculo,
    prepararOpciones,
    enviarComparacion,
    generarCotizacion,
    reenviarCotizacion,
    localMasCercano,
    ubicacionLocales,
    agendarVisita,
    notificarVendedor,
  ];
}

async function latestSaleNumber(conversationId: number): Promise<string | null> {
  const [row] = await sql<{ sale_number: string | null }[]>`
    select sale_number from quotes
    where conversation_id = ${conversationId}
      and cycle = (select current_cycle from conversations where id = ${conversationId})
    order by created_at desc limit 1
  `;
  return row?.sale_number ?? null;
}

function buildTechnicalGuidance(
  products: Array<{ brand: string; design: string }>,
  question: string,
): string {
  const profiles = products
    .map((product) => ({ product, profile: getTirePatternProfile(product.brand, product.design) }))
    .filter((entry): entry is { product: { brand: string; design: string }; profile: NonNullable<ReturnType<typeof getTirePatternProfile>> } => Boolean(entry.profile));
  if (!profiles.length) {
    return "ℹ️ No tengo fichas técnicas verificadas de estos diseños para recomendar uno por desempeño.";
  }
  const normalized = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const mountain = /montan|ripio|barro|destapad|off.?road/.test(normalized);
  const wet = /lluv|mojad|aquaplan/.test(normalized);
  const lines = ["🧭 *¿Cuál conviene más?*"];
  for (const { product, profile } of profiles) {
    lines.push(
      `• *${product.brand} ${product.design}:* ${profile.category}; destaca en ${profile.strengths.join(", ")}.`,
    );
  }
  if (mountain) {
    const allTerrain = profiles.find(({ profile }) => /all-terrain|rugged|mud/.test(profile.category));
    lines.push(
      allTerrain
        ? `🏔️ Para ripio o camino sin asfaltar, *${allTerrain.product.brand} ${allTerrain.product.design}* es la opción diseñada para ese uso.`
        : "🏔️ Si hablas de carretera pavimentada con curvas o lluvia, prioriza agarre en mojado. Para ripio o barro, ninguna de estas opciones de carretera es A/T; conviene buscar otro diseño.",
    );
  } else if (wet) {
    const wetChoice = profiles.find(({ profile }) => profile.strengths.some((s) => /mojado|aquaplan/.test(s)));
    if (wetChoice) lines.push(`🌧️ Para lluvia, la ficha del fabricante favorece a *${wetChoice.product.brand} ${wetChoice.product.design}*.`);
  }
  return lines.join("\n");
}

function toolItem(item: {
  code: string;
  brand: string;
  design: string;
  sizeLabel: string | null;
  customerPriceWithTax?: number;
  minimumPriceWithTax?: number;
  stock: number;
  availability?: string;
}) {
  // El tipo (H/T, A/T, R/T…) no viene de Contífico: sale de la base que entregó
  // el cliente. Es lo que permite responder "quiero una R17 A/T".
  const tipo = tipoDeProducto(item.code, item.design);
  return {
    code: item.code,
    marca: item.brand,
    diseno: item.design,
    medida: item.sizeLabel ?? "Sin medida",
    tipo: tipo ?? undefined,
    escalon: etiquetaEscalon(item.brand, item.design),
    precio_lista_con_iva: item.customerPriceWithTax,
    precio_hoy_con_iva: item.minimumPriceWithTax,
    stock: item.stock,
    disponibilidad: item.availability,
  };
}
