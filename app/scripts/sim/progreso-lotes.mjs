#!/usr/bin/env node
/**
 * TABLERO DE AVANCE DE LOS LOTES (24-nov-2026).
 *
 * Una página local que se actualiza sola mientras corren los lotes de
 * `lote-canary.mjs`: cuántas conversaciones lleva cada combinación y cada
 * corrida, cuál está corriendo ahora, nota de los dos jueces, gasto por
 * proveedor, tiempo estimado y —lo que faltó el 24-nov— un aviso rojo si
 * alguna clave se queda sin saldo.
 *
 *   node scripts/sim/progreso-lotes.mjs --logs <carpeta de logs> [--puerto 3399]
 *
 * Lee `mediciones/canary-<etiqueta>[-cN]-r<desde>-<hasta>.json` y los
 * `lote-<etiqueta>-<rango>.log` de la carpeta de logs. No escribe nada.
 */
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const MED = resolve(import.meta.dirname, "mediciones");
const LOGS = arg("logs", MED);
const PUERTO = Number(arg("puerto", 3399));
const CONFIGS = (arg("configs", "control=Control gpt-5.5;sonnet-haiku=Sonnet + Haiku;sonnet-mini=Sonnet + gpt mini")).split(";").map((p) => p.split("="));
const CORRIDAS = (arg("corridas", ",c2,c3")).split(",");
const POR_CORRIDA = Number(arg("casos", 50));
const SIN_SALDO = /no credits remaining|credit balance is too low|insufficient_quota/i;

function estado() {
  let vivos = "";
  try { vivos = execSync("pgrep -fl lote-canary.mjs || true", { encoding: "utf8" }); } catch { /* nadie corre */ }
  const archivos = existsSync(MED) ? readdirSync(MED) : [];
  const logs = existsSync(LOGS) ? readdirSync(LOGS) : [];
  const alertas = [];
  const filas = [];
  for (const [et, nombre] of CONFIGS) {
    CORRIDAS.forEach((suf, i) => {
      const id = suf ? `${et}-${suf}` : et;
      const casos = new Map();
      for (const f of archivos.filter((f) => new RegExp(`^canary-${id}-r\\d+-\\d+\\.json$`).test(f))) {
        try { for (const c of JSON.parse(readFileSync(resolve(MED, f), "utf8")).casos ?? []) casos.set(c.n, c); } catch { /* a medio escribir */ }
      }
      const xs = [...casos.values()];
      const usd = { anthropic: 0, openai: 0 };
      for (const c of xs) for (const [k, v] of Object.entries(c.costo?.porModelo ?? {})) usd[k.startsWith("claude") ? "anthropic" : "openai"] += v.usd ?? 0;
      const notas = (campo) => xs.map((c) => c[campo]?.nota).filter((x) => x != null);
      const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
      const danados = xs.filter((c) => SIN_SALDO.test(JSON.stringify(c.juez ?? {}) + JSON.stringify(c.juez_claude ?? {}) + JSON.stringify(c.turnos ?? [])));
      if (danados.length) alertas.push(`${nombre}, corrida ${i + 1}: ${danados.length} conversaciones dañadas por una clave sin saldo (casos ${danados.map((c) => c.n).join(", ")}).`);
      const lotes = logs.filter((f) => new RegExp(`^lote-${id}-\\d+-\\d+\\.log$`).test(f)).map((f) => {
        const rango = f.match(/-(\d+-\d+)\.log$/)[1];
        const texto = readFileSync(resolve(LOGS, f), "utf8");
        const actual = texto.split("\n").filter((l) => l.startsWith("▶")).pop() ?? "";
        const corriendo = vivos.includes(`--etiqueta ${id} --rango ${rango} `);
        if (corriendo && SIN_SALDO.test(texto.slice(-4000))) alertas.push(`${nombre}, corrida ${i + 1} (${rango}): el registro muestra una clave sin saldo AHORA.`);
        return { rango, corriendo, actual: actual.replace(/^▶\s*/, "").slice(0, 150), tocado: Math.round((Date.now() - statSync(resolve(LOGS, f)).mtimeMs) / 1000) };
      });
      filas.push({
        et, nombre, corrida: i + 1, hechas: xs.length - danados.length, total: POR_CORRIDA,
        corriendo: lotes.some((l) => l.corriendo), lotes: lotes.filter((l) => l.corriendo),
        notaGpt: media(notas("juez")), notaOpus: media(notas("juez_claude")),
        cotizaciones: xs.reduce((a, c) => a + (c.cotizaciones ?? 0), 0), visitas: xs.filter((c) => c.visita).length,
        fallas: xs.reduce((a, c) => a + (c.invariantes?.length ?? 0), 0),
        usd, segundos: xs.reduce((a, c) => a + (c.segundos ?? 0), 0),
      });
    });
  }
  const hechas = filas.reduce((a, f) => a + f.hechas, 0), total = filas.reduce((a, f) => a + f.total, 0);
  const segProm = hechas ? filas.reduce((a, f) => a + f.segundos, 0) / hechas : 150;
  const enParalelo = filas.reduce((a, f) => a + f.lotes.length, 0);
  // Lo que falta SOLO en las filas que están corriendo, repartido entre sus lotes.
  const faltanAhora = filas.filter((f) => f.corriendo).reduce((a, f) => a + (f.total - f.hechas), 0);
  return {
    ahora: new Date().toISOString(), filas, alertas, hechas, total, enParalelo,
    etaMin: enParalelo ? Math.round((faltanAhora * segProm) / enParalelo / 60) : null,
    usd: { anthropic: filas.reduce((a, f) => a + f.usd.anthropic, 0), openai: filas.reduce((a, f) => a + f.usd.openai, 0) },
  };
}

const PAGINA = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Avance de los lotes</title>
<style>
  :root { --bg:#f6f5f2; --card:#fff; --fg:#1c1b19; --fg2:#5d5a55; --line:#e3e0da; --ok:#1b8f63; --run:#2a78d6; --bad:#c8102e; --track:#ebe8e2 }
  @media (prefers-color-scheme: dark) { :root { --bg:#151412; --card:#1e1d1a; --fg:#f0eee9; --fg2:#a8a49c; --line:#33312d; --ok:#35b888; --run:#5b9cf0; --bad:#ff5a6e; --track:#2b2925 } }
  * { box-sizing:border-box } body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.45 -apple-system,system-ui,sans-serif; font-variant-numeric:tabular-nums }
  main { max-width:860px; margin:0 auto; padding:24px 16px 48px }
  h1 { font-size:22px; margin:0 0 2px } .sub { color:var(--fg2); font-size:13px; margin:0 0 18px }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:14px }
  .barra { height:14px; background:var(--track); border-radius:99px; overflow:hidden } .barra > i { display:block; height:100%; background:var(--ok); border-radius:99px; transition:width .6s }
  .barra.corre > i { background:var(--run) } .barra.fina { height:8px }
  .gran { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px } .gran b { font-size:28px }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin-top:14px }
  .tile { border:1px solid var(--line); border-radius:10px; padding:9px 11px } .tile .l { font-size:12px; color:var(--fg2) } .tile .n { font-size:18px; font-weight:600 }
  h2 { font-size:16px; margin:0 0 10px } .fila { padding:10px 0; border-top:1px solid var(--line) } .fila:first-of-type { border-top:0; padding-top:0 }
  .cab { display:flex; justify-content:space-between; gap:8px; margin-bottom:5px; font-size:14px } .cab span { color:var(--fg2) }
  .det { font-size:12.5px; color:var(--fg2); margin-top:5px } .ahora { font-size:12.5px; color:var(--run); margin-top:3px }
  .pill { font-size:11px; padding:1px 7px; border-radius:99px; border:1px solid currentColor; margin-left:6px } .p-ok { color:var(--ok) } .p-run { color:var(--run) } .p-esp { color:var(--fg2) }
  .alerta { border-color:var(--bad); color:var(--bad); font-weight:600 } .alerta p { margin:4px 0; font-weight:400 }
</style>
<main>
  <h1>Avance de los lotes</h1><p class="sub" id="sub">cargando…</p>
  <div id="alertas"></div>
  <section class="card"><div class="gran"><span>Conversaciones terminadas</span><b id="pct">–</b></div><div class="barra" id="bt"><i style="width:0"></i></div><div class="tiles" id="tiles"></div></section>
  <div id="configs"></div>
  <p class="sub">Se actualiza sola cada 5 segundos. Nota = promedio de 0 a 10 de cada juez. Las fallas técnicas son invariantes rotos (el bot no contestó, quedó sin revisar, etc.).</p>
</main>
<script>
const f = (x, d = 2) => x == null ? "–" : x.toFixed(d).replace(".", ",");
async function pinta() {
  let e; try { e = await (await fetch("estado.json", { cache: "no-store" })).json(); } catch { document.getElementById("sub").textContent = "sin conexión con el tablero…"; return; }
  document.getElementById("sub").textContent = "actualizado " + new Date(e.ahora).toLocaleTimeString() + (e.enParalelo ? " · " + e.enParalelo + " simuladores corriendo" : " · nada corriendo ahora");
  document.getElementById("alertas").innerHTML = e.alertas.length ? '<section class="card alerta">⚠ Hay un problema<br>' + e.alertas.map((a) => "<p>" + a + "</p>").join("") + "</section>" : "";
  document.getElementById("pct").textContent = e.hechas + " de " + e.total + " (" + Math.round(100 * e.hechas / e.total) + " %)";
  const bt = document.getElementById("bt"); bt.className = "barra" + (e.enParalelo ? " corre" : ""); bt.firstChild.style.width = (100 * e.hechas / e.total) + "%";
  document.getElementById("tiles").innerHTML = [
    ["Falta (lo que corre ahora)", e.etaMin == null ? "–" : "~" + e.etaMin + " min"],
    ["Gasto Anthropic", "$" + f(e.usd.anthropic)], ["Gasto OpenAI", "$" + f(e.usd.openai)],
    ["Simuladores", e.enParalelo],
  ].map(([l, n]) => '<div class="tile"><div class="l">' + l + '</div><div class="n">' + n + "</div></div>").join("");
  const porConfig = {}; for (const r of e.filas) (porConfig[r.nombre] ??= []).push(r);
  document.getElementById("configs").innerHTML = Object.entries(porConfig).map(([nombre, rs]) => {
    const h = rs.reduce((a, r) => a + r.hechas, 0), t = rs.reduce((a, r) => a + r.total, 0);
    const usd = rs.reduce((a, r) => a + r.usd.anthropic + r.usd.openai, 0);
    return '<section class="card"><h2>' + nombre + ' <span style="font-weight:400;color:var(--fg2);font-size:13px">· ' + h + " de " + t + (h ? " · $" + f(usd / h, 3) + " por conversación" : "") + "</span></h2>" + rs.map((r) => {
      const est = r.hechas >= r.total ? ['p-ok', 'lista'] : r.corriendo ? ['p-run', 'corriendo'] : ['p-esp', r.hechas ? 'en pausa' : 'en espera'];
      return '<div class="fila"><div class="cab"><div>Corrida ' + r.corrida + '<span class="pill ' + est[0] + '">' + est[1] + "</span></div><span>" + r.hechas + " / " + r.total + '</span></div><div class="barra fina' + (r.corriendo ? " corre" : "") + '"><i style="width:' + (100 * r.hechas / r.total) + '%"></i></div>'
        + (r.hechas ? '<div class="det">nota juez gpt ' + f(r.notaGpt) + " · juez Opus " + f(r.notaOpus) + " · " + r.cotizaciones + " cotizaciones · " + r.visitas + " visitas · " + r.fallas + " fallas técnicas · $" + f(r.usd.anthropic + r.usd.openai) + "</div>" : "")
        + r.lotes.map((l) => '<div class="ahora">▶ ' + l.actual + "</div>").join("") + "</div>";
    }).join("") + "</section>";
  }).join("");
}
pinta(); setInterval(pinta, 5000);
</script></html>`;

createServer((req, res) => {
  if (req.url.startsWith("/estado.json")) {
    let cuerpo; try { cuerpo = JSON.stringify(estado()); } catch (e) { cuerpo = JSON.stringify({ error: String(e) }); }
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(cuerpo);
  } else { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(PAGINA); }
}).listen(PUERTO, "127.0.0.1", () => console.log(`Tablero de lotes en http://127.0.0.1:${PUERTO}`));
