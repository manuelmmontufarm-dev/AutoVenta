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
 * El documento está partido en dos actos, y el corte es deliberado:
 *
 *  · **Página 1, el tablero.** Las cifras del día contra las de la semana y
 *    cuatro gráficos. Se lee de un vistazo y contesta «¿cómo fue el día?» sin
 *    hacer scroll — que es todo lo que muchas noches se necesita.
 *  · **Páginas 2 y siguientes, los chats.** Una tarjeta por conversación, con
 *    su link. Ahí se va sólo quien va a trabajar.
 *
 * Antes todo iba seguido y los números eran una tira delgada arriba de una
 * lista: el resumen se perdía y las conversaciones empezaban a media página.
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
import { DEPOT_LOGO_RATIO, depotLogo } from "./assets.js";
import { espera } from "./dailyReportHtml.js";
import {
  areaSemana, barrasConversaciones, barrasKanban, donaCotizado, mezclar, montoEntero,
  type Fuentes,
} from "./reportCharts.js";

// El test de la mezcla de colores entra por aquí: `mezclar` nació en este
// módulo para el gradiente de la banda y se mudó a los gráficos, que la usan
// en cada barra. Se reexporta para no romper a quien ya la importaba de aquí.
export { mezclar } from "./reportCharts.js";

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
/** Ancho útil de una A4 con los márgenes de este documento. */
const ANCHO = 595.28 - MARGEN_X * 2;
/** Gris de los textos de apoyo. Fuera de la paleta: no es color de marca. */
const APOYO = "#8b8778";

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
  f: Fuentes;
}

// ---------------------------------------------------------------------------
// Piezas del tablero
// ---------------------------------------------------------------------------

/**
 * Pastilla de dato: fondo tenue, texto corto, esquinas al ras.
 *
 * Sustituye a la línea de detalles separada por puntos medios que llevaba antes
 * cada tarjeta. Con cuatro datos seguidos —fecha, medida, local, espera— la
 * línea se leía como una frase y había que descifrarla; en pastillas cada dato
 * es un objeto y el ojo los salta hasta encontrar el que busca.
 */
function pastilla(texto: string, fondo: string, color: string, negrita = true) {
  return {
    width: "auto",
    table: {
      widths: ["auto"],
      body: [[{
        text: soloTexto(texto), fontSize: 7, bold: negrita, color,
        fillColor: fondo, margin: [5, 2.5, 5, 2.5],
      }]],
    },
    layout: SIN_LINEAS,
  };
}

/**
 * Cabecera de tarjeta del tablero: rótulo en versalitas y su explicación.
 *
 * `interior` es el ancho ya descontados los márgenes de la tarjeta. Hace falta
 * porque el `canvas` del divisor se dibuja en puntos absolutos y no sabe estirarse
 * solo: con un ancho fijo, la línea quedaba corta en la tarjeta ancha y se salía
 * en las dos angostas.
 */
function tarjetaGrafico(e: Estilo, interior: number, titulo: string, sub: string, cuerpo: unknown[]) {
  return {
    table: {
      widths: ["*"],
      body: [[{
        fillColor: e.p.panel,
        margin: [12, 10, 12, 11],
        stack: [
          { text: soloTexto(titulo), fontSize: 8, bold: true, characterSpacing: 1.2, color: e.p.dark },
          { text: soloTexto(sub), fontSize: 7, color: APOYO, margin: [0, 2.5, 0, 0] },
          {
            canvas: [{ type: "line", x1: 0, y1: 0, x2: interior, y2: 0, lineWidth: 0.6, lineColor: e.p.border }],
            margin: [0, 7, 0, 8],
          },
          ...cuerpo,
        ],
      }]],
    },
    layout: SIN_LINEAS,
  };
}

/**
 * Las cifras del día, en tarjetas del mismo alto con filo de color.
 *
 * Cada una lleva debajo su equivalente de la semana, en el acento: un número
 * suelto no se puede juzgar —¿seis cotizaciones es mucho?— y con la línea de la
 * semana al lado se juzga solo. La última se marca como destacada: es «en
 * juego», la plata cotizada sin cerrar, y se pinta invertida porque es la razón
 * por la que el asesor abre el panel.
 */
function tiras(e: Estilo, metricas: Array<[string, string, string, boolean?]>) {
  return {
    columns: metricas.map(([etiqueta, numero, extra, destacada]) => ({
      width: "*",
      // El filo de color va como fila propia de la tabla, no como un canvas:
      // un canvas tiene ancho fijo en puntos y le imponía ese mínimo a la
      // columna, así que las seis tarjetas se desbordaban fuera de la página.
      // Una fila con `fillColor` se estira sola al ancho que toque.
      table: {
        widths: ["*"],
        heights: [2.5, 43],
        body: [
          [{ text: "", fillColor: e.p.gold }],
          [{
            // La destacada se INVIERTE (fondo oscuro, cifra en oro) en vez de
            // teñirse con el acento: en la paleta «rojo» el acento es casi
            // negro (#191919) y la tarjeta quedaba más apagada que las otras
            // cinco. `dark` y `gold` sí contrastan en las seis paletas.
            fillColor: destacada ? e.p.dark : e.p.panel,
            margin: [6, 6, 6, 6],
            stack: [
              { text: soloTexto(etiqueta), fontSize: 5.8, bold: true, color: destacada ? e.p.darkSub : APOYO, characterSpacing: 0.4 },
              // El dinero necesita más dígitos que un conteo: baja de cuerpo
              // para que «$18,432» no se salga de una tarjeta de sexta parte.
              { text: numero, font: e.precio, fontSize: destacada ? 15 : 19, color: destacada ? e.p.gold : e.p.dark, margin: [0, destacada ? 4 : 2, 0, 0] },
              { text: soloTexto(extra), fontSize: 6.5, bold: true, color: destacada ? e.p.darkSub : e.p.accent },
            ],
          }],
        ],
      },
      layout: SIN_LINEAS,
    })),
    columnGap: 5,
  };
}

/**
 * La primera página: las cifras y los cuatro gráficos.
 *
 * El ancho de cada SVG se declara aquí y no en el módulo de gráficos porque es
 * una decisión de esta página —dos columnas arriba, una abajo—, no del gráfico:
 * el mismo dibujo entra en el HTML a otro ancho sin tocarse.
 */
function tablero(r: ReporteDiario, e: Estilo) {
  const m = r.resumen;
  const s = r.semana;
  const columna = (ANCHO - 11) / 2;
  const interior = columna - 24;

  const punto = (valor: (dia: typeof s.dias[number]) => number) =>
    s.dias.map((dia) => ({ etiqueta: dia.etiqueta, esHoy: dia.esHoy, valor: valor(dia) }));

  return [
    // Las etiquetas van a dos líneas aunque quepan en una: si no, el número
    // arranca a distinta altura en cada tarjeta y la fila se ve rota.
    tiras(e, [
      ["CLIENTES\nNUEVOS", String(m.clientesNuevos), ""],
      ["CLIENTES QUE\nESCRIBIERON", String(m.clientesQueEscribieron), `${s.escribieron} en la semana`],
      // Sin cotizaciones no se escribe «$0.00»: un cero con dos decimales se
      // lee como un dato y es sólo la ausencia del dato.
      ["COTIZACIONES\nENVIADAS", String(m.cotizacionesEnviadas), m.cotizacionesEnviadas ? money(m.montoCotizado) : ""],
      ["DIJERON QUE\nVIENEN", String(m.visitasAgendadas), ""],
      ["VENTAS\nCERRADAS", String(m.ventasGanadas), m.ventasGanadas ? money(m.montoGanado) : ""],
      // Entera y no abreviada: en los ejes «$18.4k» sobra, pero ésta es LA
      // cifra del reporte —la plata que hay sobre la mesa— y redondearla a
      // miles la vuelve una estimación. Además es la que el HTML muestra
      // completa, y las dos versiones tienen que decir lo mismo.
      ["EN JUEGO\nSIN CERRAR", montoEntero(m.montoEnJuego), `${r.cotizados.total} pendientes`, true],
    ]),

    {
      margin: [0, 11, 0, 0],
      columns: [
        {
          width: columna,
          stack: [tarjetaGrafico(e, interior, "CUÁNTO SE COTIZÓ", "Hoy dentro de la semana, y la semana dentro de todo", [
            { svg: donaCotizado({ hoy: m.montoCotizado, semana: s.montoCotizado, total: r.acumulado.montoCotizado }, e.p, e.f), width: interior, font: "Archivo" },
          ])],
        },
        {
          width: columna,
          stack: [tarjetaGrafico(e, interior, "MOVIMIENTO DEL KANBAN", "Cuánta gente entró a cada columna esta semana", [
            {
              svg: barrasKanban(
                r.fases.map((fase) => ({ nombre: fase.corto, hoy: fase.hoy, semana: fase.semana, perdido: fase.etapa === "perdido" })),
                e.p, e.f,
              ),
              width: interior, font: "Archivo",
            },
            {
              margin: [0, 6, 0, 0],
              columns: [
                pastilla("HOY", e.p.accent, e.p.panel),
                pastilla("LA SEMANA", mezclar(e.p.accent, e.p.base, 0.55), e.p.dark),
                { width: "*", text: "" },
              ],
              columnGap: 4,
            },
          ])],
        },
      ],
      columnGap: 11,
    },

    {
      margin: [0, 11, 0, 0],
      stack: [tarjetaGrafico(e, ANCHO - 24, "LA SEMANA, DÍA POR DÍA", "Plata cotizada arriba; cuántos clientes escribieron abajo", [
        { svg: areaSemana(punto((dia) => dia.monto), e.p, e.f), width: ANCHO - 24, font: "Archivo" },
        {
          svg: barrasConversaciones(punto((dia) => dia.escribieron), e.p, e.f),
          width: ANCHO - 24, font: "Archivo", margin: [0, 4, 0, 0],
        },
      ])],
    },
  ];
}

// ---------------------------------------------------------------------------
// Las conversaciones
// ---------------------------------------------------------------------------

/** Tarjeta de una conversación: barra de acento a la izquierda y fondo panel. */
function tarjeta(e: Estilo, acento: string, contenido: unknown[], fondo?: string) {
  return {
    table: {
      widths: [3, "*"],
      body: [[
        { text: "", fillColor: acento },
        { stack: contenido, fillColor: fondo ?? e.p.panel, margin: [11, 8, 11, 8] },
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
  const suave = mezclar(e.p.base, e.p.border, 0.5);
  const pastillas = [
    fila.cuando
      ? pastilla(
          `${fila.cuando}${fila.vencida ? " · no vino" : ""}`,
          fila.vencida ? mezclar(e.p.panel, ALERTA, 0.16) : mezclar(e.p.panel, acento, 0.14),
          fila.vencida ? ALERTA : e.p.dark,
        )
      : null,
    fila.medida ? pastilla(fila.medida, suave, e.p.tenue) : null,
    fila.local ? pastilla(fila.local, suave, e.p.tenue) : null,
    espera_ ? pastilla(`esperando ${espera_}`, suave, e.p.tenue) : null,
  ].filter(Boolean);

  return tarjeta(e, fila.vencida ? ALERTA : acento, [
    {
      columns: [
        { text: soloTexto(fila.nombre), link: fila.link, bold: true, fontSize: 11, color: e.p.dark },
        {
          text: money(fila.monto), font: e.precio, fontSize: 13, alignment: "right", width: 82,
          // Sin cotización el hueco lleva una raya, y la raya no es plata: en el
          // acento de la marca se leía como una cifra que no se alcanzó a cargar.
          color: fila.monto == null ? APOYO : e.p.accent,
        },
      ],
    },
    { text: soloTexto(fila.motivo), fontSize: 8.5, color: e.p.tenue, margin: [0, 3, 0, 0] },
    // El "abrir chat" va en TODAS las filas, no sólo en las de error: el nombre
    // ya era un enlace, pero en un PDF nada indica que un texto se pueda tocar y
    // el asesor no iba a descubrirlo. La fila existe aunque no haya pastillas.
    {
      margin: [0, 6, 0, 0],
      columns: [
        ...pastillas,
        { width: "*", text: "" },
        { width: 62, text: "abrir chat →", link: fila.link, fontSize: 8, bold: true, color: e.p.accent, alignment: "right" },
      ],
      columnGap: 4,
    },
  ], fila.vencida ? mezclar(e.p.panel, ALERTA, 0.07) : undefined);
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

/**
 * Cabecera de sección: cuña de color, título, el conteo, y una línea al pie.
 *
 * `abrePagina` sólo quita el aire de arriba. El salto de página en sí lo pone
 * quien llama, sobre el bloque entero: ver `seccion`.
 */
function titulo(e: Estilo, color: string, texto: string, total: number, sub: string, abrePagina = false) {
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
      margin: [0, abrePagina ? 0 : 15, 0, 0],
    },
    { text: soloTexto(sub), fontSize: 7.5, color: APOYO, margin: [13, 3, 0, 0] },
    {
      canvas: [{ type: "line", x1: 0, y1: 0, x2: ANCHO, y2: 0, lineWidth: 0.6, lineColor: e.p.border }],
      margin: [0, 7, 0, 8],
    },
  ];
}

function vacio(e: Estilo, texto: string) {
  return tarjeta(e, e.p.border, [{ text: texto, fontSize: 9, color: APOYO, italics: true }], e.p.base);
}

function resto(total: number, mostradas: number) {
  return total > mostradas
    ? [{ text: `y ${total - mostradas} más en el panel`, fontSize: 7.5, color: APOYO, margin: [13, 2, 0, 0] }]
    : [];
}

/**
 * Una sección completa: cabecera, tarjetas y el «y N más».
 *
 * La cabecera viaja pegada a su primera tarjeta dentro de un bloque
 * `unbreakable`. Sin eso, pdfmake trata cada pieza por separado y cuando la
 * sección arranca al final de una hoja deja el título y su línea abajo del todo
 * —una firma huérfana— y las conversaciones empiezan en la siguiente.
 *
 * `saltoAntes` va sobre ese mismo bloque y NO sobre su primer hijo. Puesto
 * dentro, pdfmake salta de página al leerlo y vuelve a saltar al medir el
 * bloque indivisible que lo contiene: el resultado era una hoja en blanco
 * entera entre el tablero y los chats.
 */
function seccion(input: {
  e: Estilo; color: string; titulo: string; sub: string; total: number;
  vacio: string; tarjetas: unknown[]; saltoAntes?: boolean;
}) {
  const cabecera = titulo(input.e, input.color, input.titulo, input.total, input.sub, input.saltoAntes);
  const filas = input.total === 0 ? [vacio(input.e, input.vacio)] : input.tarjetas;
  const [primera, ...siguientes] = filas;

  return [
    {
      ...(input.saltoAntes ? { pageBreak: "before" as const } : {}),
      unbreakable: true,
      stack: [...cabecera, primera],
    },
    ...siguientes,
    ...resto(input.total, input.tarjetas.length),
  ];
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
    // El logotipo real de la marca sobre la banda oscura; `escala` era el
    // cuerpo de la tipografía y ahora es el alto del logo, que es lo mismo que
    // regulaba antes: cuánto ocupa la marca en la portada y en el repetido.
    const logo = depotLogo("blanco");
    const wordmark = (y: number, escala: number) =>
      logo
        ? {
            absolutePosition: { x: MARGEN_X, y },
            image: logo.dataUri,
            height: escala,
            width: escala * DEPOT_LOGO_RATIO,
          }
        : {
            absolutePosition: { x: MARGEN_X, y },
            text: [
              { text: "DEPOT", color: e.p.panel },
              { text: "TIRE", color: e.p.gold },
            ],
            font: "ArchivoBlack",
            fontSize: escala,
            characterSpacing: 0.6,
          };

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
            wordmark(16, 20),
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
            wordmark(BANDA_H / 2 - 8, 15),
            rotuloDerecha(W, BANDA_H / 2 - 8, soloTexto(`REPORTE DEL DÍA · ${r.dia}`), 7.5, e.p.darkSub),
          ]),
    ];
  };
}

function documento(r: ReporteDiario, e: Estilo) {
  const ahora = new Date(r.generadoEn);

  return {
    pageSize: "A4",
    pageMargins: [MARGEN_X, TOPE, MARGEN_X, 46],
    defaultStyle: { font: "Archivo", fontSize: 9, color: e.p.dark },
    background: fondo(r, e),
    content: [
      ...tablero(r, e),

      // El salto va sobre la primera sección y no como un bloque suelto al
      // final del tablero: un `pageBreak: after` en una pieza vacía deja una
      // línea fantasma que, si el tablero creciera, empujaría a una tercera
      // página en blanco.
      ...seccion({
        e, color: e.p.accent, saltoAntes: true,
        titulo: "Cotizados — a un empujón", total: r.cotizados.total,
        sub: "Ya tienen precio. Primero los que prometieron venir y no aparecieron.",
        vacio: "Nadie con cotización pendiente.",
        tarjetas: r.cotizados.filas.map((f) => filaCliente(e, e.p.accent, f, ahora)),
      }),

      ...seccion({
        e, color: e.p.gold,
        titulo: "Piden asesor", total: r.pidenAsesor.total,
        sub: "Pidieron hablar con alguien, van a llamar o el bot no alcanzó. Ordenados por quién espera hace más.",
        vacio: "Nadie esperando un asesor.",
        tarjetas: r.pidenAsesor.filas.map((f) => filaCliente(e, e.p.gold, f, ahora)),
      }),

      ...seccion({
        e, color: ALERTA,
        titulo: "Errores en la conversación", total: r.errores.total,
        sub: "El bot se rompió dentro del chat. Abre el link y responde a mano.",
        vacio: "Ningún chat se rompió hoy.",
        tarjetas: r.errores.filas.map((f) => filaError(e, f)),
      }),

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
        { canvas: barraCarreras(e.p, 0, ANCHO, 2.5) },
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
              fontSize: 7, color: APOYO, alignment: "right",
            },
          ],
        },
      ],
    }),
  };
}

export async function renderDailyReportPdf(r: ReporteDiario): Promise<Buffer> {
  const precio = registrarFuentes(r.fuente);
  const estilo: Estilo = {
    p: resolvePalette(r.paleta),
    precio,
    // Los gráficos escriben con las mismas dos familias que el resto del
    // documento: si pidieran una que pdfmake no tiene registrada, el render
    // entero revienta con «Font not defined» en vez de salir sin gráfico.
    f: { texto: "Archivo", cifra: precio },
  };
  return pdfmake.createPdf(documento(r, estilo) as never).getBuffer();
}

/** `reporte-depot-tire-2026-08-09.pdf` — nombre estable y ordenable. */
export function nombreArchivoReporte(r: ReporteDiario): string {
  const negocio = r.negocio.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
  return `reporte-${negocio}-${r.diaClave}.pdf`;
}
