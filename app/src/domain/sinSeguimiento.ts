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

export type MotivoSinSeguimiento =
  | "cierre_del_cliente"
  | "compro_en_otro_lugar"
  | "el_cliente_avisa"
  | "espera_que_le_avisen"
  | "fuera_de_cobertura";


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
}): MotivoSinSeguimiento | null {
  const ultimo = input.ultimo?.trim() ?? "";
  if (!ultimo) return null;
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
