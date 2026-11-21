/**
 * Filas de una consulta → CSV, el mismo formato que el panel ya sabe leer
 * cuando alguien sube el Excel a mano. El encabezado son los nombres de las
 * columnas de la consulta: por eso la consulta les pone con `as` el nombre
 * que espera el mapeo («articulo», «precio a», «existencia»…).
 */

const dos = (n) => String(n).padStart(2, "0");

/**
 * Un número de la base (NUMERIC/DECIMAL) como texto que no se pueda leer mal.
 * Las bases devuelven «4.000» para un stock de 4 guardado con tres decimales,
 * y el lector del bot —hecho para Excel escritos por personas— lee «4.000»
 * como cuatro mil. Se quitan los ceros de relleno y, si quedan justo tres
 * decimales («12.345»), se agrega uno («12.3450») para que nunca parezca un
 * separador de miles. No pasa por Number: no se pierde ni un decimal.
 */
export function numeroComoTexto(valor) {
  const texto = String(valor ?? "").trim();
  const m = /^(-?\d+)\.(\d+)$/.exec(texto);
  if (!m) return texto;
  let decimales = m[2].replace(/0+$/, "");
  if (!decimales) return m[1];
  if (decimales.length === 3) decimales += "0";
  return `${m[1]}.${decimales}`;
}

/** Un valor de la base como texto. Las fechas, en la hora del equipo. */
export function textoDeCelda(valor) {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return "";
    const dia = `${valor.getFullYear()}-${dos(valor.getMonth() + 1)}-${dos(valor.getDate())}`;
    const hora = `${dos(valor.getHours())}:${dos(valor.getMinutes())}:${dos(valor.getSeconds())}`;
    return hora === "00:00:00" ? dia : `${dia} ${hora}`;
  }
  if (typeof valor === "boolean") return valor ? "1" : "0";
  if (typeof valor === "object") return Buffer.isBuffer(valor) ? "" : JSON.stringify(valor);
  // Los textos de ancho fijo (CHAR) llegan con espacios de relleno.
  return String(valor).trim();
}

function celdaCsv(valor) {
  const texto = textoDeCelda(valor).replace(/\r?\n/g, " ");
  return /[",;\t]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** @param {string[]} columnas @param {unknown[][]} filas */
export function aCsv(columnas, filas) {
  const lineas = [columnas.map(celdaCsv).join(",")];
  for (const fila of filas) lineas.push(fila.map(celdaCsv).join(","));
  return `${lineas.join("\n")}\n`;
}

/**
 * Parte las filas en tandas de hasta `maximo` sin separar las líneas de un
 * mismo documento: una factura repartida en dos envíos llegaría con la mitad
 * de sus productos (el segundo envío pisa al primero).
 * @param {unknown[][]} filas @param {number} columnaDocumento @param {number} maximo
 */
export function tandasPorDocumento(filas, columnaDocumento, maximo) {
  const tandas = [];
  let actual = [];
  let documento = null;
  for (const fila of filas) {
    const este = textoDeCelda(fila[columnaDocumento]);
    if (actual.length >= maximo && este !== documento) {
      tandas.push(actual);
      actual = [];
    }
    actual.push(fila);
    documento = este;
  }
  if (actual.length) tandas.push(actual);
  return tandas;
}
