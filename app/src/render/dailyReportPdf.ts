/**
 * El reporte del día, en PDF.
 *
 * Es el archivo que llega por WhatsApp y se queda en el teléfono, así que no
 * puede parecer un listado de sistema: tiene que verse Depot Tire. En vez de
 * inventarle un estilo, usa el que ya existe en `depotDesign` — el mismo con el
 * que salen las cotizaciones — para que todo lo que manda el bot se vea de la
 * misma casa:
 *
 *  · **La paleta la elige el negocio.** Viene de Ajustes junto con la fuente de
 *    precio; cambiar el color de las cotizaciones cambia también el reporte de
 *    la noche. Nada de colores fijos aquí.
 *  · **Barra de carreras y líneas de velocidad.** Los dos gestos automotores de
 *    las piezas, portados a vectores del PDF.
 *  · **Tipografía de la casa.** Archivo y Archivo Black, más la fuente de
 *    precio del negocio para las cifras. Helvetica —la fuente por defecto del
 *    PDF— daba un documento de oficina y encima codifica en WinAnsi: la flecha
 *    del período salía como «!».
 *
 * Lo que NO se toca: los links son de verdad. Cada nombre enlaza a su chat y el
 * pie al tab Oportunidades. Es la razón de que esto sea pdfmake y no una imagen
 * renderizada con satori como las piezas — una imagen no se puede tocar, y el
 * punto del reporte es que el asesor entre desde ahí.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import pdfmake from "pdfmake";
import type { FilaCliente, ReporteDiario } from "../services/dailyReport.js";
import { resolvePalette, type Palette } from "./depotDesign.js";
import { espera } from "./dailyReportHtml.js";

// src/render → app/assets (misma profundidad ya compilado en dist/render).
const FUENTES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/fonts");

/** Archivo de cada fuente de precio, con las mismas claves que Ajustes. */
const ARCHIVO_PRECIO: Record<string, string> = {
  exo: "Exo2-700i.ttf",
  barlow: "Barlow-700i.ttf",
  kanit: "Kanit-700i.ttf",
  chakra: "ChakraPetch-700i.ttf",
  saira: "Saira-700i.ttf",
  rajdhani: "Rajdhani-700.ttf",
  archivo: "ArchivoBlack.ttf",
};

/**
 * Registra las fuentes una sola vez por proceso y devuelve el nombre de familia
 * de la de precio. `addFonts` acumula, así que llamarlo en cada reporte iría
 * inflando el registro; la familia lleva la clave dentro para que cambiar la
 * fuente desde Ajustes no choque con la que ya estaba cargada.
 */
const registradas = new Set<string>();
function registrarFuentes(fuente: string): string {
  const ttf = (nombre: string) => path.join(FUENTES, nombre);
  const mismo = (nombre: string) => ({
    normal: ttf(nombre), bold: ttf(nombre), italics: ttf(nombre), bolditalics: ttf(nombre),
  });

  if (!registradas.has("base")) {
    pdfmake.addFonts({
      Archivo: {
        normal: ttf("Archivo-400.ttf"),
        bold: ttf("Archivo-700.ttf"),
        italics: ttf("Archivo-400.ttf"),
        bolditalics: ttf("Archivo-700.ttf"),
      },
      ArchivoBlack: mismo("ArchivoBlack.ttf"),
    });
    registradas.add("base");
  }

  const clave = ARCHIVO_PRECIO[fuente] ? fuente : "exo";
  const familia = `Precio_${clave}`;
  if (!registradas.has(familia)) {
    pdfmake.addFonts({ [familia]: mismo(ARCHIVO_PRECIO[clave]) });
    registradas.add(familia);
  }
  return familia;
}

/**
 * Rojo de urgencia, fijo a propósito.
 *
 * Las paletas de la casa no tienen color de alarma — el acento de «rojo» es el
 * color de marca, no un aviso. Que «prometió venir y no vino» dependiera de la
 * paleta elegida haría que en la paleta roja todo pareciera urgente y en la
 * verde nada lo pareciera.
 */
const ALERTA = "#c1352b";

const MARGEN_X = 36;
const BANDA_H = 88;
const BARRA_H = 7;
/** Margen superior del contenido: debajo de la banda y su barra de carreras. */
const TOPE = BANDA_H + BARRA_H + 15;

/**
 * Quita lo que las fuentes no saben pintar.
 *
 * Los nombres vienen del perfil de WhatsApp del cliente y son texto libre: un
 * emoji en el nombre saldría como un cuadro vacío. Se va sólo eso — flechas,
 * tildes, comillas tipográficas y guiones largos sí están en la fuente y se
 * quedan, que es lo que Helvetica no permitía.
 */
export function soloTexto(texto: string): string {
  return texto
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** Mezcla dos hex. Sirve para el gradiente de la banda, que nace de la paleta. */
export function mezclar(a: string, b: string, proporcion: number): string {
  const canal = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mezcla = [0, 1, 2].map((i) =>
    Math.round(canal(a, i) * (1 - proporcion) + canal(b, i) * proporcion));
  return `#${mezcla.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function money(valor: number | null): string {
  if (valor == null) return "—";
  return `$${valor.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Tabla sin líneas: el color y el espacio hacen el trabajo, no los bordes. */
const SIN_LINEAS = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
};

/**
 * Barra tricolor de carreras, la firma de las piezas de Depot.
 *
 * Las proporciones son las del diseño original (acento corto, oro más corto,
 * oscuro largo), reescaladas al ancho de la página.
 */
function barraCarreras(p: Palette, y: number, ancho: number, alto = BARRA_H) {
  const acento = Math.round(ancho * 0.25);
  const oro = Math.round(ancho * 0.13);
  return [
    { type: "rect", x: 0, y, w: acento, h: alto, color: p.accent },
    { type: "rect", x: acento, y, w: oro, h: alto, color: p.gold },
    { type: "rect", x: acento + oro, y, w: ancho - acento - oro, h: alto, color: p.dark },
  ];
}

/**
 * Líneas de velocidad: barras blancas inclinadas, casi invisibles, sobre la
 * banda oscura. Es el gesto que hace que la cabecera se lea como de un taller y
 * no como el membrete de una factura.
 */
function lineasDeVelocidad(desdeX: number, cantidad = 7, ancho = 16, hueco = 13) {
  const sesgo = BANDA_H * 0.58; // tan(30°): la misma inclinación de las piezas
  return Array.from({ length: cantidad }, (_, i) => {
    const x = desdeX + i * (ancho + hueco);
    return {
      type: "polyline",
      closePath: true,
      color: "#ffffff",
      fillOpacity: 0.06,
      points: [
        { x: x + sesgo, y: 0 },
        { x: x + sesgo + ancho, y: 0 },
        { x: x + ancho, y: BANDA_H },
        { x, y: BANDA_H },
      ],
    };
  });
}

/**
 * Rótulo alineado a la derecha dentro de la banda.
 *
 * Va como tabla y no como texto suelto porque pdfmake ignora `width` en los
 * bloques con `absolutePosition`: el texto se alineaba contra el borde del
 * papel y quedaba cortado. Una tabla sí respeta el ancho que se le declara.
 */
function rotuloDerecha(W: number, y: number, texto: string, tamano: number, color: string) {
  return {
    absolutePosition: { x: MARGEN_X, y },
    table: {
      widths: [W - MARGEN_X * 2],
      body: [[{
        text: texto, fontSize: tamano, bold: true, characterSpacing: 1.4,
        color, alignment: "right",
      }]],
    },
    layout: SIN_LINEAS,
  };
}

/** Marcador de sección: el paralelogramo inclinado de los logos de marca. */
function cuna(color: string) {
  return {
    width: 13,
    canvas: [{
      type: "polyline", closePath: true, color,
      points: [{ x: 4, y: 1 }, { x: 9, y: 1 }, { x: 5, y: 11 }, { x: 0, y: 11 }],
    }],
  };
}

interface Estilo {
  p: Palette;
  precio: string;
}

/** Tarjeta de una conversación: barra de acento a la izquierda y fondo panel. */
function tarjeta(e: Estilo, acento: string, contenido: unknown[], fondo?: string) {
  return {
    table: {
      widths: [3, "*"],
      body: [[
        { text: "", fillColor: acento },
        { stack: contenido, fillColor: fondo ?? e.p.panel, margin: [10, 6, 10, 6] },
      ]],
    },
    layout: SIN_LINEAS,
    margin: [0, 0, 0, 5],
  };
}

/**
 * `acento` es el color de la sección, para que la tarjeta pertenezca a su
 * bloque de un vistazo. Quien prometió venir y no vino lo pisa con el rojo de
 * urgencia Y un fondo apenas teñido: en las paletas cuyo acento ya es rojo
 * (navy, carbon) la barra sola no distinguía nada, y el tinte sí, porque no
 * sale de la paleta.
 */
function filaCliente(e: Estilo, acento: string, fila: FilaCliente, ahora: Date) {
  const espera_ = espera(fila.esperaDesde, ahora);
  const detalles = [
    fila.cuando ? `${fila.cuando}${fila.vencida ? " · no vino" : ""}` : null,
    fila.medida,
    fila.local,
    espera_ ? `esperando ${espera_}` : null,
  ].filter(Boolean).join("   ·   ");

  return tarjeta(e, fila.vencida ? ALERTA : acento, [
    {
      columns: [
        { text: soloTexto(fila.nombre), link: fila.link, bold: true, fontSize: 11, color: e.p.dark },
        { text: money(fila.monto), font: e.precio, fontSize: 13, color: e.p.accent, alignment: "right", width: 82 },
      ],
    },
    { text: soloTexto(fila.motivo), fontSize: 8.5, color: e.p.tenue, margin: [0, 3, 0, 0] },
    detalles
      ? { text: soloTexto(detalles), fontSize: 7.5, color: fila.vencida ? ALERTA : "#8b8778", margin: [0, 3, 0, 0] }
      : null,
  ].filter(Boolean), fila.vencida ? mezclar(e.p.panel, ALERTA, 0.07) : undefined);
}

function filaError(e: Estilo, fila: { nombre: string; motivo: string; link: string }) {
  return tarjeta(e, ALERTA, [
    {
      columns: [
        { text: soloTexto(fila.nombre), link: fila.link, bold: true, fontSize: 11, color: e.p.dark },
        { text: "abrir chat →", link: fila.link, fontSize: 8.5, bold: true, color: e.p.accent, alignment: "right", width: 62 },
      ],
    },
    { text: soloTexto(fila.motivo), fontSize: 8.5, color: e.p.tenue, margin: [0, 3, 0, 0] },
  ]);
}

/** Cabecera de sección: cuña de color, título, y el conteo en una pastilla. */
function titulo(e: Estilo, color: string, texto: string, total: number, sub: string) {
  return [
    {
      columns: [
        cuna(color),
        { width: "*", text: soloTexto(texto), bold: true, fontSize: 11.5, color: e.p.dark },
        {
          width: 26,
          table: { widths: ["*"], body: [[{
            text: String(total), fontSize: 8, bold: true, color: e.p.tenue,
            alignment: "center", fillColor: e.p.border, margin: [0, 2, 0, 2],
          }]] },
          layout: SIN_LINEAS,
        },
      ],
      margin: [0, 13, 0, 0],
    },
    { text: soloTexto(sub), fontSize: 7.5, color: "#8b8778", margin: [13, 3, 0, 7] },
  ];
}

function vacio(e: Estilo, texto: string) {
  return tarjeta(e, e.p.border, [{ text: texto, fontSize: 9, color: "#8b8778", italics: true }], e.p.base);
}

function resto(total: number, mostradas: number) {
  return total > mostradas
    ? [{ text: `y ${total - mostradas} más en el panel`, fontSize: 7.5, color: "#8b8778", margin: [13, 2, 0, 0] }]
    : [];
}

/** Las cinco cifras del día, en tarjetas del mismo alto con filo de color. */
function tiras(e: Estilo, metricas: Array<[string, string, string]>) {
  return {
    columns: metricas.map(([etiqueta, numero, extra]) => ({
      width: "*",
      // El filo de color va como fila propia de la tabla, no como un canvas:
      // un canvas tiene ancho fijo en puntos y le imponía ese mínimo a la
      // columna, así que las cinco tarjetas se desbordaban fuera de la página.
      // Una fila con `fillColor` se estira sola al ancho que toque.
      table: {
        widths: ["*"],
        heights: [2.5, 43],
        body: [
          [{ text: "", fillColor: e.p.gold }],
          [{
            fillColor: e.p.panel,
            margin: [7, 6, 7, 6],
            stack: [
              { text: soloTexto(etiqueta), fontSize: 5.8, bold: true, color: "#8b8778", characterSpacing: 0.4 },
              { text: numero, font: e.precio, fontSize: 19, color: e.p.dark, margin: [0, 2, 0, 0] },
              { text: extra, fontSize: 7.5, bold: true, color: e.p.accent },
            ],
          }],
        ],
      },
      layout: SIN_LINEAS,
    })),
    columnGap: 5,
    margin: [0, 0, 0, 2],
  };
}

/**
 * Fondo de cada página: papel, banda oscura con gradiente, líneas de velocidad
 * y barra de carreras.
 *
 * La banda va en TODAS las páginas, no sólo en la primera. El margen superior
 * es uno solo para todo el documento, así que si la banda fuera exclusiva de la
 * portada la segunda página abriría con un hueco vacío del mismo tamaño. Con la
 * versión compacta arriba, ese espacio pasa a ser un encabezado que se repite —
 * que es lo que hace un documento y no un volante.
 */
function fondo(r: ReporteDiario, e: Estilo) {
  return (pagina: number, tamano: { width: number; height: number }) => {
    const W = tamano.width;
    const portada = pagina === 1;
    const wordmark = (y: number, escala: number) => ({
      absolutePosition: { x: MARGEN_X, y },
      text: [
        { text: "DEPOT", color: e.p.panel },
        { text: "TIRE", color: e.p.gold },
      ],
      font: "ArchivoBlack",
      fontSize: escala,
      characterSpacing: 0.6,
    });

    return [
      {
        absolutePosition: { x: 0, y: 0 },
        canvas: [
          { type: "rect", x: 0, y: 0, w: W, h: tamano.height, color: e.p.base },
          {
            type: "rect", x: 0, y: 0, w: W, h: BANDA_H,
            // El gradiente nace de la propia paleta: el oscuro de la marca
            // abriéndose hacia su acento. Así funciona en las seis.
            linearGradient: [e.p.dark, mezclar(e.p.dark, e.p.accent, 0.28)],
          },
          ...lineasDeVelocidad(W - 250),
          ...barraCarreras(e.p, BANDA_H, W),
        ],
      },
      ...(portada
        ? [
            wordmark(20, 15),
            rotuloDerecha(W, 22, soloTexto("REPORTE DEL DÍA"), 7, e.p.darkSub),
            {
              absolutePosition: { x: MARGEN_X, y: 41 },
              text: soloTexto(r.dia),
              font: "ArchivoBlack", fontSize: 22, color: e.p.panel,
            },
            {
              absolutePosition: { x: MARGEN_X, y: 70 },
              text: soloTexto(r.periodo),
              fontSize: 8.5, color: e.p.darkSub,
            },
          ]
        : [
            wordmark(BANDA_H / 2 - 14, 13),
            rotuloDerecha(W, BANDA_H / 2 - 8, soloTexto(`REPORTE DEL DÍA · ${r.dia}`), 7.5, e.p.darkSub),
          ]),
    ];
  };
}

function documento(r: ReporteDiario, e: Estilo) {
  const ahora = new Date(r.generadoEn);
  const m = r.resumen;

  return {
    pageSize: "A4",
    pageMargins: [MARGEN_X, TOPE, MARGEN_X, 46],
    defaultStyle: { font: "Archivo", fontSize: 9, color: e.p.dark },
    background: fondo(r, e),
    content: [
      // Las cinco etiquetas van a dos líneas aunque quepan en una: si no, el
      // número arranca a distinta altura en cada tarjeta y la fila se ve rota.
      tiras(e, [
        ["CLIENTES\nNUEVOS", String(m.clientesNuevos), ""],
        ["CLIENTES QUE\nESCRIBIERON", String(m.clientesQueEscribieron), ""],
        // Sin cotizaciones no se escribe «$0.00»: un cero con dos decimales se
        // lee como un dato y es sólo la ausencia del dato.
        ["COTIZACIONES\nENVIADAS", String(m.cotizacionesEnviadas), m.cotizacionesEnviadas ? money(m.montoCotizado) : ""],
        ["DIJERON QUE\nVIENEN", String(m.visitasAgendadas), ""],
        ["VENTAS\nCERRADAS", String(m.ventasGanadas), m.ventasGanadas ? money(m.montoGanado) : ""],
      ]),

      ...titulo(e, e.p.accent, "Cotizados — a un empujón", r.cotizados.total,
        "Ya tienen precio. Primero los que prometieron venir y no aparecieron."),
      ...(r.cotizados.total === 0
        ? [vacio(e, "Nadie con cotización pendiente.")]
        : [...r.cotizados.filas.map((f) => filaCliente(e, e.p.accent, f, ahora)), ...resto(r.cotizados.total, r.cotizados.filas.length)]),

      ...titulo(e, e.p.gold, "Piden asesor", r.pidenAsesor.total,
        "Pidieron hablar con alguien, van a llamar o el bot no alcanzó. Ordenados por quién espera hace más."),
      ...(r.pidenAsesor.total === 0
        ? [vacio(e, "Nadie esperando un asesor.")]
        : [...r.pidenAsesor.filas.map((f) => filaCliente(e, e.p.gold, f, ahora)), ...resto(r.pidenAsesor.total, r.pidenAsesor.filas.length)]),

      ...titulo(e, ALERTA, "Errores en la conversación", r.errores.total,
        "El bot se rompió dentro del chat. Abre el link y responde a mano."),
      ...(r.errores.total === 0
        ? [vacio(e, "Ningún chat se rompió hoy.")]
        : [...r.errores.filas.map((f) => filaError(e, f)), ...resto(r.errores.total, r.errores.filas.length)]),

      ...(r.tecnicos.total === 0 ? [] : [
        ...titulo(e, e.p.border, "Problemas técnicos", r.tecnicos.total,
          "No son tareas del asesor: esto lo revisa el desarrollador. Van sólo los números afectados."),
        {
          table: {
            widths: ["*"],
            body: [[{
              fillColor: e.p.border,
              margin: [10, 7, 10, 7],
              stack: r.tecnicos.filas.map((fila) => ({
                columns: [
                  { width: 88, text: fila.telefono, bold: true, fontSize: 9, color: e.p.dark },
                  { width: "*", text: soloTexto(fila.etiqueta), fontSize: 8.5, color: e.p.tenue },
                  { width: 24, text: fila.veces > 1 ? `×${fila.veces}` : "", fontSize: 8.5, bold: true, color: ALERTA, alignment: "right" },
                ],
                margin: [0, 1.5, 0, 1.5],
              })),
            }]],
          },
          layout: SIN_LINEAS,
        },
        ...resto(r.tecnicos.total, r.tecnicos.filas.length),
      ]),
    ],
    /**
     * El pie lleva la acción, no sólo el número de página.
     *
     * Era un botón al final del contenido y se iba solo a una segunda página en
     * cuanto el día traía unas cuantas conversaciones — una hoja entera para un
     * enlace. Aquí no puede provocar un salto y queda a mano desde cualquier
     * página, que es donde el asesor esté leyendo cuando decida entrar.
     */
    footer: (pagina: number, total: number) => ({
      margin: [MARGEN_X, 10, MARGEN_X, 0],
      stack: [
        { canvas: barraCarreras(e.p, 0, 523, 2.5) },
        {
          margin: [0, 7, 0, 0],
          columns: [
            {
              width: "*",
              text: "Abrir Oportunidades y gestionar  →",
              link: r.linkOportunidades,
              fontSize: 8.5, bold: true, color: e.p.accent,
            },
            {
              width: "auto",
              text: soloTexto(`${r.negocio} · reporte automático · ${pagina}/${total}`),
              fontSize: 7, color: "#8b8778", alignment: "right",
            },
          ],
        },
      ],
    }),
  };
}

export async function renderDailyReportPdf(r: ReporteDiario): Promise<Buffer> {
  const estilo: Estilo = { p: resolvePalette(r.paleta), precio: registrarFuentes(r.fuente) };
  return pdfmake.createPdf(documento(r, estilo) as never).getBuffer();
}

/** `reporte-depot-tire-2026-08-09.pdf` — nombre estable y ordenable. */
export function nombreArchivoReporte(r: ReporteDiario): string {
  const negocio = r.negocio.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
  return `reporte-${negocio}-${r.diaClave}.pdf`;
}
