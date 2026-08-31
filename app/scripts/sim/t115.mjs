#!/usr/bin/env node
/**
 * El corpus T115 completo, ejecutable.
 *
 *   node scripts/sim/t115.mjs                        # los 115 (105 nuevos + 10 históricas)
 *   node scripts/sim/t115.mjs --familia P,M          # solo esas familias
 *   node scripts/sim/t115.mjs --ids Q05,X01,H03      # solo esos IDs
 *   node scripts/sim/t115.mjs --ronda-corta          # las 10 históricas + 2 por familia (~28)
 *   node scripts/sim/t115.mjs --plomeria             # nivel 1: invariantes solamente (para el stub)
 *   node scripts/sim/t115.mjs --desde corrida.json   # re-juzga sin gastar
 *   node scripts/sim/t115.mjs --salida archivo.json
 *
 * Necesita un simulador ya levantado (sim.mjs); apunta con SIM_UI_URL,
 * SIM_APP_URL y SIM_DATABASE_URL. La flota paralela vive en t115-flota.mjs.
 *
 * Las 10 históricas (H01–H10) se corren con su arnés propio (`pruebas-10.mjs`),
 * que es el contrato congelado del 51/51: este corredor NO las reimplementa,
 * las invoca. Un H-verde aquí significa exactamente lo mismo que allá.
 */
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ESCENARIOS } from "./datos/t115-escenarios.mjs";
import { sql, correrEscenario, invariantesGlobales } from "./lib/corredor-t115.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const tiene = (n) => process.argv.includes(n);

const PLOMERIA = tiene("--plomeria");
const RONDA_CORTA = tiene("--ronda-corta");
const IDS = arg("--ids")?.split(",").map((s) => s.trim().toUpperCase()) ?? null;
const FAMILIAS = arg("--familia")?.split(",").map((s) => s.trim().toUpperCase()) ?? null;
const DESDE = arg("--desde");
const SALIDA = arg("--salida") ?? join(AQUI, "t115-resultado.json");

const V = { ok: "\x1b[32m", mal: "\x1b[31m", gris: "\x1b[90m", neg: "\x1b[1m", fin: "\x1b[0m" };

/** La ronda corta: 2 por familia, elegidos por variedad de mecánica, fijos
 *  para que dos corridas midan lo mismo. Más las 10 históricas completas. */
const RONDA = ["P03", "P10", "M01", "M07", "Q05", "Q06", "O05", "O13", "V05", "V08", "E01", "E02", "C01", "C09", "R06", "R07", "X01", "X07"];

function seleccionar() {
  let lista = ESCENARIOS;
  if (IDS) lista = lista.filter((e) => IDS.includes(e.id));
  if (FAMILIAS) lista = lista.filter((e) => FAMILIAS.includes(e.familia));
  if (RONDA_CORTA) lista = lista.filter((e) => RONDA.includes(e.id));
  return lista;
}

/** ¿Toca correr las históricas? La flota lo decide por entorno (cada carril
 *  lleva su tajada por --ids y solo el carril 0 corre las 10); a mano, con
 *  --ids/--familia solo si las nombran. */
function tocaHistoricas() {
  if (process.env.T115_HISTORICAS === "1") return true;
  if (process.env.T115_HISTORICAS === "0") return false;
  if (PLOMERIA) return false; // sus jueces esperan el modelo real, no el doble
  if (IDS) return IDS.some((i) => i.startsWith("H"));
  if (FAMILIAS) return FAMILIAS.includes("H");
  return true; // corpus completo y ronda corta las llevan siempre
}

function juzgar(resultado, escenario) {
  const checks = [];
  // En plomería el modelo es un doble con guion: los jueces de escenario
  // medirían al guion, no al bot. Solo cuentan los invariantes de cañería.
  const jueces = PLOMERIA ? [] : escenario.checks;
  for (const [nombre, fn] of jueces) {
    let motivo = null;
    try { motivo = fn(resultado.turnos, resultado.estadoFinal); }
    catch (err) { motivo = `el juez reventó: ${err.message}`; }
    checks.push({ nombre, ok: motivo === null, motivo });
  }
  for (const [nombre, motivo] of invariantesGlobales(resultado, { plomeria: PLOMERIA })) {
    checks.push({ nombre: `[global] ${nombre}`, ok: false, motivo });
  }
  if (PLOMERIA && !checks.length) checks.push({ nombre: "[global] cañería del escenario", ok: true, motivo: null });
  // Los invariantes que pasaron no se listan uno a uno: solo se anota que corrieron.
  return checks;
}

async function correrHistoricas() {
  // El arnés congelado corre con el mismo entorno; su salida JSON se absorbe.
  const salidaH = join(AQUI, "t115-historicas-resultado.json");
  const codigo = await new Promise((resolve) => {
    const p = spawn("node", [join(AQUI, "pruebas-10.mjs"), "--salida", salidaH], {
      stdio: ["ignore", "inherit", "inherit"], env: process.env,
    });
    p.on("exit", (c) => resolve(c ?? 1));
  });
  const datos = JSON.parse(await readFile(salidaH, "utf8"));
  return datos.map((conv) => ({
    id: `H${String([7946, 8288, 8318, 9684, 9887, 10002, 10859, 11274, 11620, 12682].indexOf(conv.conv) + 1).padStart(2, "0")}`,
    familia: "H",
    titulo: conv.titulo,
    checks: conv.checks,
    turnos: conv.turnos,
    estadoFinal: conv.estadoFinal ?? null,
    _codigoArnes: codigo,
  }));
}

async function main() {
  const lista = seleccionar();

  if (DESDE) {
    const guardado = JSON.parse(await readFile(DESDE, "utf8"));
    const porId = new Map(guardado.map((r) => [r.id, r]));
    let paso = 0, fallo = 0;
    for (const esc of lista) {
      const r = porId.get(esc.id);
      if (!r) { console.log(`${V.gris}  ${esc.id} no está en la corrida guardada${V.fin}`); continue; }
      const checks = esc.familia === "H" ? r.checks : juzgar(r, esc);
      const malos = checks.filter((c) => !c.ok);
      paso += checks.length - malos.length; fallo += malos.length;
      if (malos.length) console.log(`${V.mal}  ✗ ${esc.id}${V.fin} ${malos.map((m) => `${m.nombre} — ${m.motivo}`).join(" · ")}`);
    }
    console.log(`\n${V.neg}  re-juzgado: ${V.ok}${paso} pasaron${V.fin} · ${fallo ? V.mal : V.gris}${fallo} fallaron${V.fin}`);
    await sql.end();
    process.exit(fallo ? 1 : 0);
  }

  const resultados = [];
  const pendientes = [];
  let paso = 0, fallo = 0;

  for (const esc of lista) {
    if (esc.requiereInyeccion && !PLOMERIA) {
      // NO SE FINGE MEDIDO LO QUE EL ARNÉS AÚN NO PUEDE PROVOCAR. Estos
      // escenarios necesitan inyección de fallos (timeout, imagen caída…);
      // hasta que exista, se reportan aparte — nunca como verdes.
      pendientes.push(esc.id);
      continue;
    }
    process.stdout.write(`${V.neg}  ${esc.id}${V.fin} ${V.gris}${esc.titulo}${V.fin}\n`);
    let resultado;
    try {
      resultado = await correrEscenario(esc);
    } catch (err) {
      resultado = { id: esc.id, familia: esc.familia, titulo: esc.titulo, turnos: [], estadoFinal: null, errorArnes: err.message };
    }
    const checks = resultado.errorArnes
      ? [{ nombre: "el escenario pudo correr", ok: false, motivo: resultado.errorArnes }]
      : juzgar(resultado, esc);
    resultado.checks = checks;
    resultados.push(resultado);
    for (const c of checks) {
      if (c.ok) { paso += 1; continue; }
      fallo += 1;
      console.log(`      ${V.mal}✗ ${c.nombre}${V.fin}${V.mal} — ${c.motivo}${V.fin}`);
    }
  }

  if (tocaHistoricas()) {
    console.log(`\n${V.neg}  Las 10 históricas (arnés congelado del 51/51)${V.fin}`);
    const historicas = await correrHistoricas();
    for (const h of historicas) {
      resultados.push(h);
      const malos = (h.checks ?? []).filter((c) => !c.ok);
      paso += (h.checks ?? []).length - malos.length;
      fallo += malos.length;
    }
  }

  await writeFile(SALIDA, JSON.stringify(resultados, null, 1));
  console.log(`\n${V.neg}  ─────────────────────────────────────────${V.fin}`);
  console.log(`  comprobaciones: ${V.ok}${paso} pasaron${V.fin}${fallo ? ` · ${V.mal}${fallo} fallaron${V.fin}` : ""}`);
  if (pendientes.length) console.log(`${V.gris}  NO MEDIDOS (falta inyección de fallos en el arnés): ${pendientes.join(", ")}${V.fin}`);
  console.log(`${V.gris}  detalle → ${SALIDA}${V.fin}`);
  await sql.end();
  process.exit(fallo ? 1 : 0);
}

main().catch(async (err) => { console.error(err); await sql.end().catch(() => {}); process.exit(2); });
