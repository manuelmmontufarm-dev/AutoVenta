/**
 * El cupón de confirmación: un código que el cliente trae al local.
 *
 * De dónde sale (reunión del 14-ago con Andrés): hoy hay 15 «ganados» marcados
 * contra 152 cotizaciones pendientes, y nadie sabe cuáles terminaron en venta.
 * Pedir el teléfono en caja no sirve — «te doy el de mi oficina». Lo que sí
 * funciona es darle al cliente una razón propia para identificarse: un 2 %
 * adicional que él mismo va a exigir. El cajero se lo da contra el código y lo
 * copia en la descripción de la factura; leyendo esas descripciones sabemos
 * exactamente qué cotización del bot se convirtió en venta.
 *
 * NO escribimos en Contífico. El circuito es: el bot emite el código, el
 * cliente lo dicta en caja, el cajero aplica el 2 % y lo teclea en la
 * descripción. Nosotros solo leemos. Por eso el código tiene dos obligaciones
 * que mandan sobre todo lo demás:
 *
 *  1. Que el cliente QUIERA darlo. Si no lo da, la venta queda sin atribuir y
 *     el circuito entero no sirve. De ahí el 2 % y el mensaje que avisa, sin
 *     rodeos, que sin el código no hay descuento.
 *  2. Que sea trivial de teclear con una cola esperando. Un cajero apurado no
 *     transcribe `DT-7K3M` sin equivocarse; `DT-PUMA47` se escribe de un tirón
 *     y se dicta por teléfono sin deletrear.
 *
 * Este archivo es puro a propósito: el código se dicta en voz alta y se lee de
 * una pantalla en caja, así que su forma tiene que poder probarse sin base de
 * datos ni red. El descuento en sí NUNCA se aplica aquí ni en la cotización del
 * bot — el bot solo lo anuncia y la caja lo aplica.
 */

/**
 * Las 64 palabras del cupón.
 *
 * Reglas que cumplen todas, y ninguna es capricho: de 3 a 6 letras (se teclea
 * de un tirón), sin tildes ni ñ (el teclado de la caja es el que es), y una
 * sola forma de escribirse. Son palabras que cualquiera en Quito escribe bien
 * al primer intento — animales, cosas del carro, y lugares y frutas del país.
 *
 * Que la palabra venga de esta lista ES la verificación: al barrer las
 * descripciones de Contífico, «DT-PUMA47» es nuestro y «DT-XKQZ13» no existe.
 * Un texto cualquiera no cae por accidente en una de 64 palabras seguida de dos
 * dígitos, así que se puede distinguir un cupón real del ruido sin consultar la
 * base — que es justo lo que hace falta para auditar facturas.
 */
export const PALABRAS_CUPON: readonly string[] = [
  // Animales
  "PUMA", "TIGRE", "LOBO", "TUCAN", "CONDOR", "HALCON", "JAGUAR", "GARZA",
  "DELFIN", "ZORRO", "BUHO", "CUERVO", "AGUILA", "TORO",
  // Del carro y la carretera
  "TURBO", "MOTOR", "RUEDA", "PISTA", "CURVA", "NITRO", "FRENO", "PISTON",
  "CAUCHO", "LLANTA", "CHASIS", "GARAJE", "RUTA", "VIAJE",
  // Ecuador
  "ANDES", "QUITO", "SANGAY", "ALTAR", "MITAD", "VOLCAN", "SELVA", "COSTA",
  "SIERRA", "PARAMO", "CACAO", "CANELA",
  // Fuerza y brillo
  "RAYO", "CHISPA", "TRUENO", "FUEGO", "VIENTO", "COHETE", "IMAN", "ROCA",
  "ACERO", "TESORO", "PLATA", "BRONCE", "PERLA", "CORAL",
  // Mar y fruta
  "MANGO", "LIMON", "COCO", "PALMA", "ARENA", "PLAYA", "FARO", "ANCLA",
  "VELA", "REMO",
];

/** Prefijo fijo: identifica de un vistazo que el papelito es de Depot Tire. */
export const PREFIJO_CUPON = "DT-";

/**
 * Dos dígitos, no uno ni tres.
 *
 * Con uno solo el surtido es de 640 cupones y las repeticiones empiezan el
 * primer mes; con tres, el cajero ya tiene que mirar dos veces la pantalla.
 * Dos dan 6.400 combinaciones —años de holgura al ritmo de Depot— y se dictan
 * como un número, no como cifras sueltas: «puma cuarenta y siete».
 */
const DIGITOS_CUPON = 2;
const TOPE_NUMERO = 10 ** DIGITOS_CUPON;

/** Forma del código ya normalizado, para barrer texto ajeno (descripciones). */
const FORMA_CUPON = new RegExp(`^(${PALABRAS_CUPON.join("|")})(\\d{${DIGITOS_CUPON}})$`);

/**
 * Genera un código nuevo. `aleatorio` se inyecta para poder probar la forma sin
 * depender del azar; en producción es Math.random.
 *
 * Puede repetir un código ya emitido: eso lo resuelve quien lo guarda, que es
 * el único que puede consultar la tabla (ver `services/coupons.ts`). Aquí no se
 * toca la base para que la forma del cupón siga siendo probable en frío.
 */
export function generarCodigoCupon(aleatorio: () => number = Math.random): string {
  const palabra = PALABRAS_CUPON[Math.floor(aleatorio() * PALABRAS_CUPON.length) % PALABRAS_CUPON.length];
  const numero = Math.floor(aleatorio() * TOPE_NUMERO) % TOPE_NUMERO;
  return `${PREFIJO_CUPON}${palabra}${String(numero).padStart(DIGITOS_CUPON, "0")}`;
}

/**
 * Deja el código como está guardado, a partir de lo que sea que alguien tecleó.
 *
 * Quien canjea escribe lo que le dictaron: «dt puma 47», «DT-PUMA-47»,
 * «puma47» a secas, o «PUMÁ47» si el corrector del teléfono metió la tilde.
 * Todos son el mismo cupón, y todos se aceptan: en caja hay cola y la forma de
 * escribir no puede ser un examen.
 *
 * Lo que NO se hace es adivinar la palabra. Sería tentador aceptar «PUM47» o
 * corregir «TIGRE» a partir de «TIGER», pero un cupón inventado con suerte es
 * el cupón de OTRO cliente: el descuento se lo llevaría quien no era y la venta
 * quedaría atribuida al chat equivocado. Si no calza exacto se devuelve null y
 * en caja se relee el papel.
 */
export function normalizarCodigoCupon(entrada: string): string | null {
  const limpio = String(entrada ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const cuerpo = limpio.startsWith("DT") ? limpio.slice(2) : limpio;
  return FORMA_CUPON.test(cuerpo) ? `${PREFIJO_CUPON}${cuerpo}` : null;
}

/** ¿Este texto es un código con la forma correcta? */
export function esCodigoCupon(entrada: string): boolean {
  return normalizarCodigoCupon(entrada) !== null;
}

/**
 * Todos los cupones que aparecen dentro de un texto cualquiera.
 *
 * Es la herramienta para auditar: se le pasa la descripción de una factura de
 * Contífico —donde el cajero escribió lo que se le ocurrió, con el cupón en
 * medio— y devuelve los códigos que encuentre, ya normalizados. Sin esto, el
 * cruce vuelve a ser por teléfono, que es lo que dio 0 de 61.
 */
export function extraerCupones(texto: string): string[] {
  const candidatos = String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .match(/DT[\s\-_.]*[A-Z]+[\s\-_.]*\d{2}/g) ?? [];
  const vistos = new Set<string>();
  for (const candidato of candidatos) {
    const codigo = normalizarCodigoCupon(candidato);
    if (codigo) vistos.add(codigo);
  }
  return [...vistos];
}

/**
 * El mensaje que recibe el cliente.
 *
 * Escrito para que el código se USE, no para que se entienda: el cliente lo lee
 * en el celular una vez y tiene que acordarse en caja tres días después. Por eso
 * el código va solo en su línea, arriba, y la advertencia va al final con el
 * costo concreto de olvidarlo. Andrés fue explícito el 15-ago: tiene que quedar
 * clarísimo que sin el código se pierde el 2 %, porque un descuento que el
 * cliente cree automático no lo hace pedirlo — y si no lo pide, la venta queda
 * sin atribuir y el circuito entero no sirvió de nada.
 *
 * Dice «adicional sobre su cotización» y nombra el número porque el 2 % no
 * reemplaza el descuento que ya tenga: se suma en caja.
 */
/**
 * Sin el número de cotización desde el 26-ago (Joaquín): «número de cotización
 * más código de descuento ya demasiadas vainas». Este mensaje existe para que
 * el cliente memorice UNA cosa —su cupón— y meterle un COT- al lado competía
 * con eso justamente en el mensaje donde menos podía permitírselo.
 */
export function mensajeCupon(input: {
  codigo: string;
  porcentaje: number;
}): string {
  const sobre = "sobre su cotización";
  return [
    `🎟️ Su código de descuento es *${input.codigo}*`,
    "",
    `Por confirmar su visita le damos un *${formatearPorcentaje(input.porcentaje)} adicional* ${sobre}.`,
    "",
    `⚠️ *Dígalo en caja antes de pagar.* Es lo único que nos permite reconocerlo: si no lo presenta, no le pueden aplicar el ${formatearPorcentaje(input.porcentaje)}.`,
  ].join("\n");
}

/**
 * El recordatorio corto, para cuando el cupón viaja pegado a otro mensaje (el
 * aviso de la víspera, el del día). Repetir el mensaje largo cansa; lo que no
 * puede faltar nunca es el código y qué pasa si no lo dice.
 */
export function recordatorioCupon(input: { codigo: string; porcentaje: number }): string {
  return `🎟️ No olvide decir *${input.codigo}* en caja — sin ese código no le aplican el ${formatearPorcentaje(input.porcentaje)} adicional.`;
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
