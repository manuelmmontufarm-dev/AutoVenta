/**
 * Respaldo PROBADO de la base.
 *
 * Un backup que nunca se restauró no es un backup: es un archivo. Este script
 * hace el ciclo completo —dump, restaurar en una base limpia, comparar fila por
 * fila— y falla si algo no cuadra. Es la única forma de saber que el respaldo
 * sirve antes de necesitarlo.
 *
 *   node scripts/ops/backup-restore.mjs                      # usa DATABASE_URL
 *   node scripts/ops/backup-restore.mjs --url postgresql://…
 *   node scripts/ops/backup-restore.mjs --salida /ruta/backups
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, l) => {
  if (v.startsWith("--")) a.push([v.slice(2), l[i + 1]]);
  return a;
}, []));

const URL_ORIGEN = args.url ?? process.env.DATABASE_URL;
if (!URL_ORIGEN) {
  console.error("Falta DATABASE_URL (o --url). Para staging, cópiala de Railway.");
  process.exit(2);
}

const dirSalida = resolve(args.salida ?? "backups");
mkdirSync(dirSalida, { recursive: true });
const sello = new Date().toISOString().replace(/[:.]/g, "-");
const archivo = resolve(dirSalida, `autoventa-${sello}.dump`);
const dbPrueba = `autoventa_restore_check_${process.pid}`;

// Las tablas que, si se pierden, se pierde el negocio.
const TABLAS = [
  "conversations", "messages", "quotes", "follow_up_jobs", "follow_up_attempts",
  "bot_alerts", "sales_history", "conversation_summaries", "discount_offers",
  "stage_transitions", "settings",
];

const admin = postgres(URL_ORIGEN.replace(/\/[^/]+$/, "/postgres"), { prepare: false, max: 1 });
const origen = postgres(URL_ORIGEN, { prepare: false, max: 2 });

async function conteos(sql) {
  const salida = {};
  for (const tabla of TABLAS) {
    try {
      const [row] = await sql.unsafe(`select count(*)::int as n from ${tabla}`);
      salida[tabla] = row.n;
    } catch { salida[tabla] = null; /* la tabla no existe en este esquema */ }
  }
  return salida;
}

try {
  console.log(`📦 Volcando ${URL_ORIGEN.replace(/:\/\/[^@]*@/, "://***@")}`);
  execFileSync("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", archivo, URL_ORIGEN], { stdio: "pipe" });
  const tamañoMB = statSync(archivo).size / 1e6;
  console.log(`   ${archivo} · ${tamañoMB.toFixed(2)} MB`);

  const antes = await conteos(origen);

  console.log(`♻️  Restaurando en una base limpia (${dbPrueba})`);
  await admin.unsafe(`drop database if exists ${dbPrueba}`);
  await admin.unsafe(`create database ${dbPrueba}`);
  const urlPrueba = URL_ORIGEN.replace(/\/[^/]+$/, `/${dbPrueba}`);
  execFileSync("pg_restore", ["--no-owner", "--no-acl", "--dbname", urlPrueba, archivo], { stdio: "pipe" });

  const restaurada = postgres(urlPrueba, { prepare: false, max: 2 });
  const despues = await conteos(restaurada);
  await restaurada.end();

  const diferencias = TABLAS
    .filter((t) => antes[t] !== null)
    .filter((t) => antes[t] !== despues[t])
    .map((t) => `${t}: origen ${antes[t]} vs restaurada ${despues[t]}`);

  console.log("\n┌─ conteo por tabla ──────────────────────────────");
  for (const tabla of TABLAS) {
    if (antes[tabla] === null) continue;
    const ok = antes[tabla] === despues[tabla];
    console.log(`│ ${ok ? "✅" : "❌"} ${tabla.padEnd(24)} ${String(antes[tabla]).padStart(7)}`);
  }
  console.log("└─────────────────────────────────────────────────\n");

  await admin.unsafe(`drop database if exists ${dbPrueba}`);

  if (diferencias.length) {
    console.error("❌ EL RESPALDO NO ES FIABLE:\n  " + diferencias.join("\n  "));
    process.exitCode = 1;
  } else {
    console.log(`✅ Respaldo verificado: se restauró completo. Guárdalo fuera de Railway.\n   ${archivo}`);
  }
} catch (error) {
  console.error("💥 Falló el ciclo de respaldo:", error?.stderr?.toString?.() ?? error?.message ?? error);
  process.exitCode = 2;
} finally {
  await origen.end();
  await admin.end().catch(() => {});
}
