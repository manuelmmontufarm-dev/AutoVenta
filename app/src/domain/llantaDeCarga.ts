/**
 * LLANTA DE CARGA (C / LT) — DUEÑO ÚNICO de «el cliente pide una llanta de
 * carga» y «esta llanta del catálogo es de carga».
 *
 * Auditoría Competimotor 26-nov-2026 (familia F-06):
 *   · 1717 «195R15C» (furgoneta de reparto) → 195/45R15, 195/50R15, 195/55R15 de auto.
 *   · 1632 «225/65/R16LT… furgoneta escolar King Long… necesito las cuatro» →
 *     «equivalentes» de pasajero 215/70R16 y 235/60R16.
 * Una C o una LT lleva más lonas y otro índice de carga: una de pasajero «del
 * mismo aro» no la reemplaza aunque el diámetro cuadre.
 *
 * En el Excel de Fénix la C y la LT pueden venir en cualquier lugar del nombre
 * («KENDA 195R15C 8PR KR33», «KAPSEN 225/75R16 RS23 LT 115/112S», «HAIDA
 * LT275/55R20») y la etiqueta de la medida (`sizeLabel`) las pierde siempre: por
 * eso se mira el NOMBRE.
 *
 * El «XL» (Extra Load) NO es de carga: es una llanta de pasajero reforzada
 * (chat 454).
 *
 * Puro: sin base ni catálogo.
 */

const normalizar = (t: string) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** La medida escrita con C pegada al aro («195R15C», «195/70 R15 C») o con LT delante o detrás. */
const MEDIDA_C_O_LT =
  /\b\d{3}\s*(?:[/\-\s]\s*\d{2})?\s*[/\-\s]*(?:z?r|rin|aro)?\s*[/\-]?\s*1[2-9]\s*c\b|\blt\s*\d{3}\b|\b\d{3}\s*[/\-\s]\s*\d{2}\s*[/\-\s]*(?:z?r)?\s*[/\-]?\s*1[2-9]\s*lt\b/;

/** El vehículo o el uso que pide llanta de carga. */
const VEHICULO_DE_CARGA =
  /\b(?:furgon\w*|camion(?:eta)?\s+de\s+carga|camion\b|busetas?|microbus\w*|van\s+de\s+carga|reparto|8\s*lonas|10\s*lonas|8\s*pr|10\s*pr|para\s+cargar|de\s+carga|llevar\s+carga|cargar\s+peso)\b/;

/** ¿El cliente pide llanta de carga? Por la medida (C/LT) o por el vehículo / uso. */
export function pideLlantaDeCarga(texto: string | null | undefined): boolean {
  // «Índice de carga y velocidad: 103V (… Extra Load / XL, reforzada para mayor
  // carga)» es la ficha de una llanta de pasajero (chat 454), no un pedido de carga.
  const n = normalizar(texto ?? "")
    .replace(/\bindices?\s+de\s+carga\b|\bmayor\s+carga\b|\bextra\s*load\b|\breforzad[ao]s?\b/g, " ");
  if (!n.trim()) return false;
  return MEDIDA_C_O_LT.test(n) || VEHICULO_DE_CARGA.test(n);
}

/** La C o la LT en el NOMBRE del producto (la etiqueta de medida no las trae). */
const NOMBRE_DE_CARGA = /\b\d{3}(?:\/\d{2})?R1[2-9]C\b|\bLT\s*\d{3}|\d{2}R1[2-9]LT\b|\bLT\b|\b\d{3}(?:\/\d{2})?R1[2-9]\s*C\b|\b(?:8|10|12|14)\s*PR\b/i;

/** ¿Esta llanta del catálogo es de carga (C / LT / 8 lonas o más)? */
export function esLlantaDeCarga(item: { name: string; sizeLabel?: string | null }): boolean {
  return NOMBRE_DE_CARGA.test(item.name ?? "");
}
