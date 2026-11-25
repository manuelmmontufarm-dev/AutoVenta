/**
 * EL TEMA DE LA PIEZA (Manuel, 24-nov-2026): «que también puedas elegir la
 * template de cómo sale, tipo que salga con promo de Black Friday o la de
 * Navidad… o una editable que puedan cambiar todo lo que quieran».
 *
 * Un tema es una CINTA de color con título y bajada que va arriba de la
 * cotización y de las opciones (y por eso también en el PDF, que es la misma
 * imagen). Es solo apariencia: no toca un solo precio. Las promociones siguen
 * en la pestaña Promociones; el tema es cómo se viste la pieza.
 *
 *   automatico   como siempre: sin cinta; la franja del Black Friday sale sola
 *                cuando la promo corre (domain/promocionDeTemporada.ts).
 *   ninguno      sin cinta.
 *   <temporada>  uno de los temas listos (Navidad, Año Nuevo, Día de la Madre…).
 *   personalizado título, bajada, colores y adorno a gusto del negocio.
 *
 * Puro: sin base ni render. Ajustes lo guarda en `pieces_config.tema`.
 */

export const TEMAS = [
  "automatico", "ninguno",
  "blackFriday", "cyberMonday", "navidad", "anioNuevo", "sanValentin", "diaDeLaMadre",
  "diaDelPadre", "vacaciones", "regresoAClases", "aniversario", "liquidacion",
  "personalizado",
] as const;
export type TemaId = (typeof TEMAS)[number];

/** Lo que se dibuja detrás del título: rayas en diagonal, puntos (nieve, confeti) o nada. */
export const ADORNOS = ["rayas", "puntos", "ninguno"] as const;
export type Adorno = (typeof ADORNOS)[number];

export type DisenoDeTema = {
  /** «FELIZ NAVIDAD»: va en mayúsculas, grande. */
  titulo: string;
  /** «Llantas nuevas para el viaje de fin de año»: chica, al lado o debajo. */
  bajada: string;
  /** Color de la cinta, del texto y del detalle (hex #rrggbb). */
  fondo: string;
  texto: string;
  acento: string;
  adorno: Adorno;
};

export const TITULO_MAXIMO = 30;
export const BAJADA_MAXIMA = 60;
const HEX = /^#[0-9a-f]{6}$/i;

/** Los temas listos. El negocio los puede copiar a «personalizado» y cambiarles todo. */
export const TEMAS_LISTOS: Record<Exclude<TemaId, "automatico" | "ninguno" | "personalizado">, { nombre: string; diseno: DisenoDeTema }> = {
  blackFriday: {
    nombre: "Black Friday",
    diseno: { titulo: "BLACK FRIDAY", bajada: "Precios que no vuelven", fondo: "#0b0b0d", texto: "#ffffff", acento: "#ffc93c", adorno: "rayas" },
  },
  cyberMonday: {
    nombre: "Cyber Monday",
    diseno: { titulo: "CYBER MONDAY", bajada: "Cotice por WhatsApp y ahorre", fondo: "#101a3d", texto: "#ffffff", acento: "#28d7ff", adorno: "rayas" },
  },
  navidad: {
    nombre: "Navidad",
    diseno: { titulo: "FELIZ NAVIDAD", bajada: "Llantas nuevas para el viaje de fin de año", fondo: "#a3141c", texto: "#ffffff", acento: "#f4d27a", adorno: "puntos" },
  },
  anioNuevo: {
    nombre: "Año Nuevo",
    diseno: { titulo: "FELIZ AÑO NUEVO", bajada: "Arranque el año con llantas nuevas", fondo: "#0e1530", texto: "#ffffff", acento: "#e9c46a", adorno: "puntos" },
  },
  sanValentin: {
    nombre: "San Valentín",
    diseno: { titulo: "MES DEL AMOR", bajada: "Cuide a quien viaja con usted", fondo: "#c2185b", texto: "#ffffff", acento: "#ffd1dc", adorno: "puntos" },
  },
  diaDeLaMadre: {
    nombre: "Día de la Madre",
    diseno: { titulo: "DÍA DE LA MADRE", bajada: "Para que mamá maneje segura", fondo: "#8e3b7a", texto: "#ffffff", acento: "#ffd6ec", adorno: "puntos" },
  },
  diaDelPadre: {
    nombre: "Día del Padre",
    diseno: { titulo: "DÍA DEL PADRE", bajada: "El regalo que sí va a usar", fondo: "#123b5c", texto: "#ffffff", acento: "#7cc4ff", adorno: "rayas" },
  },
  vacaciones: {
    nombre: "Vacaciones",
    diseno: { titulo: "SALGA DE VACACIONES", bajada: "Revise sus llantas antes de viajar", fondo: "#0b7a75", texto: "#ffffff", acento: "#ffd166", adorno: "rayas" },
  },
  regresoAClases: {
    nombre: "Regreso a clases",
    diseno: { titulo: "REGRESO A CLASES", bajada: "Llantas seguras para el recorrido diario", fondo: "#1d4ed8", texto: "#ffffff", acento: "#facc15", adorno: "puntos" },
  },
  aniversario: {
    nombre: "Aniversario",
    diseno: { titulo: "ANIVERSARIO", bajada: "Gracias por confiar en nosotros", fondo: "#1f1f1f", texto: "#ffffff", acento: "#d4af37", adorno: "puntos" },
  },
  liquidacion: {
    nombre: "Liquidación",
    diseno: { titulo: "LIQUIDACIÓN", bajada: "Últimas unidades", fondo: "#e5242a", texto: "#ffffff", acento: "#ffe14d", adorno: "rayas" },
  },
};

/** Con qué arranca el personalizado: una cinta neutra, para que el negocio la llene. */
export const PERSONALIZADO_INICIAL: DisenoDeTema = {
  titulo: "PROMOCIÓN ESPECIAL", bajada: "", fondo: "#111111", texto: "#ffffff", acento: "#ffc93c", adorno: "rayas",
};

export type ConfigDeTema = {
  id: TemaId;
  personalizado: DisenoDeTema;
};

export const TEMA_INICIAL: ConfigDeTema = { id: "automatico", personalizado: PERSONALIZADO_INICIAL };

/** El nombre del tema para el panel. */
export function nombreDelTema(id: TemaId): string {
  if (id === "automatico") return "Automático";
  if (id === "ninguno") return "Sin tema";
  if (id === "personalizado") return "Personalizado";
  return TEMAS_LISTOS[id].nombre;
}

/** Limpia un diseño que viene del panel: textos recortados, colores válidos o los del inicial. */
export function disenoLimpio(crudo: Partial<DisenoDeTema> | null | undefined, base: DisenoDeTema = PERSONALIZADO_INICIAL): DisenoDeTema {
  const c = crudo ?? {};
  const texto = (v: unknown, max: number, porDefecto: string) =>
    typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : porDefecto;
  const color = (v: unknown, porDefecto: string) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : porDefecto);
  return {
    titulo: texto(c.titulo, TITULO_MAXIMO, base.titulo),
    bajada: texto(c.bajada, BAJADA_MAXIMA, base.bajada),
    fondo: color(c.fondo, base.fondo),
    texto: color(c.texto, base.texto),
    acento: color(c.acento, base.acento),
    adorno: (ADORNOS as readonly string[]).includes(String(c.adorno)) ? (c.adorno as Adorno) : base.adorno,
  };
}

/**
 * La cinta que lleva la pieza, o null si no lleva. `hayFranjaDeTemporada`: la
 * pieza ya trae la franja del Black Friday con su cuenta; un tema Black Friday
 * encima diría lo mismo dos veces, así que en ese caso no va.
 */
export function cintaDelTema(
  tema: Partial<ConfigDeTema> | null | undefined,
  opciones: { hayFranjaDeTemporada?: boolean } = {},
): DisenoDeTema | null {
  const id = (TEMAS as readonly string[]).includes(String(tema?.id)) ? (tema!.id as TemaId) : "automatico";
  if (id === "automatico" || id === "ninguno") return null;
  if (id === "blackFriday" && opciones.hayFranjaDeTemporada) return null;
  const diseno = id === "personalizado" ? disenoLimpio(tema?.personalizado) : TEMAS_LISTOS[id].diseno;
  return diseno.titulo || diseno.bajada ? diseno : null;
}
