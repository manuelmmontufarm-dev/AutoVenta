/**
 * Las tres piezas de Depot Tire, portadas del proyecto de Claude Design.
 *
 * - `quotePoster`      ← CotPoster
 * - `comparePoster`    ← CompPoster
 * - `optionsPoster`    ← OpcionesPoster
 *
 * Todas devuelven solo el nodo: el alto lo mide satori. En el original es fijo
 * porque su contenido es de ejemplo; aquí depende de cuántas marcas, si hay
 * precio de lista, si hay descuento y cuántos beneficios trae el negocio.
 */
import {
  ARCHIVO_BLACK, BLACK_ITALIC, type Availability, type Child, type SatoriNode, type Theme,
  availabilityChip, availabilityDot, availabilityPill, benefitsStrip, brandAccent, brandAccentDark,
  brandMark, check, depotWordmark, el, img, posterFooter, posterHeader, racingBar, savingsBadge, speedLines,
  stripEmoji, text,
} from "./depotDesign.js";

const money = (n: number) => `$${n.toFixed(2)}`;

const CONDICIONES = "Precios incluyen IVA y Ecovalor · por unidad · 3 y 6 meses sin intereses";
const SUCURSALES = "Cumbayá · Quito Sur · 30 años";
const TODAS_INCLUYEN =
  "Todas incluyen: instalación completa · seguro contra golpes y cortes · mantenimiento cada 10.000 km · revisión del vehículo";

/** Lo que cada pieza necesita saber de una llanta. */
export interface PosterLine {
  brand: string;
  design: string;
  sizeLabel: string;
  loadSpeedLabel: string | null;
  loadSpeedTranslation: string | null;
  quantity: number;
  unitConIva: number;
  pvpConIva: number | null;
  availability: Availability;
  golpesMeses: number | null;
  fabricaAnios: number;
  photoUri: string;
  /** Frase de posicionamiento de la marca (comparativa y opciones). */
  posicionamiento?: string | null;
  /** Etiqueta corta, ej. "MEJOR EQUILIBRIO". */
  tag?: string | null;
}

const savingsPct = (line: PosterLine): string | null => {
  if (!line.pvpConIva || line.pvpConIva <= line.unitConIva) return null;
  return `${Math.round((1 - line.unitConIva / line.pvpConIva) * 100)}%`;
};

const golpesLabel = (line: PosterLine) =>
  line.golpesMeses ? `${line.golpesMeses} meses` : null;

// ===========================================================================
// COTIZACIÓN
// ===========================================================================

export interface QuotePosterData {
  number: string;
  dateLabel: string;
  line: PosterLine;
  subtotal: number;
  iva: number;
  total: number;
  discountAmount?: number | null;
  discountCondition?: string | null;
  expiresLabel?: string | null;
  /** Beneficios vigentes, desde la tabla `benefits`. Vacío = no se dibuja la franja. */
  benefits?: readonly string[];
}

export function quotePoster(data: QuotePosterData, theme: Theme): SatoriNode {
  const { p, price } = theme;
  const line = data.line;
  const pct = savingsPct(line);
  const hasDesc = Boolean(data.discountAmount && data.discountAmount > 0);
  const benefits = data.benefits ?? [];
  const golpes = golpesLabel(line);

  const bloques: Child[] = [
    // Encabezado
    el({ justifyContent: "space-between", alignItems: "center", backgroundColor: p.dark, padding: "26px 64px" },
      // El mismo logotipo que las otras tres piezas: la cotización tenía su
      // propio encabezado copiado a mano y se le quedaba atrás cada vez que la
      // marca cambiaba algo.
      depotWordmark(theme),
      el({ alignItems: "center", gap: 18 },
        text({ border: `2px solid ${p.gold}`, color: p.gold, borderRadius: 10, padding: "8px 18px",
          fontSize: 19, fontWeight: 700, letterSpacing: 1, whiteSpace: "nowrap" }, data.number),
        text({ fontSize: 18, fontWeight: 700, color: p.paper }, data.dateLabel),
      ),
    ),
    racingBar(theme),

    // Héroe: foto + identidad del producto
    el({ alignItems: "center", gap: 56, padding: "56px 64px 40px", position: "relative",
      backgroundImage: `linear-gradient(150deg,#ffffff 0%,${p.base} 45%,${p.wash} 100%)` },
      el({ position: "absolute", top: 36, right: 64, gap: 6 },
        el({ width: 34, height: 8, backgroundColor: p.accent, transform: "skewX(-30deg)" }),
        el({ width: 18, height: 8, backgroundColor: p.gold, transform: "skewX(-30deg)" }),
        el({ width: 8, height: 8, backgroundColor: p.dark, transform: "skewX(-30deg)" }),
      ),
      el({ flexDirection: "column", alignItems: "center", width: 600, position: "relative" },
        el({ position: "relative", width: 560, height: 540, alignItems: "center", justifyContent: "center" },
          el({ position: "absolute", bottom: 14, left: 70, width: 430, height: 44,
            borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.24)" }),
          img(line.photoUri, { width: 548, height: 508, transform: "rotate(-2deg)", objectFit: "contain" }),
          el({ position: "absolute", top: 34, left: 96, width: 280, height: 74, borderRadius: "50%",
            backgroundImage: "linear-gradient(115deg,rgba(255,255,255,0.85) 0%,rgba(255,255,255,0.25) 55%,rgba(255,255,255,0) 100%)",
            transform: "rotate(-16deg)" }),
        ),
      ),
      el({ flexDirection: "column", gap: 16, flex: 1 },
        brandMark(line.brand, theme),
        text({ ...BLACK_ITALIC, fontSize: 96, lineHeight: 0.98, letterSpacing: -2, color: p.dark }, line.design),
        el({ alignItems: "center", gap: 14, marginTop: 8 },
          text({ ...ARCHIVO_BLACK, backgroundColor: p.accent, color: p.paper, borderRadius: 12,
            padding: "10px 24px", fontSize: 38 }, line.sizeLabel),
          line.loadSpeedLabel
            ? text({ ...ARCHIVO_BLACK, border: `3px solid ${p.dark}`, borderRadius: 12,
                padding: "10px 20px", fontSize: 30, color: p.dark }, line.loadSpeedLabel)
            : null,
        ),
        line.loadSpeedTranslation
          ? text({ fontSize: 21, color: p.tenue }, line.loadSpeedTranslation)
          : null,
        el({ alignItems: "center", gap: 16, marginTop: 6 },
          availabilityPill(line.availability, theme),
          text({ fontSize: 17, fontWeight: 700, color: p.tenue }, `${line.quantity} unidades cotizadas`),
        ),
      ),
    ),

    // Precio
    el({ justifyContent: "space-between", alignItems: "center", padding: "44px 64px", position: "relative",
      backgroundImage: `linear-gradient(135deg,${p.dark} 0%,${p.dark} 55%,rgba(0,0,0,0.35) 100%)` },
      speedLines(4, 0.1, 180),
      el({ flexDirection: "column", gap: 2 },
        text({ fontSize: 17, fontWeight: 700, letterSpacing: 4, color: p.gold }, "PRECIO HOY · POR LLANTA"),
        text({ ...price, fontSize: 168, lineHeight: 1.12, letterSpacing: -4, color: p.paper }, money(line.unitConIva)),
        text({ fontSize: 19, color: p.darkSub }, "IVA y Ecovalor incluidos"),
      ),
      pct && line.pvpConIva
        ? el({ flexDirection: "column", alignItems: "flex-end", gap: 14 },
            el({ flexDirection: "column", alignItems: "flex-end", gap: 2 },
              text({ fontSize: 14, fontWeight: 700, letterSpacing: 3, color: p.darkSub }, "ANTES"),
              text({ fontSize: 46, color: p.darkSub, textDecoration: "line-through" }, money(line.pvpConIva)),
            ),
            savingsBadge(pct, `ahorras ${money(line.pvpConIva - line.unitConIva)} c/u`, price),
          )
        : null,
    ),
    racingBar(theme, true),

    // Sellos de garantía
    el({ justifyContent: "space-between", alignItems: "center", padding: "40px 64px",
      backgroundImage: `linear-gradient(180deg,#ffffff 0%,${p.panel} 55%,${p.wash} 100%)` },
      golpes
        ? seal(String(line.golpesMeses), "MESES", "GARANTÍA CONTRA GOLPES")
        : seal(String(line.fabricaAnios), "AÑOS", "GARANTÍA DE FÁBRICA"),
      divider(p.border),
      seal(String(line.fabricaAnios), "AÑOS", "GARANTÍA DE FÁBRICA"),
      divider(p.border),
      seal("30", "AÑOS", "DEPOT TIRE EN QUITO"),
    ),
  ];

  // Beneficios: vienen de la tabla, no del diseño. Sin beneficios cargados no
  // se dibuja la franja — el bot no promete lo que el negocio no configuró.
  if (benefits.length) {
    bloques.push(
      el({ flexDirection: "column", gap: 16, padding: "36px 64px", borderTop: `1px solid ${p.border}`,
        backgroundImage: `linear-gradient(180deg,${p.base} 0%,${p.wash} 100%)` },
        text({ fontSize: 15, fontWeight: 700, letterSpacing: 3, color: p.tenue }, "INCLUIDO CON TU COMPRA"),
        el({ flexWrap: "wrap", gap: 12 },
          ...benefits.map((b) =>
            el({ alignItems: "center", gap: 10, backgroundColor: p.panel,
              border: `1px solid ${p.border}`, borderRadius: 999, padding: "12px 24px" },
              check(20),
              text({ fontSize: 19, fontWeight: 500, color: p.dark }, stripEmoji(b)))),
        ),
      ),
    );
  }

  if (hasDesc) {
    bloques.push(
      el({ alignItems: "center", justifyContent: "space-between", padding: "24px 64px", position: "relative",
        backgroundImage: "linear-gradient(135deg,#f7e29a 0%,#eccd6f 30%,#d4a83c 65%,#b98a1e 100%)" },
        el({ position: "absolute", top: 0, left: 200, width: 90, height: "100%",
          backgroundImage: "linear-gradient(115deg,rgba(255,255,255,0.5),rgba(255,255,255,0))",
          transform: "skewX(-25deg)" }),
        el({ alignItems: "center", gap: 20 },
          text({ ...price, fontSize: 46, whiteSpace: "nowrap", color: "#211a08" }, `−${money(data.discountAmount ?? 0)}`),
          text({ fontSize: 21, fontWeight: 700, color: "#3a2c08" },
            `adicionales ${data.discountCondition ?? ""}`.trim()),
        ),
        text({ fontSize: 18, fontWeight: 700, color: "#5c430e" },
          `${data.expiresLabel ? `Válida hasta el ${data.expiresLabel} · ` : ""}presenta ${data.number}`),
      ),
    );
  }

  // Totales
  bloques.push(
    el({ justifyContent: "space-between", alignItems: "center", padding: "38px 64px", position: "relative",
      borderTop: `1px solid ${p.border}`,
      backgroundImage: `linear-gradient(135deg,${p.dark} 0%,${p.dark} 55%,rgba(0,0,0,0.35) 100%)` },
      speedLines(3, 0.08, 520),
      el({ gap: 52 },
        totalCell(theme, "CANTIDAD", `${line.quantity} llantas`),
        totalCell(theme, "SUBTOTAL", money(data.subtotal)),
        totalCell(theme, "IVA 15%", money(data.iva)),
      ),
      el({ alignItems: "baseline", gap: 16 },
        text({ fontSize: 16, fontWeight: 700, letterSpacing: 3, color: p.gold }, "TOTAL"),
        text({ ...price, fontSize: 80, letterSpacing: -2, color: p.paper }, money(data.total)),
      ),
    ),
    posterFooter(theme,
      "Precios incluyen IVA y Ecovalor · por unidad · Efectivo, tarjeta, transferencia · 3 y 6 meses sin intereses",
      "Cumbayá · Quito Sur", "18px 64px"),
  );

  return el({ flexDirection: "column", width: "100%", backgroundColor: p.base,
    fontFamily: "Archivo", color: p.dark }, ...bloques);

  function seal(numero: string, unidad: string, rotulo: string) {
    return warrantySealLocal(numero, unidad, rotulo);
  }
}

function warrantySealLocal(numero: string, unidad: string, rotulo: string): SatoriNode {
  return el({ flexDirection: "column", alignItems: "center", gap: 12, width: 300 },
    el({ width: 132, height: 132, borderRadius: "50%", alignItems: "center", justifyContent: "center",
      backgroundImage: "linear-gradient(135deg,#eccd6f,#b98a1e)" },
      el({ width: 106, height: 106, borderRadius: "50%", backgroundColor: "#211a08",
        flexDirection: "column", alignItems: "center", justifyContent: "center" },
        text({ ...ARCHIVO_BLACK, fontSize: 40, color: "#e8c15a", lineHeight: 1 }, numero),
        text({ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: "#e8c15a" }, unidad),
      ),
    ),
    text({ fontSize: 15, fontWeight: 700, letterSpacing: 3, textAlign: "center" }, rotulo),
  );
}

const divider = (color: string) => el({ width: 1, height: 140, backgroundColor: color });

function totalCell(theme: Theme, rotulo: string, valor: string): SatoriNode {
  return el({ flexDirection: "column", gap: 2 },
    text({ fontSize: 13, letterSpacing: 2, color: theme.p.darkSub }, rotulo),
    text({ fontSize: 26, fontWeight: 700, color: theme.p.paper }, valor),
  );
}

// ===========================================================================
// COMPARATIVA
// ===========================================================================

export interface ComparePosterData {
  dateLabel: string;
  sizeLabel?: string | null;
  lines: readonly PosterLine[];
}

export function comparePoster(data: ComparePosterData, theme: Theme): SatoriNode {
  const { p, price } = theme;
  const lines = data.lines.slice(0, 3);

  const columna = (line: PosterLine, index: number): SatoriNode => {
    const pct = savingsPct(line);
    const golpes = golpesLabel(line);
    const acento = brandAccent(line.brand, p.accent);
    // La clave se omite en la primera columna: satori revienta si un shorthand
    // llega con valor undefined, no lo trata como "sin borde".
    return el({ flexDirection: "column", gap: 16, flex: 1, padding: "0 32px",
      ...(index === 0 ? {} : { borderLeft: `1px solid ${p.border}` }) },
      line.tag
        ? el({},
            text({ backgroundImage: `linear-gradient(120deg,${acento},${brandAccentDark(line.brand, p.dark)})`,
              color: p.paper, borderRadius: 999, padding: "7px 18px", fontSize: 14, fontWeight: 700,
              letterSpacing: 2, whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(0,0,0,0.18)" }, line.tag))
        : el({ height: 32 }),
      el({ alignItems: "center", height: 44 }, brandMark(line.brand, theme, 0.66)),
      el({ alignItems: "center", justifyContent: "center", height: 270, position: "relative" },
        el({ position: "absolute", top: 10, left: 20, right: 20, bottom: 10, borderRadius: 20,
          backgroundImage: `linear-gradient(165deg,#ffffff 0%,${p.panel} 50%,${p.wash} 100%)`,
          border: `1px solid ${p.border}`,
          boxShadow: "0 14px 32px rgba(20,20,20,0.12), 0 3px 8px rgba(20,20,20,0.06)" }),
        el({ position: "absolute", bottom: 26, left: 70, width: 200, height: 22,
          borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.22)" }),
        img(line.photoUri, { width: 240, height: 223, transform: "rotate(-2deg)", objectFit: "contain" }),
        el({ position: "absolute", top: 38, left: 92, width: 88, height: 32, borderRadius: "50%",
          backgroundImage: "linear-gradient(120deg,rgba(255,255,255,0.7),rgba(255,255,255,0))",
          transform: "rotate(-18deg)" }),
      ),
      el({ flexDirection: "column", gap: 4 },
        text({ ...BLACK_ITALIC, fontSize: 44, letterSpacing: -1, color: p.dark }, line.design),
        text({ fontSize: 16, color: p.tenue },
          [line.loadSpeedLabel, line.loadSpeedTranslation].filter(Boolean).join(" · ")),
      ),
      el({ flexDirection: "column", gap: 4, borderTop: `2px solid ${p.dark}`, paddingTop: 14 },
        text({ fontSize: 13, fontWeight: 700, letterSpacing: 3, color: p.accent }, "PRECIO HOY · C/U"),
        text({ ...price, fontSize: 66, lineHeight: 1, letterSpacing: -2, color: p.dark }, money(line.unitConIva)),
        pct && line.pvpConIva
          ? el({ alignItems: "center", gap: 10, marginTop: 4 },
              text({ fontSize: 21, color: p.tenue, textDecoration: "line-through" }, money(line.pvpConIva)),
              text({ backgroundImage: "linear-gradient(135deg,#f7e29a 0%,#eccd6f 40%,#b98a1e 100%)",
                borderRadius: 6, padding: "4px 12px", fontSize: 16, fontWeight: 700, whiteSpace: "nowrap",
                color: "#211a08", boxShadow: "0 4px 10px rgba(185,138,30,0.4)" }, `−${pct}`)
            )
          : text({ fontSize: 15, color: p.tenue, marginTop: 4 }, "Precio directo de distribuidor"),
      ),
      el({}, availabilityChip(line.availability)),
      el({ flexDirection: "column", gap: 8 },
        golpes ? garantiaFila(`${golpes} contra golpes`, p.dark) : null,
        garantiaFila(`${line.fabricaAnios} años de fábrica`, p.dark),
      ),
      line.posicionamiento
        ? text({ fontSize: 15, color: p.tenue, lineHeight: 1.45 }, line.posicionamiento)
        : null,
    );
  };

  return el({ flexDirection: "column", width: "100%", backgroundColor: p.base, fontFamily: "Archivo", color: p.dark },
    posterHeader(theme, "COMPARATIVA", data.sizeLabel ?? "", data.dateLabel),
    racingBar(theme),
    el({ padding: "48px 40px 40px", alignItems: "stretch" }, ...lines.map(columna)),
    benefitsStrip(theme, TODAS_INCLUYEN),
    posterFooter(theme, CONDICIONES, SUCURSALES),
  );
}

function garantiaFila(texto: string, color: string): SatoriNode {
  return el({ alignItems: "center", gap: 8 },
    check(18, "#b98a1e"),
    text({ fontSize: 16, fontWeight: 500, color }, texto),
  );
}

// ===========================================================================
// OPCIONES
// ===========================================================================

export interface OptionsPosterData {
  dateLabel: string;
  sizeLabel?: string | null;
  lines: readonly PosterLine[];
}

export function optionsPoster(data: OptionsPosterData, theme: Theme): SatoriNode {
  const { p, price } = theme;

  // Agrupar por marca conservando el orden de aparición.
  const grupos = new Map<string, PosterLine[]>();
  for (const line of data.lines) {
    const key = line.brand.trim().toUpperCase();
    const actual = grupos.get(key) ?? [];
    // Tres tarjetas por marca: más no entran en la fila sin encogerse.
    if (actual.length < 3) actual.push(line);
    grupos.set(key, actual);
  }

  /**
   * La tarjeta crece cuando tiene sitio. Con 3 llantas la fila va apretada y
   * manda el tamaño original; con 1 sola marca en la fila —el caso normal, tres
   * marcas con una opción cada una— la tarjeta ocupaba 1.100 px con una llanta
   * de 140 y se veía perdida. Joaquín lo pidió el 6-ago: «¿hay chance de hacer
   * las llantas más grandes?». La foto crece más que el texto: la llanta es lo
   * que el cliente mira, y la tipografía no necesita el mismo salto.
   */
  const escalas = (columnas: number) =>
    columnas >= 3
      ? { foto: 1.15, texto: 1.1 }
      : columnas === 2
        ? { foto: 1.6, texto: 1.3 }
        : { foto: 2.4, texto: 1.6 };

  const tarjeta = (line: PosterLine, acento: string, columnas: number): SatoriNode => {
    const pct = savingsPct(line);
    const { foto, texto } = escalas(columnas);
    const f = (n: number) => Math.round(n * foto);
    const t = (n: number) => Math.round(n * texto);
    // Sola en su fila la tarjeta tiene ~1.100 px de ancho: apilar foto sobre
    // texto dejaba media tarjeta vacía a la derecha y estiraba la pieza a lo
    // alto. Acostada, la llanta ocupa el espacio que sobra y la fila queda más
    // corta — mismo material, mismo orden de lectura.
    const acostada = columnas === 1;

    const bloqueFoto = el(
      { alignItems: "center", justifyContent: "center", height: f(150), position: "relative",
        ...(acostada ? { width: f(170) } : {}) },
      el({ position: "absolute", bottom: 2, width: f(120), height: f(16),
        borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.20)" }),
      img(line.photoUri, { width: f(140), height: f(130), objectFit: "contain" }),
      el({ position: "absolute", top: f(12), left: f(52), width: f(52), height: f(20), borderRadius: "50%",
        backgroundImage: "linear-gradient(120deg,rgba(255,255,255,0.75),rgba(255,255,255,0))",
        transform: "rotate(-18deg)" }),
    );

    const bloqueDatos = el({ flexDirection: "column", gap: t(8), ...(acostada ? { flex: 1 } : {}) },
      text({ ...BLACK_ITALIC, fontSize: t(26), letterSpacing: -0.5, color: p.dark }, line.design),
      text({ fontSize: t(14), color: p.tenue }, line.loadSpeedLabel ?? ""),
      el({ alignItems: "baseline", gap: t(10), marginTop: 4 },
        text({ ...price, fontSize: t(42), lineHeight: 1, letterSpacing: -1, color: p.dark }, money(line.unitConIva)),
        pct && line.pvpConIva
          ? el({ flexDirection: "column", gap: 3 },
              text({ fontSize: t(16), color: p.tenue, textDecoration: "line-through" }, money(line.pvpConIva)),
              el({}, text({ backgroundImage: "linear-gradient(135deg,#f7e29a 0%,#eccd6f 40%,#b98a1e 100%)",
                borderRadius: 5, padding: `${t(2)}px ${t(8)}px`, fontSize: t(13), fontWeight: 700,
                color: "#211a08", whiteSpace: "nowrap" }, `−${pct}`)),
            )
          : null,
      ),
      availabilityDot(line.availability, texto),
    );

    return el({ flex: 1, position: "relative",
      ...(acostada
        ? { flexDirection: "row", alignItems: "center", gap: t(28) }
        : { flexDirection: "column", gap: t(8) }),
      backgroundImage: `linear-gradient(160deg,#ffffff 0%,${p.panel} 55%,${p.wash} 100%)`,
      border: `1px solid ${p.border}`, borderRadius: 16, padding: `${t(20)}px ${t(22)}px`,
      boxShadow: "0 12px 28px rgba(20,20,20,0.10), 0 2px 6px rgba(20,20,20,0.06)" },
      el({ position: "absolute", top: 0, left: 24, width: 56, height: 5,
        borderRadius: "0 0 4px 4px", backgroundColor: acento }),
      bloqueFoto,
      bloqueDatos,
    );
  };

  const filaMarca = (marca: string, items: PosterLine[]): SatoriNode => {
    const acento = brandAccent(marca, p.accent);
    const primera = items[0];
    const golpes = golpesLabel(primera);
    return el({ borderBottom: `1px solid ${p.border}` },
      el({ width: 280, flexDirection: "column", justifyContent: "center", gap: 12,
        backgroundImage: `linear-gradient(180deg,#ffffff 0%,${p.panel} 60%,${p.wash} 100%)`,
        borderRight: `1px solid ${p.border}`, padding: "28px 26px" },
        brandMark(marca, theme, 0.55),
        primera.tag
          ? el({}, text({ backgroundColor: acento, color: p.paper, borderRadius: 999, padding: "5px 14px",
              fontSize: 12, fontWeight: 700, letterSpacing: 2, whiteSpace: "nowrap" }, primera.tag))
          : null,
        primera.posicionamiento
          ? text({ fontSize: 15, color: p.tenue, lineHeight: 1.45 }, primera.posicionamiento)
          : null,
        el({ alignItems: "center", gap: 8 },
          check(16, "#b98a1e"),
          text({ fontSize: 14, fontWeight: 500, color: p.dark },
            `${golpes ? `${golpes} contra golpes · ` : ""}${primera.fabricaAnios} años fábrica`),
        ),
      ),
      el({ flex: 1, gap: 20, padding: "28px 32px", alignItems: "stretch" },
        ...items.map((line) => tarjeta(line, acento, items.length)),
      ),
    );
  };

  const filas = [...grupos.entries()].map(([marca, items]) => filaMarca(marca, items));

  return el({ flexDirection: "column", width: "100%", backgroundColor: p.base, fontFamily: "Archivo", color: p.dark },
    posterHeader(theme, "TODO EN TU MEDIDA", data.sizeLabel ?? "", data.dateLabel),
    racingBar(theme),
    ...filas,
    benefitsStrip(theme, TODAS_INCLUYEN),
    posterFooter(theme, "Precios incluyen IVA y Ecovalor · por unidad · 3 y 6 meses sin intereses", SUCURSALES),
  );
}

// ===========================================================================
// GUÍA DE MEDIDA — cómo se lee el costado
// ===========================================================================

/**
 * Los seis segmentos de una medida, en el orden en que están impresos.
 *
 * El aro va marcado aparte porque no es un dato más de la lista: es el único
 * que, si falla, deja la llanta sin poder montarse. Todo lo demás admite un
 * equivalente cercano — un 205 por un 195, un índice de carga superior — y el
 * aro no admite ninguno.
 */
interface SegmentoMedida {
  valor: string;
  rotulo: string;
  detalle: string;
  clave?: boolean;
}

const SEGMENTOS: readonly SegmentoMedida[] = [
  { valor: "195", rotulo: "ANCHO", detalle: "195 milímetros de ancho." },
  { valor: "55", rotulo: "PERFIL", detalle: "El flanco mide el 55% del ancho." },
  { valor: "R", rotulo: "CONSTRUCCIÓN", detalle: "Radial, como casi todos los autos." },
  { valor: "16", rotulo: "ARO / RIN", detalle: "16 pulgadas. El diámetro del aro.", clave: true },
  { valor: "87", rotulo: "CARGA", detalle: "Cuánto peso aguanta cada llanta." },
  { valor: "V", rotulo: "VELOCIDAD", detalle: "V = hasta 240 km/h." },
];

export interface MedidaGuidePosterData {
  dateLabel: string;
  /** Aro que ya dijo el cliente, si lo dijo: cambia el pie de «pídalo» a «confirmado». */
  aroDelCliente?: number | null;
}

/**
 * La pieza que enseña a leer el costado, con el aro marcado como dato clave.
 *
 * Nace de una regla comercial, no estética: sin el aro no se cotiza una llanta
 * con certeza, y pedirlo en seco («¿qué aro usa?») deja al cliente adivinando
 * cuál de los seis números impresos es. Esta imagen convierte esa pregunta en
 * algo que se resuelve mirando la llanta diez segundos, y de paso legitima la
 * otra vía: si prefiere, manda la foto y la leemos nosotros.
 *
 * Sin emojis a propósito — satori solo dibuja los glifos de las fuentes
 * registradas y un emoji saldría como un cuadrito vacío.
 */
export function medidaGuidePoster(data: MedidaGuidePosterData, theme: Theme): SatoriNode {
  const { p, price } = theme;

  const columna = (seg: SegmentoMedida): SatoriNode => {
    const acento = seg.clave ? p.accent : p.border;
    // Columnas iguales: la caja se estira sola y los rótulos —«CONSTRUCCIÓN»,
    // «VELOCIDAD»— entran en una línea. Repartidas por el largo de la cifra, la
    // última quedaba tan angosta que partía «km/h» en dos renglones.
    return el({ flex: 1, flexDirection: "column", alignItems: "center", gap: 14 },
      // La cifra, en la caja. La del aro va rellena para que se lea antes que
      // las otras cinco incluso de reojo en la miniatura de WhatsApp.
      el({
        alignItems: "center", justifyContent: "center", minHeight: 132, padding: "10px 20px",
        borderRadius: 16, border: `3px solid ${acento}`,
        backgroundColor: seg.clave ? p.accent : "#ffffff",
        boxShadow: seg.clave
          ? "0 14px 30px rgba(20,20,20,0.18)"
          : "0 6px 16px rgba(20,20,20,0.07)",
      },
        text({ ...price, fontSize: 84, lineHeight: 1, letterSpacing: -2,
          color: seg.clave ? p.paper : p.dark }, seg.valor),
      ),
      // Conector: la línea que ata la cifra con su explicación, en lugar de las
      // flechas del diagrama original — satori no dibuja curvas en flex.
      el({ width: 3, height: 34, backgroundColor: acento }),
      el({ flexDirection: "column", alignItems: "center", gap: 8 },
        text({
          fontSize: 13, fontWeight: 700, letterSpacing: 2, textAlign: "center",
          color: seg.clave ? p.paper : p.tenue,
          ...(seg.clave
            ? { backgroundColor: p.accent, borderRadius: 999, padding: "5px 14px" }
            : {}),
        }, seg.rotulo),
        text({ fontSize: 16, lineHeight: 1.4, textAlign: "center", color: p.dark }, seg.detalle),
      ),
    );
  };

  const separador = (simbolo: string): SatoriNode =>
    el({ width: 30, alignItems: "center", paddingTop: 40 },
      text({ ...ARCHIVO_BLACK, fontSize: 52, color: p.darkSub }, simbolo));

  const aviso = data.aroDelCliente
    ? `Usted ya nos dijo aro ${data.aroDelCliente}: con eso cotizamos. Si nos confirma la medida completa, mejor todavía.`
    : "Sin el aro no podemos garantizar que la llanta entre. Es el único dato que no tiene reemplazo.";

  return el({ flexDirection: "column", width: "100%", backgroundColor: p.base, fontFamily: "Archivo", color: p.dark },
    posterHeader(theme, "CÓMO LEER SU MEDIDA", "195/55R16 87V", data.dateLabel),
    racingBar(theme),

    el({ alignItems: "flex-start", justifyContent: "center", padding: "48px 56px 40px", gap: 4 },
      columna(SEGMENTOS[0]),
      separador("/"),
      columna(SEGMENTOS[1]),
      columna(SEGMENTOS[2]),
      columna(SEGMENTOS[3]),
      columna(SEGMENTOS[4]),
      columna(SEGMENTOS[5]),
    ),

    // Franja del aro: la razón de ser de la pieza, dicha en una línea.
    el({ alignItems: "center", gap: 18, padding: "24px 56px",
      backgroundColor: p.dark, borderTop: `1px solid ${p.border}` },
      text({ ...ARCHIVO_BLACK, fontSize: 22, color: p.gold, whiteSpace: "nowrap" }, "EL ARO MANDA"),
      text({ fontSize: 18, color: p.paper, lineHeight: 1.4 }, aviso),
    ),

    el({ alignItems: "center", gap: 14, padding: "22px 56px", backgroundColor: p.panel },
      check(22, "#2a9d8f"),
      text({ fontSize: 18, fontWeight: 500 },
        "¿No la encuentra? Mándenos una foto del costado de la llanta: nosotros la leemos y le cotizamos."),
    ),

    posterFooter(theme, "La medida está impresa en el costado de la llanta", SUCURSALES),
  );
}
