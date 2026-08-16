/**
 * El cupón de confirmación: un código que el cliente trae al local.
 *
 * De dónde sale (reunión del 14-ago con Andrés): hoy hay 15 «ganados» marcados
 * contra 152 cotizaciones pendientes, y nadie sabe cuáles terminaron en venta.
 * Pedir el teléfono en caja no sirve — «te doy el de mi oficina». Lo que sí
 * funciona es darle al cliente una razón propia para identificarse: un 2 %
 * adicional que él mismo va a exigir. Al canjearlo, Depot sabe exactamente qué
 * cotización del bot se convirtió en venta.
 *
 * Este archivo es puro a propósito: el código se dicta por teléfono y se lee
 * de una pantalla en caja, así que su forma tiene que poder probarse sin base
 * de datos ni red. El descuento en sí NUNCA se aplica aquí ni en la cotización
 * del bot — el bot solo lo anuncia y la caja lo aplica.
 */

/**
 * Alfabeto sin ambiguos. Fuera 0/O y 1/I/L: el código se dicta por teléfono
 * («de-te guion siete ka tres eme») y se teclea en un local con ruido. Un cero
 * leído como O es un cupón que no existe y un cliente discutiendo en caja.
 */
export const ALFABETO_CUPON = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Prefijo fijo: identifica de un vistazo que el papelito es de Depot Tire. */
export const PREFIJO_CUPON = "DT-";

const LARGO_CUPON = 4;

/**
 * Genera un código nuevo. `aleatorio` se inyecta para poder probar la forma sin
 * depender del azar; en producción es Math.random.
 */
export function generarCodigoCupon(aleatorio: () => number = Math.random): string {
  let cuerpo = "";
  for (let i = 0; i < LARGO_CUPON; i += 1) {
    const indice = Math.floor(aleatorio() * ALFABETO_CUPON.length) % ALFABETO_CUPON.length;
    cuerpo += ALFABETO_CUPON[indice];
  }
  return `${PREFIJO_CUPON}${cuerpo}`;
}

/**
 * Deja el código como está guardado, a partir de lo que sea que alguien tecleó.
 *
 * Quien canjea escribe lo que le dictaron: «dt7k3m», «DT 7K3M», «7k3m» a secas.
 * Los tres son el mismo cupón, y eso sí se acepta.
 *
 * Lo que NO se hace es adivinar caracteres. Sería tentador traducir la O a un
 * cero o la I a un uno, pero el generador nunca los emite: si aparecen, alguien
 * dictó o escuchó mal. Corregirlos por nuestra cuenta convierte la errata de un
 * cliente en un código válido que puede ser el cupón de OTRO — el descuento se
 * lo llevaría quien no era y la venta quedaría atribuida al chat equivocado.
 * Preferimos devolver null y que en caja se relea el papel.
 */
export function normalizarCodigoCupon(entrada: string): string | null {
  const limpio = entrada.toUpperCase().replace(/[\s\-_.]/g, "");
  const cuerpo = limpio.startsWith("DT") ? limpio.slice(2) : limpio;
  if (cuerpo.length !== LARGO_CUPON) return null;
  if (![...cuerpo].every((caracter) => ALFABETO_CUPON.includes(caracter))) return null;
  return `${PREFIJO_CUPON}${cuerpo}`;
}

/** ¿Este texto es un código con la forma correcta? */
export function esCodigoCupon(entrada: string): boolean {
  return normalizarCodigoCupon(entrada) !== null;
}

/**
 * El mensaje que recibe el cliente.
 *
 * Dice «adicional sobre su cotización» y nombra el número de cotización porque
 * el 2 % no reemplaza el descuento que ya tenga: se suma en caja. Sin el número
 * de cotización el cajero no sabe sobre qué total aplicarlo.
 */
export function mensajeCupon(input: {
  codigo: string;
  porcentaje: number;
  numeroCotizacion?: string | null;
}): string {
  const sobre = input.numeroCotizacion
    ? `sobre su cotización *${input.numeroCotizacion}*`
    : "sobre su cotización";
  return [
    `🎟️ Por confirmar su visita le regalamos un *${formatearPorcentaje(input.porcentaje)} adicional* ${sobre}.`,
    `Presente este código en el local: *${input.codigo}*`,
  ].join("\n");
}

/** «2 %», «2,5 %» — sin decimales inútiles y con la coma que se usa en Ecuador. */
export function formatearPorcentaje(porcentaje: number): string {
  const texto = Number.isInteger(porcentaje)
    ? String(porcentaje)
    : porcentaje.toFixed(1).replace(".", ",");
  return `${texto} %`;
}

/** La línea que ve el asesor en el aviso de WhatsApp y en el hub. */
export function etiquetaCupon(input: { codigo: string; porcentaje: number }): string {
  return `🎟️ Cupón ${input.codigo} (${formatearPorcentaje(input.porcentaje)} extra)`;
}
