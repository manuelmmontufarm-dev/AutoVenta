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
