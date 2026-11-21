/**
 * Las consultas que el conector le hace a Fénix.
 *
 * Las escribe una persona en `config.json`, una vez, mirando las tablas del
 * cliente. Dos cosas se cuidan acá:
 *
 *  1. SOLO LECTURA. El conector vive en el sistema contable de otro. Una
 *     consulta que no sea un SELECT no corre, aunque alguien la pegue con
 *     apuro en la configuración. (El motor además abre la conexión en modo
 *     solo lectura cuando el motor lo permite: son dos candados.)
 *  2. La fecha «desde» de las facturas se escribe como texto fijo que arma el
 *     conector (`{desde}` → '2026-11-17'), no como parámetro: cada motor
 *     escribe los parámetros distinto y así la misma consulta se entiende
 *     leyéndola.
 */

const PROHIBIDAS = [
  "insert", "update", "delete", "drop", "alter", "create", "truncate", "merge", "grant", "revoke",
  "exec", "execute", "call", "into", "copy", "lock", "set", "begin", "commit", "rollback",
  "replace", "attach", "detach", "backup", "restore", "shutdown", "kill", "use", "do",
];

/** La consulta sin comentarios ni textos entre comillas, para revisar solo sus palabras. */
function soloPalabras(sql) {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/\[[^\]]*\]/g, "[]")
    .replace(/`[^`]*`/g, "``");
}

/**
 * Lanza si la consulta no es un único SELECT. Devuelve la consulta lista para
 * correr (sin el punto y coma final).
 */
export function validarSoloLectura(sql, nombre = "La consulta") {
  const texto = String(sql ?? "").trim().replace(/;\s*$/, "");
  if (!texto) throw new Error(`${nombre} está vacía.`);
  const palabras = soloPalabras(texto).toLowerCase();
  if (!/^\s*(select|with)\b/.test(palabras)) {
    throw new Error(`${nombre} tiene que empezar con SELECT: el conector solo lee.`);
  }
  if (palabras.includes(";")) {
    throw new Error(`${nombre} trae más de una instrucción (hay un «;» en el medio).`);
  }
  for (const palabra of PROHIBIDAS) {
    if (new RegExp(`(^|[^a-z0-9_$#@.])${palabra}([^a-z0-9_$#@]|$)`).test(palabras)) {
      throw new Error(`${nombre} usa «${palabra.toUpperCase()}»: el conector solo lee, no corre eso.`);
    }
  }
  return texto;
}

/** "YYYY-MM-DD" de hace `dias` días, en la hora del equipo (el servidor está en Ecuador). */
export function diaDeHace(dias, ahora = new Date()) {
  const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - dias);
  const dos = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** Pone la fecha en `{desde}`. La consulta de facturas TIENE que usarla. */
export function conDesde(sql, dia) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error(`Fecha «desde» inválida: ${dia}`);
  if (!sql.includes("{desde}")) {
    throw new Error("La consulta de facturas tiene que filtrar por fecha con {desde}, por ejemplo: where fecha >= {desde}");
  }
  return sql.split("{desde}").join(`'${dia}'`);
}
