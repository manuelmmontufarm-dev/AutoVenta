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

export function resolveSector(text: string): { lat: number; lng: number; label: string } | null {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return Object.entries(QUITO_SECTORS).find(([key]) => normalized.includes(key))?.[1] ?? null;
}
