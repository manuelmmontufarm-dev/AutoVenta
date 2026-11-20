/**
 * BLACK FRIDAY DE COMPETIMOTOR (lista de Carlos Romero, 20-nov-2026).
 *
 * Manuel: rige desde ya hasta el lunes 30-nov-2026 a las 23:59 de Ecuador,
 * para las dos secciones, y después se apaga solo. Cada fila se cruza con el
 * inventario por medida + marca/modelo; lo que no cruza claro NO se adivina.
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.DATABASE_URL ||= "postgresql://nadie@localhost/no_se_usa";

const { politica } = await import("../src/negocio/politica.js");
const { aplicarPreciosEspeciales, msHastaElProximoCambio, preciosEspecialesVigentes, lineaDePromocionDePrecio } =
  await import("../src/domain/preciosEspeciales.js");
const { cruzarPromocion, filasDeLaHoja, medidaDeLaLista, palabraEnElNombre, palabrasDelNombre } =
  await import("../src/domain/cruceDePromocion.js");
const { medidaCanonica } = await import("../src/domain/tireSize.js");
const { renderQuoteImage, toRenderLine } = await import("../src/render/quoteImage.js");
const { buildSingleQuoteMessageDetallado } = await import("../src/services/quoteMessages.js");
type CatalogItem = import("../src/domain/catalog.js").CatalogItem;

const item = (code: string, sizeLabel: string, p2: number, extra: Partial<CatalogItem> = {}): CatalogItem => ({
  id: code, code, name: `TOWNHALL ${sizeLabel} TH-161`, brand: "TOWNHALL", design: "TH-161", size: null, sizeLabel,
  price: p2 / 1.15, sourcePrice: p2, priceTier: "pvp1", prices: { pvp1: p2, pvp2: null, pvp3: null, pvp4: null }, taxRate: 0.15,
  customerPriceWithTax: p2, minimumPriceWithTax: p2, distributorPriceWithTax: p2, stock: 101, availability: "available",
  imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "archivo",
  preciosPorPago: { tarjetaConIva: p2, efectivoConIva: Math.round(p2 * 0.9 * 100) / 100 },
  ...extra,
});

describe("la lista de Black Friday en la política", () => {
  const bf = politica.preciosEspeciales!;
  it("rige hasta el lunes 30-nov a las 23:59:59 de Ecuador", () => {
    expect(bf.nombre).toBe("Black Friday");
    expect(new Date(bf.hasta).toISOString()).toBe("2026-12-01T04:59:59.000Z");
    expect(bf.vigenciaCorta).toBe("hasta el lunes 30-nov");
  });

  it("116 llantas, sin códigos repetidos, con medida canónica y precio positivo", () => {
    expect(bf.llantas).toHaveLength(116);
    expect(new Set(bf.llantas.map((l) => l.codigo)).size).toBe(bf.llantas.length);
    for (const l of bf.llantas) {
      expect(medidaCanonica(l.medida)).toBe(l.medida);
      expect(l.precioConIva).toBeGreaterThan(0);
    }
  });

  it("las dos de precio raro (Continental AT50 $110, Falken Azenis $115) y la de ≥ P2 (Kenda KR41 $199) NO están", () => {
    const codigos = bf.llantas.map((l) => l.codigo);
    expect(codigos).not.toContain("1645");
    expect(codigos).not.toContain("A0077");
    expect(codigos).not.toContain("K421B849");
  });
});

describe("se prende y se apaga a la hora exacta", () => {
  const bf = politica.preciosEspeciales!;
  it("vigente el 30-nov a las 23:59:59 y apagado el 1-dic a las 00:00:00 (hora de Ecuador)", () => {
    expect(preciosEspecialesVigentes(bf, new Date("2026-11-20T18:00:00-05:00"))).toBe(true);
    expect(preciosEspecialesVigentes(bf, new Date("2026-11-30T23:59:59-05:00"))).toBe(true);
    expect(preciosEspecialesVigentes(bf, new Date("2026-12-01T00:00:00-05:00"))).toBe(false);
    expect(preciosEspecialesVigentes(bf, new Date("2026-11-19T23:59:59-05:00"))).toBe(false);
  });

  it("el temporizador apunta al segundo después del cierre", () => {
    expect(msHastaElProximoCambio(bf, new Date("2026-11-30T23:59:00-05:00"))).toBe(60_000);
    expect(msHastaElProximoCambio(bf, new Date("2026-12-01T00:00:01-05:00"))).toBeNull();
  });

  it("aplicada: el precio de hoy es el de Black Friday y el P2 queda tachado; vencida: el P2 de siempre", () => {
    const enVigencia = [item("A0477", "185/65R14", 49.45)];
    const r = aplicarPreciosEspeciales(enVigencia, bf, new Date("2026-11-25T12:00:00-05:00"));
    expect(r.aplicadas).toBe(1);
    expect(enVigencia[0]).toMatchObject({ minimumPriceWithTax: 42, customerPriceWithTax: 49.45 });
    expect(enVigencia[0].promocionDePrecio?.vigenciaCorta).toBe("hasta el lunes 30-nov");

    const vencida = [item("A0477", "185/65R14", 49.45)];
    expect(aplicarPreciosEspeciales(vencida, bf, new Date("2026-12-01T00:00:00-05:00")).aplicadas).toBe(0);
    expect(vencida[0]).toMatchObject({ minimumPriceWithTax: 49.45, customerPriceWithTax: 49.45 });
    expect(vencida[0].promocionDePrecio).toBeUndefined();
  });

  it("candados: otra medida con el mismo código, o un precio que no es menor, no se aplican", () => {
    const lista = { ...bf, llantas: [{ codigo: "A", medida: "185/65R14", precioConIva: 42 }, { codigo: "B", medida: "185/65R14", precioConIva: 60 }] };
    const items = [item("A", "195/65R15", 49.45), item("B", "185/65R14", 49.45)];
    const r = aplicarPreciosEspeciales(items, lista, new Date("2026-11-25T12:00:00-05:00"));
    expect(r.aplicadas).toBe(0);
    expect(r.omitidas.map((o) => o.codigo)).toEqual(["A", "B"]);
    expect(items.every((i) => i.minimumPriceWithTax === 49.45 && !i.promocionDePrecio)).toBe(true);
  });
});

describe("el cruce no adivina", () => {
  const art = (code: string, name: string, brand: string, sizeLabel: string) => ({ code, name, brand, sizeLabel });
  const inventario = [
    art("1", "TOWNHALL 185/65R14 TH-161 86H", "TOWNHALL", "185/65R14"),
    art("2", "TOWNHALL 185/65R14 86H TH-93", "TOWNHALL", "185/65R14"),
    art("3", "FALKEN 225/65R17 ZE310R", "FALKEN", "225/65R17"),
    art("4", "KENDA 275/70R17LT KR608 LB 121/118R 10PR", "KENDA", "275/70R17"),
    art("5", "LINGLONG 215/75R14C R666 8PR", "LINGLONG", "215/75R14"),
    art("6", "FALKEN 255/50R19 CT60AS", "FALKEN", "255/50R19"),
    art("7", "FALKEN 255/50R19 WILDPEAK A/T TRAIL XL 107V", "FALKEN", "255/50R19"),
    art("8", "KENDA 700R15 KR12 12PR", "KENDA", "7.00R15"),
    art("9", "HAIDA 205/55R16 HDEXCONFORT", "HAIDA", "205/55R16"),
  ];
  const f = (fila: number, medida: string, texto: string, precio = 10) => ({ fila, seccion: "x", medida, texto, precio });

  it("cruza con modelo con guion, letra de versión, solo el número, tipeo de marca listado y medida de camión", () => {
    const r = cruzarPromocion([
      f(1, "185/65R14", "TOWNHALL TH161"), f(2, "225/65R17", "FALKEN ZE310"), f(3, "275/70R17", "KENDA 608"),
      f(4, "215/75R14", "LINLONG"), f(5, "700R15", "KENDA KR12"),
    ], inventario);
    expect(r.map((x) => (x.estado === "cruzo" ? x.articulo.code : x.estado))).toEqual(["1", "3", "4", "5", "8"]);
  });

  it("no cruza: ambigua, modelo que no está, tipeo de modelo, código pedido dos veces", () => {
    const r = cruzarPromocion([
      f(1, "255/50R19", "FALKEN"), f(2, "185/65R14", "TOWNHALL TH200"), f(3, "205/55R16", "HAIDA HDEXCOMFORT"),
      f(4, "225/65R17", "FALKEN ZE310"), f(5, "225/65R17", "FALKEN"),
    ], inventario);
    expect(r.map((x) => (x.estado === "sin_cruzar" ? x.motivo : "cruzo"))).toEqual(["ambigua", "sin_articulo", "sin_articulo", "codigo_repetido", "codigo_repetido"]);
  });

  it("la hoja: la medida vacía hereda la de arriba; «R13» y los títulos no son llantas", () => {
    const filas = filasDeLaHoja([
      { fila: 2, b: "MEDIDAS", c: "LLANTAS JUEVES, VIERNES,SÁBADO Y LUNES (CON SERVICIOS)", h: "PRECIO" },
      { fila: 3, b: "R14", c: null, h: null },
      { fila: 4, b: "165/60R14", c: "GENERAL", h: 66 },
      { fila: 5, b: null, c: "KENDA", h: 59 },
    ]);
    expect(filas).toEqual([
      { fila: 4, seccion: "LLANTAS JUEVES, VIERNES,SÁBADO Y LUNES (CON SERVICIOS)", medida: "165/60R14", texto: "GENERAL", precio: 66 },
      { fila: 5, seccion: "LLANTAS JUEVES, VIERNES,SÁBADO Y LUNES (CON SERVICIOS)", medida: "165/60R14", texto: "KENDA", precio: 59 },
    ]);
  });

  it("piezas sueltas", () => {
    expect(medidaDeLaLista("700R15")).toBe("7.00R15");
    expect(palabrasDelNombre("TOURADOR 235/65R17 FORCE A/T 108T")).toContain("AT");
    expect(palabraEnElNombre("HT2", ["FORZA", "HT", "2"])).toBe(true);
    expect(palabraEnElNombre("AT", ["AT4W"])).toBe(false);
  });
});

describe("la cotización muestra el P2 tachado y el precio de Black Friday", () => {
  const bf = politica.preciosEspeciales!;
  const conPromo = () => {
    const items = [item("A0477", "185/65R14", 49.45)];
    aplicarPreciosEspeciales(items, bf, new Date("2026-11-25T12:00:00-05:00"));
    return items[0];
  };

  it("la línea de la pieza lleva la franja con la vigencia", async () => {
    const linea = await toRenderLine(conPromo(), 4);
    expect(linea).toMatchObject({ unitConIva: 42, pvpConIva: 49.45 });
    expect(linea.promocionDePrecio?.vigenciaLarga).toBe("hasta el lunes 30 de noviembre");
    const png = await renderQuoteImage({
      number: "COT-1", dateLabel: "20/11/2026", plantilla: "diaNoche", modo: "dia",
      lines: [linea], subtotal: 146.09, iva: 21.91, total: 168,
    });
    expect(png.length).toBeGreaterThan(10_000);
  });

  it("el texto (cuando la foto no sale) dice el precio, el de antes y Black Friday con su vigencia", () => {
    const texto = buildSingleQuoteMessageDetallado({ product: conPromo(), quantity: 4 });
    expect(texto).toContain("💰 $42.00 c/u (antes $49.45, −15%)");
    expect(texto).toContain(lineaDePromocionDePrecio(conPromo().promocionDePrecio)!);
    expect(texto).toContain("🖤 *Black Friday* hasta el lunes 30-nov");
  });
});
