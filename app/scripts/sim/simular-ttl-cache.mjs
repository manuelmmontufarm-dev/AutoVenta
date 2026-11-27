#!/usr/bin/env node
/**
 * ¿Cuánto cuesta el prefijo fijo del vendedor (herramientas + system) con cada
 * TTL y cada forma de armar la clave? Reproduce el tráfico real de producción.
 *
 * Entrada: CSV de ai_runs (solo lectura) con
 *   epoch,latency_ms,conversation_id,stage,fase,iterations,input,cached,write,output
 * Salida: lecturas/escrituras simuladas del prefijo y $ por turno.
 *
 *   node scripts/sim/simular-ttl-cache.mjs prod.csv
 *
 * Precios Claude Sonnet 5.5 por millón: entrada $2, lectura $0,10, escritura
 * 5 min $2,50 (1,25×), escritura 1 h $4 (2×).
 */
import { readFileSync } from "node:fs";

// Tamaño del prefijo por fase (count_tokens, scripts/sim/prefijo-cache-vendedor.ts).
const PREFIJO = { nuevo: 7206, medida_confirmada: 7466, seleccionando: 8122, cotizacion_enviada: 8417, seguimiento_venta: 8417 };
const filas = readFileSync(process.argv[2], "utf8").trim().split("\n").map((l) => {
  const [t, lat, conv, stage, fase, it, inp, rd, wr, out] = l.split(",");
  return { inicio: Number(t) - Number(lat) / 1000, conv, stage, fase, it: Number(it), inp: +inp, rd: +rd, wr: +wr, out: +out };
});

function simular(clave, ttlMin) {
  const vivo = new Map();
  let lecturas = 0;
  let escrituras = 0;
  let usd = 0;
  let aciertos = 0;
  for (const f of filas) {
    const k = clave(f);
    const S = PREFIJO[f.fase] ?? 7500;
    const vence = vivo.get(k);
    const acierto = vence !== undefined && f.inicio <= vence;
    if (acierto) {
      aciertos += 1;
      lecturas += S;
      usd += (S * 0.10) / 1e6;
    } else {
      escrituras += S;
      usd += (S * (ttlMin === 60 ? 4.0 : 2.5)) / 1e6;
    }
    // Las rondas siguientes del turno leen el prefijo (mismo costo en todos los escenarios).
    usd += ((f.it - 1) * S * 0.10) / 1e6;
    vivo.set(k, f.inicio + ttlMin * 60);
  }
  return { aciertos, lecturas, escrituras, usd };
}

const escenarios = [
  ["hoy: clave fase+etapa guardada, 5 min", (f) => `${f.fase}|${f.stage}`, 5],
  ["(a) clave solo fase, 5 min", (f) => f.fase, 5],
  ["(b) fase+etapa guardada, 1 h", (f) => `${f.fase}|${f.stage}`, 60],
  ["(a)+(b) solo fase, 1 h", (f) => f.fase, 60],
];
const dias = (filas.at(-1).inicio - filas[0].inicio) / 86400;
console.log(`${filas.length} turnos en ${dias.toFixed(2)} días`);
const base = simular(escenarios[0][1], escenarios[0][2]);
for (const [nombre, clave, ttl] of escenarios) {
  const r = simular(clave, ttl);
  console.log(`${nombre.padEnd(40)} aciertos ${String(r.aciertos).padStart(3)}/${filas.length}  `
    + `escrito ${(r.escrituras / 1e6).toFixed(2)} M  leído ${(r.lecturas / 1e6).toFixed(2)} M  `
    + `$${r.usd.toFixed(2)}  ($${(r.usd / filas.length).toFixed(4)}/turno, ahorro $${(((base.usd - r.usd) / dias) * 30).toFixed(2)}/mes)`);
}
// Validación del modelo contra lo medido: llamadas de una ronda con lectura > 0.
const unaRonda = filas.filter((f) => f.it === 1);
console.log(`medido en producción: llamadas de 1 ronda con lectura del prefijo ${unaRonda.filter((f) => f.rd > 0).length}/${unaRonda.length}; `
  + `escritura total $${((filas.reduce((s, f) => s + f.wr, 0) * 2.5) / 1e6).toFixed(2)}`);
