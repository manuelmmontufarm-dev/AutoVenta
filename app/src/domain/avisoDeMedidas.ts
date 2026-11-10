/**
 * «⚠️ OJO: ESTAS OPCIONES SON DE *MEDIDAS DISTINTAS*…» — el aviso que escribe
 * `preparar_opciones` cuando la lámina mezcla medidas del mismo aro y el
 * cliente no dio la suya completa. Fuente única del texto: lo arma la
 * herramienta y lo busca el candado que lo repone después del Guardián.
 *
 * Auditoría 9-nov (39897, 39787): el Guardián mini lo borró como
 * `cotizacion_sin_medida` o le quitó la lista de medidas como
 * `medida_incorrecta`. Es verdad de la herramienta, no una afirmación del
 * vendedor: el cliente tiene que saber que cada tarjeta lleva su propia medida.
 */

const ABRE = "⚠️ Ojo: estas opciones son de *medidas distintas* del mismo aro";

/** La primera frase: el hecho. La que el candado repone si la corrección la quitó o la cambió. */
export function fraseDelAvisoDeMedidas(medidas: readonly string[]): string {
  return `${ABRE} (${medidas.join(", ")}) — cada tarjeta lleva la suya.`;
}

/** El aviso completo que sale con la lámina: el hecho y el pedido de la medida del costado. */
export function avisoDeMedidasDistintas(medidas: readonly string[]): string {
  return `${fraseDelAvisoDeMedidas(medidas)} Para asegurarle el calce necesito la medida del costado de su llanta.`;
}

const FRASE = /⚠️ Ojo: estas opciones son de \*medidas distintas\* del mismo aro \([^)]*\) — cada tarjeta lleva la suya\./;

/** La primera frase del aviso tal como salió de la herramienta en este texto, o null. */
export function fraseDelAvisoEn(texto: string | null | undefined): string | null {
  return (texto ?? "").match(FRASE)?.[0] ?? null;
}

/**
 * La versión del aviso que dejó la corrección: la primera oración que abre con
 * «⚠️ Ojo: estas opciones son de…» (39787 en el simulador: «…son de *rin 17* y
 * cada tarjeta lleva su medida.») o que habla de «medidas distintas/diferentes»
 * (en plural: «si su llanta es de una medida diferente, me avisa» no es el aviso,
 * revisión ronda 2) o de que «cada tarjeta/opción lleva/es de su/otra medida».
 */
export const ORACION_DE_MEDIDAS_DISTINTAS =
  /⚠️\s*Ojo:\s*estas\s+opciones\s+son\s+de[^.!?\n]*[.!?]?|[^.!?\n]*(?:medidas\s+(?:distintas|diferentes)|cada\s+(?:tarjeta|opci[oó]n|llanta)\s+(?:lleva|es\s+de|tiene|trae)\s+(?:su|otra|una)\s+(?:propia\s+)?medida)[^.!?\n]*[.!?]?/i;
