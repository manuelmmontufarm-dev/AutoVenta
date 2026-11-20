/**
 * Una pasada del conector: leer Fénix → mandar al bot. La corre el Programador
 * de tareas de Windows cada 5 minutos y termina; no queda nada prendido que se
 * pueda colgar, y después de un reinicio vuelve solo.
 */
import { createHash } from "node:crypto";
import { aCsv, tandasPorDocumento } from "./csv.mjs";
import { conDesde, diaDeHace } from "./consultas.mjs";
import { enviarCsv, latido } from "./enviar.mjs";
import { abrirMotor } from "./motores/index.mjs";

/** Filas por envío de facturas: ~1 MB, bien por debajo del tope del bot. */
const FILAS_POR_TANDA = 5000;

const huella = (texto) => createHash("sha256").update(texto).digest("hex");

/** Nunca se manda al bot ni se escribe en el log la clave de la base. */
function sinSecretos(mensaje, config) {
  let limpio = String(mensaje);
  for (const secreto of [config.conexion?.clave, config.clave]) {
    if (secreto && String(secreto).length >= 4) limpio = limpio.split(String(secreto)).join("•••");
  }
  return limpio.slice(0, 500);
}

function columnaDe(columnas, nombre) {
  const clave = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  return columnas.findIndex((c) => clave(c) === clave(nombre));
}

async function pasarInventario(config, motor, { ensayo, log, opcionesDeEnvio }) {
  const { columnas, filas } = await motor.consultar(config.inventario.sql);
  log(`Inventario: ${filas.length} filas leídas de Fénix.`);
  if (!filas.length) {
    // Un inventario vacío casi siempre es una consulta rota, no un local sin llantas.
    throw new Error("La consulta de inventario no devolvió ninguna fila.");
  }
  const { status, cuerpo } = await enviarCsv(config, "/inventario", "fenix-inventario.csv", aCsv(columnas, filas), { ensayo, ...opcionesDeEnvio });
  if (ensayo) return { status, cuerpo, columnas, muestra: filas.slice(0, 3) };
  if (status === 200) log(cuerpo.sinCambios ? "Inventario: sin cambios." : `Inventario: ${cuerpo.llantas} llantas cargadas en el bot (${cuerpo.descartadas} filas descartadas).`);
  else log(`Inventario NO cargado (${status}): ${cuerpo.error}`);
  return { status, cuerpo };
}

async function pasarFacturas(config, motor, { ensayo, dias, estado, log, opcionesDeEnvio, ahora }) {
  const desde = diaDeHace(dias, ahora);
  const { columnas, filas } = await motor.consultar(conDesde(config.facturas.sql, desde));
  log(`Facturas: ${filas.length} líneas desde el ${desde}.`);
  if (!filas.length) return { status: 200, cuerpo: { ok: true, facturas: 0 }, columnas, muestra: [] };
  const iDocumento = columnaDe(columnas, config.facturas.columnaDocumento);
  if (iDocumento < 0) {
    throw new Error(`La consulta de facturas no trae la columna «${config.facturas.columnaDocumento}» (trae: ${columnas.join(", ")}).`);
  }
  // Las líneas de una factura tienen que ir juntas para no partirla entre envíos.
  const ordenadas = [...filas].sort((a, b) => String(a[iDocumento]).localeCompare(String(b[iDocumento])));
  if (ensayo) {
    const { status, cuerpo } = await enviarCsv(config, "/facturas", "fenix-facturas.csv", aCsv(columnas, ordenadas.slice(0, FILAS_POR_TANDA)), { ensayo, ...opcionesDeEnvio });
    return { status, cuerpo, columnas, muestra: ordenadas.slice(0, 3) };
  }
  let recibidas = 0;
  let ultimo = { status: 200, cuerpo: { ok: true } };
  const yaEnviadas = new Set(estado.facturas ?? []);
  const enviadasAhora = [];
  for (const tanda of tandasPorDocumento(ordenadas, iDocumento, FILAS_POR_TANDA)) {
    const csv = aCsv(columnas, tanda);
    const h = huella(csv);
    enviadasAhora.push(h);
    // Lo mismo que ya recibió el bot en la pasada anterior no se vuelve a mandar.
    if (yaEnviadas.has(h)) continue;
    ultimo = await enviarCsv(config, "/facturas", "fenix-facturas.csv", csv, opcionesDeEnvio);
    if (ultimo.status !== 200) {
      log(`Facturas NO recibidas (${ultimo.status}): ${ultimo.cuerpo.error}`);
      enviadasAhora.pop();
      break;
    }
    recibidas += ultimo.cuerpo.facturas ?? 0;
  }
  estado.facturas = enviadasAhora;
  log(recibidas ? `Facturas: ${recibidas} entregadas al bot.` : "Facturas: sin cambios.");
  return ultimo;
}

/**
 * @param config        La de `leerConfig`.
 * @param opciones.estado   Objeto que se guarda entre pasadas (qué facturas ya se mandaron).
 * @param opciones.ensayo   true = el bot dice qué pasaría, sin guardar nada.
 * @param opciones.dias     Días de facturas hacia atrás (por defecto, los de la configuración).
 * @returns {{ ok: boolean, inventario?: object, facturas?: object, error?: string }}
 */
export async function correrCiclo(config, { estado = {}, ensayo = false, dias, log = () => undefined, opcionesDeEnvio = {}, ahora = new Date() } = {}) {
  const resultado = { ok: true };
  let motor;
  try {
    motor = await abrirMotor(config);
    if (config.inventario) {
      resultado.inventario = await pasarInventario(config, motor, { ensayo, log, opcionesDeEnvio });
      if (resultado.inventario.status !== 200) resultado.ok = false;
    }
    if (config.facturas) {
      resultado.facturas = await pasarFacturas(config, motor, {
        ensayo, dias: dias ?? config.facturas.dias, estado, log, opcionesDeEnvio, ahora,
      });
      if (resultado.facturas.status !== 200) resultado.ok = false;
    }
    // El bot sabe que el conector está vivo y que de este lado no hubo error.
    if (!ensayo) await latido(config, null, opcionesDeEnvio).catch(() => undefined);
  } catch (error) {
    resultado.ok = false;
    resultado.error = sinSecretos(error.message ?? error, config);
    log(`ERROR: ${resultado.error}`);
    // Que el bot se entere de por qué no llegan datos (Fénix apagado, clave cambiada…).
    if (!ensayo) await latido(config, resultado.error, opcionesDeEnvio).catch(() => undefined);
  } finally {
    await motor?.cerrar().catch(() => undefined);
  }
  return resultado;
}
