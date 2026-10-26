/**
 * La promoción se puede presentar como «3x4» (26-oct-2026).
 *
 * Por el feriado Depot cambió «25 % de descuento» por «3x4» (paga 3, lleva 4).
 * Es la misma plata dicha de otra forma: el precio sigue saliendo del catálogo
 * (lista contra venta) y lo único que cambia es cómo se nombra. Lo que estas
 * pruebas cuidan:
 *
 * - en modo `porcentaje` nada cambia (la insignia sigue diciendo «−25%»);
 * - `3x4` solo se muestra si el descuento real está entre 24 % y 26 %: una
 *   llanta con −18 % rotulada «paga 3 lleva 4» sería prometer plata que no es;
 * - lo guardado hoy en `pieces_config` (sin `promocion`) se lee como porcentaje;
 * - la pieza, el texto de respaldo, la frase del ahorro, el vendedor y el
 *   Guardián dicen lo mismo, y el total no se mueve con el modo.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const {
  MODOS_PROMOCION, etiquetaDePromocion, advertenciaDe3x4, modoDePromocion, lineaDePromocionVigente, hechoDelAhorro,
  seMuestraComo3x4,
} = await import("../src/domain/promocion.js");
const { fraseDeAhorro, respuestaDelDescuento, ahorroDeLaCotizacion, cifrasDelCliente } = await import("../src/domain/ahorro.js");
const { PiecesConfigSchema } = await import("../src/services/settings.js");
const { optionsPosterDiaNoche, quotePosterDiaNoche } = await import("../src/render/diaNoche.js");
const { quotePoster, optionsPoster } = await import("../src/render/depotPosters.js");
const { resolveTheme } = await import("../src/render/depotDesign.js");
const { buildSingleQuoteMessageDetallado } = await import("../src/services/quoteMessages.js");
const { normalizeContificoProduct } = await import("../src/domain/catalog.js");

/** Todo el texto del árbol de nodos, para poder afirmar qué se ve. */
function textoDe(nodo: unknown): string {
  if (typeof nodo === "string") return nodo;
  if (Array.isArray(nodo)) return nodo.map(textoDe).join(" ");
  if (nodo && typeof nodo === "object") {
    const props = (nodo as { props?: { children?: unknown } }).props;
    return props ? textoDe(props.children) : "";
  }
  return "";
}

const linea = (unit: number, pvp: number | null, extra: Record<string, unknown> = {}) => ({
  brand: "KENDA", design: "KR628", sizeLabel: "265/70R16",
  loadSpeedLabel: "112T", loadSpeedTranslation: "1120 kg máx · 190 km/h máx",
  quantity: 4, unitConIva: unit, pvpConIva: pvp,
  availability: "available" as const, golpesMeses: 12, fabricaAnios: 5,
  photoUri: "data:image/png;base64,iVBORw0KGgo=",
  medidaExacta: true,
  ...extra,
});

// $172.55 contra $230.07: −25 % redondo, la de la plantilla del cliente.
const AL_25 = linea(172.55, 230.07);
// $188.66 contra $230.07: −18 %, otra promoción de marca.
const AL_18 = linea(188.66, 230.07);

describe("etiquetaDePromocion: los cuatro cuadrantes", () => {
  it("modo porcentaje con 25 % → la insignia de siempre", () => {
    const e = etiquetaDePromocion("porcentaje", 25);
    expect(e.clase).toBe("porcentaje");
    expect(e.grande).toBe("−25%");
    expect(e.renglones).toEqual(["DESCUENTO", "HOY"]);
    expect(e.frase).toBe("25 % de descuento ya aplicado");
  });

  it("modo 3x4 con 25 % → 3x4, paga 3 lleva 4", () => {
    const e = etiquetaDePromocion("3x4", 25);
    expect(e.clase).toBe("3x4");
    expect(e.grande).toBe("3x4");
    expect(e.renglones).toEqual(["PAGA 3", "LLEVA 4"]);
    expect(e.frase).toBe("promoción 3x4: paga 3 llantas y lleva 4");
  });

  it("modo 3x4 con 18 % → cae a porcentaje: no se rotula 3x4 lo que no es", () => {
    const e = etiquetaDePromocion("3x4", 18);
    expect(e.clase).toBe("porcentaje");
    expect(e.grande).toBe("−18%");
  });

  it("modo porcentaje con 18 % → porcentaje", () => {
    expect(etiquetaDePromocion("porcentaje", 18).grande).toBe("−18%");
  });

  it("el candado es [24, 26]: 24 y 26 entran, 23 y 27 caen a porcentaje", () => {
    expect(etiquetaDePromocion("3x4", 24).clase).toBe("3x4");
    expect(etiquetaDePromocion("3x4", 26).clase).toBe("3x4");
    expect(etiquetaDePromocion("3x4", 23).clase).toBe("porcentaje");
    expect(etiquetaDePromocion("3x4", 27).clase).toBe("porcentaje");
  });

  it("sin porcentaje (no hay precio de lista) nunca es 3x4", () => {
    expect(etiquetaDePromocion("3x4", null).clase).toBe("porcentaje");
  });

  it("un modo desconocido o vacío se lee como porcentaje", () => {
    expect(MODOS_PROMOCION).toEqual(["porcentaje", "3x4"]);
    expect(modoDePromocion(undefined)).toBe("porcentaje");
    expect(modoDePromocion({ modo: "3x4" })).toBe("3x4");
    expect(modoDePromocion("3x4")).toBe("3x4");
    expect(modoDePromocion({ modo: "2x1" })).toBe("porcentaje");
  });

  it("Ajustes avisa cuando la llanta no está en 24–26 %", () => {
    expect(advertenciaDe3x4(25)).toBeNull();
    expect(advertenciaDe3x4(18)).toBe("Esta llanta tiene −18 %: saldría como porcentaje, no como 3x4.");
    expect(advertenciaDe3x4(null)).toMatch(/sin precio de lista/i);
  });
});

describe("pieces_config", () => {
  it("lo guardado hoy (sin promocion) valida como porcentaje", () => {
    const viejo = PiecesConfigSchema.parse({ paleta: "depot", fuente: "exo", plantilla: "diaNoche", modo: "auto" });
    expect(viejo.promocion.modo).toBe("porcentaje");
  });

  it("acepta 3x4 y rechaza un modo inventado", () => {
    expect(PiecesConfigSchema.parse({ promocion: { modo: "3x4" } }).promocion.modo).toBe("3x4");
    expect(PiecesConfigSchema.safeParse({ promocion: { modo: "2x1" } }).success).toBe(false);
  });
});

describe("plantilla día y noche", () => {
  const cotizacion = (line: ReturnType<typeof linea>) =>
    textoDe(quotePosterDiaNoche({ number: "COT-1", dateLabel: "26/10/2026", line, total: line.unitConIva * 4 }, "noche"));
  const opciones = (lines: ReturnType<typeof linea>[]) =>
    textoDe(optionsPosterDiaNoche({ dateLabel: "26/10/2026", sizeLabel: "265/70R16", lines, cantidad: 4, medidaConocida: true }, "noche"));

  it("modo porcentaje: igual que hoy", () => {
    expect(cotizacion(AL_25)).toContain("−25%");
    expect(opciones([AL_25])).toContain("−25%");
  });

  it("modo 3x4: la insignia dice 3x4 · PAGA 3 LLEVA 4, en la cotización y en las opciones", () => {
    const enCotizacion = cotizacion({ ...AL_25, promocion: "3x4" });
    expect(enCotizacion).toContain("3x4");
    expect(enCotizacion).toContain("PAGA 3");
    expect(enCotizacion).toContain("LLEVA 4");
    expect(enCotizacion).not.toContain("−25%");
    // La plata no cambia con el modo.
    expect(enCotizacion).toContain("$690.20");
    expect(enCotizacion).toContain(cotizacion(AL_25).match(/Ahorra \$[\d.]+/)![0]);

    const enOpciones = opciones([{ ...AL_25, promocion: "3x4" }]);
    expect(enOpciones).toContain("3x4");
    expect(enOpciones).toContain("PAGA 3");
    expect(enOpciones).not.toContain("−25%");
  });

  it("modo 3x4 con una llanta al −18 %: sale como porcentaje", () => {
    const t = cotizacion({ ...AL_18, promocion: "3x4" });
    expect(t).toContain("−18%");
    expect(t).not.toContain("PAGA 3");
  });
});

describe("plantilla clásica", () => {
  const tema = resolveTheme("depot", "exo");
  const cotizacion = (line: ReturnType<typeof linea>) =>
    textoDe(quotePoster({ number: "COT-1", dateLabel: "26/10/2026", line, subtotal: 600, iva: 90.2, total: 690.2 }, tema));
  const opciones = (lines: ReturnType<typeof linea>[]) =>
    textoDe(optionsPoster({ dateLabel: "26/10/2026", sizeLabel: "265/70R16", lines, medidaConocida: true }, tema));

  it("modo porcentaje: igual que hoy", () => {
    expect(cotizacion(AL_25)).toContain("−25%");
    expect(opciones([AL_25])).toContain("−25%");
  });

  it("modo 3x4: 3x4 · PAGA 3 LLEVA 4 en vez de −25%", () => {
    const t = cotizacion({ ...AL_25, promocion: "3x4" });
    expect(t).toContain("3x4");
    expect(t).toContain("PAGA 3 LLEVA 4");
    expect(t).not.toContain("−25%");
    expect(t).toContain("ahorras $57.52 c/u");
    expect(opciones([{ ...AL_25, promocion: "3x4" }])).toContain("3x4 · PAGA 3 LLEVA 4");
  });

  it("modo 3x4 con −18 %: porcentaje", () => {
    expect(cotizacion({ ...AL_18, promocion: "3x4" })).toContain("−18%");
  });
});

describe("texto de respaldo", () => {
  const producto = normalizeContificoProduct({
    id: "KR628", codigo: "KR628", nombre: "265/70R16 112T KR628 KENDA", marca_nombre: "KENDA",
    estado: "A", tipo: "P", pvp1: 200.06, porcentaje_iva: 15, cantidad_stock: 8,
  }, "pvp1")!;
  const firmados = { unitarioConIva: 172.55, listaConIva: 230.07, total: 690.2 };

  it("porcentaje: −25% como hoy; 3x4: «3x4 · paga 3 lleva 4»; el total no cambia", () => {
    const hoy = buildSingleQuoteMessageDetallado({ product: producto, quantity: 4 }, "", undefined, firmados);
    const tres = buildSingleQuoteMessageDetallado({ product: producto, quantity: 4 }, "", undefined, firmados, "3x4");
    expect(hoy).toContain("−25%");
    expect(tres).toContain("3x4 · paga 3 lleva 4");
    expect(tres).not.toContain("−25%");
    expect(tres).toContain("$690.20");
    expect(hoy).toBe(buildSingleQuoteMessageDetallado({ product: producto, quantity: 4 }, "", undefined, firmados, "porcentaje"));
  });
});

describe("frase del ahorro, vendedor y Guardián", () => {
  const ahorro = ahorroDeLaCotizacion([{ quantity: 4, listPriceWithTax: 230.07, salePriceWithTax: 172.55 }])!;

  it("sin modo la frase es la de siempre", () => {
    expect(fraseDeAhorro(ahorro)).toBe("*25 %* de descuento ya aplicado, *$230.08* menos");
    expect(fraseDeAhorro({ ...ahorro, modo: "porcentaje" })).toBe(fraseDeAhorro(ahorro));
  });

  it("en 3x4 nombra la promoción y la misma plata", () => {
    expect(fraseDeAhorro({ ...ahorro, modo: "3x4" })).toBe("*promoción 3x4* (paga 3 llantas y lleva 4), *$230.08* menos");
  });

  it("en 3x4 con −18 % la frase sigue en porcentaje", () => {
    const otro = ahorroDeLaCotizacion([{ quantity: 4, listPriceWithTax: 230.07, salePriceWithTax: 188.66 }])!;
    expect(fraseDeAhorro({ ...otro, modo: "3x4" })).toContain("*18 %*");
  });

  it("la respuesta sobre el descuento en 3x4 dice que es la misma rebaja que el 25 %", () => {
    const r = respuestaDelDescuento({ ...ahorro, modo: "3x4" }, "¿tienen el 3x4?");
    expect(r).toContain("3x4");
    expect(r).toContain("25 %");
    expect(r).toContain("$230.08");
    expect(respuestaDelDescuento(ahorro, "cuanto es el descuento")).not.toContain("3x4");
  });

  it("el vendedor solo recibe la línea en modo 3x4", () => {
    expect(lineaDePromocionVigente("porcentaje")).toBeNull();
    const l = lineaDePromocionVigente("3x4")!;
    expect(l).toContain("PROMOCIÓN VIGENTE");
    expect(l).toContain("paga 3 llantas y lleva 4");
    expect(l).toMatch(/25 %.*lo mismo/);
  });

  it("el hecho del Guardián nombra el modo y deja confirmar que 3x4 y 25 % son lo mismo", () => {
    const porcentaje = hechoDelAhorro(ahorro, "porcentaje");
    expect(porcentaje).toContain("Ahorro de esa cotización: 25 % menos que el precio de lista");
    expect(porcentaje).not.toContain("3x4");
    const tres = hechoDelAhorro(ahorro, "3x4");
    expect(tres).toContain("promoción 3x4");
    expect(tres).toContain("$230.08");
    expect(tres).toContain("NO es error");
    // −18 % no se presenta como 3x4 ni siquiera ante el Guardián.
    const otro = ahorroDeLaCotizacion([{ quantity: 4, listPriceWithTax: 230.07, salePriceWithTax: 188.66 }])!;
    expect(hechoDelAhorro(otro, "3x4")).not.toContain("promoción 3x4");
  });
});

describe("revisión de la 3x4 (26-oct): cantidad, 24/26 %, «3x4» no es cifra", () => {
  const ahorro = ahorroDeLaCotizacion([{ quantity: 4, listPriceWithTax: 230.07, salePriceWithTax: 172.55 }])!;
  // $174.85 contra $230.07 redondea a −24 %: entra al candado, pero «el mismo 24 %»
  // contradice «paga 3 lleva 4», que es 25 % exacto.
  const al24 = ahorroDeLaCotizacion([{ quantity: 4, listPriceWithTax: 230.07, salePriceWithTax: 174.85 }])!;

  it("«paga 3 lleva 4» solo con múltiplos de 4: 2 → porcentaje; 4 y 8 → 3x4; sin cantidad → como antes", () => {
    expect(etiquetaDePromocion("3x4", 25, 2).clase).toBe("porcentaje");
    expect(etiquetaDePromocion("3x4", 25, 2).grande).toBe("−25%");
    expect(etiquetaDePromocion("3x4", 25, 4).clase).toBe("3x4");
    expect(etiquetaDePromocion("3x4", 25, 8).clase).toBe("3x4");
    expect(etiquetaDePromocion("3x4", 25).clase).toBe("3x4");
    expect(etiquetaDePromocion("3x4", 25, null).clase).toBe("3x4");
    expect(seMuestraComo3x4("3x4", 25, 6)).toBe(false);
  });

  it("la frase y la respuesta del ahorro usan la cantidad de la cotización", () => {
    const dos = ahorroDeLaCotizacion([{ quantity: 2, listPriceWithTax: 230.07, salePriceWithTax: 172.55 }])!;
    expect(fraseDeAhorro({ ...dos, modo: "3x4" })).toContain("*25 %*");
    expect(fraseDeAhorro({ ...dos, modo: "3x4" })).not.toContain("3x4");
    expect(respuestaDelDescuento({ ...dos, modo: "3x4" }, "cuanto es el descuento")).not.toContain("3x4");
    expect(hechoDelAhorro(dos, "3x4")).not.toContain("promoción 3x4");
    expect(fraseDeAhorro({ ...ahorro, modo: "3x4" })).toContain("3x4");
  });

  it("la pieza de cotización con 2 llantas sale en porcentaje (las dos plantillas)", () => {
    const dos = { ...AL_25, quantity: 2, promocion: "3x4" as const };
    const diaNoche = textoDe(quotePosterDiaNoche({ number: "COT-1", dateLabel: "26/10/2026", line: dos, total: 345.1 }, "noche"));
    expect(diaNoche).toContain("−25%");
    expect(diaNoche).not.toContain("PAGA 3");
    const clasica = textoDe(quotePoster({ number: "COT-1", dateLabel: "26/10/2026", line: dos, subtotal: 300, iva: 45.1, total: 345.1 }, resolveTheme("depot", "exo")));
    expect(clasica).toContain("−25%");
    expect(clasica).not.toContain("PAGA 3");
    const ocho = textoDe(quotePosterDiaNoche({ number: "COT-1", dateLabel: "26/10/2026", line: { ...dos, quantity: 8 }, total: 1380.4 }, "noche"));
    expect(ocho).toContain("PAGA 3");
  });

  it("el texto de respaldo con 2 llantas dice −25%, no «paga 3 lleva 4»", () => {
    const producto = normalizeContificoProduct({
      id: "KR628", codigo: "KR628", nombre: "265/70R16 112T KR628 KENDA", marca_nombre: "KENDA",
      estado: "A", tipo: "P", pvp1: 200.06, porcentaje_iva: 15, cantidad_stock: 8,
    }, "pvp1")!;
    const firmados = { unitarioConIva: 172.55, listaConIva: 230.07, total: 345.1 };
    const t = buildSingleQuoteMessageDetallado({ product: producto, quantity: 2 }, "", undefined, firmados, "3x4");
    expect(t).toContain("−25%");
    expect(t).not.toContain("paga 3 lleva 4");
  });

  it("con −24 % en 3x4 se dice «equivale al 25 %», nunca «el mismo 24 %»", () => {
    const r = respuestaDelDescuento({ ...al24, modo: "3x4" }, "¿tienen el 3x4?");
    expect(r).toContain("equivale al *25 %*");
    expect(r).not.toContain("24 %");
    const h = hechoDelAhorro(al24, "3x4");
    expect(h).toContain("equivale al 25 %");
    expect(h).not.toContain("24 %");
  });

  it("«3x4» no son cifras: no se leen como $3 y $4", () => {
    expect(cifrasDelCliente("¿la promo 3x4 ya está aplicada?").montos).toEqual([]);
    expect(cifrasDelCliente("el 3 x 4 son 230 menos").montos).toEqual([230]);
  });

  it("«¿la promo 3x4 ya está aplicada?» se confirma, no arranca con «Le aclaro:»", () => {
    const r = respuestaDelDescuento({ ...ahorro, modo: "3x4" }, "¿la promo 3x4 ya está aplicada?");
    expect(r).not.toMatch(/^Le aclaro/);
    expect(r).toMatch(/^Así es: /);
    expect(r).toContain("promoción 3x4");
    // En modo porcentaje no se confirma un 3x4 que no existe: se aclara.
    expect(respuestaDelDescuento(ahorro, "¿la promo 3x4 ya está aplicada?")).toMatch(/^Le aclaro: /);
  });

  it("la línea del vendedor no afirma una cotización que quizá no existe", () => {
    const l = lineaDePromocionVigente("3x4")!;
    expect(l).toContain("se aplica en la cotización");
    expect(l).not.toContain("ya está aplicado en su cotización");
  });
});
