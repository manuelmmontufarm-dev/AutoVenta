/**
 * Tipos de llanta del catálogo de Depot Tire (H/T, A/T, R/T, M/T, turismo…).
 *
 * Base entregada por el cliente el 5-ago-2026: 385 códigos clasificados, 35
 * líneas con su uso y 8 tipos con cuándo ofrecerlos y cuándo no. Resuelve el
 * caso que Joaquín reportó como el más frecuente — «quiero una R17 A/T» — que
 * antes el bot no podía responder porque el catálogo de Contífico no dice el
 * tipo por ningún lado.
 *
 * Se carga del archivo y no de la base: es una tabla de conocimiento del
 * producto, no un dato transaccional. Si el archivo falta, todo degrada a
 * "tipo desconocido" y el bot simplemente no afirma el tipo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");

export interface TipoLlanta {
  clave: string;
  nombre: string;
  definicion: string;
  cuandoOfrecerla: string;
  noOfrecerlaSi: string;
}

export interface LineaLlanta {
  modelo: string;
  linea: string;
  marca: string;
  tipo: string;
  uso: string;
  aros: number[];
}

interface SkuTipo {
  codigo: string;
  marca: string;
  modelo: string;
  tipo: string;
  medida: string;
  aro: number;
  diametroMm: number;
}

interface BaseCruda {
  orden_de_marca?: string[];
  regla_equivalencia?: string;
  tipos?: Record<string, { nombre: string; definicion: string; cuando_ofrecerla: string; no_ofrecerla_si: string }>;
  lineas?: Array<{ modelo: string; linea: string; marca: string; tipo: string; uso: string; aros: number[] }>;
  skus?: Array<{ codigo: string; marca: string; modelo: string; tipo: string; medida: string; aro: number; diametro_mm: number }>;
}

interface BaseTipos {
  ordenDeMarca: string[];
  reglaEquivalencia: string;
  tipos: Map<string, TipoLlanta>;
  lineas: LineaLlanta[];
  porCodigo: Map<string, SkuTipo>;
  porModelo: Map<string, string>;
}

let base: BaseTipos | null = null;

function cargar(): BaseTipos {
  if (base) return base;
  const vacia: BaseTipos = {
    ordenDeMarca: [], reglaEquivalencia: "", tipos: new Map(),
    lineas: [], porCodigo: new Map(), porModelo: new Map(),
  };
  try {
    const cruda = JSON.parse(
      readFileSync(path.join(ASSETS, "base_llantas_tipos.json"), "utf8"),
    ) as BaseCruda;

    const tipos = new Map<string, TipoLlanta>();
    for (const [clave, t] of Object.entries(cruda.tipos ?? {})) {
      tipos.set(normalizarTipo(clave), {
        clave, nombre: t.nombre, definicion: t.definicion,
        cuandoOfrecerla: t.cuando_ofrecerla, noOfrecerlaSi: t.no_ofrecerla_si,
      });
    }

    const porCodigo = new Map<string, SkuTipo>();
    const porModelo = new Map<string, string>();
    for (const s of cruda.skus ?? []) {
      const sku: SkuTipo = {
        codigo: String(s.codigo), marca: s.marca, modelo: s.modelo, tipo: s.tipo,
        medida: s.medida, aro: Number(s.aro), diametroMm: Number(s.diametro_mm),
      };
      porCodigo.set(sku.codigo, sku);
      // Respaldo por modelo: si Contífico cambia un código, el modelo sigue
      // identificando el tipo.
      porModelo.set(normalizarModelo(sku.modelo), sku.tipo);
    }
    for (const l of cruda.lineas ?? []) porModelo.set(normalizarModelo(l.modelo), l.tipo);

    base = {
      ordenDeMarca: cruda.orden_de_marca ?? [],
      reglaEquivalencia: cruda.regla_equivalencia ?? "",
      tipos,
      lineas: (cruda.lineas ?? []).map((l) => ({
        modelo: l.modelo, linea: l.linea, marca: l.marca, tipo: l.tipo,
        uso: l.uso, aros: l.aros ?? [],
      })),
      porCodigo, porModelo,
    };
    return base;
  } catch (error) {
    console.error("⚠️ No se pudo cargar la base de tipos de llanta:", error);
    base = vacia;
    return base;
  }
}

/** "a/t", "AT", "all terrain" → "A/T". Sin coincidencia devuelve "". */
export function normalizarTipo(entrada: string): string {
  const limpio = entrada.trim().toUpperCase().replace(/[\s._-]/g, "");
  const directos: Record<string, string> = {
    HT: "H/T", AT: "A/T", RT: "R/T", MT: "M/T",
    HIGHWAY: "H/T", ALLTERRAIN: "A/T", RUGGEDTERRAIN: "R/T", MUDTERRAIN: "M/T",
    TURISMO: "TURISMO", TURISMOSUV: "TURISMO SUV", TURISMOUHP: "TURISMO UHP",
    UHP: "TURISMO UHP", SUV: "TURISMO SUV", COMERCIAL: "COMERCIAL",
  };
  return directos[limpio] ?? (limpio.includes("/") ? entrada.trim().toUpperCase() : "");
}

const normalizarModelo = (m: string) => m.trim().toUpperCase().replace(/\s+/g, " ");

/** Tipo de un producto del catálogo, por código y con respaldo por modelo. */
export function tipoDeProducto(codigo: string, modelo?: string): string | null {
  const b = cargar();
  const porCodigo = b.porCodigo.get(String(codigo).trim());
  if (porCodigo) return porCodigo.tipo;
  if (modelo) return b.porModelo.get(normalizarModelo(modelo)) ?? null;
  return null;
}

export function infoTipo(tipo: string): TipoLlanta | null {
  return cargar().tipos.get(normalizarTipo(tipo)) ?? null;
}

/** Orden comercial de marcas: primera = premium, última = económica. */
export function ordenDeMarca(): string[] {
  return cargar().ordenDeMarca;
}

/**
 * Escalón comercial de una marca. 0 = más premium.
 * Una marca fuera de la lista va al final, nunca se presenta como premium.
 */
export function escalonDeMarca(marca: string): number {
  const orden = ordenDeMarca();
  const i = orden.findIndex((m) => m.toUpperCase() === marca.trim().toUpperCase());
  return i === -1 ? orden.length : i;
}

export function reglaEquivalencia(): string {
  return cargar().reglaEquivalencia;
}

/** Líneas que existen en un aro y (opcionalmente) de un tipo. */
export function lineasPorAro(aro: number, tipo?: string | null): LineaLlanta[] {
  const b = cargar();
  const t = tipo ? normalizarTipo(tipo) : null;
  return b.lineas.filter(
    (l) => l.aros.includes(aro) && (!t || normalizarTipo(l.tipo) === t),
  );
}

/** Todos los tipos con su explicación, para que el agente elija con criterio. */
export function catalogoDeTipos(): TipoLlanta[] {
  return [...cargar().tipos.values()];
}
