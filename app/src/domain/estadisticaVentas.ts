/**
 * ESTADÍSTICA DE LAS VENTAS COMPROBADAS, SIN LIBRERÍAS.
 *
 * Al 23-oct había 26 ventas comprobadas contra Contífico en tres meses. Con
 * tan pocas, un número solo engaña: «2 ventas esta semana» es compatible con
 * una tasa de 0,2 o de 7 por semana, y «0 ventas de noche» sobre 600 chats sí
 * dice algo. Manuel quiere decirle a Depot cuándo y cuánto invertir en
 * anuncios con estos números, así que cada uno va con su `n` y su rango.
 *
 * Todo es puro: entra la cuenta, sale el número. Las fechas son
 * "YYYY-MM-DD" ya en hora de Guayaquil (UTC−5 fijo, sin horario de verano).
 */

export type Franja = "madrugada" | "manana" | "mediodia" | "tarde" | "noche";
export type GrupoAtencion = "bot" | "bot_y_asesor" | "asesor";

const redondear1 = (x: number) => Math.round(x * 10) / 10;

/** P(X ≤ k) con X ~ Poisson(λ), en logaritmos para que e^−λ no se vuelva 0 con λ grande. */
export function cdfPoisson(k: number, lambda: number): number {
  if (k < 0) return 0;
  if (lambda <= 0) return 1;
  const lnL = Math.log(lambda);
  let lnTermino = -lambda; // ln(e^−λ λ^i / i!) con i = 0
  let suma = Math.exp(lnTermino);
  for (let i = 1; i <= k; i += 1) {
    lnTermino += lnL - Math.log(i);
    suma += Math.exp(lnTermino);
  }
  return Math.min(1, suma);
}

/** El λ donde una función monótona de λ cruza `objetivo`, por bisección. */
function biseccion(f: (lambda: number) => number, objetivo: number, alto: number): number {
  let a = 0;
  let b = alto;
  for (let i = 0; i < 100; i += 1) {
    const m = (a + b) / 2;
    // f decrece con λ en los dos usos de abajo.
    if (f(m) > objetivo) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/**
 * IC 95 % exacto de Poisson para `n` eventos observados (Garwood): el λ más
 * chico con P(X ≥ n) = 2,5 % y el más grande con P(X ≤ n) = 2,5 %. Un decimal.
 * 0 → 0–3,7; 2 → 0,2–7,2; 5 → 1,6–11,7; 15 → 8,4–24,7.
 */
export function rangoPoisson(n: number): { bajo: number; alto: number } {
  const techo = n + 20 * Math.sqrt(n + 1) + 20;
  const bajo = n === 0 ? 0 : biseccion((l) => cdfPoisson(n - 1, l), 0.975, techo);
  const alto = biseccion((l) => cdfPoisson(n, l), 0.025, techo);
  return { bajo: redondear1(bajo), alto: redondear1(alto) };
}

/** El k más chico con P(X ≤ k) ≥ p, X ~ Poisson(λ). Poisson(4): 2,5 % → 1, 97,5 % → 8. */
export function cuantilPoisson(lambda: number, p: number): number {
  if (lambda <= 0) return 0;
  let k = 0;
  while (cdfPoisson(k, lambda) < p) k += 1;
  return k;
}

/** madrugada [0,6) · manana [6,11) · mediodia [11,14) · tarde [14,18) · noche [18,24). */
export function franjaDeHora(hora: number): Franja {
  if (hora < 6) return "madrugada";
  if (hora < 11) return "manana";
  if (hora < 14) return "mediodia";
  if (hora < 18) return "tarde";
  return "noche";
}

export const FRANJAS: Franja[] = ["madrugada", "manana", "mediodia", "tarde", "noche"];

const DIA_MS = 86_400_000;
const comoUtc = (dia: string) => Date.parse(`${dia}T00:00:00Z`);
const aDia = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** "YYYY-MM-DD" del instante en Guayaquil. */
export function diaDeGuayaquil(instante: Date): string {
  return aDia(instante.getTime() - 5 * 3_600_000);
}

/** Días de `desde` a `hasta` (los dos "YYYY-MM-DD"). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((comoUtc(hasta) - comoUtc(desde)) / DIA_MS);
}

export function sumarDias(dia: string, n: number): string {
  return aDia(comoUtc(dia) + n * DIA_MS);
}

/** 0 = domingo … 6 = sábado. */
export function diaDeLaSemana(dia: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return new Date(comoUtc(dia)).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/** El lunes de la semana (lunes a domingo) del día, o del instante en hora de Guayaquil. */
export function lunesDe(dia: string | Date): string {
  const d = typeof dia === "string" ? dia : diaDeGuayaquil(dia);
  return sumarDias(d, -((diaDeLaSemana(d) + 6) % 7));
}

export function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** % (un decimal) de rezagos ≤ cada corte. */
export function curvaAcumulada<C extends number>(rezagos: number[], cortes: C[]): Array<{ dias: C; pct: number }> {
  return cortes.map((dias) => ({
    dias,
    pct: rezagos.length ? redondear1((100 * rezagos.filter((r) => r <= dias).length) / rezagos.length) : 0,
  }));
}

/**
 * Quién atendió: con 0 o 1 mensajes el asesor solo saludó o pasó un dato;
 * si escribió más que el bot, la venta es suya (JP, 8-sep); el resto, los dos.
 */
export function grupoDeAtencion(mensajesAsesor: number, mensajesBot: number): GrupoAtencion {
  if (mensajesAsesor <= 1) return "bot";
  if (mensajesAsesor > mensajesBot) return "asesor";
  return "bot_y_asesor";
}

/** Cuántos días de chats abiertos se miran para lo que falta por llegar. */
const DIAS_VIVOS = 60;
const HORIZONTE = 14;

/**
 * Ventas esperadas en los próximos 14 días de chats que ya escribieron y aún
 * no compraron. La mediana del rezago chat → factura es de 5 días y una de
 * cada cuatro llega después de dos semanas: el chat de hoy todavía puede
 * vender, el de hace 50 días ya casi no.
 *
 * `F` = acumulada empírica del rezago; para cada día `d` de los últimos 60
 * con `c_d` chats vivos y edad `a_d`: esperado += c_d · tasa · (F(a_d+14) − F(a_d)).
 * El rango son los cuantiles 2,5 % y 97,5 % de Poisson(esperado).
 */
export function ventasPorLlegar(o: {
  chatsPorDia: Array<{ dia: string; chats: number }>;
  rezagos: number[];
  tasa: number;
  hoy: string;
}): { esperado: number; bajo: number; alto: number; chatsVivos: number } {
  const F = (x: number) => (o.rezagos.length ? o.rezagos.filter((r) => r <= x).length / o.rezagos.length : 0);
  let esperado = 0;
  let chatsVivos = 0;
  for (const { dia, chats } of o.chatsPorDia) {
    const edad = diasEntre(dia, o.hoy);
    if (edad < 0 || edad >= DIAS_VIVOS || chats <= 0) continue;
    chatsVivos += chats;
    esperado += chats * o.tasa * (F(edad + HORIZONTE) - F(edad));
  }
  return {
    esperado: redondear1(esperado),
    bajo: cuantilPoisson(esperado, 0.025),
    alto: cuantilPoisson(esperado, 0.975),
    chatsVivos,
  };
}
