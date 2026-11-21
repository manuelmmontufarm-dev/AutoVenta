/**
 * El reporte del día, modelo simple.
 *
 * El reporte original (`dailyReportPdf`) es un tablero de cuatro gráficos y
 * después una tarjeta por conversación: sirve para mirar el negocio, pero el
 * asesor que lo abre a las ocho de la noche quiere contestar tres preguntas y
 * cerrar el archivo:
 *
 *  1. **¿Quién viene y cuándo?** — los que dieron fecha. Es lo único del
 *     reporte que obliga a hacer algo mañana (tener las llantas listas).
 *  2. **¿Qué se cotizó hoy?** — a quién hay que empujar.
 *  3. **¿Qué se vendió?** — sólo lo confirmado con factura, y sólo si hubo.
 *     Un «0 ventas» todas las noches desmotiva y no dice nada.
 *
 * Todo lo demás (kanban, histórico, errores, técnicos) se queda en el panel y
 * aquí ocupa una sola línea al pie.
 *
 * Límite duro: una página y media. Por eso cada lista tiene tope y el resto se
 * cuenta («y 4 más en el panel»). Los topes están medidos para que el peor día
 * —todas las listas llenas— no pase de la mitad de la segunda hoja.
 *
 * Recibe su propio modelo de datos (`ReporteSimple`) y no el `ReporteDiario`
 * del reporte original, porque necesita cosas que aquél no trae: la fecha de
 * visita como fecha (no como etiqueta), las cotizaciones del día una por una y
 * las ventas con su número de factura.
 */
import pdfmake from "pdfmake";
import { resolvePalette, type Palette } from "./depotDesign.js";
import { depotLogo } from "./assets.js";
import { mezclar, montoEntero } from "./reportCharts.js";
import { registrarFuentes, soloTexto } from "./dailyReportPdf.js";
import { negocio, nombreEnDosTonos } from "../negocio/index.js";

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

export interface PersonaConFecha {
  nombre: string;
  link: string;
  /** La franja que dijo el cliente («de 4 a 5 pm»), o null si sólo dijo el día. */
  hora: string | null;
  /** «4 × 205/55R16 Falken» — qué hay que tener listo. */
  llantas: string | null;
  local: string | null;
  monto: number | null;
}

export interface DiaDeVisitas {
  /** «SÁB» */
  corto: string;
  /** «21» */
  numero: string;
  /** «MAÑANA · sábado 21» — el rótulo del grupo en la lista. */
  titulo: string;
  personas: PersonaConFecha[];
}

export interface NoVino extends PersonaConFecha {
  /** «hoy», «ayer», «mié 18» — cuándo había dicho que venía. */
  cuando: string;
}

export type EstadoCotizacion = "con_fecha" | "pensando" | "sin_respuesta";

export interface CotizacionDelDia {
  nombre: string;
  link: string;
  llantas: string | null;
  monto: number;
  estado: EstadoCotizacion;
  /** Sólo con `con_fecha`: «viene sáb 21». */
  nota?: string;
}

export interface VentaConfirmadaDelDia {
  nombre: string;
  link: string;
  llantas: string;
  factura: string;
  local: string | null;
  total: number;
}

export interface ReporteSimple {
  negocio: string;
  paleta: string;
  fuente: string;
  /** «viernes 20 de noviembre» */
  dia: string;
  diaClave: string;
  linkOportunidades: string;
  /** De cuántos escribieron a cuántos compraron, hoy. */
  embudo: { escribieron: number; cotizados: number; dieronFecha: number; compraron: number };
  vienen: {
    /** Los próximos siete días, con o sin gente: el hueco también se dibuja. */
    dias: DiaDeVisitas[];
    total: number;
    monto: number;
    noVinieron: NoVino[];
  };
  cotizado: {
    total: number;
    monto: number;
    filas: CotizacionDelDia[];
    /** Plata cotizada en cada uno de los últimos siete días; el último es hoy. */
    semana: Array<{ etiqueta: string; monto: number }>;
  };
  vendido: { total: number; monto: number; filas: VentaConfirmadaDelDia[] };
  /** Lo que no entra en este reporte pero el asesor debe saber que existe. */
  enElPanel: { pidenAsesor: number; errores: number };
}

// ---------------------------------------------------------------------------
// Medidas y colores
// ---------------------------------------------------------------------------

const MARGEN_X = 32;
const BANDA_H = 56;
const BARRA_H = 3;
const TOPE = BANDA_H + BARRA_H + 14;
const ANCHO = 595.28 - MARGEN_X * 2;
const APOYO = "#6d7178";
/** Gris muy claro de las tarjetas: separa sin dibujar bordes. */
const FONDO_TARJETA = "#f3f4f5";
/** Fijos, fuera de la paleta: «vendido» y «no vino» significan lo mismo en las seis. */
const VERDE = "#1f8a5b";

/** Topes de cada lista. Con los cuatro llenos el documento mide ~1,4 páginas. */
export const TOPES = { vienen: 9, noVinieron: 3, cotizado: 6, vendido: 4 };

const SIN_LINEAS = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
};

/**
 * `tinta`, `gris` y `suave` son neutros fijos; `marca` es el ÚNICO color de la
 * paleta que entra al cuerpo del documento.
 *
 * La primera versión pintaba con acento, oro y oscuro a la vez y el reporte se
 * veía como un volante (Manuel, 20-nov: «no me gusta el tomate de colores»).
 * Ahora casi todo es negro sobre blanco y el color significa algo: `marca`
 * señala a quién hay que escribirle, el verde es plata cobrada. Nada más.
 */
interface Estilo { p: Palette; precio: string; tinta: string; gris: string; suave: string; marca: string }

const TINTA = "#1d1f22";
const BLANCO = "#ffffff";
const SOBRE_TINTA = "#a9adb3";

/** Qué tan «color» es un hex: 0 = gris, 1 = saturado. */
function croma(hex: string): number {
  const [r, g, b] = [0, 1, 2].map((i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16));
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

/** El color de la marca: el acento, salvo en las paletas donde el acento es negro. */
export function colorDeMarca(p: Palette): string {
  return croma(p.accent) >= croma(p.dark) ? p.accent : p.dark;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => Math.round(v * 100) / 100;

function filete(color: string, y: number, ancho: number, alto: number) {
  return [{ type: "rect", x: 0, y, w: ancho, h: alto, color }];
}

function pastilla(texto: string, fondo: string, color: string, tamano = 6.8) {
  return {
    width: "auto",
    table: {
      widths: ["auto"],
      body: [[{ text: soloTexto(texto), fontSize: tamano, bold: true, color, fillColor: fondo, margin: [5, 2.5, 5, 2.5], characterSpacing: 0.3 }]],
    },
    layout: SIN_LINEAS,
  };
}

function linea(e: Estilo, ancho = ANCHO, margen: number[] = [0, 0, 0, 0]) {
  return { canvas: [{ type: "line", x1: 0, y1: 0, x2: ancho, y2: 0, lineWidth: 0.5, lineColor: e.suave }], margin: margen };
}

// ---------------------------------------------------------------------------
// Arriba: las tres cifras y el embudo
// ---------------------------------------------------------------------------

/** Siete barritas: la plata cotizada de la semana, con hoy en el acento. */
function miniSemana(e: Estilo, semana: ReporteSimple["cotizado"]["semana"], ancho: number, alto: number) {
  const max = Math.max(1, ...semana.map((d) => d.monto));
  const paso = ancho / semana.length;
  return {
    width: ancho,
    margin: [0, 6, 0, 0],
    stack: [
      {
        canvas: semana.map((d, i) => {
          const h = Math.max(2, (d.monto / max) * alto);
          const hoy = i === semana.length - 1;
          return { type: "rect", x: i * paso, y: alto - h, w: paso - 2.5, h, color: hoy ? e.tinta : e.suave };
        }),
      },
      { text: "7 DÍAS", fontSize: 5, bold: true, color: APOYO, characterSpacing: 0.5, margin: [0, 2, 0, 0], alignment: "right" },
    ],
  };
}

function cifra(e: Estilo, o: {
  etiqueta: string; numero: string; unidad?: string; pie: string;
  filo: string; fondo: string; tinta: string; sub: string; lado?: unknown;
}) {
  return {
    width: "*",
    table: {
      widths: ["*"],
      heights: [2, 62],
      body: [
        [{ text: "", fillColor: o.filo }],
        [{
          fillColor: o.fondo,
          margin: [11, 8, 10, 8],
          columns: [
            {
              width: "*",
              stack: [
                { text: o.etiqueta, fontSize: 6.8, bold: true, characterSpacing: 0.9, color: o.sub },
                {
                  margin: [0, 3, 0, 0],
                  text: [
                    { text: o.numero, font: e.precio, fontSize: 27, color: o.tinta },
                    ...(o.unidad ? [{ text: ` ${o.unidad}`, fontSize: 8.5, bold: true, color: o.sub }] : []),
                  ],
                },
                { text: soloTexto(o.pie), fontSize: 7.5, bold: true, color: o.sub, margin: [0, 1, 0, 0] },
              ],
            },
            ...(o.lado ? [o.lado] : []),
          ],
        }],
      ],
    },
    layout: SIN_LINEAS,
  };
}

function cifras(r: ReporteSimple, e: Estilo) {
  const hayVenta = r.vendido.total > 0;
  return {
    columnGap: 8,
    columns: [
      cifra(e, {
        etiqueta: "VIENEN", numero: String(r.vienen.total), unidad: r.vienen.total === 1 ? "persona" : "personas",
        pie: r.vienen.total ? `dieron fecha · ${montoEntero(r.vienen.monto)}` : "nadie dio fecha todavía",
        filo: e.tinta, fondo: e.tinta, tinta: BLANCO, sub: SOBRE_TINTA,
      }),
      cifra(e, {
        etiqueta: "COTIZADO HOY", numero: montoEntero(r.cotizado.monto),
        pie: `${r.cotizado.total} ${r.cotizado.total === 1 ? "cotización" : "cotizaciones"}`,
        filo: e.tinta, fondo: FONDO_TARJETA, tinta: e.tinta, sub: e.gris,
        lado: miniSemana(e, r.cotizado.semana, 50, 30),
      }),
      // Sin venta no hay tercera cifra: las otras dos se reparten el ancho.
      ...(hayVenta ? [cifra(e, {
        etiqueta: "VENDIDO CONFIRMADO", numero: montoEntero(r.vendido.monto),
        pie: `${r.vendido.total} ${r.vendido.total === 1 ? "venta" : "ventas"} con factura`,
        filo: VERDE, fondo: FONDO_TARJETA, tinta: VERDE, sub: e.gris,
      })] : []),
    ],
  };
}

/**
 * El día en una tira: escribieron → cotizados → dieron fecha → compraron.
 *
 * Cada paso es una flecha cuyo alto es su proporción del primero, así que se ve
 * dónde se cae la gente sin leer un solo número. El último paso se pinta verde
 * si hubo venta y desaparece si no: una flecha con «0» es el mismo «0 ventas»
 * que se quitó de arriba.
 */
function embudo(r: ReporteSimple, e: Estilo): string {
  const pasos = [
    { valor: r.embudo.escribieron, rotulo: "escribieron", color: mezclar(e.tinta, BLANCO, 0.58) },
    { valor: r.embudo.cotizados, rotulo: "con cotización", color: mezclar(e.tinta, BLANCO, 0.36) },
    { valor: r.embudo.dieronFecha, rotulo: "dieron fecha", color: e.tinta },
    ...(r.embudo.compraron > 0 ? [{ valor: r.embudo.compraron, rotulo: "compraron", color: VERDE }] : []),
  ];
  const W = ANCHO, H = 40, punta = 9, hueco = 4;
  const paso = (W - hueco * (pasos.length - 1)) / pasos.length;
  // Sobre el mayor de todos y no sobre el primero: «compraron» puede superar a
  // «dieron fecha» (compró alguien de otro día) y la flecha no debe salirse.
  const max = Math.max(1, ...pasos.map((s) => s.valor));

  const piezas = pasos.map((s, i) => {
    const h = Math.max(15, (s.valor / max) * H);
    const y = (H - h) / 2;
    const x = i * (paso + hueco);
    const ultimo = i === pasos.length - 1;
    const pts = [
      [x, y], [x + paso - (ultimo ? 0 : punta), y], [x + paso, y + h / 2],
      [x + paso - (ultimo ? 0 : punta), y + h], [x, y + h],
      ...(i === 0 ? [] : [[x + punta, y + h / 2]]),
    ].map(([a, b]) => `${n(a)},${n(b)}`).join(" ");
    const cx = x + paso / 2 + (i === 0 ? 0 : punta / 2) - (ultimo ? 0 : punta / 2);
    return `<polygon points="${pts}" fill="${s.color}"/>`
      + `<text x="${n(cx - 4)}" y="${n(H / 2 + 5)}" font-family="${e.precio}" font-size="15" fill="#ffffff" text-anchor="end">${s.valor}</text>`
      + `<text x="${n(cx)}" y="${n(H / 2 + 3)}" font-family="Archivo" font-size="7" font-weight="700" fill="#ffffff" text-anchor="start">${esc(s.rotulo)}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${piezas.join("")}</svg>`;
}

// ---------------------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------------------

function titulo(e: Estilo, color: string, texto: string, sub: string, derecha?: string, colorCifra?: string) {
  return {
    margin: [0, 15, 0, 7],
    columns: [
      {
        width: 12,
        canvas: [{ type: "polyline", closePath: true, color, points: [{ x: 4, y: 2 }, { x: 9, y: 2 }, { x: 5, y: 13 }, { x: 0, y: 13 }] }],
      },
      {
        width: "*",
        text: [
          { text: texto, font: "ArchivoBlack", fontSize: 12.5, color: e.tinta },
          { text: `   ${soloTexto(sub)}`, fontSize: 7.5, color: APOYO },
        ],
      },
      ...(derecha ? [{ width: "auto", text: derecha, font: e.precio, fontSize: 13, color: colorCifra ?? e.tinta, margin: [0, 0, 0, 0] }] : []),
    ],
  };
}

/**
 * La semana que viene, un cuadro por día.
 *
 * Es el gráfico más útil del reporte: el asesor ve de un golpe que el sábado
 * hay cuatro y el martes nadie. Un punto por persona en vez de una barra,
 * porque aquí se cuentan personas con nombre y nunca son más de un puñado.
 */
function agenda(r: ReporteSimple, e: Estilo) {
  const hueco = 5;
  const w = (ANCHO - hueco * (r.vienen.dias.length - 1)) / r.vienen.dias.length;
  return {
    columnGap: hueco,
    columns: r.vienen.dias.map((d, i) => {
      const hay = d.personas.length > 0;
      const primero = i === 0;
      const fondo = !hay ? BLANCO : primero ? e.tinta : FONDO_TARJETA;
      const tinta = !hay ? "#b9bcc1" : primero ? BLANCO : e.tinta;
      const punto = primero ? BLANCO : e.tinta;
      const monto = d.personas.reduce((s, x) => s + (x.monto ?? 0), 0);
      const visibles = Math.min(d.personas.length, 6);
      return {
        width: w,
        table: {
          widths: ["*"],
          heights: [hay ? 2.5 : 2.5, 50],
          body: [
            [{ text: "", fillColor: hay ? e.tinta : e.suave }],
            [{
              fillColor: fondo,
              margin: [7, 5, 6, 5],
              stack: [
                {
                  text: [
                    { text: d.corto, fontSize: 6.5, bold: true, characterSpacing: 0.6, color: hay && primero ? SOBRE_TINTA : hay ? e.gris : tinta },
                    { text: `  ${d.numero}`, font: "ArchivoBlack", fontSize: 12, color: tinta },
                  ],
                },
                hay
                  ? {
                      margin: [0, 5, 0, 0],
                      canvas: Array.from({ length: visibles }, (_, k) => ({ type: "ellipse", x: 3.5 + k * 9.5, y: 3.5, r1: 3.5, r2: 3.5, color: punto })),
                    }
                  : { text: "—", fontSize: 9, color: e.suave, margin: [0, 3, 0, 0] },
                hay
                  ? {
                      margin: [0, 4, 0, 0],
                      text: [
                        { text: `${d.personas.length} `, fontSize: 7.5, bold: true, color: tinta },
                        { text: monto ? `· ${montoEntero(monto)}` : "", fontSize: 7.5, color: primero ? SOBRE_TINTA : e.gris },
                      ],
                    }
                  : { text: "" },
              ],
            }],
          ],
        },
        layout: SIN_LINEAS,
      };
    }),
  };
}

/** Una persona en una línea: hora · quién y qué · dónde · cuánto. */
function filaPersona(e: Estilo, x: PersonaConFecha, hora: string, colorHora: string) {
  // La franja es texto libre del cliente: corta entra grande, larga baja de cuerpo.
  const cuerpoHora = hora.length <= 5 ? 11 : hora.length <= 10 ? 9.5 : 8;
  return {
    margin: [0, 4.5, 0, 4.5],
    columnGap: 8,
    columns: [
      { width: 62, text: soloTexto(hora), font: e.precio, fontSize: cuerpoHora, color: colorHora, margin: [0, cuerpoHora < 11 ? 2 : 1, 0, 0] },
      {
        width: "*",
        stack: [
          { text: soloTexto(x.nombre), link: x.link, bold: true, fontSize: 9.5, color: e.tinta },
          { text: soloTexto(x.llantas ?? "Sin medida confirmada"), fontSize: 7.5, color: e.gris, margin: [0, 1, 0, 0] },
        ],
      },
      { width: 78, text: soloTexto(x.local ?? ""), fontSize: 7.5, color: e.gris, alignment: "right", margin: [0, 3, 0, 0] },
      { width: 58, text: x.monto == null ? "—" : montoEntero(x.monto), font: e.precio, fontSize: 11.5, color: x.monto == null ? e.gris : e.tinta, alignment: "right", margin: [0, 1, 0, 0] },
    ],
  };
}

function vienen(r: ReporteSimple, e: Estilo) {
  const bloques: unknown[] = [
    {
      unbreakable: true,
      stack: [
        titulo(e, e.marca, "QUIÉN VIENE", "Dieron fecha. Tener las llantas listas.", r.vienen.total ? montoEntero(r.vienen.monto) : undefined),
        agenda(r, e),
      ],
    },
  ];

  let cupo = TOPES.vienen;
  let primero = true;
  for (const d of r.vienen.dias) {
    if (!d.personas.length || cupo <= 0) continue;
    const personas = d.personas.slice(0, cupo);
    cupo -= personas.length;
    const filas = personas.map((x) => filaPersona(e, x, x.hora ?? "en el día", x.hora ? e.tinta : e.gris));
    const cabeza = {
      margin: [0, 9, 0, 2],
      columns: [pastilla(d.titulo.toUpperCase(), primero ? e.tinta : FONDO_TARJETA, primero ? BLANCO : e.gris), { width: "*", text: "" }],
    };
    // La cabecera viaja pegada a su primera fila: si no, un grupo que arranca
    // al final de la hoja deja el rótulo solo abajo.
    bloques.push({ unbreakable: true, stack: [cabeza, filas[0]] });
    for (const f of filas.slice(1)) bloques.push(linea(e), f);
    primero = false;
  }
  const listadas = TOPES.vienen - cupo;
  if (r.vienen.total > listadas) {
    bloques.push({ text: `y ${r.vienen.total - listadas} más en el panel`, fontSize: 7.5, color: APOYO, margin: [70, 3, 0, 0] });
  }
  if (r.vienen.total === 0) {
    bloques.push({ text: "Nadie dio fecha para los próximos días.", fontSize: 8.5, italics: true, color: APOYO, margin: [0, 8, 0, 0] });
  }

  const faltaron = r.vienen.noVinieron.slice(0, TOPES.noVinieron);
  if (faltaron.length) {
    const filas = faltaron.map((x) => filaPersona(e, x, x.cuando, e.tinta));
    bloques.push({
      unbreakable: true,
      margin: [0, 10, 0, 0],
      table: {
        widths: [3, "*"],
        body: [[
          { text: "", fillColor: e.tinta },
          {
            fillColor: FONDO_TARJETA,
            margin: [9, 7, 9, 3],
            stack: [
              { text: `TENÍAN FECHA Y YA PASÓ · ${r.vienen.noVinieron.length}  —  confirmar si vinieron`, fontSize: 7, bold: true, characterSpacing: 0.4, color: e.tinta },
              ...filas,
              ...(r.vienen.noVinieron.length > faltaron.length
                ? [{ text: `y ${r.vienen.noVinieron.length - faltaron.length} más en el panel`, fontSize: 7.5, color: APOYO, margin: [70, 0, 0, 4] }]
                : []),
            ],
          },
        ]],
      },
      layout: SIN_LINEAS,
    });
  }
  return bloques;
}

/**
 * El único lugar donde entra el color de la marca: quien respondió y todavía no
 * da fecha es la persona más cerca de decidirse, y es a quien hay que escribir.
 */
const ESTADO: Record<EstadoCotizacion, { rotulo: string; color: (e: Estilo) => string }> = {
  con_fecha: { rotulo: "ya dio fecha", color: (e) => e.tinta },
  pensando: { rotulo: "respondió, sin fecha", color: (e) => e.marca },
  sin_respuesta: { rotulo: "no respondió", color: () => "#b9bcc1" },
};

/**
 * Una barra partida en tres: de la plata cotizada hoy, cuánta ya tiene fecha,
 * cuánta se está pensando y cuánta quedó sin respuesta.
 */
function reparto(r: ReporteSimple, e: Estilo) {
  const orden: EstadoCotizacion[] = ["con_fecha", "pensando", "sin_respuesta"];
  const suma = (estado: EstadoCotizacion) => r.cotizado.filas.filter((f) => f.estado === estado).reduce((s, f) => s + f.monto, 0);
  const cuenta = (estado: EstadoCotizacion) => r.cotizado.filas.filter((f) => f.estado === estado).length;
  const total = Math.max(1, orden.reduce((s, k) => s + suma(k), 0));
  let x = 0;
  const tramos = orden.map((k) => {
    const w = (suma(k) / total) * ANCHO;
    const rect = { type: "rect", x, y: 0, w: Math.max(0, w - 1.5), h: 9, color: ESTADO[k].color(e) };
    x += w;
    return rect;
  });
  return [
    { canvas: tramos },
    {
      margin: [0, 5, 0, 2],
      columnGap: 14,
      columns: [
        ...orden.filter((k) => cuenta(k) > 0).map((k) => ({
          width: "auto",
          columnGap: 2,
          columns: [
            { width: 9, canvas: [{ type: "rect", x: 0, y: 1.5, w: 6, h: 6, color: ESTADO[k].color(e) }] },
            {
              width: "auto",
              text: [
                { text: `${cuenta(k)} ${ESTADO[k].rotulo}`, fontSize: 7.5, bold: true, color: e.tinta },
                { text: `  ${montoEntero(suma(k))}`, fontSize: 7.5, color: e.gris },
              ],
            },
          ],
        })),
        { width: "*", text: "" },
      ],
    },
  ];
}

function cotizado(r: ReporteSimple, e: Estilo) {
  if (r.cotizado.total === 0) {
    return [
      titulo(e, e.marca, "COTIZADO HOY", "A quién hay que empujar."),
      { text: "Hoy no salió ninguna cotización.", fontSize: 8.5, italics: true, color: APOYO },
    ];
  }
  // Los que ya dieron fecha están arriba, en «Quién viene», con su hora: aquí
  // serían la misma persona dos veces. La barra de reparto sí los cuenta; la
  // lista es sólo de quien todavía no se decide, que es a quien hay que escribir.
  const porEmpujar = r.cotizado.filas.filter((f) => f.estado !== "con_fecha");
  const filas = porEmpujar.slice(0, TOPES.cotizado);
  const max = Math.max(1, ...filas.map((f) => f.monto));
  const BARRA = 120;
  const fila = (f: CotizacionDelDia) => {
    const color = ESTADO[f.estado].color(e);
    return {
      margin: [0, 4, 0, 4],
      columnGap: 8,
      columns: [
        { width: 8, canvas: [{ type: "ellipse", x: 4, y: 7, r1: 3.5, r2: 3.5, color }] },
        {
          width: "*",
          stack: [
            { text: soloTexto(f.nombre), link: f.link, bold: true, fontSize: 9.5, color: e.tinta },
            {
              margin: [0, 1, 0, 0],
              text: [
                { text: soloTexto(f.llantas ?? ""), fontSize: 7.5, color: e.gris },
                { text: `   ${soloTexto(f.nota ?? ESTADO[f.estado].rotulo)}`, fontSize: 7.5, bold: true, color: f.estado === "sin_respuesta" ? e.gris : color },
              ],
            },
          ],
        },
        {
          width: BARRA,
          margin: [0, 4, 0, 0],
          canvas: [
            { type: "rect", x: 0, y: 0, w: BARRA, h: 7, color: FONDO_TARJETA },
            { type: "rect", x: 0, y: 0, w: Math.max(3, (f.monto / max) * BARRA), h: 7, color },
          ],
        },
        { width: 58, text: montoEntero(f.monto), font: e.precio, fontSize: 11.5, color: e.tinta, alignment: "right", margin: [0, 1, 0, 0] },
      ],
    };
  };

  const cuerpo = filas.map(fila);
  return [
    {
      unbreakable: true,
      stack: [
        titulo(e, e.marca, "COTIZADO HOY", "Abajo, los que aún no dan fecha: a ellos hay que escribirles.", montoEntero(r.cotizado.monto)),
        ...reparto(r, e),
        ...(cuerpo.length ? [cuerpo[0]] : [{ text: "Todos los cotizados de hoy ya dieron fecha.", fontSize: 8.5, italics: true, color: APOYO, margin: [0, 4, 0, 0] }]),
      ],
    },
    ...cuerpo.slice(1).flatMap((f) => [linea(e), f]),
    ...(porEmpujar.length > filas.length
      ? [{ text: `y ${porEmpujar.length - filas.length} más en el panel`, fontSize: 7.5, color: APOYO, margin: [16, 3, 0, 0] }]
      : []),
  ];
}

/** Sólo existe si se vendió algo. Verde, con el número de factura como prueba. */
function vendido(r: ReporteSimple, e: Estilo) {
  if (r.vendido.total === 0) return [];
  const filas = r.vendido.filas.slice(0, TOPES.vendido);
  const tinte = mezclar(BLANCO, VERDE, 0.07);
  return [{
    unbreakable: true,
    stack: [
      titulo(e, VERDE, "VENDIDO CONFIRMADO", "Chats del bot que ya tienen factura.", montoEntero(r.vendido.monto), VERDE),
      {
        table: {
          widths: [3, "*"],
          body: [[
            { text: "", fillColor: VERDE },
            {
              fillColor: tinte,
              margin: [10, 4, 10, 4],
              stack: filas.flatMap((v, i) => [
                ...(i ? [{ canvas: [{ type: "line", x1: 0, y1: 0, x2: ANCHO - 23, y2: 0, lineWidth: 0.5, lineColor: mezclar(tinte, VERDE, 0.25) }] }] : []),
                {
                  margin: [0, 5, 0, 5],
                  columnGap: 8,
                  columns: [
                    {
                      width: 14,
                      canvas: [
                        { type: "ellipse", x: 7, y: 8, r1: 7, r2: 7, color: VERDE },
                        { type: "polyline", lineWidth: 1.6, lineColor: "#ffffff", points: [{ x: 3.6, y: 8.2 }, { x: 6.1, y: 10.7 }, { x: 10.6, y: 5.6 }] },
                      ],
                    },
                    {
                      width: "*",
                      stack: [
                        { text: soloTexto(v.nombre), link: v.link, bold: true, fontSize: 9.5, color: e.tinta },
                        { text: soloTexto(v.llantas), fontSize: 7.5, color: e.gris, margin: [0, 1, 0, 0] },
                      ],
                    },
                    {
                      width: 150, alignment: "right", margin: [0, 2, 0, 0],
                      stack: [
                        { text: `Factura ${soloTexto(v.factura)}`, fontSize: 7.5, bold: true, color: e.tinta },
                        { text: soloTexto(v.local ?? ""), fontSize: 7, color: e.gris, margin: [0, 1, 0, 0] },
                      ],
                    },
                    { width: 58, text: montoEntero(v.total), font: e.precio, fontSize: 12.5, color: VERDE, alignment: "right", margin: [0, 1, 0, 0] },
                  ],
                },
              ]),
            },
          ]],
        },
        layout: SIN_LINEAS,
      },
      ...(r.vendido.total > filas.length
        ? [{ text: `y ${r.vendido.total - filas.length} más en Métricas`, fontSize: 7.5, color: APOYO, margin: [16, 3, 0, 0] }]
        : []),
    ],
  }];
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

function fondo(r: ReporteSimple, e: Estilo) {
  return (_pagina: number, tamano: { width: number; height: number }) => {
    const W = tamano.width;
    const logo = depotLogo("blanco");
    const alto = 19;
    return [
      {
        absolutePosition: { x: 0, y: 0 },
        canvas: [
          { type: "rect", x: 0, y: 0, w: W, h: tamano.height, color: BLANCO },
          { type: "rect", x: 0, y: 0, w: W, h: BANDA_H, color: e.p.dark },
          ...filete(e.marca === e.p.dark ? e.tinta : e.marca, BANDA_H, W, BARRA_H),
        ],
      },
      logo
        ? { absolutePosition: { x: MARGEN_X, y: (BANDA_H - alto) / 2 }, image: logo.dataUri, height: alto, width: alto * (logo.width / logo.height) }
        : {
            absolutePosition: { x: MARGEN_X, y: (BANDA_H - alto) / 2 },
            text: nombreEnDosTonos(negocio).map(([palabra, dorada]) => ({ text: palabra, color: dorada ? BLANCO : BLANCO })),
            font: "ArchivoBlack", fontSize: alto,
          },
      {
        absolutePosition: { x: MARGEN_X, y: 13 },
        table: {
          widths: [W - MARGEN_X * 2],
          body: [
            [{ text: "REPORTE DEL DÍA", fontSize: 6.5, bold: true, characterSpacing: 1.4, color: SOBRE_TINTA, alignment: "right" }],
            [{ text: soloTexto(r.dia), font: "ArchivoBlack", fontSize: 15, color: BLANCO, alignment: "right", margin: [0, 2, 0, 0] }],
          ],
        },
        layout: SIN_LINEAS,
      },
    ];
  };
}

function documento(r: ReporteSimple, e: Estilo) {
  const otros = [
    r.enElPanel.pidenAsesor ? `${r.enElPanel.pidenAsesor} esperan un asesor` : null,
    r.enElPanel.errores ? `${r.enElPanel.errores} ${r.enElPanel.errores === 1 ? "chat con error" : "chats con error"}` : null,
  ].filter(Boolean).join("  ·  ");

  return {
    pageSize: "A4",
    pageMargins: [MARGEN_X, TOPE, MARGEN_X, 44],
    defaultStyle: { font: "Archivo", fontSize: 9, color: e.tinta },
    background: fondo(r, e),
    content: [
      cifras(r, e),
      { svg: embudo(r, e), width: ANCHO, font: "Archivo", margin: [0, 9, 0, 0] },
      ...vienen(r, e),
      ...cotizado(r, e),
      ...vendido(r, e),
    ],
    footer: (pagina: number, total: number) => ({
      margin: [MARGEN_X, 8, MARGEN_X, 0],
      stack: [
        { canvas: filete(e.suave, 0, ANCHO, 0.8) },
        {
          margin: [0, 6, 0, 0],
          columns: [
            {
              width: "*",
              text: [
                ...(otros ? [{ text: `También en el panel: ${otros}.   `, fontSize: 7.5, color: e.gris }] : []),
                { text: "Abrir el panel  →", link: r.linkOportunidades, fontSize: 8, bold: true, color: e.tinta, decoration: "underline" },
              ],
            },
            { width: "auto", text: `${soloTexto(r.negocio)} · ${pagina}/${total}`, fontSize: 7, color: APOYO, alignment: "right" },
          ],
        },
      ],
    }),
  };
}

/** Mismo nombre de archivo que el reporte original: para el asesor es «el reporte». */
export function nombreArchivoReporteSimple(r: Pick<ReporteSimple, "negocio" | "diaClave">): string {
  const slug = r.negocio.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
  return `reporte-${slug}-${r.diaClave}.pdf`;
}

export async function renderReporteSimplePdf(r: ReporteSimple): Promise<Buffer> {
  const precio = registrarFuentes(r.fuente);
  const p = resolvePalette(r.paleta);
  const estilo: Estilo = { p, precio, tinta: TINTA, gris: "#6d7178", suave: "#e2e4e7", marca: colorDeMarca(p) };
  return pdfmake.createPdf(documento(r, estilo) as never).getBuffer();
}
