/**
 * LOS DATOS QUE EL CLIENTE PREGUNTA Y EL BOT NO TENÍA.
 *
 * Dos casos de la auditoría del 8 al 11-sep, los dos con la respuesta a la
 * vista y fuera del alcance del bot.
 *
 * PAGOS · conv 17804, tras una cotización de $1.563:
 *
 *   CLIENTE: «Si se realiza el pago con tarjeta cuanto sube el valor disculpe»
 *   BOT: «El valor de la cotización ya está enviado; no puedo confirmar
 *         recargos de tarjeta por este medio.»
 *   ASESOR, 22 min después: «Con pagos con tarjeta no sube el precio. Y puede
 *         diferir a 3 y 6 meses sin intereses»
 *
 * El dato estaba impreso en el pie de la imagen que el bot acababa de mandar,
 * como texto dibujado en el PNG: para él no existía. Ahora vive acá, en el
 * dominio, y de acá lo toman el prompt y la pieza — una sola fuente.
 *
 * LONAS · tres clientes preguntaron de cuántas lonas es una llanta (convs
 * 16974, 18294 y 18880) y las tres veces el bot dijo que no tenía el dato.
 * Estaba en el nombre del producto que él mismo estaba mostrando: «KENDA
 * LT245/75 R16 120Q KR29 10PR TL» — ese «10PR» son diez lonas (ply rating).
 */

/**
 * Las lonas de un producto, leídas de su nombre. `null` cuando el nombre no
 * las dice, que es lo correcto: inventar un número de lonas es prometer una
 * capacidad de carga que la llanta puede no tener.
 *
 * Se exige la forma «NPR» pegada, que es como la escribe el fabricante. Un
 * número suelto del nombre («10.50», «120Q») no son lonas.
 */
export function lonasDelProducto(nombre: string | null | undefined): number | null {
  if (!nombre) return null;
  const m = /\b(\d{1,2})\s?PR\b/i.exec(nombre);
  if (!m) return null;
  const lonas = Number(m[1]);
  // El rango real: de 4 lonas (auto) a 20 (camión pesado).
  return lonas >= 4 && lonas <= 20 ? lonas : null;
}

/**
 * Qué se puede decir sobre el pago, palabra por palabra.
 *
 * Es la misma política que el pie de la pieza imprime desde agosto; acá se
 * escribe una vez para que el bot pueda responderla cuando se la preguntan en
 * texto, sin tener que leer la imagen.
 */
export function politicaDePagos(): string {
  return (
    "Se acepta efectivo, tarjeta y transferencia. Con tarjeta el precio es el mismo: no sube "
    + "y no hay recargo. Y se puede diferir a 3 y 6 meses sin intereses."
  );
}

/** ¿El cliente está preguntando cómo puede pagar? */
export function preguntaPorElPago(texto: string | null | undefined): boolean {
  const n = (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!n.trim()) return false;
  return /\btarjeta\b|\bdiferi\w*\b|\bcuotas?\b|\bmeses sin inter\w*\b|\brecargo\b|\bcredito\b|\bdebito\b|\bcomo (?:puedo )?pag\w*\b|\bformas? de pago\b|\befectivo\b|\btransferencia\b/.test(n);
}

/**
 * ¿El texto YA contiene la respuesta sobre el pago?
 *
 * Se pregunta por la respuesta y no por la evasiva, a propósito. La primera
 * versión de este candado buscaba cómo se escapaba el modelo («no puedo
 * confirmar», «lo valida el asesor») y el modelo cambiaba la redacción en cada
 * corrida: «El valor de la cotización ya está enviado; no puedo confirmar
 * recargos por este medio» (conv 17804), «las condiciones exactas se las
 * confirma el asesor», «se las confirma el asesor en el local». Perseguir
 * frases es un juego que se pierde.
 *
 * El hecho, en cambio, es uno solo: con tarjeta el precio es el mismo y hay
 * diferido sin intereses. O está dicho, o no está.
 */
export function respondeElPago(texto: string): boolean {
  const n = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const mismoPrecio = /\bno sube\b|\bmismo precio\b|\bprecio es el mismo\b|\bes el mismo precio\b|\bsin recargo\b|\bno hay recargo\b|\bno tiene recargo\b/.test(n);
  const diferido = /\bsin inter[ée]s\w*\b|\bsin intereses\b|\b3 y 6 meses\b/.test(n);
  return mismoPrecio || diferido;
}

const SEPARADOR_DE_BLOQUES = /\n\s*-{3,}\s*\n/;

/**
 * LAS FRASES DE PAGO QUE NO DAN LA RESPUESTA SE QUITAN.
 *
 * Producción, 12-sep-2026 17:32 (conv 3). El candado ponía la política cuando
 * faltaba, pero dejaba lo que el Guardián había escrito, y el cliente leyó las
 * dos cosas en el mismo turno:
 *
 *   «Con tarjeta el precio es el mismo: no sube y no hay recargo…»
 *   «Sobre el pago con tarjeta, no le puedo confirmar un recargo desde aquí…»
 *
 * Se decide por tema y por frase: una frase que habla de pago y no trae la
 * respuesta (ni es la política) sale. El resto del turno queda igual.
 */
export function sinPagoSinRespuesta(texto: string): string {
  const politica = politicaDePagos();
  let cambio = false;
  const bloques = texto.split(SEPARADOR_DE_BLOQUES).map((bloque) =>
    bloque
      .split("\n")
      .map((linea) =>
        linea
          .split(/(?<=[.!?])\s+/)
          .filter((frase) => {
            const f = frase.trim();
            if (!f || !preguntaPorElPago(f) || respondeElPago(f) || politica.includes(f)) return true;
            cambio = true;
            return false;
          })
          .join(" "))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim());
  if (!cambio) return texto;
  return bloques.filter(Boolean).join("\n---\n");
}
