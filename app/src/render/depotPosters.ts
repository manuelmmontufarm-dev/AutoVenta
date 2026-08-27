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
  availabilityChip, availabilityDot, availabilityPill, brandAccent, brandAccentDark,
  brandMark, check, depotWordmark, el, img, posterFooter, posterHeader, racingBar, savingsBadge, speedLines,
  stripEmoji, text, tick,
} from "./depotDesign.js";
import { guideTireImage } from "./assets.js";

/**
 * ¿Este color desaparecería sobre el caucho de la ilustración?
 *
 * La paleta «rojo» tiene `accent` en #191919 — casi negro — y varias piezas lo
 * usan como color de énfasis sobre fondo claro sin problema. Sobre la llanta
 * oscura, en cambio, un realce en ese tono es un realce invisible.
 */
function esOscuro(hex: string): boolean {
  const canal = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  // Luminancia percibida (Rec. 601): el verde pesa más que el rojo y el azul.
  return (canal(0) * 299 + canal(1) * 587 + canal(2) * 114) / 1000 < 90;
}

const money = (n: number) => `$${n.toFixed(2)}`;

const CONDICIONES = "Precios incluyen IVA y Ecovalor · por unidad · 3 y 6 meses sin intereses";
const SUCURSALES = "Cumbayá · Quito Sur · 30 años";
const TODAS_INCLUYEN =
  "Instalación completa · seguro contra golpes y cortes · mantenimiento cada 10.000 km · revisión del vehículo";

/**
 * La franja INCLUYE de opciones y comparativa, resaltada (P-07, reunión
 * 25-ago). El bloque salía dos veces —en texto y en la foto— y la decisión fue
 * dejarlo SOLO en la foto: para eso la franja tiene que leerse, y la anterior
 * (benefitsStrip, 17 px en gris) era letra de trámite. Misma jerarquía visual
 * que el «INCLUIDO CON TU COMPRA» de la cotización, pero en UNA franja —
 * etiqueta y una sola línea, sin amontonar.
 *
 * Con `beneficios` de la tabla, la franja dice EXACTAMENTE lo que dice la
 * cotización y lo que el bot afirma en el chat; sin ellos cae el genérico.
 */
function franjaIncluye(theme: Theme, beneficios?: readonly string[]): SatoriNode {
  const p = theme.p;
  const texto = beneficios?.length ? beneficios.map(stripEmoji).join(" · ") : TODAS_INCLUYEN;
  return el({ alignItems: "center", gap: 18, padding: "28px 64px", borderTop: `3px solid ${p.gold}`,
    backgroundImage: `linear-gradient(180deg,${p.base} 0%,${p.wash} 100%)` },
    el({ width: 8, height: 30, backgroundColor: p.accent, transform: "skewX(-22deg)" }),
    text({ fontSize: 22, fontWeight: 700, letterSpacing: 3, color: p.dark, whiteSpace: "nowrap" }, "INCLUYE"),
    check(24),
    text({ fontSize: 21, fontWeight: 600, color: p.dark, lineHeight: 1.45 }, texto),
  );
}

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
  /**
   * ¿Es exactamente la medida que pidió el cliente?
   *
   * `true` → se marca MEDIDA EXACTA. `false` → se marca «LE MONTA», con la
   * medida real a la vista y contra cuál se compara. `null`/undefined → no se
   * sabe (el cliente no dio medida) y no se marca nada.
   *
   * Existe porque la pieza de opciones se llena hasta con tres llantas y, para
   * lograrlo, a veces entran equivalentes de otra medida. Eso está bien —son
   * llantas que sí le montan— pero sin decirlo la imagen miente por omisión, y
   * de ahí salió una cotización firmada en la medida equivocada (13-ago).
   */
  medidaExacta?: boolean | null;
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
        // LA CANTIDAD, EN GRANDE. Manuel, 27-ago: «pondría más grande el número
        // de llantas en el PDF para que se note más». Iba en 17 px grises al
        // lado de la píldora de disponibilidad, y es el dato que cambia el
        // total: el cliente que pidió 3 tiene que ver 3 de un vistazo, sin
        // buscarlo. Va con el borde del acento para que compita con el precio.
        el({ alignItems: "center", gap: 16, marginTop: 6 },
          availabilityPill(line.availability, theme),
          el({ alignItems: "center", gap: 9, border: `3px solid ${p.dark}`, borderRadius: 999,
            padding: "6px 22px" },
            text({ ...ARCHIVO_BLACK, fontSize: 32, lineHeight: 1.1, color: p.dark }, `${line.quantity}`),
            text({ fontSize: 19, fontWeight: 700, letterSpacing: 1, color: p.dark },
              line.quantity === 1 ? "LLANTA" : "LLANTAS"),
          ),
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

    // Sellos de garantía — la sección que más vende, dicho por Depot: va
    // grande de verdad, con rótulo propio, no como una franja de trámite.
    el({ flexDirection: "column", gap: 30, padding: "44px 64px 48px",
      backgroundImage: `linear-gradient(180deg,#ffffff 0%,${p.panel} 55%,${p.wash} 100%)` },
      el({ alignItems: "center", gap: 16 },
        el({ width: 10, height: 34, backgroundColor: p.accent, transform: "skewX(-22deg)" }),
        text({ fontSize: 26, fontWeight: 700, letterSpacing: 4, color: p.dark }, "GARANTÍAS QUE TE RESPALDAN"),
      ),
      el({ justifyContent: "space-between", alignItems: "center" },
        golpes
          ? seal(String(line.golpesMeses), "MESES", "GARANTÍA CONTRA GOLPES")
          : seal(String(line.fabricaAnios), "AÑOS", "GARANTÍA DE FÁBRICA"),
        divider(p.border),
        seal(String(line.fabricaAnios), "AÑOS", "GARANTÍA DE FÁBRICA"),
        divider(p.border),
        seal("30", "AÑOS", "DEPOT TIRE EN QUITO"),
      ),
    ),
  ];

  // Beneficios: vienen de la tabla, no del diseño. Sin beneficios cargados no
  // se dibuja la franja — el bot no promete lo que el negocio no configuró.
  if (benefits.length) {
    // Al tamaño de las garantías: esto es lo que diferencia a Depot de vender
    // la misma llanta más barata en Marketplace, y estaba en letra de trámite.
    bloques.push(
      el({ flexDirection: "column", gap: 22, padding: "40px 64px 46px", borderTop: `3px solid ${p.gold}`,
        backgroundImage: `linear-gradient(180deg,${p.base} 0%,${p.wash} 100%)` },
        el({ alignItems: "center", gap: 16 },
          el({ width: 10, height: 34, backgroundColor: p.accent, transform: "skewX(-22deg)" }),
          text({ fontSize: 26, fontWeight: 700, letterSpacing: 4, color: p.dark }, "INCLUIDO CON TU COMPRA"),
          text({ backgroundColor: p.accent, color: p.paper, borderRadius: 999, padding: "6px 18px",
            fontSize: 17, fontWeight: 700, letterSpacing: 1, whiteSpace: "nowrap" }, "SIN COSTO"),
        ),
        el({ flexWrap: "wrap", gap: 16 },
          ...benefits.map((b) =>
            el({ alignItems: "center", gap: 14, backgroundColor: p.panel,
              border: `2px solid ${p.border}`, borderRadius: 999, padding: "16px 28px",
              boxShadow: "0 6px 16px rgba(20,20,20,0.07)" },
              check(28),
              text({ fontSize: 25, fontWeight: 600, color: p.dark }, stripEmoji(b)))),
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
        totalCell(theme, "CANTIDAD", `${line.quantity} ${line.quantity === 1 ? "llanta" : "llantas"}`, true),
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

/**
 * El sello creció del tamaño de un timbre (132 px en una pieza de 1440) al de
 * un argumento de venta: Depot pidió el 13-ago que las garantías «se vean, que
 * eso vende un montón». La cifra es lo que se lee en la miniatura de WhatsApp,
 * así que es la que más sube.
 */
function warrantySealLocal(numero: string, unidad: string, rotulo: string): SatoriNode {
  return el({ flexDirection: "column", alignItems: "center", gap: 16, width: 380 },
    el({ width: 200, height: 200, borderRadius: "50%", alignItems: "center", justifyContent: "center",
      backgroundImage: "linear-gradient(135deg,#eccd6f,#b98a1e)",
      boxShadow: "0 12px 30px rgba(185,138,30,0.35)" },
      el({ width: 162, height: 162, borderRadius: "50%", backgroundColor: "#211a08",
        flexDirection: "column", alignItems: "center", justifyContent: "center" },
        text({ ...ARCHIVO_BLACK, fontSize: 66, color: "#e8c15a", lineHeight: 1 }, numero),
        text({ fontSize: 19, fontWeight: 700, letterSpacing: 3, color: "#e8c15a" }, unidad),
      ),
    ),
    text({ fontSize: 21, fontWeight: 700, letterSpacing: 3, textAlign: "center" }, rotulo),
  );
}

const divider = (color: string) => el({ width: 1, height: 190, backgroundColor: color });

function totalCell(theme: Theme, rotulo: string, valor: string, destacado = false): SatoriNode {
  return el({ flexDirection: "column", gap: 2 },
    text({ fontSize: 13, letterSpacing: 2, color: theme.p.darkSub }, rotulo),
    text({ fontSize: destacado ? 38 : 26, fontWeight: 700, color: theme.p.paper }, valor),
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
    franjaIncluye(theme),
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
  /**
   * ¿Sabemos qué medida pidió? Con `false` (buscó por aro o por vehículo) la
   * pieza no puede hablar de «su medida»: dice de qué aro son y que la exacta
   * está por confirmar.
   */
  medidaConocida?: boolean;
  /** Beneficios vigentes de la tabla; vacío o ausente = texto genérico del diseño. */
  benefits?: readonly string[];
}

/** El aro que se lee de una medida, para poder decir «le entra por el aro 17». */
function aroDeMedida(sizeLabel: string): string | null {
  return sizeLabel.match(/R(\d{2})/i)?.[1] ?? null;
}

/**
 * El sello de medida de cada tarjeta de opciones.
 *
 * Verde «MEDIDA EXACTA» cuando es la que pidió; ámbar cuando es una
 * equivalente. La tarjeta no mostraba la medida por ningún lado, así que tres
 * llantas de tres medidas distintas se veían idénticas — el cliente elegía a
 * ciegas y el bot terminaba cotizando otra cosa.
 *
 * El sello de la equivalente **advierte sin desanimar**. La primera versión
 * gritaba «NO ES SU MEDIDA» en rojo con borde de 3 px, y el efecto sobre la
 * pieza era el contrario del buscado: tres opciones legítimas —con stock, del
 * mismo aro, las únicas que el negocio puede vender en ese caso— se leían como
 * tres errores, y quien pedía una medida que el catálogo no tiene se llevaba
 * una imagen en la que todo estaba tachado.
 *
 * El reparo se dice igual y con todas las letras —«no es su medida exacta»—,
 * pero ahora encabeza el sello lo que la llanta SÍ hace (le monta) y el reparo
 * viene abajo, pegado a su razón. Lo que cambió es el volumen, no el contenido:
 * el dato que salvó la cotización del 13-ago sigue entero y la medida real
 * sigue a la vista, nunca haciéndose pasar por la pedida.
 *
 * El color es ámbar y no rojo, y esa distinción es el punto entero: el ámbar
 * dice «mírame antes de decidir», el rojo decía «esto está mal». Tiene que
 * saltar —una equivalente que pase inadvertida es justo el fallo del 13-ago—
 * pero sin leerse como error, porque estas llantas son las que el negocio de
 * verdad puede vender ese día. El rojo queda para lo que sí es un problema.
 */
function selloDeMedida(line: PosterLine, t: (n: number) => number): SatoriNode | null {
  if (line.medidaExacta == null) return null;
  const aro = aroDeMedida(line.sizeLabel);
  if (line.medidaExacta) {
    return el({
      alignItems: "center", gap: t(8), backgroundColor: "#dcf2e3", borderRadius: 999,
      border: "2px solid #1e7a3c", padding: `${t(7)}px ${t(16)}px`, alignSelf: "flex-start",
    },
      tick(t(15), "#1e7a3c"),
      text({ fontSize: t(16), fontWeight: 700, color: "#1e7a3c", whiteSpace: "nowrap" },
        `${line.sizeLabel} · MEDIDA EXACTA`),
    );
  }
  // La segunda línea dice las dos cosas en una sola frase, y en ese orden: que
  // NO es su medida exacta —literal, sin eufemismo, porque de ahí salió la
  // cotización firmada en la medida equivocada— y enseguida por qué igual le
  // sirve. Suavizar el tono no es callar el dato: es dejar de gritarlo. La
  // razón («tiene el mismo aro») va pegada al reparo para que se lean juntos,
  // que es la diferencia entre advertir y desanimar.
  // El reparo va en DOS renglones y no en uno, por una razón de layout que ya
  // rompió la pieza: con tres marcas la fila se aprieta y la tarjeta queda
  // angosta, y como los textos del sello van en `nowrap` —tienen que ir: una
  // medida partida a la mitad es peor que nada— una sola frase larga se salía
  // de la tarjeta y se cortaba justo en el aro. Partida, el renglón más largo
  // mide poco más que el título y entra en la columna más estrecha.
  const razon = aro ? `pero le entra: mismo aro ${aro}` : "pero le entra: es equivalente";
  return el({
    flexDirection: "column", gap: t(1), backgroundColor: "#fff3d6", borderRadius: t(8),
    border: "2px solid #dda017", padding: `${t(6)}px ${t(12)}px`, alignSelf: "flex-start",
  },
    text({ fontSize: t(15), fontWeight: 700, color: "#7a4e08", whiteSpace: "nowrap" },
      `${line.sizeLabel} · LE MONTA`),
    text({ fontSize: t(11.5), fontWeight: 600, color: "#8a5c10", whiteSpace: "nowrap" },
      "No es su medida exacta,"),
    text({ fontSize: t(11.5), fontWeight: 600, color: "#8a5c10", whiteSpace: "nowrap" }, razon),
  );
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
      // El sello va ARRIBA del precio: es lo que el cliente tiene que saber
      // antes de mirar cuánto cuesta.
      selloDeMedida(line, t),
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

  // «TODO EN TU MEDIDA» solo se puede prometer si TODAS lo son. Con alguna
  // equivalente en la pieza, ese rótulo sería justo la confusión que los
  // sellos vienen a evitar.
  const hayEquivalentes = data.lines.some((line) => line.medidaExacta === false);
  return el({ flexDirection: "column", width: "100%", backgroundColor: p.base, fontFamily: "Archivo", color: p.dark },
    posterHeader(
      theme,
      hayEquivalentes
        ? (data.medidaConocida === false ? "OPCIONES EN SU ARO" : "OPCIONES QUE LE MONTAN")
        : "TODO EN TU MEDIDA",
      data.sizeLabel ?? "",
      data.dateLabel,
    ),
    racingBar(theme),
    ...filas,
    hayEquivalentes
      ? el({ alignItems: "center", gap: 14, padding: "20px 64px", backgroundColor: "#fff3d6",
          borderTop: "3px solid #dda017" },
          text({ ...ARCHIVO_BLACK, fontSize: 20, color: "#7a4e08", whiteSpace: "nowrap" },
            data.medidaConocida === false ? "FALTA SU MEDIDA" : "LE MONTAN"),
          text({ fontSize: 18, fontWeight: 500, color: "#8a5c10", lineHeight: 1.4 },
            data.medidaConocida === false
              ? "Estas son del aro que usted pidió, en distintas medidas. Para dejarle la exacta, mándeme la medida del costado de su llanta o confírmela con el asesor."
              : "Las marcadas «LE MONTA» no son su medida exacta, pero le entran: tienen el mismo aro y rinden igual de bien. Confírmelas con el asesor antes de comprar."),
        )
      : null,
    franjaIncluye(theme, data.benefits),
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
    // `minWidth: 0` es lo que impide que las cajas se monten unas sobre otras:
    // con la llanta ocupando su parte de la fila, flex encogía las columnas por
    // debajo de su contenido y el "/" quedaba tapado por el 195.
    return el({ flex: 1, minWidth: 0, flexDirection: "column", alignItems: "center", gap: 12 },
      // La cifra, en la caja. La del aro va rellena para que se lea antes que
      // las otras cinco incluso de reojo en la miniatura de WhatsApp.
      el({
        alignItems: "center", justifyContent: "center", minHeight: 108, padding: "10px 12px",
        borderRadius: 16, border: `3px solid ${acento}`,
        backgroundColor: seg.clave ? p.accent : "#ffffff",
        boxShadow: seg.clave
          ? "0 14px 30px rgba(20,20,20,0.18)"
          : "0 6px 16px rgba(20,20,20,0.07)",
      },
        text({ ...price, fontSize: 68, lineHeight: 1, letterSpacing: -2,
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
    el({ width: 22, alignItems: "center", paddingTop: 30 },
      text({ ...ARCHIVO_BLACK, fontSize: 40, color: p.darkSub }, simbolo));

  /**
   * La llanta, con la medida escrita encima del costado.
   *
   * Es lo que le faltaba a la pieza: el despiece de abajo explica qué significa
   * cada número, pero no le dice al cliente qué está buscando físicamente. Aquí
   * ve el objeto y ve el letrero sobre el flanco, que es exactamente el gesto
   * que tiene que repetir con su llanta en el parqueadero.
   *
   * La medida va superpuesta y no dibujada dentro del SVG porque satori no curva
   * texto sobre una trayectoria: recta sobre el flanco superior se lee mejor que
   * un arco falso, y es donde de verdad está impresa.
   */
  const laLlanta = (): SatoriNode => {
    const D = 244;
    const MEDIDA = "195/55R16 87V";

    // Cuánto ocupa cada carácter en el arco. Con un paso constante, el "1" y el
    // "/" dejan huecos y "195/55" se ve suelto: pesarlos deja el letrero
    // parejo, que es lo único que se le pide a un arco de trece caracteres.
    const ancho = (ch: string) => (ch === "1" || ch === "/" ? 0.62 : ch === " " ? 0.38 : 1);
    const total = [...MEDIDA].reduce((suma, ch) => suma + ancho(ch), 0);
    // El paso NO es una constante de diseño, es geometría: sobre un arco, los
    // grados que ocupa una letra dependen del radio en el que se apoya. Bajar
    // el letrero al flanco acorta el radio y, con el mismo paso, las letras se
    // montan unas sobre otras. Se calcula: avance del glifo ÷ largo de un grado.
    const CUERPO = 22;
    const RADIO = D / 2 - 30 - CUERPO / 2; // hasta el centro del glifo
    const PASO = (CUERPO * 0.6) / ((RADIO * Math.PI) / 180);
    const arco = total * PASO;

    let recorrido = 0;
    const letras = [...MEDIDA].map((ch) => {
      const mio = ancho(ch);
      // El ángulo del centro del glifo, con el arco entero centrado arriba.
      const angulo = -arco / 2 + recorrido + (mio * PASO) / 2;
      recorrido += mio * PASO;
      // La caja cubre la llanta entera y gira sobre su propio centro —que es
      // el centro de la llanta—, con el glifo pegado arriba. Así el carácter
      // orbita Y se inclina a la vez, que es lo que hace que el texto se lea
      // curvado sobre el flanco en vez de recto encima de él.
      return el({
        position: "absolute", top: 0, left: 0, width: D, height: D,
        alignItems: "flex-start", justifyContent: "center",
        transform: `rotate(${angulo.toFixed(2)}deg)`,
      },
        // `paddingTop` es lo que decide en qué anillo cae el letrero: aquí
        // sobre el flanco liso, entre los tacos de la banda y el borde del rin,
        // que es exactamente donde va impreso en una llanta de verdad.
        text({ ...price, fontSize: CUERPO, color: "#ffffff", paddingTop: 30 }, ch),
      );
    });

    return el({ position: "relative", width: D, height: D, alignItems: "center", justifyContent: "center" },
      // El aro va resaltado en el mismo color que su caja del despiece, salvo
      // cuando ese color es casi negro (paleta «rojo»): sobre el caucho oscuro
      // no se vería nada y ahí manda el oro, que contrasta en las seis.
      img(guideTireImage(esOscuro(p.accent) ? p.gold : p.accent).dataUri, { width: D, height: D }),
      ...letras,
    );
  };

  const aviso = data.aroDelCliente
    ? `Usted ya nos dijo aro ${data.aroDelCliente}: con eso cotizamos. Si nos confirma la medida completa, mejor todavía.`
    : "Sin el aro no podemos garantizar que la llanta entre. Es el único dato que no tiene reemplazo.";

  return el({ flexDirection: "column", width: "100%", backgroundColor: p.base, fontFamily: "Archivo", color: p.dark },
    posterHeader(theme, "CÓMO LEER SU MEDIDA", "195/55R16 87V", data.dateLabel),
    racingBar(theme),

    // La llanta a la izquierda y el despiece a la derecha: primero QUÉ mirar,
    // después qué significa. Al revés —el despiece solo, como estaba— el
    // cliente entiende los números pero sigue sin saber dónde están.
    el({ alignItems: "flex-start", padding: "40px 56px 36px", gap: 34 },
      el({ flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 6 },
        laLlanta(),
        text({ fontSize: 15, fontWeight: 700, letterSpacing: 1.4, color: p.tenue }, "EN EL COSTADO"),
      ),
      el({ flex: 1, alignItems: "flex-start", justifyContent: "center", gap: 4 },
        columna(SEGMENTOS[0]),
        separador("/"),
        columna(SEGMENTOS[1]),
        columna(SEGMENTOS[2]),
        columna(SEGMENTOS[3]),
        columna(SEGMENTOS[4]),
        columna(SEGMENTOS[5]),
      ),
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
