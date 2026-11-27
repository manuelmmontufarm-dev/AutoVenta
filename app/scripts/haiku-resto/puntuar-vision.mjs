// Compara lecturas de visión contra la verdad etiquetada a ciegas, con el MISMO extractor del bot.
import { readFileSync } from "node:fs";
const [dir, ...archivos] = process.argv.slice(2);
const { extractTireSizes } = await import("../../dist/domain/tireSize.js");
const verdad = JSON.parse(readFileSync(`${dir}/fotos-verdad.json`, "utf8"));
const man = JSON.parse(readFileSync(`${dir}/fotos/manifiesto.json`, "utf8"));
const EXCLUIR = new Set(["86", "120"]); // 86 = captura de cotización, 120 = duplicado de 117
const clave = (s) => `${s.width}/${s.aspect ?? "-"}R${s.rim}`;
// El extractor del bot no lee medidas en pulgadas (33x12.50R20): se suman aparte.
const pulgadas = (t) => [...(t ?? "").matchAll(/(\d{2})\s*x\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*R\s*(\d{2})/gi)].map((m) => `${m[1]}x${Number(m[2].replace(",", "."))}R${m[3]}`);
const medidas = (t) => new Set([...extractTireSizes(t ?? "").map(clave), ...pulgadas(t)]);
function puntuar(nombre, lecturas) {
  const r = { nombre, conMedida: 0, exacta: 0, equivocada: 0, perdida: 0, sinMedida: 0, inventada: 0, fallos: [] };
  for (const [id, v] of Object.entries(verdad)) {
    if (EXCLUIR.has(id)) continue;
    const oro = medidas(v.medidas.join(" "));
    const texto = lecturas.get(String(id)) ?? "";
    const leidas = /FOTO_SIN_DATOS/.test(texto) ? new Set() : medidas(texto);
    if (oro.size) {
      r.conMedida++;
      const malas = [...leidas].filter((m) => !oro.has(m));
      if (malas.length) { r.equivocada++; r.fallos.push(`${id}: oro ${[...oro]} leyó «${texto.slice(0, 80)}»`); }
      else if (!leidas.size) { r.perdida++; r.fallos.push(`${id}: oro ${[...oro]} no leyó («${texto.slice(0, 60)}»)`); }
      else r.exacta++;
    } else {
      r.sinMedida++;
      if (leidas.size) { r.inventada++; r.fallos.push(`${id}: SIN medida y leyó «${texto.slice(0, 80)}»`); }
    }
  }
  return r;
}
const res = [puntuar("gpt-5.5 (producción)", new Map(man.map((f) => [String(f.id), f.prod_gpt55 ?? ""])))];
for (const a of archivos) {
  const d = JSON.parse(readFileSync(a, "utf8"));
  res.push(puntuar(a.split("/").pop().replace(/\.json$/, ""), new Map(d.map((x) => [String(x.id), x.texto ?? ""]))));
  res.at(-1).usd = d.reduce((s, x) => s + (x.costo ?? 0), 0); res.at(-1).msMed = d.map((x) => x.ms).sort((a, b) => a - b)[d.length >> 1];
}
for (const r of res) { console.log(`\n${r.nombre}: con medida ${r.conMedida} → exacta ${r.exacta}, equivocada ${r.equivocada}, no leída ${r.perdida} | sin medida ${r.sinMedida} → inventó ${r.inventada}${r.usd ? ` | USD ${r.usd.toFixed(4)} | ms mediana ${r.msMed}` : ""}`); for (const f of r.fallos) console.log("   ·", f); }
