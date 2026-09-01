/**
 * El cliente pide recomendación (o cuenta para qué la quiere) con la pieza
 * de opciones YA enviada.
 *
 * Producción, 1-sep-2026, 16:02 (+593 98 229 0818): con la medida confirmada
 * y las opciones en pantalla, el cliente escribió «Busco una llanta / Que se
 * adiera / Al pavimento». El manual dice que la recomendación va en la pieza
 * con `preparar_opciones`; el modelo no la llamó ni una vez en tres corridas
 * del simulador y escribió la recomendación en texto, con precio y beneficios,
 * en cuatro burbujas. Es la familia «regla de prompt que no se cumple»: por
 * eso la decisión vive aquí, determinista, y la ejecuta una ruta directa antes
 * del agente. Ver services/recomendarConLaPieza.ts.
 *
 * Puro, sin base: se prueba con texto.
 */
import { describeUso, pideRecomendacion } from "./salesIntent.js";

export interface PiezaDeOpciones {
  codes: string[];
  /** Guardados desde el 1-sep; las piezas anteriores no los traen. */
  recomendado?: string | null;
  motivo?: string | null;
  escalones?: {
    premium?: { codigo?: string | null } | null;
    equilibrada?: { codigo?: string | null } | null;
    economica?: { codigo?: string | null } | null;
  } | null;
}

/**
 * ¿Le toca a la ruta directa? Solo cuando hay pieza que reenviar, el cliente
 * está pidiendo criterio (no precio, no cantidad, no un modelo) y todavía no
 * hay cotización: con cotización viva ya eligió, y eso lo lleva el vendedor.
 */
export function pideLaRecomendacionConPiezaEnviada(
  texto: string,
  pieza: PiezaDeOpciones | null,
  hayCotizacion: boolean,
): boolean {
  if (!pieza?.codes?.length) return false;
  if (hayCotizacion) return false;
  return pideRecomendacion(texto) || describeUso(texto);
}

const MOTIVO_POR_DEFECTO = "es la de mejor desempeño de las que le mostré";

/** La recomendada de la pieza, con su porqué; si la pieza es vieja, la premium. */
export function recomendadaDeLaPieza(pieza: PiezaDeOpciones): { recomendado: string; motivo: string } {
  const recomendado =
    (pieza.recomendado && pieza.codes.includes(pieza.recomendado) ? pieza.recomendado : null)
    ?? pieza.escalones?.premium?.codigo
    ?? pieza.codes[0];
  const motivo = pieza.motivo?.trim() || MOTIVO_POR_DEFECTO;
  return { recomendado, motivo };
}
