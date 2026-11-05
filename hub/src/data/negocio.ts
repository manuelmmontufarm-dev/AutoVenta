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

/**
 * El respaldo NEUTRO (R-45): mientras `/api/negocio` no conteste, el panel dice
 * «AutoVenta», sin locales ni teléfono de nadie. Antes acá vivían los valores
 * de Depot, y el panel de otro cliente los mostraba hasta que llegara la red.
 */
export const NEGOCIO_RESPALDO: NegocioPublico = {
  id: "autoventa",
  nombre: "AutoVenta",
  ciudad: "",
  telefono: "",
  identidades: [],
  locales: [],
  marcas: [],
  vendedor: { nombre: "" },
  playbook: COMPACT_PLAYBOOK,
  faltantes: [],
};

/** ¿La respuesta trae el contrato entero de `GET /api/negocio` (§3.2)? */
function esNegocioPublico(x: unknown): x is NegocioPublico {
  if (!x || typeof x !== "object") return false;
  const n = x as Record<string, unknown>;
  const texto = (v: unknown) => typeof v === "string";
  return (
    texto(n.id) && texto(n.nombre) && texto(n.ciudad) && texto(n.telefono) &&
    Array.isArray(n.identidades) &&
    Array.isArray(n.locales) &&
    n.locales.every((l) => l && typeof l === "object" &&
      texto((l as Record<string, unknown>).slug) && texto((l as Record<string, unknown>).nombre) &&
      texto((l as Record<string, unknown>).nombreCorto) && texto((l as Record<string, unknown>).claveHorario)) &&
    Array.isArray(n.marcas) && n.marcas.every(texto) &&
    Boolean(n.vendedor) && typeof n.vendedor === "object" && texto((n.vendedor as Record<string, unknown>).nombre) &&
    texto(n.playbook) &&
    Array.isArray(n.faltantes) && n.faltantes.every(texto)
  );
}

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
      const data = (await r.json()) as { negocio?: unknown } & Record<string, unknown>;
      const n = esNegocioPublico(data.negocio) ? data.negocio : esNegocioPublico(data) ? data : null;
      // El contrato se valida entero, no se mezcla con el respaldo: un campo
      // que el servidor omita es un error visible (se queda el respaldo y se
      // reintenta luego), no un valor de otro negocio colado en silencio.
      if (n) {
        publicar(n);
      } else {
        pedido = null;
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
