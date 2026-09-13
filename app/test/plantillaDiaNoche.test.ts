/**
 * La plantilla «Depot día y noche» (12-sep-2026).
 *
 * Es la que propuso el cliente, con los cambios que pidió Manuel: la cantidad
 * de llantas en grande, el precio por llanta que se lea, el descuento en
 * insignia dorada, lo incluido con letra grande y los logos oficiales de cada
 * marca. Es la única plantilla que cambia sola: clara de 6:00 a 16:59 y oscura
 * de 17:00 a 5:59, hora de Quito — salvo que Ajustes la fije en una de las dos.
 *
 * Lo que no puede perder al cambiar de diseño es lo que ya costó errores
 * reales: el reparo de la medida equivalente y la cantidad correcta del juego.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const { modoDeLaHora, resolverModo, optionsPosterDiaNoche, quotePosterDiaNoche } = await import("../src/render/diaNoche.js");
const { PiecesConfigSchema } = await import("../src/services/settings.js");
const { renderOptionsImage, renderQuoteImage, toRenderLine } = await import("../src/render/quoteImage.js");
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

const linea = (brand: string, design: string, unit: number, pvp: number | null, extra: Record<string, unknown> = {}) => ({
  brand, design, sizeLabel: "265/70R16",
  loadSpeedLabel: "112T", loadSpeedTranslation: "1120 kg máx · 190 km/h máx",
  quantity: 4, unitConIva: unit, pvpConIva: pvp,
  availability: "available" as const, golpesMeses: 12, fabricaAnios: 5,
  photoUri: "data:image/png;base64,iVBORw0KGgo=",
  tag: "MEJOR CALIDAD-PRECIO DEL MERCADO", posicionamiento: "Buena calidad, buen desempeño, buen precio.",
  medidaExacta: true,
  ...extra,
});

// Las tres de la plantilla del cliente: juego de 4 a $581.88 / $690.20 / $896.60, todas −25 %.
const TRES = [
  linea("WINRUN", "MAXCLAW A/T", 145.47, 193.96, { golpesMeses: 6 }),
  linea("KENDA", "KR628", 172.55, 230.07, { recomendada: true }),
  linea("FALKEN", "WILDPEAK A/T 4W", 224.15, 298.87, { golpesMeses: 18 }),
];

const BENEFICIOS = [
  "Todos los servicios de instalación, incluidos alineación y balanceo",
  "Seguro gratuito contra golpes, cortes o cualquier daño que sufra la llanta",
  "Mantenimiento gratuito cada 10.000km para alargar la vida útil de las llantas",
  "Revisión gratuita de su vehículo para que ruede seguro",
];

// Quito es UTC-5 todo el año (no hay horario de verano).
const QUITO = (hora: string) => new Date(`2026-09-12T${hora}:00-05:00`);

describe("modo día y noche", () => {
  it("de 6:00 a 16:59 de Quito sale la clara; de 17:00 a 5:59, la oscura", () => {
    expect(modoDeLaHora(QUITO("05:59"))).toBe("noche");
    expect(modoDeLaHora(QUITO("06:00"))).toBe("dia");
    expect(modoDeLaHora(QUITO("12:00"))).toBe("dia");
    expect(modoDeLaHora(QUITO("16:59"))).toBe("dia");
    expect(modoDeLaHora(QUITO("17:00"))).toBe("noche");
    expect(modoDeLaHora(QUITO("23:30"))).toBe("noche");
    expect(modoDeLaHora(QUITO("00:15"))).toBe("noche");
  });

  it("«siempre de día» y «siempre de noche» no miran la hora", () => {
    expect(resolverModo("dia", QUITO("22:00"))).toBe("dia");
    expect(resolverModo("noche", QUITO("10:00"))).toBe("noche");
    expect(resolverModo("auto", QUITO("10:00"))).toBe("dia");
    expect(resolverModo("auto", QUITO("20:00"))).toBe("noche");
    expect(resolverModo(undefined, QUITO("20:00"))).toBe("noche");
  });
});

describe("el ajuste guardado", () => {
  it("un ajuste viejo, sin plantilla, sigue siendo la clásica", () => {
    const cfg = PiecesConfigSchema.parse({ paleta: "depot", fuente: "barlow" });
    expect(cfg.plantilla).toBe("clasica");
    expect(cfg.modo).toBe("auto");
    expect(cfg.paleta).toBe("depot");
  });

  it("acepta la día y noche con sus tres modos, y nada más", () => {
    for (const modo of ["auto", "dia", "noche"]) {
      expect(PiecesConfigSchema.parse({ plantilla: "diaNoche", modo }).modo).toBe(modo);
    }
    expect(() => PiecesConfigSchema.parse({ plantilla: "diaNoche", modo: "tarde" })).toThrow();
  });
});

describe("opciones día y noche", () => {
  const texto = (data: Partial<Parameters<typeof optionsPosterDiaNoche>[0]> = {}, modo: "dia" | "noche" = "noche") =>
    textoDe(optionsPosterDiaNoche({ dateLabel: "12/09/2026", sizeLabel: "265/70R16", lines: TRES, cantidad: 4, medidaConocida: true, benefits: BENEFICIOS, ...data }, modo));

  it("la cantidad del juego se lee en grande, con el precio del juego y el precio por llanta", () => {
    const t = texto();
    expect(t).toContain("JUEGO DE");
    expect(t).toContain("LLANTAS");
    expect(t).toContain("$581.88");
    expect(t).toContain("$690.20");
    expect(t).toContain("$896.60");
    expect(t).toContain("$172.55");
    expect(t).toContain("por llanta");
  });

  it("si el cliente pidió 2, el juego es de 2 y no de 4", () => {
    const t = texto({ cantidad: 2 });
    expect(t).toContain("$345.10");
    expect(t).not.toContain("$690.20");
  });

  it("el descuento va en la insignia dorada y el ahorro en cada opción", () => {
    const t = texto();
    expect(t).toContain("−25%");
    expect(t).toContain("DESCUENTO");
    expect(t).toContain("ahorra $230.08");
  });

  it("destaca la recomendada, y solo esa", () => {
    const t = texto();
    expect(t.match(/RECOMENDADA/g)?.length).toBe(1);
    const sinRecomendada = texto({ lines: TRES.map((l) => ({ ...l, recomendada: false })) });
    expect(sinRecomendada).not.toContain("RECOMENDADA");
  });

  it("una equivalente sigue diciendo con todas las letras que no es su medida exacta", () => {
    const t = texto({ lines: [TRES[0], { ...TRES[1], sizeLabel: "265/65R16", medidaExacta: false }] });
    expect(t).toContain("OPCIONES QUE LE MONTAN");
    expect(t.toLowerCase()).toContain("no es su medida exacta");
    expect(t).toContain("265/65R16");
    expect(t).not.toContain("PARA SU MEDIDA");
  });

  it("sin medida del cliente no promete «su medida»", () => {
    const t = texto({ medidaConocida: false, lines: TRES.map((l) => ({ ...l, medidaExacta: false, medidaPorConfirmar: true })) });
    expect(t).not.toContain("PARA SU MEDIDA");
    expect(t).toContain("POR CONFIRMAR");
  });

  it("lo incluido sale con los beneficios de la tabla, no con un texto inventado", () => {
    const t = texto();
    expect(t).toContain("INSTALACIÓN COMPLETA");
    expect(t).toContain("alineación y balanceo");
    expect(t).toContain("REVISIÓN DEL VEHÍCULO");
    expect(texto({ benefits: [] })).not.toContain("SIN COSTO");
  });

  it("el título cuenta las opciones que de verdad hay", () => {
    expect(texto({ lines: TRES.slice(0, 2) })).toContain("DOS OPCIONES PARA SU MEDIDA");
    expect(texto()).toContain("TRES OPCIONES PARA SU MEDIDA");
  });

  it("una foto con fondo blanco (JPG del catálogo) va sobre recuadro blanco, también de noche", () => {
    const RECUADRO_OSCURO = "radial-gradient(circle at 50% 45%, #2a2a30";
    const conFondo = TRES.map((l) => ({ ...l, photoUri: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" }));
    expect(JSON.stringify(optionsPosterDiaNoche({ dateLabel: "x", lines: conFondo, cantidad: 4 }, "noche"))).not.toContain(RECUADRO_OSCURO);
    // Transparente (o sin poder saberlo): el recuadro del diseño.
    expect(JSON.stringify(optionsPosterDiaNoche({ dateLabel: "x", lines: TRES, cantidad: 4 }, "noche"))).toContain(RECUADRO_OSCURO);
  });

  it("día pinta el fondo blanco y noche el oscuro", () => {
    const dia = JSON.stringify(optionsPosterDiaNoche({ dateLabel: "x", lines: TRES, cantidad: 4 }, "dia"));
    const noche = JSON.stringify(optionsPosterDiaNoche({ dateLabel: "x", lines: TRES, cantidad: 4 }, "noche"));
    expect(dia).toContain("#ffffff");
    expect(noche).toContain("#09090b");
    expect(dia).not.toContain("#09090b");
  });
});

describe("cotización día y noche", () => {
  const cotizacion = (line = TRES[1], extra: Record<string, unknown> = {}) =>
    textoDe(quotePosterDiaNoche({ number: "COT-MT7HFCOQ", dateLabel: "12/09/2026", line, total: 690.2, benefits: BENEFICIOS, ...extra }, "dia"));

  it("precio por llanta, cantidad, total y ahorro, todos a la vista", () => {
    const t = cotizacion();
    expect(t).toContain("PRECIO POR LLANTA");
    expect(t).toContain("$172.55");
    expect(t).toContain("$690.20");
    expect(t).toContain("LLANTAS");
    expect(t).toContain("−25%");
    expect(t).toContain("$230.07");
    expect(t).toContain("INCLUIDO SIN COSTO");
    expect(t).toContain("COT-MT7HFCOQ");
  });

  it("si la marca no trae seguro contra golpes, la pieza no lo promete", () => {
    const t = cotizacion({ ...TRES[1], golpesMeses: null });
    expect(t).not.toContain("meses de seguro");
    expect(t).toContain("Garantía de fábrica");
  });

  it("sin precio de lista no inventa un descuento", () => {
    const t = cotizacion({ ...TRES[1], pvpConIva: null });
    expect(t).not.toContain("−25%");
    expect(t).not.toContain("ANTES");
  });

  it("el descuento adicional autorizado por el dueño también se ve", () => {
    const t = cotizacion(TRES[1], { discountAmount: 20, discountCondition: "pagando en efectivo" });
    expect(t).toContain("−$20.00");
    expect(t).toContain("pagando en efectivo");
  });
});

describe("de punta a punta con el motor de imágenes", () => {
  const wire = (codigo: string, nombre: string, marca: string, pvp1: number, stock: number) =>
    normalizeContificoProduct(
      { id: codigo, codigo, nombre, marca_nombre: marca, estado: "A", tipo: "P", pvp1, porcentaje_iva: 15, cantidad_stock: stock },
      "pvp1",
    )!;
  const CATALOGO = [
    wire("MAXCLAW", "265/70R16 112T MAXCLAW A/T WINRUN", "WINRUN", 126.5, 9),
    wire("KR628", "265/70R16 112T KR628 KENDA", "KENDA", 150.04, 12),
    wire("AT4W", "265/70R16 112T WILDPEAK A/T 4W", "FALKEN", 194.91, 6),
  ];

  it("día y noche salen distintas, la automática respeta la hora, y todo pesa menos que el tope de Meta", async () => {
    const products = await Promise.all(CATALOGO.map((p) => toRenderLine(p)));
    const base = {
      dateLabel: "12/09/2026", sizeLabel: "265/70R16", medidaPedida: "265/70R16", products,
      plantilla: "diaNoche", cantidad: 4, codigoRecomendado: "KR628", benefits: BENEFICIOS,
    };
    const dia = await renderOptionsImage({ ...base, modo: "dia" });
    const noche = await renderOptionsImage({ ...base, modo: "noche" });
    const autoManana = await renderOptionsImage({ ...base, modo: "auto", ahora: QUITO("10:00") });
    expect(dia.equals(noche)).toBe(false);
    expect(autoManana.equals(dia)).toBe(true);
    for (const png of [dia, noche]) expect(png.byteLength / 1_048_576).toBeLessThan(4.5);

    const quote = await renderQuoteImage({
      number: "COT-1", dateLabel: "12/09/2026", lines: [await toRenderLine(CATALOGO[1], 4)],
      subtotal: 600, iva: 90.2, total: 690.2, plantilla: "diaNoche", modo: "noche", benefits: BENEFICIOS,
    });
    expect(quote.byteLength / 1_048_576).toBeLessThan(4.5);
  }, 30_000);
});
