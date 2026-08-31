#!/usr/bin/env node
/**
 * La flota: corre el corpus T115 en N simuladores a la vez.
 *
 *   node scripts/sim/t115-flota.mjs --carriles 4                  # los 115, 4 a la vez
 *   node scripts/sim/t115-flota.mjs --carriles 4 --plomeria       # nivel 1, cero tokens
 *   node scripts/sim/t115-flota.mjs --carriles 3 --ronda-corta    # nivel 2
 *   node scripts/sim/t115-flota.mjs --carriles 2 --familia Q,O
 *
 * Cada carril es un simulador completo (bot + Graph + Contífico de mentira +
 * base desechable propia) con un trabajador `t115.mjs` que corre su tajada de
 * escenarios. Una conversación sigue siendo secuencial por dentro — lo que se
 * paraleliza son conversaciones DISTINTAS, que no comparten nada.
 *
 * Las 10 históricas van siempre al carril 0 (su arnés `pruebas-10.mjs` es el
 * contrato congelado del 51/51 y corre una sola instancia).
 */
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ESCENARIOS } from "./datos/t115-escenarios.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const tiene = (n) => process.argv.includes(n);

const CARRILES = Math.max(1, Number(arg("--carriles") ?? 3));
const PLOMERIA = tiene("--plomeria");
// --mini: agente y guardián en gpt-5.4-mini (checkpoint MINI del threshold).
// Lleva --sin-alinear para que la copia de variables de Railway no pise el
// modelo elegido; los modelos efectivos se verifican después en ai_runs.
const MINI = tiene("--mini");
const RONDA_CORTA = tiene("--ronda-corta");
const IDS = arg("--ids")?.split(",").map((s) => s.trim().toUpperCase()) ?? null;
const FAMILIAS = arg("--familia")?.split(",").map((s) => s.trim().toUpperCase()) ?? null;
const SALIDA = arg("--salida") ?? join(AQUI, "t115-flota-resultado.json");
const DIR_LOGS = arg("--logs") ?? join(AQUI, "flota-logs");

const RONDA = ["P03", "P10", "M01", "M07", "Q05", "Q06", "O05", "O13", "V05", "V08", "E01", "E02", "C01", "C09", "R06", "R07", "X01", "X07"];
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

function seleccion() {
  let lista = ESCENARIOS.filter((e) => PLOMERIA || !e.requiereInyeccion);
  if (IDS) lista = lista.filter((e) => IDS.includes(e.id));
  if (FAMILIAS) lista = lista.filter((e) => FAMILIAS.includes(e.familia));
  if (RONDA_CORTA) lista = lista.filter((e) => RONDA.includes(e.id));
  return lista.map((e) => e.id);
}

function conHistoricas() {
  if (IDS) return IDS.some((i) => i.startsWith("H"));
  if (FAMILIAS) return FAMILIAS.includes("H");
  return true;
}

async function esperarListo(log, ms = 240_000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    try { if ((await readFile(log, "utf8")).includes("Simulador listo")) return; } catch { /* aún no existe */ }
    await pausa(1500);
  }
  throw new Error(`el simulador no levantó a tiempo (${log})`);
}

async function main() {
  await mkdir(DIR_LOGS, { recursive: true });
  const ids = seleccion();
  const carriles = Math.min(CARRILES, Math.max(1, ids.length));
  // Reparto por serpiente para que los X (largos) no caigan todos juntos.
  const tajadas = Array.from({ length: carriles }, () => []);
  ids.forEach((id, i) => tajadas[i % carriles].push(id));

  const sufijo = `${Date.now().toString(36)}`;
  const sims = [];
  const trabajos = [];
  console.log(`🚚 Flota de ${carriles} carriles · ${ids.length} escenarios${conHistoricas() ? " + 10 históricas (carril 0)" : ""}${PLOMERIA ? " · plomería (0 tokens)" : ""}`);

  const limpiar = async () => {
    for (const s of sims) { try { s.proc.kill("SIGINT"); } catch { /* ya murió */ } }
    await pausa(2500);
    for (const s of sims) {
      try { s.proc.kill("SIGKILL"); } catch { /* ya murió */ }
      await new Promise((r) => { const p = spawn("psql", ["-c", `drop database if exists ${s.db}`, "postgres"]); p.on("exit", r); });
    }
  };
  process.on("SIGINT", async () => { await limpiar(); process.exit(130); });

  try {
    for (let i = 0; i < carriles; i++) {
      const base = 3700 + i * 20;
      const db = `autoventa_sim_t115_c${i}_${sufijo}`;
      const log = join(DIR_LOGS, `sim-c${i}.log`);
      const flags = [
        "--puerto", String(base + 10), "--puerto-bot", String(base + 5),
        "--puerto-graph", String(base + 11), "--puerto-contifico", String(base + 12),
        "--puerto-stub", String(base + 13), "--db", db,
        ...(PLOMERIA ? ["--stub"] : []),
      ];
      const salidaLog = createWriteStream(log);
      const envSim = MINI
        ? {
            ...process.env,
            SIM_MODELOS_FORZADOS: JSON.stringify({
              OPENAI_MODEL: "gpt-5.4-mini",
              OPENAI_GUARDIAN_MODEL: "gpt-5.4-mini",
              OPENAI_ESCALATION_MODEL: "gpt-5.4-mini",
              OPENAI_RESEARCH_MODEL: "gpt-5.4-mini",
            }),
          }
        : process.env;
      const proc = spawn("node", [join(AQUI, "sim.mjs"), ...flags], { cwd: join(AQUI, "..", ".."), env: envSim });
      proc.stdout.pipe(salidaLog); proc.stderr.pipe(salidaLog);
      sims.push({ proc, db, base, log, carril: i });
    }
    await Promise.all(sims.map((s) => esperarListo(s.log)));
    console.log("   los simuladores están arriba; arrancan los trabajadores…");

    for (const s of sims) {
      const misIds = tajadas[s.carril];
      const salida = join(DIR_LOGS, `resultado-c${s.carril}.json`);
      const flags = [];
      if (misIds.length) flags.push("--ids", misIds.join(","));
      if (PLOMERIA) flags.push("--plomeria");
      flags.push("--salida", salida);
      // Un carril sin tajada y sin históricas no tiene nada que hacer.
      const llevaHistoricas = s.carril === 0 && conHistoricas() && !PLOMERIA;
      if (!misIds.length && !llevaHistoricas) continue;
      const env = {
        ...process.env,
        SIM_UI_URL: `http://127.0.0.1:${s.base + 10}`,
        SIM_APP_URL: `http://127.0.0.1:${s.base + 5}`,
        SIM_DATABASE_URL: `postgresql://${process.env.PGUSER ?? process.env.USER}@localhost/${s.db}`,
        // El corredor decide históricas con --ids: el carril 0 las agrega vía flag propio.
        T115_HISTORICAS: llevaHistoricas ? "1" : "0",
      };
      const logW = createWriteStream(join(DIR_LOGS, `trabajador-c${s.carril}.log`));
      const proc = spawn("node", [join(AQUI, "t115.mjs"), ...flags], { env });
      proc.stdout.pipe(logW); proc.stderr.pipe(logW);
      trabajos.push({ carril: s.carril, salida, done: new Promise((r) => proc.on("exit", (c) => r(c ?? 1))) });
    }

    const codigos = await Promise.all(trabajos.map((t) => t.done));
    const todo = [];
    for (const t of trabajos) {
      try { todo.push(...JSON.parse(await readFile(t.salida, "utf8"))); }
      catch { console.error(`   ⚠️ el carril ${t.carril} no dejó resultado legible`); }
    }
    await writeFile(SALIDA, JSON.stringify(todo, null, 1));

    let paso = 0, fallo = 0;
    const fallidos = [];
    for (const r of todo) for (const c of r.checks ?? []) {
      if (c.ok) paso += 1; else { fallo += 1; fallidos.push(`${r.id}: ${c.nombre} — ${c.motivo}`); }
    }
    console.log(`\n  ═════ FLOTA ═════`);
    console.log(`  escenarios corridos: ${todo.length} · comprobaciones: ${paso} pasaron · ${fallo} fallaron`);
    for (const f of fallidos) console.log(`   ✗ ${f}`);
    console.log(`  detalle → ${SALIDA}`);
    process.exitCode = fallo || codigos.some((c) => c === 2) ? 1 : 0;
  } finally {
    await limpiar();
  }
}

main().catch((err) => { console.error(err); process.exit(2); });
