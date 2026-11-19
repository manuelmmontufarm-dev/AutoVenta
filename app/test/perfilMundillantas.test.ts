/**
 * EL PERFIL DE MUNDILLANTAS / COMPETIMOTOR (R-03, R-06, R-07).
 *
 * Corre el bot con `NEGOCIO=mundillantas`: fija que el perfil tenga SOLO lo
 * confirmado en el pitch del 4-nov y en las respuestas de Jenny del 6-nov, que
 * su cupón vaya y vuelva por caja, y —desde el cierre del 18-nov— que el
 * servicio sea SOLO Competimotor: los datos de los tres locales siguen en el
 * perfil del negocio (`MUNDILLANTAS`), pero el perfil vivo es el de una marca.
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
const { MUNDILLANTAS } = await import("../src/negocio/negocios/mundillantas.js");
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

  it("lunes a viernes 08:00–18:00, sábado 08:00–16:00, domingo cerrado (Jenny, 8-nov)", () => {
    for (const dia of [1, 2, 3, 4, 5]) expect(negocio.horasPorDia[dia]).toEqual({ open: "08:00", close: "18:00" });
    expect(negocio.horasPorDia[6]).toEqual({ open: "08:00", close: "16:00" });
    expect(negocio.horasPorDia[0]).toBeNull();
  });

  it("el bot usa el número de Competimotor que dio Jenny el 8-nov", () => {
    expect(negocio.telefono).toBe("+593 98 548 7924");
  });

  it("INCLUYE: enllantaje, balanceo y nitrógeno siempre; alineación solo con 4 (8-nov); mantenimiento con 2 o 4 (18-nov)", () => {
    expect(negocio.beneficiosDeArranque).toEqual([
      { text: "Enllantaje, balanceo y nitrógeno" },
      { text: "Alineación (comprando las 4 llantas)", minQuantity: 4 },
      { text: "Mantenimiento cada 10.000 km: rotación, revisión mecánica y nitrógeno (comprando 2 o 4 llantas)", minQuantity: 2 },
    ]);
    expect(negocio.piezas.todasIncluyen.startsWith("[PENDIENTE]")).toBe(false);
  });

  it("dos marcas en el negocio: Mundillantas (2 locales) y Competimotor (1); el servicio es Competimotor", () => {
    expect(identidades(MUNDILLANTAS).map(({ id, nombre, locales }) => ({ id, nombre, locales }))).toEqual([
      { id: "mundillantas", nombre: "Mundillantas", locales: ["matriz", "local2"] },
      { id: "competimotor", nombre: "Competimotor", locales: ["competimotor"] },
    ]);
    expect(MUNDILLANTAS.identidadPorDefecto).toBe("competimotor");
    expect(identidades(negocio)).toEqual([{ id: "competimotor", nombre: "Competimotor", locales: ["competimotor"] }]);
    expect(negocio.presentacion).toEqual({ modo: "fija", identidad: "competimotor" });
    expect(negocio.marcasHermanas).toEqual(["Mundillantas"]);
  });

  it("los tres locales con la dirección que dio Jenny (6-nov) y los pines del 9-nov", () => {
    const por = (slug: string) => MUNDILLANTAS.locales.find((l) => l.slug === slug)!;
    expect(por("matriz").nombre).toBe("Mundillantas Falken");
    expect(por("matriz").direccion).toContain("Vía Quevedo km 2 y Manuel Borrero");
    // Pines y links que mandó Jenny el 9-nov (Google Maps de cada local).
    expect(por("matriz").lat).toBeCloseTo(-0.2617224, 6);
    expect(por("matriz").lng).toBeCloseTo(-79.186715, 6);
    expect(por("matriz").mapsUrl).toBe("https://maps.app.goo.gl/swNHGotRKPLJn3LZA");
    expect(por("local2").nombre).toBe("Mundillantas Kenda");
    expect(por("local2").direccion).toContain("a una cuadra del Banco Pichincha");
    expect(por("competimotor").direccion).toContain("Juan León Mera #834");
    expect(por("competimotor").lat).toBeCloseTo(-0.2595733, 6);
    expect(por("competimotor").lng).toBeCloseTo(-79.1829972, 6);
    expect(por("competimotor").mapsUrl).toBe("https://maps.app.goo.gl/QTFCzK2KDRXULRwz7");
    // Kenda sigue sin pin propio: NUNCA el link de otro local. Desde el 17-nov
    // lleva la búsqueda de Google Maps con su propio nombre y dirección.
    expect(por("local2").mapsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Mundillantas%20Kenda/);
    expect(por("local2").mapsUrl).not.toBe(por("matriz").mapsUrl);
    for (const l of MUNDILLANTAS.locales) expect(l.nombreCorto.length).toBeLessThanOrEqual(20);
    // El servicio de Competimotor solo conoce el suyo.
    expect(negocio.locales.map((l) => l.slug)).toEqual(["competimotor"]);
  });

  it("nombrar una marca de llanta o la Vía Quevedo no elige local", () => {
    const eligen = (texto: string) => MUNDILLANTAS.locales.filter((l) => l.comoLoNombran.test(texto)).map((l) => l.slug);
    for (const texto of ["quiero unas falken", "tiene kenda", "estoy por la via quevedo", "vivo en pichincha"]) {
      expect(eligen(texto)).toEqual([]);
    }
    expect(eligen("voy al de mundillantas falken")).toEqual(["matriz"]);
    expect(eligen("el de manuel borrero")).toEqual(["matriz"]);
    expect(eligen("el mundi kenda")).toEqual(["local2"]);
    expect(eligen("el que esta cerca del banco pichincha")).toEqual(["local2"]);
    expect(eligen("en competimotor")).toEqual(["competimotor"]);
    expect(eligen("juan leon mera")).toEqual(["competimotor"]);
  });

  it("nada inventado: sin sectores, sin facturación, garantías solo de las cuatro marcas que dio Jenny (18-nov)", () => {
    expect(negocio.sectores).toEqual([]);
    expect(negocio.marcas).toEqual(["Kenda", "Falken", "Winrun", "Maxxis"]);
    expect(negocio.facturacion).toBeUndefined();
    expect(negocio.garantias).toEqual({
      default: { golpesMeses: 0, fabricaAnios: 0 },
      Kenda: { golpesMeses: 12, fabricaAnios: 1 },
      Falken: { golpesMeses: 18, fabricaAnios: 1.5 },
      Winrun: { golpesMeses: 6, fabricaAnios: 0.5 },
      Maxxis: { golpesMeses: 12, fabricaAnios: 1 },
    });
    expect(negocio.vendedor.nombre.startsWith("[PENDIENTE]")).toBe(true);
    expect(negocio.palabrasDeLugarPropias).toEqual(["mundillantas", "mundi", "competimotor"]);
  });
});

describe("Competimotor · cómo se presenta", () => {
  it("solo con su marca (cierre del 18-nov), y sin el nombre pendiente del vendedor", () => {
    expect(FIRMA_DE_PRESENTACION).toBe("Soy el asistente de Competimotor");
    expect(firmaDePresentacion(negocio)).toBe(FIRMA_DE_PRESENTACION);
    expect(presentacionDeApertura("Jenny")).toContain("¡Hola, Jenny! 👋 Soy el asistente de Competimotor.");
  });

  it("reconoce su presentación, también la combinada de los chats de antes del 18-nov", () => {
    expect(ES_PRESENTACION_DEL_NEGOCIO.test("soy el asistente de competimotor y mundillantas")).toBe(true);
    expect(ES_PRESENTACION_DEL_NEGOCIO.test("soy el asistente de competimotor")).toBe(true);
    // La de Depot no es la suya.
    expect(ES_PRESENTACION_DEL_NEGOCIO.test("soy martin, de depot tire")).toBe(false);
  });
});

describe("Competimotor · los detectores y la marca hermana", () => {
  it("comprar en Competimotor no es una venta perdida; en Mundillantas sí lo es para este bot", () => {
    // Dos marcas que miden sus ventas por separado (acta 18-nov, 04:40).
    expect(comproEnOtroLugar("ya compré en competimotor")).toBe(false);
    expect(comproEnOtroLugar("ya compré aquí en mundillantas")).toBe(true);
    expect(comproEnOtroLugar("ya compré con ustedes")).toBe(false);
    expect(comproEnOtroLugar("ya conseguí aquí en Quevedo")).toBe(true);
    expect(comproEnOtroLugar("ya compre en otro lado")).toBe(true);
  });

  it("un local inventado sale a la luz, y uno de Mundillantas también: este bot no lo tiene", () => {
    const reales = negocio.locales.map((l) => l.nombre);
    expect(localesInventados("Puede pasar por Competimotor Norte", reales)).toContain("Norte");
    expect(localesInventados("Puede pasar por Mundillantas Kenda", reales)).toContain("Mundillantas Kenda");
    expect(localesInventados("o en *Mundillantas Falken*", reales)).toContain("Mundillantas Falken");
    expect(localesInventados("también somos mundillantas", reales)).toContain("mundillantas");
    expect(localesInventados("Puede pasar por Competimotor", reales)).toEqual([]);
  });
});

describe("Mundillantas · un prefijo de cupón por negocio", () => {
  it("las iniciales de la marca del servicio", () => {
    // «Competimotor» (18-nov) → CO. La base de producción tenía 0 cupones al
    // cambiar (consultado el 18-nov), así que no queda ningún CM- huérfano.
    expect(inicialesDelNegocio(negocio)).toBe("CO");
    expect(PREFIJO_CUPON).toBe("CO-");
  });

  it("ida y vuelta por caja, como lo dicte el cliente", () => {
    const codigo = generarCodigoCupon(() => 0.5);
    expect(codigo.startsWith("CO-")).toBe(true);
    expect(normalizarCodigoCupon(codigo)).toBe(codigo);
    const cuerpo = codigo.slice(3);
    expect(normalizarCodigoCupon(`co ${cuerpo.toLowerCase()}`)).toBe(codigo);
    expect(normalizarCodigoCupon(cuerpo)).toBe(codigo);
  });
});

describe("Mundillantas · garantías", () => {
  // Desde el 18-nov las cuatro marcas tienen cifras (ver competimotorRespuestas18nov).
  it("una marca que Jenny no nombró no promete seguro ni años de fábrica", () => {
    for (const marca of ["SAILUN", "TOYO", "HAIDA"]) {
      const g = warrantyForBrand(marca);
      expect(g.roadHazard).toBeNull();
      expect(g.roadHazardMonths).toBeNull();
      expect(g.factory).toBe("Garantía de fábrica por confirmar con el asesor");
    }
  });
});

describe("Competimotor · identidad de la conversación", () => {
  it("siempre Competimotor: con su local, sin local, o con uno viejo de Mundillantas", () => {
    expect(identidadDeLaConversacion(negocio, "Competimotor").nombre).toBe("Competimotor");
    expect(identidadDeLaConversacion(negocio, null).nombre).toBe("Competimotor");
    expect(identidadDeLaConversacion(negocio, "Mundillantas Falken").nombre).toBe("Competimotor");
  });
});
