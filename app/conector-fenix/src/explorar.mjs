/**
 * Para la primera vez en un cliente: ¿en qué tablas guarda Fénix los artículos,
 * el stock, los precios y las facturas? Nadie nos da el plano, así que se mira.
 *
 *   --explorar            lista todas las tablas con sus columnas y cuántas filas tienen
 *   --buscar "008760"     dice en qué tabla y columna aparece ese texto (un código de
 *                         artículo o un número de factura que se ve en la pantalla de Fénix)
 *   --muestra esquema.tabla   las primeras filas de una tabla
 *
 * Todo es solo lectura.
 */

/** Nombres que suelen tener las tablas que buscamos. Solo ordena la lista: no decide nada. */
const PISTAS = /art|prod|item|inven|stock|exist|saldo|bodega|almac|precio|lista|fact|venta|comprob|docum|movim|detalle|client|person|tercero/i;

const TIPOS_DE_TEXTO = /char|text|string|clob/i;

export async function listarTablas(motor) {
  const tablas = await motor.tablas();
  return tablas.sort((a, b) => {
    const pa = PISTAS.test(a.tabla) ? 0 : 1;
    const pb = PISTAS.test(b.tabla) ? 0 : 1;
    return pa - pb || (b.filas ?? 0) - (a.filas ?? 0);
  });
}

export function tablasEnTexto(tablas) {
  const lineas = [`${tablas.length} tablas. Primero las que por el nombre parecen artículos, stock, precios, facturas o clientes.`, ""];
  for (const t of tablas) {
    lineas.push(`${t.esquema}.${t.tabla}  (${t.filas ?? "?"} filas)${PISTAS.test(t.tabla) ? "  ←" : ""}`);
    lineas.push(`    ${t.columnas.map((c) => `${c.nombre} ${c.tipo}`).join(", ")}`);
  }
  return `${lineas.join("\n")}\n`;
}

/**
 * Busca `valor` en todas las columnas de texto de todas las tablas. Lento a
 * propósito (una consulta por tabla) y con tope de filas: se corre una vez.
 * @returns {Promise<Array<{ tabla: string, columna: string }>>}
 */
export async function buscarValor(motor, valor, { maxFilas = 5_000_000, alAvanzar = () => undefined } = {}) {
  const hallazgos = [];
  const tablas = await motor.tablas();
  for (const [i, t] of tablas.entries()) {
    alAvanzar(i + 1, tablas.length, `${t.esquema}.${t.tabla}`);
    if ((t.filas ?? 0) > maxFilas) continue;
    const deTexto = t.columnas.filter((c) => TIPOS_DE_TEXTO.test(c.tipo));
    if (!deTexto.length) continue;
    const tabla = motor.nombreDeTabla(t.esquema, t.tabla);
    // Una sola pasada por tabla: cuenta, por columna, cuántas filas lo contienen.
    const sumas = deTexto.map((c, k) => `sum(case when ${motor.contiene(motor.nombreDeColumna(c.nombre), valor)} then 1 else 0 end) as c${k}`);
    try {
      const { filas } = await motor.consultar(`select ${sumas.join(", ")} from ${tabla}`);
      deTexto.forEach((c, k) => {
        const n = Number(filas[0]?.[k] ?? 0);
        if (n > 0) hallazgos.push({ tabla: `${t.esquema}.${t.tabla}`, columna: c.nombre, filas: n });
      });
    } catch {
      // Una tabla sin permiso o con un tipo raro no frena la búsqueda.
    }
  }
  return hallazgos;
}

export async function muestraDeTabla(motor, nombre, n = 5) {
  const partes = nombre.split(".");
  const [esquema, tabla] = partes.length > 1 ? [partes[0], partes.slice(1).join(".")] : ["public", partes[0]];
  return motor.consultar(motor.limite(`select * from ${motor.nombreDeTabla(esquema, tabla)}`, n));
}

/** Una tabla chica como texto alineado, para leerla en la consola. */
export function tablaEnTexto(columnas, filas) {
  const celdas = [columnas, ...filas.map((f) => f.map((v) => (v === null || v === undefined ? "" : String(v).trim().slice(0, 40))))];
  const anchos = columnas.map((_, i) => Math.max(...celdas.map((f) => String(f[i] ?? "").length)));
  return celdas.map((f) => f.map((v, i) => String(v ?? "").padEnd(anchos[i])).join("  ").trimEnd()).join("\n");
}
