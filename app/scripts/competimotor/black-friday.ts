/**
 * BLACK FRIDAY DE COMPETIMOTOR (20-nov-2026): cruza la lista de Carlos con el
 * inventario de Fénix y escribe lo que el bot necesita.
 *
 *   NEGOCIO=mundillantas OPENAI_API_KEY=x DATABASE_URL=postgres://localhost/x \
 *     npx tsx scripts/competimotor/black-friday.ts <INV_NOV.XLS> "<LLANTAS BLACK FRIDAY.xlsx>" [--escribir]
 *
 * Sin `--escribir` solo imprime el informe. Con `--escribir` además deja:
 *   - src/negocio/politicas/mundillantasBlackFriday.ts (los códigos que cruzaron y su precio);
 *   - docs/clientes/competimotor-black-friday-2026.md (cruzadas, sin cruzar, ≥ P2 y el IVA).
 *
 * El cruce es `domain/cruceDePromocion.ts` (no adivina). Las llantas se leen
 * con el MISMO lector que usa el bot al subir el Excel en el panel.
 */
import { readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { filasDelArchivo, normalizarCatalogoSubido, MAPEO_CATALOGO_DEFECTO, numeroDelArchivo } from "../../src/services/fuentes/archivo.js";
import { normalizarFilaDeCatalogo } from "../../src/services/fuentes/sheets.js";
import { cruzarPromocion, filasDeLaHoja, type ResultadoDelCruce } from "../../src/domain/cruceDePromocion.js";
import type { CatalogItem } from "../../src/domain/catalog.js";

const [rutaInventario, rutaLista] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const escribir = process.argv.includes("--escribir");
if (!rutaInventario || !rutaLista) {
  console.error("Uso: black-friday.ts <inventario.xls> <lista-black-friday.xlsx> [--escribir]");
  process.exit(1);
}

// ── El inventario, como lo lee el bot ───────────────────────────────────────
const columnas = Object.values(MAPEO_CATALOGO_DEFECTO.columnas).filter((c): c is string => typeof c === "string");
const crudas = await filasDelArchivo(rutaInventario, readFileSync(rutaInventario), columnas);
const catalogo = normalizarCatalogoSubido(rutaInventario.split("/").pop()!, crudas, MAPEO_CATALOGO_DEFECTO);
type Articulo = CatalogItem & { sizeLabel: string | null; a: number; b: number; c: number; d: number | null };
const clave = (k: string) => k.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const crudaPorCodigo = new Map<string, Record<string, string>>();
for (const fila of crudas) {
  const limpia = Object.fromEntries(Object.entries(fila).map(([k, v]) => [clave(k), v]));
  if (limpia["codigo"]) crudaPorCodigo.set(String(limpia["codigo"]).trim(), limpia);
}
const articulos: Articulo[] = [];
for (const f of catalogo.filas) {
  const { item } = normalizarFilaDeCatalogo(f.cruda, "archivo", f.precios);
  if (!item) continue;
  const cruda = crudaPorCodigo.get(item.code);
  articulos.push({
    ...item,
    a: numeroDelArchivo(cruda?.["precio a"] ?? "") ?? NaN,
    b: numeroDelArchivo(cruda?.["precio b"] ?? "") ?? NaN,
    c: numeroDelArchivo(cruda?.["precio c"] ?? "") ?? NaN,
    d: numeroDelArchivo(cruda?.["precio d"] ?? ""),
  });
}

// ── La lista de Black Friday ────────────────────────────────────────────────
const libro = new ExcelJS.Workbook();
await libro.xlsx.readFile(rutaLista);
const hoja = libro.getWorksheet("Hoja1");
if (!hoja) throw new Error("La lista no tiene la hoja «Hoja1»");
const celdas: Array<{ fila: number; b: unknown; c: unknown; h: unknown }> = [];
hoja.eachRow({ includeEmpty: false }, (row, n) => {
  const v = (i: number) => {
    const x = row.getCell(i).value as unknown;
    return x && typeof x === "object" && "result" in (x as object) ? (x as { result: unknown }).result : x;
  };
  celdas.push({ fila: n, b: v(2), c: v(3), h: v(8) });
});
const filas = filasDeLaHoja(celdas);
const cruce = cruzarPromocion(filas, articulos);
const cruzadas = cruce.filter((r): r is Extract<ResultadoDelCruce<Articulo>, { estado: "cruzo" }> => r.estado === "cruzo");
const sinCruzar = cruce.filter((r): r is Extract<ResultadoDelCruce<Articulo>, { estado: "sin_cruzar" }> => r.estado === "sin_cruzar");

// ── ¿El precio de Black Friday trae IVA? ────────────────────────────────────
// Se compara cada precio con las listas de la MISMA llanta: si fuera sin IVA,
// el precio al cliente sería × 1,15.
const conP2 = cruzadas.filter((r) => Number.isFinite(r.articulo.b));
const cuenta = (pred: (r: (typeof conP2)[number]) => boolean) => conP2.filter(pred).length;
const iva = {
  n: conP2.length,
  bajoP3: cuenta((r) => r.fila.precio < r.articulo.c),
  bajoD: cuenta((r) => r.articulo.d !== null && r.fila.precio < r.articulo.d),
  conIvaBajoP3: cuenta((r) => r.fila.precio * 1.15 < r.articulo.c),
  conIvaEntreP3yP2: cuenta((r) => r.fila.precio * 1.15 >= r.articulo.c && r.fila.precio * 1.15 < r.articulo.b),
  conIvaSobreP2: cuenta((r) => r.fila.precio * 1.15 >= r.articulo.b),
  mediana: (xs: number[]) => { const s = [...xs].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; },
};
const ratioP2 = iva.mediana(conP2.map((r) => r.fila.precio / r.articulo.b));
const ratioP3 = iva.mediana(conP2.map((r) => r.fila.precio / r.articulo.c));
const ratioD = iva.mediana(conP2.filter((r) => r.articulo.d).map((r) => r.fila.precio / r.articulo.d!));

const dinero = (n: number) => `$${n.toFixed(2)}`;
const sinDescuento = cruzadas.filter((r) => r.fila.precio >= r.articulo.b);
// UN PRECIO RARO NO SE PRENDE SOLO: la mediana de la lista es ~81 % del P2; una
// fila por debajo de PISO_DE_REVISION × P2 (más de 40 % de descuento) parece un
// tipeo ($110 por una Continental AT50 de $242) y va a «revisar con Carlos»:
// el bot la sigue cotizando a P2 hasta que alguien la confirme.
const PISO_DE_REVISION = 0.6;
const paraRevisar = cruzadas.filter((r) => r.fila.precio < r.articulo.b && r.fila.precio < PISO_DE_REVISION * r.articulo.b);
const conDescuento = cruzadas.filter((r) => r.fila.precio < r.articulo.b && !paraRevisar.includes(r));
for (const r of [...cruzadas].sort((x, y) => x.fila.precio / x.articulo.b - y.fila.precio / y.articulo.b).slice(0, 8)) {
  console.error(`  ${(r.fila.precio / r.articulo.b).toFixed(2)} × P2 · fila ${r.fila.fila} ${r.fila.texto} → ${r.articulo.name}`);
}

// ── El informe ──────────────────────────────────────────────────────────────
const lineas: string[] = [];
lineas.push("# Black Friday Competimotor — cruce con el inventario (20-nov-2026)", "");
lineas.push(`Generado por \`app/scripts/competimotor/black-friday.ts\` con \`${rutaInventario.split("/").pop()}\` (Fénix, ${catalogo.fechaReporte ?? "sin fecha"}) y \`${rutaLista.split("/").pop()}\` (hoja «Hoja1»).`, "");
lineas.push(`- Filas con precio en la lista: **${filas.length}**`);
lineas.push(`- Cruzaron con UN artículo de Fénix: **${cruzadas.length}** → el bot les pone precio Black Friday a **${conDescuento.length}**; ${sinDescuento.length} con precio Black Friday ≥ P2 (sin descuento) y ${paraRevisar.length} con un descuento de más de ${Math.round((1 - PISO_DE_REVISION) * 100)} % que parece tipeo (se revisan con Carlos; hasta entonces van a P2).`);
lineas.push(`- Sin cruzar (no se adivinan; el bot las cotiza a P2 como siempre): **${sinCruzar.length}**`, "");
lineas.push("## ¿El precio de Black Friday viene con IVA?", "");
lineas.push(`De las ${iva.n} que cruzaron: el precio de la lista es, en la mediana, ${(ratioP2 * 100).toFixed(0)} % del P2, ${(ratioP3 * 100).toFixed(0)} % del P3 y ${(ratioD * 100).toFixed(0)} % del Precio D (mayorista).`);
lineas.push(`- Tal cual viene: ${iva.bajoP3} de ${iva.n} quedan por debajo del P3 y ${iva.bajoD} por debajo del Precio D.`);
lineas.push(`- Si se le sumara el 15 %: ${iva.conIvaBajoP3} quedarían bajo el P3, ${iva.conIvaEntreP3yP2} entre P3 y P2, y ${iva.conIvaSobreP2} en P2 o más (sin descuento).`, "");
lineas.push("**Conclusión: el precio de Black Friday YA trae IVA (es el precio final por llanta, con servicios).** "
  + "Tal cual, casi todas quedan por debajo de todas las listas (P2 con tarjeta y P3 en efectivo): es lo que se espera de una promoción. "
  + `Si fuera sin IVA, al sumarle el 15 % ${iva.conIvaEntreP3yP2 + iva.conIvaSobreP2} de ${iva.n} saldrían MÁS caras que el precio normal en efectivo (P3) y ${iva.conIvaSobreP2} más caras que con tarjeta: un Black Friday peor que un día cualquiera. `
  + "Además son precios redondos de vitrina (terminan en 9, 5 o 0: $39, $49, $199), mientras que Fénix guarda los sin-IVA como entero × 1,15 ($47,15 = $41 × 1,15). "
  + `Lo único que llama la atención: ${iva.bajoD} quedan por debajo del Precio D (mayorista); vale confirmarlo con Carlos, pero no cambia la conclusión.`, "");
lineas.push("## Cruzaron", "");
lineas.push("| Fila | Sección | Medida | Lista dice | Artículo de Fénix | Código | P2 | P3 | Black Friday | Ahorro c/u | Stock |");
lineas.push("|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of cruzadas) {
  const a = r.articulo;
  const marca = r.fila.precio >= a.b ? " ⚠️ ≥ P2" : paraRevisar.includes(r) ? " ⚠️ revisar" : "";
  lineas.push(`| ${r.fila.fila} | ${r.fila.seccion.includes("TODO EL MES") ? "todo el mes" : "jue–lun"} | ${r.medidaCanonica} | ${r.fila.texto}${r.aliasDeMarca ? ` (marca escrita «${r.aliasDeMarca}»)` : ""} | ${a.name} | \`${a.code}\` | ${dinero(a.b)} | ${dinero(a.c)} | **${dinero(r.fila.precio)}**${marca} | ${r.fila.precio < a.b ? dinero(a.b - r.fila.precio) : "—"} | ${a.stock} |`);
}
lineas.push("", "## Precio Black Friday ≥ P2 (ahí no hay descuento: el bot NO las marca como Black Friday)", "");
if (!sinDescuento.length) lineas.push("Ninguna.");
for (const r of sinDescuento) lineas.push(`- Fila ${r.fila.fila}: ${r.fila.texto} ${r.medidaCanonica} → ${r.articulo.name}: Black Friday ${dinero(r.fila.precio)} contra P2 ${dinero(r.articulo.b)}`);
lineas.push("", `## Precio raro: más de ${Math.round((1 - PISO_DE_REVISION) * 100)} % bajo el P2 (NO se prenden hasta que Carlos los confirme)`, "");
if (!paraRevisar.length) lineas.push("Ninguna.");
for (const r of paraRevisar) lineas.push(`- Fila ${r.fila.fila}: ${r.fila.texto} ${r.medidaCanonica} → ${r.articulo.name} (\`${r.articulo.code}\`): Black Friday ${dinero(r.fila.precio)} contra P2 ${dinero(r.articulo.b)} (${Math.round((1 - r.fila.precio / r.articulo.b) * 100)} % menos)`);
lineas.push("", "## Sin cruzar", "");
lineas.push("| Fila | Sección | Medida | Lista dice | Precio | Por qué |", "|---|---|---|---|---|---|");
const MOTIVO: Record<string, string> = {
  medida_no_reconocida: "medida que no se lee",
  sin_marca_en_la_medida: "esa marca no está en esa medida",
  sin_articulo: "ningún modelo calza",
  ambigua: "calza con más de una",
  codigo_repetido: "dos filas piden la misma llanta",
};
for (const r of sinCruzar) {
  lineas.push(`| ${r.fila.fila} | ${r.fila.seccion.includes("TODO EL MES") ? "todo el mes" : "jue–lun"} | ${r.fila.medida} | ${r.fila.texto} | ${dinero(r.fila.precio)} | ${MOTIVO[r.motivo]}: ${r.detalle.replace(/\|/g, "/")} |`);
}
const informe = lineas.join("\n") + "\n";
console.log(informe);

if (escribir) {
  const datos = conDescuento.map((r) => ({
    codigo: r.articulo.code,
    medida: r.medidaCanonica,
    lista: r.fila.texto,
    fila: r.fila.fila,
    precioConIva: r.fila.precio,
  }));
  const ts = `/**
 * BLACK FRIDAY DE COMPETIMOTOR — GENERADO, no se edita a mano.
 *
 * Sale de \`app/scripts/competimotor/black-friday.ts\` (20-nov-2026), que cruza
 * «LLANTAS BLACK FRIDAY.xlsx» de Carlos Romero con el inventario de Fénix del
 * mismo día. Solo las filas que cruzaron con UN artículo, cuyo precio es menor
 * que el P2 (con tarjeta) y no parece un tipeo (más de 40 % de descuento). Las
 * demás están en
 * \`docs/clientes/competimotor-black-friday-2026.md\`.
 *
 * \`precioConIva\`: el de la lista tal cual (el precio final por llanta, con
 * IVA y con servicios). Ver el informe para el porqué.
 */
export const LLANTAS_BLACK_FRIDAY: ReadonlyArray<{ codigo: string; medida: string; lista: string; fila: number; precioConIva: number }> = ${JSON.stringify(datos, null, 2)};
`;
  writeFileSync(new URL("../../src/negocio/politicas/mundillantasBlackFriday.ts", import.meta.url), ts);
  writeFileSync(new URL("../../../docs/clientes/competimotor-black-friday-2026.md", import.meta.url), informe);
  console.error(`✍️  ${datos.length} llantas en mundillantasBlackFriday.ts y el informe en docs/clientes/.`);
}
process.exit(0);
