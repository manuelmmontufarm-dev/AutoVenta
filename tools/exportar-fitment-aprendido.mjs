#!/usr/bin/env node
/**
 * Vuelca lo que el bot aprendió investigando medidas por vehículo
 * (tabla `vehicle_fitment_learned`, producción) en el formato de
 * `app/assets/aplicaciones-vehiculos.json`, para que Joaquín lo revise y lo
 * pase a la tabla del repo con la confianza que corresponda.
 *
 *   DATABASE_URL=... node tools/exportar-fitment-aprendido.mjs > aprendido.json
 *
 * Solo lectura. Las fichas salen con confianza "media" (nunca "alta": eso lo
 * decide una persona) y con la nota de dónde salieron y cuántas veces se usaron.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Falta DATABASE_URL"); process.exit(1); }
const sql = postgres(url, { max: 1, ssl: url.includes("railway") ? "require" : undefined });

const filas = await sql`
  select vehicle_label, make_key, model_key, year_key, sizes, candidatos, note, sources, provider, hits, updated_at
  from vehicle_fitment_learned order by hits desc, updated_at desc
`;
const capitalizar = (t) => t.replace(/\b\w/g, (c) => c.toUpperCase());
const medida = (m) => {
  const [w, rest] = m.split("/"); const [a, r] = (rest ?? "").split("R");
  const ancho = Number(w), perfil = Number(a), aro = Number(r);
  return Number.isFinite(ancho) && Number.isFinite(perfil) && Number.isFinite(aro)
    ? { medida: m, ancho, perfil, aro, diametro_mm: Math.round((aro * 25.4 + 2 * ancho * perfil / 100) * 10) / 10 }
    : { medida: m };
};
const aplicaciones = filas.map((f) => ({
  marca: capitalizar(f.make_key),
  modelo: capitalizar(f.model_key),
  anios: f.year_key ? `${f.year_key}-${f.year_key}` : "",
  medidas_de_fabrica: (f.sizes ?? []).map(medida),
  aros_de_fabrica: [...new Set((f.sizes ?? []).map((m) => medida(m).aro).filter(Boolean))].sort(),
  confianza: "media",
  verificado_contra_fuente: false,
  nota: `Aprendida por el bot (${f.provider}), usada ${f.hits} veces, última ${new Date(f.updated_at).toISOString().slice(0, 10)}. ${f.note ?? ""}`.trim(),
  fuentes: f.sources ?? [],
  candidatos: f.candidatos ?? [],
}));
console.log(JSON.stringify({ generado: new Date().toISOString(), total: aplicaciones.length, aplicaciones }, null, 2));
await sql.end();
