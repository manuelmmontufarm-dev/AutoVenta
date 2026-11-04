/**
 * EL NEGOCIO QUE MUESTRA EL PANEL (R-29).
 *
 * Hasta ahora «Depot Tire», su teléfono y sus dos locales estaban escritos a
 * mano por todo el hub: el panel de otro cliente decía Depot en el título, en
 * el tour y hasta en el nombre del PDF. Ahora todo eso sale de
 * `GET /api/negocio` (lo entrega el Sprint 1), que se pide UNA vez después del
 * login y se comparte con el patrón de `useNivelesAviso`: un estado a nivel de
 * módulo con oyentes, para que cualquier componente lo lea síncrono y se
 * repinte cuando llega.
 *
 * Mientras el endpoint no exista (404: el Sprint 1 todavía no mergeó) o no
 * conteste, se usa EL RESPALDO con los valores de Depot que hoy están clavados
 * en el panel — así este sprint puede salir solo y Depot no cambia ni un
 * píxel. El Sprint Final cambia ese respaldo a uno neutro («AutoVenta»). Para
 * los locales del respaldo se intenta `/api/store-hours`, que ya existe: sus
 * claves son los `claveHorario` reales del negocio.
 */
import { useEffect, useState } from "react";
import { COMPACT_PLAYBOOK } from "../../../app/src/agent/compactPlaybook";
import { authHeaders } from "./realSource";

export interface IdentidadDelNegocio {
  id: string;
  nombre: string;
  locales: string[];
}

export interface LocalDelNegocio {
  slug: string;
  nombre: string;
  nombreCorto: string;
  claveHorario: string;
}

export interface NegocioPublico {
  id: string;
  nombre: string;
  ciudad: string;
  telefono: string;
  identidades: IdentidadDelNegocio[];
  locales: LocalDelNegocio[];
  marcas: string[];
  vendedor: { nombre: string };
  playbook: string;
  faltantes: string[];
}

/** Los valores de Depot que hoy están clavados en el panel. El SF los vuelve neutros. */
export const NEGOCIO_RESPALDO: NegocioPublico = {
  id: "depot",
  nombre: "Depot Tire",
  ciudad: "Quito",
  telefono: "+593 98 280 1766",
  identidades: [{ id: "depot", nombre: "Depot Tire", locales: ["cumbaya", "quito_sur"] }],
  locales: [
    { slug: "cumbaya", nombre: "Depot Tire Cumbayá", nombreCorto: "Cumbayá", claveHorario: "cumbaya" },
    { slug: "quito_sur", nombre: "Depot Tire Quito Sur", nombreCorto: "Quito Sur", claveHorario: "quitoSur" },
  ],
  marcas: ["Kenda", "Sunoco", "Eurolub", "Falken"],
  vendedor: { nombre: "Martín" },
  playbook: COMPACT_PLAYBOOK,
  faltantes: [],
};

let actual: NegocioPublico = NEGOCIO_RESPALDO;
let pedido: Promise<void> | null = null;
const oyentes = new Set<() => void>();

function publicar(n: NegocioPublico) {
  actual = n;
  oyentes.forEach((f) => f());
}

/** Lectura síncrona: el respaldo hasta que `/api/negocio` conteste. */
export function negocioActual(): NegocioPublico {
  return actual;
}

/**
 * Con 404 (el S1 todavía no está), los locales del respaldo salen de las claves
 * de `/api/store-hours`, que son los `claveHorario` reales — así la tarjeta de
 * horarios lista los locales de verdad aunque `/api/negocio` no exista.
 */
async function respaldoConLocalesDeHorarios(): Promise<NegocioPublico> {
  try {
    const r = await fetch("/api/store-hours", { headers: authHeaders() });
    if (!r.ok) return NEGOCIO_RESPALDO;
    const data = (await r.json()) as { hours?: Record<string, unknown> };
    const claves = Object.keys(data.hours ?? {});
    if (!claves.length) return NEGOCIO_RESPALDO;
    const conocidos = new Map(NEGOCIO_RESPALDO.locales.map((l) => [l.claveHorario, l]));
    return {
      ...NEGOCIO_RESPALDO,
      locales: claves.map((clave) => conocidos.get(clave) ?? ({
        slug: clave, nombre: clave, nombreCorto: clave, claveHorario: clave,
      })),
    };
  } catch {
    return NEGOCIO_RESPALDO;
  }
}

/** Lo pide una vez; las llamadas siguientes comparten el mismo pedido. */
export function cargarNegocio(): Promise<void> {
  if (pedido) return pedido;
  pedido = (async () => {
    try {
      const r = await fetch("/api/negocio", { headers: authHeaders() });
      if (r.status === 404) {
        publicar(await respaldoConLocalesDeHorarios());
        return;
      }
      if (!r.ok) {
        // Sin credencial todavía (401 antes del login): se queda el respaldo y
        // se olvida el pedido, para que el próximo intento —el de después del
        // login— vuelva a preguntar en vez de quedarse con Depot para siempre.
        pedido = null;
        return;
      }
      const data = (await r.json()) as { negocio?: NegocioPublico } & Partial<NegocioPublico>;
      const n = data.negocio ?? (data as NegocioPublico);
      if (n && typeof n.nombre === "string" && Array.isArray(n.locales)) {
        publicar({ ...NEGOCIO_RESPALDO, ...n });
      }
    } catch {
      // Sin red o en el demo: el respaldo ya está puesto; se reintenta luego.
      pedido = null;
    }
  })();
  return pedido;
}

/** Solo para después del login: vuelve a pedirlo con la credencial nueva. */
export function recargarNegocio(): Promise<void> {
  pedido = null;
  return cargarNegocio();
}

/** El negocio desde un componente; dispara la carga la primera vez. */
export function useNegocio(): NegocioPublico {
  const [, repintar] = useState(0);
  useEffect(() => {
    const oyente = () => repintar((x) => x + 1);
    oyentes.add(oyente);
    void cargarNegocio();
    return () => { oyentes.delete(oyente); };
  }, []);
  return actual;
}

/**
 * Las iniciales del negocio («Depot Tire» → «DT»), para el favicon y los
 * placeholders del cupón. Misma regla que `inicialesDelNegocio` del bot.
 */
export function inicialesDelNegocio(n: NegocioPublico = actual): string {
  const palabras = n.nombre.split(/\s+/).filter(Boolean);
  const iniciales = palabras.map((p) => p.normalize("NFD").replace(/[̀-ͯ]/g, "")[0]).join("");
  return (iniciales.length >= 2 ? iniciales : (palabras[0] ?? "X").slice(0, 2)).toUpperCase();
}

/** Nombre sin espacios para archivos: «Depot Tire» → «DepotTire». */
export function nombreParaArchivo(n: NegocioPublico = actual): string {
  return n.nombre.replace(/\s+/g, "") || "AutoVenta";
}
