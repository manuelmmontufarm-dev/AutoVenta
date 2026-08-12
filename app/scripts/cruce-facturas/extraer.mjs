#!/usr/bin/env node
// Baja todos los documentos de clientes de Contifico y los deja crudos en disco.
// Se cachea porque son ~60 paginas y la API tarda ~4 s por pagina.
//
//   node scripts/cruce-facturas/extraer.mjs [--refrescar]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(AQUI, "datos", "documentos.json");

// La API v2 solo respeta tipo_registro. tipo_documento y las fechas las ignora,
// asi que el filtrado fino se hace aca abajo con los documentos ya en mano.
const BASE = process.env.CONTIFICO_BASE_URL ?? "https://api.contifico.com/sistema/api/v2";
const MAX_PAGINAS = 200;

function cargarEnv() {
  const ruta = path.join(AQUI, "..", "..", ".env");
  if (!fs.existsSync(ruta)) return;
  for (const linea of fs.readFileSync(ruta, "utf8").split("\n")) {
    if (!linea.includes("=") || linea.trim().startsWith("#")) continue;
    const i = linea.indexOf("=");
    const clave = linea.slice(0, i).trim();
    if (!process.env[clave]) process.env[clave] = linea.slice(i + 1).trim();
  }
}

async function traerPagina(apiKey, ruta, pagina) {
  const url = `${BASE}${ruta}${ruta.includes("?") ? "&" : "?"}page=${pagina}`;
  const ctrl = new AbortController();
  const corte = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: apiKey, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Contifico ${res.status} en ${ruta} pagina ${pagina}`);
    return await res.json();
  } finally {
    clearTimeout(corte);
  }
}

async function traerTodo(apiKey, ruta, etiqueta) {
  const filas = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
    const cuerpo = await traerPagina(apiKey, ruta, pagina);
    const lote = cuerpo.results ?? [];
    filas.push(...lote);
    process.stdout.write(`\r${etiqueta}: ${filas.length}/${cuerpo.count}`);
    if (!cuerpo.next || lote.length === 0) break;
  }
  process.stdout.write("\n");
  return filas;
}

async function main() {
  cargarEnv();
  const apiKey = process.env.CONTIFICO_API_KEY;
  if (!apiKey) throw new Error("Falta CONTIFICO_API_KEY");

  if (fs.existsSync(SALIDA) && !process.argv.includes("--refrescar")) {
    const cache = JSON.parse(fs.readFileSync(SALIDA, "utf8"));
    console.log(`Cache: ${cache.documentos.length} documentos (usa --refrescar para volver a bajar)`);
    return;
  }

  const documentos = await traerTodo(apiKey, "/documento/?tipo_registro=CLI", "Documentos");
  // El padron completo: incluye clientes registrados que todavia no tienen ni un
  // documento emitido. Sin esto no se puede distinguir "nunca le facturaron" de
  // "ni siquiera esta creado en Contifico".
  const personas = await traerTodo(apiKey, "/persona/", "Personas");

  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(
    SALIDA,
    JSON.stringify({ bajado: new Date().toISOString(), documentos, personas }, null, 0),
  );
  console.log(`Guardados ${documentos.length} documentos y ${personas.length} personas en ${SALIDA}`);
}

main().catch((err) => {
  console.error("Fallo la extraccion:", err.message);
  process.exit(1);
});
