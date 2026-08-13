/**
 * La escalera de precio en 3 niveles: PREMIUM / INTERMEDIA / ECONÓMICA.
 *
 * Base entregada por el negocio el 13-ago-2026 (escalera-precio.json). Afina el
 * escalón por MARCA que ya existía (tireTypes.escalonDeMarca) con el dato que
 * le faltaba: dentro de Kenda conviven líneas intermedias (KR628, KR601…) y de
 * entrada (KR203, KR29…), y presentarlas todas como «equilibrio» rompía la
 * escalera — dos opciones del mismo nivel y ninguna económica de verdad.
 *
 * El bloque `medidas` del archivo original (stocks curados del 5-ago) se
 * descartó a propósito: el stock vivo es el de Contífico.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");

export type Nivel = "PREMIUM" | "INTERMEDIA" | "ECONOMICA";

interface Cruda {
  escalera_de_precio?: Record<string, { marcas?: string[]; argumento?: string }>;
  reglas?: string[];
  formato_de_respuesta?: { estructura?: string; ejemplo?: string; cierre?: string };
}

interface Base {
  /** "KENDA KR628" → INTERMEDIA; "WINRUN" → ECONOMICA (marca entera). */
  porLinea: Map<string, Nivel>;
  porMarca: Map<string, Nivel>;
  argumento: Map<Nivel, string>;
  reglas: string[];
}

let base: Base | null = null;

const NIVELES: Record<string, Nivel> = {
  "1_PREMIUM": "PREMIUM",
  "2_INTERMEDIA": "INTERMEDIA",
  "3_ECONOMICA": "ECONOMICA",
};

function cargar(): Base {
  if (base) return base;
  const vacia: Base = { porLinea: new Map(), porMarca: new Map(), argumento: new Map(), reglas: [] };
  try {
    const cruda = JSON.parse(
      readFileSync(path.join(ASSETS, "escalera-precio.json"), "utf8"),
    ) as Cruda;
    const b: Base = { ...vacia };
    for (const [clave, nivelDef] of Object.entries(cruda.escalera_de_precio ?? {})) {
      const nivel = NIVELES[clave];
      if (!nivel) continue;
      if (nivelDef.argumento) b.argumento.set(nivel, nivelDef.argumento);
      for (const entrada of nivelDef.marcas ?? []) {
        // Dos formatos: «FALKEN» (marca entera) o
        // «KENDA lineas actuales: KR628, KR601, …» (líneas concretas).
        const [cabeza, lineas] = entrada.split(":");
        const marca = cabeza.trim().split(/\s/)[0].toUpperCase();
        if (lineas) {
          for (const linea of lineas.split(",")) {
            const l = linea.trim().toUpperCase();
            if (l) b.porLinea.set(`${marca} ${l}`, nivel);
          }
        } else if (!marca.includes("GITI")) {
          // GITI queda fuera hasta tener condiciones (regla 8 del respaldo).
          b.porMarca.set(marca, nivel);
        }
      }
    }
    b.reglas = cruda.reglas ?? [];
    base = b;
    return base;
  } catch (error) {
    console.error("⚠️ No se pudo cargar la escalera de precio:", error);
    base = vacia;
    return base;
  }
}

const norm = (v: string) => v.trim().toUpperCase().replace(/\s+/g, " ");

/**
 * Nivel comercial de una llanta concreta. La línea manda sobre la marca:
 * una Kenda KR203 es ECONÓMICA aunque la marca sea «intermedia».
 * Null = marca fuera de la escalera (no presentarla como nivel de nada).
 */
export function nivelDeLinea(marca: string, modeloOLinea: string): Nivel | null {
  const b = cargar();
  const m = norm(marca).split(/\s/)[0];
  const texto = norm(modeloOLinea);
  for (const [clave, nivel] of b.porLinea) {
    const [claveMarca, ...resto] = clave.split(" ");
    const modelo = resto.join(" ");
    // Coincidencia por token completo, no por prefijo: «KR203» contiene
    // «KR20» y con includes() la línea de entrada salía como intermedia.
    const patron = new RegExp(`(?:^|[^A-Z0-9])${modelo.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?:$|[^0-9])`);
    if (claveMarca === m && patron.test(texto)) return nivel;
  }
  return b.porMarca.get(m) ?? null;
}

/** Orden de presentación: SIEMPRE de más cara a más económica (regla 3). */
const ORDEN: Record<Nivel, number> = { PREMIUM: 0, INTERMEDIA: 1, ECONOMICA: 2 };

export function ordenDeNivel(nivel: Nivel | null): number {
  return nivel ? ORDEN[nivel] : ORDEN.ECONOMICA + 1;
}

export function argumentoDeNivel(nivel: Nivel | null): string | null {
  return nivel ? cargar().argumento.get(nivel) ?? null : null;
}

export function reglasEscalera(): string[] {
  return cargar().reglas;
}
