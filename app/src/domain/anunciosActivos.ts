import { z } from "zod";
import type { Anuncio } from "./anuncio.js";

/**
 * LOS ANUNCIOS QUE CORREN, CONTADOS POR EL NEGOCIO (26-oct-2026).
 *
 * El título que manda Meta casi siempre es «Depot Tire» y el link del anuncio
 * no se puede leer (facebook/instagram piden login: ver `linkPreview.ts`). La
 * única fuente fiable de qué muestra «la llanta del anuncio» es lo que Depot
 * escribe en Ajustes. Joaquín, 14-sep (conv 20527): el anuncio era de la Kenda
 * Klever KR601 —camioneta— y el cliente recibió llantas de auto porque el bot
 * no sabía qué anuncio era.
 *
 * Puro: la fecha («hoy», YYYY-MM-DD en Guayaquil) la pone quien llama.
 */
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const AnuncioActivoSchema = z.object({
  id: z.string().trim().min(1).max(40),
  /** Opcional: sirve para reconocer de cuál anuncio viene el chat, no se lee. */
  link: z.string().max(300).nullish().transform((v) => v?.trim() || null),
  descripcion: z.string().trim()
    .min(10, "Cuenta qué muestra el anuncio (mínimo 10 caracteres)")
    .max(400, "La descripción es muy larga (máximo 400 caracteres)"),
  activo: z.boolean().default(true),
  /** Último día vigente (inclusive). Null = sin fin. */
  hasta: z.string().regex(FECHA, "La fecha debe ser AAAA-MM-DD").nullish().transform((v) => v || null),
});
export type AnuncioActivo = z.infer<typeof AnuncioActivoSchema>;

export const MAX_ANUNCIOS_ACTIVOS = 20;
export const AnunciosActivosSchema = z.array(AnuncioActivoSchema).max(MAX_ANUNCIOS_ACTIVOS, "Máximo 20 anuncios");

/** Los que están encendidos y no han vencido (`hasta` vale ese mismo día). */
export function vigentes(lista: AnuncioActivo[], hoy: string): AnuncioActivo[] {
  return lista.filter((a) => a.activo && (!a.hasta || a.hasta >= hoy));
}

/** Quita lo vencido hace más de `dias` días: la lista no crece para siempre. */
export function podarVencidos(lista: AnuncioActivo[], hoy: string, dias = 30): AnuncioActivo[] {
  const limite = new Date(`${hoy}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() - dias);
  const corte = limite.toISOString().slice(0, 10);
  return lista.filter((a) => !a.hasta || a.hasta >= corte);
}

const normalizarLink = (url: string): string =>
  url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");

/**
 * ¿El anuncio que trajo al chat es este? Por `sourceId` contenido en el link
 * (gana: es el id real de Meta) o por link normalizado igual a la `url` del
 * referral. Sin link cargado no hay cómo saberlo.
 */
export function coincide(activo: AnuncioActivo, referral: Anuncio | null): boolean {
  if (!referral || !activo.link) return false;
  if (referral.sourceId && activo.link.includes(referral.sourceId)) return true;
  return Boolean(referral.url) && normalizarLink(activo.link) === normalizarLink(referral.url!);
}

/**
 * El hecho para el vendedor y el Guardián. Null si no hay anuncios vigentes
 * (el prompt no crece). `lista` ya viene filtrada por `vigentes`, pero se
 * vuelve a respetar el interruptor por si alguien la pasa cruda.
 */
export function hechoDeAnunciosActivos(lista: AnuncioActivo[], referral: Anuncio | null): string | null {
  const activos = lista.filter((a) => a.activo);
  if (activos.length === 0) return null;
  const enumerados = activos.map((a, i) => `${i + 1}) ${a.descripcion}`).join(" ");
  const cual = activos.findIndex((a) => coincide(a, referral));
  const regla = cual >= 0
    ? `El cliente llegó por el anuncio ${cual + 1}: si dice «la del anuncio», «esa llanta» o «la de la foto», es la de esa descripción; búscala por ese modelo y tipo en la medida o aro que él diga, sin preguntarle cuál.`
    : activos.length === 1
      ? "Si el cliente dice «la llanta del anuncio», «la del anuncio» o «la de la foto» sin nombrar otra, es la de esa descripción: búscala por ese modelo y tipo en la medida o aro que él diga, sin preguntarle cuál."
      : "Si el cliente dice «la del anuncio» y no sabes cuál de estos es, pregunta cuál (por el nombre o la foto que vio); si por lo que dice encaja con uno solo, es ese.";
  return `ANUNCIOS VIGENTES (cargados por el negocio): ${enumerados} ${regla}`;
}
