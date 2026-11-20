/**
 * NINGUNA FRASE DE LA TRASTIENDA LLEGA AL CLIENTE.
 *
 * Simulador Competimotor, 18-nov-2026 (CM26, r2 del lote 03-17): el candado de
 * `generar_cotizacion` devolvió «Cotización bloqueada: la medida… la dedujo el
 * bot», el modelo lo parafraseó y el Ángel Guardián lo aprobó:
 *
 *   «La cotización se bloqueó porque el sistema pide confirmar la medida
 *    escrita…»
 *
 * En CM34 los borradores decían «el sistema me pide reconfirmación manual» y
 * «no se pudo emitir automáticamente» (los frenó el Guardián, por suerte). Es
 * la misma familia que `jsonCrudo.ts`: el resultado de una herramienta se
 * vuelve respuesta. Allí se cae el bloque de JSON; acá se cae la ORACIÓN que
 * habla de cómo funciona el bot por dentro, y se queda lo demás —casi siempre
 * viene después la pregunta que sí había que hacer («¿Me confirma si su llanta
 * dice 185/60R14?»).
 *
 * Lista cerrada y corta a propósito: cada frase salió de un borrador real.
 * Puro y sin base para probarlo sin levantar nada.
 */

const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const TRASTIENDA: RegExp[] = [
  /\b(?:la\s+)?cotizacion\s+(?:se\s+)?bloque(?:o|ada|ado)\b/,
  /\bse\s+bloqueo\b/,
  /\bel\s+sistema\s+(?:me\s+|nos\s+)?(?:pide|exige|requiere|bloque\w*|no\s+(?:me\s+|nos\s+)?(?:deja|permite))\b/,
  /\b(?:la|una|esta|otra)\s+herramienta\b/,
  /\breconfirmacion\s+manual\b/,
  /\bno\s+se\s+pudo\s+(?:emitir|generar)\s+(?:la\s+cotizacion\s+)?automaticamente\b/,
  /\bcandado\b/,
];

export function esFraseDeTrastienda(frase: string): boolean {
  const n = normalizar(frase);
  return TRASTIENDA.some((re) => re.test(n));
}

export interface TextoSinTrastienda {
  texto: string;
  quitadas: string[];
}

/** Quita las oraciones de la trastienda; si no queda nada, deja el texto como estaba (y avisa). */
export function sinTrastienda(texto: string): TextoSinTrastienda {
  const quitadas: string[] = [];
  const lineas = texto.split("\n").map((linea) => {
    if (!esFraseDeTrastienda(linea)) return linea;
    // Oraciones dentro de la línea: se conserva lo que no habla de la trastienda.
    const oraciones = linea.split(/(?<=[.!?…])\s+/);
    const quedan = oraciones.filter((o) => {
      if (!esFraseDeTrastienda(o)) return true;
      quitadas.push(o.trim());
      return false;
    });
    return quedan.join(" ");
  });
  if (!quitadas.length) return { texto, quitadas: [] };
  const limpio = lineas
    .join("\n")
    .split(/\n\s*-{3,}\s*\n/)
    .map((b) => b.replace(/\n{3,}/g, "\n\n").trim())
    .filter(Boolean)
    .join("\n---\n")
    .trim();
  if (!limpio) return { texto, quitadas };
  return { texto: limpio, quitadas };
}
