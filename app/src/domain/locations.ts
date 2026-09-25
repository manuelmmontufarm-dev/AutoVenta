import type { Store } from "../config.js";
import { negocio } from "../negocio/index.js";

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

/**
 * Las zonas de la ciudad DEL NEGOCIO — Quito para Depot, las que cargue cada
 * cliente para los demás. Viven en `negocio/negocios/<cliente>.ts`.
 *
 * El orden importa y lo fija el perfil: la búsqueda es por subcadena y se queda
 * con el PRIMERO que calza, así que lo específico va antes que lo genérico.
 * «al sur de Quito» contiene las dos palabras y tiene que resolver al sur, no
 * al centro.
 *
 * Un negocio sin sectores cargados no adivina: `resolveSector` devuelve null y
 * el bot pide el pin, que es lo correcto — mandar a alguien al local equivocado
 * cuesta más que una pregunta de más.
 */
const SECTORES = negocio.sectores;

function normalizar(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function resolveSector(text: string): { lat: number; lng: number; label: string } | null {
  const normalized = normalizar(text);
  const sector = SECTORES.find((s) => normalized.includes(s.clave));
  return sector ? { lat: sector.lat, lng: sector.lng, label: sector.etiqueta } : null;
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
  // Del negocio: sus zonas, los nombres de sus locales y lo suyo propio.
  ...SECTORES.map((sector) => sector.clave),
  ...SECTORES.map((sector) => normalizar(sector.etiqueta)),
  // PALABRA POR PALABRA, no el nombre entero: la lista se compara contra tokens
  // sueltos, así que «depottirecumbaya» no casaría con nada.
  ...negocio.locales.flatMap((local) =>
    `${local.nombre} ${local.nombreCorto}`.split(/\s+/).map(normalizar).filter(Boolean),
  ),
  ...negocio.palabrasDeLugarPropias.map((palabra) => normalizar(palabra)),
  // Genéricas: las dice cualquier cliente de cualquier llantera.
  "norte", "centro", "valle", "sector",
  "local", "locales", "sucursal", "tienda", "almacen",
  "direccion", "ubicacion", "mapa", "maps", "google",
];

/**
 * ¿LA UBICACIÓN CON LA QUE SE ELIGE EL LOCAL LA DIO EL CLIENTE?
 *
 * Caso 1 de las pruebas del 12-sep (conv 3, 17:17): el cliente escribió «La
 * promoción del 25% q son 103$.64 menos» y el modelo llamó `local_mas_cercano`
 * con una ubicación que nadie había dado. Salió «El local recomendado es Depot
 * Tire Cumbayá», el horario y el mapa, y la promoción quedó sin respuesta.
 *
 * Coordenadas valen solo si el cliente mandó su pin en el ciclo; un sector,
 * solo si él lo nombró. Sin ubicación en los argumentos no hay nada que
 * comprobar: esa rama muestra los dos locales y no elige por él.
 */
export function ubicacionDadaPorElCliente(input: {
  textos: readonly (string | null | undefined)[];
  sector: string | null;
  lat: number | null;
  lng: number | null;
}): boolean {
  const textos = input.textos.filter((t): t is string => Boolean(t));
  if (input.lat != null && input.lng != null) {
    return textos.some((t) => t.includes("[El cliente compartió su ubicación"));
  }
  if (input.sector) {
    const resuelto = resolveSector(input.sector);
    // Un sector que no se reconoce no elige local: esa rama muestra los dos.
    if (!resuelto) return true;
    const buscado = normalizar(input.sector);
    return textos.some((t) => {
      if (buscado && normalizar(t).includes(buscado)) return true;
      const delCliente = resolveSector(t);
      return Boolean(resuelto && delCliente && delCliente.label === resuelto.label);
    });
  }
  return true;
}

/**
 * EL CLIENTE YA DIJO DÓNDE ESTÁ, EN EL MISMO MENSAJE EN QUE PREGUNTA DÓNDE
 * QUEDAN (Joaquín, 14-sep, conv 20427): «Dónde está ubicado los locales ya q yo
 * me ubico al sur de Quito» recibió los dos mapas y «¿Cumbayá o Quito Sur?» con
 * botones — «para qué preguntar de nuevo». Igual en la conv 3735.
 *
 * Devuelve el local solo cuando la zona se reconoce y un local le queda
 * claramente más cerca que el otro; con una zona a medio camino no se elige
 * por él.
 */
export function localPorLaZonaDicha(stores: Store[], texto: string | null | undefined): Store | null {
  if (!texto || stores.length < 2) return null;
  const zona = resolveSector(texto);
  if (!zona) return null;
  const distancias = stores
    .map((store) => ({ store, km: distanceKm(zona.lat, zona.lng, store.lat, store.lng) }))
    .sort((a, b) => a.km - b.km);
  return distancias[1].km - distancias[0].km >= 3 ? distancias[0].store : null;
}

