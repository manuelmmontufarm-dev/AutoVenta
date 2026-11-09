/**
 * «ESTE CLIENTE NO QUIERE SEGUIMIENTO», UNA SOLA VEZ (auditoría 19-oct-2026,
 * familia 6).
 *
 * Las formas ya existían repartidas —el cierre del turno (`cierreTurno.ts`),
 * la compra en otro lado (`cierrePerdido.ts`), el «yo le aviso»
 * (`clientePosterga.ts`), quien está fuera de Quito (`porQueNoPasaPorElLocal`)—
 * y cada puerta consultaba algunas: al agendar solo el cierre del turno, al
 * enviar el «yo le aviso» y la cobertura después de pagar la redacción. Lo que
 * quedaba entre medio lo terminaba de frenar el Guardián, pagado: 30
 * seguimientos corregidos o suprimidos en 13–19 oct (22876, 27292), y en 27914
 * («Cuando lo tenga me avisa») ni eso.
 *
 * Puro. Recibe los dos últimos mensajes del cliente en el ciclo y por qué no
 * pasa por el local; `services/followUps.ts` junta esos datos y cancela con el
 * motivo, al agendar y al enviar.
 */
import { tipoDeCierreDelTurno } from "./cierreTurno.js";
import { comproEnOtroLugar } from "./cierrePerdido.js";
import { elClienteDijoQueAvisa, pideQueLeAvisen } from "./clientePosterga.js";
import type { SinVisita } from "./compraADistancia.js";
import { esAcuseSimple } from "./ofertaAceptada.js";
import { diceQueEstaLejos } from "./clienteLejos.js";

export type MotivoSinSeguimiento =
  | "cierre_del_cliente"
  | "compro_en_otro_lugar"
  | "el_cliente_avisa"
  | "espera_que_le_avisen"
  | "fuera_de_cobertura"
  | "rechazo_del_cliente";

/**
 * LO QUE EL CLIENTE DIJO DE VERDAD (auditoría 9-nov, 2c1). Las formas de arriba
 * eran frases exactas y devolvían null con «Está muy lejos le agradezco»
 * (38924), «No nos espere» + «Gracias» + «Muy amable» (39667), «Encontramos las
 * BFGoodrich» (39667) y «Ninguna gracias, necesito llantas doble propósito»
 * (39282, a quien el seguimiento le reenvió el menú que acababa de rechazar).
 * Cada una dice «no me escriba más de esto»; ninguna es una duda ni una venta
 * viva. Se cuida lo contrario: «está muy lejos PERO voy» y «encontré la medida
 * en el costado» siguen siendo venta.
 */
const NO_ME_ESPERE = /\bno\s+(?:me|nos|se)\s+espere(?:n)?\b/i;
const ENCONTRO_LLANTAS = /\b(?:encontramos|encontr[eé]|conseguimos|consegu[ií])\s+(?:ya\s+)?(?:las|unas?|otras?|llantas|el|la|los)\b/i;
const ENCONTRO_UN_DATO = /\b(?:medida|numeraci[oó]n|costado|c[oó]digo|foto|d[oó]nde|donde)\b/i;
const NINGUNA_GRACIAS = /^\s*ningunas?(?:\s+de\s+(?:las|esas|ellas|estas))?[\s,.!]*gracias\b/i;

/**
 * UN MENSAJE QUE SIGUE VENDIENDO NO ES UN RECHAZO (revisión del sprint 2). Si el
 * mismo mensaje pregunta (?), pide algo (cotiza, precio, tienen, mejora…) o
 * habla hacia adelante (mañana, el sábado, otro día, voy, paso, vamos), el
 * cliente está negociando: «No nos espere hoy, mañana sí vamos», «Está muy
 * lejos Cumbayá, ¿tienen local en el sur?», «Es muy lejos el norte, voy al de
 * la Shyris». Se cancelaban en silencio.
 */
const PREGUNTA = /[?¿]/;
const PEDIDO = /\b(?:cotiz\w*|precio\w*|cu[aá]nto\w*|tienen|tiene\s+en|mejora\w*|descuento\w*|disponible\w*|env[ií]\w*|necesito|quiero|busco)\b/i;
const HACIA_ADELANTE =
  /\b(?:ma[nñ]ana|pasado\s+ma[nñ]ana|el\s+(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)|otro\s+d[ií]a|la\s+pr[oó]xima|voy|vamos|paso|pasamos|pasar[eé]\w*|ir[eé]|iremos|llego|llegamos|vengo|venimos|vendr[eé]\w*)\b/i;

/** ¿Este mensaje del cliente mantiene viva la venta? (pregunta, pedido, futuro o una medida) */
export function mantieneLaVenta(texto: string): boolean {
  return PREGUNTA.test(texto) || PEDIDO.test(texto) || HACIA_ADELANTE.test(texto) || /\b\d{3}\s*\/\s*\d{2}\b/.test(texto);
}

function rechazaSeguir(texto: string): boolean {
  // «Ninguna gracias, necesito llantas doble propósito» (39282) es rechazo de lo
  // que se le mostró aunque diga qué necesita: su regla va aparte.
  if (NINGUNA_GRACIAS.test(texto)) return !PREGUNTA.test(texto);
  if (mantieneLaVenta(texto)) return false;
  if (NO_ME_ESPERE.test(texto)) return true;
  // «Está (muy) lejos»: el hecho tiene una sola fuente (clienteLejos.ts), la misma que lee dondeEstaElCliente.
  if (diceQueEstaLejos(texto)) return true;
  if (ENCONTRO_LLANTAS.test(texto) && !ENCONTRO_UN_DATO.test(texto)) return true;
  return false;
}

/**
 * Lo que el cliente dijo en su última racha, del más nuevo al más viejo: un
 * rechazo vale solo si NINGÚN mensaje posterior de la racha reactiva la venta.
 */
function rachaRechaza(racha: readonly string[]): boolean {
  for (const mensaje of racha) {
    if (rechazaSeguir(mensaje)) return true;
    if (mantieneLaVenta(mensaje)) return false;
  }
  return false;
}


/**
 * FUERA DE QUITO CON COTIZACIÓN ES UNA COMPRA A DISTANCIA (decisión de la
 * coordinación, 20-oct, chat 29177: Baños, $896 cotizados, envío ofrecido).
 * Sin cotización no hay nada que recordarle; con cotización el seguimiento
 * habla de pago y envío, sin mapas, local ni día. Lo usan el dueño de abajo y
 * la plantilla (`services/followUps.ts`).
 */
export function sinVisitaDelSeguimiento(sinVisita: SinVisita | null | undefined, hayCotizacion: boolean): SinVisita | null {
  if (sinVisita === "fuera_de_cobertura" && hayCotizacion) return "compra_a_distancia";
  return sinVisita ?? null;
}

export function motivoParaNoSeguir(input: {
  ultimo: string | null | undefined;
  anterior?: string | null;
  sinVisita?: SinVisita | null;
  /** Hay cotización en el ciclo (`quotes`). */
  hayCotizacion?: boolean;
  /**
   * Todo lo que el cliente escribió en su ÚLTIMA racha (los mensajes seguidos
   * antes de que el bot contestara), del más nuevo al más viejo. Un «No nos
   * espere» seguido de «Gracias» y «Muy amable» queda a tres mensajes del
   * último: mirar solo dos no lo ve (39667).
   */
  rachaDelCliente?: readonly (string | null | undefined)[];
}): MotivoSinSeguimiento | null {
  const ultimo = input.ultimo?.trim() ?? "";
  if (!ultimo) return null;
  const racha = (input.rachaDelCliente ?? []).map((m) => m?.trim() ?? "").filter(Boolean);
  // Con `rachaDelCliente` (aunque venga vacía: el cliente ya vio una lámina NUEVA después
  // de rechazar) manda la racha; sin ella, solo el último mensaje.
  if (rachaRechaza(input.rachaDelCliente ? racha : [ultimo])) return "rechazo_del_cliente";
  const anterior = input.anterior?.trim() || null;
  // El «ok» que sigue a la despedida no la deshace: se mira lo de antes.
  // El dueño de «esto es un acuse» es `esAcuseSimple` (ofertaAceptada.ts).
  const mensajes = esAcuseSimple(ultimo) && anterior ? [ultimo, anterior] : [ultimo];
  for (const texto of mensajes) {
    if (comproEnOtroLugar(texto)) return "compro_en_otro_lugar";
    if (pideQueLeAvisen(texto)) return "espera_que_le_avisen";
    if (elClienteDijoQueAvisa(texto)) return "el_cliente_avisa";
  }
  if (tipoDeCierreDelTurno(ultimo, anterior) !== null) return "cierre_del_cliente";
  // Fuera de Quito, sin compra a distancia y sin cotización: no hay visita que
  // recordarle ni nada que cobrarle (27292, Ambato). Con cotización, o quien
  // compra a distancia, SÍ sigue: su seguimiento habla de pago y envío.
  if (sinVisitaDelSeguimiento(input.sinVisita, Boolean(input.hayCotizacion)) === "fuera_de_cobertura") return "fuera_de_cobertura";
  return null;
}
