export interface TireLoadSpeed {
  code: string;
  loadIndex: number;
  speedSymbol: string;
  loadKg: number | null;
  speedKmh: number | null;
}
const LOAD_KG: Record<number, number> = {
  60: 250, 61: 257, 62: 265, 63: 272, 64: 280, 65: 290, 66: 300,
  67: 307, 68: 315, 69: 325, 70: 335, 71: 345, 72: 355, 73: 365,
  74: 375, 75: 387, 76: 400, 77: 412, 78: 425, 79: 437, 80: 450,
  81: 462, 82: 475, 83: 487, 84: 500, 85: 515, 86: 530, 87: 545,
  88: 560, 89: 580, 90: 600, 91: 615, 92: 630, 93: 650, 94: 670,
  95: 690, 96: 710, 97: 730, 98: 750, 99: 775, 100: 800, 101: 825,
  102: 850, 103: 875, 104: 900, 105: 925, 106: 950, 107: 975,
  108: 1000, 109: 1030, 110: 1060, 111: 1090, 112: 1120,
  113: 1150, 114: 1180, 115: 1215, 116: 1250, 117: 1285,
  118: 1320, 119: 1360, 120: 1400, 121: 1450, 122: 1500,
  123: 1550, 124: 1600, 125: 1650, 126: 1700,
};

const SPEED_KMH: Record<string, number> = {
  J: 100,
  K: 110,
  L: 120,
  M: 130,
  N: 140,
  P: 150,
  Q: 160,
  R: 170,
  S: 180,
  T: 190,
  U: 200,
  H: 210,
  V: 240,
  W: 270,
  Y: 300,
};

/**
 * Extrae el primer índice de carga/velocidad que aparece después de la medida.
 * Tolera "91V", "91 V", "112T" y variantes XL/TL alrededor del código.
 */
export function extractLoadSpeed(text: string): TireLoadSpeed | null {
  const match = text.toUpperCase().match(/\b(\d{2,3})\s*([JKLMNPQRSTUHVWY])\b/);
  if (!match) return null;
  const loadIndex = Number(match[1]);
  const speedSymbol = match[2];
  return {
    code: `${loadIndex}${speedSymbol}`,
    loadIndex,
    speedSymbol,
    loadKg: LOAD_KG[loadIndex] ?? null,
    speedKmh: SPEED_KMH[speedSymbol] ?? null,
  };
}
