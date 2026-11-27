/**
 * LA PREGUNTA DIRECTA SE CONTESTA ANTES DE VOLVER AL GUION (auditoría
 * Competimotor 26-nov-2026, familia F-06, caso 4).
 *
 *   · 697 «Si acepta cheques» → «¿Le cotizo la FALKEN WILDPEAK A/T 4W?».
 *   · 538 «De puede enviar foto de las dos para verlas» → repite precios; al día
 *     siguiente «No me envió la fotos de las llantas». 1456 «Me podria enviar una
 *     foto» → la misma lámina tres veces.
 *   · 884 «Maxiis 195/50/15» → otras marcas sin decir que no hay Maxxis ahí.
 *
 * Acá viven los detectores (puros, sobre el texto del CLIENTE) y el hecho que se
 * le pasa al Guardián para que la categoría `ignora-pregunta` tenga con qué
 * juzgar. Nada se lee del texto del bot.
 */
import { politica } from "../negocio/politica.js";
import { MARCAS_DE_LLANTA_CONOCIDAS } from "./marcasDeLlanta.js";

const normalizar = (t: string) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** «¿Me puede enviar una foto?», «foto de las dos», «mándeme fotos», «quiero verlas en foto». */
export function pideFotos(texto: string | null | undefined): boolean {
  const n = normalizar(texto ?? "");
  return /\bfotos?\b|\bfotito\w*\b|\bimagen(?:es)?\s+(?:real\w*|de\s+(?:la|las|esa|esas)\s+llantas?)\b/.test(n)
    && !/\bfoto\s+del?\s+(?:costado|lateral)\b|\ble\s+(?:mando|envio|paso)\s+(?:la\s+|una\s+)?foto\b|\bte\s+mando\b/.test(n);
}

/** Formas de pago que la gente pregunta y que un negocio puede no haber definido. */
const FORMAS_POR_PREGUNTAR: readonly (readonly [string, RegExp])[] = [
  ["cheque", /\bcheques?\b/],
  ["crédito directo", /\bcredito\s+directo\b|\bfiad\w*\b/],
  ["criptomonedas", /\bcripto\w*\b|\bbitcoin\b|\busdt\b/],
];

/**
 * La forma de pago que el cliente pregunta y que la política NO tiene, o null.
 * «Si acepta cheques» con formas = efectivo/transferencia/tarjeta → «cheque».
 * No se inventa la respuesta: la confirma el asesor (y se le avisa).
 */
export function formaDePagoSinDefinir(texto: string | null | undefined): string | null {
  const n = normalizar(texto ?? "");
  const definidas = politica.formasDePago.map((f) => normalizar(f));
  for (const [nombre, re] of FORMAS_POR_PREGUNTAR) {
    if (re.test(n) && !definidas.some((d) => d.includes(normalizar(nombre)))) return nombre;
  }
  return null;
}

/**
 * Los hechos de la pregunta directa para el Guardián (o `[]`). Solo con
 * `politica.casosSueltosF06`: con Depot no cambia nada de lo que el revisor ve.
 */
export function hechosDePreguntaDirecta(
  textoDelCliente: string | null | undefined,
  datos: { marcaPedidaSinStock?: string | null; opcionesEnLaLamina?: readonly string[] } = {},
): string[] {
  if (!politica.casosSueltosF06) return [];
  const hechos: string[] = [];
  if (pideFotos(textoDelCliente)) {
    hechos.push("PREGUNTA DIRECTA: el cliente pidió FOTOS de las llantas. La imagen de opciones que ya recibió ES la foto: el borrador lo dice en una línea y ofrece algo nuevo (fotos reales por el asesor, otra opción). Reenviar la misma lámina o repetir los precios sin contestar es ignora-pregunta ALTA.");
  }
  const forma = formaDePagoSinDefinir(textoDelCliente);
  if (forma) {
    hechos.push(`PREGUNTA DIRECTA: el cliente preguntó si se acepta ${forma}. El negocio NO lo tiene definido: el borrador dice que eso se lo confirma el asesor (sin afirmar ni negar) y nombra las formas confirmadas (${politica.formasDePago.join(", ") || "ninguna"}). Volver a ofrecer cotizar sin contestar es ignora-pregunta ALTA.`);
  }
  if (preguntaSiSoloHayEsa(textoDelCliente)) {
    hechos.push(`PREGUNTA DIRECTA: el cliente pregunta si SOLO hay esa opción.${datos.opcionesEnLaLamina?.length ? ` En la lámina que ya vio hay ${datos.opcionesEnLaLamina.length}: ${datos.opcionesEnLaLamina.join(", ")}.` : ""} El borrador contesta sí o no primero y, si hay otras, las nombra. Contestar otra cosa (fotos, el precio) es ignora-pregunta ALTA.`);
  }
  if (datos.marcaPedidaSinStock) {
    hechos.push(`PREGUNTA DIRECTA: el cliente pidió la marca ${datos.marcaPedidaSinStock} y en su medida no está en la lámina. El borrador lo dice en una línea ANTES de las otras opciones${politica.nuncaDecirNoHay ? ` sin decir «no hay» (p. ej. «La ${datos.marcaPedidaSinStock} en esa medida se la revisa un asesor; mientras tanto, estas son las que tengo:»)` : ""}. Mostrar otras marcas sin nombrar la que pidió es ignora-pregunta ALTA.`);
  }
  return hechos;
}

/** Sin letras repetidas: «maxiis» y «maxxis» quedan «maxis». */
const sinRepetidas = (t: string) => t.replace(/(\p{L})\1+/gu, "$1");

/**
 * La marca que el cliente nombró, tolerando la letra doble mal puesta (884:
 * «Maxiis 195/50/15»). Devuelve la marca en minúsculas como en la lista única.
 */
export function marcaQueNombro(texto: string | null | undefined): string | null {
  const palabras = normalizar(texto ?? "").split(/[^a-z0-9]+/).filter((p) => p.length >= 4);
  for (const m of MARCAS_DE_LLANTA_CONOCIDAS) {
    const objetivo = sinRepetidas(m);
    if (palabras.some((p) => p === m || sinRepetidas(p) === objetivo)) return m;
  }
  return null;
}

/** «Solo dispone en ese modelo», «¿no hay otra?», «¿solo esa tiene?» (1456). */
export function preguntaSiSoloHayEsa(texto: string | null | undefined): boolean {
  const n = normalizar(texto ?? "");
  return /\bsolo\s+(?:dispone|tiene|tienen|hay|manejan?)\b[^.?!]{0,25}\b(?:es[ae]|esa\s+medida|ese\s+modelo|esa\s+marca)?|\bsolo\s+(?:es[ae]s?|ese\s+modelo|esa\s+marca)\b[^.?!]{0,15}\b(?:tiene|hay|dispone)\b|\bno\s+(?:hay|tiene|tienen)\s+otr[ao]s?\b|\botr[ao]s?\s+(?:opciones|modelos|marcas)\s*\?/.test(n);
}
