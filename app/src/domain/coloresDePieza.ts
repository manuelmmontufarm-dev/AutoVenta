/**
 * LOS COLORES DE LA PIEZA (Manuel, 25-nov-2026): «un lugar para elegir el color
 * pallet de la base, para que lo puedan cambiar, crear uno nuevo y unos ya set
 * con los nombres apropiados».
 *
 * La plantilla «día y noche» nació con los colores de Depot escritos a mano:
 * el rojo del logo y el dorado de las insignias. Una paleta son esos DOS
 * colores —el principal y el de destacados—; el resto (fondos, textos, grises)
 * es de la plantilla y no se toca, que es lo que la mantiene legible.
 *
 *   original        los de la maqueta aprobada: no se recolorea nada.
 *   <lista>         una de las paletas listas.
 *   propia-<n>      una creada por el negocio (nombre y dos colores).
 *
 * Cómo se aplica: la pieza se arma igual que siempre y, al final, se recorre
 * el árbol cambiando cada rojo y cada dorado de la maqueta por su equivalente
 * (`recolorear`). Con «original» no se recorre nada: sale idéntica, byte a byte.
 *
 * Puro: sin base ni render. Ajustes lo guarda en `pieces_config.colores`.
 */

export type ParDeColores = {
  /** El color de la marca: precio total, recomendada, íconos. Hex #rrggbb. */
  principal: string;
  /** El de las insignias de descuento y la medida. Hex #rrggbb. */
  destacado: string;
};

export type PaletaPropia = ParDeColores & { id: string; nombre: string };

export type ConfigDeColores = {
  id: string;
  propias: PaletaPropia[];
};

export const COLORES_ORIGINAL = "original";
export const COLORES_INICIAL: ConfigDeColores = { id: COLORES_ORIGINAL, propias: [] };
export const PROPIAS_MAXIMO = 12;
export const NOMBRE_MAXIMO = 24;

/** Los de la maqueta: lo que la plantilla trae escrito. */
export const PAR_ORIGINAL: ParDeColores = { principal: "#e52c2a", destacado: "#ffc93c" };

/** Las paletas listas. El orden es el del panel. */
export const COLORES_LISTOS: ReadonlyArray<{ id: string; nombre: string } & ParDeColores> = [
  { id: COLORES_ORIGINAL, nombre: "Rojo y dorado", ...PAR_ORIGINAL },
  { id: "azulRey", nombre: "Azul rey y dorado", principal: "#1d4ed8", destacado: "#ffc93c" },
  { id: "turquesa", nombre: "Turquesa y amarillo", principal: "#0e8f9c", destacado: "#ffd43b" },
  { id: "verdeBosque", nombre: "Verde bosque y dorado", principal: "#1f7a4d", destacado: "#f2c14e" },
  { id: "naranja", nombre: "Naranja y amarillo", principal: "#e8590c", destacado: "#ffd43b" },
  { id: "vino", nombre: "Vino y dorado", principal: "#a3264d", destacado: "#e9c46a" },
  { id: "rosa", nombre: "Rosa y dorado", principal: "#d6336c", destacado: "#ffc93c" },
  { id: "morado", nombre: "Morado y lima", principal: "#6d28d9", destacado: "#c6f432" },
  { id: "acero", nombre: "Gris acero y dorado", principal: "#5b6573", destacado: "#ffc93c" },
];

const HEX = /^#[0-9a-f]{6}$/i;
const ID_PROPIA = /^propia-[a-z0-9]{1,16}$/;

/** Limpia lo que viene del panel: ids válidos, nombres recortados, colores hex o fuera. */
export function coloresLimpios(crudo: unknown): ConfigDeColores {
  const c = (crudo ?? {}) as { id?: unknown; propias?: unknown };
  const vistas = new Set<string>();
  const propias: PaletaPropia[] = [];
  for (const p of Array.isArray(c.propias) ? c.propias : []) {
    const q = (p ?? {}) as Partial<PaletaPropia>;
    const id = String(q.id ?? "");
    const principal = String(q.principal ?? "").trim().toLowerCase();
    const destacado = String(q.destacado ?? "").trim().toLowerCase();
    if (!ID_PROPIA.test(id) || vistas.has(id) || !HEX.test(principal) || !HEX.test(destacado)) continue;
    vistas.add(id);
    const nombre = String(q.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, NOMBRE_MAXIMO) || "Mi paleta";
    propias.push({ id, nombre, principal, destacado });
    if (propias.length >= PROPIAS_MAXIMO) break;
  }
  const id = String(c.id ?? "");
  const existe = COLORES_LISTOS.some((l) => l.id === id) || vistas.has(id);
  return { id: existe ? id : COLORES_ORIGINAL, propias };
}

/** El par que lleva la pieza, o null si son los de la maqueta (no hay nada que cambiar). */
export function parDeColores(config: Partial<ConfigDeColores> | null | undefined): ParDeColores | null {
  const limpio = coloresLimpios(config);
  const elegida = limpio.propias.find((p) => p.id === limpio.id) ?? COLORES_LISTOS.find((l) => l.id === limpio.id);
  if (!elegida) return null;
  if (elegida.principal === PAR_ORIGINAL.principal && elegida.destacado === PAR_ORIGINAL.destacado) return null;
  return { principal: elegida.principal, destacado: elegida.destacado };
}

// ── Cuentas de color ─────────────────────────────────────────────────────────

type Rgb = [number, number, number];
const aRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const aHex = (rgb: Rgb): string => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
/** `peso` del segundo color: 0 = el primero, 1 = el segundo. */
const mezclar = (a: string, b: string, peso: number): string => {
  const x = aRgb(a), y = aRgb(b);
  return aHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * peso) as Rgb);
};
const aclarar = (hex: string, peso: number) => mezclar(hex, "#ffffff", peso);
const oscurecer = (hex: string, peso: number) => mezclar(hex, "#000000", peso);
const tripleta = (hex: string) => aRgb(hex).join(",");

/** Luminancia relativa (WCAG), 0 = negro, 1 = blanco. */
export function luminancia(hex: string): number {
  const [r, g, b] = aRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** El texto que se lee sobre ese color: tinta oscura o blanco. */
const tintaSobre = (hex: string, oscura: string) => (luminancia(hex) > 0.32 ? oscura : "#ffffff");

/**
 * La tabla de cambios: cada rojo y cada dorado que la plantilla trae escrito →
 * su equivalente en la paleta elegida. Las claves van en minúscula; los
 * «r,g,b» son los que la plantilla usa dentro de `rgba(…)`.
 */
export function tablaDeRecolor(par: ParDeColores): Array<[string, string]> {
  const p = par.principal.toLowerCase();
  const d = par.destacado.toLowerCase();
  const dOscuro = oscurecer(d, 0.3);
  return [
    // El principal y sus tonos.
    ["#e52c2a", p],
    ["229,44,42", tripleta(p)],
    ["#ff4b3e", aclarar(p, 0.16)],
    ["#f0413b", aclarar(p, 0.08)],
    ["#ea3a36", aclarar(p, 0.06)],
    ["#d42a27", oscurecer(p, 0.08)],
    ["#c81e24", oscurecer(p, 0.14)],
    ["#b3171e", oscurecer(p, 0.24)],
    ["255,120,110", tripleta(aclarar(p, 0.42))],
    ["150,20,20", tripleta(oscurecer(p, 0.36))],
    ["120,15,15", tripleta(oscurecer(p, 0.48))],
    ["#ffd3d2", aclarar(p, 0.8)],
    ["#fff6f6", aclarar(p, 0.955)],
    // Los fondos casi negros con un punto del principal (modo oscuro).
    ["#1a1012", mezclar("#131316", p, 0.05)],
    ["#181214", mezclar("#131316", p, 0.04)],
    ["#120d0f", mezclar("#0e0e10", p, 0.03)],
    ["#110d0f", mezclar("#0e0e10", p, 0.03)],
    // El destacado y sus tonos.
    ["#ffc93c", d],
    ["255,201,60", tripleta(d)],
    ["#f7e29a", aclarar(d, 0.5)],
    ["#eccd6f", aclarar(d, 0.25)],
    ["#c99a2e", oscurecer(d, 0.18)],
    ["#b98a1e", dOscuro],
    ["#b8830f", dOscuro],
    ["185,138,30", tripleta(dOscuro)],
    // La tinta que va escrita sobre el destacado.
    ["#211a08", tintaSobre(d, "#211a08")],
    ["#16130a", tintaSobre(d, "#16130a")],
    ["#5c430e", tintaSobre(d, "#5c430e")],
    ["#3a2c08", tintaSobre(d, "#3a2c08")],
  ];
}

/** Propiedades que nunca llevan un color: no se tocan (fotos, trazos, textos). */
const INTOCABLES = new Set(["children", "src", "d", "points", "viewBox", "href"]);

function cambiarTexto(valor: string, tabla: Array<[string, string]>): string {
  if (valor.startsWith("data:")) return valor;
  let salida = valor;
  for (const [de, a] of tabla) {
    if (de.startsWith("#")) {
      // Hex sin distinguir mayúsculas; «#e52c2a» no debe partir «#e52c2a1f».
      salida = salida.replace(new RegExp(`${de}(?![0-9a-f])`, "gi"), a);
    } else {
      // «229,44,42» dentro de rgba(), con o sin espacios.
      const [r, g, b] = de.split(",");
      salida = salida.replace(new RegExp(`(?<![0-9])${r}\\s*,\\s*${g}\\s*,\\s*${b}(?![0-9])`, "g"), a);
    }
  }
  return salida;
}

type Nodo = { type?: unknown; props?: Record<string, unknown> } | string | number | null | undefined | boolean;

/**
 * Devuelve la pieza con la paleta aplicada. Solo cambia valores de estilo y de
 * figuras (`fill`, `stroke`, `backgroundColor`…): nunca un texto que se lee, ni
 * una foto, ni el trazo de un ícono. Hace UNA pasada con todos los cambios a
 * la vez: si la paleta nueva usa de principal el dorado viejo, no se pisa.
 */
export function recolorear<T>(nodo: T, par: ParDeColores | null): T {
  if (!par) return nodo;
  const tabla = tablaDeRecolor(par);
  // Una sola pasada: primero a marcas que no existen en ningún color, después a su valor.
  const marcas = tabla.map(([de], i): [string, string] => [de, `\u0001${i}\u0002`]);
  const cambiar = (v: string) => {
    const marcado = cambiarTexto(v, marcas);
    return marcado === v ? v : marcado.replace(/\u0001(\d+)\u0002/g, (_, i) => tabla[Number(i)][1]);
  };
  const andar = (n: Nodo): Nodo => {
    if (Array.isArray(n)) return (n as Nodo[]).map(andar) as unknown as Nodo;
    if (!n || typeof n !== "object" || !n.props) return n;
    const props: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(n.props)) {
      if (clave === "children") props.children = andar(valor as Nodo);
      else if (INTOCABLES.has(clave)) props[clave] = valor;
      else if (typeof valor === "string") props[clave] = cambiar(valor);
      else if (clave === "style" && valor && typeof valor === "object") {
        props.style = Object.fromEntries(
          Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? cambiar(v) : v]),
        );
      } else props[clave] = valor;
    }
    return { ...n, props };
  };
  return andar(nodo as Nodo) as T;
}
