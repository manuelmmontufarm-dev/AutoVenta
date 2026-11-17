#!/usr/bin/env node
/**
 * Preguntas de producto REALES (clientes de Depot, ago–nov 2026) contra el
 * simulador. Cada caso nace de una respuesta mala de producción; ver
 * docs/CONOCIMIENTO-LLANTAS.md §13. Imprime la respuesta del bot y una
 * comprobación mínima (lo que NO debe decir / lo que SÍ debe traer).
 *
 *   npm run sim            # en otra terminal
 *   node scripts/sim/conocimiento-producto.mjs [--caso lonas]
 */
import { correrEscenario, sql } from "./lib/corredor-t115.mjs";

const CASOS = [
  { id: "lonas", mensajes: ["Hola, necesito 4 llantas 265/70R17 para mi Hilux", "De cuántas lonas es?"],
    debe: /\d+\s*lonas/i, noDebe: /no tengo (?:verificad|ese dato|el dato)|entre 6 y 10|lo confirma el asesor/i },
  { id: "km_origen", mensajes: ["205/55R16", "Kenda es para cuantos kilómetros? y son chinas?"],
    debe: /68\.?500/, noDebe: /kenda[^.]{0,40}(?:es|son) (?:de origen )?chin|no (?:le )?puedo prometer/i },
  { id: "montana", mensajes: ["235/75R15", "cual es mejor para montaña y lastre?"],
    debe: /A\/T|R\/T|M\/T|all.?terrain|todo terreno/i, noDebe: /ZE310|KR20\b|KR203|R380|R330/ },
  { id: "alineacion", mensajes: ["195/65R15", "Y el balanceo y alineación es aparte?"],
    debe: /inclu/i, noDebe: /(?<!no )(?:es|van) aparte|servicios? adicional|se (?:lo )?confirma/i },
  { id: "bfg", mensajes: ["265/65R17", "la falken es mejor que una bf ko2?"],
    debe: /KO2|KO3|BFG|BFGoodrich/i, noDebe: /consulto con un asesor/i },
  { id: "diferencia", mensajes: ["Cual es la diferencia entre KR-50 y KR-28"],
    debe: /H\/T|asfalto|carretera/i, noDebe: /no (?:me sale|existe)|no tengo fichas/i },
  { id: "lluvia", mensajes: ["185/60R14", "Cual tiene más adherencia en lluvia"],
    debe: /lluvia|mojad/i, noDebe: /^Perfecto, la \d/i },
  { id: "dot", mensajes: ["245/75R16", "Que treadwear es? Y que Dot es?"],
    debe: /semana|[úu]ltimos 4|cuatro d[ií]gitos/i, noDebe: /no por chat/i },
];

const solo = process.argv.includes("--caso") ? process.argv[process.argv.indexOf("--caso") + 1] : null;
const resultados = [];
for (const caso of CASOS.filter((c) => !solo || c.id === solo)) {
  const r = await correrEscenario({ id: caso.id, mensajes: caso.mensajes });
  const ultimo = r.turnos.at(-1);
  const texto = (ultimo?.bot ?? []).map((b) => b.texto).join("\n---\n");
  const ok = caso.debe.test(texto) && !caso.noDebe.test(texto);
  resultados.push({ id: caso.id, ok, texto, guardian: ultimo?.guardian?.map((g) => g.verdict) });
  console.log(`\n${ok ? "✅" : "❌"} ${caso.id} — «${caso.mensajes.at(-1)}»\n${texto}\n  guardián: ${JSON.stringify(ultimo?.guardian?.map((g) => g.verdict))}`);
}
console.log(`\n${resultados.filter((r) => r.ok).length}/${resultados.length} casos bien`);
await sql.end();
