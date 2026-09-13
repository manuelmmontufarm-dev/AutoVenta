/**
 * La plantilla «Depot día y noche» de la cotización y las opciones.
 *
 * Es la que propuso Depot Tire el 12-sep-2026 (fondo oscuro, tarjetas por
 * opción, «incluido sin costo» con íconos), con lo que Manuel pidió encima:
 *
 *  · la cantidad de llantas en una píldora grande, no en un rótulo de 7 px;
 *  · el precio por llanta con cifra propia, en su recuadro;
 *  · el descuento en la insignia dorada de siempre, con el precio de antes
 *    tachado al lado;
 *  · lo incluido con letra que se lea en el teléfono;
 *  · los logos OFICIALES de cada marca (assets/brands/oficiales), nada
 *    redibujado a mano;
 *  · una versión clara y una oscura. Es la única plantilla que cambia sola:
 *    clara de 6:00 a 16:59 y oscura de 17:00 a 5:59, hora de Quito — salvo que
 *    Ajustes la fije en una de las dos.
 *
 * La maqueta aprobada está en HTML (~/Documents/AUTOVENTAS/plantillas-depot-cliente)
 * y aquí se porta a nodos de satori con las mismas medidas en px: la pieza se
 * diseña a 728 / 648 px de ancho y se rasteriza al triple.
 *
 * Lo que NO se pierde al cambiar de diseño es lo que ya costó errores reales:
 * el sello ámbar de la medida equivalente (cotización firmada en la medida
 * equivocada, 13-ago), el «por confirmar» cuando no hay medida del cliente y
 * la cantidad del juego tal como la pidió.
 */
import { DEPOT_LOGO_RATIO, depotLogo, logoOficial } from "./assets.js";
import { el, img, stripEmoji, text, type SatoriNode } from "./depotDesign.js";
import type { PosterLine } from "./depotPosters.js";

// ===========================================================================
// Día o noche
// ===========================================================================

export type ModoPieza = "dia" | "noche";

/** Ancho de diseño de cada pieza, en px de la maqueta aprobada. */
export const DIA_NOCHE_ANCHO = { opciones: 728, cotizacion: 648 } as const;
/** A cuánto se rasteriza: 728 px × 3 = 2.184 px, nítido en cualquier teléfono. */
export const DIA_NOCHE_ESCALA = 3;

const HORA_QUITO = new Intl.DateTimeFormat("en-US", {
  hour: "numeric", hourCycle: "h23", timeZone: "America/Guayaquil",
});

/** Clara de 6:00 a 16:59 de Quito; oscura de 17:00 a 5:59. */
export function modoDeLaHora(ahora: Date): ModoPieza {
  const hora = Number(HORA_QUITO.format(ahora)) % 24;
  return hora >= 6 && hora < 17 ? "dia" : "noche";
}

/** «dia» y «noche» mandan siempre; cualquier otra cosa («auto») mira la hora. */
export function resolverModo(modo: string | null | undefined, ahora: Date = new Date()): ModoPieza {
  if (modo === "dia" || modo === "noche") return modo;
  return modoDeLaHora(ahora);
}

// ===========================================================================
// Colores de cada modo — los mismos valores de la maqueta aprobada
// ===========================================================================

const ROJO = "#e52c2a";
const ORO = "#ffc93c";
const ORO_GRAD = "linear-gradient(135deg, #f7e29a 0%, #eccd6f 35%, #c99a2e 70%, #b98a1e 100%)";
const TINTA_ORO = "#211a08";

interface Tokens {
  bg: string; glow1: string; glow2: string;
  txt: string; sub: string; tenue: string; line: string; line2: string;
  card: string; sombra: string | null; borde: string; bordeAncho: number;
  reco: string; recoBorde: string; recoSombra: string;
  foto: string; fotoSombra: string;
  chipBg: string; chipBorde: string; chipTxt: string;
  chipRojoBg: string; chipRojoBorde: string; chipRojoTxt: string;
  tagTxt: string; juegoBorde: string; juegoLbl: string;
  panel: string; raya: string;
  icoBg: string; icoBorde: string; icoRojo: string; icoOro: string;
  icoOroBg: string; icoOroBorde: string;
  incP: string; marcaBorde: string | null;
  hero: string; cotBorde: string; cotTxt: string; cargaBorde: string;
  verde: string; verdeBg: string; verdeBorde: string;
  cantBorde: string; antes: string;
  seguro: string; seguroBorde: string; seguroOro: string; pieB: string;
  ambarBg: string; ambarBorde: string; ambarTxt: string; ambarSub: string;
  logo: "blanco" | "color";
}

const NOCHE: Tokens = {
  bg: "#09090b", glow1: "rgba(150,20,20,0.38)", glow2: "rgba(120,15,15,0.30)",
  txt: "#f5f5f5", sub: "#9a9aa2", tenue: "#6f6f78", line: "rgba(255,255,255,0.08)", line2: "rgba(255,255,255,0.18)",
  card: "linear-gradient(180deg, #141417, #101013)", sombra: null, borde: "rgba(255,255,255,0.08)", bordeAncho: 1,
  reco: "radial-gradient(260px 200px at 12% 50%, rgba(229,44,42,0.14), transparent 70%), linear-gradient(180deg, #1a1012, #120d0f)",
  recoBorde: "rgba(229,44,42,0.45)", recoSombra: "0 0 40px rgba(229,44,42,0.10)",
  foto: "radial-gradient(circle at 50% 45%, #2a2a30, #1a1a1e 70%)", fotoSombra: "rgba(0,0,0,0.45)",
  chipBg: "#1d1d22", chipBorde: "rgba(255,255,255,0.06)", chipTxt: "#d6d6db",
  chipRojoBg: "rgba(229,44,42,0.18)", chipRojoBorde: "rgba(229,44,42,0.5)", chipRojoTxt: "#ffffff",
  tagTxt: "#b9b9c0", juegoBorde: "rgba(255,255,255,0.6)", juegoLbl: "#c9c9cf",
  panel: "linear-gradient(180deg, #111114, #0d0d10)", raya: "rgba(255,255,255,0.14)",
  icoBg: "rgba(229,44,42,0.16)", icoBorde: "rgba(229,44,42,0.4)", icoRojo: "#ff4b3e", icoOro: "#ffc93c",
  icoOroBg: "rgba(255,201,60,0.10)", icoOroBorde: "rgba(255,201,60,0.3)",
  incP: "#bdbdc4", marcaBorde: null,
  hero: "radial-gradient(260px 220px at 32% 55%, rgba(229,44,42,0.13), transparent 70%), linear-gradient(180deg, #141417, #0f0f12)",
  cotBorde: "rgba(255,255,255,0.2)", cotTxt: "#e6e6ea", cargaBorde: "rgba(255,255,255,0.22)",
  verde: "#3ddc84", verdeBg: "rgba(61,220,132,0.08)", verdeBorde: "rgba(61,220,132,0.3)",
  cantBorde: "#ffffff", antes: "#8d8d95",
  seguro: "radial-gradient(200px 160px at 10% 50%, rgba(229,44,42,0.22), transparent 70%), linear-gradient(180deg, #181214, #110d0f)",
  seguroBorde: "rgba(229,44,42,0.25)", seguroOro: "#ffc93c", pieB: "#c9c9cf",
  ambarBg: "rgba(221,160,23,0.12)", ambarBorde: "#dda017", ambarTxt: "#ffd27a", ambarSub: "#e8c47a",
  logo: "blanco",
};

/**
 * La clara. En blanco los recuadros de cada opción se perdían contra el fondo
 * (Manuel, 12-sep: «se ven muy blended»): borde más oscuro y más grueso, y un
 * poco más de sombra que en la oscura.
 */
const DIA: Tokens = {
  bg: "#ffffff", glow1: "rgba(229,44,42,0.07)", glow2: "rgba(229,44,42,0.05)",
  txt: "#141416", sub: "#5b5b64", tenue: "#83838c", line: "#e6e6ea", line2: "#d3d3d9",
  card: "linear-gradient(180deg, #ffffff, #fafafb)", sombra: "0 8px 22px rgba(20,20,30,0.10)", borde: "#c4c4cc", bordeAncho: 1.5,
  reco: "radial-gradient(260px 200px at 12% 50%, rgba(229,44,42,0.07), transparent 70%), linear-gradient(180deg, #fff6f6, #ffffff)",
  recoBorde: "rgba(229,44,42,0.85)", recoSombra: "0 10px 28px rgba(229,44,42,0.18)",
  foto: "radial-gradient(circle at 50% 45%, #ffffff, #ececef 75%)", fotoSombra: "rgba(0,0,0,0.16)",
  chipBg: "#f3f3f5", chipBorde: "#e3e3e7", chipTxt: "#2b2b31",
  chipRojoBg: "rgba(229,44,42,0.08)", chipRojoBorde: "rgba(229,44,42,0.45)", chipRojoTxt: "#b3171e",
  tagTxt: "#55555e", juegoBorde: "#141416", juegoLbl: "#55555e",
  panel: "linear-gradient(180deg, #ffffff, #fafafb)", raya: "#e0e0e5",
  icoBg: "rgba(229,44,42,0.08)", icoBorde: "rgba(229,44,42,0.35)", icoRojo: "#d42a27", icoOro: "#b8830f",
  icoOroBg: "rgba(255,201,60,0.18)", icoOroBorde: "rgba(185,138,30,0.35)",
  incP: "#4d4d55", marcaBorde: "#dcdce1",
  hero: "radial-gradient(260px 220px at 32% 55%, rgba(229,44,42,0.06), transparent 70%), linear-gradient(180deg, #ffffff, #f8f8fa)",
  cotBorde: "#d3d3d9", cotTxt: "#2b2b31", cargaBorde: "#cfcfd5",
  verde: "#1e7a3c", verdeBg: "#e4f6ea", verdeBorde: "#a8dcb9",
  cantBorde: "#141416", antes: "#83838c",
  seguro: "radial-gradient(200px 160px at 10% 50%, rgba(229,44,42,0.08), transparent 70%), linear-gradient(180deg, #fff6f6, #ffffff)",
  seguroBorde: "rgba(229,44,42,0.7)", seguroOro: "#b8830f", pieB: "#2b2b31",
  ambarBg: "#fff3d6", ambarBorde: "#dda017", ambarTxt: "#7a4e08", ambarSub: "#8a5c10",
  logo: "color",
};

const tokens = (modo: ModoPieza): Tokens => (modo === "dia" ? DIA : NOCHE);

// ===========================================================================
// Tipografía — fuentes registradas en loadFontsDiaNoche (assets.ts)
// ===========================================================================

/** Archivo ancho (wdth 112): títulos, cifras y nombres de llanta. */
const ANCHO = (peso: 800 | 900 = 800) => ({ fontFamily: "DN Ancho", fontWeight: peso });
/** Archivo de ancho normal: el título grande y los títulos de lo incluido. */
const ARCHIVO = { fontFamily: "DN Archivo", fontWeight: 800 };
/** Chakra Petch: rótulos con letras separadas. */
const CHAKRA = (peso: 600 | 700 = 700) => ({ fontFamily: "DN Chakra", fontWeight: peso });
/** Barlow: el texto corrido. */
const BARLOW = (peso: 400 | 500 | 600 | 700 = 400) => ({ fontFamily: "DN Barlow", fontWeight: peso });

const dinero = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const sombra = (valor: string | null) => (valor ? { boxShadow: valor } : {});

/** Cifra que no se sale de su columna: baja el cuerpo cuando el número es largo. */
const cuerpoQueCabe = (texto: string, base: number, ancho: number) =>
  Math.min(base, Math.floor(ancho / (texto.length * 0.66)));

const NUMERO = ["", "UNA", "DOS", "TRES", "CUATRO", "CINCO", "SEIS"];

/** Porcentaje de descuento contra el precio de lista, redondeado. Null si no hay lista. */
function porcentaje(line: PosterLine): number | null {
  if (!line.pvpConIva || line.pvpConIva <= line.unitConIva) return null;
  return Math.round((1 - line.unitConIva / line.pvpConIva) * 100);
}

const capitalizar = (marca: string) => {
  const m = marca.trim().toLowerCase();
  return m.charAt(0).toUpperCase() + m.slice(1);
};

// ===========================================================================
// Figuras: íconos, banderas, logos
// ===========================================================================

const forma = (type: string, props: Record<string, unknown>): SatoriNode => ({ type, props });

type Icono = "escudo" | "escudoOk" | "medalla" | "rueda" | "ciclo" | "revision" | "local" | "regalo" | "estrella";

/** Íconos de trazo, los mismos de la maqueta. Van como SVG: satori no tiene fuente de íconos. */
function icono(nombre: Icono, tam: number, color: string): SatoriNode {
  const trazo = { fill: "none", stroke: color, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" };
  const p = (d: string) => forma("path", { d, ...trazo });
  const ESCUDO = "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z";
  const figuras: Record<Icono, SatoriNode[]> = {
    escudo: [p(ESCUDO)],
    escudoOk: [p(ESCUDO), p("M9 12l2 2 4-4")],
    medalla: [forma("circle", { cx: 12, cy: 8, r: 6, ...trazo }), p("M15.5 12.9L17 22l-5-3-5 3 1.5-9.1")],
    rueda: [
      forma("circle", { cx: 12, cy: 12, r: 10, ...trazo }),
      forma("circle", { cx: 12, cy: 12, r: 4, ...trazo }),
      p("M4.9 4.9l4.3 4.3M14.8 9.2l4.3-4.3M14.8 14.8l4.3 4.3M9.2 14.8l-4.3 4.3"),
    ],
    ciclo: [
      p("M21 12a9 9 0 0 0-9-9 9.8 9.8 0 0 0-6.7 2.7L3 8"), p("M3 3v5h5"),
      p("M3 12a9 9 0 0 0 9 9 9.8 9.8 0 0 0 6.7-2.7L21 16"), p("M16 16h5v5"),
    ],
    revision: [
      forma("rect", { x: 8, y: 2, width: 8, height: 4, rx: 1, ...trazo }),
      p("M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"),
      p("M9 14l2 2 4-4"),
    ],
    local: [p("M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l8 5H4z")],
    regalo: [
      forma("rect", { x: 3, y: 8, width: 18, height: 4, rx: 1, ...trazo }),
      p("M12 8v13"), p("M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"),
      p("M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"),
    ],
    estrella: [forma("polygon", { points: "12,2 15,9 22,9.5 16.5,14 18.5,21 12,17 5.5,21 7.5,14 2,9.5 9,9", fill: color })],
  };
  return { type: "svg", props: { width: tam, height: tam, viewBox: "0 0 24 24", children: figuras[nombre] } };
}

type Bandera = "china" | "alemania" | "taiwan" | "japon";

function bandera(cual: Bandera, ancho: number, alto: number, t: Tokens): SatoriNode {
  const figuras: Record<Bandera, SatoriNode[]> = {
    china: [
      forma("rect", { width: 30, height: 20, fill: "#de2910" }),
      forma("polygon", { points: "5,2 6.2,5.5 9.8,5.5 6.9,7.7 8,11.2 5,9 2,11.2 3.1,7.7 0.2,5.5 3.8,5.5", fill: "#ffde00" }),
      ...[[11, 2.6], [13, 4.8], [13, 7.8], [11, 10]].map(([cx, cy]) => forma("circle", { cx, cy, r: 0.9, fill: "#ffde00" })),
    ],
    alemania: [
      forma("rect", { width: 30, height: 6.7, fill: "#000000" }),
      forma("rect", { y: 6.6, width: 30, height: 6.8, fill: "#dd0000" }),
      forma("rect", { y: 13.3, width: 30, height: 6.7, fill: "#ffce00" }),
    ],
    taiwan: [
      forma("rect", { width: 30, height: 20, fill: "#fe0000" }),
      forma("rect", { width: 15, height: 10, fill: "#000095" }),
      forma("circle", { cx: 7.5, cy: 5, r: 2.6, fill: "#ffffff" }),
    ],
    japon: [
      forma("rect", { width: 30, height: 20, fill: "#ffffff" }),
      forma("circle", { cx: 15, cy: 10, r: 6, fill: "#bc002d" }),
    ],
  };
  return el(
    { width: ancho, height: alto, borderRadius: 2, overflow: "hidden", ...(cual === "japon" ? { border: `1px solid ${t.line2}` } : {}) },
    { type: "svg", props: { width: ancho, height: alto, viewBox: "0 0 30 20", children: figuras[cual] } },
  );
}

/**
 * De dónde es cada marca, tal como lo dice la plantilla del cliente. Una marca
 * que no está aquí sale sin fila de país: mejor callar que inventar origen.
 */
const ORIGEN: Record<string, { banderas: Bandera[]; pais: string; nota: string }> = {
  WINRUN: { banderas: ["china", "alemania"], pais: "CHINA", nota: "ingeniería alemana" },
  KENDA: { banderas: ["taiwan"], pais: "TAIWÁN", nota: "marca taiwanesa" },
  MAXXIS: { banderas: ["taiwan"], pais: "TAIWÁN", nota: "marca taiwanesa" },
  FALKEN: { banderas: ["japon"], pais: "JAPÓN", nota: "marca japonesa" },
};

function filaPais(brand: string, t: Tokens, bandera_: [number, number], cuerpo: number, marginTop: number): SatoriNode | null {
  const origen = ORIGEN[brand.trim().toUpperCase()];
  if (!origen) return null;
  return el({ alignItems: "center", gap: 6, marginTop },
    ...origen.banderas.map((b) => bandera(b, bandera_[0], bandera_[1], t)),
    text({ ...ANCHO(800), fontSize: cuerpo, letterSpacing: cuerpo * 0.06, color: t.txt, marginLeft: 2 }, origen.pais),
    text({ ...BARLOW(400), fontSize: 9, color: t.tenue }, "•"),
    text({ ...BARLOW(400), fontSize: 9, color: t.sub }, origen.nota),
  );
}

/**
 * La píldora blanca con el logo OFICIAL de la marca, en sus proporciones.
 * Sin logo oficial en disco cae al nombre en texto sobrio: nunca una imitación.
 */
function pildoraMarca(brand: string, t: Tokens, alto: number, altoLogo: number, anchoMax: number): SatoriNode {
  const logo = logoOficial(brand);
  const contenido = logo && logo.width > 0 && logo.height > 0
    ? (() => {
        const escala = Math.min(altoLogo / logo.height, anchoMax / logo.width);
        return img(logo.dataUri, { width: Math.round(logo.width * escala), height: Math.round(logo.height * escala) });
      })()
    : text({ ...ANCHO(900), fontSize: Math.round(altoLogo * 0.85), color: "#141416" }, brand.trim().toUpperCase());
  return el({
    alignItems: "center", height: alto, padding: `0 ${Math.round(alto * 0.5)}px`, backgroundColor: "#ffffff",
    borderRadius: 999, flexShrink: 0, ...(t.marcaBorde ? { border: `1px solid ${t.marcaBorde}` } : {}),
  }, contenido);
}

/**
 * ¿La foto trae fondo propio? Casi todas las del catálogo son JPG sobre blanco:
 * puestas en el recuadro oscuro de la maqueta salían como un cuadro blanco
 * pegado encima. Las que sí traen transparencia (PNG con canal alfa) pueden ir
 * sobre el recuadro del diseño; las otras van sobre uno blanco y liso, donde
 * su propio fondo desaparece.
 */
export function fotoConFondo(dataUri: string): boolean {
  if (dataUri.startsWith("data:image/jpeg") || dataUri.startsWith("data:image/jpg")) return true;
  if (!dataUri.startsWith("data:image/png")) return false;
  const coma = dataUri.indexOf(",");
  const cabecera = Buffer.from(dataUri.slice(coma + 1, coma + 1 + 64), "base64");
  if (cabecera.length < 26) return false;
  // Byte 25 del PNG = tipo de color: 4 y 6 traen alfa; 3 (paleta) puede traerlo.
  return cabecera[25] === 0 || cabecera[25] === 2;
}

function logoDepot(t: Tokens, alto: number): SatoriNode {
  const logo = depotLogo(t.logo);
  return logo
    ? img(logo.dataUri, { height: alto, width: Math.round(alto * DEPOT_LOGO_RATIO) })
    : text({ ...ANCHO(900), fontSize: alto * 0.6, color: t.txt }, "DEPOT TIRE");
}

// ===========================================================================
// Lo incluido: los beneficios de la tabla, con título e ícono
// ===========================================================================

interface TarjetaBeneficio { titulo: string; detalle: string; icono: Icono }

// El orden importa: gana el primero que calza. «Revisión gratuita de su
// vehículo para que ruede seguro» dice «seguro», y por eso la revisión va
// antes que el seguro contra daños.
const TIPOS_DE_BENEFICIO: Array<{ clave: RegExp; titulo: string; icono: Icono }> = [
  { clave: /instalaci/i, titulo: "INSTALACIÓN COMPLETA", icono: "rueda" },
  { clave: /revisi/i, titulo: "REVISIÓN DEL VEHÍCULO", icono: "revision" },
  { clave: /mantenimiento/i, titulo: "MANTENIMIENTO", icono: "ciclo" },
  { clave: /seguro|golpe/i, titulo: "SEGURO CONTRA DAÑOS", icono: "escudoOk" },
  { clave: /alinea|balance/i, titulo: "ALINEACIÓN Y BALANCEO", icono: "rueda" },
];

/**
 * Cada beneficio de la tabla `benefits` como tarjeta. El detalle es el texto
 * tal cual lo cargó el negocio —la pieza y el bot dicen lo mismo—; el título y
 * el ícono solo lo resumen. Un beneficio que no se reconoce sale con su propio
 * texto de título y un ícono de regalo, en vez de quedarse fuera.
 */
export function tarjetasDeBeneficios(beneficios: readonly string[] = []): TarjetaBeneficio[] {
  return beneficios
    .map((b) => stripEmoji(b))
    .filter(Boolean)
    .map((texto) => {
      const tipo = TIPOS_DE_BENEFICIO.find((t) => t.clave.test(texto));
      return tipo
        ? { titulo: tipo.titulo, detalle: texto, icono: tipo.icono }
        : { titulo: texto.toUpperCase(), detalle: "", icono: "regalo" as const };
    });
}

function cajaIcono(nombre: Icono, caja: number, tam: number, t: Tokens): SatoriNode {
  return el({
    width: caja, height: caja, flexShrink: 0, borderRadius: Math.round(caja * 0.26), backgroundColor: t.icoBg,
    border: `1px solid ${t.icoBorde}`, alignItems: "center", justifyContent: "center",
  }, icono(nombre, tam, t.icoRojo));
}

function cabeceraSeccion(titulo: string, cuerpo: number, t: Tokens, gratis: boolean, marginTop = 0): SatoriNode {
  return el({ alignItems: "center", gap: 12, marginTop },
    text({ ...ANCHO(800), fontSize: cuerpo, color: t.txt, whiteSpace: "nowrap" }, titulo),
    el({ flex: 1, height: 1, backgroundColor: t.raya }),
    gratis
      ? text({
          ...CHAKRA(700), fontSize: Math.round(cuerpo * 0.6), letterSpacing: 1.6, backgroundColor: ORO, color: "#16130a",
          borderRadius: 999, padding: `${Math.round(cuerpo * 0.25)}px ${Math.round(cuerpo * 0.75)}px`,
        }, "GRATIS")
      : null,
  );
}

/** Reparte en filas y completa la última con huecos, para que todas las columnas midan igual. */
function enFilas<T>(items: T[], porFila: number): Array<Array<T | null>> {
  const filas: Array<Array<T | null>> = [];
  for (let i = 0; i < items.length; i += porFila) {
    const fila: Array<T | null> = items.slice(i, i + porFila);
    while (fila.length < porFila && items.length > porFila) fila.push(null);
    filas.push(fila);
  }
  return filas;
}

/** Texto con una parte en negrita que igual se parte en renglones: palabra por palabra. */
function parrafo(
  partes: Array<{ texto: string; negrita?: boolean }>,
  cuerpo: number, color: string, colorNegrita: string, maxWidth: number,
): SatoriNode {
  const palabras = partes.flatMap((p) => p.texto.split(/\s+/).filter(Boolean).map((w) => ({ w, negrita: p.negrita })));
  return el({ flexWrap: "wrap", maxWidth },
    ...palabras.map(({ w, negrita }) =>
      text({
        ...BARLOW(negrita ? 700 : 400), fontSize: cuerpo, lineHeight: 1.45, marginRight: cuerpo * 0.26,
        color: negrita ? colorNegrita : color,
      }, w)),
  );
}

function especificaciones(line: PosterLine): { kg: string | null; kmh: string | null } {
  const tr = line.loadSpeedTranslation ?? "";
  return { kg: tr.match(/(\d[\d.,]*)\s*kg/i)?.[1] ?? null, kmh: tr.match(/(\d[\d.,]*)\s*km\/h/i)?.[1] ?? null };
}

function chipDisponibilidad(line: PosterLine, t: Tokens, cuerpo: number): SatoriNode | null {
  if (line.availability === "available") return null;
  const consultar = line.availability === "check";
  return text({
    ...BARLOW(700), fontSize: cuerpo, whiteSpace: "nowrap", borderRadius: 999, padding: "4px 10px",
    color: consultar ? t.ambarTxt : t.sub, backgroundColor: consultar ? t.ambarBg : t.chipBg,
    border: `1px solid ${consultar ? t.ambarBorde : t.chipBorde}`,
  }, consultar ? "Consultar disponibilidad" : "Sin stock");
}

/**
 * El sello de medida de cada tarjeta. La exacta no lleva sello —la cabecera ya
 * dice su medida—, pero la equivalente sí, y dice con todas las letras que NO
 * es su medida exacta, pegado a la razón por la que igual le sirve.
 */
function selloDeMedida(line: PosterLine, t: Tokens): SatoriNode | null {
  if (line.medidaExacta !== false) return null;
  const aro = line.sizeLabel.match(/R(\d{2})/i)?.[1];
  const [titulo, detalle] = line.medidaPorConfirmar
    ? [`${line.sizeLabel} · POR CONFIRMAR`, "Revise que su llanta diga esta medida"]
    : [`${line.sizeLabel} · LE MONTA`, `No es su medida exacta, pero le entra: ${aro ? `mismo aro ${aro}` : "es equivalente"}`];
  return el({
    flexDirection: "column", gap: 1, alignSelf: "flex-start", marginTop: 7, backgroundColor: t.ambarBg,
    border: `1.5px solid ${t.ambarBorde}`, borderRadius: 7, padding: "4px 9px",
  },
    text({ ...BARLOW(700), fontSize: 10.5, color: t.ambarTxt, whiteSpace: "nowrap" }, titulo),
    text({ ...BARLOW(600), fontSize: 9, color: t.ambarSub, whiteSpace: "nowrap" }, detalle),
  );
}

// ===========================================================================
// OPCIONES
// ===========================================================================

/** Hasta seis tarjetas: es el tope de `preparar_opciones`. */
const MAX_OPCIONES = 6;

export interface OptionsDiaNocheData {
  dateLabel: string;
  /** Lo que va en la píldora amarilla: la medida pedida, o «RIN 16» sin medida. */
  sizeLabel?: string | null;
  lines: readonly PosterLine[];
  /** Llantas del juego. Sin cantidad del cliente, el juego de 4 (la regla del bot). */
  cantidad?: number | null;
  /** false = buscó por aro o vehículo: no se habla de «su medida». */
  medidaConocida?: boolean;
  /** Beneficios vigentes de la tabla. Vacío = no hay sección de incluido. */
  benefits?: readonly string[];
}

export function optionsPosterDiaNoche(data: OptionsDiaNocheData, modo: ModoPieza): SatoriNode {
  const t = tokens(modo);
  const lines = data.lines.slice(0, MAX_OPCIONES);
  const n = Math.max(1, Math.round(data.cantidad ?? 4));
  const opciones = lines.length;
  const hayEquivalentes = lines.some((l) => l.medidaExacta === false);

  // El título cuenta las que de verdad hay, y solo promete «su medida» si todas
  // lo son: con una equivalente adentro, ese rótulo sería justo la confusión
  // que el sello viene a evitar.
  const titulo = hayEquivalentes
    ? (data.medidaConocida === false ? "OPCIONES EN SU ARO" : "OPCIONES QUE LE MONTAN")
    : `${opciones === 1 ? "UNA OPCIÓN" : `${NUMERO[opciones] ?? opciones} OPCIONES`} PARA SU MEDIDA`;

  const pcts = lines.map(porcentaje).filter((p): p is number => p !== null);
  const beneficios = tarjetasDeBeneficios(data.benefits);

  const bajada = parrafo(
    n === 1
      ? [{ texto: "El precio grande es el de" }, { texto: "1 llanta,", negrita: true }, { texto: beneficios.length ? "con IVA y lo incluido ya sumado." : "con IVA incluido." }]
      : [
          { texto: "El precio grande es el" },
          { texto: `juego completo de ${n} llantas,`, negrita: true },
          { texto: beneficios.length ? "con IVA, instalación, seguro y mantenimiento ya incluidos." : "con IVA incluido." },
        ],
    11, t.sub, t.txt, pcts.length ? 420 : 560,
  );

  const insignia = pcts.length
    ? (() => {
        const iguales = pcts.every((p) => p === pcts[0]);
        const pct = Math.max(...pcts);
        const renglon = (s: string) => text({ ...ANCHO(900), fontSize: 13, lineHeight: 1.05, color: TINTA_ORO }, s);
        return el({
          position: "relative", overflow: "hidden", alignItems: "center", gap: 10, borderRadius: 12,
          padding: "8px 16px 8px 14px", backgroundImage: ORO_GRAD, transform: "rotate(-2deg)", flexShrink: 0,
          boxShadow: "0 10px 26px rgba(185,138,30,0.38), 0 2px 6px rgba(0,0,0,0.25)",
        },
          el({
            position: "absolute", top: 0, left: 18, width: 40, height: "100%", transform: "skewX(-25deg)",
            backgroundImage: "linear-gradient(115deg, rgba(255,255,255,0.6), rgba(255,255,255,0))",
          }),
          text({ ...ANCHO(900), fontSize: 38, lineHeight: 1, letterSpacing: -1, color: TINTA_ORO }, `−${pct}%`),
          el({ flexDirection: "column" },
            renglon(iguales ? "DESCUENTO" : "HASTA"),
            renglon(iguales ? "HOY" : "DE DESCUENTO"),
            text({ ...BARLOW(700), fontSize: 10, color: "#5c430e", marginTop: 2 },
              iguales ? (opciones === 1 ? "en esta opción" : `en las ${opciones} opciones`) : "según la opción"),
          ),
        );
      })()
    : null;

  // Si una sola foto trae fondo, todas van sobre recuadro blanco: mezclar
  // recuadros blancos y oscuros en la misma lámina se ve como un error.
  const recuadroBlanco = lines.some((l) => fotoConFondo(l.photoUri));

  const tarjeta = (line: PosterLine): SatoriNode => {
    const reco = Boolean(line.recomendada);
    const juego = line.unitConIva * n;
    const pct = porcentaje(line);
    const { kg, kmh } = especificaciones(line);
    const specs = [line.loadSpeedLabel, kg ? `${kg} kg` : null, kmh ? `${kmh} km/h` : null].filter(Boolean).join(" · ");
    const chip = (ic: SatoriNode, texto: string, rojo = false) =>
      el({
        alignItems: "center", gap: 5, borderRadius: 999, padding: "4px 10px 4px 8px",
        backgroundColor: rojo ? t.chipRojoBg : t.chipBg, border: `1px solid ${rojo ? t.chipRojoBorde : t.chipBorde}`,
      },
        ic,
        text({ ...BARLOW(600), fontSize: 8.5, color: rojo ? t.chipRojoTxt : t.chipTxt, whiteSpace: "nowrap" }, texto),
      );
    const montoJuego = dinero(juego);

    return el({
      alignItems: "stretch", borderRadius: 14, minHeight: 196, padding: "14px 14px 14px 16px",
      border: `${t.bordeAncho}px solid ${reco ? t.recoBorde : t.borde}`,
      backgroundImage: reco ? t.reco : t.card, ...sombra(reco ? t.recoSombra : t.sombra),
    },
      // Foto
      el({
        width: 131, flexShrink: 0, borderRadius: 12, position: "relative", overflow: "hidden",
        alignItems: "center", justifyContent: "center",
        ...(recuadroBlanco ? { backgroundColor: "#ffffff", border: `1px solid ${t.line}` } : { backgroundImage: t.foto }),
      },
        recuadroBlanco
          ? null
          : el({ position: "absolute", bottom: 18, left: 28, width: 76, height: 12, borderRadius: "50%", backgroundColor: t.fotoSombra }),
        img(line.photoUri, { width: 112, height: 136, objectFit: "contain" }),
      ),

      // Identidad
      el({ flex: 1, minWidth: 0, flexDirection: "column", justifyContent: "center", padding: "6px 0 0 16px" },
        el({ alignItems: "center", gap: 8 },
          pildoraMarca(line.brand, t, 24, 15, 96),
          reco
            ? el({ alignItems: "center", gap: 4, backgroundColor: ROJO, borderRadius: 999, padding: "4px 9px" },
                icono("estrella", 8, "#ffffff"),
                text({ ...CHAKRA(700), fontSize: 7.5, letterSpacing: 1.2, color: "#ffffff", whiteSpace: "nowrap" }, "RECOMENDADA"))
            : line.tag
              ? text({
                  ...CHAKRA(600), fontSize: 7.5, letterSpacing: 1.2, color: t.tagTxt, whiteSpace: "nowrap",
                  border: `1px solid ${t.line2}`, borderRadius: 999, padding: "4px 9px",
                }, line.tag.toUpperCase())
              : null,
        ),
        text({ ...ANCHO(800), fontSize: 23, lineHeight: 1.05, marginTop: 10, color: t.txt }, line.design.toUpperCase()),
        filaPais(line.brand, t, [16, 11], 12.5, 8),
        specs ? text({ ...BARLOW(400), fontSize: 9.5, color: t.sub, marginTop: 9 }, specs) : null,
        selloDeMedida(line, t),
        el({ gap: 7, marginTop: 7, flexWrap: "wrap" },
          line.golpesMeses ? chip(icono("escudo", 10, t.icoRojo), `${line.golpesMeses} meses de seguro`, reco) : null,
          chip(icono("medalla", 10, t.icoOro), `${line.fabricaAnios} años de fábrica`),
          chipDisponibilidad(line, t, 8.5),
        ),
        line.posicionamiento
          ? text({ ...BARLOW(400), fontSize: 9.5, lineHeight: 1.37, color: t.tenue, marginTop: 9, maxWidth: 290 }, line.posicionamiento)
          : null,
      ),

      // Precio
      el({
        width: 196, flexShrink: 0, borderLeft: `1px solid ${t.line}`, flexDirection: "column",
        alignItems: "flex-end", justifyContent: "center", paddingLeft: 12,
      },
        // La cantidad en grande: es el dato que cambia el total.
        el({
          alignItems: "center", gap: 6, borderRadius: 999, padding: "3px 12px 3px 10px",
          border: `1.5px solid ${reco ? ROJO : t.juegoBorde}`, ...(reco ? { backgroundColor: ROJO } : {}),
        },
          n > 1 ? text({ ...CHAKRA(700), fontSize: 9, letterSpacing: 1.1, color: reco ? "#ffd3d2" : t.juegoLbl }, "JUEGO DE") : null,
          text({ ...ANCHO(900), fontSize: 20, lineHeight: 1, color: reco ? "#ffffff" : t.txt }, String(n)),
          text({ ...CHAKRA(700), fontSize: 11, letterSpacing: 1.3, color: reco ? "#ffffff" : t.txt }, n === 1 ? "LLANTA" : "LLANTAS"),
        ),
        text({
          ...ANCHO(800), fontSize: cuerpoQueCabe(montoJuego, reco ? 40 : 33, 184), lineHeight: 1, marginTop: 9,
          letterSpacing: -0.3, color: t.txt,
        }, montoJuego),
        // El precio por llanta con cifra propia (Manuel, 12-sep: «que se note más»).
        n > 1
          ? el({
              alignItems: "baseline", gap: 5, marginTop: 8, padding: "3px 10px 4px", borderRadius: 8,
              backgroundColor: t.chipBg, border: `1px solid ${t.chipBorde}`,
            },
              text({ ...ANCHO(800), fontSize: 19, lineHeight: 1.1, letterSpacing: -0.2, color: t.txt }, dinero(line.unitConIva)),
              text({ ...BARLOW(600), fontSize: 11, color: t.sub }, "por llanta"),
            )
          : null,
        pct !== null && line.pvpConIva
          ? el({ alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 7, marginTop: 7 },
              text({ ...BARLOW(500), fontSize: 10.5, color: t.tenue, textDecoration: "line-through" }, dinero(line.pvpConIva * n)),
              el({
                alignItems: "center", gap: 3, backgroundImage: ORO_GRAD, borderRadius: 6, padding: "4px 8px",
                boxShadow: "0 4px 12px rgba(185,138,30,0.35)",
              },
                text({ ...ANCHO(900), fontSize: 11, color: TINTA_ORO }, `−${pct}%`),
                text({ ...BARLOW(700), fontSize: 10, color: TINTA_ORO, whiteSpace: "nowrap" },
                  `· ahorra ${dinero((line.pvpConIva - line.unitConIva) * n)}`),
              ),
            )
          : null,
        text({ ...BARLOW(400), fontSize: 9, color: t.tenue, marginTop: 6 }, `o 6 cuotas de ${dinero(juego / 6)}`),
      ),
    );
  };

  const incluye = beneficios.length
    ? el({
        flexDirection: "column", marginTop: 14, borderRadius: 14, padding: "18px 20px 22px",
        border: `${t.bordeAncho}px solid ${t.borde}`, backgroundImage: t.panel, ...sombra(t.sombra),
      },
        cabeceraSeccion(
          opciones <= 1 ? "INCLUYE, SIN COSTO" : opciones <= 3 ? `LAS ${NUMERO[opciones]} INCLUYEN, SIN COSTO` : "TODAS INCLUYEN, SIN COSTO",
          17, t, true,
        ),
        ...enFilas(beneficios, 4).map((fila, i) =>
          el({ gap: 16, marginTop: i === 0 ? 16 : 18 },
            ...fila.map((b) => b
              ? el({ flex: 1, minWidth: 0, flexDirection: "column" },
                  cajaIcono(b.icono, 34, 17, t),
                  text({ ...ARCHIVO, fontSize: 13, lineHeight: 1.2, marginTop: 11, color: t.txt }, b.titulo),
                  b.detalle ? text({ ...BARLOW(400), fontSize: 11.5, lineHeight: 1.3, marginTop: 6, color: t.incP }, b.detalle) : null,
                )
              : el({ flex: 1 })),
          )),
      )
    : null;

  return el({
    flexDirection: "column", width: DIA_NOCHE_ANCHO.opciones, padding: "28px 28px 22px",
    backgroundColor: t.bg,
    backgroundImage: `radial-gradient(420px 260px at 38% 0%, ${t.glow1}, transparent 70%), radial-gradient(260px 220px at 100% 6%, ${t.glow2}, transparent 70%)`,
    fontFamily: "DN Barlow", color: t.txt,
  },
    el({ justifyContent: "space-between", alignItems: "center", height: 40 },
      logoDepot(t, 36),
      el({ alignItems: "center", gap: 12 },
        text({ ...BARLOW(400), fontSize: 10, color: t.sub }, data.dateLabel),
        data.sizeLabel
          ? text({ ...ANCHO(800), fontSize: 12.5, backgroundColor: ORO, color: "#16130a", borderRadius: 999, padding: "6px 14px" }, data.sizeLabel)
          : null,
      ),
    ),
    text({ ...ARCHIVO, fontSize: 30, lineHeight: 1, letterSpacing: -0.2, marginTop: 20, color: t.txt, whiteSpace: "nowrap" }, titulo),
    el({ justifyContent: "space-between", alignItems: "center", marginTop: 4, gap: 16 }, bajada, insignia),
    el({ flexDirection: "column", gap: 13, marginTop: 20 }, ...lines.map(tarjeta)),
    hayEquivalentes
      ? el({
          alignItems: "center", gap: 12, marginTop: 14, padding: "12px 16px", borderRadius: 12,
          backgroundColor: t.ambarBg, border: `1.5px solid ${t.ambarBorde}`,
        },
          text({ ...ANCHO(900), fontSize: 12, color: t.ambarTxt, whiteSpace: "nowrap" },
            data.medidaConocida === false ? "FALTA SU MEDIDA" : "LE MONTAN"),
          text({ ...BARLOW(500), fontSize: 10.5, lineHeight: 1.4, color: t.ambarSub, flex: 1 },
            data.medidaConocida === false
              ? "Estas son del aro que usted pidió, en distintas medidas. Para dejarle la exacta, mándeme la medida del costado de su llanta o confírmela con el asesor."
              : "Las marcadas «LE MONTA» no son su medida exacta, pero le entran: tienen el mismo aro y rinden igual de bien. Confírmelas con el asesor antes de comprar."),
        )
      : null,
    incluye,
    el({ justifyContent: "space-between", marginTop: 16 },
      text({ ...BARLOW(400), fontSize: 9, color: t.sub }, "Precios con IVA y Ecovalor · 3 y 6 meses sin intereses con tarjeta de crédito"),
      text({ ...BARLOW(400), fontSize: 9, color: t.sub }, "Cumbayá · Quito Sur · desde 1996"),
    ),
  );
}

// ===========================================================================
// COTIZACIÓN
// ===========================================================================

export interface QuoteDiaNocheData {
  number: string;
  dateLabel: string;
  line: PosterLine;
  /** Total firmado de la cotización (el mismo del PDF y del texto). */
  total: number;
  /** Descuento extra autorizado por el dueño, aparte del precio de lista. */
  discountAmount?: number | null;
  discountCondition?: string | null;
  expiresLabel?: string | null;
  benefits?: readonly string[];
}

export function quotePosterDiaNoche(data: QuoteDiaNocheData, modo: ModoPieza): SatoriNode {
  const t = tokens(modo);
  const line = data.line;
  const n = Math.max(1, Math.round(line.quantity || 1));
  const pct = porcentaje(line);
  const { kg, kmh } = especificaciones(line);
  const marca = capitalizar(line.brand);
  const beneficios = tarjetasDeBeneficios(data.benefits);
  const panel = (extra: Record<string, unknown>, ...hijos: Parameters<typeof el>[1][]) =>
    el({ border: `${t.bordeAncho}px solid ${t.borde}`, borderRadius: 14, backgroundImage: t.card, ...sombra(t.sombra), ...extra }, ...hijos);
  const pildoraCantidad = (cuerpoNum: number, cuerpoTxt: number, estilo: Record<string, unknown>, color: string) =>
    el({ alignItems: "center", gap: 6, borderRadius: 999, ...estilo },
      text({ ...ANCHO(900), fontSize: cuerpoNum, lineHeight: 1.05, color }, String(n)),
      text({ ...CHAKRA(700), fontSize: cuerpoTxt, letterSpacing: 1.4, color }, n === 1 ? "LLANTA" : "LLANTAS"),
    );
  const disenio = line.design.toUpperCase();
  const cuerpoModelo = disenio.length <= 6 ? 54 : disenio.length <= 9 ? 42 : disenio.length <= 13 ? 32 : 26;
  const total = dinero(data.total);

  const fechaTexto = `${data.dateLabel}${data.expiresLabel ? ` · válida hasta ${data.expiresLabel}` : ""}`;
  // Sin seguro contra golpes la tarjeta grande ya es la garantía de fábrica:
  // no se repite en las chicas.
  const minis: Array<{ ic: Icono; cifra: string; texto: string }> = [
    ...(line.golpesMeses ? [{ ic: "medalla" as const, cifra: `${line.fabricaAnios} años`, texto: `Garantía de fábrica ${marca}` }] : []),
    { ic: "local", cifra: "30 años", texto: "Depot Tire en Quito, desde 1996" },
  ];

  return el({
    flexDirection: "column", width: DIA_NOCHE_ANCHO.cotizacion, padding: "26px 25px 20px",
    backgroundColor: t.bg, backgroundImage: `radial-gradient(300px 260px at 100% 0%, ${t.glow1}, transparent 70%)`,
    fontFamily: "DN Barlow", color: t.txt,
  },
    // Encabezado
    el({ justifyContent: "space-between", alignItems: "center", height: 36 },
      logoDepot(t, 32),
      el({ alignItems: "center", gap: 10 },
        text({ ...BARLOW(400), fontSize: 8.5, color: t.sub }, fechaTexto),
        text({
          ...CHAKRA(600), fontSize: 9.5, letterSpacing: 0.6, color: t.cotTxt, border: `1px solid ${t.cotBorde}`,
          borderRadius: 999, padding: "5px 11px",
        }, data.number),
      ),
    ),

    // Héroe
    el({
      alignItems: "center", marginTop: 16, minHeight: 262, padding: "12px 20px 12px 22px", borderRadius: 14,
      border: `${t.bordeAncho}px solid ${t.borde}`, backgroundImage: t.hero, ...sombra(t.sombra),
    },
      fotoConFondo(line.photoUri)
        // Foto con fondo propio: recuadro blanco liso, donde ese fondo se funde.
        ? el({
            width: 238, height: 238, flexShrink: 0, borderRadius: 12, overflow: "hidden", backgroundColor: "#ffffff",
            border: `1px solid ${t.line}`, alignItems: "center", justifyContent: "center",
          }, img(line.photoUri, { width: 226, height: 226, objectFit: "contain" }))
        : el({ width: 238, height: 238, flexShrink: 0, position: "relative", alignItems: "center", justifyContent: "center" },
            el({ position: "absolute", bottom: 8, left: 44, width: 150, height: 20, borderRadius: "50%", backgroundColor: t.fotoSombra }),
            img(line.photoUri, { width: 228, height: 238, objectFit: "contain" }),
          ),
      el({ flex: 1, minWidth: 0, flexDirection: "column", paddingLeft: 26 },
        el({}, pildoraMarca(line.brand, t, 27, 17, 110)),
        text({ ...ANCHO(800), fontSize: cuerpoModelo, lineHeight: 0.95, letterSpacing: -0.5, marginTop: 10, color: t.txt }, disenio),
        el({ gap: 7, marginTop: 13 },
          text({ ...ANCHO(800), fontSize: 12.5, backgroundColor: ORO, color: "#16130a", borderRadius: 999, padding: "6px 13px" }, line.sizeLabel),
          line.loadSpeedLabel
            ? text({ ...ANCHO(800), fontSize: 12, border: `1px solid ${t.cargaBorde}`, borderRadius: 999, padding: "6px 11px", color: t.txt }, line.loadSpeedLabel)
            : null,
        ),
        filaPais(line.brand, t, [20, 13], 14, 10),
        kg || kmh
          ? text({ ...BARLOW(400), fontSize: 9.5, color: t.sub, marginTop: 8 },
              [kg ? `${kg} kg de carga máxima` : null, kmh ? `${kmh} km/h` : null].filter(Boolean).join(" · "))
          : null,
        el({ alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" },
          // La cantidad en grande, en vez de «4 unidades cotizadas» en letra chica.
          pildoraCantidad(22, 11.5, { border: `2px solid ${t.cantBorde}`, padding: "3px 14px 3px 12px" }, t.txt),
          line.availability === "available"
            ? el({
                alignItems: "center", gap: 6, borderRadius: 999, padding: "5px 11px",
                backgroundColor: t.verdeBg, border: `1px solid ${t.verdeBorde}`,
              },
                el({ width: 6, height: 6, borderRadius: 999, backgroundColor: t.verde }),
                text({ ...BARLOW(600), fontSize: 9.5, color: t.verde }, "Disponible"),
              )
            : chipDisponibilidad(line, t, 9.5),
        ),
      ),
    ),

    // Precios
    el({ gap: 11, marginTop: 12 },
      panel({ width: 272, flexShrink: 0, minHeight: 150, flexDirection: "column", padding: "17px 17px 14px" },
        text({ ...CHAKRA(700), fontSize: 10.5, letterSpacing: 1.7, color: t.txt }, "PRECIO POR LLANTA"),
        text({ ...ANCHO(800), fontSize: cuerpoQueCabe(dinero(line.unitConIva), 42, 236), lineHeight: 1, marginTop: 8, letterSpacing: -0.5, color: t.txt }, dinero(line.unitConIva)),
        text({ ...BARLOW(400), fontSize: 9, color: t.tenue, marginTop: 6 }, "IVA y Ecovalor incluidos"),
        pct !== null && line.pvpConIva
          ? el({ alignItems: "center", justifyContent: "space-between", marginTop: 12 },
              el({ flexDirection: "column" },
                text({ ...CHAKRA(700), fontSize: 8, letterSpacing: 1.6, color: t.tenue }, "ANTES"),
                text({ ...ARCHIVO, fontSize: 16, color: t.antes, textDecoration: "line-through" }, dinero(line.pvpConIva)),
              ),
              el({
                position: "relative", overflow: "hidden", alignItems: "center", gap: 8, borderRadius: 10,
                padding: "6px 12px 6px 10px", backgroundImage: ORO_GRAD, transform: "rotate(-2deg)",
                boxShadow: "0 8px 20px rgba(185,138,30,0.38), 0 2px 6px rgba(0,0,0,0.2)",
              },
                el({
                  position: "absolute", top: 0, left: 12, width: 30, height: "100%", transform: "skewX(-25deg)",
                  backgroundImage: "linear-gradient(115deg, rgba(255,255,255,0.6), rgba(255,255,255,0))",
                }),
                text({ ...ANCHO(900), fontSize: 24, lineHeight: 1, color: TINTA_ORO }, `−${pct}%`),
                el({ flexDirection: "column" },
                  text({ ...BARLOW(700), fontSize: 9.5, lineHeight: 1.15, color: "#5c430e" }, "ahorra"),
                  text({ ...BARLOW(700), fontSize: 11, lineHeight: 1.15, color: TINTA_ORO }, `${dinero(line.pvpConIva - line.unitConIva)} c/u`),
                ),
              ),
            )
          : null,
      ),
      el({
        flex: 1, minHeight: 150, flexDirection: "column", borderRadius: 14, padding: "17px 17px 14px", color: "#ffffff",
        backgroundImage: "radial-gradient(220px 140px at 85% 10%, rgba(255,120,110,0.35), transparent 70%), linear-gradient(135deg, #ea3a36, #c81e24 70%, #b3171e)",
        boxShadow: "0 10px 30px rgba(229,44,42,0.25)",
      },
        el({ alignItems: "center", gap: 10 },
          text({ ...CHAKRA(700), fontSize: 10.5, letterSpacing: 1.7, color: "rgba(255,255,255,0.9)" }, "TOTAL"),
          pildoraCantidad(17, 10, { backgroundColor: "#ffffff", padding: "2px 11px 2px 9px" }, "#c81e24"),
        ),
        text({ ...ANCHO(800), fontSize: cuerpoQueCabe(total, 48, 278), lineHeight: 1, marginTop: 10, letterSpacing: -0.5, color: "#ffffff" }, total),
        pct !== null && line.pvpConIva
          ? text({ ...BARLOW(700), fontSize: 10, marginTop: 8, color: "#ffffff" },
              `Ahorra ${dinero((line.pvpConIva - line.unitConIva) * n)} en ${n === 1 ? "su llanta" : "el juego completo"}`)
          : null,
        el({ alignItems: "center", gap: 6, marginTop: 9, flexWrap: "wrap" },
          ...[3, 6].map((cuotas) =>
            text({ ...BARLOW(600), fontSize: 9, color: "#ffffff", backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 999, padding: "4px 9px" },
              `${cuotas} cuotas de ${dinero(data.total / cuotas)}`)),
          text({ ...BARLOW(400), fontSize: 9, color: "#ffffff" }, "sin intereses"),
        ),
      ),
    ),

    // Descuento adicional autorizado por el dueño
    data.discountAmount && data.discountAmount > 0
      ? el({
          alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, padding: "10px 16px",
          borderRadius: 12, backgroundImage: ORO_GRAD, boxShadow: "0 8px 20px rgba(185,138,30,0.3)",
        },
          el({ alignItems: "center", gap: 10 },
            text({ ...ANCHO(900), fontSize: 22, color: TINTA_ORO }, `−${dinero(data.discountAmount)}`),
            text({ ...BARLOW(700), fontSize: 11, color: "#3a2c08" }, `adicionales ${data.discountCondition ?? ""}`.trim()),
          ),
          text({ ...BARLOW(600), fontSize: 9.5, color: "#5c430e" },
            `${data.expiresLabel ? `Válida hasta el ${data.expiresLabel} · ` : ""}presente ${data.number}`),
        )
      : null,

    // Respaldo
    cabeceraSeccion("SU COMPRA ESTÁ RESPALDADA", 14, t, false, 24),
    el({ gap: 10, marginTop: 12 },
      el({
        width: 377, flexShrink: 0, minHeight: 143, alignItems: "center", gap: 18, padding: "14px 20px", borderRadius: 14,
        border: `${t.bordeAncho}px solid ${t.seguroBorde}`, backgroundImage: t.seguro, ...sombra(t.sombra),
      },
        el({
          width: 40, height: 40, flexShrink: 0, borderRadius: 10, alignItems: "center", justifyContent: "center",
          backgroundImage: "linear-gradient(135deg, #f0413b, #c81e24)", boxShadow: "0 6px 16px rgba(229,44,42,0.35)",
        }, icono(line.golpesMeses ? "escudoOk" : "medalla", 18, "#ffffff")),
        el({ flexDirection: "column", flex: 1 },
          el({ alignItems: "baseline", gap: 7 },
            text({ ...ANCHO(800), fontSize: 32, lineHeight: 1, color: t.txt }, String(line.golpesMeses ?? line.fabricaAnios)),
            text({ ...BARLOW(600), fontSize: 13, color: t.seguroOro }, line.golpesMeses ? "meses de seguro" : "años de garantía"),
          ),
          text({ ...ANCHO(800), fontSize: 13.5, marginTop: 6, color: t.txt },
            line.golpesMeses ? "GRATIS, INCLUIDO EN EL PRECIO" : "GARANTÍA DE FÁBRICA"),
          text({ ...BARLOW(400), fontSize: 8.5, lineHeight: 1.47, color: t.sub, marginTop: 8, maxWidth: 250 },
            line.golpesMeses
              ? "Cubre golpes, cortes o cualquier daño que sufra la llanta. Sin costo adicional para usted."
              : `Garantía de fábrica ${marca} contra defectos de fabricación.`),
        ),
      ),
      el({ flex: 1, flexDirection: "column", gap: 10 },
        ...minis.map((m) =>
          el({
            flex: 1, minHeight: 66, alignItems: "center", gap: 12, padding: "0 14px", borderRadius: 14,
            border: `${t.bordeAncho}px solid ${t.borde}`, backgroundImage: t.card, ...sombra(t.sombra),
          },
            el({
              width: 26, height: 26, flexShrink: 0, borderRadius: 7, alignItems: "center", justifyContent: "center",
              backgroundColor: t.icoOroBg, border: `1px solid ${t.icoOroBorde}`,
            }, icono(m.ic, 12, t.icoOro)),
            el({ flexDirection: "column" },
              text({ ...ANCHO(800), fontSize: 15, color: t.txt }, m.cifra),
              text({ ...BARLOW(400), fontSize: 8, color: t.sub, marginTop: 3 }, m.texto),
            ),
          )),
      ),
    ),

    // Incluido sin costo — con letra grande (Manuel, 12-sep: «no se lee»)
    beneficios.length ? cabeceraSeccion("INCLUIDO SIN COSTO", 19, t, true, 24) : null,
    ...enFilas(beneficios, 2).map((fila, i) =>
      el({ gap: 10, marginTop: i === 0 ? 14 : 10 },
        ...fila.map((b) => b
          ? panel({ flex: 1, minWidth: 0, flexDirection: "column", padding: "18px 18px 20px" },
              cajaIcono(b.icono, 40, 20, t),
              text({ ...ARCHIVO, fontSize: 17, lineHeight: 1.2, marginTop: 14, color: t.txt }, b.titulo),
              b.detalle ? text({ ...BARLOW(400), fontSize: 14, lineHeight: 1.36, marginTop: 7, color: t.incP }, b.detalle) : null,
            )
          : el({ flex: 1 })),
      )),

    el({ justifyContent: "space-between", marginTop: 16, paddingTop: 12, borderTop: `1px solid ${t.line}` },
      text({ ...BARLOW(400), fontSize: 8.5, color: t.sub }, "Efectivo, tarjeta y transferencia · 3 y 6 meses sin intereses con tarjeta de crédito"),
      text({ ...BARLOW(600), fontSize: 8.5, color: t.pieB }, "Cumbayá · Quito Sur"),
    ),
  );
}
