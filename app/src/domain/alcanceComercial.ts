import { extractConventionalSizes, extractFlotationSizes, extractTireSizes } from "./tireSize.js";
import { politica } from "../negocio/politica.js";

const normalizar = (texto: string) =>
  (texto ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const FUERA_DE_CATALOGO_COMUN =
  /\b(?:cambio\s+de\s+aceite|cambiar\s+el\s+aceite|aceite\s+de\s+motor|filtro\s+de\s+aceite|lavado|pintura|matriculacion|revision\s+tecnica|mecanica\s+general|llanta\s+industrial|llantas?\s+solid[oa]s?|montacargas|uso\s+industrial|maquinaria\s+pesada)\b/;

/**
 * LO QUE EL NEGOCIO VENDE PERO EL BOT NO COTIZA (`politica.productosQueDerivaAlAsesor`).
 *
 * Mundillantas vende lubricantes, baterías, aceites y taller (pitch del
 * 4-nov): el bot no tiene ese catálogo, así que una consulta por eso se trata
 * como fuera de catálogo y va al asesor — el camino que ya existe. Cada
 * producto acepta su plural («batería» / «baterías», «taller» / «talleres»).
 * Depot no deriva nada extra: la lista común queda igual.
 */
const DERIVADOS = politica.productosQueDerivaAlAsesor
  .map((producto) => normalizar(producto).trim().replace(/s$/, ""))
  .filter(Boolean)
  .map((raiz) => `${raiz.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}(?:e?s)?`);
const FUERA_DE_CATALOGO = DERIVADOS.length
  ? new RegExp(`${FUERA_DE_CATALOGO_COMUN.source}|\\b(?:${DERIVADOS.join("|")})\\b`)
  : FUERA_DE_CATALOGO_COMUN;

const HABLA_DE_LLANTAS =
  /\b(?:llant\w*|neumatic\w*|caucho\w*|rin(?:es)?|aro(?:s)?|falken|kenda|winrun|medida\s+de\s+la\s+llanta)\b/;

export function esConsultaFueraDeCatalogo(texto: string): boolean {
  return FUERA_DE_CATALOGO.test(normalizar(texto));
}

export function tieneIntencionExplicitaDeLlantas(texto: string): boolean {
  return HABLA_DE_LLANTAS.test(normalizar(texto))
    || extractTireSizes(texto).length > 0
    || extractFlotationSizes(texto).length > 0
    || extractConventionalSizes(texto).length > 0;
}

/** La última intención explícita manda; un "ok" conserva la consulta activa. */
export function consultaFueraDeCatalogoActiva(textosCronologicos: readonly string[]): boolean {
  let activa = false;
  for (const texto of textosCronologicos) {
    if (tieneIntencionExplicitaDeLlantas(texto)) activa = false;
    if (esConsultaFueraDeCatalogo(texto)) activa = true;
  }
  return activa;
}

export const ORDEN_FUERA_DE_CATALOGO =
  "CONSULTA FUERA DEL CATÁLOGO DE LLANTAS (fuente determinística): el cliente está preguntando por otro servicio. " +
  "No busques, muestres ni cotices llantas aunque haya dicho el modelo del vehículo. Responde únicamente lo que " +
  "esté respaldado y usa notificar_vendedor si hace falta confirmación humana.";

export function preguntaSiPuedeLlevarSuAceite(texto: string): boolean {
  const n = normalizar(texto);
  return /\b(?:puedo|podria|se puede)\s+llevar\s+(?:mi|el|su|propio)\s+aceite\b/.test(n)
    || /\baceptan\s+(?:mi|el|su|propio)\s+aceite\b/.test(n);
}

export function afirmaQueAceptanAceiteDelCliente(texto: string): boolean {
  const n = normalizar(texto);
  return /\bsi,?\s+(?:usted\s+)?puede\s+llevar\s+(?:su|el|propio)\s+aceite\b/.test(n)
    || /\b(?:le\s+)?hacen\s+el\s+cambio\s+con\s+(?:su|el|ese)\s+(?:aceite|producto)\b/.test(n)
    || /\baceptamos\s+(?:su|el|propio)\s+aceite\b/.test(n);
}

export const RESPUESTA_SEGURA_SOBRE_ACEITE =
  "No puedo confirmarle por este canal si el local acepta aceite llevado por el cliente. " +
  "Esa condición debe validarla directamente un asesor según el aceite y el filtro que necesite su vehículo.";

// ===========================================================================
// Servicios y aceite EN PROMOCIÓN DE TEMPORADA (Black Friday, nov-2026)
// ===========================================================================

/**
 * Cómo nombra la gente cada servicio de taller. Vocabulario de cualquier
 * llantera, no de un cliente: qué servicios hay —y a qué precio— lo dice la
 * política (`promocionDeTemporada.servicios`), y un servicio entra solo si su
 * nombre en la política contiene la raíz.
 */
const RAICES_DE_SERVICIO: ReadonlyArray<{ raiz: string; dicho: RegExp }> = [
  { raiz: "alinea", dicho: /\balin(?:ea|ie)\w*/ },
  { raiz: "balance", dicho: /\bbalance\w*/ },
  { raiz: "fren", dicho: /\bfren\w*|\babc\b/ },
  { raiz: "enllant", dicho: /\benllant\w*|\b(?:des)?montaje\b|\binstalaci\w*/ },
];
const HABLA_DE_ACEITE = /\baceites?\b|\blubricantes?\b/;
const DICE_CAMIONETA = /\bcamionet\w*|\bsuv\b|\b4x4\b|\bpick\s?-?up\b|\bjeep\b|\bdoble\s+cabina\b/;
const DICE_AUTO = /\bautos?\b|\bautomovil\w*|\bcarr(?:o|ito)s?\b|\bsedan\b|\bhatchback\b/;

export interface ConsultaDeTemporada {
  /**
   * «servicio»: pregunta por un servicio o el aceite y la promo le aplica.
   * «incluido_con_la_llanta»: compra llantas y pregunta por algo que con la
   * llanta ya va INCLUIDO (alineación, balanceo…): el descuento no es para él.
   */
  tipo: "servicio" | "incluido_con_la_llanta";
  /** Los servicios de la política que nombró, con su nombre de la política. */
  servicios: string[];
  /** ¿Preguntó por el aceite? */
  aceite: boolean;
  /** Lo que dijo de su vehículo; null si no lo dijo. */
  vehiculo: "auto" | "camioneta" | null;
}

/** Los servicios de la política que este texto nombra. */
export function serviciosNombrados(texto: string, nombresDeLaPolitica: readonly string[]): string[] {
  const n = normalizar(texto);
  return nombresDeLaPolitica.filter((nombre) => {
    const enLaPolitica = normalizar(nombre);
    return RAICES_DE_SERVICIO.some((r) => enLaPolitica.includes(r.raiz) && r.dicho.test(n));
  });
}

/** «auto» o «camioneta», según lo último que dijo el cliente de su vehículo. */
export function vehiculoDicho(textosCronologicos: readonly string[]): "auto" | "camioneta" | null {
  let vehiculo: "auto" | "camioneta" | null = null;
  for (const texto of textosCronologicos) {
    const n = normalizar(texto);
    if (DICE_CAMIONETA.test(n)) vehiculo = "camioneta";
    else if (DICE_AUTO.test(n)) vehiculo = "auto";
  }
  return vehiculo;
}

/**
 * ¿El cliente está preguntando por un servicio o por el aceite de la promo?
 *
 * Mientras la promo de temporada corre, «cambio de aceite» deja de ser un
 * «no lo confirmo por aquí»: el bot dice el descuento y la visita la confirma
 * el asesor. Igual que `consultaFueraDeCatalogoActiva`, manda la ÚLTIMA
 * intención: si después pide llantas, vuelve el catálogo.
 *
 * El matiz que no puede fallar (Manuel, 5-nov): quien compra llantas ya tiene
 * alineación y balanceo INCLUIDOS. Si en el ciclo habló de llantas y ahora
 * pregunta solo por servicios que van incluidos, no es una consulta de
 * servicio: es `incluido_con_la_llanta`, y el 50 % no se le ofrece.
 *
 * `serviciosDeLaPromo` y `incluidosConLaLlanta` vienen ya resueltos (la
 * promo vigente de la política y la tabla de beneficios): este módulo no lee
 * fechas ni base. Sin servicios ni aceite en promo, devuelve null.
 */
export function consultaDeServicioDeTemporada(
  textosCronologicos: readonly string[],
  promo: {
    serviciosDeLaPromo: readonly string[];
    hayAceiteEnPromo: boolean;
    incluidosConLaLlanta: readonly string[];
  },
): ConsultaDeTemporada | null {
  if (!promo.serviciosDeLaPromo.length && !promo.hayAceiteEnPromo) return null;
  let compraLlantas = false;
  let activa: { servicios: string[]; aceite: boolean } | null = null;
  for (const texto of textosCronologicos) {
    const servicios = serviciosNombrados(texto, promo.serviciosDeLaPromo);
    const aceite = promo.hayAceiteEnPromo && HABLA_DE_ACEITE.test(normalizar(texto));
    if (tieneIntencionExplicitaDeLlantas(texto)) {
      compraLlantas = true;
      activa = null;
    }
    if (servicios.length || aceite) activa = { servicios, aceite };
  }
  if (!activa) return null;
  const vehiculo = vehiculoDicho(textosCronologicos);
  const incluidos = new Set(promo.incluidosConLaLlanta);
  const soloIncluidos = !activa.aceite && activa.servicios.every((s) => incluidos.has(s));
  return {
    tipo: compraLlantas && soloIncluidos ? "incluido_con_la_llanta" : "servicio",
    ...activa,
    vehiculo,
  };
}
