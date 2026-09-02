import type { Stage } from "../domain/pipeline.js";
import { extractCustomerCommitment, preguntamosElDia } from "../domain/customerCommitment.js";
import { fitmentTable } from "../domain/fitment.js";
import {
  extractConventionalSizes,
  extractFlotationSizes,
  extractTireSizes,
} from "../domain/tireSize.js";

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

const ARO = /\b(?:aro|rin)\s*(?:numero\s*)?(?:r\s*)?\d{2}\b/;
const OTRA_BUSQUEDA = /\b(?:otra|otras|diferente|cambiar|cambio)\s+(?:medida|llanta|llantas|opcion|opciones|marca|marcas)\b/;
const OPCIONES = /\b(?:que|cuales|otras?)\s+(?:opciones|marcas|llantas)\b|\b(?:opciones|alternativas)\s+(?:tienen|manejan|hay)\b/;
const COMPARAR = /\b(?:compara|comparame|comparacion|diferencia|diferencias|versus|vs)\b|\b(?:cual|que)\s+(?:es\s+)?mejor\b/;
const RESPALDO = /\b(?:garantia|garantias|duracion|dura|kilometros|origen|fabricada|seguro|respaldo|por\s+que\s+(?:cuesta|vale))\b/;
// «Quiero más información, tengo un Suzuki SZ 2016, ¿qué llantas me
// recomienda?» NO es pedir cotización (producción 1-sep, conv 13862: ese
// «quiero … llantas» mandó el primer turno a la fase de cotizar y el bot
// firmó una cotización sobre una medida que el cliente nunca dio). El verbo
// no cuenta si lo que sigue es pedir información, ni si «llantas» viene en
// una pregunta («qué/cuáles llantas»).
const COTIZAR = /\b(?:cotiza|cotice|cotizame|cotizacion|proforma)\b|\b(?:deme|dame|quiero|llevo|elijo|escojo|prefiero)\b(?!\s+(?:mas\s+)?(?:informacion|info|saber|consultar|preguntar|conocer|ver)\b)[^.?!]{0,55}(?<!\b(?:que|cuales|cual)\s)\b(?:llanta|llantas|falken|kenda|sunoco|winrun|maxxis|bridgestone|continental)\b/;
const PIDE_PRESUPUESTO = /\b(?:deme|dame|hagame|hazme|quiero|necesito|envie|envieme|mande|mandeme)\b[^.?!]{0,35}\bpresupuesto\b|\bpresupuesto\b[^.?!]{0,35}\b(?:para|de)\b[^.?!]{0,35}\bllantas?\b/;
const OBJECION_DE_PRESUPUESTO = /\b(?:no\s+me\s+alcanza|no\s+alcanza|no\s+se\s+ajusta|no\s+ajusta|fuera\s+de|se\s+sale\s+de|se\s+pasa\s+de|sobrepasa|excede|no\s+entra\s+en|demasiado\s+para)\b[^.?!]{0,35}\b(?:mi\s+|el\s+)?presupuesto\b|\b(?:mi\s+|el\s+)?presupuesto\b[^.?!]{0,25}\b(?:es|esta)\s+(?:bajo|limitado)\b/;
const VISITA_EXPLICITA = /\b(?:local|locales|sucursal|sucursales|ubicacion|direccion|mapa|maps|cumbaya|quito\s+sur|asesor|vendedor|agendar|visita|visitar|voy|vamos|ire)\b|\b(?:puedo|podria|quiero|quisiera)\s+(?:ir|pasar|acercarme|visitar)\b/;
const NOMBRE_DE_VEHICULO = /\b(?:vehiculo|carro|auto|automovil|camioneta|camion|pickup|suv|furgoneta|moto)\b/;
const CONTEXTO_DE_VEHICULO = /\b(?:para\s+(?:un|una|mi)|tengo\s+(?:un|una))\b/;

const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const aliasDeMarcas = [...new Set(fitmentTable().flatMap((entry) => {
  const marca = normalizar(entry.make);
  const principal = marca.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const parentesis = [...marca.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
  return [principal, ...parentesis].filter(Boolean);
}))];
const MARCA_DE_VEHICULO = new RegExp(`\\b(?:${aliasDeMarcas.map(escaparRegex).join("|")})\\b`);

function mencionaVehiculo(texto: string): boolean {
  if (NOMBRE_DE_VEHICULO.test(texto)) return true;
  return CONTEXTO_DE_VEHICULO.test(texto) && MARCA_DE_VEHICULO.test(texto);
}

function contieneMedida(texto: string): boolean {
  return extractTireSizes(texto).length > 0
    || extractFlotationSizes(texto).length > 0
    || extractConventionalSizes(texto).length > 0;
}

export interface EntradaFaseOperativa {
  etapaGuardada: Stage;
  texto: string;
  tieneCotizacion: boolean;
  aceptoCotizar?: boolean;
  ultimoMensajeBot?: string | null;
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
  if (contieneMedida(input.texto) || ARO.test(texto) || OTRA_BUSQUEDA.test(texto)) {
    return "medida_confirmada";
  }

  // Una objeción de precio pide alternativas, no una nueva cotización a ciegas.
  // «No se ajusta a mi presupuesto» fue el turno 6 de la conv 8318.
  if (OBJECION_DE_PRESUPUESTO.test(texto)) return "seleccionando";

  if (input.aceptoCotizar || COTIZAR.test(texto) || PIDE_PRESUPUESTO.test(texto)) {
    return "cotizacion_enviada";
  }

  // Un día solo es visita si el cliente expresa intención de ir o si responde
  // a la pregunta de fecha del bot. «Me entregan la camioneta el jueves» no es
  // una visita; «jueves» después de «¿qué día puede pasar?» sí lo es.
  const compromiso = extractCustomerCommitment(input.texto, new Date(), {
    respondiendoAlDia: preguntamosElDia(input.ultimoMensajeBot),
  });
  if (VISITA_EXPLICITA.test(texto) || compromiso) return "seguimiento_venta";
  if (OPCIONES.test(texto)) return "seleccionando";
  if (mencionaVehiculo(texto)) return "nuevo";

  // Sin una señal clara no adivinamos. La etapa guardada suele estar cerca y
  // es el respaldo más seguro para un «ok», «gracias» o una pregunta lateral.
  return input.etapaGuardada;
}
