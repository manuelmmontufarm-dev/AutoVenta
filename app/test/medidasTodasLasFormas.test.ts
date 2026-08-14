/**
 * La prueba grande: las 153 medidas REALES del catálogo de Depot, cada una
 * escrita en todas las formas en que la gente las escribe por WhatsApp,
 * contra la búsqueda en escalera.
 *
 * Verifica los tres desenlaces que el negocio necesita distinguir:
 *  · SÍ HAY   → encuentra, y SIEMPRE en la medida pedida (nunca otra).
 *  · NO EN SU MEDIDA → el modelo existe, pero no en esa medida: lo dice y
 *    ofrece las medidas donde sí está.
 *  · NO LO MANEJAMOS → ni la medida ni el modelo: negativa honesta.
 *
 * El material es `assets/base_llantas_tipos.json`, los 385 SKUs que entregó
 * Depot, así que las medidas son las de verdad — no inventadas para el test.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const { buscarConEscalera, compactCatalogText, normalizeContificoProduct } =
  await import("../src/domain/catalog.js");

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");
interface Sku { codigo: string; marca: string; modelo: string; medida: string; descripcion?: string; stock?: number }
const skus: Sku[] = JSON.parse(readFileSync(path.join(ASSETS, "base_llantas_tipos.json"), "utf8")).skus ?? [];

const CATALOGO = skus
  .map((s) => normalizeContificoProduct({
    id: s.codigo, codigo: s.codigo,
    nombre: s.descripcion || `${s.medida} ${s.modelo}`,
    marca_nombre: s.marca, estado: "A", tipo: "P",
    pvp1: 150, pvp2: 200, porcentaje_iva: 15, cantidad_stock: s.stock ?? 8,
  }, "pvp1"))
  .filter((i): i is NonNullable<typeof i> => Boolean(i));

// La medida buena es la que el sistema deduce del NOMBRE de Contífico, no el
// campo `medida` de la base del cliente: ese venía mal en 6 familias
// («35*12.50R17» quedaba como «2.50R17»), justamente lo que se arregló hoy.
const MEDIDAS = [...new Set(CATALOGO.map((i) => i.sizeLabel).filter((m): m is string => Boolean(m)))];
const metricas = MEDIDAS.filter((m) => /^\d{3}\/\d{2}R\d{2}$/.test(m));
const flotacion = MEDIDAS.filter((m) => /^\d{2}X\d{1,2}(?:\.\d)?R\d{2}$/i.test(m));
const convencionales = MEDIDAS.filter((m) => /^\d{1,2}\.\d{2}R\d{2}$/.test(m));
const comerciales = MEDIDAS.filter((m) => /^\d{3}R\d{2}$/.test(m));

/** Las formas en que la gente escribe una medida métrica por WhatsApp. */
function formasMetricas(medida: string): string[] {
  const [, ancho, perfil, aro] = medida.match(/^(\d{3})\/(\d{2})R(\d{2})$/)!;
  return [
    medida,                                  // 265/70R17
    medida.toLowerCase(),                    // 265/70r17
    `${ancho}/${perfil}/${aro}`,             // 265/70/17
    `${ancho}/${perfil} ${aro}`,             // 265/70 17
    `${ancho} ${perfil} ${aro}`,             // 265 70 17
    `${ancho}-${perfil}-${aro}`,             // 265-70-17
    `${ancho}/${perfil} R${aro}`,            // 265/70 R17
    `${ancho}/${perfil} Rin${aro}`,          // 265/70 Rin17
    `${ancho}/${perfil} rin ${aro}`,         // 265/70 rin 17
    `${ancho}/${perfil} aro ${aro}`,         // 265/70 aro 17
    `LT${medida}`,                           // LT265/70R17
    `tienen ${ancho}/${perfil}/${aro}`,      // con relleno de conversación
    `precio de la ${ancho}/${perfil}R${aro}`,
    `busco llantas ${ancho}/${perfil} rin ${aro} por favor`,
  ];
}

function formasFlotacion(medida: string): string[] {
  const [, dia, sec, aro] = medida.match(/^(\d{2})X(\d{1,2}(?:\.\d+)?)R(\d{2})$/i)!;
  const conCero = sec.includes(".") ? `${sec}0` : sec;      // 12.5 → 12.50
  const sinPunto = conCero.replace(".", "");                 // 12.50 → 1250
  return [
    medida, medida.toLowerCase(),
    `${dia}x${sec}r${aro}`, `${dia}X${sec} R${aro}`, `${dia}x${sec}-${aro}`,
    `${dia}x${conCero}R${aro}`,      // con el cero de más
    `${dia}*${conCero}R${aro}`,      // con asterisco, como lo trae Contífico
    `${dia}X${sinPunto}R${aro}`,     // sin punto decimal
    `tienen ${dia}x${sec}r${aro}`,
  ];
}

/** «7.00R15» de camión liviano, como la escribe la gente. */
function formasConvencionales(medida: string): string[] {
  const [, ancho, aro] = medida.match(/^(\d{1,2}\.\d{2})R(\d{2})$/)!;
  return [medida, medida.toLowerCase(), `${ancho} R${aro}`, `${ancho}r${aro}`, `tienen ${ancho}R${aro}`];
}

/** «195R15C» comercial: ancho y aro, sin perfil. */
function formasComerciales(medida: string): string[] {
  const [, ancho, aro] = medida.match(/^(\d{3})R(\d{2})$/)!;
  return [medida, medida.toLowerCase(), `${ancho}R${aro}C`, `${ancho} R${aro}`, `tienen ${ancho}r${aro}`];
}

const enLaMedida = (medida: string, consulta: string) => {
  const r = buscarConEscalera(CATALOGO, consulta, 8);
  const objetivo = compactCatalogText(medida);
  return {
    encontro: r.resultados.length > 0,
    todasSonDeLaMedida: r.resultados.every(
      (i) => i.sizeLabel && compactCatalogText(i.sizeLabel) === objetivo,
    ),
  };
};

describe("las 153 medidas reales de Depot, en todas las formas de escribirlas", () => {
  it(`hay material real: ${MEDIDAS.length} medidas de ${skus.length} SKUs`, () => {
    expect(CATALOGO.length).toBeGreaterThan(300);
    expect(metricas.length).toBeGreaterThan(100);
    expect(flotacion.length).toBeGreaterThan(3);
    expect(convencionales.length).toBeGreaterThan(0);
    expect(comerciales.length).toBeGreaterThan(0);
  });

  it("NINGÚN SKU del catálogo real se queda sin medida", () => {
    const sinMedida = CATALOGO.filter((i) => !i.sizeLabel).map((i) => i.name);
    expect(sinMedida.slice(0, 10)).toEqual([]);
  });

  it("SÍ HAY: las convencionales de camión (7.00R15) y las comerciales (195R15)", () => {
    const fallos: string[] = [];
    for (const medida of convencionales) {
      for (const consulta of formasConvencionales(medida)) {
        const { encontro, todasSonDeLaMedida } = enLaMedida(medida, consulta);
        if (!encontro || !todasSonDeLaMedida) fallos.push(`${medida} ← «${consulta}»`);
      }
    }
    for (const medida of comerciales) {
      for (const consulta of formasComerciales(medida)) {
        const { encontro, todasSonDeLaMedida } = enLaMedida(medida, consulta);
        if (!encontro || !todasSonDeLaMedida) fallos.push(`${medida} ← «${consulta}»`);
      }
    }
    expect(fallos.slice(0, 20)).toEqual([]);
  });

  it("SÍ HAY: toda medida métrica se encuentra escrita de las 14 formas, y siempre en su medida", () => {
    const fallos: string[] = [];
    for (const medida of metricas) {
      for (const consulta of formasMetricas(medida)) {
        const { encontro, todasSonDeLaMedida } = enLaMedida(medida, consulta);
        if (!encontro) fallos.push(`${medida} ← «${consulta}» NO ENCUENTRA`);
        else if (!todasSonDeLaMedida) fallos.push(`${medida} ← «${consulta}» devolvió OTRA medida`);
      }
    }
    expect(fallos.slice(0, 20)).toEqual([]);
  });

  it("SÍ HAY: las de flotación también, en sus 6 formas", () => {
    const fallos: string[] = [];
    for (const medida of flotacion) {
      for (const consulta of formasFlotacion(medida)) {
        const { encontro, todasSonDeLaMedida } = enLaMedida(medida, consulta);
        if (!encontro) fallos.push(`${medida} ← «${consulta}» NO ENCUENTRA`);
        else if (!todasSonDeLaMedida) fallos.push(`${medida} ← «${consulta}» devolvió OTRA medida`);
      }
    }
    expect(fallos.slice(0, 20)).toEqual([]);
  });

  it("SÍ HAY: medida + marca/modelo juntos siguen dando esa medida", () => {
    const fallos: string[] = [];
    for (const item of CATALOGO.slice(0, 150)) {
      const medida = item.sizeLabel!;
      const consultas = [
        `${item.brand} ${item.design} ${medida}`,
        `${item.design} ${medida.replace(/^(\d{3})\/(\d{2})R(\d{2})$/, "$1/$2/$3")}`,
        `tienen ${item.brand.toLowerCase()} ${item.design.toLowerCase()} ${medida.toLowerCase()}`,
      ];
      for (const consulta of consultas) {
        const { encontro, todasSonDeLaMedida } = enLaMedida(medida, consulta);
        if (!encontro || !todasSonDeLaMedida) fallos.push(`«${consulta}» → ${encontro ? "otra medida" : "nada"}`);
      }
    }
    expect(fallos.slice(0, 20)).toEqual([]);
  });
});

describe("los otros dos desenlaces: no en su medida, y no lo manejamos", () => {
  it("NO EN SU MEDIDA: el modelo existe en otras — se ofrecen, nunca como si fueran la suya", () => {
    // La Wildpeak A/T4W no existe en 155/70R12 (medida que Depot no maneja).
    const r = buscarConEscalera(CATALOGO, "falken wildpeak at4 155/70R12", 8);
    expect(r.sinCoincidenciaExacta).toBe(true);
    expect(r.resultados).toEqual([]);                    // jamás pasar otra medida como resultado
    expect(r.modeloEnOtrasMedidas.length).toBeGreaterThan(0);
    expect(r.modeloEnOtrasMedidas.every((i) => /WILDPEAK/i.test(i.design))).toBe(true);
  });

  it("NO ESE MODELO, PERO SÍ SU MEDIDA: se ofrece lo que hay en su medida", () => {
    const medida = metricas[0];
    const r = buscarConEscalera(CATALOGO, `michelin primacy ${medida}`, 8);
    expect(r.sinCoincidenciaExacta).toBe(true);
    expect(r.enEsaMedida.length).toBeGreaterThan(0);
    expect(r.enEsaMedida.every((i) => compactCatalogText(i.sizeLabel ?? "") === compactCatalogText(medida))).toBe(true);
  });

  it("NO LO MANEJAMOS: ni modelo ni medida — las dos listas vacías, negativa honesta", () => {
    const r = buscarConEscalera(CATALOGO, "michelin primacy 155/70R12", 8);
    expect(r.sinCoincidenciaExacta).toBe(true);
    expect(r.resultados).toEqual([]);
    expect(r.enEsaMedida).toEqual([]);
    expect(r.modeloEnOtrasMedidas).toEqual([]);
  });
});
