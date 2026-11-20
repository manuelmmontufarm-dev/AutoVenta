#!/usr/bin/env node
/**
 * SEGUIMIENTOS DE COMPETIMOTOR, CON EL RELOJ ADELANTADO.
 *
 * Los seguimientos salen horas después de que el cliente calla. Esperarlas no
 * sirve; reescribir la lógica en un script tampoco (probaría el script, no el
 * bot). Esto levanta el simulador real (`sim.mjs --perfil mundillantas`) y le
 * da al bot un RELOJ SIMULADO compartido por los dos lados:
 *
 *  · Node: este mismo archivo, cargado con `NODE_OPTIONS=--import`, reemplaza
 *    `Date` por uno con desfase (leído de un archivo cada 100 ms).
 *  · Postgres: en la base desechable se crea `public.now()` = `pg_catalog.now()`
 *    + el mismo desfase, la base se pone con `search_path = public, pg_catalog`
 *    y los `default now()` de las columnas pasan a `public.now()`.
 *
 * Así el worker de seguimientos del bot (el de verdad, cada 5 s) ve llegar la
 * hora: el reloj salta al `due_at` del próximo job y el worker hace lo suyo
 * (portones, horario, ventana de 24 h, redacción con IA, Guardián, envío a la
 * Graph de mentira). Nada de la lógica del seguimiento vive acá.
 *
 * Uso (desde app/):
 *   node scripts/sim/seguimientos-competimotor.mjs                 # 3 corridas en paralelo
 *   node scripts/sim/seguimientos-competimotor.mjs --corridas 1     # una sola
 *   node scripts/sim/seguimientos-competimotor.mjs --casos s02-recibio-opciones,s08-sabado-tarde
 *   node scripts/sim/seguimientos-competimotor.mjs --conservar-db   # deja autoventa_sim_seg_rN
 *   node scripts/sim/seguimientos-competimotor.mjs --con-semilla    # producción tras correr seed:negocio (PR #62)
 *   node scripts/sim/seguimientos-competimotor.mjs --fase4          # con la Fase 4 encendida (solo en la base)
 *
 * Resultados: scripts/sim/resultados-seguimientos/<caso>-r<N>.json y resumen.json.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";

// ─────────────────────────────────────────────────────────────────────────────
// Modo PRECARGA: dentro de los procesos del simulador (bot incluido).
// ─────────────────────────────────────────────────────────────────────────────
const esPrincipal = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (!esPrincipal && process.env.SEG_RELOJ_ARCHIVO) {
  instalarRelojSimulado(process.env.SEG_RELOJ_ARCHIVO);
} else if (esPrincipal) {
  main().catch((error) => {
    console.error("❌", error?.stack ?? error);
    process.exit(1);
  });
}

function instalarRelojSimulado(archivo) {
  const RealDate = globalThis.Date;
  let desfase = 0;
  const leer = () => {
    try {
      const n = Number(JSON.parse(readFileSync(archivo, "utf8")).offsetMs);
      if (Number.isFinite(n)) desfase = n;
    } catch { /* se queda con el último */ }
  };
  leer();
  setInterval(leer, 100).unref();
  function SimDate(...args) {
    if (!new.target) return new RealDate(RealDate.now() + desfase).toString();
    return args.length
      ? Reflect.construct(RealDate, args, new.target)
      : Reflect.construct(RealDate, [RealDate.now() + desfase], new.target);
  }
  SimDate.prototype = RealDate.prototype;
  SimDate.now = () => RealDate.now() + desfase;
  SimDate.parse = RealDate.parse;
  SimDate.UTC = RealDate.UTC;
  globalThis.Date = SimDate;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modo PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const { resolve, dirname } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { mkdirSync, createWriteStream, copyFileSync } = await import("node:fs");
  const { spawn } = await import("node:child_process");
  const { createRequire } = await import("node:module");
  const postgres = (await import("postgres")).default;
  const { buildInboundPayload, deliverWebhook } = await import("../loadtest/lib/meta.mjs");
  const datos = await import("./datos/competimotor-seguimientos.mjs");
  const require = createRequire(import.meta.url);
  const XLSX = require("xlsx");

  const aquí = dirname(fileURLToPath(import.meta.url));
  const raízApp = resolve(aquí, "../..");
  const dirRes = resolve(aquí, "resultados-seguimientos");
  const dirLogs = resolve(dirRes, "logs");
  const dirInsumos = resolve(dirRes, "insumos");
  mkdirSync(dirLogs, { recursive: true });
  mkdirSync(dirInsumos, { recursive: true });

  const argv = process.argv.slice(2);
  const valor = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
  const bandera = (n) => argv.includes(`--${n}`);
  const corridas = String(valor("corridas", "1,2,3")).split(",").map(Number).filter(Boolean);
  const soloCasos = valor("casos", null)?.split(",") ?? null;
  const casos = datos.CASOS.filter((c) => !soloCasos || soloCasos.includes(c.id));

  // El Excel de Fénix: se congela una copia para que nadie lo cambie a mitad.
  const excelOriginal = resolve(dirInsumos, "competimotor-inventario.xls");
  if (!existsSync(excelOriginal)) copyFileSync(resolve(aquí, "datos/competimotor-inventario.xls"), excelOriginal);
  const excelCambiado = resolve(dirInsumos, "competimotor-inventario-viernes.xls");
  escribirExcelCambiado(XLSX, excelOriginal, excelCambiado, datos.CAMBIO_DE_INVENTARIO);
  const catalogo = leerPrecios(XLSX, excelOriginal);
  const catalogoViernes = leerPrecios(XLSX, excelCambiado);

  if (bandera("rejuzgar")) {
    // Recalcula los chequeos desde los hechos ya guardados (sin correr nada).
    for (const n of corridas) {
      const bit = leerBitacora(n);
      if (!bit) continue;
      for (const c of casos) {
        const ruta = resolve(dirRes, `${c.id}-r${n}.json`);
        if (!existsSync(ruta)) continue;
        const fila = JSON.parse(readFileSync(ruta, "utf8"));
        const e = {
          caso: c, telefono: fila.telefono, eventos: fila.eventos, errores: fila.errores ?? [],
          dinamico: fila.reloj?.dinamico ?? undefined, calloEn: fila.reloj?.callo ?? undefined,
          respondioEn: fila.reloj?.respondio ?? fila.reloj?.dinamico?.reloj ?? undefined,
          productoAntes: fila.productoAntes ?? null,
        };
        const lote = bit.lotes.find((l) => l.casos.includes(c.id)) ?? bit.lotes[0];
        const nuevos = evaluar(e, fila.hechos, lote.configuracion);
        // Sin la foto de «antes» guardada, el chequeo que la necesita se queda como estaba.
        if (!fila.productoAntes) {
          const viejo = fila.chequeos.find((k) => k.id === "contexto_intacto_llanta");
          const i = nuevos.findIndex((k) => k.id === "contexto_intacto_llanta");
          if (viejo && i >= 0) nuevos[i] = { ...viejo, detalle: `${viejo.detalle} (juzgado en la corrida)` };
        }
        fila.chequeos = nuevos;
        fila.veredicto = nuevos.every((k) => k.ok !== false) && !e.errores.length ? "pasa" : "falla";
        writeFileSync(ruta, JSON.stringify(fila, null, 2));
        console.log(`r${n} ${fila.veredicto === "pasa" ? "✅" : "❌"} ${c.id}: ${nuevos.filter((k) => k.ok === false).map((k) => k.id).join(", ") || "todo ok"}`);
      }
    }
    escribirResumen();
    process.exit(0);
  }

  const inicio = Date.now();
  console.log(`▶ Seguimientos Competimotor · corridas ${corridas.join(",")} · ${casos.length} casos`);
  const resultados = await Promise.all(corridas.map((n) => correr(n).catch((error) => {
    console.error(`❌ Corrida ${n}:`, error?.stack ?? error);
    return { corrida: n, error: String(error?.message ?? error), casos: [] };
  })));

  escribirResumen();
  process.exit(0);


  function leerBitacora(n) {
    const ruta = resolve(dirRes, `bitacora-r${n}.json`);
    if (!existsSync(ruta)) return null;
    const b = JSON.parse(readFileSync(ruta, "utf8"));
    return b.lotes ? b : { lotes: [{ casos: datos.CASOS.slice(0, 12).map((c) => c.id), ...b }] };
  }
  function guardarLote(n, lote) {
    const b = leerBitacora(n) ?? { lotes: [] };
    b.lotes = b.lotes.filter((l) => !l.casos.every((c) => lote.casos.includes(c)));
    b.lotes.push(lote);
    writeFileSync(resolve(dirRes, `bitacora-r${n}.json`), JSON.stringify(b, null, 2));
  }

  /** El resumen se arma desde los archivos (sirve igual para corridas lanzadas por separado). */
  function escribirResumen() {
    const todas = [1, 2, 3].filter((n) => existsSync(resolve(dirRes, `bitacora-r${n}.json`)));
    const filas = [];
    for (const n of todas) for (const c of datos.CASOS) {
      const ruta = resolve(dirRes, `${c.id}-r${n}.json`);
      if (existsSync(ruta)) filas.push(JSON.parse(readFileSync(ruta, "utf8")));
    }
    const sumar = (b) => ({
      usd: Math.round(b.lotes.reduce((s, l) => s + (l.ai?.usd ?? 0), 0) * 10000) / 10000,
      runs: b.lotes.reduce((s, l) => s + (l.ai?.runs ?? 0), 0),
      tiempoRealMin: Math.round(b.lotes.reduce((s, l) => s + (l.tiempoRealMin ?? 0), 0) * 100) / 100,
    });
    const bits = todas.map((n) => ({ n, ...sumar(leerBitacora(n)) }));
    const variante = [4, 5, 6].filter((n) => existsSync(resolve(dirRes, `bitacora-r${n}.json`))).map((n) => {
      const b = leerBitacora(n);
      const casosV = b.lotes.flatMap((l) => l.casos).map((id) => {
        const ruta = resolve(dirRes, `${id}-r${n}.json`);
        if (!existsSync(ruta)) return null;
        const f = JSON.parse(readFileSync(ruta, "utf8"));
        return { caso: id, veredicto: f.veredicto, fallas: f.chequeos.filter((k) => k.ok === false).map((k) => k.id) };
      }).filter(Boolean);
      return { corrida: n, variante: b.lotes[0]?.configuracion?.variante ?? null, ...sumar(b), casos: casosV };
    });
    const resumen = {
      generado: new Date().toISOString(),
      commit: "6c22842 (PR #59)",
      corridas: bits.map((b) => ({ corrida: b.n, tiempoRealMin: b.tiempoRealMin, usd: b.usd, runs: b.runs })),
      variante_fase4: variante,
      casos: datos.CASOS.map((c) => {
        const deEste = filas.filter((f) => f.caso === c.id);
        return {
          caso: c.id, titulo: c.titulo,
          pasaron: deEste.filter((f) => f.veredicto === "pasa").length,
          corridas: deEste.length,
          fallas: [...new Set(deEste.flatMap((f) => f.chequeos.filter((k) => k.ok === false).map((k) => k.id.replace(/_j\d+$/, ""))))],
          usd: Math.round(deEste.reduce((s, f) => s + (f.ai?.usd ?? 0), 0) * 10000) / 10000,
        };
      }),
      totales: {
        casosCorridaPasan: filas.filter((f) => f.veredicto === "pasa").length,
        casosCorrida: filas.length,
        chequeosOk: filas.reduce((s, f) => s + f.chequeos.filter((k) => k.ok === true).length, 0),
        chequeosFalla: filas.reduce((s, f) => s + f.chequeos.filter((k) => k.ok === false).length, 0),
        usd: Math.round(bits.reduce((s, b) => s + b.usd, 0) * 10000) / 10000,
        usdConVariante: Math.round((bits.reduce((s, b) => s + b.usd, 0) + variante.reduce((s, v) => s + v.usd, 0)) * 10000) / 10000,
        tiempoRealMinSumado: Math.round(bits.reduce((s, b) => s + b.tiempoRealMin, 0) * 100) / 100,
      },
    };
    writeFileSync(resolve(dirRes, "resumen.json"), JSON.stringify(resumen, null, 2));
    console.log(JSON.stringify(resumen.casos.map((c) => `${c.caso} ${c.pasaron}/${c.corridas} ${c.fallas.join(",")}`), null, 1));
    console.log(`🏁 ${resumen.totales.casosCorridaPasan}/${resumen.totales.casosCorrida} caso×corrida pasan · $${resumen.totales.usd}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  async function correr(n) {
    const t0 = Date.now();
    const base = 3900 + n * 10;
    const P = { ui: base + 1, bot: base + 2, graph: base + 3, contifico: base + 4, stub: base + 5 };
    const DB = `autoventa_sim_seg_r${n}`;
    const URL_DB = `postgresql://${process.env.PGUSER ?? process.env.USER}@localhost/${DB}`;
    const archivoReloj = resolve(tmpdir(), `seg-competimotor-reloj-r${n}.json`);
    const log = (...a) => console.log(`[r${n}]`, ...a);
    let desfase = 0;
    const ahora = () => new Date(Date.now() + desfase);
    let sql = null;
    const bitacora = [];

    const ponerReloj = async (destino) => {
      desfase = new Date(destino).getTime() - Date.now();
      writeFileSync(archivoReloj, JSON.stringify({ offsetMs: desfase }));
      if (sql) await sql`update sim_reloj set offset_ms = ${Math.round(desfase)} where id = 1`;
      await dormir(250); // la precarga relee cada 100 ms
    };
    await ponerReloj(datos.SEMANA.arranque);

    // 1 · Simulador real, puertos y base propios.
    const salida = createWriteStream(resolve(dirLogs, `sim-r${n}.log`));
    const sim = spawn("node", [
      "scripts/sim/sim.mjs", "--perfil", "mundillantas", "--db", DB,
      "--puerto", String(P.ui), "--puerto-bot", String(P.bot), "--puerto-graph", String(P.graph),
      "--puerto-contifico", String(P.contifico), "--puerto-stub", String(P.stub),
      "--debounce", "1500", "--catalogo-archivo", excelOriginal, "--catalogo-confirmar", "--sin-build", "--verboso",
      ...(bandera("conservar-db") ? ["--conservar-db"] : []),
    ], {
      cwd: raízApp,
      env: { ...process.env, SEG_RELOJ_ARCHIVO: archivoReloj, NODE_OPTIONS: `--import ${import.meta.url}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let textoSim = "";
    let simMurio = null;
    sim.stdout.on("data", (d) => { textoSim += d; salida.write(d); });
    sim.stderr.on("data", (d) => { textoSim += d; salida.write(d); });
    sim.on("exit", (code) => { simMurio = code ?? -1; });
    const parar = async () => {
      if (simMurio !== null) return;
      sim.kill("SIGINT");
      for (let i = 0; i < 40 && simMurio === null; i++) await dormir(500);
      if (simMurio === null) sim.kill("SIGKILL");
      // El bot hijo a veces sobrevive al orquestador: se remata el que escucha
      // en NUESTRO puerto (y solo si lleva nuestro reloj en el entorno).
      try {
        const { execFileSync } = await import("node:child_process");
        const pids = execFileSync("lsof", ["-nP", "-t", `-iTCP:${P.bot}`, "-sTCP:LISTEN"], { encoding: "utf8" }).split("\n").filter(Boolean);
        for (const pid of pids) {
          const entorno = execFileSync("ps", ["-E", "-p", pid, "-o", "command="], { encoding: "utf8" });
          if (entorno.includes(archivoReloj)) process.kill(Number(pid), "SIGTERM");
        }
      } catch { /* nadie escuchando */ }
    };
    try {
      log("levantando el simulador…");
      for (let i = 0; !/Simulador listo/.test(textoSim); i++) {
        if (simMurio !== null) throw new Error(`el simulador salió (${simMurio}); ver logs/sim-r${n}.log`);
        if (i > 600) throw new Error("el simulador no quedó listo en 5 min");
        await dormir(500);
      }

      // 2 · El mismo reloj en Postgres.
      sql = postgres(URL_DB, { prepare: false, max: 3, onnotice: () => {} });
      await instalarRelojEnLaBase(sql, DB, desfase);
      await sql.end();
      sql = postgres(URL_DB, { prepare: false, max: 3, onnotice: () => {} });
      const [{ dbNow }] = await sql`select now() as "dbNow"`;
      const deriva = Math.abs(new Date(dbNow).getTime() - ahora().getTime());
      if (deriva > 5000) throw new Error(`el reloj de la base no quedó alineado (deriva ${deriva} ms)`);
      log(`reloj simulado en ${fmt(ahora())} (Node y Postgres, deriva ${deriva} ms)`);

      // 3 · Lo que el bot tiene cargado (copiado de la producción de Competimotor).
      const configuracion = await leerConfiguracion(sql, textoSim);
      {
        // El bot de Competimotor puede estar apagado en producción hasta el
        // arranque (salvo el número de Manuel); acá se prende como va a quedar.
        await sql`insert into settings (key, value) values ('bot_power', ${sql.json({ activo: true, apagadoAt: null, motivo: "sim seguimientos" })})
          on conflict (key) do update set value = excluded.value`;
        configuracion.botEncendidoPorLaPrueba = !configuracion.botEncendido;
      }
      if (bandera("fase4")) {
        await sql`update settings set value = jsonb_set(value, '{fase4}', 'true'::jsonb) where key = 'phase_config'`;
        configuracion.variante = "fase4 encendida (solo en esta base; producción la tiene apagada)";
      }
      if (bandera("con-semilla")) {
        // Producción DESPUÉS de correr `seed:negocio` en Competimotor (PR #62):
        // la semilla solo escribe lo que falta y pone el horario de seguimientos
        // en el del local si seguía con el de la migración 001. Así se prueba
        // s08 como va a quedar, sin tocar producción.
        const { execFileSync } = await import("node:child_process");
        execFileSync("npx", ["tsx", "src/db/seed-negocio.ts"], {
          cwd: fileURLToPath(new URL("../..", import.meta.url)),
          env: {
            ...process.env, DATABASE_URL: URL_DB, NEGOCIO: "mundillantas",
            OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "semilla", WHATSAPP_TOKEN: "x", WHATSAPP_APP_SECRET: "x",
            WHATSAPP_VERIFY_TOKEN: "x", WHATSAPP_PHONE_ID: "x",
          },
          stdio: "ignore",
        });
        configuracion.semilla = "seed:negocio corrida sobre la copia de producción (como quedará tras el PR #62)";
        configuracion.politicaResumen = (await leerConfiguracion(sql, textoSim)).politicaResumen;
        log("semilla de Competimotor aplicada a la base");
      }
      log(`política: ${JSON.stringify(configuracion.politicaResumen)}`);

      // 4 · La semana simulada.
      const telefonoDe = (i) => `5939003${n}00${String(i + 1).padStart(2, "0")}`;
      const estado = casos.map((c, i) => ({ caso: c, telefono: telefonoDe(i), eventos: [], errores: [], productoAntes: null }));
      const eventos = [];
      for (const e of estado) {
        eventos.push({ nombre: `${e.caso.id}: conversación`, tiempo: () => new Date(e.caso.inicio), correr: () => conversar(e) });
        for (const d of e.caso.despues ?? []) {
          eventos.push({ nombre: `${e.caso.id}: ${d.cuando}`, tiempo: () => tiempoDinamico(e, d), correr: () => responderDinamico(e, d), dinamico: true });
        }
      }
      eventos.push({
        nombre: "Excel de Fénix del viernes 8 am",
        tiempo: () => new Date(datos.CAMBIO_DE_INVENTARIO.cuando),
        correr: () => subirCatalogo(excelCambiado),
      });
      const fin = new Date(datos.SEMANA.fin);

      while (true) {
        // Lo que ya tocaba: en paralelo (clientes distintos).
        const ya = [];
        for (const ev of eventos) {
          if (ev.hecho) continue;
          const t = await ev.tiempo();
          if (t === "imposible") { ev.hecho = true; bitacora.push({ reloj: fmt(ahora()), evento: ev.nombre, nota: "no ocurrió: su condición nunca se dio" }); continue; }
          if (t && t.getTime() <= ahora().getTime() + 1000) ya.push(ev);
        }
        if (ya.length) {
          for (const ev of ya) ev.hecho = true;
          bitacora.push(...ya.map((ev) => ({ reloj: fmt(ahora()), evento: ev.nombre })));
          await Promise.all(ya.map((ev) => ev.correr().catch((error) => bitacora.push({ reloj: fmt(ahora()), evento: ev.nombre, error: String(error?.message ?? error) }))));
          await esperarCalma();
          continue;
        }
        await esperarCalma();
        // Lo próximo: un job del bot o un evento del guion.
        const [{ prox }] = await sql`select min(due_at) as prox from follow_up_jobs where status = 'scheduled' and due_at > ${ahora()}`;
        let siguiente = prox ? new Date(new Date(prox).getTime() + 10_000) : null;
        let razon = siguiente ? "job" : null;
        for (const ev of eventos) {
          if (ev.hecho) continue;
          const t = await ev.tiempo();
          if (t instanceof Date && (!siguiente || t < siguiente)) { siguiente = t; razon = ev.nombre; }
        }
        const pendientesDelGuion = eventos.some((ev) => !ev.hecho && !ev.dinamico);
        if (!siguiente || (siguiente > fin && !pendientesDelGuion)) {
          if (ahora() < fin) await ponerReloj(fin);
          await dormir(6000);
          await esperarCalma();
          break;
        }
        if (siguiente > ahora()) {
          bitacora.push({ reloj: fmt(ahora()), salto: fmt(siguiente), por: razon });
          await ponerReloj(siguiente);
          await dormir(5500); // una vuelta del worker (FOLLOW_UP_POLL_MS = 5 s)
        }
      }
      log(`semana simulada terminada en ${fmt(ahora())}`);

      // 5 · Hechos y veredictos.
      const filas = [];
      for (const e of estado) {
        const fila = await juzgar(e, configuracion);
        fila.bitacora = bitacora.filter((b) => (b.evento ?? "").startsWith(e.caso.id));
        writeFileSync(resolve(dirRes, `${e.caso.id}-r${n}.json`), JSON.stringify(fila, null, 2));
        filas.push(fila);
        log(`${fila.veredicto === "pasa" ? "✅" : "❌"} ${e.caso.id}: ${fila.chequeos.filter((k) => k.ok === false).map((k) => k.id).join(", ") || "todo ok"}`);
      }
      const ai = await costoAi(sql, null);
      guardarLote(n, { casos: casos.map((c) => c.id), bitacora, configuracion, ai, tiempoRealMin: Math.round((Date.now() - t0) / 600) / 100 });
      return { corrida: n, casos: filas, ai, configuracion, tiempoRealMin: Math.round((Date.now() - t0) / 600) / 100 };
    } finally {
      try { await sql?.end({ timeout: 2 }); } catch { /* nada */ }
      await parar();
      salida.end();
    }

    // ─── piezas de la corrida ───────────────────────────────────────────────
    async function convDe(telefono) {
      const [c] = await sql`select * from conversations where phone = ${telefono} order by id desc limit 1`;
      return c ?? null;
    }

    async function turno(e, texto, k) {
      const c = await convDe(e.telefono);
      const [{ antes }] = c
        ? await sql`select coalesce(max(id), 0)::bigint as antes from messages where conversation_id = ${c.id}`
        : [{ antes: 0 }];
      const payload = buildInboundPayload({
        from: e.telefono, name: `Cliente ${e.caso.id.slice(0, 3)}`, text: texto,
        waMessageId: `wamid.seg.r${n}.${e.caso.id}.${k}.${Date.now()}`, phoneId: "SIMPHONEID",
        timestamp: ahora().getTime(),
      });
      let r = null;
      for (let i = 0; i < 3; i++) {
        r = await deliverWebhook({ baseUrl: `http://127.0.0.1:${P.bot}`, appSecret: "sim_app_secret", payload });
        if (r.status === 200) break;
        await dormir(1000);
      }
      e.eventos.push({ reloj: ahora().toISOString(), cliente: texto, webhook: r?.status });
      await esperarRespuesta(e, Number(antes));
    }

    async function esperarRespuesta(e, antes) {
      const limite = Date.now() + 240_000;
      let visto = null;
      let quietoDesde = Date.now();
      while (Date.now() < limite) {
        await dormir(1000);
        const c = await convDe(e.telefono);
        if (!c) continue;
        const [r] = await sql`
          select (select coalesce(max(id),0) from messages where conversation_id = ${c.id} and id > ${antes} and direction = 'outbound') as out,
                 (select coalesce(max(id),0) from messages where conversation_id = ${c.id}) as mm,
                 (select coalesce(max(id),0) from ai_runs where conversation_id = ${c.id}) as ma`;
        const firma = `${r.mm}:${r.ma}`;
        if (firma !== visto) { visto = firma; quietoDesde = Date.now(); continue; }
        if (Number(r.out) > 0 && Date.now() - quietoDesde > 8000) return;
      }
      e.errores.push(`sin respuesta del bot en 4 min (reloj ${fmt(ahora())})`);
    }

    async function conversar(e) {
      let k = 0;
      for (const t of e.caso.turnos) {
        const texto = typeof t === "string" ? t : t.texto;
        if (typeof t === "object" && t.siNoHayCotizacion) {
          const c = await convDe(e.telefono);
          const [q] = c ? await sql`select id from quotes where conversation_id = ${c.id} limit 1` : [];
          if (q) { e.eventos.push({ reloj: ahora().toISOString(), omitido: texto, porque: "ya había cotización" }); continue; }
        }
        await turno(e, texto, k++);
      }
      const c = await convDe(e.telefono);
      e.productoAntes = c ? { tire_size: c.tire_size, selected_product_code: c.selected_product_code, stage: c.stage } : null;
      e.calloEn = ahora().toISOString();
    }

    /** Los jobs `in_window_first` desde que el cliente calló (el bot puede reemplazar el plan). */
    async function jobsDelPrimero(e) {
      const c = await convDe(e.telefono);
      if (!c || !e.calloEn) return [];
      return sql`
        select id::int as id, status, due_at, executed_at, cancel_reason from follow_up_jobs
        where conversation_id = ${c.id} and type = 'in_window_first'
          and created_at >= ${new Date(new Date(e.calloEn).getTime() - 120_000)}
        order by id`;
    }

    async function tiempoDinamico(e, d) {
      if (!e.calloEn) return null;
      const jobs = await jobsDelPrimero(e);
      const vencido = ahora() > new Date(new Date(e.calloEn).getTime() + 36 * 3600_000);
      const enviado = jobs.find((j) => j.status === "sent");
      const vivo = [...jobs].reverse().find((j) => j.status === "scheduled" || j.status === "processing");
      if (d.cuando === "antes_del_primero") {
        if (enviado) return "imposible";
        if (vivo?.status === "scheduled") return new Date(new Date(vivo.due_at).getTime() - d.minutos * 60_000);
        return vencido ? "imposible" : null;
      }
      if (d.cuando === "tras_el_primero") {
        if (enviado) return new Date(new Date(enviado.executed_at).getTime() + d.minutos * 60_000);
        return vencido ? "imposible" : null;
      }
      return null;
    }

    async function responderDinamico(e, d) {
      const jobs = await jobsDelPrimero(e);
      const j = d.cuando === "tras_el_primero"
        ? jobs.find((x) => x.status === "sent")
        : [...jobs].reverse().find((x) => x.status === "scheduled" || x.status === "processing") ?? jobs[jobs.length - 1];
      e.dinamico = { cuando: d.cuando, jobId: j?.id ?? null, jobDue: j?.due_at ?? null, jobEstadoAlResponder: j?.status ?? null, reloj: ahora().toISOString() };
      const c = await convDe(e.telefono);
      e.productoAntes = c ? { tire_size: c.tire_size, selected_product_code: c.selected_product_code, stage: c.stage } : e.productoAntes;
      await turno(e, d.texto, 90);
      e.respondioEn = ahora().toISOString();
    }

    async function subirCatalogo(ruta) {
      const r = await fetch(`http://127.0.0.1:${P.bot}/api/catalog/import?nombre=competimotor-inventario.xls`, {
        method: "POST", headers: { "x-admin-key": "sim", "Content-Type": "application/octet-stream" },
        body: readFileSync(ruta), signal: AbortSignal.timeout(60_000),
      });
      const cuerpo = await r.text();
      bitacora.push({ reloj: fmt(ahora()), evento: "catálogo subido", status: r.status, respuesta: cuerpo.slice(0, 300) });
      if (!r.ok) throw new Error(`subida del catálogo: HTTP ${r.status} ${cuerpo.slice(0, 200)}`);
    }

    async function esperarCalma() {
      const limite = Date.now() + 180_000;
      let firma = null;
      let quietoDesde = Date.now();
      while (Date.now() < limite) {
        const [r] = await sql`
          select (select count(*) from follow_up_jobs where status = 'processing')::int as proc,
                 (select count(*) from follow_up_jobs where status = 'scheduled' and due_at <= ${ahora()})::int as vencidos,
                 (select coalesce(max(id),0) from messages) as mm,
                 (select coalesce(max(id),0) from ai_runs) as ma,
                 (select coalesce(max(id),0) from follow_up_jobs) as mj`;
        const f = `${r.proc}:${r.vencidos}:${r.mm}:${r.ma}:${r.mj}`;
        if (f !== firma) { firma = f; quietoDesde = Date.now(); }
        else if (r.proc === 0 && r.vencidos === 0 && Date.now() - quietoDesde > 6500) return;
        await dormir(1000);
      }
      bitacora.push({ reloj: fmt(ahora()), aviso: "esperarCalma: 3 min sin calma", firma });
    }

    async function juzgar(e, cfg) {
      const c = await convDe(e.telefono);
      const hechos = { conversacion: null, mensajes: [], jobs: [], intentos: [], cotizaciones: [], alertas: [], guardian: [] };
      if (c) {
        hechos.conversacion = pick(c, ["id", "stage", "status", "assigned_to", "current_cycle", "tire_size", "selected_product_code",
          "selected_quantity", "nearest_store", "visit_date", "visit_time_label", "opted_out_at", "negative_sentiment_at",
          "last_customer_message_at", "last_assistant_message_at", "bot_paused_until", "bot_paused_reason"]);
        hechos.mensajes = await sql`select id::int as id, direction, author_kind, content, created_at, metadata->>'followUpJobId' as job, metadata->>'piece' as pieza
          from messages where conversation_id = ${c.id} order by id`;
        hechos.jobs = await sql`select id::int as id, type, status, due_at, executed_at, window_closes_at, cancel_reason, created_at,
          payload->>'preview' as preview, payload->>'modo' as modo, payload->>'suprimido' as suprimido, payload->>'stage' as etapa,
          payload->>'guardianCorrigio' as guardian_corrigio
          from follow_up_jobs where conversation_id = ${c.id} order by id`;
        hechos.intentos = await sql`select id::int as id, job_id::int as job_id, status, message_type, template_name, sent_at, created_at from follow_up_attempts where conversation_id = ${c.id} order by id`;
        hechos.cotizaciones = await sql`select * from quotes where conversation_id = ${c.id} order by id`.catch(() => []);
        hechos.alertas = await sql`select type, priority, summary, exact_reason, created_at from bot_alerts where conversation_id = ${c.id} order by id`;
        hechos.guardian = await sql`select * from guardian_reviews where conversation_id = ${c.id} order by id`.catch(() => []);
      }
      const ai = c ? await costoAi(sql, c.id) : { runs: 0, usd: 0 };
      const chequeos = evaluar(e, hechos, cfg);
      const seguimientos = hechos.mensajes.filter((m) => m.job).map((m) => ({ job: Number(m.job), enviado: m.created_at, reloj: fmt(m.created_at), texto: m.content }));
      return {
        caso: e.caso.id, titulo: e.caso.titulo, corrida: n, telefono: e.telefono,
        veredicto: chequeos.every((k) => k.ok !== false) && !e.errores.length ? "pasa" : "falla",
        chequeos, errores: e.errores, seguimientos,
        reloj: { inicio: e.caso.inicio, callo: e.calloEn ?? null, dinamico: e.dinamico ?? null, respondio: e.respondioEn ?? null, finSemana: datos.SEMANA.fin },
        productoAntes: e.productoAntes ?? null,
        ai, eventos: e.eventos, hechos: { ...hechos, mensajes: hechos.mensajes.map((m) => ({ ...m, reloj: fmt(m.created_at) })) },
      };
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Chequeos (sobre HECHOS de la base; el texto solo para juzgar contenido)
  // ───────────────────────────────────────────────────────────────────────────
  function evaluar(e, h, cfg) {
    const k = [];
    const add = (id, ok, detalle) => k.push({ id, ok, detalle });
    const caso = e.caso;
    const pol = cfg.politica;
    const msgs = h.mensajes;
    const seg = msgs.filter((m) => m.job);
    const jobsDe = (tipo) => h.jobs.filter((j) => j.type === tipo);
    const cot = h.cotizaciones;

    // G1 · horario real de Competimotor
    const fueraDeHorario = seg.filter((m) => !dentroDeHorario(new Date(m.created_at), datos.HORARIO_COMPETIMOTOR));
    add("horario_competimotor", fueraDeHorario.length === 0,
      fueraDeHorario.length ? `salieron con el local cerrado: ${fueraDeHorario.map((m) => fmt(m.created_at)).join(", ")}` : `${seg.length} seguimiento(s), todos con el local abierto`);

    // G2 · ventana de 24 h: ningún texto libre después de 24 h del último entrante
    const fueraDeVentana = seg.filter((m) => {
      const ultimoIn = [...msgs].filter((x) => x.direction === "inbound" && x.id < m.id).pop();
      return !ultimoIn || new Date(m.created_at) - new Date(ultimoIn.created_at) >= 24 * 3600_000;
    });
    const plantillas = h.intentos.filter((i) => i.message_type === "template");
    add("ventana_24h", fueraDeVentana.length === 0,
      fueraDeVentana.length ? `texto libre fuera de 24 h: ${fueraDeVentana.map((m) => fmt(m.created_at)).join(", ")}` : `ninguno fuera de 24 h; plantillas intentadas: ${plantillas.length}`);

    // G3 · máximo de seguimientos por silencio
    const porSilencio = new Map();
    for (const m of seg) {
      const ultimoIn = [...msgs].filter((x) => x.direction === "inbound" && x.id < m.id).pop()?.id ?? 0;
      porSilencio.set(ultimoIn, (porSilencio.get(ultimoIn) ?? 0) + 1);
    }
    const maxPorSilencio = Math.max(0, ...porSilencio.values());
    add("maximo_por_silencio", maxPorSilencio <= pol.max_in_window_attempts,
      `máx. ${maxPorSilencio} seguimiento(s) tras un mismo silencio (tope de la política: ${pol.max_in_window_attempts})`);

    // G4 · habla como Competimotor (este servicio no es Mundillantas ni Depot)
    const ajenos = seg.filter((m) => /depot|quito|cumbay|tumbaco|mundillantas|mundi\s+(falken|kenda)/i.test(m.content));
    add("identidad_competimotor", ajenos.length === 0,
      ajenos.length ? ajenos.map((m) => recorte(m.content, /depot|quito|cumbay|tumbaco|mundillantas|mundi\s+(falken|kenda)/i)).join(" | ") : "sin marcas ni locales ajenos");

    // G5 · sin promo, descuento ni urgencia inventada
    const RX_PROMO = /promo|descuento|oferta especial|black ?friday|cyber|[uú]ltimas? (unidades|llantas)|quedan (pocas|solo|s[oó]lo)|solo quedan|s[oó]lo quedan|por tiempo limitado|aprovech|rebaja|\b\d{1,2} ?%|cup[oó]n|hasta agotar/i;
    const promos = seg.filter((m) => RX_PROMO.test(m.content));
    add("sin_promo_ni_urgencia", promos.length === 0,
      promos.length ? promos.map((m) => recorte(m.content, RX_PROMO)).join(" | ") : "ninguna promo, descuento ni urgencia");

    // G6/G7 · precios
    const cat = caso.cambioDeInventario ? catalogoViernes : catalogo;
    const medidaN = caso.medida ? normMedida(caso.medida) : null;
    const filasMedida = medidaN ? catalogo.filter((f) => normMedida(f.medida) === medidaN) : [];
    const precioD = new Set();
    for (const f of (medidaN ? filasMedida : catalogo)) for (const q of [1, 2, 4]) precioD.add(redondo(f.d * q));
    const montos = seg.flatMap((m) => montosDe(m.content).map((v) => ({ v, m })));
    const conD = montos.filter(({ v }) => precioD.has(redondo(v)) && !permitidos().has(redondo(v)));
    add("sin_precio_d", conD.length === 0, conD.length ? `montos iguales a la lista D: ${conD.map((x) => x.v).join(", ")}` : `montos en seguimientos: ${montos.map((x) => x.v).join(", ") || "ninguno"}`);
    function permitidos() {
      const s = new Set();
      for (const q of cot) {
        s.add(redondo(Number(q.total)));
        if (q.subtotal != null) s.add(redondo(Number(q.subtotal)));
        for (const it of Array.isArray(q.items) ? q.items : []) {
          const pu = Number(it.precioUnit ?? it.precio_unit ?? it.price ?? it.unitPrice ?? NaN);
          const cant = Number(it.cantidad ?? it.quantity ?? 1);
          if (Number.isFinite(pu)) { s.add(redondo(pu)); s.add(redondo(pu * cant)); }
        }
      }
      const fuente = caso.cambioDeInventario ? catalogoViernes : catalogo;
      for (const f of (medidaN ? fuente.filter((x) => normMedida(x.medida) === medidaN) : [])) for (const q of [1, 2, 3, 4]) s.add(redondo(f.a * q));
      return s;
    }
    if (montos.length) {
      const ok = permitidos();
      if (caso.cambioDeInventario) {
        const viejo = datos.CAMBIO_DE_INVENTARIO.precioA.antes;
        for (const q of [1, 2, 3, 4]) ok.delete(redondo(viejo * q));
        // el total de la cotización vieja tampoco vale como «vigente»
        for (const q of cot) ok.delete(redondo(Number(q.total)));
      }
      const raros = montos.filter(({ v }) => !ok.has(redondo(v)));
      add("precio_coincide", raros.length === 0,
        raros.length ? `montos que no son de la cotización ni del precio A vigente: ${raros.map((x) => x.v).join(", ")}` : "todos los montos son de la cotización / precio A vigente");
    }

    // G8 · medida correcta
    if (medidaN) {
      const medidas = seg.flatMap((m) => [...m.content.matchAll(/\b(\d{3})\s*\/\s*(\d{2})\s*(?:Z?R)?\s*(\d{2})\b/gi)].map((x) => `${x[1]}/${x[2]}R${x[3]}`));
      const otras = medidas.filter((x) => normMedida(x) !== medidaN);
      add("medida_correcta", otras.length === 0, otras.length ? `nombra otra medida: ${otras.join(", ")}` : medidas.length ? `nombra ${[...new Set(medidas)].join(", ")}` : "no nombra medida");
    }

    // G9 · momento según la política cargada
    for (const tipo of ["in_window_first", "in_window_second"]) {
      for (const j of jobsDe(tipo).filter((x) => x.status === "sent")) {
        const esperado = momentoEsperado(j, tipo, h, pol);
        const real = new Date(j.executed_at);
        const okDue = esperado ? Math.abs(new Date(j.due_at) - esperado) <= 120_000 : null;
        const okLatencia = real - new Date(j.due_at) <= 5 * 60_000 && real >= new Date(j.due_at);
        add(`momento_${tipo === "in_window_first" ? "primero" : "segundo"}_j${j.id}`, okDue !== false && okLatencia,
          `agendado ${fmt(j.due_at)} (esperado por la política: ${esperado ? fmt(esperado) : "?"}), salió ${fmt(real)}`);
      }
    }

    // Por caso
    const enviados = jobsDe("in_window_first").filter((j) => j.status === "sent").length + jobsDe("in_window_second").filter((j) => j.status === "sent").length;
    const id = caso.id;
    if (["s01-sin-medida", "s02-recibio-opciones", "s03-recibio-cotizacion", "s04-dijo-que-pasa", "s09-viernes-noche", "s11-contesta-al-seguimiento", "s12-cambio-precio-stock", "s13-pregunta-misma-etapa", "s14-pregunta-tras-cotizar"].includes(id)) {
      const ultimoIn = [...msgs].filter((m) => m.direction === "inbound").pop();
      const tras = seg.filter((m) => ultimoIn && m.id > ultimoIn.id);
      add("seguimiento_tras_el_ultimo_silencio", tras.length >= 1,
        `${tras.length} seguimiento(s) después del último mensaje del cliente (${ultimoIn ? fmt(ultimoIn.created_at) : "?"}); jobs creados después: ${h.jobs.filter((j) => ultimoIn && new Date(j.created_at) > new Date(ultimoIn.created_at)).map((j) => `${j.type}:${j.status}${j.cancel_reason ? `(${j.cancel_reason})` : ""}`).join(", ") || "ninguno"}`);
      add("salio_el_seguimiento", seg.length >= 1, `${seg.length} seguimiento(s) enviados; jobs: ${h.jobs.map((j) => `${j.type}:${j.status}${j.cancel_reason ? `(${j.cancel_reason})` : ""}`).join(", ")}`);
    }
    if (id === "s01-sin-medida") {
      add("sin_precio_sin_medida", seg.every((m) => montosDe(m.content).length === 0), "sin medida no hay precio que dar");
      const rev = jobsDe("advisor_review");
      add("revision_del_asesor_al_agotarse", rev.some((j) => j.status === "sent"), `advisor_review: ${rev.map((j) => `${j.status} ${fmt(j.due_at)}`).join(", ") || "ninguno"}`);
    }
    if (id === "s03-recibio-cotizacion" || id === "s12-cambio-precio-stock" || id === "s11-contesta-al-seguimiento") {
      add("hay_cotizacion", cot.length >= 1, `${cot.length} cotización(es): ${cot.map((q) => `$${q.total}`).join(", ")}`);
    }
    if (id === "s04-dijo-que-pasa") {
      const c = h.conversacion ?? {};
      add("visita_registrada", Boolean(c.visit_date), `visit_date=${c.visit_date ? fmtDia(c.visit_date) : "null"}, local=${c.nearest_store ?? "null"}, etapa=${c.stage}`);
      const primero = jobsDe("in_window_first").find((j) => j.status === "sent");
      if (primero) add("libreto_de_visita", primero.modo === "confirmacion_de_visita", `modo del seguimiento: ${primero.modo}`);
      const repregunta = seg.filter((m) => /qu[eé] d[ií]a|cu[aá]ndo (podr[ií]a|puede|vendr[ií]a|pasar[ií]a)/i.test(m.content));
      add("no_repregunta_el_dia", repregunta.length === 0, repregunta.length ? repregunta.map((m) => recorte(m.content, /qu[eé] d[ií]a|cu[aá]ndo/i)).join(" | ") : "no vuelve a preguntar el día");
    }
    if (id === "s05-rechazo" || id === "s06-pidio-asesor" || id === "s10-ventana-24h") {
      add("no_salio_seguimiento_al_cliente", seg.length === 0,
        `${seg.length} seguimiento(s); jobs: ${h.jobs.map((j) => `${j.type}:${j.status}${j.cancel_reason ? `(${j.cancel_reason})` : ""}`).join(", ") || "ninguno"}`);
    }
    if (id === "s06-pidio-asesor") {
      const c = h.conversacion ?? {};
      const humano = h.alertas.some((a) => /human|asesor/i.test(`${a.type} ${a.summary}`));
      add("quedo_con_el_asesor", humano, `assigned_to al final=${c.assigned_to}; alertas: ${h.alertas.map((a) => a.type).join(", ")}`);
    }
    if (id === "s07-contesto-justo-antes") {
      const d = e.dinamico;
      add("respondio_antes_del_seguimiento", Boolean(d && d.jobEstadoAlResponder === "scheduled"), d ? `respondió ${fmt(d.reloj)} con el job ${d.jobId} (${fmt(d.jobDue)}) en estado ${d.jobEstadoAlResponder}` : "el evento no ocurrió");
      if (d?.jobId) {
        const j = h.jobs.find((x) => x.id === d.jobId);
        add("el_programado_se_cancelo", j?.status === "cancelled", `job ${d.jobId}: ${j?.status} (${j?.cancel_reason ?? ""})`);
        const ultimaBot = [...msgs].filter((m) => m.direction === "outbound" && !m.job && e.respondioEn && new Date(m.created_at) >= new Date(d.reloj)).pop();
        const prematuro = seg.filter((m) => ultimaBot && new Date(m.created_at) - new Date(ultimaBot.created_at) < pol.first_delay_minutes * 60_000 - 120_000 && new Date(m.created_at) > new Date(d.reloj));
        add("nuevo_plan_cuenta_desde_la_respuesta", prematuro.length === 0, prematuro.length ? `seguimiento a menos de ${pol.first_delay_minutes} min de la nueva respuesta: ${prematuro.map((m) => fmt(m.created_at)).join(", ")}` : `siguiente seguimiento: ${seg.filter((m) => new Date(m.created_at) > new Date(d.reloj)).map((m) => fmt(m.created_at)).join(", ") || "ninguno"}`);
      }
    }
    if (id === "s11-contesta-al-seguimiento") {
      const d = e.dinamico;
      add("cliente_contesto_al_seguimiento", Boolean(d && d.jobEstadoAlResponder === "sent"), d ? `respondió ${fmt(d.reloj)} tras el job ${d.jobId}` : "el evento no ocurrió");
      if (d) {
        const c = h.conversacion ?? {};
        const antes = e.productoAntes ?? {};
        add("contexto_intacto_medida", normMedida(c.tire_size ?? "") === normMedida(caso.medida), `tire_size=${c.tire_size}`);
        add("contexto_intacto_llanta", !antes.selected_product_code || c.selected_product_code === antes.selected_product_code, `producto antes=${antes.selected_product_code} después=${c.selected_product_code}`);
        add("etapa_no_retrocede", !["nuevo", "medida_confirmada"].includes(c.stage), `etapa antes=${antes.stage} después=${c.stage}`);
        const respuesta = msgs.filter((m) => m.direction === "outbound" && !m.job && new Date(m.created_at) >= new Date(d.reloj));
        const montosR = respuesta.flatMap((m) => montosDe(m.content));
        const ok = permitidos();
        const raros = montosR.filter((v) => !ok.has(redondo(v)));
        add("respuesta_con_el_precio_vigente", raros.length === 0, `montos en la respuesta: ${montosR.join(", ") || "ninguno"}${raros.length ? `; fuera de la cotización: ${raros.join(", ")}` : ""}`);
        const otrasMedidas = respuesta.flatMap((m) => [...m.content.matchAll(/\b(\d{3})\s*\/\s*(\d{2})\s*(?:Z?R)?\s*(\d{2})\b/gi)].map((x) => `${x[1]}/${x[2]}R${x[3]}`)).filter((x) => normMedida(x) !== normMedida(caso.medida));
        add("respuesta_sin_repreguntar_medida", otrasMedidas.length === 0 && !respuesta.some((m) => /(cu[aá]l|qu[eé]) (es )?(la )?medida/i.test(m.content)), otrasMedidas.length ? `otras medidas: ${otrasMedidas.join(", ")}` : "no repregunta la medida");
      }
    }
    if (id === "s12-cambio-precio-stock") {
      const cambio = datos.CAMBIO_DE_INVENTARIO;
      const fila = catalogoViernes.find((f) => f.codigo === cambio.codigo);
      add("inventario_cambio_antes_del_seguimiento", Boolean(fila && fila.a === cambio.precioA.despues && fila.stock === cambio.existencia.despues),
        `Excel del viernes: ${cambio.codigo} A=${fila?.a} existencia=${fila?.stock}; subido ${fmt(cambio.cuando)}`);
      const primero = h.jobs.find((j) => j.type === "in_window_first" && j.status === "sent");
      if (primero) add("seguimiento_despues_del_cambio", new Date(primero.executed_at ?? primero.due_at) >= new Date(cambio.cuando), `primer job ${primero.status} ${fmt(primero.executed_at ?? primero.due_at)}`);
      const promete4 = seg.filter((m) => /\b(4|cuatro)\s+(llantas|unidades)?\s*(disponibles|en stock|listas|reservadas)|(tenemos|hay|quedan)\s+(las\s+)?(4|cuatro)\b/i.test(m.content));
      add("no_promete_stock_que_no_hay", promete4.length === 0, promete4.length ? promete4.map((m) => recorte(m.content, /(4|cuatro)/i)).join(" | ") : `no promete 4 (quedan ${cambio.existencia.despues})`);
      const viejos = seg.flatMap((m) => montosDe(m.content)).filter((v) => [1, 2, 3, 4].some((q) => redondo(v) === redondo(cambio.precioA.antes * q)) || cot.some((q) => redondo(Number(q.total)) === redondo(v)));
      add("no_afirma_el_precio_viejo", viejos.length === 0, viejos.length ? `repite el precio de antes del cambio: ${viejos.join(", ")}` : "no repite el precio viejo");
    }
    if (e.errores.length) add("conversacion_sin_errores_del_guion", false, e.errores.join("; "));
    return k;
  }

  /** Oráculo independiente de la regla documentada (no importa el código del bot). */
  function momentoEsperado(job, tipo, h, pol) {
    const horas = Object.fromEntries(Object.entries(pol.business_hours).map(([d, v]) => [Number(d), v]));
    const creado = new Date(job.created_at);
    const outs = h.mensajes.filter((m) => m.direction === "outbound" && !m.job && new Date(m.created_at) <= creado);
    const ins = h.mensajes.filter((m) => m.direction === "inbound" && new Date(m.created_at) <= creado);
    if (!outs.length || !ins.length) return null;
    const ultimoBot = new Date(outs[outs.length - 1].created_at);
    const ultimoCliente = new Date(ins[ins.length - 1].created_at);
    const ventana = new Date(ultimoCliente.getTime() + 24 * 3600_000);
    const objetivo1 = new Date(Math.max(ultimoBot.getTime() + pol.first_delay_minutes * 60_000, creado.getTime()));
    const primero = siguienteHabil(objetivo1, horas);
    if (tipo === "in_window_first") return primero;
    const objetivo2 = new Date(ventana.getTime() - pol.second_before_close_minutes * 60_000);
    return anteriorHabil(objetivo2, horas);
  }

  function siguienteHabil(t, horas) {
    if (dentroDeHorario(t, horas)) return t;
    for (let d = 0; d <= 7; d++) {
      const dia = diaLocal(t, d);
      const h = horas[dia.dow];
      if (!h) continue;
      const abre = instante(dia, h.open), cierra = instante(dia, h.close);
      if (t < abre) return abre;
      if (t < cierra) return t;
    }
    return null;
  }
  function anteriorHabil(t, horas) {
    if (dentroDeHorario(t, horas)) return t;
    for (let d = 0; d >= -7; d--) {
      const dia = diaLocal(t, d);
      const h = horas[dia.dow];
      if (!h) continue;
      const abre = instante(dia, h.open), cierra = instante(dia, h.close);
      if (t >= cierra) return new Date(cierra.getTime() - 60_000);
      if (t >= abre) return t;
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades (Guayaquil = UTC−5 fijo, sin horario de verano)
// ─────────────────────────────────────────────────────────────────────────────
const GYE = -5 * 3600_000;
function diaLocal(t, desplazamiento = 0) {
  const local = new Date(new Date(t).getTime() + GYE);
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate() + desplazamiento;
  const base = new Date(Date.UTC(y, m, d));
  return { y: base.getUTCFullYear(), m: base.getUTCMonth(), d: base.getUTCDate(), dow: base.getUTCDay() };
}
function instante(dia, hhmm) {
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(dia.y, dia.m, dia.d, h, mi) - GYE);
}
function dentroDeHorario(t, horas) {
  const dia = diaLocal(t);
  const h = horas[dia.dow];
  if (!h) return false;
  return t >= instante(dia, h.open) && t < instante(dia, h.close);
}
function fmt(t) {
  if (!t) return null;
  const local = new Date(new Date(t).getTime() + GYE);
  const dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  return `${dias[local.getUTCDay()]} ${String(local.getUTCDate()).padStart(2, "0")} ${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}
function fmtDia(t) { return new Date(t).toISOString().slice(0, 10); }
function dormir(ms) { return new Promise((ok) => setTimeout(ok, ms)); }
function redondo(v) { return Math.round(Number(v) * 100) / 100; }
function pick(o, ks) { return Object.fromEntries(ks.map((k) => [k, o[k] ?? null])); }
function normMedida(s) { const m = String(s ?? "").match(/(\d{3})\s*\/\s*(\d{2})\s*(?:Z?R)?\s*(\d{2})/i); return m ? `${m[1]}/${m[2]}R${m[3]}` : String(s ?? ""); }
function recorte(texto, rx) { const i = texto.search(rx); return `…${texto.slice(Math.max(0, i - 50), i + 70).replace(/\s+/g, " ")}…`; }
/** Montos en dólares de un texto: «$418,60», «$ 104.65», «418.60 dólares». */
function montosDe(texto) {
  const out = [];
  for (const m of String(texto).matchAll(/\$\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(?:d[oó]lares|usd)\b/gi)) {
    let s = m[1] ?? m[2];
    if (/[.,]\d{3}([.,]|$)/.test(s) && /[.,]\d{1,2}$/.test(s)) s = s.replace(/[.,](?=\d{3}[.,])/g, "");
    s = s.replace(",", ".");
    const v = Number(s);
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

function leerPrecios(XLSX, ruta) {
  const wb = XLSX.readFile(ruta);
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
  return filas.filter((f) => typeof f[2] === "string" && Number(f[4]) > 0 && /\d{3}\/\d{2}/.test(f[2])).map((f) => ({
    codigo: String(f[0]), articulo: f[2], medida: normMedida(f[2]), a: Number(f[4]), b: Number(f[5]), c: Number(f[6]), d: Number(f[7]), stock: Number(f[8]),
  }));
}

function escribirExcelCambiado(XLSX, origen, destino, cambio) {
  const wb = XLSX.readFile(origen, { cellStyles: false });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true });
  const poner = (r, c, v) => {
    const dir = XLSX.utils.encode_cell({ r, c });
    hoja[dir] = typeof v === "number" ? { t: "n", v } : { t: "s", v };
  };
  // sheet_to_json con header:1 respeta el rango; las filas vacías cuentan
  const rango = XLSX.utils.decode_range(hoja["!ref"]);
  let cambiada = false;
  filas.forEach((f, i) => {
    const r = rango.s.r + i;
    if (f[0] === "Fecha Reporte:") poner(r, rango.s.c + 1, cambio.fechaReporte);
    if (String(f[0]) === cambio.codigo) {
      poner(r, rango.s.c + 4, cambio.precioA.despues);
      poner(r, rango.s.c + 8, cambio.existencia.despues);
      cambiada = true;
    }
  });
  if (!cambiada) throw new Error(`No encontré ${cambio.codigo} en el Excel`);
  XLSX.writeFile(wb, destino, { bookType: "biff8" });
}

async function instalarRelojEnLaBase(sql, DB, desfase) {
  await sql`create table if not exists sim_reloj (id int primary key, offset_ms bigint not null)`;
  await sql`insert into sim_reloj (id, offset_ms) values (1, ${Math.round(desfase)}) on conflict (id) do update set offset_ms = excluded.offset_ms`;
  await sql.unsafe(`
    create or replace function public.now() returns timestamptz language sql stable as
      $$ select pg_catalog.now() + make_interval(secs => (select offset_ms from public.sim_reloj where id = 1) / 1000.0) $$`);
  await sql.unsafe(`alter database ${DB} set search_path = public, pg_catalog`);
  const columnas = await sql`
    select table_name, column_name, column_default from information_schema.columns
    where table_schema = 'public' and column_default is not null
      and (column_default ~* '(^|[^.])now\\(\\)' or column_default ~* 'current_timestamp')`;
  for (const c of columnas) {
    const nuevo = c.column_default.replace(/(^|[^.])now\(\)/gi, "$1public.now()").replace(/current_timestamp/gi, "public.now()");
    await sql.unsafe(`alter table public."${c.table_name}" alter column "${c.column_name}" set default ${nuevo}`);
  }
  // Las conexiones ya abiertas (bot y orquestador) se cortan para que tomen el
  // search_path nuevo; postgres.js reconecta solo.
  await sql`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${DB} and pid <> pg_backend_pid()`;
  await dormir(2000);
  return columnas.length;
}

async function leerConfiguracion(sql, textoSim) {
  const [politica] = await sql`select * from follow_up_policies where policy_key = 'default'`;
  const ajustes = Object.fromEntries((await sql`select key, value from settings where key in ('phase_config','bot_power','coupon_config','guardian_config','store_hours')`).map((r) => [r.key, r.value]));
  const plantillas = await sql`select template_key, template_name, configured, approval_status, automatic_send from follow_up_templates`;
  const lineasEntorno = textoSim.split("\n").filter((l) => /^\s*·\s+[A-Z_]{4,}\s/.test(l)).map((l) => l.trim()).slice(0, 40);
  const botPower = ajustes.bot_power ?? null;
  return {
    politica,
    politicaResumen: {
      enabled: politica.enabled, horario: politica.business_hours, etapas: politica.enabled_stages,
      primero_min: politica.first_delay_minutes, segundo_antes_de_cerrar_min: politica.second_before_close_minutes,
      max_en_ventana: politica.max_in_window_attempts, max_por_dia: politica.max_messages_per_day,
    },
    fases: ajustes.phase_config ?? null,
    botPower,
    botEncendido: botPower ? botPower.activo !== false : !/BOT_POWER_DEFAULT\s+(off|apagado|false|0)\b/i.test(textoSim),
    cupon: ajustes.coupon_config ?? "(sin fila: apagado por defecto)",
    guardian: ajustes.guardian_config ?? null,
    horarioDelLocal: ajustes.store_hours ?? null,
    plantillas,
    entornoCopiado: lineasEntorno,
  };
}

async function costoAi(sql, conversationId) {
  const TARIFAS = {
    "gpt-5.5": [5, 0.5, 30], "gpt-5.5-mini": [1, 0.1, 6], "gpt-5.4": [2.5, 0.25, 15],
    "gpt-5.4-mini": [0.75, 0.075, 4.5], "gpt-4o-mini": [0.15, 0.075, 0.6], "gpt-4o": [2.5, 1.25, 10],
  };
  const tarifa = (m) => TARIFAS[m] ?? TARIFAS[Object.keys(TARIFAS).find((k) => m.startsWith(k))] ?? TARIFAS["gpt-5.5"];
  const filas = await sql`
    select model, coalesce(call_type,'chat') as tipo, count(*)::int as runs,
      coalesce(sum(input_tokens),0)::bigint as inp, coalesce(sum(cached_input_tokens),0)::bigint as cached,
      coalesce(sum(output_tokens),0)::bigint as outp
    from ai_runs ${conversationId ? sql`where conversation_id = ${conversationId}` : sql``}
    group by 1, 2 order by 1, 2`;
  let usd = 0, runs = 0, inp = 0, outp = 0;
  const detalle = filas.map((f) => {
    const [ti, tc, to] = tarifa(f.model);
    const i = Number(f.inp), c = Math.min(Number(f.cached), i), o = Number(f.outp);
    const costo = ((i - c) * ti + c * tc + o * to) / 1e6;
    usd += costo; runs += f.runs; inp += i; outp += o;
    return { modelo: f.model, tipo: f.tipo, runs: f.runs, input: i, cacheado: c, output: o, usd: Math.round(costo * 10000) / 10000 };
  });
  return { runs, inputTokens: inp, outputTokens: outp, usd: Math.round(usd * 10000) / 10000, detalle };
}
