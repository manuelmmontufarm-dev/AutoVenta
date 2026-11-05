/**
 * EL PERFIL DE MUNDILLANTAS / COMPETIMOTOR (R-03, R-06, R-07).
 *
 * Corre el bot con `NEGOCIO=mundillantas`: fija que el perfil tenga SOLO lo
 * confirmado en el pitch del 4-nov, que se presente con las dos marcas, que
 * los detectores reconozcan las dos y que su cupón vaya y vuelva por caja.
 */
import { describe, expect, it } from "vitest";

// El perfil se elige al cargar el módulo: la variable va ANTES de los imports,
// que por eso son dinámicos (mismo patrón que perfilDelNegocio.test.ts).
process.env.NEGOCIO = "mundillantas";
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { negocio, firmaDePresentacion, inicialesDelNegocio } = await import("../src/negocio/index.js");
const { identidades, identidadDeLaConversacion } = await import("../src/negocio/identidad.js");
const { FIRMA_DE_PRESENTACION, ES_PRESENTACION_DEL_NEGOCIO, presentacionDeApertura } =
  await import("../src/domain/saludo.js");
const { comproEnOtroLugar } = await import("../src/domain/cierrePerdido.js");
const { localesInventados } = await import("../src/domain/localesInventados.js");
const { PREFIJO_CUPON, generarCodigoCupon, normalizarCodigoCupon } = await import("../src/domain/coupons.js");
const { warrantyForBrand } = await import("../src/services/quoteMessages.js");

describe("Mundillantas · solo lo confirmado", () => {
  it("es el perfil vivo de esta instancia", () => {
    expect(negocio.id).toBe("mundillantas");
    expect(negocio.ciudad).toBe("Santo Domingo");
    expect(negocio.iva).toBe(0.15);
    expect(negocio.moneda).toBe("USD");
  });

  it("lunes a sábado 08:00–18:00, domingo cerrado", () => {
    for (const dia of [1, 2, 3, 4, 5, 6]) expect(negocio.horasPorDia[dia]).toEqual({ open: "08:00", close: "18:00" });
    expect(negocio.horasPorDia[0]).toBeNull();
  });

  it("dos marcas: Mundillantas (2 locales) y Competimotor (1)", () => {
    expect(identidades(negocio)).toEqual([
      { id: "mundillantas", nombre: "Mundillantas", locales: ["matriz", "local2"] },
      { id: "competimotor", nombre: "Competimotor", locales: ["competimotor"] },
    ]);
    expect(negocio.presentacion).toEqual({ modo: "combinada", frase: "Mundillantas y Competimotor" });
  });

  it("la matriz en la Av. Quevedo km 1, con el pin del Plus Code PRQ7+887", () => {
    const matriz = negocio.locales.find((l) => l.slug === "matriz")!;
    expect(matriz.direccion).toBe("Av. Quevedo km 1, Santo Domingo");
    // 67F2PRQ7+887 decodificado: dentro de Santo Domingo de los Tsáchilas.
    expect(matriz.lat).toBeCloseTo(-0.2617, 3);
    expect(matriz.lng).toBeCloseTo(-79.1867, 3);
  });

  it("nada inventado: sin sectores, sin marcas, sin facturación, garantías en 0", () => {
    expect(negocio.sectores).toEqual([]);
    expect(negocio.marcas).toEqual([]);
    expect(negocio.facturacion).toBeUndefined();
    expect(negocio.garantias).toEqual({ default: { golpesMeses: 0, fabricaAnios: 0 } });
    expect(negocio.vendedor.nombre.startsWith("[PENDIENTE]")).toBe(true);
    expect(negocio.palabrasDeLugarPropias).toEqual(["mundillantas", "mundi", "competimotor"]);
  });
});

describe("Mundillantas · cómo se presenta", () => {
  it("con las dos marcas, y sin el nombre pendiente del vendedor", () => {
    expect(FIRMA_DE_PRESENTACION).toBe("Soy el asistente de Mundillantas y Competimotor");
    expect(firmaDePresentacion(negocio)).toBe(FIRMA_DE_PRESENTACION);
    expect(presentacionDeApertura("Jenny")).toContain("¡Hola, Jenny! 👋 Soy el asistente de Mundillantas y Competimotor.");
  });

  it("reconoce su presentación por cualquiera de las dos marcas", () => {
    expect(ES_PRESENTACION_DEL_NEGOCIO.test("soy el asistente de mundillantas y competimotor")).toBe(true);
    expect(ES_PRESENTACION_DEL_NEGOCIO.test("soy el asistente de competimotor")).toBe(true);
    // La de Depot no es la suya.
    expect(ES_PRESENTACION_DEL_NEGOCIO.test("soy martin, de depot tire")).toBe(false);
  });
});

describe("Mundillantas · los detectores conocen las dos marcas", () => {
  it("comprar en Competimotor o en Mundillantas no es una venta perdida", () => {
    expect(comproEnOtroLugar("ya compré en competimotor")).toBe(false);
    expect(comproEnOtroLugar("ya compré aquí en mundillantas")).toBe(false);
    expect(comproEnOtroLugar("ya compré con ustedes")).toBe(false);
    expect(comproEnOtroLugar("ya conseguí aquí en Quevedo")).toBe(true);
    expect(comproEnOtroLugar("ya compre en otro lado")).toBe(true);
  });

  it("un local inventado con el nombre de cualquiera de las marcas sale a la luz", () => {
    const reales = negocio.locales.map((l) => l.nombre);
    expect(localesInventados("Puede pasar por Competimotor Norte", reales)).toContain("Norte");
    expect(localesInventados("Puede pasar por Mundillantas Chone", reales)).toContain("Chone");
    expect(localesInventados("Puede pasar por Mundillantas Matriz", reales)).toEqual([]);
  });
});

describe("Mundillantas · un prefijo de cupón por negocio", () => {
  it("las iniciales de la presentación, sin el «y»", () => {
    expect(inicialesDelNegocio(negocio)).toBe("MC");
    expect(PREFIJO_CUPON).toBe("MC-");
  });

  it("ida y vuelta por caja, como lo dicte el cliente", () => {
    const codigo = generarCodigoCupon(() => 0.5);
    expect(codigo.startsWith("MC-")).toBe(true);
    expect(normalizarCodigoCupon(codigo)).toBe(codigo);
    const cuerpo = codigo.slice(3);
    expect(normalizarCodigoCupon(`mc ${cuerpo.toLowerCase()}`)).toBe(codigo);
    expect(normalizarCodigoCupon(cuerpo)).toBe(codigo);
  });
});

describe("Mundillantas · garantías sin confirmar", () => {
  it("ninguna marca promete seguro ni años de fábrica", () => {
    for (const marca of ["FALKEN", "KENDA", "WINRUN", "MAXXIS"]) {
      const g = warrantyForBrand(marca);
      expect(g.roadHazard).toBeNull();
      expect(g.roadHazardMonths).toBeNull();
      expect(g.factory).toBe("Garantía de fábrica por confirmar con el asesor");
    }
  });
});

describe("Mundillantas · identidad de la conversación", () => {
  it("el local de Competimotor habla como Competimotor", () => {
    expect(identidadDeLaConversacion(negocio, "Competimotor").nombre).toBe("Competimotor");
    expect(identidadDeLaConversacion(negocio, null).nombre).toBe("Mundillantas");
  });
});
