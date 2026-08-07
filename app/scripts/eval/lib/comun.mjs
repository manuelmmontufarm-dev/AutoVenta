/**
 * Piezas compartidas por extraer / replay / calificar / informe.
 *
 * Nada de esto es específico del bot: son las cuatro cosas que un harness que
 * gasta dinero de verdad necesita para no tener que empezar de cero cuando algo
 * revienta a la mitad — flags, .env, checkpoints y reintentos.
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const AQUI = dirname(fileURLToPath(import.meta.url));
export const EVAL = resolve(AQUI, "..");
export const APP = resolve(EVAL, "../..");
export const DATOS = resolve(EVAL, "datos");
export const FIXTURES = resolve(EVAL, "fixtures");

/** Ruta de una salida, creando `datos/` si hace falta. */
export function ruta(nombre) {
  mkdirSync(DATOS, { recursive: true });
  return resolve(DATOS, nombre);
}

// ── Flags ────────────────────────────────────────────────────────────────────

export function flags(argv = process.argv.slice(2)) {
  const pares = new Map();
  const sueltos = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (!v.startsWith("--")) continue;
    const nombre = v.slice(2);
    const siguiente = argv[i + 1];
    if (siguiente && !siguiente.startsWith("--")) { pares.set(nombre, siguiente); i += 1; }
    else sueltos.add(nombre);
  }
  return {
    dry: sueltos.has("dry"),
    tiene: (n) => sueltos.has(n) || pares.has(n),
    valor: (n, porDefecto = null) => (pares.has(n) ? pares.get(n) : porDefecto),
    numero: (n, porDefecto) => (pares.has(n) ? Number(pares.get(n)) : porDefecto),
  };
}

// ── .env ─────────────────────────────────────────────────────────────────────

/**
 * Carga `.env` sin dependencias.
 *
 * Tolera `OPENAI_API_KEY =valor` (con espacio antes del `=`, que es como está
 * hoy el archivo real): la clave se recorta. NO pisa lo que ya venga del
 * entorno — así una corrida puede apuntar a otra base sin editar el archivo.
 */
export function cargarEnv(archivo = resolve(APP, ".env")) {
  if (!existsSync(archivo)) return [];
  const puestas = [];
  for (const linea of readFileSync(archivo, "utf8").split("\n")) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const corte = limpia.indexOf("=");
    if (corte < 0) continue;
    const clave = limpia.slice(0, corte).trim();
    let valor = limpia.slice(corte + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    if (!clave || process.env[clave] !== undefined) continue;
    process.env[clave] = valor;
    puestas.push(clave);
  }
  return puestas;
}

// ── Concurrencia y reintentos ────────────────────────────────────────────────

/** Pool de N trabajadores sobre una lista. Mantiene el orden de la entrada. */
export async function enParalelo(items, n, fn) {
  const salida = new Array(items.length);
  let siguiente = 0;
  const trabajador = async () => {
    for (;;) {
      const i = siguiente;
      siguiente += 1;
      if (i >= items.length) return;
      salida[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, trabajador));
  return salida;
}

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Reintento con backoff exponencial y jitter.
 *
 * Solo reintenta lo que tiene sentido reintentar: 429 (cuota por minuto), 5xx y
 * caídas de red. Un 400 —modelo mal escrito, JSON inválido— se propaga al
 * instante: reintentarlo 5 veces solo hace esperar 30 s para el mismo error.
 */
export async function conReintentos(fn, { intentos = 5, base = 2000, etiqueta = "llamada", aviso = console.error } = {}) {
  let ultimo;
  for (let intento = 1; intento <= intentos; intento += 1) {
    try {
      return await fn(intento);
    } catch (error) {
      ultimo = error;
      const codigo = error?.status ?? error?.statusCode ?? null;
      const reintentable = codigo === 429 || (codigo >= 500 && codigo < 600)
        || /ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up|terminated/i.test(String(error?.message ?? ""));
      if (!reintentable || intento === intentos) throw error;
      const espera = Math.round(base * 2 ** (intento - 1) * (0.75 + Math.random() * 0.5));
      aviso(`   ⏳ ${etiqueta}: ${codigo ?? "red"} — reintento ${intento}/${intentos - 1} en ${(espera / 1000).toFixed(1)} s`);
      await dormir(espera);
    }
  }
  throw ultimo;
}

// ── Checkpoint ───────────────────────────────────────────────────────────────

/**
 * Bitácora JSONL con reanudación.
 *
 * Es un archivo de líneas y no un JSON grande a propósito: si el proceso muere
 * a la mitad —y con 164 conversaciones y un modelo caro, muere— lo escrito
 * hasta esa línea sigue siendo válido y `--retomar` no vuelve a pagarlo. La
 * línea a medio escribir se descarta al leer.
 */
export class Checkpoint {
  /**
   * @param {string} archivo
   * @param {(fila: any) => string} llaveDe
   * @param {object} [opciones]
   * @param {object} [opciones.firma]
   *   Los parámetros que definen QUÉ se está calculando (modo, entrada, límite,
   *   modelo…). Se escribe como primera línea del JSONL y `--retomar` la exige
   *   idéntica. Sin esto una corrida `--modo autonomo` a medias se completa con
   *   turnos `fiel` y el archivo miente sobre su propia procedencia.
   * @param {(fila: any) => boolean} [opciones.valida]
   *   Qué fila cuenta como "ya pagada". Por defecto todas. El juez pasa
   *   `(r) => !r.error`: un 429 que sobrevivió a los reintentos NO puede quedar
   *   cacheado para siempre, porque entonces `--retomar` nunca lo recupera y la
   *   única salida es borrar el archivo y volver a pagar todos los juicios.
   */
  constructor(archivo, llaveDe, { firma = null, valida = null } = {}) {
    this.archivo = archivo;
    this.llaveDe = llaveDe;
    this.firma = firma;
    this.valida = valida;
    this.hechas = new Set();
    this.filas = [];
    /** Firma leída del archivo (null si no tenía). */
    this.firmaGuardada = undefined;
    /** Filas descartadas al cargar por no pasar `valida`: se van a reintentar. */
    this.reintentables = 0;
  }

  /** Texto estable de una firma, para compararla sin depender del orden de claves. */
  static textoFirma(firma) {
    if (!firma) return "";
    return JSON.stringify(Object.fromEntries(
      Object.entries(firma).sort(([a], [b]) => a.localeCompare(b)),
    ));
  }

  /**
   * Devuelve `{ ok, motivo }`. `ok:false` significa que el archivo existente
   * pertenece a OTRA corrida y quien llama debe decidir (abortar o limpiar).
   */
  cargar() {
    if (!existsSync(this.archivo)) {
      this.firmaGuardada = null;
      return { ok: true, motivo: null };
    }
    const porLlave = new Map();
    for (const linea of readFileSync(this.archivo, "utf8").split("\n")) {
      if (!linea.trim()) continue;
      let fila;
      try {
        fila = JSON.parse(linea);
      } catch {
        // Línea truncada por una muerte súbita: se ignora y se reescribirá.
        continue;
      }
      if (fila && fila.__firma !== undefined) { this.firmaGuardada = fila.__firma; continue; }
      // Última escritura gana: un reintento pisa al intento fallido anterior.
      porLlave.set(this.llaveDe(fila), fila);
    }
    if (this.firmaGuardada === undefined) this.firmaGuardada = null;
    for (const [llave, fila] of porLlave) {
      this.filas.push(fila);
      if (this.valida && !this.valida(fila)) { this.reintentables += 1; continue; }
      this.hechas.add(llave);
    }
    const esperada = Checkpoint.textoFirma(this.firma);
    const guardada = Checkpoint.textoFirma(this.firmaGuardada);
    if (this.firma && esperada !== guardada) {
      return {
        ok: false,
        motivo: `el checkpoint se generó con otros parámetros.\n     archivo: ${guardada || "(sin firma)"}\n     ahora:   ${esperada}`,
      };
    }
    return { ok: true, motivo: null };
  }

  limpiar() {
    writeFileSync(this.archivo, this.firma ? `${JSON.stringify({ __firma: this.firma })}\n` : "");
    this.hechas.clear();
    this.filas = [];
    this.firmaGuardada = this.firma ?? null;
    this.reintentables = 0;
    return this;
  }

  ya(llave) { return this.hechas.has(llave); }

  anotar(fila) {
    appendFileSync(this.archivo, `${JSON.stringify(fila)}\n`);
    this.filas.push(fila);
    this.hechas.add(this.llaveDe(fila));
  }

  /**
   * Las filas que valen AHORA: una por llave, la última escrita. Sin esto, un
   * turno que falló y luego se reintentó con éxito aparecería dos veces —
   * contado a la vez como juicio bueno y como juicio perdido.
   */
  finales() {
    const porLlave = new Map();
    for (const fila of this.filas) porLlave.set(this.llaveDe(fila), fila);
    return [...porLlave.values()];
  }
}

// ── Validaciones de seguridad ────────────────────────────────────────────────

/**
 * Un identificador de Postgres que se pueda interpolar sin comillas.
 *
 * `create database ${x}` va por `sql.unsafe()` a la fuerza (Postgres no admite
 * parámetros en DDL), así que el filtro tiene que estar aquí: es el único punto
 * del harness donde una bandera de la línea de comandos llega a SQL crudo.
 */
export function identificadorPg(valor, bandera) {
  if (typeof valor !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/i.test(valor)) {
    throw new Error(
      `${bandera} tiene que ser un identificador simple de Postgres ` +
      `(letras, dígitos y _; máximo 63; sin empezar por dígito). Llegó: ${JSON.stringify(valor)}`,
    );
  }
  return valor;
}

/** Toda conexión que este harness abre para ESCRIBIR tiene que ser local. */
export function exigirLocal(url, bandera) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`${bandera} no es una URL válida: ${JSON.stringify(url)}`);
  }
  if (!["localhost", "127.0.0.1", "::1", "[::1]", ""].includes(host)) {
    throw new Error(
      `${bandera} tiene que apuntar a localhost. Llegó host ${JSON.stringify(host)}.\n` +
      "   El replay crea y BORRA bases: contra un servidor remoto eso destruye datos ajenos.",
    );
  }
  return url;
}

export function escribirJson(archivo, objeto) {
  mkdirSync(dirname(archivo), { recursive: true });
  writeFileSync(archivo, JSON.stringify(objeto, null, 2));
  return archivo;
}

export function leerJson(archivo) {
  return JSON.parse(readFileSync(archivo, "utf8"));
}

// ── Presentación ─────────────────────────────────────────────────────────────

export const CINTA = "─".repeat(74);

export function titulo(texto, modo) {
  console.log(`\n${CINTA}\n${texto}${modo ? `  ·  modo ${modo}` : ""}\n${CINTA}`);
}

/** Aviso imposible de pasar por alto de que los números NO son reales. */
export function avisoDry(que) {
  console.log(
    `⚠️  MODO --dry: ${que}\n` +
    "   Sirve para comprobar el cableado, NO para sacar conclusiones del bot.\n",
  );
}
