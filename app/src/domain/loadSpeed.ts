/**
 * Índice de carga y velocidad de llantas (ej. "112T", "117/114 S").
 * Se extrae del texto crudo de la columna "medida" del catálogo y se traduce
 * a kg y km/h para que el cliente entienda qué está comprando.
 */

/** kg máximos por índice de carga (rango útil para autos/camionetas). */
const LOAD_KG: Record<number, number> = {
  70: 335, 71: 345, 72: 355, 73: 365, 74: 375, 75: 387, 76: 400, 77: 412,
  78: 425, 79: 437, 80: 450, 81: 462, 82: 475, 83: 487, 84: 500, 85: 515,
  86: 530, 87: 545, 88: 560, 89: 580, 90: 600, 91: 615, 92: 630, 93: 650,
  94: 670, 95: 690, 96: 710, 97: 730, 98: 750, 99: 775, 100: 800, 101: 825,
  102: 850, 103: 875, 104: 900, 105: 925, 106: 950, 107: 975, 108: 1000,
  109: 1030, 110: 1060, 111: 1090, 112: 1120, 113: 1150, 114: 1180,
  115: 1215, 116: 1250, 117: 1285, 118: 1320, 119: 1360, 120: 1400,
  121: 1450, 122: 1500, 123: 1550, 124: 1600, 125: 1650, 126: 1700,
  127: 1750, 128: 1800, 129: 1850, 130: 1900,
};

/** km/h máximos por código de velocidad. */
const SPEED_KMH: Record<string, number> = {
  L: 120, M: 130, N: 140, P: 150, Q: 160, R: 170, S: 180, T: 190,
  U: 200, H: 210, V: 240, W: 270, Y: 300,
};

export interface LoadSpeed {
  /** Etiqueta tal como viene, ej. "112T" o "117/114 S". */
  label: string;
  /** Traducción legible, ej. "1120 kg máx · 190 km/h máx". Null si no se pudo traducir. */
  translation: string | null;
}

/**
 * Busca un índice de carga/velocidad dentro de un texto libre de catálogo,
 * ej. "LT265/70R16 8PR 117/114 S - KR608 TL (CARGA)" → "117/114 S".
 * Evita confundirse con la medida (185/65R14) exigiendo que el número
 * NO esté pegado a una R de radial.
 */
export function extractLoadSpeed(raw: string): LoadSpeed | null {
  // Formato simple o doble (carga): "112T", "112 T", "117/114S", "117/114 S"
  const re = /\b(\d{2,3})(?:\/(\d{2,3}))?\s?([LMNPQRSTUHVWY])\b/g;
  for (const match of raw.matchAll(re)) {
    const [, loadStr, dualStr, speed] = match;
    const load = Number(loadStr);
    // Descarta falsos positivos tipo "70R16" (parte de la medida): en la medida
    // la letra es siempre R y va seguida del aro; aquí lo filtramos exigiendo
    // que el índice de carga exista en la tabla y que "R" no venga de "R16".
    if (speed === "R" && /R\d{2}/.test(raw.slice(match.index ?? 0))) continue;
    if (!LOAD_KG[load]) continue;
    const label = dualStr ? `${loadStr}/${dualStr} ${speed}` : `${loadStr}${speed}`;
    const kg = LOAD_KG[load];
    const kmh = SPEED_KMH[speed];
    const translation = kmh ? `${kg} kg máx · ${kmh} km/h máx` : `${kg} kg máx`;
    return { label, translation };
  }
  return null;
}
