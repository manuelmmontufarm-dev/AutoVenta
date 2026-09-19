/**
 * EL REPARTO ASFALTO / TIERRA DE UNA LLANTA SALE DE SU FICHA, O NO SALE.
 *
 * Joaquín, 14-sep (conv 20017): el bot dijo de la Falken Wildpeak A/T 4W
 * «aprox. 70 % asfalto / 30 % tierra». Es 50/50. Manuel: «¿de dónde habrá
 * sacado?». De la definición GENÉRICA del tipo A/T, que traía ese número, y
 * que el modelo le colgó a una llanta concreta. La Wildpeak A/T Trail es 80/20,
 * la A/T 4W es 50/50: un porcentaje por tipo es falso para casi todos los
 * modelos del tipo.
 *
 * Determinístico y después del guardián, porque es un número: si el texto da
 * un reparto en porcentajes y ese reparto no está en la ficha de ninguno de los
 * modelos que el mismo texto nombra, la frase sale.
 *
 * Puro: recibe las líneas de la base (`todasLasLineas`) y el texto.
 */
export interface LineaConUso { modelo: string; uso: string }

const normalizar = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[*_]/g, "");

/** «70 % asfalto», «30% de tierra», «80 % ciudad». */
const REPARTO = /(\d{2,3})\s?%\s*(?:de\s+|en\s+)?(asfalto|tierra|ciudad|carretera|lodo|campo|lastre|off\s?-?road)/g;

/** Para comparar modelos: «WILDPEAK A/T 4W» y «Wildpeak A/T4W» son la misma. */
const llaveDeModelo = (m: string) => normalizar(m).replace(/[^a-z0-9]/g, "");

function porcentajes(texto: string): string[] {
  return [...normalizar(texto).matchAll(REPARTO)].map((m) => m[1]);
}

export function sinRepartoInventado(texto: string, lineas: readonly LineaConUso[]): string {
  if (!porcentajes(texto).length) return texto;
  const llaveDelTexto = llaveDeModelo(texto);
  const permitidos = new Set(
    lineas
      .filter((l) => llaveDeModelo(l.modelo).length >= 4 && llaveDelTexto.includes(llaveDeModelo(l.modelo)))
      .flatMap((l) => porcentajes(l.uso)),
  );
  // Frase por frase, conservando los saltos y los separadores de bloque.
  const partes = texto.split(/(?<=[.!?])\s+(?=\S)|(\n+)/).filter((p) => p !== undefined);
  const limpio = partes
    .filter((frase) => {
      const dichos = porcentajes(frase);
      return !dichos.length || dichos.every((p) => permitidos.has(p));
    })
    .join(" ")
    .replace(/ ?(\n+) ?/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return limpio || texto;
}
