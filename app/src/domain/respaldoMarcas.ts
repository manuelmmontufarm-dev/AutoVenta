/**
 * Origen, garantía, seguro y rendimiento por marca — el RESPALDO que justifica
 * la diferencia de precio entre niveles.
 *
 * Base entregada por el negocio el 13-ago-2026 (conocimiento-marcas.json).
 * Es la respuesta a las preguntas que más enfrían una venta cuando se
 * contestan a medias: «¿cuánto dura?», «¿de dónde es?», «¿por qué la Falken
 * cuesta más?». Se carga del archivo, como base_llantas_tipos: conocimiento
 * del producto, no dato transaccional. Si el archivo falta, el módulo degrada
 * a null y el bot simplemente no afirma lo que no puede respaldar.
 */
import { readFileSync } from "node:fs";
import { rutaDeAsset } from "../negocio/assets.js";

export interface RespaldoMarca {
  marca: string;
  nivel: string;
  origen: { pais: string; fraseDeVenta?: string };
  garantiaFabricaAnios: number;
  /** Meses de seguro contra daños. Null = sin condiciones definidas (GITI). */
  seguroMeses: number | null;
  seguroFrase: string | null;
  /** Km promedio aproximado. SIEMPRE se comunica como aproximado. */
  kmPromedio: number | null;
  nota?: string;
}

interface Cruda {
  marcas?: Record<string, {
    nivel?: string;
    origen?: { pais?: string; frase_de_venta?: string };
    garantia_fabrica?: { anios?: number };
    seguro?: { meses?: number | null; frase_de_venta?: string };
    rendimiento?: { km_promedio?: number | null };
    nota?: string;
  }>;
  servicios_incluidos?: Record<string, { texto?: string; frase_de_venta?: string; cada_km?: number }>;
  comparativo_rapido?: unknown;
  argumento_para_subir_de_nivel?: string[];
  reglas_de_uso?: string[];
  ejemplos_de_respuesta?: Record<string, string>;
}

interface Base {
  marcas: Map<string, RespaldoMarca>;
  servicios: string[];
  /** ¿El cliente incluye mantenimiento gratuito? (Depot sí.) */
  mantenimientoGratuito: boolean;
  /** Cada cuántos km va la rotación incluida, o null si no la incluye. */
  rotacionCadaKm: number | null;
  argumentos: string[];
  reglas: string[];
  ejemplos: Record<string, string>;
}

let base: Base | null = null;

function cargar(): Base {
  if (base) return base;
  const vacia: Base = {
    marcas: new Map(), servicios: [], mantenimientoGratuito: false, rotacionCadaKm: null,
    argumentos: [], reglas: [], ejemplos: {},
  };
  try {
    const cruda = JSON.parse(
      // El conocimiento es del cliente: `assets/<negocio>/conocimiento-marcas.json` (o el común).
      readFileSync(rutaDeAsset("conocimiento-marcas.json"), "utf8"),
    ) as Cruda;
    const marcas = new Map<string, RespaldoMarca>();
    for (const [nombre, m] of Object.entries(cruda.marcas ?? {})) {
      marcas.set(nombre.toUpperCase(), {
        marca: nombre.toUpperCase(),
        nivel: m.nivel ?? "",
        origen: { pais: m.origen?.pais ?? "POR CONFIRMAR", fraseDeVenta: m.origen?.frase_de_venta },
        garantiaFabricaAnios: m.garantia_fabrica?.anios ?? 5,
        seguroMeses: m.seguro?.meses ?? null,
        seguroFrase: m.seguro?.frase_de_venta ?? null,
        kmPromedio: m.rendimiento?.km_promedio ?? null,
        nota: m.nota,
      });
    }
    base = {
      marcas,
      servicios: Object.values(cruda.servicios_incluidos ?? {})
        .map((s) => s.frase_de_venta ?? s.texto ?? "")
        .filter(Boolean),
      mantenimientoGratuito: Boolean(cruda.servicios_incluidos?.mantenimiento_gratuito),
      rotacionCadaKm: cruda.servicios_incluidos?.rotacion?.cada_km ?? null,
      argumentos: cruda.argumento_para_subir_de_nivel ?? [],
      reglas: cruda.reglas_de_uso ?? [],
      ejemplos: cruda.ejemplos_de_respuesta ?? {},
    };
    return base;
  } catch (error) {
    console.error("⚠️ No se pudo cargar el conocimiento de marcas:", error);
    base = vacia;
    return base;
  }
}

export function respaldoDeMarca(marca: string): RespaldoMarca | null {
  return cargar().marcas.get(marca.trim().toUpperCase()) ?? null;
}

/**
 * Lo que las reglas de `respaldo_marcas` necesitan saber del cliente, para no
 * decir «la rotación cada 10.000 km» ni «GITI» si no son suyos.
 */
export function condicionesDelRespaldo(): {
  mantenimientoGratuito: boolean;
  rotacionCadaKm: number | null;
} {
  const b = cargar();
  return { mantenimientoGratuito: b.mantenimientoGratuito, rotacionCadaKm: b.rotacionCadaKm };
}

/** El paquete completo para el agente: marcas, reglas y argumentos de venta. */
export function respaldoCompleto(): {
  marcas: RespaldoMarca[];
  serviciosIncluidos: string[];
  argumentosParaSubirDeNivel: string[];
  reglas: string[];
  ejemplos: Record<string, string>;
} {
  const b = cargar();
  return {
    marcas: [...b.marcas.values()],
    serviciosIncluidos: b.servicios,
    argumentosParaSubirDeNivel: b.argumentos,
    reglas: b.reglas,
    ejemplos: b.ejemplos,
  };
}

/**
 * Costo por kilómetro — el argumento más fuerte para subir de nivel, hecho
 * número: precio real de la cotización ÷ km promedio de la marca. Devuelve
 * null si la marca no tiene rendimiento definido (GITI): mejor callar que
 * inventar una cifra.
 */
export function costoPorKm(marca: string, precioConIva: number): string | null {
  const r = respaldoDeMarca(marca);
  if (!r?.kmPromedio || precioConIva <= 0) return null;
  const centavos = (precioConIva / r.kmPromedio) * 100;
  return `$${centavos.toFixed(2)} por cada 100 km aprox.`;
}
