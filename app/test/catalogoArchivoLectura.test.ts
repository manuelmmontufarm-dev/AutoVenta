/**
 * QUE EL EXCEL DE FÉNIX SE LEA BIEN TODAS LAS VECES (Competimotor, 18-nov-2026).
 *
 * Competimotor sube cada día el inventario que descarga de Fénix y la cuarta
 * opción de cada cotización es «la de mayor inventario»: un Excel mal leído se
 * le nota al cliente final. Estas pruebas parten del reporte de Fénix del repo
 * (`fixtures/inventario-fenix-reporte.xls`, mismo formato que el del 6-nov) y
 * arman las variantes raras A PARTIR de él: el mismo reporte guardado como
 * .xlsx o .csv, con otra mayúscula o tilde en el encabezado, números escritos
 * como texto, filas vacías y de totales, columnas de más o de menos, varias
 * hojas. Ningún dato del negocio se inventa: se mueve el que ya trae el archivo.
 *
 * La regla de seguridad (`decidirCarga`) también va acá, pura: un archivo malo
 * NUNCA reemplaza al catálogo bueno.
 *
 * Con `FENIX_REAL=/ruta/INVENTARIO_06NOV_fenix.xls` corre además contra el
 * Excel real de Jenny (no está en el repo: son precios del cliente).
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as XLS from "xlsx";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.DATABASE_URL ||= "postgresql://nadie@localhost/no_se_usa";

const archivo = await import("../src/services/fuentes/archivo.js");

const fixture = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
const REPORTE = readFileSync(fixture("inventario-fenix-reporte.xls"));
const MUESTRA_CSV = readFileSync(fixture("inventario-fenix-muestra.csv"));
const MAPEO = archivo.CatalogoMapeoSchema.parse(archivo.MAPEO_CATALOGO_DEFECTO);
const AHORA = new Date("2026-11-18T15:00:00Z");

/** El reporte de Fénix como matriz de texto, tal cual lo ve una persona. */
function matrizDelReporte(): string[][] {
  const libro = XLS.read(REPORTE, { type: "buffer" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas = XLS.utils.sheet_to_json<string[]>(hoja, { header: 1, raw: false, defval: "", blankrows: true });
  const desde = XLS.utils.decode_range(hoja["!ref"]!).s.r;
  return [...Array.from({ length: desde }, () => [] as string[]), ...filas.map((f) => f.map(String))];
}

/** Las celdas que parecen número se escriben como número, como las deja Fénix. */
const comoNumeros = (m: string[][]) => m.map((f) => f.map((c) => (/^-?\d+(\.\d+)?$/.test(c) ? Number(c) : c)));

type Hoja = { nombre: string; filas: unknown[][] };
function libro(hojas: Hoja[], tipo: "biff8" | "xlsx" | "csv"): Buffer {
  const wb = XLS.utils.book_new();
  for (const h of hojas) XLS.utils.book_append_sheet(wb, XLS.utils.aoa_to_sheet(h.filas), h.nombre);
  return Buffer.from(XLS.write(wb, { type: "buffer", bookType: tipo }));
}

const leer = (nombre: string, cuerpo: Buffer, mapeo = MAPEO) => archivo.leerInventario(nombre, cuerpo, mapeo, AHORA);
const codigos = (l: Awaited<ReturnType<typeof leer>>) => l.catalogo.filas.map((f) => f.cruda.codigo);

/** Lo que el reporte de Fénix tiene que dar SIEMPRE, venga como venga. */
const ESPERADO = ["A0100", "A0101", "A0103"];

/** La fila del encabezado del reporte (la 15 del Excel: 14 de membrete encima). */
const ENCABEZADO = matrizDelReporte().findIndex((f) => f.some((c) => c.trim().toLowerCase() === "código"));
if (ENCABEZADO !== 14) throw new Error(`el fixture cambió: encabezado en ${ENCABEZADO}`);
const columna = (m: string[][], nombre: string) => m[ENCABEZADO].findIndex((c) => c.trim().toLowerCase() === nombre);
const sinColumna = (m: string[][], nombre: string) => {
  const i = columna(m, nombre);
  return m.map((f) => f.filter((_, j) => j !== i));
};
const filaDe = (m: string[][], codigo: string) => m.findIndex((f) => f[0] === codigo);

describe("los tres formatos: .xls, .xlsx y .csv dan lo mismo", () => {
  it(".xls tal cual sale de Fénix", async () => {
    const l = await leer("INVENTARIO.xls", REPORTE);
    expect(codigos(l)).toEqual(ESPERADO);
    expect(l.catalogo.descartadas).toHaveLength(3);
    expect(l.faltantes).toEqual([]);
  });

  it("el mismo reporte guardado como .xlsx", async () => {
    const l = await leer("INVENTARIO.xlsx", libro([{ nombre: "Sheet", filas: comoNumeros(matrizDelReporte()) }], "xlsx"));
    expect(codigos(l)).toEqual(ESPERADO);
    expect(l.catalogo.filas[0].precios.conIva).toBe(139.99);
    expect(l.catalogo.filas[0].cruda.stock).toBe("11");
  });

  it("el mismo reporte guardado como .csv (con membrete y todo)", async () => {
    const l = await leer("INVENTARIO.csv", libro([{ nombre: "Sheet", filas: matrizDelReporte() }], "csv"));
    expect(codigos(l)).toEqual(ESPERADO);
    expect(l.catalogo.descartadas).toHaveLength(3);
  });

  it("un .csv guardado por Excel en Windows (Latin-1, «Código» con tilde) se lee igual", async () => {
    const csv = libro([{ nombre: "Sheet", filas: matrizDelReporte() }], "csv").toString("utf8").replace(/^\uFEFF/, "");
    const l = await leer("INVENTARIO.csv", Buffer.from(csv, "latin1"));
    expect(codigos(l)).toEqual(ESPERADO);
  });

  it("un .xls que se llama .xlsx (o al revés) se lee por su contenido, no por el nombre", async () => {
    expect(codigos(await leer("INVENTARIO.xlsx", REPORTE))).toEqual(ESPERADO);
    const xlsx = libro([{ nombre: "Sheet", filas: comoNumeros(matrizDelReporte()) }], "xlsx");
    expect(codigos(await leer("INVENTARIO.xls", xlsx))).toEqual(ESPERADO);
  });
});

describe("encabezado: filas de título encima y nombres escritos distinto", () => {
  it("la fecha del reporte de Fénix se lee del membrete", async () => {
    const l = await leer("INVENTARIO.xls", REPORTE);
    // «06/11/2026 02:14:11 PM», hora de Ecuador.
    expect(l.catalogo.fechaReporte).toBe("2026-11-06T19:14:11.000Z");
  });

  it("CSV con dos filas de título antes del encabezado", async () => {
    const texto = `INVENTARIO MUNDILLANTAS,,,\nexportado a mano,,,\n${MUESTRA_CSV.toString("utf8")}`;
    const mapeo = archivo.CatalogoMapeoSchema.parse({
      columnas: {
        medida: "medida", marca: "marca", diseno: "modelo", codigo: "codigo", nombre: "descripcion",
        precio: "pvp", precioLista: "pvp lista", stock: "stock",
        stockPorLocal: { matriz: "stock matriz", sucursal: "stock sucursal" },
      },
      precioIncluyeIva: false,
      filasDeAros: { columna: "linea", patron: "^aro" },
    });
    const sinTitulo = await leer("inv.csv", MUESTRA_CSV, mapeo);
    const conTitulo = await leer("inv.csv", Buffer.from(texto), mapeo);
    expect(sinTitulo.catalogo.filas.length).toBe(10);
    expect(codigos(conTitulo)).toEqual(codigos(sinTitulo));
    expect(conTitulo.catalogo.aros).toHaveLength(3);
  });

  it("encabezado sin «Código» igual se encuentra por las columnas del mapeo", async () => {
    const m = matrizDelReporte();
    m[ENCABEZADO][0] = "Cod. Fénix";
    const mapeo = { ...MAPEO, columnas: { ...MAPEO.columnas, codigo: "cod. fénix" } };
    const l = await leer("INVENTARIO.xls", libro([{ nombre: "Sheet", filas: m }], "biff8"), mapeo);
    expect(codigos(l)).toEqual(ESPERADO);
  });

  it("mayúsculas, tildes y espacios de más en los nombres de columna no cambian nada", async () => {
    const m = matrizDelReporte();
    const renombrar: Record<string, string> = {
      "código": "CODIGO", articulo: "  ARTÍCULO ", "precio a": "Precio  A", "precio d": "PRECIO D ", existencia: "Existéncia",
    };
    m[ENCABEZADO] = m[ENCABEZADO].map((c) => renombrar[c.trim().toLowerCase()] ?? c);
    const l = await leer("INVENTARIO.xls", libro([{ nombre: "Sheet", filas: comoNumeros(m) }], "biff8"));
    expect(codigos(l)).toEqual(ESPERADO);
    expect(l.catalogo.filas[0].cruda).toMatchObject({ marca: "HAIDA", stock: "11" });
    // El control de tipeo (precio d) sigue funcionando con el nombre cambiado.
    expect(l.catalogo.descartadas.some((d) => /menor que/.test(d.motivo))).toBe(true);
  });
});

describe("números: como texto, coma decimal, separador de miles", () => {
  it.each([
    ["139.99", 139.99], ["139,99", 139.99], ["1.177,99", 1177.99], ["1,177.99", 1177.99],
    ["1 177,99", 1177.99], ["$ 139.99", 139.99], ["$139,99", 139.99], [" 11.00 ", 11], ["11,00", 11],
    ["-4", -4], ["-4.00", -4], ["4092", 4092], ["1.120", 1120], ["1,120", 1120], ["0.125", 0.125],
    ["1.234.567", 1234567], ["", null], ["abc", null], ["12abc", null],
  ])("«%s» → %s", (texto, n) => {
    expect(archivo.numeroDelArchivo(texto)).toBe(n);
  });

  it("precios y existencias escritos como texto, con coma y con miles, en el reporte", async () => {
    const m = matrizDelReporte();
    const pa = columna(m, "precio a");
    const pd = columna(m, "precio d");
    const ex = columna(m, "existencia");
    const haida = filaDe(m, "A0100");
    const kenda = filaDe(m, "A0101");
    m[haida][pa] = "1.399,99"; m[haida][pd] = "1.120"; m[haida][ex] = " 11,00 ";
    m[kenda][pa] = "$ 161,00"; m[kenda][pd] = "135";
    const l = await leer("INVENTARIO.xls", libro([{ nombre: "Sheet", filas: m }], "biff8"));
    expect(codigos(l)).toEqual(ESPERADO);
    const [h, k] = l.catalogo.filas;
    expect(h.precios.conIva).toBe(1399.99);
    expect(h.cruda.stock).toBe("11");
    expect(k.precios.conIva).toBe(161);
  });
});

describe("filas vacías y filas de totales no son llantas ni descartadas", () => {
  it("filas en blanco en medio y un TOTAL GENERAL con el rótulo en otra columna", async () => {
    const m = matrizDelReporte();
    const ancho = m[ENCABEZADO].length;
    const vacia = () => Array.from({ length: ancho }, () => "");
    const total = vacia(); total[2] = "TOTAL GENERAL"; total[columna(m, "existencia")] = "38";
    const totales = vacia(); totales[0] = "Totales:"; totales[columna(m, "existencia")] = "38";
    m.splice(filaDe(m, "A0101"), 0, vacia(), vacia());
    m.push(total, totales);
    const l = await leer("INVENTARIO.xls", libro([{ nombre: "Sheet", filas: comoNumeros(m) }], "biff8"));
    expect(codigos(l)).toEqual(ESPERADO);
    expect(l.catalogo.descartadas).toHaveLength(3);
  });
});

describe("columnas de más o de menos", () => {
  it("columnas que no están en el mapeo (en medio y al final) se ignoran", async () => {
    const m = matrizDelReporte().map((f, i) => {
      const fila = [...f];
      fila.splice(3, 0, i === ENCABEZADO ? "Ubicación" : i > ENCABEZADO ? "PERCHA 3" : "");
      fila.push(i === ENCABEZADO ? "Observación" : "");
      return fila;
    });
    const l = await leer("INVENTARIO.xls", libro([{ nombre: "Sheet", filas: comoNumeros(m) }], "biff8"));
    expect(codigos(l)).toEqual(ESPERADO);
  });

  it("sin la columna opcional de control (precio d) se lee igual, sin ese control", async () => {
    const m = sinColumna(matrizDelReporte(), "precio d");
    const l = await leer("INVENTARIO.xls", libro([{ nombre: "Sheet", filas: comoNumeros(m) }], "biff8"));
    expect(l.faltantes).toEqual([]);
    expect(codigos(l)).toEqual(["A0100", "A0101", "A0102", "A0103"]);
  });

  it("sin la columna de stock: lo dice en palabras y no deja ninguna llanta", async () => {
    const m = sinColumna(matrizDelReporte(), "existencia");
    const l = await leer("INVENTARIO.xls", libro([{ nombre: "Sheet", filas: comoNumeros(m) }], "biff8"));
    expect(l.faltantes).toHaveLength(1);
    expect(l.faltantes[0]).toMatch(/No encontré la columna del stock \(«existencia»\)/);
    const d = archivo.decidirCarga(l, null);
    expect(d.tipo).toBe("rechazar");
    expect(d.tipo === "rechazar" && d.mensaje).toMatch(/No encontré la columna del stock/);
  });

  it("sin la columna de precio tampoco pasa", async () => {
    const m = sinColumna(matrizDelReporte(), "precio a");
    const l = await leer("INVENTARIO.xls", libro([{ nombre: "Sheet", filas: comoNumeros(m) }], "biff8"));
    expect(l.faltantes.join(" ")).toMatch(/precio de venta \(«precio a»\)/);
    expect(archivo.decidirCarga(l, null).tipo).toBe("rechazar");
  });
});

describe("varias hojas", () => {
  it("el inventario en la segunda hoja (la primera es un resumen) se encuentra", async () => {
    const resumen = [["Resumen del día"], ["Total de llantas", 38], ["Elaborado por", "bodega"]];
    const l = await leer("INVENTARIO.xlsx", libro([
      { nombre: "Resumen", filas: resumen },
      { nombre: "Inventario", filas: comoNumeros(matrizDelReporte()) },
    ], "xlsx"));
    expect(codigos(l)).toEqual(ESPERADO);
    expect(l.catalogo.hoja).toBe("Inventario");
  });

  it("con el inventario en la primera hoja y otra hoja de notas, se queda con la primera", async () => {
    const l = await leer("INVENTARIO.xls", libro([
      { nombre: "Sheet", filas: comoNumeros(matrizDelReporte()) },
      { nombre: "Notas", filas: [["revisar precios de camión"]] },
    ], "biff8"));
    expect(codigos(l)).toEqual(ESPERADO);
    expect(l.catalogo.hoja).toBe("Sheet");
  });
});

describe("el mismo archivo dos veces", () => {
  it("da la misma huella y el mismo catálogo: se reconoce como repetido", async () => {
    const a = await leer("INVENTARIO.xls", REPORTE);
    const b = await leer("INVENTARIO (1).xls", REPORTE);
    expect(b.catalogo.huella).toBe(a.catalogo.huella);
    expect(codigos(b)).toEqual(codigos(a));
    expect(archivo.decidirCarga(b, a.catalogo)).toEqual({ tipo: "igual" });
  });

  it("si cambió el mapeo, el mismo archivo ya no es «el mismo»: se vuelve a leer", async () => {
    const a = await leer("INVENTARIO.xls", REPORTE);
    const otro = await leer("INVENTARIO.xls", REPORTE, { ...MAPEO, columnas: { ...MAPEO.columnas, precioControl: undefined } });
    expect(otro.catalogo.huella).not.toBe(a.catalogo.huella);
  });
});

describe("la regla de seguridad: un archivo malo nunca reemplaza al bueno", () => {
  /** Un catálogo «anterior» de n llantas con stock s cada una, del día dado. */
  const anterior = (n: number, opciones: { stock?: number; fechaReporte?: string | null } = {}) => ({
    nombreArchivo: "ayer.xls",
    subidoEn: "2026-11-17T13:00:00.000Z",
    fechaReporte: opciones.fechaReporte ?? null,
    huella: "otra",
    hoja: "Sheet",
    filas: Array.from({ length: n }, (_, i) => ({
      cruda: { medida: "205/55R16", marca: "X", diseno: "Y", codigo: `C${i}`, precio: "50", stock: String(opciones.stock ?? 4), filaNumero: i + 2 },
      precios: { conIva: 50, listaConIva: 50, minimoConIva: 50, taxRate: 0.15 },
    })),
    aros: [],
    descartadas: [],
  });

  it("el umbral: cae más del 30 % de las llantas contra la carga anterior → pide confirmación", () => {
    expect(archivo.UMBRAL_CAIDA).toBe(0.3);
  });

  it("primer archivo bueno: entra", async () => {
    expect(archivo.decidirCarga(await leer("INVENTARIO.xls", REPORTE), null)).toEqual({ tipo: "ok" });
  });

  it("0 llantas: se rechaza con un motivo que se entiende", async () => {
    const m = matrizDelReporte();
    const pa = columna(m, "precio a");
    for (const f of m.slice(ENCABEZADO + 1)) if (/^A\d+/.test(f[0] ?? "")) f[pa] = "0";
    const l = await leer("INVENTARIO.xls", libro([{ nombre: "Sheet", filas: m }], "biff8"));
    const d = archivo.decidirCarga(l, null);
    expect(d.tipo).toBe("rechazar");
    expect(d.tipo === "rechazar" && d.mensaje).toMatch(/ninguna llanta/i);
  });

  it("un archivo que no es un inventario (una hoja cualquiera) se rechaza", async () => {
    const l = await leer("notas.xlsx", libro([{ nombre: "Hoja1", filas: [["hola"], ["mundo"]] }], "xlsx"));
    expect(archivo.decidirCarga(l, null).tipo).toBe("rechazar");
  });

  it("todas las llantas con stock 0 (columna equivocada) se rechaza", async () => {
    const m = matrizDelReporte();
    const ex = columna(m, "existencia");
    for (const f of m.slice(ENCABEZADO + 1)) if (/^A\d+/.test(f[0] ?? "")) f[ex] = "0";
    const l = await leer("INVENTARIO.xls", libro([{ nombre: "Sheet", filas: m }], "biff8"));
    const d = archivo.decidirCarga(l, null);
    expect(d.tipo).toBe("rechazar");
    expect(d.tipo === "rechazar" && d.mensaje).toMatch(/stock/i);
  });

  it("de 10 llantas a 3 (cae 70 %) → pide confirmación, con los dos números", async () => {
    const l = await leer("INVENTARIO.xls", REPORTE);
    const d = archivo.decidirCarga(l, anterior(10));
    expect(d.tipo).toBe("confirmar");
    expect(d.tipo === "confirmar" && d.mensaje).toMatch(/3 llantas.*10/);
  });

  it("de 4 a 3 (cae 25 %) → entra sin preguntar", async () => {
    const l = await leer("INVENTARIO.xls", REPORTE);
    expect(archivo.decidirCarga(l, anterior(4, { stock: 3 }))).toEqual({ tipo: "ok" });
  });

  it("las unidades en stock caen a menos de la mitad → pide confirmación", async () => {
    const l = await leer("INVENTARIO.xls", REPORTE); // 3 llantas, 11 + 0 + 4 = 15 unidades
    const d = archivo.decidirCarga(l, anterior(3, { stock: 20 })); // 60 unidades antes
    expect(d.tipo).toBe("confirmar");
    expect(d.tipo === "confirmar" && d.mensaje).toMatch(/unidades/);
  });

  it("un reporte MÁS VIEJO que el cargado → pide confirmación", async () => {
    const l = await leer("INVENTARIO.xls", REPORTE); // reporte del 6-nov
    const d = archivo.decidirCarga(l, anterior(3, { stock: 5, fechaReporte: "2026-11-17T12:00:00.000Z" }));
    expect(d.tipo).toBe("confirmar");
    expect(d.tipo === "confirmar" && d.mensaje).toMatch(/más viejo/);
  });
});

describe("los motivos de las filas descartadas, en palabras simples", () => {
  it("se agrupan: sin precio, error de tipeo, camión 17.5", async () => {
    const l = await leer("INVENTARIO.xls", REPORTE);
    const grupos = archivo.descartadasEnPalabras(l.catalogo.descartadas);
    expect(grupos).toEqual([
      { motivo: expect.stringMatching(/Precio A más bajo que el Precio D/), filas: [20] },
      { motivo: expect.stringMatching(/Sin precio/), filas: [24] },
      { motivo: expect.stringMatching(/camión.*17\.5 o 22\.5/), filas: [28] },
    ]);
  });
});

const REAL = process.env.FENIX_REAL;
describe.skipIf(!REAL || !existsSync(REAL))("el Excel REAL de Jenny (6-nov), si está a mano", () => {
  it("482 llantas, 19 descartadas, ninguna columna faltante y entra", async () => {
    const l = await leer("INVENTARIO_06NOV_fenix.xls", readFileSync(REAL!));
    expect(l.faltantes).toEqual([]);
    expect(l.catalogo.filas).toHaveLength(482);
    expect(l.catalogo.descartadas).toHaveLength(19);
    expect(archivo.decidirCarga(l, null)).toEqual({ tipo: "ok" });
  });

  it("el real guardado como .xlsx y como .csv da las mismas 482", async () => {
    const libroReal = XLS.read(readFileSync(REAL!), { type: "buffer" });
    for (const tipo of ["xlsx", "csv"] as const) {
      const cuerpo = Buffer.from(XLS.write(libroReal, { type: "buffer", bookType: tipo }));
      const l = await leer(`INVENTARIO.${tipo}`, cuerpo);
      expect(l.catalogo.filas, tipo).toHaveLength(482);
    }
  });
});
