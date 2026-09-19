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
 */
export interface Anuncio {
  titulo: string | null;
  texto: string | null;
  url: string | null;
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
  };
  return anuncio.titulo || anuncio.texto ? anuncio : null;
}

/** El hecho que recibe el vendedor y el guardián. */
export function hechoDelAnuncio(anuncio: Anuncio): string {
  const partes = [anuncio.titulo, anuncio.texto].filter(Boolean).join(" — ");
  return (
    `ANUNCIO POR EL QUE LLEGÓ (fuente: WhatsApp): «${partes}». Si el cliente habla de «la del anuncio», `
    + "«esa llanta» o «la de la foto» sin nombrar otra, se refiere a la llanta, marca o tipo que ese "
    + "anuncio nombra: búscala por ese modelo y tipo en la medida o aro que él diga. Si no la hay en su "
    + "aro, dilo y ofrece el MISMO TIPO de llanta (camioneta con camioneta, auto con auto); PROHIBIDO "
    + "ofrecerle llantas de otro tipo de vehículo como si fueran las del anuncio."
  );
}
