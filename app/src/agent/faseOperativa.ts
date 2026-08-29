import type { Stage } from "../domain/pipeline.js";

/**
 * La tarjeta del Kanban mide cuánto avanzó la venta y por eso no retrocede.
 * Esta fase, en cambio, responde a lo que el cliente necesita AHORA: alguien
 * con cotización puede pedir otra medida y volver temporalmente a opciones sin
 * borrar la cotización ni falsear el embudo.
 */

const normalizar = (texto: string) => texto
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const MEDIDA = /\b\d{3}\s*[\/-]\s*\d{2,3}\s*(?:z?r\s*)?\d{2}\b|\b\d{2,3}(?:\.\d{1,2})?\s*x\s*\d{1,2}(?:\.\d{1,2})?\s*(?:r\s*)?\d{2}\b/;
const ARO = /\b(?:aro|rin)\s*(?:numero\s*)?(?:r\s*)?\d{2}\b/;
const OTRA_BUSQUEDA = /\b(?:otra|otras|diferente|cambiar|cambio)\s+(?:medida|llanta|llantas|opcion|opciones|marca|marcas)\b/;
const OPCIONES = /\b(?:que|cuales|otras?)\s+(?:opciones|marcas|llantas)\b|\b(?:opciones|alternativas)\s+(?:tienen|manejan|hay)\b/;
const COMPARAR = /\b(?:compara|comparame|comparacion|diferencia|diferencias|versus|vs)\b|\b(?:cual|que)\s+(?:es\s+)?mejor\b/;
const RESPALDO = /\b(?:garantia|garantias|duracion|dura|kilometros|origen|fabricada|seguro|respaldo|por\s+que\s+(?:cuesta|vale))\b/;
const COTIZAR = /\b(?:cotiza|cotice|cotizame|cotizacion|proforma|presupuesto)\b|\b(?:deme|dame|quiero|llevo|elijo|escojo|prefiero)\b[^.?!]{0,55}\b(?:llanta|llantas|falken|kenda|sunoco|winrun|maxxis|bridgestone|continental)\b/;
const VISITA = /\b(?:local|locales|sucursal|sucursales|ubicacion|direccion|mapa|maps|cumbaya|quito\s+sur|asesor|vendedor|agendar|visita|visitar|voy|vamos|ire|mañana|manana|domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b|\b(?:puedo|podria|quiero|quisiera)\s+pasar\b/;
const VEHICULO = /\b(?:para\s+(?:un|una|mi)|tengo\s+(?:un|una))\s+[a-z][a-z0-9-]+(?:\s+[a-z0-9-]+){0,3}\b/;

export interface EntradaFaseOperativa {
  etapaGuardada: Stage;
  texto: string;
  tieneCotizacion: boolean;
  aceptoCotizar?: boolean;
}

export function elegirFaseOperativa(input: EntradaFaseOperativa): Stage {
  if (input.etapaGuardada === "ganado" || input.etapaGuardada === "perdido") {
    return input.etapaGuardada;
  }

  const texto = normalizar(input.texto);

  // Comparar manda sobre la medida que pueda venir en la misma frase: el dato
  // ya está, la necesidad de este turno es decidir entre opciones.
  if (COMPARAR.test(texto) || RESPALDO.test(texto)) return "seleccionando";

  // Una medida, aro u «otra medida» reabre la búsqueda aunque la tarjeta esté
  // en cotización o seguimiento. Esa fue la grieta del ticket 2150: asumir que
  // seguimiento significa que el cliente dejó de comprar.
  if (MEDIDA.test(texto) || ARO.test(texto) || OTRA_BUSQUEDA.test(texto)) {
    return "medida_confirmada";
  }

  if (input.aceptoCotizar || COTIZAR.test(texto)) return "cotizacion_enviada";
  if (VISITA.test(texto)) return "seguimiento_venta";
  if (OPCIONES.test(texto)) return "seleccionando";
  if (VEHICULO.test(texto)) return "nuevo";

  // Sin una señal clara no adivinamos. La etapa guardada suele estar cerca y
  // es el respaldo más seguro para un «ok», «gracias» o una pregunta lateral.
  return input.etapaGuardada;
}

const HERRAMIENTAS_POR_FASE: Record<Stage, readonly string[]> = {
  nuevo: [
    "fitment_vehiculo",
    "guia_medida",
    "opciones_sin_medida",
    "buscar_por_aro_y_tipo",
    "buscar_llanta",
    "preparar_opciones",
  ],
  medida_confirmada: [
    "buscar_llanta",
    "buscar_catalogo",
    "buscar_por_aro_y_tipo",
    "tipos_de_llanta",
    "preparar_opciones",
    "generar_cotizacion",
  ],
  seleccionando: [
    "buscar_llanta",
    "buscar_catalogo",
    "buscar_por_aro_y_tipo",
    "preparar_opciones",
    "enviar_comparacion",
    "generar_cotizacion",
    "respaldo_marcas",
  ],
  cotizacion_enviada: [
    "generar_cotizacion",
    "reenviar_cotizacion",
    "buscar_llanta",
    "buscar_catalogo",
    "preparar_opciones",
  ],
  seguimiento_venta: [
    "local_mas_cercano",
    "ubicacion_locales",
    "agendar_visita",
    "notificar_vendedor",
    "reenviar_cotizacion",
  ],
  ganado: [],
  perdido: [],
};

/** Respeta lo publicado por el administrador: este selector solo puede quitar. */
export function herramientasParaElTurno(
  fase: Stage,
  publicadas: readonly string[],
): string[] {
  const permitidas = new Set(publicadas);
  return HERRAMIENTAS_POR_FASE[fase].filter((nombre) => permitidas.has(nombre));
}
