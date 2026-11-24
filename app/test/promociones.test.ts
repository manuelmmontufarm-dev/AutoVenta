/**
 * PROMOCIONES QUE EL NEGOCIO ARMA SOLO (pestaña «Promociones», 24-nov-2026).
 *
 * Manuel: «que primero elijas el tipo de promoción, el nombre, algún texto
 * extra… les da el Excel para llenar y upload… los PDFs tienen que funcionar
 * perfecto con cualquier tipo de promo y calcular todo bien».
 *
 * Acá: las cuentas de cada tipo, los candados (nadie paga más por una promo),
 * las fechas, el Excel de ida y vuelta y que la cotización (pieza y texto)
 * muestre el precio, el tachado y el porcentaje de cada tipo.
 */
import { describe, expect, it, vi } from "vitest";

process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.DATABASE_URL ||= "postgresql://nadie@localhost/no_se_usa";

vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(async () => [], { json: (v: unknown) => v, end: async () => undefined }),
}));

const P = await import("../src/domain/promociones.js");
const S = await import("../src/services/promociones.js");
const { lineaDePromocionDePrecio } = await import("../src/domain/preciosEspeciales.js");
const { renderQuoteImage, toRenderLine } = await import("../src/render/quoteImage.js");
const { buildSingleQuoteMessageDetallado } = await import("../src/services/quoteMessages.js");
type CatalogItem = import("../src/domain/catalog.js").CatalogItem;
type Promocion = import("../src/domain/promociones.js").Promocion;

const item = (code: string, sizeLabel: string, precio: number, extra: Partial<CatalogItem> = {}): CatalogItem => ({
  id: code, code, name: `KENDA ${sizeLabel} KR20`, brand: "KENDA", design: "KR20", size: null, sizeLabel,
  price: precio / 1.15, sourcePrice: precio, priceTier: "pvp1", prices: { pvp1: precio, pvp2: null, pvp3: null, pvp4: null }, taxRate: 0.15,
  customerPriceWithTax: precio, minimumPriceWithTax: precio, distributorPriceWithTax: precio, stock: 20, availability: "available",
  imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "archivo",
  ...extra,
});

let siguienteId = 1;
const promo = (tipo: Promocion["tipo"], filas: Promocion["filas"], extra: Partial<Promocion> = {}): Promocion => ({
  id: siguienteId++, nombre: "Semana Kenda", tipo, textoExtra: null, activa: true, desde: null, hasta: "2026-12-05",
  parametros: {}, filas, origen: "panel", creadaEn: "2026-11-24T00:00:00Z", actualizadaEn: "2026-11-24T00:00:00Z",
  ...extra,
});
const HOY = new Date("2026-11-25T12:00:00-05:00");

describe("las cuentas de cada tipo por cantidad", () => {
  it("precio por llanta 1-2-3-4: la 4.ª a $50 y con 5 la cuenta se repite", () => {
    const regla = { t: "por_llanta" as const, precios: [100, 100, 100, 50] };
    expect(P.totalConPromocion(regla, 100, 4)).toBe(350);
    expect(P.totalConPromocion(regla, 100, 3)).toBe(300);
    expect(P.totalConPromocion(regla, 100, 5)).toBe(450);
    expect(P.unidadConPromocion(regla, 100, 4)).toBe(87.5);
    // Con 3 no rebaja nada: la promo no existe para esa cantidad.
    expect(P.unidadConPromocion(regla, 100, 3)).toBeNull();
    expect(P.reglaEnPalabras(regla)).toBe("1.ª $100.00 · 2.ª $100.00 · 3.ª $100.00 · 4.ª $50.00");
  });

  it("lleva N paga M: 4x3, 2x1 y 8 llantas en 4x3", () => {
    expect(P.totalConPromocion({ t: "nxm", lleva: 4, paga: 3 }, 100, 4)).toBe(300);
    expect(P.totalConPromocion({ t: "nxm", lleva: 4, paga: 3 }, 100, 8)).toBe(600);
    expect(P.totalConPromocion({ t: "nxm", lleva: 4, paga: 3 }, 100, 2)).toBe(200);
    expect(P.totalConPromocion({ t: "nxm", lleva: 2, paga: 1 }, 100, 3)).toBe(200);
    expect(P.unidadConPromocion({ t: "nxm", lleva: 4, paga: 3 }, 100, 4)).toBe(75);
    expect(P.unidadConPromocion({ t: "nxm", lleva: 4, paga: 3 }, 100, 2)).toBeNull();
  });

  it("la 2.ª al 50 %: 4 llantas pagan 2 enteras y 2 a mitad", () => {
    const regla = { t: "enesima" as const, posicion: 2, porcentaje: 50 };
    expect(P.totalConPromocion(regla, 100, 4)).toBe(300);
    expect(P.totalConPromocion(regla, 100, 3)).toBe(250);
    expect(P.totalConPromocion(regla, 100, 1)).toBe(100);
    expect(P.reglaEnPalabras({ t: "enesima", posicion: 4, porcentaje: 100 })).toBe("la 4.ª llanta gratis");
  });

  it("precio por juego: paquetes primero y lo que sobra a precio normal", () => {
    const regla = { t: "juego" as const, juego2: 190, juego4: 360 };
    expect(P.totalConPromocion(regla, 100, 4)).toBe(360);
    expect(P.totalConPromocion(regla, 100, 2)).toBe(190);
    expect(P.totalConPromocion(regla, 100, 3)).toBe(290);
    expect(P.totalConPromocion(regla, 100, 6)).toBe(550);
    expect(P.totalConPromocion({ t: "juego", juego2: null, juego4: 360 }, 100, 2)).toBe(200);
  });

  it("escalonado: mientras más lleva, más descuento en todas", () => {
    const regla = { t: "escalonado" as const, escalones: [{ desde: 2, porcentaje: 5 }, { desde: 4, porcentaje: 10 }] };
    expect(P.totalConPromocion(regla, 100, 1)).toBe(100);
    expect(P.totalConPromocion(regla, 100, 2)).toBe(190);
    expect(P.totalConPromocion(regla, 100, 4)).toBe(360);
    expect(P.totalConPromocion(regla, 100, 6)).toBe(540);
  });

  it("el precio por llanta va hacia abajo al centavo: precio × cantidad nunca supera la cuenta", () => {
    const regla = { t: "por_llanta" as const, precios: [99.99, 99.99, 99.99, 33.33] };
    for (const base of [99.99, 123.45, 88.8]) {
      for (const q of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const u = P.unidadConPromocion({ ...regla, precios: [base, base, base, 33.33] }, base, q);
        if (u === null) continue;
        expect(Math.round(u * q * 100)).toBeLessThanOrEqual(Math.round(P.totalConPromocion({ ...regla, precios: [base, base, base, 33.33] }, base, q) * 100));
      }
    }
  });
});

describe("los candados de cada fila", () => {
  it("precio nuevo: tiene que ser menor que el de hoy; un descuento enorme avisa, no bloquea", () => {
    expect(P.efectoDeLaFila("precio_nuevo", {}, { codigo: "A", medida: null, precio: 115 }, 130)).toMatchObject({ ok: true, efecto: { clase: "pareja", precio: 115 }, advertencias: [] });
    expect(P.efectoDeLaFila("precio_nuevo", {}, { codigo: "A", medida: null, precio: 130 }, 130)).toMatchObject({ ok: false });
    expect(P.efectoDeLaFila("precio_nuevo", {}, { codigo: "A", medida: null, precio: 140 }, 130)).toMatchObject({ ok: false });
    const raro = P.efectoDeLaFila("precio_nuevo", {}, { codigo: "A", medida: null, precio: 11.5 }, 130);
    expect(raro.ok && raro.advertencias[0]).toMatch(/91 % de descuento.*tipeo/);
  });

  it("porcentaje y dólares de descuento calculan el precio sobre el de hoy", () => {
    expect(P.efectoDeLaFila("porcentaje", {}, { codigo: "A", medida: null, porcentaje: 15 }, 100)).toMatchObject({ ok: true, efecto: { precio: 85 } });
    expect(P.efectoDeLaFila("monto", {}, { codigo: "A", medida: null, monto: 10 }, 100)).toMatchObject({ ok: true, efecto: { precio: 90 } });
    expect(P.efectoDeLaFila("monto", {}, { codigo: "A", medida: null, monto: 100 }, 100)).toMatchObject({ ok: false });
    expect(P.efectoDeLaFila("porcentaje", {}, { codigo: "A", medida: null, porcentaje: 100 }, 100)).toMatchObject({ ok: false });
  });

  it("precio por llanta: vacío = precio normal; una llanta más cara que hoy no entra", () => {
    const r = P.efectoDeLaFila("por_llanta", {}, { codigo: "A", medida: null, porLlanta: [null, null, null, 50] }, 100);
    expect(r).toMatchObject({ ok: true, efecto: { clase: "cantidad", regla: { t: "por_llanta", precios: [100, 100, 100, 50] } } });
    expect(P.efectoDeLaFila("por_llanta", {}, { codigo: "A", medida: null, porLlanta: [120, null, null, 50] }, 100)).toMatchObject({ ok: false });
    expect(P.efectoDeLaFila("por_llanta", {}, { codigo: "A", medida: null, porLlanta: [null, null, null, null] }, 100)).toMatchObject({ ok: false });
  });

  it("juego: el paquete tiene que costar menos que las llantas sueltas", () => {
    expect(P.efectoDeLaFila("juego", {}, { codigo: "A", medida: null, juego4: 360 }, 100)).toMatchObject({ ok: true });
    expect(P.efectoDeLaFila("juego", {}, { codigo: "A", medida: null, juego4: 400 }, 100)).toMatchObject({ ok: false });
    expect(P.efectoDeLaFila("juego", {}, { codigo: "A", medida: null, juego2: 150, juego4: 360 }, 100)).toMatchObject({ ok: false });
  });

  it("los parámetros de cada tipo se validan en palabras", () => {
    expect(P.errorDeParametros("nxm", { lleva: 4, paga: 3 })).toBeNull();
    expect(P.errorDeParametros("nxm", { lleva: 3, paga: 3 })).toMatch(/menor/);
    expect(P.errorDeParametros("enesima", { posicion: 2, porcentaje: 50 })).toBeNull();
    expect(P.errorDeParametros("enesima", { posicion: 1, porcentaje: 50 })).toBeTruthy();
    expect(P.errorDeParametros("escalonado", { escalones: [] })).toBeTruthy();
    expect(P.errorDeParametros("regalo", { regalo: " " })).toBeTruthy();
    expect(P.errorDeParametros("precio_nuevo", {})).toBeNull();
  });
});

describe("fechas, interruptor y vigencia", () => {
  it("activa, apagada, programada y vencida, por día de Ecuador", () => {
    const p = { activa: true, desde: "2026-11-26", hasta: "2026-12-05" };
    expect(P.estadoDePromocion(p, new Date("2026-11-25T23:59:59-05:00"))).toBe("programada");
    expect(P.estadoDePromocion(p, new Date("2026-11-26T00:00:00-05:00"))).toBe("activa");
    expect(P.estadoDePromocion(p, new Date("2026-12-05T23:59:59-05:00"))).toBe("activa");
    expect(P.estadoDePromocion(p, new Date("2026-12-06T00:00:00-05:00"))).toBe("vencida");
    expect(P.estadoDePromocion({ ...p, activa: false }, HOY)).toBe("apagada");
    expect(P.estadoDePromocion({ activa: true, desde: null, hasta: null }, HOY)).toBe("activa");
  });

  it("la vigencia en palabras, y vacía si no tiene fin", () => {
    expect(P.vigenciaEnPalabras("2026-12-05")).toEqual({ larga: "hasta el sábado 5 de diciembre", corta: "hasta el sábado 5-dic" });
    expect(P.vigenciaEnPalabras(null)).toEqual({ larga: "", corta: "" });
  });

  it("el catálogo se rearma en el instante en que una promo empieza o termina", () => {
    const promos = [{ activa: true, desde: "2026-11-26", hasta: "2026-12-05" }, { activa: false, desde: null, hasta: "2026-11-25" }];
    expect(P.msHastaElProximoCambioDePromociones(promos, new Date("2026-11-25T23:59:00-05:00"))).toBe(60_000);
    expect(P.msHastaElProximoCambioDePromociones(promos, new Date("2026-12-05T23:59:00-05:00"))).toBe(60_000);
    expect(P.msHastaElProximoCambioDePromociones(promos, new Date("2026-12-07T00:00:00-05:00"))).toBeNull();
  });
});

describe("sobre el catálogo", () => {
  it("precio de promoción: el de hoy pasa a ser el de la promo y el de siempre queda tachado", () => {
    const items = [item("A1", "245/35R20", 150), item("A2", "245/45R20", 170)];
    const informe = P.aplicarPromociones(items, [promo("precio_nuevo", [
      { codigo: "A1", medida: "245/35R20", precio: 130 },
      { codigo: "A2", medida: "245/45R20", precio: 180 },   // no es menor: no entra
      { codigo: "ZZ", medida: null, precio: 10 },            // no existe
    ], { textoExtra: "Solo esta semana" })], HOY);
    expect(informe[0].aplicadas).toBe(1);
    expect(informe[0].omitidas.map((o) => o.codigo)).toEqual(["A2", "ZZ"]);
    expect(items[0]).toMatchObject({ minimumPriceWithTax: 130, customerPriceWithTax: 150 });
    expect(items[0].promocionDePrecio).toMatchObject({ nombre: "Semana Kenda", vigenciaCorta: "hasta el sábado 5-dic", detalle: "Solo esta semana" });
    expect(items[1]).toMatchObject({ minimumPriceWithTax: 170 });
    expect(items[1].promocionDePrecio).toBeUndefined();
  });

  it("apagada, vencida o programada no toca nada; otra medida con el mismo código tampoco", () => {
    for (const extra of [{ activa: false }, { hasta: "2026-11-20" }, { desde: "2026-12-01" }]) {
      const items = [item("A1", "245/35R20", 150)];
      P.aplicarPromociones(items, [promo("precio_nuevo", [{ codigo: "A1", medida: "245/35R20", precio: 130 }], extra)], HOY);
      expect(items[0].minimumPriceWithTax).toBe(150);
    }
    const items = [item("A1", "195/65R15", 150)];
    const [informe] = P.aplicarPromociones(items, [promo("precio_nuevo", [{ codigo: "A1", medida: "245/35R20", precio: 130 }])], HOY);
    expect(informe.aplicadas).toBe(0);
    expect(items[0].minimumPriceWithTax).toBe(150);
  });

  it("dos promos sobre la misma llanta no se suman: gana el precio más bajo", () => {
    const items = [item("A1", "245/35R20", 150)];
    P.aplicarPromociones(items, [
      promo("porcentaje", [{ codigo: "A1", medida: null, porcentaje: 10 }], { nombre: "Diez" }),
      promo("precio_nuevo", [{ codigo: "A1", medida: null, precio: 120 }], { nombre: "Remate" }),
    ], HOY);
    expect(items[0].minimumPriceWithTax).toBe(120);
    expect(items[0].promocionDePrecio?.nombre).toBe("Remate");
    expect(items[0].customerPriceWithTax).toBe(150);
  });

  it("promo por cantidad: el catálogo sigue a precio normal y la cantidad decide al cotizar", () => {
    const items = [item("A1", "245/35R20", 100)];
    P.aplicarPromociones(items, [promo("nxm", [{ codigo: "A1", medida: null }], { nombre: "4x3 Kenda", parametros: { lleva: 4, paga: 3 } })], HOY);
    expect(items[0].minimumPriceWithTax).toBe(100);
    expect(items[0].promocionPorCantidad?.regla).toEqual({ t: "nxm", lleva: 4, paga: 3 });

    const conCuatro = P.productoParaCantidad(items[0], 4);
    expect(conCuatro).toMatchObject({ minimumPriceWithTax: 75, customerPriceWithTax: 100 });
    expect(conCuatro.promocionDePrecio).toMatchObject({ nombre: "4x3 Kenda", detalle: "4x3: lleva 4 y paga 3" });
    // Con 2 la promo no rebaja: es la misma llanta, sin rótulo.
    expect(P.productoParaCantidad(items[0], 2)).toBe(items[0]);
    // Y el catálogo no se tocó.
    expect(items[0].minimumPriceWithTax).toBe(100);
    expect(P.hechoDePromocionPorCantidad(items[0].promocionPorCantidad!)).toContain("con 4 llantas: $75.00 c/u ($300.00 en total)");
  });

  it("regalo: no cambia el precio y queda como beneficio de la llanta", () => {
    const items = [item("A1", "245/35R20", 100)];
    P.aplicarPromociones(items, [promo("regalo", [{ codigo: "A1", medida: null }], { nombre: "Diciembre", parametros: { regalo: "Alineación gratis" } })], HOY);
    expect(items[0].minimumPriceWithTax).toBe(100);
    expect(P.textosDeRegalos(items[0])).toEqual(["Alineación gratis (Diciembre hasta el sábado 5-dic)"]);
  });
});

describe("la cotización muestra cada tipo con su precio, su tachado y su porcentaje", () => {
  const casos: Array<{ nombre: string; promo: Promocion; cantidad: number; unidad: number; pct: number }> = [
    { nombre: "precio de promoción", promo: promo("precio_nuevo", [{ codigo: "A1", medida: null, precio: 85 }]), cantidad: 4, unidad: 85, pct: 15 },
    { nombre: "porcentaje", promo: promo("porcentaje", [{ codigo: "A1", medida: null, porcentaje: 20 }]), cantidad: 2, unidad: 80, pct: 20 },
    { nombre: "dólares de descuento", promo: promo("monto", [{ codigo: "A1", medida: null, monto: 10 }]), cantidad: 4, unidad: 90, pct: 10 },
    { nombre: "precio por llanta", promo: promo("por_llanta", [{ codigo: "A1", medida: null, porLlanta: [null, null, null, 50] }]), cantidad: 4, unidad: 87.5, pct: 13 },
    { nombre: "4x3", promo: promo("nxm", [{ codigo: "A1", medida: null }], { parametros: { lleva: 4, paga: 3 } }), cantidad: 4, unidad: 75, pct: 25 },
    { nombre: "2.ª al 50 %", promo: promo("enesima", [{ codigo: "A1", medida: null }], { parametros: { posicion: 2, porcentaje: 50 } }), cantidad: 2, unidad: 75, pct: 25 },
    { nombre: "juego de 4", promo: promo("juego", [{ codigo: "A1", medida: null, juego4: 360 }]), cantidad: 4, unidad: 90, pct: 10 },
    { nombre: "escalonado", promo: promo("escalonado", [{ codigo: "A1", medida: null }], { parametros: { escalones: [{ desde: 4, porcentaje: 12 }] } }), cantidad: 4, unidad: 88, pct: 12 },
  ];
  for (const caso of casos) {
    it(`${caso.nombre}: ${caso.cantidad} llantas a $${caso.unidad} c/u (−${caso.pct} %)`, async () => {
      const items = [item("A1", "245/35R20", 100)];
      P.aplicarPromociones(items, [caso.promo], HOY);
      const linea = await toRenderLine(items[0], caso.cantidad);
      expect(linea).toMatchObject({ unitConIva: caso.unidad, pvpConIva: 100 });
      expect(linea.promocionDePrecio?.nombre).toBe("Semana Kenda");
      const producto = P.productoParaCantidad(items[0], caso.cantidad);
      const texto = buildSingleQuoteMessageDetallado({ product: producto, quantity: caso.cantidad });
      expect(texto).toContain(`💰 $${caso.unidad.toFixed(2)} c/u (antes $100.00, −${caso.pct}%)`);
      expect(texto).toContain("🏷️ *Semana Kenda* hasta el sábado 5-dic");
      expect(texto).toContain(`🛞 ${caso.cantidad} llantas: $${(caso.unidad * caso.cantidad).toFixed(2)}`);
    });
  }

  it("la pieza se dibuja con una promo por cantidad y con una sin fecha de fin", async () => {
    const items = [item("A1", "245/35R20", 100)];
    P.aplicarPromociones(items, [promo("nxm", [{ codigo: "A1", medida: null }], { parametros: { lleva: 4, paga: 3 }, hasta: null })], HOY);
    const linea = await toRenderLine(items[0], 4);
    expect(linea.promocionDePrecio?.vigenciaLarga).toBe("");
    const png = await renderQuoteImage({
      number: "COT-1", dateLabel: "24/11/2026", plantilla: "diaNoche", modo: "dia",
      lines: [linea], subtotal: 260.87, iva: 39.13, total: 300,
    });
    expect(png.length).toBeGreaterThan(10_000);
  });

  it("Black Friday conserva su corazón negro; las demás llevan la etiqueta y el detalle", () => {
    expect(lineaDePromocionDePrecio({ nombre: "Black Friday", hasta: "", vigenciaLarga: "", vigenciaCorta: "hasta el sábado 5-dic" }))
      .toBe("🖤 *Black Friday* hasta el sábado 5-dic");
    expect(lineaDePromocionDePrecio({ nombre: "4x3 Kenda", hasta: "", vigenciaLarga: "", vigenciaCorta: "", detalle: "4x3: lleva 4 y paga 3" }))
      .toBe("🏷️ *4x3 Kenda* · 4x3: lleva 4 y paga 3");
  });
});

describe("el Excel de ida y vuelta", () => {
  const items = [
    item("A0274", "245/35R20", 150, { preciosPorPago: { tarjetaConIva: 150, efectivoConIva: 138 } }),
    item("A0276", "245/45R20", 170),
    item("TOW-1", "185/65R14", 49.45, { brand: "TOWNHALL", design: "TH-161" }),
  ];
  const bases = P.preciosBaseDe(items);

  it("baja con el stock y el precio de hoy, se llena y se lee igual", async () => {
    const excel = await S.excelDePromocion({ tipo: "precio_nuevo", nombre: "Semana Kenda", items, bases });
    // El negocio llena dos filas en el Excel que bajó.
    const ExcelJS = (await import("exceljs")).default;
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(excel as unknown as ArrayBuffer);
    const hoja = libro.getWorksheet("Promoción")!;
    const titulos = (hoja.getRow(1).values as unknown[]).slice(1).map(String);
    expect(titulos).toEqual(["Código", "Marca", "Modelo", "Medida", "Stock", "Precio actual (con IVA)", "Precio efectivo (con IVA)", "Precio promoción (con IVA)"]);
    // Ordenado por aro: la 14 primero.
    expect(hoja.getRow(2).getCell(1).value).toBe("TOW-1");
    expect(hoja.getRow(3).getCell(6).value).toBe(150);
    hoja.getRow(3).getCell(8).value = 130;       // A0274
    hoja.getRow(4).getCell(8).value = 999;       // A0276: más cara que hoy
    const lleno = Buffer.from(await libro.xlsx.writeBuffer());

    const leido = await S.leerExcelDePromocion("precio_nuevo", "promo.xlsx", lleno);
    expect(leido.filas.map((f) => [f.codigo, f.precio])).toEqual([["A0274", 130], ["A0276", 999]]);
    expect(leido.sinLlenar).toBe(1);
    const vista = S.vistaPreviaDe("precio_nuevo", {}, leido.filas, items, bases);
    expect(vista.entran).toHaveLength(1);
    expect(vista.entran[0]).toMatchObject({ codigo: "A0274", precioHoy: 150, precioPromo: 130, porcentaje: 13 });
    expect(vista.noEntran[0]).toMatchObject({ codigo: "A0276" });
    expect(vista.noEntran[0].motivo).toMatch(/no es menor que el precio de hoy/);
  });

  it("precio por llanta: cuatro columnas, y la vista previa trae la cuenta con 1, 2, 3 y 4", async () => {
    const excel = await S.excelDePromocion({ tipo: "por_llanta", items, bases });
    const ExcelJS = (await import("exceljs")).default;
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(excel as unknown as ArrayBuffer);
    const hoja = libro.getWorksheet("Promoción")!;
    const titulos = (hoja.getRow(1).values as unknown[]).slice(1).map(String);
    expect(titulos.slice(-4)).toEqual(["Precio llanta 1", "Precio llanta 2", "Precio llanta 3", "Precio llanta 4"]);
    hoja.getRow(3).getCell(titulos.length).value = 75; // la 4.ª de la A0274 a $75
    const leido = await S.leerExcelDePromocion("por_llanta", "promo.xlsx", Buffer.from(await libro.xlsx.writeBuffer()));
    expect(leido.filas).toHaveLength(1);
    expect(leido.filas[0].porLlanta).toEqual([null, null, null, 75]);
    const vista = S.vistaPreviaDe("por_llanta", {}, leido.filas, items, bases);
    expect(vista.entran[0].porCantidad?.map((c) => c.unidad)).toEqual([null, null, null, 131.25]);
    expect(vista.entran[0]).toMatchObject({ precioPromo: 131.25, porcentaje: 13 });
  });

  it("los tipos de «Aplica»: una X la incluye; otra cosa se dice en palabras", async () => {
    const excel = await S.excelDePromocion({ tipo: "nxm", items, bases });
    const ExcelJS = (await import("exceljs")).default;
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(excel as unknown as ArrayBuffer);
    const hoja = libro.getWorksheet("Promoción")!;
    const ultima = hoja.getRow(1).cellCount;
    hoja.getRow(2).getCell(ultima).value = "x";
    hoja.getRow(3).getCell(ultima).value = "tal vez";
    const leido = await S.leerExcelDePromocion("nxm", "promo.xlsx", Buffer.from(await libro.xlsx.writeBuffer()));
    expect(leido.filas.map((f) => f.codigo)).toEqual(["TOW-1"]);
    expect(leido.ilegibles[0].motivo).toMatch(/escriba una X/);
  });

  it("un Excel de otro tipo se rechaza diciendo cuál bajar", async () => {
    const excel = await S.excelDePromocion({ tipo: "precio_nuevo", items, bases });
    await expect(S.leerExcelDePromocion("por_llanta", "promo.xlsx", excel)).rejects.toThrow(/Baje el de «Precio por llanta 1, 2, 3 y 4»/);
  });

  it("al editar, el Excel baja con lo ya guardado", async () => {
    const excel = await S.excelDePromocion({ tipo: "precio_nuevo", items, bases, filas: [{ codigo: "A0274", medida: "245/35R20", precio: 130 }] });
    const leido = await S.leerExcelDePromocion("precio_nuevo", "promo.xlsx", excel);
    expect(leido.filas.map((f) => [f.codigo, f.precio])).toEqual([["A0274", 130]]);
  });

  it("los datos de la promoción se validan en palabras", () => {
    expect(() => S.datosValidados({ nombre: " ", tipo: "precio_nuevo" })).toThrow(/nombre/);
    expect(() => S.datosValidados({ nombre: "X", tipo: "precio_nuevo", desde: "2026-12-10", hasta: "2026-12-05" })).toThrow(/anterior/);
    expect(() => S.datosValidados({ nombre: "X", tipo: "nxm", parametros: {} })).toThrow(/lleva/);
    expect(S.datosValidados({ nombre: "  Semana   Kenda ", tipo: "nxm", parametros: { lleva: "4" as never, paga: "3" as never } }))
      .toMatchObject({ nombre: "Semana Kenda", parametros: { lleva: 4, paga: 3 }, activa: true, desde: null, hasta: null });
  });
});
