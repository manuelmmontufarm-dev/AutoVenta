/**
 * Los gráficos del reporte del día, en SVG.
 *
 * SVG y no imágenes ni primitivas de pdfmake por tres razones concretas:
 *
 *  · **Los dibuja una sola vez.** El PDF los mete como nodo `svg` y el HTML los
 *    escribe en línea. Un solo cálculo, dos salidas: si la dona se corrige, se
 *    corrige en los dos sitios o en ninguno.
 *  · **pdfmake no sabe hacer arcos.** Su `canvas` tiene rectángulos, líneas y
 *    elipses; una dona pedía aproximarla con decenas de polígonos. En SVG es
 *    una `A` y sale limpia a cualquier tamaño.
 *  · **Sigue siendo vectorial.** Se imprime y se hace zoom sin pixelarse, que es
 *    lo que separa esto de pegar un PNG de un servicio de gráficos.
 *
 * La paleta es la que el negocio eligió en Ajustes — la misma de las
 * cotizaciones — así que estos gráficos no traen colores propios: reciben la
 * `Palette` y se tiñen con ella. Las seis paletas funcionan porque todo se
 * construye mezclando `dark`, `accent` y `gold`, que existen en las seis.
 *
 * Las fuentes llegan por parámetro porque no se llaman igual en los dos
 * destinos: en el PDF son familias registradas en pdfmake (`Archivo`,
 * `Precio_exo`) y en el HTML son nombres CSS con sus alternativas.
 */
import type { Palette } from "./depotDesign.js";

export interface Fuentes {
  /** Etiquetas, ejes, rótulos. */
  texto: string;
  /** Sólo las cifras grandes: es la fuente de precio del negocio. */
  cifra: string;
}

/** Mezcla dos hex. El gradiente de la banda y toda la rampa salen de aquí. */
export function mezclar(a: string, b: string, proporcion: number): string {
  const canal = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mezcla = [0, 1, 2].map((i) =>
    Math.round(canal(a, i) * (1 - proporcion) + canal(b, i) * proporcion));
  return `#${mezcla.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Un SVG es XML: un `&` en el nombre de un local rompe el documento entero. */
function esc(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Dos decimales como mucho: un `d` con quince cifras infla el PDF sin verse. */
const n = (valor: number) => Math.round(valor * 100) / 100;

/**
 * Dinero corto para los ejes: `$8.4k`, `$1.2M`.
 *
 * Un eje con «$12,480» tres veces se convierte en una pared de dígitos y tapa
 * las barras. Las cifras exactas van en el texto del reporte, no en el eje.
 */
export function montoCorto(valor: number): string {
  const v = Number.isFinite(valor) ? Math.abs(valor) : 0;
  if (v >= 1_000_000) return `$${n(v / 1_000_000)}M`;
  if (v >= 1_000) return `$${Math.round(v / 100) / 10}k`;
  return `$${Math.round(v)}`;
}

/** `$12,480` — la cifra completa, sin centavos. */
export function montoEntero(valor: number): string {
  return `$${Math.round(Number.isFinite(valor) ? valor : 0).toLocaleString("en-US")}`;
}

function texto(input: {
  x: number; y: number; contenido: string; tamano: number; color: string;
  fuente: string; peso?: number; ancla?: "start" | "middle" | "end"; espaciado?: number;
}): string {
  const espaciado = input.espaciado ? ` letter-spacing="${input.espaciado}"` : "";
  return `<text x="${n(input.x)}" y="${n(input.y)}" font-family="${esc(input.fuente)}" font-size="${input.tamano}" font-weight="${input.peso ?? 400}" fill="${input.color}" text-anchor="${input.ancla ?? "start"}"${espaciado}>${esc(input.contenido)}</text>`;
}

function envolver(ancho: number, alto: number, cuerpo: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">${cuerpo.join("")}</svg>`;
}

// ===========================================================================
// Dona — cuánto se cotizó
// ===========================================================================

/**
 * Un arco de anillo, dibujado como trazo grueso sobre el radio medio.
 *
 * Como trazo y no como sector relleno: un sector necesita cuatro tramos y dos
 * radios distintos, y el trazo da el mismo anillo con una sola `A` y remates
 * redondos gratis. La proporción se recorta a 0.999 porque un círculo completo
 * con `A` degenera —el punto final coincide con el inicial y el renderizador no
 * sabe qué arco quieres—: a 99,9 % la muesca es medio grado, invisible.
 */
function anillo(input: {
  cx: number; cy: number; radio: number; grosor: number;
  proporcion: number; color: string; remate?: boolean;
}): string {
  const p = Math.max(0, Math.min(0.999, input.proporcion));
  if (p <= 0.0005) return "";
  const angulo = p * Math.PI * 2;
  const x1 = input.cx;
  const y1 = input.cy - input.radio;
  const x2 = input.cx + Math.sin(angulo) * input.radio;
  const y2 = input.cy - Math.cos(angulo) * input.radio;
  const largo = p > 0.5 ? 1 : 0;
  const remate = input.remate === false ? "" : ` stroke-linecap="round"`;
  return `<path d="M ${n(x1)} ${n(y1)} A ${input.radio} ${input.radio} 0 ${largo} 1 ${n(x2)} ${n(y2)}" fill="none" stroke="${input.color}" stroke-width="${input.grosor}"${remate}/>`;
}

function pista(cx: number, cy: number, radio: number, grosor: number, color: string): string {
  return `<circle cx="${cx}" cy="${cy}" r="${radio}" fill="none" stroke="${color}" stroke-width="${grosor}"/>`;
}

export interface DonaCotizado {
  hoy: number;
  semana: number;
  total: number;
}

/**
 * Dos anillos concéntricos: hoy dentro de la semana, la semana dentro de todo
 * lo cotizado desde que el bot existe.
 *
 * Es la respuesta a la pregunta que el asesor se hace al abrir el reporte —
 * «¿hoy fue un buen día?»— y que una cifra sola no puede contestar: $2.400 no
 * significa nada hasta que se ve contra los $14.000 de la semana. El centro
 * lleva el número de hoy porque es el dato del reporte; los anillos son el
 * contexto que lo vuelve legible.
 */
export function donaCotizado(datos: DonaCotizado, p: Palette, f: Fuentes): string {
  const W = 236;
  const H = 214;
  const cx = W / 2;
  const cy = 92;
  const pistaColor = mezclar(p.base, p.border, 0.75);

  const enSemana = datos.semana > 0 ? datos.hoy / datos.semana : 0;
  const enTotal = datos.total > 0 ? datos.semana / datos.total : 0;

  const leyenda = (y: number, color: string, etiqueta: string, valor: string) => [
    `<rect x="14" y="${y}" width="8" height="8" rx="2.5" fill="${color}"/>`,
    texto({ x: 29, y: y + 7.5, contenido: etiqueta, tamano: 8.2, color: p.tenue, fuente: f.texto, peso: 700 }),
    texto({ x: W - 14, y: y + 7.8, contenido: valor, tamano: 10, color: p.dark, fuente: f.cifra, ancla: "end" }),
  ].join("");

  return envolver(W, H, [
    pista(cx, cy, 62, 13, pistaColor),
    anillo({ cx, cy, radio: 62, grosor: 13, proporcion: enSemana, color: p.accent }),
    pista(cx, cy, 45, 11, pistaColor),
    anillo({ cx, cy, radio: 45, grosor: 11, proporcion: enTotal, color: p.gold }),
    texto({ x: cx, y: cy + 1, contenido: montoCorto(datos.hoy), tamano: 21, color: p.dark, fuente: f.cifra, ancla: "middle" }),
    // El porcentaje va en el centro y no sólo en el anillo porque el anillo,
    // cuando el día pesa poco en la semana, es un arco de dos grados: se ve que
    // es «poco» pero no cuánto, y el número lo dice sin obligar a medir.
    texto({
      x: cx, y: cy + 15,
      contenido: `HOY · ${Math.round(enSemana * 100)}% DE LA SEMANA`,
      tamano: 6.2, color: p.tenue, fuente: f.texto, peso: 700, ancla: "middle", espaciado: 0.6,
    }),
    `<line x1="14" y1="170" x2="${W - 14}" y2="170" stroke="${p.border}" stroke-width="1"/>`,
    leyenda(178, p.accent, "EN LA SEMANA", montoEntero(datos.semana)),
    leyenda(194, p.gold, "DESDE SIEMPRE", montoEntero(datos.total)),
  ]);
}

// ===========================================================================
// Barras — el movimiento del kanban
// ===========================================================================

export interface BarraFase {
  nombre: string;
  hoy: number;
  semana: number;
  /** Se sale de la rampa de color. Ver `colorDeFase`. */
  perdido?: boolean;
}

/**
 * El color de cada columna del kanban.
 *
 * Es una rampa que avanza de lo oscuro al oro conforme el cliente se acerca a
 * comprar, para que el gráfico se lea de arriba abajo como el propio embudo.
 * `perdido` se sale de la rampa a un gris apagado a propósito: si compartiera
 * la escala de los demás, una semana con muchas pérdidas se vería igual de
 * saludable que una con muchas ventas.
 */
export function colorDeFase(indice: number, total: number, p: Palette, perdido: boolean): string {
  if (perdido) return mezclar(p.tenue, p.base, 0.5);
  const avance = total > 1 ? indice / (total - 1) : 0;
  return avance <= 0.5
    ? mezclar(p.dark, p.accent, avance * 2)
    : mezclar(p.accent, p.gold, (avance - 0.5) * 2);
}

/**
 * Barras horizontales, una por columna del kanban.
 *
 * La barra clara es la semana y el tramo saturado del arranque es lo de hoy:
 * dos series en un solo trazo, así que se ve de un vistazo si el día aportó a
 * la semana o si la semana viene de días anteriores. Va horizontal y no vertical
 * porque los nombres de las etapas son largos («Seguimiento hasta venta») y en
 * vertical habría que rotarlos o abreviarlos hasta volverlos ilegibles.
 */
export function barrasKanban(fases: BarraFase[], p: Palette, f: Fuentes): string {
  const W = 268;
  const ETIQUETA = 68;
  const DERECHA = 26;
  const alto = 28;
  const hueco = 8;
  const H = Math.max(1, fases.length) * (alto + hueco) + 22;
  const plot = W - ETIQUETA - DERECHA;

  // La escala mira la semana, no el día: si se escalara al máximo de cada
  // barra, todas llegarían al borde y el gráfico no diría nada.
  const tope = Math.max(1, ...fases.map((fila) => fila.semana));
  const ancho = (valor: number) => (valor / tope) * plot;

  const rejilla = [0, 0.5, 1].map((fraccion) => {
    const x = ETIQUETA + plot * fraccion;
    return [
      `<line x1="${n(x)}" y1="0" x2="${n(x)}" y2="${H - 20}" stroke="${p.border}" stroke-width="1" stroke-dasharray="2 3"/>`,
      texto({ x: n(x), y: H - 7, contenido: String(Math.round(tope * fraccion)), tamano: 7.5, color: p.tenue, fuente: f.texto, peso: 700, ancla: fraccion === 0 ? "start" : fraccion === 1 ? "end" : "middle" }),
    ].join("");
  });

  const barras = fases.flatMap((fila, i) => {
    const y = i * (alto + hueco);
    const color = colorDeFase(i, fases.length, p, Boolean(fila.perdido));
    const largoSemana = ancho(fila.semana);
    const largoHoy = ancho(fila.hoy);
    return [
      texto({ x: ETIQUETA - 8, y: y + alto / 2 + 3, contenido: fila.nombre, tamano: 7.8, color: p.dark, fuente: f.texto, peso: 700, ancla: "end" }),
      // La pista existe aunque la semana venga en cero: sin ella, una etapa sin
      // movimiento se lee como una fila rota en vez de como un cero.
      `<rect x="${ETIQUETA}" y="${y + 5}" width="${plot}" height="${alto - 10}" rx="2.5" fill="${mezclar(p.base, p.border, 0.35)}"/>`,
      fila.semana > 0
        ? `<rect x="${ETIQUETA}" y="${y + 5}" width="${n(Math.max(largoSemana, 2.5))}" height="${alto - 10}" rx="2.5" fill="${mezclar(color, p.base, 0.5)}"/>`
        : "",
      fila.hoy > 0
        ? `<rect x="${ETIQUETA}" y="${y + 5}" width="${n(Math.max(largoHoy, 2.5))}" height="${alto - 10}" rx="2.5" fill="${color}"/>`
        : "",
      texto({ x: W - 4, y: y + alto / 2 + 3.5, contenido: String(fila.semana), tamano: 10, color: fila.semana > 0 ? p.dark : p.tenue, fuente: f.cifra, ancla: "end" }),
    ];
  });

  return envolver(W, H, [...rejilla, ...barras]);
}

// ===========================================================================
// Área — la semana día por día
// ===========================================================================

export interface PuntoSemana {
  etiqueta: string;
  valor: number;
  esHoy: boolean;
}

/**
 * Convierte los puntos en una curva suave (Catmull-Rom → Bézier).
 *
 * Una polilínea recta entre siete días da un perfil de sierra que sugiere
 * saltos bruscos que no existen; la curva deja ver la tendencia, que es lo
 * único que se le pide a este gráfico. La tensión 1/6 es la del Catmull-Rom
 * uniforme: pasa exactamente por cada punto sin inventar picos entre ellos.
 */
export function curva(puntos: Array<{ x: number; y: number }>): string {
  if (puntos.length === 0) return "";
  if (puntos.length === 1) return `M ${n(puntos[0]!.x)} ${n(puntos[0]!.y)}`;

  const partes = [`M ${n(puntos[0]!.x)} ${n(puntos[0]!.y)}`];
  for (let i = 0; i < puntos.length - 1; i += 1) {
    const p0 = puntos[Math.max(0, i - 1)]!;
    const p1 = puntos[i]!;
    const p2 = puntos[i + 1]!;
    const p3 = puntos[Math.min(puntos.length - 1, i + 2)]!;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    partes.push(`C ${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(p2.x)} ${n(p2.y)}`);
  }
  return partes.join(" ");
}

/**
 * La curva del dinero cotizado a lo largo de la semana.
 *
 * Un solo dato por día y una sola serie: es el gráfico más grande de la portada
 * y el que decide si el asesor pasa de página, así que tiene que contestar una
 * pregunta —¿la semana sube o baja?— sin que haya que estudiarlo. El día que
 * cierra el reporte lleva punto lleno y su cifra encima; los demás, punto hueco.
 */
export function areaSemana(puntos: PuntoSemana[], p: Palette, f: Fuentes): string {
  const W = 516;
  const H = 158;
  const IZQ = 40;
  const ARRIBA = 20;
  const ABAJO = 26;
  const plotW = W - IZQ - 12;
  const plotH = H - ARRIBA - ABAJO;

  // El tope se redondea hacia arriba a una cifra limpia para que la línea de
  // referencia diga «$3k» y no «$2.847»: el eje da la escala, no el detalle.
  const maximo = Math.max(1, ...puntos.map((punto) => punto.valor));
  const magnitud = 10 ** Math.floor(Math.log10(maximo));
  const tope = Math.ceil(maximo / magnitud) * magnitud;

  const x = (i: number) => IZQ + (puntos.length > 1 ? (i / (puntos.length - 1)) * plotW : plotW / 2);
  const y = (valor: number) => ARRIBA + plotH - (valor / tope) * plotH;

  const coordenadas = puntos.map((punto, i) => ({ x: x(i), y: y(punto.valor) }));
  const linea = curva(coordenadas);
  const area = coordenadas.length
    ? `${linea} L ${n(coordenadas[coordenadas.length - 1]!.x)} ${ARRIBA + plotH} L ${n(coordenadas[0]!.x)} ${ARRIBA + plotH} Z`
    : "";

  const rejilla = [0, 0.5, 1].flatMap((fraccion) => {
    const altura = ARRIBA + plotH * fraccion;
    return [
      `<line x1="${IZQ}" y1="${n(altura)}" x2="${W - 12}" y2="${n(altura)}" stroke="${p.border}" stroke-width="1" stroke-dasharray="2 3"/>`,
      texto({ x: IZQ - 7, y: n(altura) + 3, contenido: montoCorto(tope * (1 - fraccion)), tamano: 7.5, color: p.tenue, fuente: f.texto, peso: 700, ancla: "end" }),
    ];
  });

  const marcas = puntos.flatMap((punto, i) => {
    const px = x(i);
    const py = y(punto.valor);
    return [
      punto.esHoy ? `<line x1="${n(px)}" y1="${ARRIBA - 6}" x2="${n(px)}" y2="${ARRIBA + plotH}" stroke="${p.accent}" stroke-width="1" stroke-dasharray="2 3"/>` : "",
      `<circle cx="${n(px)}" cy="${n(py)}" r="${punto.esHoy ? 4.2 : 2.8}" fill="${punto.esHoy ? p.accent : p.panel}" stroke="${p.accent}" stroke-width="1.6"/>`,
      // El valor del día se ancla a su borde en los extremos: centrado sobre el
      // último punto —que es donde cae casi siempre, porque hoy cierra la
      // serie— la mitad de la cifra quedaba fuera de la tarjeta.
      punto.esHoy
        ? texto({
            x: n(px), y: n(py) - 10, contenido: montoCorto(punto.valor), tamano: 9.5,
            color: p.accent, fuente: f.cifra,
            ancla: i === 0 ? "start" : i === puntos.length - 1 ? "end" : "middle",
          })
        : "",
      texto({
        x: n(px), y: H - 8, contenido: punto.etiqueta, tamano: 7.5,
        color: punto.esHoy ? p.dark : p.tenue, fuente: f.texto, peso: 700,
        // Los extremos se anclan a su borde: centrados, el «lun 4» de la
        // izquierda se salía de la tarjeta por la mitad.
        ancla: i === 0 ? "start" : i === puntos.length - 1 ? "end" : "middle",
      }),
    ];
  });

  return envolver(W, H, [
    ...rejilla,
    area ? `<path d="${area}" fill="${mezclar(p.base, p.accent, 0.16)}"/>` : "",
    linea ? `<path d="${linea}" fill="none" stroke="${p.accent}" stroke-width="2.2" stroke-linejoin="round"/>` : "",
    ...marcas,
  ]);
}

// ===========================================================================
// Barras finas — cuánta gente escribió cada día
// ===========================================================================

/**
 * El acompañante del área: el volumen de conversación de la semana.
 *
 * Existe porque el dinero cotizado sin el número de clientes engaña — un día de
 * $6.000 puede ser veinte clientes o uno con seis llantas. Va como barras y no
 * como otra curva para que no se confunda con la serie de arriba.
 */
export function barrasConversaciones(puntos: PuntoSemana[], p: Palette, f: Fuentes): string {
  const W = 516;
  const H = 74;
  const IZQ = 40;
  const ARRIBA = 12;
  const ABAJO = 16;
  const plotW = W - IZQ - 12;
  const plotH = H - ARRIBA - ABAJO;
  const tope = Math.max(1, ...puntos.map((punto) => punto.valor));
  const paso = puntos.length > 0 ? plotW / puntos.length : plotW;
  const ancho = Math.min(34, paso * 0.5);

  const barras = puntos.flatMap((punto, i) => {
    const centro = IZQ + paso * (i + 0.5);
    const alto = Math.max(punto.valor > 0 ? 2 : 0, (punto.valor / tope) * plotH);
    return [
      `<rect x="${n(centro - ancho / 2)}" y="${n(ARRIBA + plotH - alto)}" width="${n(ancho)}" height="${n(alto)}" rx="2.5" fill="${punto.esHoy ? p.accent : mezclar(p.accent, p.base, 0.62)}"/>`,
      texto({ x: n(centro), y: n(ARRIBA + plotH - alto) - 4, contenido: String(punto.valor), tamano: 8, color: punto.esHoy ? p.accent : p.tenue, fuente: f.cifra, ancla: "middle" }),
    ];
  });

  return envolver(W, H, [
    `<line x1="${IZQ}" y1="${ARRIBA + plotH}" x2="${W - 12}" y2="${ARRIBA + plotH}" stroke="${p.border}" stroke-width="1"/>`,
    texto({ x: IZQ - 7, y: ARRIBA + plotH + 3, contenido: "0", tamano: 7.5, color: p.tenue, fuente: f.texto, peso: 700, ancla: "end" }),
    ...barras,
  ]);
}
