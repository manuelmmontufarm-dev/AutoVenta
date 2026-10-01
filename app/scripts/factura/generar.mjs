#!/usr/bin/env node
/**
 * Baja de producción las dos pre-facturas de un mes (IA y mantenimiento) en el
 * formato de la contadora. Las mismas salen solas por WhatsApp al dueño el día
 * 1 (`services/prefacturaMensual.ts`); esto es para tenerlas en disco o pedir
 * un mes viejo.
 *
 *   node app/scripts/factura/generar.mjs                 # mes anterior (el que acaba de cerrar)
 *   node app/scripts/factura/generar.mjs --period 2026-09
 *   node app/scripts/factura/generar.mjs --enviar        # además, las reenvía por WhatsApp
 *
 * El PDF lo arma el servidor (`render/prefacturaPdf.ts`): una sola fuente para
 * el formato. Necesita ADMIN_KEY y OWNER_KEY; si no están en el entorno se
 * leen de Railway (entorno Depot_Tire). Los archivos quedan en `facturas/` en
 * la raíz del checkout principal (ignorado por git).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BILLING_URL ?? "https://autoventa-depottire.up.railway.app";

const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

function raizPrincipal() {
  const comun = execFileSync("git", ["-C", AQUI, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
  return dirname(comun);
}
const outDir = resolve(arg("--out") ?? join(raizPrincipal(), "facturas"));

function mesAnterior() {
  const [y, m] = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" }).slice(0, 7).split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
const period = arg("--period") ?? mesAnterior();
if (!/^\d{4}-\d{2}$/.test(period)) {
  console.error(`Periodo inválido: ${period} (usa YYYY-MM)`);
  process.exit(1);
}

let railway = null;
function clave(nombre) {
  if (process.env[nombre]) return process.env[nombre];
  railway ??= execFileSync("railway", ["variables", "--environment", "Depot_Tire", "--service", "AutoVenta", "--kv"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const linea = railway.split("\n").find((l) => l.startsWith(`${nombre}=`));
  if (!linea) throw new Error(`No encontré ${nombre} en Railway (Depot_Tire/AutoVenta). Pasala por entorno.`);
  return linea.slice(nombre.length + 1).trim();
}
const headers = { "x-admin-key": clave("ADMIN_KEY"), "x-owner-key": clave("OWNER_KEY") };

mkdirSync(outDir, { recursive: true });
for (const tipo of ["ia", "mantenimiento"]) {
  const res = await fetch(`${BASE_URL}/api/hub/billing/${period}/prefactura/${tipo}`, { headers });
  if (!res.ok) throw new Error(`${tipo}: el servidor respondió ${res.status} ${await res.text()}`);
  const nombre = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `prefactura-depot-${period}-${tipo}.pdf`;
  writeFileSync(join(outDir, nombre), Buffer.from(await res.arrayBuffer()));
  console.log(join(outDir, nombre));
}

if (args.includes("--enviar")) {
  const res = await fetch(`${BASE_URL}/api/hub/billing/prefacturas/enviar`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ period }),
  });
  console.log("WhatsApp:", JSON.stringify((await res.json()).resultado ?? res.status));
}
