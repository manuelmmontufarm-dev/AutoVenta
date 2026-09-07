/**
 * EL CLIENTE SEÑALA UNA LLANTA DE LA LÁMINA (conv 3, 7-sep-2026).
 *
 * «deme la premium», «cotizeme la winrun», «deme la r380»: el cliente eligió
 * una de las opciones que tiene en pantalla, por escalón, por marca o por
 * modelo. Elegir ES pedir la cotización (Manuel, 1-sep y 7-sep). Hasta hoy
 * solo la marca a secas («las winrun») y el menú (1/2/3, costo/premium) abrían
 * el camino determinístico; el modelo («cotizeme la winrun», «deme la r380»)
 * reenvió más opciones y pidió la medida exacta tres veces seguidas.
 *
 * Puro: recibe el texto y las opciones de la última pieza, devuelve la
 * elegida, o las candidatas cuando el nombre no alcanza para distinguirlas
 * (dos R380 en dos medidas), o null si el texto no es una elección.
 */

export interface OpcionDeVitrina {
  codigo: string;
  marca: string;
  diseno: string;
  medida?: string | null;
}

export type EleccionDeVitrina =
  | { tipo: "una"; opcion: OpcionDeVitrina }
  | { tipo: "varias"; opciones: OpcionDeVitrina[] }
  | null;

const normalizar = (t: string) =>
  (t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.,;:!¡?¿*"']/g, " ");

/** Palabras que rodean la elección y no la cambian. */
const RELLENO = new Set([
  "deme", "dame", "demen", "quiero", "quisiera", "prefiero", "cotiza", "cotizame", "cotizeme", "coticeme", "cotizar", "cotizacion",
  "la", "el", "las", "los", "esa", "ese", "esas", "esos", "esta", "este", "mejor", "me", "quedo", "con", "vamos", "voy", "por",
  "favor", "porfa", "pf", "dale", "ok", "si", "bueno", "entonces", "de", "una", "un", "opcion", "llanta", "llantas", "modelo",
  "marca", "mande", "mandeme", "envie", "envieme", "pasame", "paseme", "entonces", "ya", "solo", "nomas", "juego", "4", "cuatro",
  "the", "en", "esa", "quiero", "elijo", "escojo", "tomo", "va", "listo",
]);
const TIPOS = new Set(["a/t", "h/t", "r/t", "m/t", "at", "ht", "rt", "mt"]);

const pelar = (t: string) => t.replace(/[\s\-/x×]/g, "");

function tokensDelNombre(valor: string): string[] {
  return normalizar(valor).split(/\s+/).filter((t) => t.length >= 3 && !TIPOS.has(t) && /[a-z]/.test(t));
}

export function eleccionDeLaVitrina(texto: string, opciones: readonly OpcionDeVitrina[]): EleccionDeVitrina {
  if (!opciones.length) return null;
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean).filter((p) => !RELLENO.has(p));
  if (!palabras.length || palabras.length > 5) return null;
  const medidaEscrita = normalizar(texto).match(/\b(\d{3})\s*[\/x-]?\s*(\d{2})\s*(?:r|-|\/)?\s*(\d{2})?\b/);
  const aroEscrito = normalizar(texto).match(/\b(?:rin|aro|ring)\s*(1[2-9]|2[0-4])\b/)?.[1] ?? null;
  const senaladas = new Map<string, OpcionDeVitrina>();
  const sinDueno: string[] = [];
  for (const palabra of palabras) {
    // Una medida o un aro escritos no son un nombre: afinan, no eligen.
    if (/^\d/.test(palabra) || palabra === "rin" || palabra === "aro") continue;
    let asignada = false;
    for (const opcion of opciones) {
      const marca = normalizar(opcion.marca).trim();
      const disenoTokens = tokensDelNombre(opcion.diseno);
      const esMarca = marca && (palabra === marca || (palabra.length >= 4 && marca.startsWith(palabra)));
      const esDiseno = disenoTokens.some((tk) => tk === palabra || (palabra.length >= 4 && pelar(tk) === pelar(palabra)));
      if (esMarca || esDiseno) { senaladas.set(opcion.codigo, opcion); asignada = true; }
    }
    if (!asignada) sinDueno.push(palabra);
  }
  // Una palabra que no nombra nada convierte el mensaje en otra cosa
  // («cuánto dura la winrun» pregunta, no elige).
  if (sinDueno.length || !senaladas.size) return null;
  let candidatas = [...senaladas.values()];
  if (medidaEscrita || aroEscrito) {
    const filtro = medidaEscrita ? pelar(`${medidaEscrita[1]}${medidaEscrita[2]}`) : null;
    const porMedida = candidatas.filter((o) => {
      const m = pelar(normalizar(o.medida ?? ""));
      if (filtro && !m.startsWith(filtro)) return false;
      if (aroEscrito && !m.endsWith(`r${aroEscrito}`) && !m.endsWith(aroEscrito)) return false;
      return true;
    });
    if (porMedida.length) candidatas = porMedida;
  }
  // Nombró el modelo Y la marca de la misma llanta: sigue siendo una.
  if (candidatas.length === 1) return { tipo: "una", opcion: candidatas[0] };
  return { tipo: "varias", opciones: candidatas };
}
