import { afterEach, describe, expect, it } from "vitest";

/**
 * EL PRECIO DE DEPOT DESDE CONTÍFICO + EL «DESCUENTO DE SIEMPRE» COMO PROMOCIÓN
 * (24-nov-2026).
 *
 * Caso real (Joaquín): «dos clientes vienen con la proforma a menos precio».
 * KENDA KR628 265/70R17 (K557B738): la proforma decía $246,42 de lista (4 con
 * Black Friday = $689,98) y la factura $219,70 + IVA = $252,66 (4 = $707,44).
 * El Interbot no tenía el código y el bot usaba la fórmula sobre el costo.
 *
 * Manuel: la lista sale de Contífico (la empresa que factura), el Interbot
 * queda para lo que falte o no tenga sentido, y el −25 % pasa a ser una
 * promoción con interruptor sobre la que se montan las demás («Joaquín
 * siempre tiene esta y a veces se suman otras»).
 */

process.env.NEGOCIO = "depot";
process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://test@localhost/test";
process.env.CONTIFICO_API_KEY ||= "llave-catalogo-test";
process.env.CONTIFICO_FACTURAS_API_KEY ||= "llave-facturas-test";

const { normalizeContificoProduct } = await import("../src/domain/catalog.js");
const { __setPreciosForTests } = await import("../src/services/interbotPrices.js");
const { applyInterbotPrices } = await import("../src/services/catalog.js");
const V = await import("../src/services/precioDeVenta.js");
const P = await import("../src/domain/promociones.js");
const S = await import("../src/services/promociones.js");
const P_T = await import("../src/domain/promocionDeTemporada.js");
const { segundaLlantaDe } = P_T;
const { politica } = await import("../src/negocio/politica.js");
type Promocion = import("../src/domain/promociones.js").Promocion;

/** Tal como la devuelve el Contífico del catálogo de Depot el 24-nov (pvp1 = costo). */
const KR628_R17 = {
  id: "XKdwp8OJvcGzLDeg", codigo: "K557B738", nombre: "265/70R17 115T KR628 TL", estado: "A", tipo: "PRO",
  pvp1: "120.530000", pvp2: "0", pvp3: "0", pvp4: "0", porcentaje_iva: 15, cantidad_stock: 42, marca_nombre: "KENDA",
} as never;
const KR628_R16 = {
  ...(KR628_R17 as Record<string, unknown>), id: "xmbmZOA9XijK5mdo", codigo: "K383B639",
  nombre: "265/70R16 112T - KR628 TL", pvp1: "111.570000", cantidad_stock: 19,
} as never;
const INTERBOT_R16 = {
  K383B639: {
    marca: "KENDA", medida: "265/70R16", costoConIva: 128.31, pvpFullConIva: 230.08, pvpMinConIva: 172.55,
    precioPromoConIva: null, tienePromo: false,
  },
};

const llanta = (wire: never) => {
  const it = normalizeContificoProduct(wire, "pvp1");
  if (!it) throw new Error("normalize devolvió null");
  return it;
};

const BF_NOV = new Date("2026-11-24T17:00:00Z");
const temporada = politica.promocionDeTemporada;

let id = 100;
const promo = (extra: Partial<Promocion>): Promocion => ({
  id: id++, nombre: "Promo", tipo: "porcentaje", textoExtra: null, activa: true, desde: null, hasta: null,
  parametros: {}, filas: [], origen: "panel", creadaEn: "2026-11-24T00:00:00Z", actualizadaEn: "2026-11-24T00:00:00Z",
  ...extra,
});
const descuentoDeSiempre = (activa = true) =>
  promo({ nombre: "Descuento de siempre", parametros: { todas: true, porcentaje: 25 }, activa, origen: S.ORIGEN_DESCUENTO_DE_SIEMPRE });

afterEach(() => {
  __setPreciosForTests(null);
  V.__fijarListaDeFacturacion(null);
  V.fijarDescuentoDeSiempre(25);
});

describe("la lista sale de Contífico (empresa que factura), con el Interbot de respaldo", () => {
  it("regresión: sin Contífico ni Interbot, la KR628 R17 sale a la fórmula ($246,42), lo que cotizó el bot", () => {
    __setPreciosForTests(INTERBOT_R16);
    const r17 = llanta(KR628_R17);
    applyInterbotPrices([r17]);
    expect(r17.customerPriceWithTax).toBe(246.42);
  });

  it("el caso que falló: lista $252,66 como la factura; hoy $189,50 con el −25 %", () => {
    __setPreciosForTests(INTERBOT_R16);
    V.__fijarListaDeFacturacion({ K557B738: { pvp1: 219.7 } });
    const r17 = llanta(KR628_R17);
    applyInterbotPrices([r17]);
    expect(r17.customerPriceWithTax).toBe(252.66);
    expect(r17.price).toBe(219.7);
    expect(r17.minimumPriceWithTax).toBe(189.5);
    expect(V.precioDeVenta("K557B738", 120.53)?.fuente).toBe("contifico");
  });

  it("Contífico manda aunque el Interbot diga otra cosa (KR601: Interbot $295,32, factura $247,97)", () => {
    __setPreciosForTests({ "35292002": { ...INTERBOT_R16.K383B639, pvpFullConIva: 295.32, pvpMinConIva: 221.49 } });
    V.__fijarListaDeFacturacion({ "35292002": { pvp1: 215.63 } });
    const pv = V.precioDeVenta("35292002", 130.92);
    expect(pv).toMatchObject({ fuente: "contifico", pvpFullConIva: 247.97, pvpMinConIva: 185.98 });
  });

  it("sin precio en Contífico, el Interbot (la R16 queda como siempre)", () => {
    __setPreciosForTests(INTERBOT_R16);
    V.__fijarListaDeFacturacion({});
    const r16 = llanta(KR628_R16);
    applyInterbotPrices([r16]);
    expect(r16.customerPriceWithTax).toBe(230.08);
    expect(r16.minimumPriceWithTax).toBe(172.56);
  });

  it("un precio de Contífico que no tiene sentido contra el costo se descarta y va el Interbot", () => {
    __setPreciosForTests(INTERBOT_R16);
    // $50 sobre un costo de $111,57: un tipeo. También uno 4 veces el costo.
    V.__fijarListaDeFacturacion({ K383B639: { pvp1: 50 } });
    expect(V.precioDeVenta("K383B639", 111.57)).toMatchObject({ fuente: "interbot", pvpFullConIva: 230.08 });
    V.__fijarListaDeFacturacion({ K383B639: { pvp1: 111.57 * 4 } });
    expect(V.precioDeVenta("K383B639", 111.57)?.fuente).toBe("interbot");
    // Dentro del rango real (1,41–2,41 veces el costo), Contífico.
    V.__fijarListaDeFacturacion({ K383B639: { pvp1: 200.07 } });
    expect(V.precioDeVenta("K383B639", 111.57)?.fuente).toBe("contifico");
  });

  it("una promo propia del Interbot se respeta", () => {
    __setPreciosForTests({ K383B639: { ...INTERBOT_R16.K383B639, tienePromo: true, precioPromoConIva: 150 } });
    const r16 = llanta(KR628_R16);
    applyInterbotPrices([r16]);
    expect(r16.minimumPriceWithTax).toBe(150);
  });
});

describe("el «Descuento de siempre» es una promoción con interruptor", () => {
  it("prendida: 25 %; apagada, vencida o de otro tipo: 0", () => {
    expect(P.descuentoParaTodas([descuentoDeSiempre()])).toBe(25);
    expect(P.descuentoParaTodas([descuentoDeSiempre(false)])).toBe(0);
    expect(P.descuentoParaTodas([{ ...descuentoDeSiempre(), hasta: "2026-11-01" }], BF_NOV)).toBe(0);
    expect(P.descuentoParaTodas([promo({ filas: [{ codigo: "K557B738", medida: null, porcentaje: 30 }] })])).toBe(0);
  });

  it("apagada: se cotiza a la lista, sin tachado", () => {
    V.__fijarListaDeFacturacion({ K557B738: { pvp1: 219.7 } });
    __setPreciosForTests(INTERBOT_R16);
    V.fijarDescuentoDeSiempre(0);
    const r17 = llanta(KR628_R17);
    applyInterbotPrices([r17]);
    expect(r17.minimumPriceWithTax).toBe(252.66);
    expect(r17.customerPriceWithTax).toBe(252.66);
  });

  it("el panel la guarda sin Excel y no le borra el % al prenderla o apagarla", () => {
    const d = S.datosValidados({ nombre: "Descuento de siempre", tipo: "porcentaje", parametros: { todas: true, porcentaje: 25 }, activa: false });
    expect(d.parametros).toEqual({ todas: true, porcentaje: 25 });
    expect(() => S.datosValidados({ nombre: "X", tipo: "porcentaje", parametros: { todas: true, porcentaje: 0 } })).toThrow(/entre 1 y 99/);
    // Una promo de % normal sigue sin parámetros (el % va por llanta en el Excel).
    expect(S.datosValidados({ nombre: "X", tipo: "porcentaje", parametros: { porcentaje: 10 } }).parametros).toEqual({});
  });

  it("aplicarPromociones no la toca: ya está dentro del precio de hoy", () => {
    V.__fijarListaDeFacturacion({ K557B738: { pvp1: 219.7 } });
    const r17 = llanta(KR628_R17);
    applyInterbotPrices([r17]);
    const informes = P.aplicarPromociones([r17], [descuentoDeSiempre()], BF_NOV);
    expect(informes).toEqual([]);
    expect(r17.minimumPriceWithTax).toBe(189.5);
    expect(r17.promocionDePrecio).toBeUndefined();
  });

  it("el panel la muestra como «25 % menos en todas las llantas»", () => {
    V.__fijarListaDeFacturacion({ K557B738: { pvp1: 219.7 } });
    const items = [llanta(KR628_R17), llanta(KR628_R16)];
    applyInterbotPrices(items);
    const vista = S.paraElPanel(descuentoDeSiempre(), items, P.preciosBaseDe(items));
    expect(vista.resumen).toBe("25 % menos en todas las llantas");
    expect(vista.entranHoy).toBe(2);
  });
});

describe("dos (o tres) promociones a la vez: la de siempre + las que se suman", () => {
  const conDescuento = () => {
    V.__fijarListaDeFacturacion({ K557B738: { pvp1: 219.7 } });
    const r17 = llanta(KR628_R17);
    applyInterbotPrices([r17]);
    return r17;
  };

  it("−25 % + una promo del panel de 10 %: se suma encima (189,50 → 170,55), con la lista tachada", () => {
    const r17 = conDescuento();
    const panel = promo({ nombre: "Kenda diciembre", filas: [{ codigo: "K557B738", medida: "265/70R17", porcentaje: 10 }] });
    const [informe] = P.aplicarPromociones([r17], [panel, descuentoDeSiempre()], BF_NOV);
    expect(informe.aplicadas).toBe(1);
    expect(r17.minimumPriceWithTax).toBe(170.55);
    expect(r17.customerPriceWithTax).toBe(252.66);
    expect(r17.promocionDePrecio?.nombre).toBe("Kenda diciembre");
  });

  it("con la de siempre apagada, la del panel cuenta sobre la lista (252,66 → 227,39)", () => {
    V.fijarDescuentoDeSiempre(0);
    const r17 = conDescuento();
    const panel = promo({ filas: [{ codigo: "K557B738", medida: "265/70R17", porcentaje: 10 }] });
    P.aplicarPromociones([r17], [panel], BF_NOV);
    expect(r17.minimumPriceWithTax).toBe(227.39);
  });

  it("−25 % + Black Friday (2.ª al 60 %): 4 llantas = $707,44 como la factura; 1 llanta = $189,50", () => {
    const r17 = conDescuento();
    const cuatro = segundaLlantaDe(temporada, "KENDA", 4, { hoyConIva: r17.minimumPriceWithTax, listaConIva: r17.customerPriceWithTax }, BF_NOV);
    expect(cuatro?.totalConIva).toBe(707.44);
    expect(segundaLlantaDe(temporada, "KENDA", 1, { hoyConIva: 189.5, listaConIva: 252.66 }, BF_NOV)).toBeNull();
  });

  it("las tres a la vez: si la del panel deja las 4 más baratas que el Black Friday, gana la del panel", () => {
    const r17 = conDescuento();
    P.aplicarPromociones([r17], [promo({ filas: [{ codigo: "K557B738", medida: "265/70R17", porcentaje: 10 }] })], BF_NOV);
    // 4 × 170,55 = 682,20 < 707,44 del Black Friday → el Black Friday no se usa.
    expect(segundaLlantaDe(temporada, "KENDA", 4, { hoyConIva: r17.minimumPriceWithTax, listaConIva: r17.customerPriceWithTax }, BF_NOV)).toBeNull();
  });

  it("una promo del panel que no rebaja el precio de hoy no entra (nadie paga más)", () => {
    const r17 = conDescuento();
    const [informe] = P.aplicarPromociones([r17], [promo({ tipo: "precio_nuevo", filas: [{ codigo: "K557B738", medida: null, precio: 200 }] })], BF_NOV);
    expect(informe.aplicadas).toBe(0);
    expect(r17.minimumPriceWithTax).toBe(189.5);
  });

  it("−25 % + un 4x3 del panel: por cantidad sobre el precio de hoy (4 llantas a $142,12 c/u)", () => {
    const r17 = conDescuento();
    P.aplicarPromociones([r17], [promo({ tipo: "nxm", parametros: { lleva: 4, paga: 3 }, filas: [{ codigo: "K557B738", medida: null }] })], BF_NOV);
    const P4 = P.productoParaCantidad(r17, 4);
    expect(P4.minimumPriceWithTax).toBe(142.12);
    expect(P.productoParaCantidad(r17, 1).minimumPriceWithTax).toBe(189.5);
  });
});

/**
 * EL BLACK FRIDAY EN LA PESTAÑA PROMOCIONES (24-nov-2026). Manuel: «siguen con
 * la promoción en la 2.ª llanta… préndele desde ahí». La 2.ª llanta al 60 %
 * vivía solo en el código; ahora es una fila del panel con interruptor, fechas
 * y % (la siembra `sembrarPromocionDeTemporada`).
 */
describe("el Black Friday se prende y se apaga desde Promociones", () => {
  const { fijarTemporadaDelPanel, promocionVigente } = P_T;
  const bf = (extra: Partial<Promocion> = {}) => promo({
    nombre: "Black Friday", tipo: "enesima", origen: S.ORIGEN_TEMPORADA, desde: "2026-11-01", hasta: "2026-11-30",
    parametros: { temporada: true, posicion: 2, porcentaje: 60, marcas: ["FALKEN", "KENDA"] }, ...extra,
  });
  const ajusteDe = (p: Promocion | null) =>
    p ? { abierta: p.activa, desde: p.desde, hasta: p.hasta, porcentaje: p.parametros.porcentaje ?? null, lema: p.textoExtra }
      : { abierta: false, desde: null, hasta: null, porcentaje: null };
  const precios = { hoyConIva: 189.5, listaConIva: 252.66 };
  afterEach(() => fijarTemporadaDelPanel(temporada, null));

  it("prendida en el panel: 4 KR628 R17 = $707,44, igual que antes", () => {
    fijarTemporadaDelPanel(temporada, ajusteDe(bf()));
    expect(segundaLlantaDe(temporada, "KENDA", 4, precios, BF_NOV)?.totalConIva).toBe(707.44);
  });

  it("apagada en el panel: no hay Black Friday, quedan 4 × $189,50", () => {
    fijarTemporadaDelPanel(temporada, ajusteDe(bf({ activa: false })));
    expect(promocionVigente(temporada, BF_NOV)).toBe(false);
    expect(segundaLlantaDe(temporada, "KENDA", 4, precios, BF_NOV)).toBeNull();
  });

  it("quitada del panel (archivada): tampoco corre, aunque el código la traiga", () => {
    fijarTemporadaDelPanel(temporada, ajusteDe(null));
    expect(promocionVigente(temporada, BF_NOV)).toBe(false);
  });

  it("la fecha de fin del panel manda: extendida al 7-dic, el 3-dic sigue", () => {
    const tresDic = new Date("2026-12-03T17:00:00Z");
    expect(promocionVigente(temporada, tresDic)).toBe(false);
    fijarTemporadaDelPanel(temporada, ajusteDe(bf({ hasta: "2026-12-07" })));
    expect(promocionVigente(temporada, tresDic)).toBe(true);
    expect(P_T.hastaEnPalabras(temporada!)).toBe("7 de diciembre");
  });

  it("el texto extra del panel es el lema del saludo (vacío = el de la política)", () => {
    fijarTemporadaDelPanel(temporada, ajusteDe(bf({ textoExtra: "Extendemos el Black Friday hasta el 7 de diciembre" })));
    expect(temporada!.lema).toBe("Extendemos el Black Friday hasta el 7 de diciembre");
    fijarTemporadaDelPanel(temporada, ajusteDe(bf({ textoExtra: null })));
    expect(temporada!.lema).toBe("El Black Friday se vive TODO NOVIEMBRE");
  });

  it("sin sembrar (o sin base) rige la política como está escrita", () => {
    fijarTemporadaDelPanel(temporada, ajusteDe(bf({ hasta: "2026-12-07", parametros: { temporada: true, posicion: 2, porcentaje: 50, marcas: ["KENDA"] } })));
    fijarTemporadaDelPanel(temporada, null);
    expect(temporada!.hasta).toBe("2026-11-30");
    expect(temporada!.segundaLlanta!.porcentaje).toBe(60);
    expect(promocionVigente(temporada, BF_NOV)).toBe(true);
  });

  it("aplicarPromociones no la cuenta como un 2x1 del panel (la cuenta va sobre la lista, por marca)", () => {
    V.__fijarListaDeFacturacion({ K557B738: { pvp1: 219.7 } });
    const r17 = llanta(KR628_R17);
    applyInterbotPrices([r17]);
    expect(P.aplicarPromociones([r17], [bf()], BF_NOV)).toEqual([]);
    expect(r17.promocionPorCantidad).toBeUndefined();
  });

  it("el panel la guarda sin Excel, siempre en la 2.ª llanta, y la muestra con sus marcas", () => {
    const d = S.datosValidados({ nombre: "Black Friday", tipo: "enesima", parametros: { temporada: true, posicion: 3, porcentaje: 60, marcas: ["kenda", "Falken"] } });
    expect(d.parametros).toEqual({ temporada: true, posicion: 2, porcentaje: 60, marcas: ["KENDA", "FALKEN"] });
    V.__fijarListaDeFacturacion({ K557B738: { pvp1: 219.7 } });
    const items = [llanta(KR628_R17), llanta(KR628_R16)];
    applyInterbotPrices(items);
    const vista = S.paraElPanel(bf(), items, P.preciosBaseDe(items));
    expect(vista.resumen).toBe("60 % menos en la 2.ª llanta Falken y Kenda, sobre el precio de lista");
    expect(vista.entranHoy).toBe(2);
  });
});
