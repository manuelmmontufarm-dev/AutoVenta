/**
 * Sistema de diseño de las piezas de Depot Tire.
 *
 * Portado del proyecto de Claude Design (`Depot Tire.dc.html` + CotPoster,
 * CompPoster y OpcionesPoster). El original es HTML/CSS; aquí vive como nodos
 * de satori porque el motor no lleva Chromium — cabe en la instancia chica de
 * Railway y renderiza en cientos de milisegundos, no segundos.
 *
 * La paleta y la fuente de precio son parámetros, no constantes: el negocio las
 * cambia desde Ajustes sin tocar código, que es la razón de que el diseño las
 * declarara como props.
 */

import { DEPOT_LOGO_RATIO, depotLogo } from "./assets.js";

export type Child = SatoriNode | string | null | false | undefined;

export interface SatoriNode {
  type: string;
  props: Record<string, unknown> & { children?: unknown };
}

export function el(style: Record<string, unknown>, ...children: Child[]): SatoriNode {
  const kids = children.filter((c): c is SatoriNode | string => Boolean(c));
  return { type: "div", props: { style: { display: "flex", ...style }, children: kids } };
}

export function text(style: Record<string, unknown>, content: string): SatoriNode {
  return { type: "div", props: { style: { display: "flex", ...style }, children: content } };
}

export function img(src: string, style: Record<string, unknown>): SatoriNode {
  return { type: "img", props: { src, style } };
}

// ---------------------------------------------------------------------------
// Paletas — las seis del diseño, más la del sitio de Depot Tire
// ---------------------------------------------------------------------------

export interface Palette {
  dark: string;
  darkSub: string;
  accent: string;
  accentSoft: string;
  gold: string;
  base: string;
  panel: string;
  border: string;
  tenue: string;
  /** Claro sobre fondo oscuro: cifras, totales, texto del encabezado. */
  paper: string;
  /** Cierre de los degradados claros (héroe, tarjetas, sellos). */
  wash: string;
}

const COMUN = {
  base: "#f6f1e4", panel: "#fffdf6", border: "#d9d2bf", tenue: "#5c6273",
  paper: "#fffdf6", wash: "#efe8d6",
};

export const PALETTES: Record<string, Palette> = {
  grafito: { ...COMUN, dark: "#23262b", darkSub: "#8f959d", accent: "#f07818", accentSoft: "#ffe2c8", gold: "#fcbf49" },
  carbon: { ...COMUN, dark: "#191919", darkSub: "#9c9c9c", accent: "#d62828", accentSoft: "#ffd9d9", gold: "#fcbf49" },
  rojo: { ...COMUN, dark: "#8f1d22", darkSub: "#dfb0b2", accent: "#191919", accentSoft: "#cfcfcf", gold: "#fcbf49" },
  verde: { ...COMUN, dark: "#1c3a2d", darkSub: "#93b0a2", accent: "#b3841f", accentSoft: "#f3e3bd", gold: "#e8c15a" },
  espresso: { ...COMUN, base: "#f6efe2", dark: "#2b2018", darkSub: "#ab9a8d", accent: "#c1440e", accentSoft: "#f6d3c0", gold: "#e8c15a" },
  navy: { ...COMUN, dark: "#14213d", darkSub: "#8b93a8", accent: "#d62828", accentSoft: "#ffd9d9", gold: "#fcbf49" },

  /**
   * La paleta de tiredepotec.com. A diferencia de las seis anteriores —que son
   * propuestas de estilo— esta no se eligió: se midió.
   *
   *  · `dark` y `accent` salen del pixel del propio logotipo (#1c1e1b y
   *    #e52c2a), no del tema del sitio. Es el rojo que va a quedar al lado del
   *    logo en la pieza, así que tiene que ser exactamente ese y no el
   *    #ed1c24 del tema ni el #ce2026 de los adornos.
   *  · `gold`, `border`, `tenue` y `darkSub` sí son colores declarados del
   *    sitio (theme 5, 12, 13 y 10).
   *  · El fondo es BLANCO, no el crema de las otras seis: el sitio es blanco,
   *    y `wash` cierra en un gris frío en vez de un beige para que los
   *    degradados no reintroduzcan el color que se quitó.
   */
  depot: {
    base: "#ffffff", panel: "#ffffff", border: "#e3e3e3", tenue: "#605e5e",
    paper: "#ffffff", wash: "#eef0f1",
    dark: "#1c1e1b", darkSub: "#b0b0b0",
    accent: "#e52c2a", accentSoft: "#ffdcdc", gold: "#ffcb05",
  },
};

export const PALETTE_NAMES = Object.keys(PALETTES);
export const DEFAULT_PALETTE = "grafito";

export function resolvePalette(name?: string | null): Palette {
  return PALETTES[name ?? ""] ?? PALETTES[DEFAULT_PALETTE];
}

// ---------------------------------------------------------------------------
// Fuentes de precio — solo para las cifras grandes
// ---------------------------------------------------------------------------

export interface PriceFont {
  fontFamily: string;
  fontStyle: "italic" | "normal";
  fontWeight: number;
}

export const PRICE_FONTS: Record<string, PriceFont> = {
  exo: { fontFamily: "Exo 2", fontStyle: "italic", fontWeight: 700 },
  barlow: { fontFamily: "Barlow", fontStyle: "italic", fontWeight: 700 },
  kanit: { fontFamily: "Kanit", fontStyle: "italic", fontWeight: 700 },
  chakra: { fontFamily: "Chakra Petch", fontStyle: "italic", fontWeight: 700 },
  saira: { fontFamily: "Saira", fontStyle: "italic", fontWeight: 700 },
  rajdhani: { fontFamily: "Rajdhani", fontStyle: "normal", fontWeight: 700 },
  archivo: { fontFamily: "Archivo Black", fontStyle: "normal", fontWeight: 900 },
};

export const PRICE_FONT_NAMES = Object.keys(PRICE_FONTS);
export const DEFAULT_PRICE_FONT = "exo";

export function resolvePriceFont(name?: string | null): PriceFont {
  return PRICE_FONTS[name ?? ""] ?? PRICE_FONTS[DEFAULT_PRICE_FONT];
}

/** Estilo del tema resuelto, que las tres piezas reciben ya listo. */
export interface Theme {
  p: Palette;
  price: PriceFont;
}

export function resolveTheme(paleta?: string | null, fuente?: string | null): Theme {
  return { p: resolvePalette(paleta), price: resolvePriceFont(fuente) };
}

// ---------------------------------------------------------------------------
// Marcas
// ---------------------------------------------------------------------------

/** Acento por marca; el diseño los usa fijos, no dependen de la paleta. */
const BRAND_ACCENT: Record<string, string> = {
  FALKEN: "#1f4e8c",
  KENDA: "#d62828",
  WINRUN: "#2a9d8f",
};

const BRAND_ACCENT_DARK: Record<string, string> = {
  FALKEN: "#132f56",
  KENDA: "#8f1d22",
  WINRUN: "#1c6b61",
};

export const normalizeBrand = (brand: string) => brand.trim().toUpperCase();

export function brandAccent(brand: string, fallback: string): string {
  return BRAND_ACCENT[normalizeBrand(brand)] ?? fallback;
}

export function brandAccentDark(brand: string, fallback: string): string {
  return BRAND_ACCENT_DARK[normalizeBrand(brand)] ?? fallback;
}

const ARCHIVO_BLACK = { fontFamily: "Archivo Black", fontWeight: 900 };

/**
 * Logotipo de marca: las barras inclinadas y el nombre en Archivo Black.
 * `scale` = 1 es el tamaño de la cotización; las otras piezas lo reducen.
 *
 * Una marca desconocida cae al nombre en el color oscuro de la paleta, sin
 * barras: es preferible un logotipo sobrio a inventarle una identidad.
 */
export function brandMark(brand: string, theme: Theme, scale = 1): SatoriNode {
  const s = (n: number) => Math.round(n * scale);
  const name = normalizeBrand(brand);
  const wordmark = (color: string, letterSpacing = 0) =>
    text({ ...ARCHIVO_BLACK, fontStyle: "italic", fontSize: s(58), color, letterSpacing }, name);

  if (name === "FALKEN") {
    return el({ alignItems: "center", gap: s(14) },
      el({ gap: s(5) },
        el({ width: s(18), height: s(50), backgroundColor: "#0b2e5f", transform: "skewX(-22deg)" }),
        el({ width: s(10), height: s(50), backgroundColor: "#0b2e5f", transform: "skewX(-22deg)" }),
      ),
      wordmark("#0b2e5f", s(2)),
    );
  }
  if (name === "KENDA") {
    return el({ alignItems: "center", gap: s(14) },
      el({ gap: s(5) },
        el({ width: s(20), height: s(52), backgroundColor: "#cf1f25", transform: "skewX(-24deg)" }),
        el({ width: s(11), height: s(52), backgroundColor: "#cf1f25", transform: "skewX(-24deg)" }),
      ),
      wordmark("#1a1a1a"),
    );
  }
  if (name === "WINRUN") {
    return el({ alignItems: "center", gap: s(14) },
      el({ gap: s(4), alignItems: "flex-end" },
        el({ width: s(9), height: s(52), backgroundColor: "#f07818", transform: "skewX(-30deg)" }),
        el({ width: s(9), height: s(42), backgroundColor: "#f07818", transform: "skewX(-30deg)" }),
        el({ width: s(9), height: s(33), backgroundColor: "#f07818", transform: "skewX(-30deg)" }),
      ),
      wordmark("#1a1a1a"),
    );
  }
  return el({ alignItems: "center", height: s(52) }, wordmark(theme.p.dark, s(1)));
}

// ---------------------------------------------------------------------------
// Bloques compartidos por las tres piezas
// ---------------------------------------------------------------------------

/** Check verde/dorado del diseño. */
export function check(size: number, fill = "#2a9d8f"): SatoriNode {
  return {
    type: "svg",
    props: {
      width: size, height: size, viewBox: "0 0 22 22",
      children: [
        { type: "circle", props: { cx: 11, cy: 11, r: 10, fill } },
        { type: "path", props: { d: "M6.5 11.5l3 3 6-6.5", stroke: "#fff", strokeWidth: 2.4, fill: "none" } },
      ],
    },
  };
}

/** Franjas blancas inclinadas de fondo, casi transparentes. */
export function speedLines(count: number, opacity: number, right: number, width = 20, gap = 14): SatoriNode {
  return el(
    { position: "absolute", top: 0, right, bottom: 0, gap, opacity },
    ...Array.from({ length: count }, () =>
      el({ width, backgroundColor: "#ffffff", transform: "skewX(-30deg)" })),
  );
}

/** Alto del logotipo en el encabezado de las piezas. El ancho sale del ratio. */
const DEPOT_LOGO_H = 44;

/**
 * Logotipo de Depot Tire del encabezado — el archivo real de la marca.
 *
 * Antes esto dibujaba «DEPOT» + «TIRE» en Archivo Black itálica, que se
 * parecía pero no era: el logo verdadero lleva el volante dentro de la O y la
 * bajada «SOLUCIONES AUTOMOTRICES». Un cliente que compara la cotización con
 * la página nota la diferencia, así que va el archivo, no la imitación.
 *
 * El encabezado es oscuro en las siete paletas, así que siempre es la versión
 * blanca. La leyenda de al lado no es parte del logo: es dato del negocio, y
 * por eso sigue siendo texto.
 */
export function depotWordmark(theme: Theme): SatoriNode {
  const logo = depotLogo("blanco");
  const marca: SatoriNode = logo
    ? img(logo.dataUri, { height: DEPOT_LOGO_H, width: Math.round(DEPOT_LOGO_H * DEPOT_LOGO_RATIO) })
    // Sin el archivo, el nombre en texto antes que un hueco en el encabezado.
    : el({ alignItems: "baseline" },
        text({ ...ARCHIVO_BLACK, fontStyle: "italic", fontSize: 32, color: theme.p.paper, letterSpacing: 1 }, "DEPOT"),
        text({ ...ARCHIVO_BLACK, fontStyle: "italic", fontSize: 32, color: theme.p.gold, letterSpacing: 1 }, "TIRE"),
      );
  return el({ alignItems: "center", gap: 16 },
    marca,
    text({ fontSize: 13, fontWeight: 700, letterSpacing: 3, color: theme.p.darkSub }, "QUITO · DESDE 1996"),
  );
}

/** Barra tricolor bajo el encabezado. `flip` invierte el orden (pie de la cotización). */
export function racingBar(theme: Theme, flip = false): SatoriNode {
  const { accent, gold, dark } = theme.p;
  return flip
    ? el({ height: 10 },
        el({ flex: 5, backgroundColor: gold }),
        el({ width: 130, backgroundColor: accent }),
        el({ flex: 2, backgroundColor: dark }))
    : el({ height: 10 },
        el({ flex: 2, backgroundColor: accent }),
        el({ width: 130, backgroundColor: gold }),
        el({ flex: 5, backgroundColor: dark }));
}

/** Encabezado de comparativa y opciones: logo + rótulo + medida + fecha. */
export function posterHeader(
  theme: Theme,
  rotulo: string,
  medida: string,
  fecha: string,
): SatoriNode {
  const { dark, darkSub, gold } = theme.p;
  return el({
    justifyContent: "space-between", alignItems: "center", padding: "26px 64px", position: "relative",
    backgroundImage: `linear-gradient(135deg,${dark} 0%,${dark} 55%,rgba(0,0,0,0.35) 100%)`,
  },
    speedLines(3, 0.1, 420, 16, 12),
    depotWordmark(theme),
    el({ alignItems: "center", gap: 18 },
      text({ fontSize: 15, fontWeight: 700, letterSpacing: 3, color: darkSub }, rotulo),
      medida
        ? text({
            ...ARCHIVO_BLACK, fontSize: 24, color: gold, border: `2px solid ${gold}`,
            borderRadius: 10, padding: "8px 18px", whiteSpace: "nowrap",
          }, medida)
        : null,
      text({ fontSize: 18, fontWeight: 700, color: theme.p.paper }, fecha),
    ),
  );
}

/** Franja de cierre con condiciones comerciales y sucursales. */
export function posterFooter(theme: Theme, condiciones: string, sucursales: string, padding = "16px 64px"): SatoriNode {
  return el({ justifyContent: "space-between", alignItems: "center", backgroundColor: theme.p.accent, padding },
    text({ fontSize: 14, color: theme.p.accentSoft }, condiciones),
    text({ fontSize: 16, fontWeight: 700, color: theme.p.paper }, sucursales),
  );
}

/** Línea de beneficios que llevan todas las llantas (comparativa y opciones). */
export function benefitsStrip(theme: Theme, texto: string): SatoriNode {
  return el({
    alignItems: "center", gap: 12, padding: "22px 64px",
    backgroundColor: theme.p.panel, borderTop: `1px solid ${theme.p.border}`,
  },
    check(20),
    text({ fontSize: 17, fontWeight: 500 }, texto),
  );
}

// ---------------------------------------------------------------------------
// Disponibilidad
// ---------------------------------------------------------------------------

export type Availability = "available" | "check" | "out";

/**
 * Píldora de disponibilidad de la cotización (fondo sólido).
 *
 * El "✓" va como SVG y no como carácter: satori solo dibuja los glifos de las
 * fuentes registradas, y un ✓ sin fuente sale como cuadrito vacío.
 */
export function availabilityPill(availability: Availability, theme: Theme): SatoriNode {
  const bg = availability === "available" ? "#2a9d8f" : availability === "check" ? theme.p.gold : "#5c6273";
  const fg = availability === "check" ? "#211a08" : "#ffffff";
  return el({ alignItems: "center", gap: 8, backgroundColor: bg, borderRadius: 999, padding: "9px 22px" },
    availability === "available" ? tick(15, "#ffffff") : null,
    text({ color: fg, fontSize: 17, fontWeight: 700 }, availabilityLabel(availability)),
  );
}

/** Píldora suave de la comparativa. */
export function availabilityChip(availability: Availability): SatoriNode {
  const bg = availability === "available" ? "#dcf2e3" : availability === "check" ? "#fff3d6" : "#eceff1";
  const fg = availabilityFg(availability);
  return el({ alignItems: "center", gap: 7, backgroundColor: bg, borderRadius: 999, padding: "7px 16px" },
    availability === "available" ? tick(13, fg) : null,
    text({ color: fg, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }, availabilityLabel(availability)),
  );
}

/** Palomita suelta, sin círculo. */
export function tick(size: number, color: string): SatoriNode {
  return {
    type: "svg",
    props: {
      width: size, height: size, viewBox: "0 0 16 16",
      children: [{ type: "path", props: { d: "M2 8.5l4 4 8-9", stroke: color, strokeWidth: 2.6, fill: "none" } }],
    },
  };
}

/** Punto + texto de las tarjetas de opciones. */
/** `scale` acompaña el tamaño de la tarjeta que lo contiene (ver optionsPoster). */
export function availabilityDot(availability: Availability, scale = 1): SatoriNode {
  const s = (n: number) => Math.round(n * scale);
  const dot = availability === "available" ? "#2a9d8f" : availability === "check" ? "#e0a71c" : "#b0b6bc";
  const corto = availability === "available" ? "Disponible" : availability === "check" ? "Consultar" : "Sin stock";
  return el({ alignItems: "center", gap: s(7), marginTop: 2 },
    el({ width: s(10), height: s(10), borderRadius: "50%", backgroundColor: dot }),
    text({ fontSize: s(14), fontWeight: 700, color: availabilityFg(availability) }, corto),
  );
}

function availabilityFg(availability: Availability): string {
  return availability === "available" ? "#1e7a3c" : availability === "check" ? "#8a6410" : "#5c6273";
}

function availabilityLabel(availability: Availability): string {
  return availability === "available"
    ? "Disponible"
    : availability === "check"
      ? "Consultar disponibilidad"
      : "Sin stock";
}

/**
 * Quita emojis del texto que va a una pieza.
 *
 * satori no trae fuente de emoji, así que cualquiera sale como cuadrito. El
 * negocio escribe "Camiseta de la TRI 🇪🇨" y eso está bien para WhatsApp, donde
 * el emoji sí se ve; en la imagen se cae el emoji y se conserva la frase.
 */
export function stripEmoji(value: string): string {
  return value
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Sello circular dorado de garantía. */
export function warrantySeal(numero: string, unidad: string, rotulo: string): SatoriNode {
  return el({ flexDirection: "column", alignItems: "center", gap: 12, width: 300 },
    el({
      width: 132, height: 132, borderRadius: "50%", alignItems: "center", justifyContent: "center",
      backgroundImage: "linear-gradient(135deg,#eccd6f,#b98a1e)",
    },
      el({
        width: 106, height: 106, borderRadius: "50%", backgroundColor: "#211a08",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
      },
        text({ ...ARCHIVO_BLACK, fontSize: 40, color: "#e8c15a", lineHeight: 1 }, numero),
        text({ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: "#e8c15a" }, unidad),
      ),
    ),
    text({ fontSize: 15, fontWeight: 700, letterSpacing: 3, textAlign: "center" }, rotulo),
  );
}

/** Insignia dorada de ahorro, con el brillo diagonal del diseño. */
export function savingsBadge(pct: string, detalle: string, price: PriceFont): SatoriNode {
  return el({
    position: "relative", flexDirection: "column", alignItems: "flex-end", borderRadius: 14, padding: "16px 24px",
    backgroundImage: "linear-gradient(135deg,#f7e29a 0%,#eccd6f 35%,#c99a2e 70%,#b98a1e 100%)",
    boxShadow: "0 8px 24px rgba(185,138,30,0.45), 0 2px 6px rgba(0,0,0,0.25)",
  },
    el({
      position: "absolute", top: 0, left: 14, width: 44, height: "100%",
      backgroundImage: "linear-gradient(115deg,rgba(255,255,255,0.55),rgba(255,255,255,0))",
      transform: "skewX(-25deg)",
    }),
    text({ ...price, fontSize: 48, color: "#211a08", lineHeight: 1 }, `−${pct}`),
    text({ fontSize: 20, fontWeight: 700, color: "#5c430e" }, detalle),
  );
}

// ---------------------------------------------------------------------------
// Perfiles de marca
// ---------------------------------------------------------------------------

/**
 * Etiqueta y posicionamiento por marca — el argumento comercial que el diseño
 * muestra en la comparativa y en las opciones.
 *
 * Estos son los valores por defecto tomados del diseño. El negocio los edita
 * desde Ajustes (tabla `brand_profiles`); una marca sin perfil sale sin
 * etiqueta ni frase, que es preferible a inventarle un posicionamiento.
 */
export interface BrandProfile {
  tag: string;
  posicionamiento: string;
}

export const DEFAULT_BRAND_PROFILES: Record<string, BrandProfile> = {
  FALKEN: {
    tag: "MÁXIMO DESEMPEÑO",
    posicionamiento:
      "Premium: desempeño, respaldo y durabilidad. Equipo original de Ford Raptor y Jeep Gladiator.",
  },
  KENDA: {
    tag: "MEJOR EQUILIBRIO",
    posicionamiento: "Buena calidad, buen desempeño, buen precio. La compra sensata.",
  },
  WINRUN: {
    tag: "MEJOR PRECIO",
    posicionamiento: "Cuida el presupuesto sin bajar de los mínimos técnicos.",
  },
};

export const BLACK_ITALIC = { ...ARCHIVO_BLACK, fontStyle: "italic" as const };
export { ARCHIVO_BLACK };
