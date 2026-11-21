/**
 * «4 × KENDA KR50 225/60R17» — lo que la cotización CONTIENE, para el prompt.
 *
 * Sin esto el hecho decía número y total, y el modelo le colgaba la medida de
 * la conversación: la semana del 14-ago el guardián corrigió 8 borradores que
 * atribuían la cotización vigente a otra medida o marca (COT-MT06MIVA «queda
 * con Falken» siendo 4 × KR50, COT-MT0BS1YT «de 185/70R15» siendo 225/60R17).
 */
export function detalleDeItems(items: unknown): string | null {
  if (!Array.isArray(items) || !items.length) return null;
  const partes = items
    .map((raw) => {
      const linea = raw as { quantity?: unknown; brand?: unknown; design?: unknown; size?: unknown; sizeLabel?: unknown };
      const nombre = [linea.brand, linea.design].filter(Boolean).join(" ");
      if (!nombre) return null;
      const medida = linea.sizeLabel ?? linea.size;
      return `${Number(linea.quantity) || 1} × ${nombre}${medida ? ` ${medida}` : ""}`;
    })
    .filter(Boolean);
  return partes.length ? partes.join(", ") : null;
}
