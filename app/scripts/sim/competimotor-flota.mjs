#!/usr/bin/env node
/**
 * La flota de Competimotor: corre las conversaciones difíciles del perfil
 * `mundillantas` en N simuladores a la vez, en la modalidad rápida acordada
 * con Manuel, 3 veces cada una.
 *
 *   node scripts/sim/competimotor-flota.mjs                          # las 40 × 3, 4 carriles
 *   node scripts/sim/competimotor-flota.mjs --carriles 6             # más carriles (solo si no hubo 429)
 *   node scripts/sim/competimotor-flota.mjs --plomeria               # cero tokens (OpenAI de mentira)
 *   node scripts/sim/competimotor-flota.mjs --ids E01,C03 --reps 1   # algunas
 *   node scripts/sim/competimotor-flota.mjs --comparar               # muestra de 6: rápida contra clásica
 *   node scripts/sim/competimotor-flota.mjs --clasico                # todas desde el hola con 12 s
 *   node scripts/sim/competimotor-flota.mjs --solo-cargar            # ¿se leen bien las 40? (no levanta nada)
 *
 * MODALIDADES (campo `grupo` de cada escenario):
 *   etapa     el `prefijo` se corre UNA vez con el bot de verdad; si la base no
 *             quedó como dice `estadoEsperadoPrefijo`, falla en voz alta y NO
 *             se guarda. Si quedó, se guarda y cada repetición arranca de esa
 *             base restaurada. Carril rápido (espera corta, ráfaga de una).
 *   completa  desde el hola, carril rápido.
 *   tiempo    desde el hola, carril real: 12 000 ms y las pausas declaradas.
 *   --clasico cualquier escenario desde el hola (prefijo + mensajes) en carril real.
 *
 * Un carril «rápido» es un simulador con `--debounce` corto; uno «real», con
 * los 12 000 ms de producción. El turno se da por cerrado leyendo hechos de la
 * base (lib/corredor-competimotor.mjs), nunca con pausas fijas.
 *
 * Nada sale a Meta (Graph de mentira). Producción se lee en solo lectura (la
 * configuración y las variables de Railway del servicio `Competimotors`).
 * La clave de OpenAI es la de pruebas (`app/.env.sim`): este script nunca pasa
 * `--con-clave-de-produccion`.
 */
import { spawn, execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { Carril, costoDe, verificarEstadoEsperado, pausa, normalizarTurno } from "./lib/corredor-competimotor.mjs";
import { invariantesGlobales } from "./lib/corredor-t115.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_APP = resolve(AQUI, "..", "..");
const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const tiene = (n) => argv.includes(n);

const CARRILES = Math.max(1, Number(arg("--carriles", "4")));
const PLOMERIA = tiene("--plomeria");
const REPS = Math.max(1, Number(arg("--reps", "3")));
const CLASICO = tiene("--clasico");
const COMPARAR = tiene("--comparar");
const IDS = arg("--ids")?.split(",").map((s) => s.trim()) ?? null;
const GRUPOS = arg("--grupo")?.split(",").map((s) => s.trim()) ?? null;
const ESCENARIOS_RUTA = resolve(arg("--escenarios", join(AQUI, "datos", "competimotor-40.mjs")));
const CATALOGO = resolve(arg("--catalogo-archivo", join(AQUI, "datos", "competimotor-inventario.xls")));
const SERVICIO = arg("--servicio-prod", "Competimotors"); // PERFILES_SIM aún dice «Mundillantas» (renombrado en Railway)
const DEBOUNCE_RAPIDO = Number(arg("--debounce-rapido", "1500"));
const GAP_RAPIDO = Number(arg("--gap-rapido", "80"));    // ms entre partes de una ráfaga, carril rápido
const GAP_REAL = Number(arg("--gap-real", "2000"));      // ms entre partes, carril real (persona tecleando, < 12 s)
const CARRILES_REALES = arg("--carriles-reales");
const PUERTO_BASE = Number(arg("--puerto-base", "4300"));
const SELLO = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const SALIDA = resolve(arg("--salida", join(AQUI, "mediciones", `competimotor-${PLOMERIA ? "plomeria-" : ""}${COMPARAR ? "comparar-" : ""}${SELLO}`)));
const DIR_LOGS = join(SALIDA, "logs");

const V = { ok: "\x1b[32m", mal: "\x1b[31m", gris: "\x1b[90m", neg: "\x1b[1m", ama: "\x1b[33m", fin: "\x1b[0m" };
const log = (...a) => console.log(...a);

// ───────────────────────── escenarios ─────────────────────────

async function cargarEscenarios() {
  if (!existsSync(ESCENARIOS_RUTA)) throw new Error(`no existe ${ESCENARIOS_RUTA}`);
  const mod = await import(pathToFileURL(ESCENARIOS_RUTA).href);
  const lista = mod.ESCENARIOS ?? mod.default ?? mod.escenarios;
  if (!Array.isArray(lista)) throw new Error(`${ESCENARIOS_RUTA} no exporta ESCENARIOS (array)`);
  const problemas = [];
  const ids = new Set();
  for (const e of lista) {
    const quien = e?.id ?? "(sin id)";
    if (!e?.id) problemas.push(`${quien}: falta id`);
    if (ids.has(e.id)) problemas.push(`${quien}: id repetido`);
    ids.add(e.id);
    if (!["etapa", "completa", "tiempo"].includes(e.grupo)) problemas.push(`${quien}: grupo «${e.grupo}» no es etapa|completa|tiempo`);
    if (!Array.isArray(e.mensajes) || !e.mensajes.length) problemas.push(`${quien}: sin mensajes`);
    if (e.grupo === "etapa" && (!Array.isArray(e.prefijo) || !e.prefijo.length)) problemas.push(`${quien}: grupo etapa sin prefijo`);
    if (e.grupo === "etapa" && e.estadoEsperadoPrefijo == null) problemas.push(`${quien}: grupo etapa sin estadoEsperadoPrefijo`);
    if (e.checks != null && !Array.isArray(e.checks)) problemas.push(`${quien}: checks no es lista de [nombre, fn]`);
    for (const [n, fn] of e.checks ?? []) if (typeof fn !== "function") problemas.push(`${quien}: el check «${n}» no es función`);
    for (const t of [...(e.prefijo ?? []), ...(e.mensajes ?? [])]) {
      try { normalizarTurno(t); } catch (err) { problemas.push(`${quien}: ${err.message}`); }
    }
  }
  return { lista, problemas };
}

/** La muestra para --comparar: 6 conversaciones, o las de --ids. 3 etapa + 3 completa: son
 *  las que la modalidad rápida cambia (las `tiempo` corren igual en las dos: 12 s reales).
 *  Repartidas a lo largo del archivo para no tomar solo las primeras familias. */
function muestraComparativa(lista) {
  if (IDS) return lista.filter((e) => IDS.includes(e.id));
  const repartidas = (l, n) => (l.length <= n ? l : Array.from({ length: n }, (_, i) => l[Math.floor((i * l.length) / n)]));
  const porGrupo = (g) => lista.filter((e) => e.grupo === g);
  const m = [...repartidas(porGrupo("etapa"), 3), ...repartidas(porGrupo("completa"), 3)];
  for (const e of lista) if (m.length < 6 && !m.includes(e)) m.push(e);
  return m.slice(0, 6);
}

// ───────────────────────── trabajos ─────────────────────────

/** Escenarios con el MISMO prefijo, preparación y estado esperado comparten la base guardada.
 *  La expectativa entra en la clave: si dos escenarios esperan hechos distintos, cada uno
 *  arma y verifica su prefijo (si no, el segundo nunca se verificaría). */
const comoTexto = (_k, v) => (typeof v === "function" || v instanceof RegExp ? String(v) : v);
const claveDePrefijo = (e) => createHash("sha1").update(JSON.stringify([e.prefijo, e.preparar ?? null, e.estadoEsperadoPrefijo ?? null], comoTexto)).digest("hex").slice(0, 10);
/** etapa/completa en modo rápido → carril rápido; tiempo y clásico → carril real. */
const carrilQueNecesita = (t) => (t.modo === "clasico" || t.esc.grupo === "tiempo" ? "real" : "rapido");
/** Estimación gruesa de segundos para repartir carriles. */
function costoEstimado(t) {
  const n = t.esc.mensajes.length + (t.modo === "clasico" || t.esc.grupo !== "etapa" ? (t.esc.prefijo?.length ?? 0) : 0);
  return n * (carrilQueNecesita(t) === "real" ? 45 : 25);
}

function armarTrabajos(lista) {
  const trabajos = [];
  for (let rep = 1; rep <= REPS; rep++) {
    for (const esc of lista) {
      if (COMPARAR) { trabajos.push({ esc, rep, modo: "rapido" }, { esc, rep, modo: "clasico" }); continue; }
      trabajos.push({ esc, rep, modo: CLASICO ? "clasico" : "rapido" });
    }
  }
  return trabajos;
}

// ───────────────────────── juicio ─────────────────────────

function juzgar(resultado, esc) {
  const checks = [];
  const jueces = PLOMERIA ? [] : (esc.checks ?? []);
  for (const [nombre, fn] of jueces) {
    let motivo = null;
    try { motivo = fn(resultado.turnos, resultado.estadoFinal) ?? null; } catch (err) { motivo = `el juez reventó: ${err.message}`; }
    checks.push({ nombre, ok: motivo === null, motivo });
  }
  for (const [nombre, motivo] of invariantesGlobales(resultado, { plomeria: PLOMERIA })) checks.push({ nombre: `[global] ${nombre}`, ok: false, motivo });
  const agotados = resultado.turnos.map((t, i) => (t.agotado ? i + 1 : null)).filter(Boolean);
  if (agotados.length) checks.push({ nombre: "[flota] cada turno cerró", ok: false, motivo: `turnos ${agotados.join(", ")} no cerraron en 180 s` });
  if (!checks.some((c) => !c.ok)) checks.push({ nombre: "[global] invariantes de la conversación", ok: true, motivo: null });
  return checks;
}

// ───────────────────────── la flota ─────────────────────────

/** ¿Está libre el puerto? (otras sesiones corren sus propios simuladores en esta máquina) */
function puertoLibre(puerto) {
  return new Promise((ok) => {
    const srv = createServer();
    srv.once("error", () => ok(false));
    srv.once("listening", () => srv.close(() => ok(true)));
    srv.listen(puerto, "127.0.0.1");
  });
}
/** El próximo bloque de 20 puertos (desde `desde`) con los 5 que usa un carril libres. */
async function bloqueLibre(desde, usados) {
  for (let base = desde; base < desde + 2000; base += 20) {
    if (usados.has(base)) continue;
    const libres = await Promise.all([5, 10, 11, 12, 13].map((d) => puertoLibre(base + d)));
    if (libres.every(Boolean)) return base;
  }
  throw new Error("no encontré puertos libres para un carril");
}

async function esperarListo(s, ms = 300_000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (s.proc.exitCode !== null) throw new Error(`el simulador del carril ${s.id} se murió al arrancar (ver ${s.log})`);
    try { if ((await readFile(s.log, "utf8")).includes("Simulador listo")) return; } catch { /* aún no */ }
    await pausa(1500);
  }
  throw new Error(`el simulador del carril ${s.id} no levantó a tiempo (${s.log})`);
}

async function main() {
  const { lista: todos, problemas } = await cargarEscenarios();
  const porGrupo = (l) => ["etapa", "completa", "tiempo"].map((g) => `${g} ${l.filter((e) => e.grupo === g).length}`).join(" · ");
  log(`${V.neg}📚 ${todos.length} escenarios en ${ESCENARIOS_RUTA.replace(RAIZ_APP + "/", "")}${V.fin} (${porGrupo(todos)})`);
  if (problemas.length) {
    log(`${V.mal}❌ El archivo de escenarios tiene problemas:${V.fin}`);
    for (const p of problemas) log(`   · ${p}`);
    process.exit(2);
  }
  if (tiene("--solo-cargar")) {
    for (const e of todos) log(`   ${e.id.padEnd(6)} ${e.grupo.padEnd(9)} ${String(e.prefijo?.length ?? 0).padStart(2)}+${String(e.mensajes.length).padStart(2)} turnos · ${(e.checks ?? []).length} checks · ${e.titulo ?? ""}`);
    log(`${V.ok}✅ se leen bien${V.fin}`);
    return;
  }

  let lista = COMPARAR ? muestraComparativa(todos) : todos;
  if (!COMPARAR && IDS) lista = lista.filter((e) => IDS.includes(e.id));
  if (GRUPOS) lista = lista.filter((e) => GRUPOS.includes(e.grupo));
  if (!lista.length) throw new Error("la selección quedó vacía");
  const trabajos = armarTrabajos(lista);

  // Reparto de carriles por trabajo estimado.
  const segReal = trabajos.filter((t) => carrilQueNecesita(t) === "real").reduce((a, t) => a + costoEstimado(t), 0);
  const segRap = trabajos.filter((t) => carrilQueNecesita(t) === "rapido").reduce((a, t) => a + costoEstimado(t), 0);
  const total = Math.min(CARRILES, trabajos.length);
  let nReal = CARRILES_REALES != null ? Number(CARRILES_REALES) : Math.round((total * segReal) / Math.max(1, segReal + segRap));
  if (segReal > 0) nReal = Math.max(1, nReal);
  if (segRap > 0) nReal = Math.min(nReal, total - 1);
  if (segRap === 0) nReal = total;
  nReal = Math.max(0, Math.min(total, nReal));
  const nRap = total - nReal;

  await mkdir(DIR_LOGS, { recursive: true });
  log(`${V.neg}🚚 Flota Competimotor${V.fin} · ${trabajos.length} corridas (${lista.length} conversaciones × ${REPS}${COMPARAR ? " × 2 modos" : ""}) · ${nRap} carriles rápidos (espera ${DEBOUNCE_RAPIDO} ms) + ${nReal} reales (12 000 ms)${PLOMERIA ? ` · ${V.ama}plomería, 0 tokens${V.fin}` : ""}`);
  log(`${V.gris}   salida → ${SALIDA}${V.fin}`);

  if (!tiene("--sin-build")) {
    log("🔨 Compilando el bot una vez (npm run build)…");
    execFileSync("npm", ["run", "build"], { cwd: RAIZ_APP, stdio: ["ignore", "ignore", "inherit"] });
  }

  const sufijo = Date.now().toString(36);
  const sims = [];
  // Cada simulador corre en su propio grupo de procesos (detached): al cerrar se le
  // da SIGINT para que se limpie solo; si en 15 s no salió, SIGKILL al GRUPO entero
  // (así no queda un `dist/index.js` huérfano agarrado a la base) y DROP ... WITH (FORCE).
  let limpiado = false;
  const limpiar = async () => {
    if (limpiado) return; limpiado = true;
    for (const s of sims) { try { process.kill(-s.proc.pid, "SIGINT"); } catch { /* ya murió */ } }
    const limite = Date.now() + 15_000;
    while (Date.now() < limite && sims.some((s) => s.proc.exitCode === null && s.proc.signalCode === null)) await pausa(500);
    for (const s of sims) {
      try { process.kill(-s.proc.pid, "SIGKILL"); } catch { /* ya murió */ }
      await new Promise((r) => { const p = spawn("psql", ["-q", "-c", `drop database if exists ${s.dbNombre} with (force)`, "postgres"]); p.on("exit", r); p.on("error", r); });
    }
  };
  for (const senal of ["SIGINT", "SIGTERM"]) process.on(senal, async () => { log("\n⛔ interrumpido: cerrando simuladores…"); await limpiar(); process.exit(130); });

  const inicioFlota = Date.now();
  try {
    for (let i = 0; i < total; i++) {
      const modo = i < nRap ? "rapido" : "real";
      const base = await bloqueLibre(PUERTO_BASE, new Set(sims.map((x) => x.base)));
      const dbNombre = `autoventa_sim_cm_c${i}_${sufijo}`;
      const logSim = join(DIR_LOGS, `sim-c${i}-${modo}.log`);
      const flags = [
        // --catalogo-confirmar: el Excel de la prueba es FIJO (contra él se escribieron
        // los escenarios); si producción ya cargó uno más nuevo, se carga igual.
        "--perfil", "mundillantas", "--servicio-prod", SERVICIO, "--catalogo-archivo", CATALOGO, "--catalogo-confirmar", "--sin-build",
        "--puerto", String(base + 10), "--puerto-bot", String(base + 5), "--puerto-graph", String(base + 11),
        "--puerto-contifico", String(base + 12), "--puerto-stub", String(base + 13), "--db", dbNombre,
        ...(modo === "rapido" ? ["--debounce", String(DEBOUNCE_RAPIDO)] : []),
        ...(PLOMERIA ? ["--stub"] : []),
      ];
      const salidaLog = createWriteStream(logSim);
      const proc = spawn("node", [join(AQUI, "sim.mjs"), ...flags], { cwd: RAIZ_APP, env: process.env, detached: true });
      proc.stdout.pipe(salidaLog); proc.stderr.pipe(salidaLog);
      sims.push({
        id: i, modo, proc, dbNombre, log: logSim, base,
        carril: new Carril({
          id: i, modo, gapMs: modo === "rapido" ? GAP_RAPIDO : GAP_REAL,
          debounceMs: modo === "rapido" ? DEBOUNCE_RAPIDO : 12_000,
          ui: `http://127.0.0.1:${base + 10}`, app: `http://127.0.0.1:${base + 5}`,
          db: `postgresql://${process.env.PGUSER ?? process.env.USER}@localhost/${dbNombre}`,
        }),
      });
    }
    const t0 = Date.now();
    await Promise.all(sims.map((s) => esperarListo(s)));
    const arranqueMs = Date.now() - t0;
    log(`   ${total} simuladores arriba en ${(arranqueMs / 1000).toFixed(0)} s; arrancan las corridas…\n`);
    for (const s of sims) await s.carril.activarBot();

    // ── la cola ──
    const pendientes = [...trabajos];
    const prefijos = new Map(); // clave → { estado, promesa, falla, info }
    const resultados = [];
    const hecho = (r) => {
      resultados.push(r);
      const malos = r.checks.filter((c) => !c.ok);
      const marca = r.errorArnes ? `${V.mal}💥` : malos.length ? `${V.mal}✗` : `${V.ok}✓`;
      log(`  ${marca} ${r.id}${V.fin} ${V.gris}${r.modo} r${r.rep} · c${r.carril} · ${(r.relojMs / 1000).toFixed(0)} s · $${r.costo.usd.toFixed(3)}${V.fin}${malos.length ? `  ${V.mal}${malos.map((m) => `${m.nombre} — ${m.motivo}`).join(" · ")}${V.fin}` : ""}`);
    };

    const tomar = (modo) => {
      for (let k = 0; k < pendientes.length; k++) {
        const t = pendientes[k];
        if (carrilQueNecesita(t) !== modo) continue;
        if (t.modo === "rapido" && t.esc.grupo === "etapa") {
          const p = prefijos.get(claveDePrefijo(t.esc));
          if (p && !p.estado && !p.falla) continue; // otro carril lo está armando: tomá otro trabajo
        }
        pendientes.splice(k, 1);
        return t;
      }
      return pendientes.some((t) => carrilQueNecesita(t) === modo) ? "esperar" : null;
    };

    const correrCarril = async (s) => {
      for (;;) {
        if (s.proc.exitCode !== null) { log(`${V.mal}   el simulador del carril ${s.id} se murió; el carril para${V.fin}`); return; }
        const t = tomar(s.modo);
        if (t === null) return;
        if (t === "esperar") { await pausa(1500); continue; }
        hecho(await correrTrabajo(s, t, prefijos));
      }
    };
    await Promise.all(sims.map((s) => correrCarril(s)));
    // Trabajos que quedaron sin carril (porque un simulador se murió): se reportan, no se fingen.
    for (const t of pendientes) resultados.push({ id: t.esc.id, titulo: t.esc.titulo, grupo: t.esc.grupo, modo: t.modo, rep: t.rep, carril: null, errorArnes: "sin carril vivo que lo corriera", checks: [{ nombre: "la corrida pudo correr", ok: false, motivo: "sin carril vivo" }], relojMs: 0, costo: costoDe([]) });

    // ── 429 en los logs ──
    let n429 = 0;
    for (const s of sims) { try { n429 += ((await readFile(s.log, "utf8")).match(/\b429\b|rate.?limit/gi) ?? []).length; } catch { /* sin log */ } }

    await escribirSalida({ resultados, prefijos, sims, arranqueMs, inicioFlota, n429, lista });
  } finally {
    for (const s of sims) await s.carril.cerrar();
    await limpiar();
  }
}

/** Corre UNA corrida (conversación × repetición × modo) en el carril `s`. */
async function correrTrabajo(s, t, prefijos) {
  const c = s.carril;
  const esc = t.esc;
  const base = { id: esc.id, titulo: esc.titulo, familia: esc.familia ?? null, grupo: esc.grupo, modo: t.modo, rep: t.rep, carril: s.id, carrilModo: s.modo };
  let t0 = Date.now();
  let runDesde = 0;
  try {
    let turnosPrefijo = [];
    let prefijoInfo = null;
    if (t.modo === "rapido" && esc.grupo === "etapa") {
      // ── el estado guardado: se arma una vez, se verifica, se restaura ──
      const clave = claveDePrefijo(esc);
      let p = prefijos.get(clave);
      if (!p) {
        p = { clave, estado: null, falla: null, info: null };
        prefijos.set(clave, p);
        // Si el armado revienta, el prefijo queda FALLIDO (no «en construcción» para
        // siempre: las demás repeticiones esperarían eternamente).
        try { await armarPrefijo(c, esc, p); } catch (err) { p.falla = `el prefijo no pudo correr: ${err.message}`; p.info ??= { carril: c.id, escenario: esc.id, costo: costoDe([]) }; }
      }
      if (p.falla) throw Object.assign(new Error(p.falla), { prefijoFallido: true });
      t0 = Date.now(); // el reloj de la corrida no incluye armar el prefijo (va aparte, en prefijos/)
      const r = await c.restaurarEstado(p.estado);
      prefijoInfo = { clave, armadoPor: p.info.carril, restaurado: r.conteo, corrimientoMs: r.corrimientoMs, costoDelPrefijo: p.info.costo };
      runDesde = await c.maxRunId();
    } else {
      await c.reiniciar();
      runDesde = 0;
      if (esc.preparar) await esc.preparar({ sql: c.sql, mandar: (m) => c.correrTurnos([m]).then((x) => x[0]), snapshot: () => c.foto() });
      const conPrefijo = esc.prefijo?.length && (t.modo === "clasico" || esc.grupo !== "etapa");
      if (conPrefijo) {
        turnosPrefijo = await c.correrTurnos(esc.prefijo, { tiempo: s.modo === "real" });
        const estadoP = await c.estadoFinal();
        prefijoInfo = { desdeElHola: true, turnos: turnosPrefijo.length, estadoComoDeclara: verificarEstadoEsperado(esc.estadoEsperadoPrefijo, estadoP) };
      }
    }
    const turnos = await c.correrTurnos(esc.mensajes, { tiempo: s.modo === "real" });
    const estadoFinal = await c.estadoFinal();
    const runs = await c.todasLasCorridas(runDesde);
    const resultado = {
      ...base, turnos, estadoFinal,
      relojMs: Date.now() - t0,
      costo: costoDe(runs),
      modelos: [...new Set(runs.map((r) => r.model))],
      erroresIA: runs.filter((r) => r.error).map((r) => ({ id: Number(r.id), modelo: r.model, error: r.error })),
      con429: runs.filter((r) => /429|rate.?limit/i.test(String(r.error ?? ""))).length,
      guardian: turnos.flatMap((x, i) => x.guardian.map((g) => ({ turno: i + 1, verdict: g.verdict, findings: g.findings, corrigio: g.corregido && g.corregido !== g.original ? g.corregido : null }))),
      alertas: estadoFinal?.alertas ?? [],
      avisosAsesor: estadoFinal?.avisos_asesor ?? 0,
      prefijo: prefijoInfo,
      turnosPrefijo,
      transcripcion: await c.transcripcion(),
    };
    resultado.checks = juzgar(resultado, esc);
    return resultado;
  } catch (err) {
    // Un prefijo fallido no corrió nada de esta repetición: lo que haya en la base es de
    // otro trabajo o del propio prefijo (que ya se cuenta aparte, en prefijos/).
    const runs = err.prefijoFallido ? [] : await c.todasLasCorridas(runDesde).catch(() => []);
    return {
      ...base, errorArnes: err.message, prefijoFallido: Boolean(err.prefijoFallido),
      checks: [{ nombre: err.prefijoFallido ? "el prefijo dejó la base como declara el escenario" : "la corrida pudo correr", ok: false, motivo: err.message }],
      relojMs: Date.now() - t0, costo: costoDe(runs), turnos: [], estadoFinal: await c.estadoFinal().catch(() => null),
      transcripcion: await c.transcripcion().catch(() => []),
    };
  }
}

/** Corre el prefijo con el bot real, verifica los hechos y guarda la base. Si no se cumplen, NO guarda. */
async function armarPrefijo(c, esc, p) {
  const t0 = Date.now();
  await c.reiniciar();
  if (esc.preparar) await esc.preparar({ sql: c.sql, mandar: (m) => c.correrTurnos([m]).then((x) => x[0]), snapshot: () => c.foto() });
  const turnos = await c.correrTurnos(esc.prefijo, { tiempo: false });
  const estado = await c.estadoFinal();
  const runs = await c.todasLasCorridas(0);
  // En plomería el doble de OpenAI no deja la etapa real; solo se verifica a pedido
  // (sirve para los hechos determinísticos, como la medida, y para probar el camino de falla).
  const verificar = !PLOMERIA || tiene("--verificar-prefijo-en-plomeria");
  const fallas = verificar ? verificarEstadoEsperado(esc.estadoEsperadoPrefijo, estado) : [];
  const agotado = turnos.find((x) => x.agotado);
  p.info = { carril: c.id, escenario: esc.id, relojMs: Date.now() - t0, costo: costoDe(runs), turnos, estado, transcripcion: await c.transcripcion(), verificado: verificar ? "sí" : "no (plomería: el doble de OpenAI no deja el estado real)" };
  if (agotado || fallas.length) {
    p.falla = `el prefijo NO dejó la base como declara el escenario — no se guardó: ${agotado ? "un turno no cerró; " : ""}${fallas.join(" · ")}`;
    p.info.fallas = fallas;
    console.log(`\n${V.mal}${V.neg}  ‼️  PREFIJO DE ${esc.id} FALLÓ — no se guarda la base:${V.fin}\n${fallas.map((f) => `${V.mal}     · ${f}${V.fin}`).join("\n")}\n`);
    return;
  }
  p.estado = await c.guardarEstado();
  console.log(`  ${V.gris}💾 prefijo de ${esc.id} armado en c${c.id} (${(p.info.relojMs / 1000).toFixed(0)} s, $${p.info.costo.usd.toFixed(3)}) y guardado${V.fin}`);
}

async function escribirSalida({ resultados, prefijos, sims, arranqueMs, inicioFlota, n429, lista }) {
  await mkdir(join(SALIDA, "corridas"), { recursive: true });
  await mkdir(join(SALIDA, "prefijos"), { recursive: true });
  for (const r of resultados) await writeFile(join(SALIDA, "corridas", `${r.id}-${r.modo}-r${r.rep}.json`), JSON.stringify(r, null, 1));
  for (const p of prefijos.values()) await writeFile(join(SALIDA, "prefijos", `${p.info?.escenario ?? p.clave}-${p.clave}.json`), JSON.stringify({ clave: p.clave, falla: p.falla, ...p.info }, null, 1));

  const usd = resultados.reduce((a, r) => a + (r.costo?.usd ?? 0), 0) + [...prefijos.values()].reduce((a, p) => a + (p.info?.costo?.usd ?? 0), 0);
  const filas = [];
  const claves = [...new Set(resultados.map((r) => `${r.id}|${r.modo}`))];
  for (const k of claves) {
    const [id, modo] = k.split("|");
    const rs = resultados.filter((r) => r.id === id && r.modo === modo).sort((a, b) => a.rep - b.rep);
    const fallasPorRep = rs.map((r) => r.checks.filter((c) => !c.ok).length);
    filas.push({
      id, modo, carril: rs[0].carrilModo ?? null, grupo: rs[0].grupo, titulo: rs[0].titulo,
      reps: rs.length, repsVerdes: fallasPorRep.filter((n) => n === 0).length, fallasPorRep,
      relojMedioS: Math.round(rs.reduce((a, r) => a + r.relojMs, 0) / rs.length / 100) / 10,
      usdMedio: Math.round((rs.reduce((a, r) => a + (r.costo?.usd ?? 0), 0) / rs.length) * 10000) / 10000,
      tokensMedio: Math.round(rs.reduce((a, r) => a + (r.costo?.input ?? 0) + (r.costo?.output ?? 0), 0) / rs.length),
      // Etapa rápida: su parte del prefijo (armado UNA vez y compartido), para comparar justo.
      usdPrefijoAmortizado: (() => {
        const clave = rs[0].prefijo?.clave;
        if (!clave) return 0;
        const usan = resultados.filter((r) => r.prefijo?.clave === clave).length;
        return Math.round(((prefijos.get(clave)?.info?.costo?.usd ?? 0) / Math.max(1, usan)) * 10000) / 10000;
      })(),
      modelos: [...new Set(rs.flatMap((r) => r.modelos ?? []))],
      fallas: rs.flatMap((r) => r.checks.filter((c) => !c.ok).map((c) => `r${r.rep}: ${c.nombre} — ${c.motivo}`)),
    });
  }
  const resumen = {
    cuando: new Date().toISOString(), plomeria: PLOMERIA, reps: REPS, comparar: COMPARAR, clasico: CLASICO,
    carriles: sims.map((s) => ({ id: s.id, modo: s.modo })), debounceRapidoMs: DEBOUNCE_RAPIDO,
    arranqueS: Math.round(arranqueMs / 1000), relojTotalS: Math.round((Date.now() - inicioFlota) / 1000),
    corridas: resultados.length, corridasVerdes: resultados.filter((r) => r.checks.every((c) => c.ok)).length,
    checksFallidos: resultados.reduce((a, r) => a + r.checks.filter((c) => !c.ok).length, 0),
    prefijos: [...prefijos.values()].map((p) => ({ escenario: p.info?.escenario, clave: p.clave, ok: !p.falla, falla: p.falla, relojS: Math.round((p.info?.relojMs ?? 0) / 1000), usd: p.info?.costo?.usd ?? 0 })),
    usdTotal: Math.round(usd * 10000) / 10000, errores429: n429 + resultados.reduce((a, r) => a + (r.con429 ?? 0), 0),
    escenarios: lista.map((e) => e.id), filas,
  };
  await writeFile(join(SALIDA, "resumen.json"), JSON.stringify(resumen, null, 1));

  log(`\n${V.neg}  ═════ FLOTA COMPETIMOTOR ═════${V.fin}`);
  log(`  corridas: ${resumen.corridas} · verdes ${V.ok}${resumen.corridasVerdes}${V.fin} · con falla ${resumen.corridas - resumen.corridasVerdes ? V.mal : V.gris}${resumen.corridas - resumen.corridasVerdes}${V.fin} · checks fallidos ${resumen.checksFallidos}`);
  log(`  reloj total ${resumen.relojTotalS} s (arranque ${resumen.arranqueS} s) · costo $${resumen.usdTotal.toFixed(3)} · 429: ${resumen.errores429}`);
  if (resumen.prefijos.some((p) => !p.ok)) log(`  ${V.mal}prefijos que fallaron: ${resumen.prefijos.filter((p) => !p.ok).map((p) => p.escenario).join(", ")}${V.fin}`);
  log(`\n  ${"id".padEnd(7)}${"modo".padEnd(9)}${"grupo".padEnd(10)}${"verdes".padEnd(8)}${"reloj".padStart(7)}${(PLOMERIA ? "costo*" : "costo").padStart(9)}${"tokens".padStart(9)}`);
  for (const f of filas) log(`  ${f.id.padEnd(7)}${(f.modo === "rapido" && f.carril === "real" ? "12s" : f.modo).padEnd(9)}${f.grupo.padEnd(10)}${`${f.repsVerdes}/${f.reps}`.padEnd(8)}${`${f.relojMedioS}s`.padStart(7)}${`$${f.usdMedio.toFixed(3)}`.padStart(9)}${String(f.tokensMedio).padStart(9)}`);
  if (COMPARAR) {
    log(`\n${V.neg}  rápida contra clásica (promedio por conversación)${V.fin}`);
    for (const id of [...new Set(filas.map((f) => f.id))]) {
      const r = filas.find((f) => f.id === id && f.modo === "rapido"), k = filas.find((f) => f.id === id && f.modo === "clasico");
      if (!r || !k) continue;
      const mismo = r.repsVerdes === k.repsVerdes ? "mismo veredicto" : `${V.ama}veredicto distinto${V.fin}`;
      log(`  ${id.padEnd(7)} verdes ${r.repsVerdes}/${r.reps} vs ${k.repsVerdes}/${k.reps} (${mismo}) · reloj ${r.relojMedioS}s vs ${k.relojMedioS}s · $${(r.usdMedio + r.usdPrefijoAmortizado).toFixed(3)}${r.usdPrefijoAmortizado ? ` (incl. $${r.usdPrefijoAmortizado.toFixed(3)} de prefijo)` : ""} vs $${k.usdMedio.toFixed(3)}`);
    }
  }
  if (PLOMERIA) log(`  ${V.gris}* en plomería los tokens y el costo son del doble de OpenAI: ficticios${V.fin}`);
  log(`\n  ${V.gris}detalle → ${join(SALIDA, "resumen.json")} · una corrida por archivo en corridas/${V.fin}`);
  process.exitCode = resumen.corridas === resumen.corridasVerdes ? 0 : 1;
}

main().catch((err) => { console.error(err); process.exit(2); });
