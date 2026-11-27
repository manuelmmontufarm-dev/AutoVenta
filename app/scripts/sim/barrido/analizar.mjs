// Cruza los lotes del barrido con las notas de los jueces (a ciegas) y saca,
// por combinación: nota, % que cotiza, errores graves, $ y tokens por
// conversación, latencia del vendedor p50/p90, y la diferencia contra A
// pareada por caso (media ± σ de la media).
//
// uso: node analizar.mjs <dir-salida> <lote-base> <lote>... [--excluir 28]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const excluir = new Set((args.includes("--excluir") ? args[args.indexOf("--excluir") + 1] : "").split(",").filter(Boolean).map(Number));
const [dirJ, ...lotes] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--excluir");
const med = resolve(import.meta.dirname, "../mediciones");

// Las notas ya están en `c.juez` (ver inyectar-notas.mjs).

const GRAVES = new Set(["hecho_comercial_inventado", "stock_prometido", "precio_incorrecto", "medida_incorrecta", "tipo_negado_con_stock"]);
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => { const m = media(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : 0; };

const porLote = {};
for (const lote of lotes) {
  const casos = JSON.parse(readFileSync(resolve(med, `canary-${lote}.json`), "utf8")).casos.filter((c) => c.turnos && !excluir.has(c.n));
  // Un simulador reiniciado vuelca sus corridas en otro archivo (`runs-<lote>-parte1.json`).
  const runs = readdirSync(med).filter((f) => f === `runs-${lote}.json` || f.startsWith(`runs-${lote}-parte`))
    .flatMap((f) => JSON.parse(readFileSync(resolve(med, f), "utf8")));
  const vendedor = runs.filter((r) => r.call_type === "chat" && String(r.model).startsWith("claude-") && !r.error);
  const filas = casos.map((c) => {
    const pm = Object.entries(c.costo?.porModelo ?? {});
    const anth = pm.filter(([k]) => k.startsWith("claude-")).reduce((a, [, v]) => a + v.usd, 0);
    const vend = pm.filter(([k]) => k.startsWith("claude-") && k.endsWith("·chat"));
    const graves = c.turnos.flatMap((t) => t.guardian ?? [])
      .filter((g) => g.verdict && g.verdict !== "aprobar")
      .flatMap((g) => (g.findings ?? []).filter((f) => GRAVES.has(f.categoria) && f.severidad === "alta")).length;
    const v = c.juez?.nota ? c.juez : null;
    return {
      n: c.n, nota: v?.nota ?? null, fallas: v?.fallas ?? [], visibles: v?.errores_visibles ?? [],
      cotiza: (c.cotizaciones ?? 0) > 0, graves, invariantes: c.invariantes?.length ?? 0,
      usd_anthropic: anth, usd_total: c.costo?.usd ?? 0,
      tok_vend_entrada: vend.reduce((a, [, x]) => a + x.entrada, 0), tok_vend_salida: vend.reduce((a, [, x]) => a + x.salida, 0),
      segundos: c.segundos,
    };
  });
  porLote[lote] = { filas, latencias: vendedor.map((r) => r.latency_ms).filter(Number.isFinite) };
}

const base = lotes[0];
const resumen = lotes.map((lote) => {
  const { filas, latencias } = porLote[lote];
  const conNota = filas.filter((f) => f.nota != null);
  // Diferencia pareada contra la base, solo en casos que tienen nota en los dos.
  const difs = conNota.map((f) => [f, porLote[base].filas.find((b) => b.n === f.n && b.nota != null)]).filter(([, b]) => b).map(([f, b]) => f.nota - b.nota);
  const md = media(difs);
  return {
    lote, casos: filas.length, con_nota: conNota.length,
    nota: +media(conNota.map((f) => f.nota)).toFixed(2), nota_sd: +sd(conNota.map((f) => f.nota)).toFixed(2),
    dif_vs_base: lote === base ? null : +md.toFixed(2), dif_sigma: lote === base ? null : +(sd(difs) / Math.sqrt(difs.length)).toFixed(2),
    pct_cotiza: Math.round((100 * filas.filter((f) => f.cotiza).length) / filas.length),
    graves_guardian: filas.reduce((a, f) => a + f.graves, 0),
    convs_con_grave: filas.filter((f) => f.graves > 0).length,
    errores_visibles: conNota.reduce((a, f) => a + f.visibles.length, 0),
    nota_baja: conNota.filter((f) => f.nota <= 4).length,
    usd_anthropic_conv: +media(filas.map((f) => f.usd_anthropic)).toFixed(4),
    usd_total_conv: +media(filas.map((f) => f.usd_total)).toFixed(4),
    usd_anthropic_lote: +filas.reduce((a, f) => a + f.usd_anthropic, 0).toFixed(3),
    tok_vend_entrada_conv: Math.round(media(filas.map((f) => f.tok_vend_entrada))),
    tok_vend_salida_conv: Math.round(media(filas.map((f) => f.tok_vend_salida))),
    lat_vend_p50_ms: pct(latencias, 0.5), lat_vend_p90_ms: pct(latencias, 0.9),
    seg_conv_p50: pct(filas.map((f) => f.segundos), 0.5),
  };
});
const salida = { generado: new Date().toISOString(), excluidos: [...excluir], resumen, porLote };
writeFileSync(resolve(dirJ, "analisis.json"), JSON.stringify(salida, null, 1));
console.table(resumen.map(({ lote, con_nota, nota, dif_vs_base, dif_sigma, pct_cotiza, convs_con_grave, errores_visibles, nota_baja, usd_anthropic_conv, lat_vend_p50_ms, lat_vend_p90_ms }) =>
  ({ lote, con_nota, nota, dif_vs_base, dif_sigma, pct_cotiza, convs_con_grave, errores_visibles, nota_baja, usd_anthropic_conv, lat_vend_p50_ms, lat_vend_p90_ms })));
