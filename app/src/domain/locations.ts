import type { Store } from "../config.js";

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distancia haversine en km entre dos coordenadas. */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function nearestStore(
  stores: Store[],
  lat: number,
  lng: number,
): { store: Store; distanceKm: number } {
  let best = stores[0];
  let bestDist = distanceKm(lat, lng, best.lat, best.lng);
  for (const store of stores.slice(1)) {
    const d = distanceKm(lat, lng, store.lat, store.lng);
    if (d < bestDist) {
      best = store;
      bestDist = d;
    }
  }
  return { store: best, distanceKm: Math.round(bestDist * 10) / 10 };
}

const QUITO_SECTORS: Record<string, { lat: number; lng: number; label: string }> = {
  itulcachi: { lat: -0.157, lng: -78.337, label: "Itulcachi" },
  cumbaya: { lat: -0.2, lng: -78.43, label: "Cumbayá" },
  tumbaco: { lat: -0.211, lng: -78.402, label: "Tumbaco" },
  pifo: { lat: -0.225, lng: -78.339, label: "Pifo" },
  quito: { lat: -0.18, lng: -78.49, label: "Quito" },
};

function normalizar(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function resolveSector(text: string): { lat: number; lng: number; label: string } | null {
  const normalized = normalizar(text);
  return Object.entries(QUITO_SECTORS).find(([key]) => normalized.includes(key))?.[1] ?? null;
}

/**
 * Vocabulario de lugar del negocio, sin tildes y en min\u00fasculas.
 *
 * No sirve para resolver nada: es la lista de palabras que se repiten
 * leg\u00edtimamente en cualquier conversaci\u00f3n que termine en una visita (\u00ab\u00bfen
 * Cumbay\u00e1 o en Quito Sur?\u00bb, \u00abla direcci\u00f3n del local\u00bb). El detector de
 * repetici\u00f3n las descuenta antes de comparar dos mensajes \u2014 contarlas como
 * repetici\u00f3n es lo que hizo saltar la alerta en la conv 6467, donde esas
 * palabras ERAN la conversaci\u00f3n.
 */
export const LOCATION_WORDS: readonly string[] = [
  ...Object.keys(QUITO_SECTORS),
  ...Object.values(QUITO_SECTORS).map((sector) => normalizar(sector.label)),
  "depot", "tire", "norte", "centro", "valle", "sector",
  "local", "locales", "sucursal", "tienda", "almacen",
  "direccion", "ubicacion", "mapa", "maps", "google",
];
