import { describe, expect, it } from "vitest";

/**
 * «SÍ TENEMOS» — familia F-01 de la auditoría de Competimotor (26-nov-2026).
 *
 * El bot decía «no me sale en stock» o «un asesor ya se la está revisando» sin
 * mostrar nada, cuando el catálogo tenía llantas de esa medida con 1 o 2
 * unidades; minutos después el asesor escribía «Si tenemos» y las vendía:
 *
 *   1331 (23-nov 16:24) «4 llantas todo terreno 235/60 R 16» → «No me sale en
 *        stock en este momento en 235/60R16 todo terreno…». Catálogo: KENDA
 *        KR28 = 2, WANDA WR9001 AT = 1.
 *   1344 (24-nov 16:02) «205 60 R15» → «Un asesor ya se la está revisando».
 *        Catálogo: WINRUN R380 = 2, MAXXIS = 1.
 *   469  (20-nov 11:35) «Llantas 23575r15 / Tipo pantaneras» → «no me aparece
 *        stock». El asesor vendió 4 KR601 R/T (catálogo: 2). Única venta.
 *   560  «¿Le busco una medida equivalente?» → «Listo» → nunca la buscó.
 *
 * Causa: `opcionesQueAlcanzan` descartaba todo lo que tuviera menos de la
 * cantidad pedida (regla de Depot). En Competimotor el stock es uno solo entre
 * locales: lo que tiene ≥ 1 se muestra y se cotiza, y al cliente no se le
 * nombra el stock (`politica.stockCortoSeVende`).
 */
process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

const { opcionesQueAlcanzan, tipoQueFiltraLaBusqueda } = await import("../src/domain/opcionesCandados.js");
const stock = await import("../src/domain/stockCorto.js");
const { availabilityFromStock } = await import("../src/domain/catalog.js");
const sinNoHay = await import("../src/domain/sinNoHay.js");

// El catálogo vivo de Competimotor del 26-nov-2026 (settings.catalogo_archivo).
const MEDIDA_235_60R16_AT = [
  { code: "A0264", brand: "KENDA", design: "KR28 LB AT 104T", stock: 2 },
  { code: "A0515", brand: "WANDA", design: "WR9001 AT", stock: 1 },
];
const MEDIDA_205_60R15 = [
  { code: "A0535", brand: "WINRUN", design: "R380", stock: 2 },
  { code: "A0354", brand: "MAXXIS", design: "MAT1 ESCAPADE", stock: 1 },
];
const MEDIDA_235_75R15_RT = [{ code: "A0273", brand: "KENDA", design: "KR601 RT", stock: 2 }];

describe("Competimotor: lo que tiene 1 o más se muestra (la vitrina)", () => {
  it("1331: las dos A/T de 235/60R16 (KR28 = 2, WR9001 = 1) salen para el juego de 4", () => {
    expect(opcionesQueAlcanzan(MEDIDA_235_60R16_AT, 4).map((p) => p.code)).toEqual(["A0264", "A0515"]);
  });

  it("1344: WINRUN R380 (2) y MAXXIS (1) salen en 205/60R15", () => {
    expect(opcionesQueAlcanzan(MEDIDA_205_60R15, 4).map((p) => p.code)).toEqual(["A0535", "A0354"]);
  });

  it("469: la KENDA KR601 R/T (2) sale para «pantaneras» de 235/75R15", () => {
    expect(opcionesQueAlcanzan(MEDIDA_235_75R15_RT, 4)).toHaveLength(1);
  });

  it("con stock 0 no se muestra nunca", () => {
    expect(opcionesQueAlcanzan([{ code: "X", stock: 0 }, { code: "Y", stock: -3 }], 4)).toEqual([]);
  });

  it("la pieza no le pone «Consultar disponibilidad» a una con 1 o 2", () => {
    expect(availabilityFromStock(2)).toBe("available");
    expect(availabilityFromStock(1)).toBe("available");
    expect(availabilityFromStock(0)).toBe("out");
  });
});

describe("Competimotor: se cotiza lo pedido y al cliente no se le nombra el stock (la caja)", () => {
  it("con 1 o 2 se firma el juego de 4; con 0, no", () => {
    expect(stock.alcanzaParaVender(1, 4)).toBe(true);
    expect(stock.alcanzaParaVender(2, 4)).toBe(true);
    expect(stock.alcanzaParaVender(0, 4)).toBe(false);
  });

  it("el recordatorio «hoy hay 2 y la cotización es por 4» no se pega nunca", () => {
    expect(stock.recordatorioQueFalta("Su cotización COT-ABC por 4 llantas, total $611.80.", {
      numero: "COT-ABC", cantidad: 4, total: 611.8, stockHoy: 2,
    })).toBeNull();
    expect(stock.nombraElStockAlCliente()).toBe(false);
  });

  it("al vendedor no le viaja el número (si viaja, lo escribe); viaja la orden de no nombrarlo", () => {
    const dato = JSON.stringify(stock.stockCortoParaElVendedor({ stock_hoy: 2, solicitadas: 4 }));
    expect(dato).not.toContain("stock_hoy");
    expect(dato).toMatch(/PROHIBIDO decirle al cliente cuántas hay/);
  });

  it("el hecho del Guardián dice que ofrecerla con 1 o 2 NO es error y que no se quita", () => {
    expect(stock.REGLA_STOCK_CORTO_SE_VENDE).toMatch(/NO es error/);
    expect(stock.REGLA_STOCK_CORTO_SE_VENDE).toMatch(/PROHIBIDO quitar, negar o cambiar una opción/);
  });
});

describe("Competimotor: sin ninguna, lo más cercano en el MISMO turno (560)", () => {
  it("con parecidas, la orden es mostrarlas ya, sin «¿le busco una equivalente?»", () => {
    const regla = sinNoHay.reglaDeLasMasCercanas([
      { code: "A0237", marca: "KENDA", diseno: "KR41", medida: "215/55R17" },
    ]);
    expect(regla).toMatch(/EN ESTE MISMO TURNO llama preparar_opciones/);
    expect(regla).toContain("A0237");
    expect(regla).toMatch(/PROHIBIDO preguntar «¿le busco una equivalente\?»/);
  });

  it("el contrato del vendedor prohíbe ofrecer buscar y no buscar", () => {
    expect(sinNoHay.REGLA_SIN_NO_HAY_VENDEDOR).toMatch(/PROHIBIDO preguntar «¿le busco una medida equivalente\?»/);
    expect(sinNoHay.REGLA_SIN_NO_HAY_VENDEDOR).toMatch(/stock de 1 o más SÍ se ofrece/);
  });
});

describe("Competimotor: «ya le estoy revisando el valor promocional…» no sale con precio a la vista", () => {
  // 1555 (24-nov 13:09), textual.
  const TEXTO_1555 = "Claro, en todo terreno para 235/60R16 le recomiendo A/T: sirve para uso mixto entre asfalto y tierra, manteniendo manejo en carretera.\n\n"
    + "Claro, ya le estoy revisando el valor promocional con el que me llegó esa mercadería.\n\n"
    + "¿Le reviso alternativas del mismo aro 16 para completar las 4 llantas?";
  // 1538 (12:11), textual: la cotización de $575 ya había salido.
  const TEXTO_1538 = "Claro, ya le estoy revisando el valor promocional con el que me llegó esa mercadería.\n\n"
    + "En esa medida ya le dejé cotizadas *4 llantas KENDA KR33A 225/70R15* por *$575.00* ($143.75 c/u con IVA). Es reforzada de *8 lonas*.";

  it("1555 con la lámina en el turno: la frase se cambia por «Le recomiendo estas opciones»", () => {
    const limpio = sinNoHay.sinNoHay(TEXTO_1555, { hayOpciones: true, pidePrecio: true });
    expect(limpio).not.toMatch(/valor promocional/);
    expect(limpio).toContain(sinNoHay.FRASE_SIN_STOCK_CON_OPCIONES);
  });

  it("1538 con la cotización en el texto: la frase se quita y el precio queda", () => {
    const limpio = sinNoHay.sinNoHay(TEXTO_1538, { hayOpciones: false, pidePrecio: true });
    expect(limpio).not.toMatch(/valor promocional/);
    expect(limpio).toContain("*$575.00*");
  });

  it("sin nada que mostrar y con la pregunta de precio, la frase de Carlos sigue saliendo", () => {
    const limpio = sinNoHay.sinNoHay("De esa medida no tengo stock.", { hayOpciones: false, pidePrecio: true });
    expect(limpio).toBe(sinNoHay.FRASE_PRECIO_SIN_STOCK);
  });
});

describe("Competimotor: «pantanera» es M/T y también R/T (469)", () => {
  it("«Llantas 23575r15 / Tipo pantaneras»: el M/T que pone el modelo no filtra; manda el uso (M/T y R/T)", () => {
    expect(tipoQueFiltraLaBusqueda("M/T", "lodo", ["Que precio tiene ?", "Tipo pantaneras", "Llantas 23575r15"])).toBeNull();
  });

  it("si el cliente ESCRIBIÓ el tipo, su tipo manda", () => {
    expect(tipoQueFiltraLaBusqueda("M/T", "lodo", ["235/75R15 MT para lodo"])).toBe("M/T");
  });

  it("un tipo que no es de ese uso tampoco se toca (lo decide el resto de la herramienta)", () => {
    expect(tipoQueFiltraLaBusqueda("H/T", "lodo", ["pantanera"])).toBe("H/T");
    expect(tipoQueFiltraLaBusqueda("M/T", null, ["235/75R15"])).toBe("M/T");
  });
});
