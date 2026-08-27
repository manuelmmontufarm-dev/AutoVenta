/**
 * Ningún bloque que sea JSON crudo sale hacia el cliente.
 *
 * Simulador, 27-ago-2026. El cliente tocó «Otro día», el modelo no supo qué
 * hacer con eso y llamó a `escalar_a_asesor`; el resultado de la herramienta
 * terminó SIENDO la respuesta, y al cliente le llegó tal cual:
 *
 *   {"motivo":"caso_sin_resolver","resumen":"Cliente con cotización ya enviada
 *    de 4 × FALKEN ZE310R 205/55R16 por $445.44. Confirmó local Depot Tire
 *    Cumbayá, pero todavía no da día para la visita…"}
 *
 * Eso no es solo feo: le enseña al cliente cómo se llaman las herramientas por
 * dentro y le muestra el resumen interno que el bot le manda al asesor.
 *
 * Se cae el BLOQUE y no el turno entero, igual que `sinPreguntasProhibidas`:
 * en el mismo mensaje solía venir después la pregunta que sí había que hacer
 * —la del día—, y tirar todo por un bloque hubiera dejado al cliente sin nada.
 * Que el modelo se equivoque otra vez es cuestión de tiempo; que su error se
 * vea en el teléfono de un cliente, no.
 *
 * Puro y sin base para poder probarlo sin levantar nada.
 */

/** El mismo separador que parte el turno en mensajes (`splitBlocks`). */
const SEPARADOR = /\n\s*-{3,}\s*\n/;

/** ¿Este bloque es un objeto o una lista de JSON y nada más? */
export function esJsonCrudo(bloque: string): boolean {
  const limpio = bloque.trim();
  if (!/^[[{]/.test(limpio) || !/[\]}]$/.test(limpio)) return false;
  try {
    const valor: unknown = JSON.parse(limpio);
    return typeof valor === "object" && valor !== null;
  } catch {
    return false;
  }
}

export interface TextoSinJson {
  texto: string;
  /** Lo que se cayó, para alertar al asesor y poder contarlo en el informe. */
  quitados: string[];
}

export function sinJsonCrudo(texto: string): TextoSinJson {
  const bloques = texto.split(SEPARADOR);
  const quitados = bloques.filter((b) => esJsonCrudo(b)).map((b) => b.trim());
  if (!quitados.length) return { texto, quitados: [] };
  return {
    texto: bloques.filter((b) => !esJsonCrudo(b)).join("\n---\n").trim(),
    quitados,
  };
}
