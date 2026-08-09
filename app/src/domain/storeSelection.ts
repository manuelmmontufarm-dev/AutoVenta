const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export type ExplicitStore = "Depot Tire Cumbayá" | "Depot Tire Quito Sur";

/** Solo acepta una elección inequívoca; "sur" suelto puede ser una ubicación. */
export function extractExplicitStore(text: string): ExplicitStore | null {
  const value = normalize(text);
  const cumbaya = /\bcumbaya\b/.test(value);
  const sur = /\bquito\s+sur\b|\b(?:local|sucursal)\s+(?:(?:de|del)\s+)?(?:quito\s+)?sur\b|\bel\s+de\s+(?:quito\s+)?sur\b/.test(value);
  if (cumbaya === sur) return null;
  return cumbaya ? "Depot Tire Cumbayá" : "Depot Tire Quito Sur";
}
