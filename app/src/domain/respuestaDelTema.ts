/**
 * UNA RESPUESTA FIJA REEMPLAZA LO QUE EL MODELO DIJO SOBRE ESE MISMO TEMA.
 *
 * Varios candados contestan con un hecho del negocio que no se le pide al
 * modelo: la política de pago, el descuento de la cotización, el beneficio de
 * redes. Hasta el 12-sep lo ANTEPONÍAN al borrador y dejaban intacto lo que el
 * modelo ya había escrito sobre lo mismo, y el cliente leía dos respuestas:
 *
 *   21:42 · «Así es: su cotización ya trae el 25 % de descuento, $77.64 menos…»
 *           «Sí, esa es la idea: el precio ya le quedó en $58.25 c/u…»
 *   21:45 · [el beneficio de redes]
 *           «Sí. Con la compra se incluye instalación, alineación y balanceo…»
 *
 * Esto quita del borrador las frases del tema y deja todo lo demás: las
 * preguntas —ahí suele estar el cierre del turno— y las líneas del menú
 * numerado se conservan siempre. Si de un bloque solo queda un asentimiento
 * suelto («Sí.»), también sale: sin su frase no dice nada.
 */

const SEPARADOR = /\n\s*-{3,}\s*\n/;
const LINEA_DE_MENU = /^\s*\d\s*[).]/;
const SOLO_ASENTIMIENTO =
  /^(?:s[ií]|claro|as[ií] es|exacto|correcto|perfecto|con gusto|por supuesto|de acuerdo|listo)[\s.!,:;]*(?:\p{Extended_Pictographic}️?\s*)*$/iu;

export interface SinFrasesDelTema {
  texto: string;
  /** Las frases que salieron, para el log. */
  quitadas: string[];
}

export function sinFrasesDelTema(texto: string, esDelTema: (frase: string) => boolean): SinFrasesDelTema {
  const quitadas: string[] = [];
  const bloques = texto.split(SEPARADOR).map((bloque) => {
    const antes = quitadas.length;
    const limpio = bloque
      .split("\n")
      .map((linea) => {
        if (LINEA_DE_MENU.test(linea)) return linea;
        return linea
          .split(/(?<=[.!?])\s+/)
          .filter((frase) => {
            const f = frase.trim();
            if (!f || f.includes("?") || f.includes("¿") || !esDelTema(f)) return true;
            quitadas.push(f);
            return false;
          })
          .join(" ");
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return quitadas.length > antes && SOLO_ASENTIMIENTO.test(limpio) ? "" : limpio;
  });
  if (!quitadas.length) return { texto, quitadas };
  return { texto: bloques.filter(Boolean).join("\n---\n"), quitadas };
}
