/**
 * Conector de Fénix para AutoVenta. Corre en el servidor del cliente.
 *
 *   conector                      una pasada: inventario + facturas recientes → bot
 *   conector --probar             lee Fénix y le pregunta al bot qué pasaría. NO guarda nada.
 *   conector --historial 365      manda las facturas de los últimos 365 días (una sola vez)
 *   conector --explorar           escribe exploracion.txt con todas las tablas de la base
 *   conector --buscar "008760"    en qué tabla/columna aparece ese texto
 *   conector --muestra public.articulos   primeras filas de una tabla
 *
 * Lee `config.json` de su misma carpeta (o `--config ruta`).
 */
import { appendFileSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { correrCiclo } from "./ciclo.mjs";
import { leerConfig } from "./config.mjs";
import { VERSION, llamar } from "./enviar.mjs";
import { buscarValor, listarTablas, muestraDeTabla, tablaEnTexto, tablasEnTexto } from "./explorar.mjs";
import { abrirMotor } from "./motores/index.mjs";

function argumentos(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) { args._.push(a); continue; }
    const siguiente = argv[i + 1];
    if (siguiente !== undefined && !siguiente.startsWith("--")) { args[a.slice(2)] = siguiente; i += 1; }
    else args[a.slice(2)] = true;
  }
  return args;
}

/** La carpeta de trabajo: ahí viven config.json, estado.json y conector.log. */
function carpetaBase(rutaConfig) {
  if (typeof rutaConfig === "string") return path.dirname(path.resolve(rutaConfig));
  const entrada = process.argv[1] ? path.resolve(process.argv[1]) : process.cwd();
  return existsSync(entrada) && statSync(entrada).isFile() ? path.dirname(entrada) : process.cwd();
}

function registrador(carpeta, aConsola) {
  const ruta = path.join(carpeta, "conector.log");
  return (mensaje) => {
    const linea = `${new Date().toLocaleString("sv-SE")}  ${mensaje}`;
    if (aConsola) console.log(mensaje);
    try {
      // Un log que crece para siempre termina llenando el disco de otro.
      if (existsSync(ruta) && statSync(ruta).size > 2_000_000) renameSync(ruta, `${ruta}.1`);
      appendFileSync(ruta, `${linea}\n`);
    } catch { /* sin permiso de escritura no se registra, pero el conector sigue */ }
  };
}

function leerEstado(ruta) {
  try { return JSON.parse(readFileSync(ruta, "utf8")); } catch { return {}; }
}

function contarEnsayo(titulo, parte) {
  if (!parte) return;
  console.log(`\n── ${titulo} ──`);
  if (parte.columnas) console.log(`Columnas: ${parte.columnas.join(", ")}`);
  if (parte.muestra?.length) console.log(tablaEnTexto(parte.columnas, parte.muestra));
  const c = parte.cuerpo ?? {};
  if (parte.status !== 200) { console.log(`El bot lo rechazó (${parte.status}): ${c.error}`); return; }
  if (titulo === "Inventario") {
    console.log(`El bot leería ${c.llantas} llantas y ${c.aros} aros (${c.unidades} unidades en stock).`);
    if (c.cargadas) console.log(`Hoy tiene cargadas ${c.cargadas.llantas} llantas (${c.cargadas.unidades} unidades).`);
    for (const d of c.descartadas ?? []) console.log(`  descartadas ${d.filas}: ${d.motivo}`);
    for (const f of c.faltantes ?? []) console.log(`  FALTA: ${f}`);
    const decision = c.decision?.tipo;
    console.log(decision === "ok" || decision === "igual" ? "→ Se cargaría sin preguntar." : `→ NO se cargaría solo (${decision}): ${c.decision?.mensaje}`);
  } else if (c.facturas === 0 && !c.primerDia) {
    console.log("No hay facturas en esos días.");
  } else {
    console.log(`El bot leería ${c.facturas} facturas (${c.primerDia} → ${c.ultimoDia}): ${c.conTelefono} con teléfono, ${c.conLlantas} con llantas.`);
    if (c.descartadas) console.log(`  ${c.descartadas} filas descartadas: ${(c.motivos ?? []).join(" · ")}`);
    if (c.facturas && !c.conTelefono) console.log("  OJO: ninguna trae teléfono; sin teléfono no se puede cruzar la venta con el chat.");
  }
}

export async function principal(argv = process.argv.slice(2)) {
  const args = argumentos(argv);
  const carpeta = carpetaBase(args.config);
  const interactivo = Boolean(args.probar || args.explorar || args.buscar || args.muestra || args.historial);
  const log = registrador(carpeta, interactivo || process.stdout.isTTY);
  if (args.version) { console.log(VERSION); return 0; }

  let config;
  try {
    config = leerConfig(typeof args.config === "string" ? args.config : path.join(carpeta, "config.json"));
  } catch (error) {
    // Siempre a la pantalla: es lo primero que falla la primera vez.
    registrador(carpeta, true)(`ERROR de configuración: ${error.message}`);
    return 2;
  }

  if (args.explorar || args.buscar || args.muestra) {
    const motor = await abrirMotor(config);
    try {
      if (typeof args.muestra === "string") {
        const { columnas, filas } = await muestraDeTabla(motor, args.muestra);
        console.log(tablaEnTexto(columnas, filas));
      } else if (typeof args.buscar === "string") {
        console.log(`Buscando «${args.buscar}» en todas las tablas (puede tardar unos minutos)…`);
        const hallazgos = await buscarValor(motor, args.buscar, {
          alAvanzar: (i, total, tabla) => process.stdout.isTTY && process.stdout.write(`\r  ${i}/${total}  ${tabla.padEnd(50).slice(0, 50)}`),
        });
        console.log(hallazgos.length ? `\nAparece en:\n${hallazgos.map((h) => `  ${h.tabla}.${h.columna}  (${h.filas} filas)`).join("\n")}` : "\nNo aparece en ninguna columna de texto.");
      } else {
        const salida = path.join(carpeta, "exploracion.txt");
        writeFileSync(salida, tablasEnTexto(await listarTablas(motor)));
        console.log(`Listo: ${salida}`);
      }
      return 0;
    } catch (error) {
      console.error(`ERROR: ${error.message}`);
      return 1;
    } finally {
      await motor.cerrar().catch(() => undefined);
    }
  }

  if (args.probar) {
    try {
      const { status, cuerpo } = await llamar(config, "/estado", { metodo: "GET", intentos: 1 });
      if (status !== 200) { console.log(`El bot no aceptó la clave (${status}): ${cuerpo.error}`); return 1; }
      console.log(`Conexión con el bot: bien (${config.servidor}).`);
    } catch (error) {
      console.log(error.message);
      return 1;
    }
    const resultado = await correrCiclo(config, { ensayo: true, log: () => undefined, dias: Number(args.dias) || undefined });
    if (resultado.error) { console.log(`\nNo pude leer Fénix: ${resultado.error}`); return 1; }
    contarEnsayo("Inventario", resultado.inventario);
    contarEnsayo("Facturas", resultado.facturas);
    console.log("\nEsto fue un ensayo: no se guardó nada en el bot.");
    return resultado.ok ? 0 : 1;
  }

  const rutaEstado = path.join(carpeta, "estado.json");
  const estado = leerEstado(rutaEstado);
  const historial = Number(args.historial);
  const resultado = await correrCiclo(config, {
    estado,
    log,
    dias: Number.isFinite(historial) && historial > 0 ? historial : undefined,
  });
  try { writeFileSync(rutaEstado, JSON.stringify({ ...estado, ultimaPasada: new Date().toISOString(), ok: resultado.ok })); } catch { /* ver registrador */ }
  return resultado.ok ? 0 : 1;
}
