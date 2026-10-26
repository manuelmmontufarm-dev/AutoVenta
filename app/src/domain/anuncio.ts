/**
 * EL ANUNCIO CON EL QUE LLEGÓ EL CLIENTE ES CONTEXTO, Y SE TIRABA.
 *
 * Cuando un chat empieza desde un anuncio de Facebook o Instagram, WhatsApp
 * manda con el primer mensaje un `referral`: el título y el texto del anuncio.
 * 257 de los 307 chats de la auditoría del 6-sep llegaron así, y el bot nunca
 * lo leyó. Joaquín, 14-sep (conv 20527): el anuncio era de la *Kenda Klever
 * KR601* —camioneta, todo terreno—, el cliente escribió «las que están en el
 * anuncio pero en rin 16» y recibió Falken ZE310R, Kenda KR20 y Winrun R330:
 * llantas de auto. Sin el anuncio, «la del anuncio» no significa nada.
 *
 * Puro: recibe el `referral` crudo de Meta y devuelve lo que sirve.
 *
 * Además del texto se guarda de qué anuncio vino (23-oct): el título casi
 * siempre es «Depot Tire», así que sin `source_id` dos olas de anuncios se
 * confunden y no hay cómo decirle a Depot cuál trajo las ventas. Un referral
 * que trae `source_id` sin título ni texto (pasa con los de estados) ahora se
 * guarda: es el dato que separa un anuncio de otro.
 */
import { hechoDeAnunciosActivos, type AnuncioActivo } from "./anunciosActivos.js";

export interface Anuncio {
  titulo: string | null;
  texto: string | null;
  url: string | null;
  /** `source_id` de Meta: el id del anuncio. */
  sourceId: string | null;
  /** `source_type`: "ad" o "post". */
  sourceType: string | null;
  /** `ctwa_clid`: el click del anuncio «clic a WhatsApp». Los de estados no lo traen. */
  ctwaClid: string | null;
  /** `media_type`: "image" o "video". */
  mediaType: string | null;
}

const recortar = (valor: unknown, tope: number): string | null => {
  if (typeof valor !== "string") return null;
  const limpio = valor.replace(/\s+/g, " ").trim();
  return limpio ? limpio.slice(0, tope) : null;
};

/** El `referral` de Meta, reducido a lo que se guarda. Null si no trae nada. */
export function anuncioDelReferral(referral: unknown): Anuncio | null {
  if (!referral || typeof referral !== "object") return null;
  const r = referral as Record<string, unknown>;
  const anuncio: Anuncio = {
    titulo: recortar(r.headline, 200),
    texto: recortar(r.body, 600),
    url: recortar(r.source_url, 300),
    sourceId: recortar(r.source_id, 100),
    sourceType: recortar(r.source_type, 40),
    ctwaClid: recortar(r.ctwa_clid, 300),
    mediaType: recortar(r.media_type, 40),
  };
  return anuncio.titulo || anuncio.texto || anuncio.sourceId ? anuncio : null;
}

/**
 * El hecho que recibe el vendedor y el guardián. Un anuncio que solo trae su
 * id (sin título ni texto) no dice qué llanta mostraba: antes ese referral se
 * descartaba y el vendedor no leía nada; ahora lee solo que no hay qué
 * suponer. No va vacío: `agent.ts` lo manda como mensaje de sistema.
 */
export function hechoDelAnuncio(anuncio: Anuncio, activos: AnuncioActivo[] = []): string {
  const base = hechoDelReferral(anuncio);
  const deLaLista = hechoDeAnunciosActivos(activos, anuncio);
  return deLaLista ? `${base}\n${deLaLista}` : base;
}

/**
 * Lo que se le manda al chat sobre el anuncio (vendedor y Guardián): el hecho
 * del referral de Meta si trae título o texto, más los anuncios que el negocio
 * tiene vigentes. Un referral que solo trae el id no dice nada, así que sin
 * activos devuelve null (como antes de cargar anuncios): el prompt no cambia.
 */
export function hechoParaElChat(anuncio: Anuncio | null, activos: AnuncioActivo[]): string | null {
  if (anuncio && (anuncio.titulo || anuncio.texto)) return hechoDelAnuncio(anuncio, activos);
  return hechoDeAnunciosActivos(activos, anuncio);
}

function hechoDelReferral(anuncio: Anuncio): string {
  const partes = [anuncio.titulo, anuncio.texto].filter(Boolean).join(" — ");
  if (!partes) {
    return "ANUNCIO POR EL QUE LLEGÓ (fuente: WhatsApp): sin título ni texto. No supongas qué llanta mostraba; "
      + "si el cliente dice «la del anuncio», pregúntale cuál.";
  }
  return (
    `ANUNCIO POR EL QUE LLEGÓ (fuente: WhatsApp): «${partes}». Si el cliente habla de «la del anuncio», `
    + "«esa llanta» o «la de la foto» sin nombrar otra, se refiere a la llanta, marca o tipo que ese "
    + "anuncio nombra: búscala por ese modelo y tipo en la medida o aro que él diga. Si no la hay en su "
    + "aro, dilo y ofrece el MISMO TIPO de llanta (camioneta con camioneta, auto con auto); PROHIBIDO "
    + "ofrecerle llantas de otro tipo de vehículo como si fueran las del anuncio."
  );
}
