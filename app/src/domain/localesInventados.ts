/**
 * El bot no puede nombrar un local que no existe.
 *
 * Producción, 27-ago-2026, conv 11302 (Enrique Molina). El cliente preguntó por
 * audio «¿dónde está ubicado su negocio?» y el bot contestó:
 *
 *   «¿Le queda mejor el sector *Quito Norte* o *Quito Sur* para pasarle la
 *    ubicación que más le convenga?»
 *
 * Depot Tire NO tiene local en Quito Norte. El cliente, lógicamente, contestó
 * «en el norte» — y el turno siguiente el bot tuvo que desdecirse: «No le ubico
 * un local como Quito Norte en la información que tengo». Dos turnos perdidos y
 * un cliente al que se le ofreció algo que no existe.
 *
 * «Quito Norte» no está en ningún prompt ni en el playbook: el modelo lo inventó
 * por simetría con «Quito Sur». Por eso es un CANDADO y no una línea de prompt —
 * pedirle al modelo que no invente nombres es pedirle que no sea un modelo.
 *
 * QUÉ HACE: solo mira los nombres que el bot OFRECE como local o sector. No
 * toca el resto del mensaje, porque decir «no tenemos local en el norte» es
 * correcto y necesario — lo que no se puede es ofrecerlo.
 *
 * Puro y sin base: los locales entran por parámetro para poder probarlo sin
 * levantar nada.
 */

const normalizar = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[*_]/g, "").trim();

/**
 * Nombres que el mensaje presenta como local o sector propio.
 *
 * Dos formas, que son las que aparecen en los chats reales: detrás de la
 * palabra «sector/local/sucursal/tienda», y detrás de la marca («Depot Tire X»).
 */
function nombresOfrecidos(texto: string): string[] {
  const nombres: string[] = [];
  const PALABRA = "[A-ZÁÉÍÓÚÑ][\\wáéíóúñ]*";
  const patrones = [
    new RegExp(`\\b(?:sector|local|sucursal|tienda)\\s+\\*?(${PALABRA}(?:\\s+${PALABRA})?)`, "g"),
    new RegExp(`\\bDepot\\s+Tire\\s+\\*?(${PALABRA}(?:\\s+${PALABRA})?)`, "g"),
  ];
  for (const patron of patrones) {
    for (const m of texto.matchAll(patron)) if (m[1]) nombres.push(m[1].trim());
  }
  return nombres;
}

/**
 * Los nombres ofrecidos que NO corresponden a ningún local real.
 *
 * Un nombre cuenta como real si aparece dentro del nombre del local o el local
 * dentro de él: «Quito Sur» contra «Depot Tire Quito Sur», y «Cumbayá» igual.
 */
export function localesInventados(texto: string, locales: readonly string[]): string[] {
  const reales = locales.map(normalizar);
  const inventados = nombresOfrecidos(texto)
    .filter((nombre) => {
      const n = normalizar(nombre);
      if (n.length < 3) return false;
      return !reales.some((real) => real.includes(n) || n.includes(real));
    });
  return [...new Set(inventados)];
}

/**
 * ¿El mensaje OFRECE elegir entre sectores/locales? Solo entonces importa que
 * el nombre sea inventado: mencionarlo para negarlo es correcto.
 */
export function ofreceElegirLocal(texto: string): boolean {
  const n = normalizar(texto);
  if (!texto.includes("?")) return false;
  return /\b(?:sector|local|sucursal|tienda)\b/.test(n) && /\bo\b/.test(n);
}
