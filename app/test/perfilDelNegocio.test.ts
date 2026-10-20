/**
 * EL PERFIL NO PUEDE CAMBIARLE NADA A DEPOT.
 *
 * El 24-sep-2026 se sacaron de `src/` el nombre del negocio, sus locales, las
 * zonas de Quito, los horarios y los pies de las piezas, y se pusieron en
 * `src/negocio/negocios/depot.ts`. Todo lo que antes era un literal ahora se
 * arma a partir del perfil, y esta prueba fija que lo armado sea BYTE POR BYTE
 * lo que el cliente ya tenía: un refactor que le cambia una frase al cliente no
 * es un refactor.
 *
 * Cuando de verdad haya que cambiarle un texto a Depot, se cambia acá también,
 * a propósito y en el mismo commit.
 */
import { describe, expect, it } from "vitest";

// `config.ts` y `db/client.ts` exigen credenciales al cargar, y esta prueba solo
// mira datos del negocio: valores de mentira ANTES de los imports, que por eso
// son dinámicos (mismo patrón que vision.test.ts).
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { business } = await import("../src/config.js");
const { negocio, localesEnUnaLinea, pieDeLocales, firmaDePresentacion, localPorNombre } =
  await import("../src/negocio/index.js");
const { PREGUNTA_DE_LOCAL, extractExplicitStore } = await import("../src/domain/storeSelection.js");
const { ES_PRESENTACION_DEL_NEGOCIO, FIRMA_DE_PRESENTACION, NOMBRE_DEL_VENDEDOR } =
  await import("../src/domain/saludo.js");
const { LOCATION_WORDS, resolveSector } = await import("../src/domain/locations.js");
const { DEFAULT_STORE_HOURS, formatStoreHours } = await import("../src/services/settings.js");
const { sinVisitaNiMapas } = await import("../src/domain/visitaImposible.js");
const { comproEnOtroLugar } = await import("../src/domain/cierrePerdido.js");
const { localesInventados } = await import("../src/domain/localesInventados.js");
const { INSTRUCCIONES } = await import("../src/services/guardian.js");
const { PREFIJO_CUPON } = await import("../src/domain/coupons.js");

describe("el perfil de Depot · identidad del negocio", () => {
  it("business sigue diciendo lo mismo que cuando estaba escrito a mano", () => {
    expect(business.name).toBe("Depot Tire");
    expect(business.phone).toBe("+593 98 280 1766");
    expect(business.schedule).toBe("Lunes a sábado, 8:30–17:30");
    expect(business.taxRate).toBe(0.15);
    expect(business.currency).toBe("USD");
    expect(business.brands).toEqual(["Kenda", "Sunoco", "Eurolub", "Falken"]);
    expect(business.warranties).toEqual({
      default: { golpesMeses: 6, fabricaAnios: 5 },
      Kenda: { golpesMeses: 12, fabricaAnios: 5 },
      Falken: { golpesMeses: 18, fabricaAnios: 5 },
    });
  });

  it("los dos locales, con su dirección, coordenadas y mapa", () => {
    expect(business.stores).toEqual([
      {
        name: "Depot Tire Cumbayá",
        address: "C.C. La del Establo y Av. Oswaldo Guayasamín, Cumbayá",
        lat: -0.198,
        lng: -78.443,
        mapsUrl: "https://maps.app.goo.gl/QnMBPXKc1o8igbsp8",
      },
      {
        name: "Depot Tire Quito Sur",
        address: "Galo Molina y Av. Alonso de Angulo, Quito",
        lat: -0.2487128,
        lng: -78.5296804,
        mapsUrl: "https://maps.app.goo.gl/NQeNN8csyAnRkJDJ7",
      },
    ]);
  });

  it("el bot es Martín, de Depot Tire, y se reconoce su firma y la anterior", () => {
    expect(NOMBRE_DEL_VENDEDOR).toBe("Martín");
    expect(FIRMA_DE_PRESENTACION).toBe("Soy Martín, de Depot Tire");
    expect(firmaDePresentacion(negocio)).toBe("Soy Martín, de Depot Tire");
    // El reconocedor recibe el texto ya sin tildes.
    expect(ES_PRESENTACION_DEL_NEGOCIO.test("soy martin, de depot tire")).toBe(true);
    expect(ES_PRESENTACION_DEL_NEGOCIO.test("soy martin de depot tire")).toBe(true);
    // La firma vieja sigue en el historial de los chats abiertos antes del cambio.
    expect(ES_PRESENTACION_DEL_NEGOCIO.test("soy el asistente de depot tire")).toBe(true);
    expect(ES_PRESENTACION_DEL_NEGOCIO.test("hola, le cotizo al instante")).toBe(false);
  });
});

describe("el perfil de Depot · los locales", () => {
  it("la pregunta de local es la misma frase de siempre", () => {
    expect(PREGUNTA_DE_LOCAL).toBe("¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*?");
  });

  it("reconoce el local exactamente como antes del refactor", () => {
    // Nombrarlo alcanza.
    expect(extractExplicitStore("Cumbayá")).toBe("Depot Tire Cumbayá");
    expect(extractExplicitStore("quito sur")).toBe("Depot Tire Quito Sur");
    expect(extractExplicitStore("el local del sur")).toBe("Depot Tire Quito Sur");
    // «al de quito» solo cuando acabamos de preguntar a cuál local (conv 3, 27-ago).
    expect(extractExplicitStore("al de quito")).toBeNull();
    expect(extractExplicitStore("al de quito", { respondiendoAlLocal: true })).toBe("Depot Tire Quito Sur");
    expect(extractExplicitStore("al sur me resulta mas facil", { respondiendoAlLocal: true })).toBe("Depot Tire Quito Sur");
    // Contar dónde vive o cuándo sube NO es elegir (convs 18821 y 18221).
    expect(extractExplicitStore("Yo el lunes voy a estar en quito", { respondiendoAlLocal: true })).toBeNull();
    // Nombrar los dos tampoco es elegir.
    expect(extractExplicitStore("cumbaya o quito sur", { respondiendoAlLocal: true })).toBeNull();
    expect(extractExplicitStore("hola")).toBeNull();
  });

  it("un local se encuentra por nombre, nombre corto o slug", () => {
    expect(localPorNombre(negocio, "Depot Tire Cumbayá")?.slug).toBe("cumbaya");
    expect(localPorNombre(negocio, "Quito Sur")?.slug).toBe("quito_sur");
    expect(localPorNombre(negocio, "quito_sur")?.claveHorario).toBe("quitoSur");
    expect(localPorNombre(negocio, "Depot Tire Guayaquil")).toBeNull();
    expect(localPorNombre(negocio, null)).toBeNull();
  });
});

describe("el perfil de Depot · los horarios", () => {
  it("las claves guardadas en producción no cambian", () => {
    // `settings.store_hours` ya tiene datos con estas dos claves: renombrarlas
    // sería una migración, y este refactor no la hace.
    expect(Object.keys(DEFAULT_STORE_HOURS).sort()).toEqual(["cumbaya", "quitoSur"]);
  });

  it("Cumbayá abre medio día el finde y Quito Sur cierra", () => {
    expect(DEFAULT_STORE_HOURS.cumbaya.weekday).toMatchObject({ open: "08:30", close: "17:30", closed: false });
    expect(DEFAULT_STORE_HOURS.cumbaya.weekend).toMatchObject({ open: "08:30", close: "14:30", closed: false });
    expect(DEFAULT_STORE_HOURS.quitoSur.weekday).toMatchObject({ open: "08:30", close: "17:30", closed: false });
    expect(DEFAULT_STORE_HOURS.quitoSur.weekend).toMatchObject({ closed: true });
  });

  it("el horario que va al prompt se lee igual que antes", () => {
    expect(formatStoreHours(DEFAULT_STORE_HOURS, "2026-09-24")).toBe(
      "Cumbayá: lunes a viernes 08:30–17:30; sábado y domingo 08:30–14:30."
      + " Quito Sur: lunes a viernes 08:30–17:30; sábado y domingo cerrado.",
    );
  });
});

describe("el perfil de Depot · las zonas de Quito", () => {
  it("resuelve los sectores que costó descubrir", () => {
    expect(resolveSector("al sur de Quito")?.label).toBe("sur de Quito");
    expect(resolveSector("vlle de los chillos")?.label).toBe("Valle de los Chillos");
    expect(resolveSector("Cumbayá")?.label).toBe("Cumbayá");
    expect(resolveSector("Tumbaco")?.label).toBe("Tumbaco");
    expect(resolveSector("en Guayaquil")).toBeNull();
  });

  it("el orden manda: lo específico antes que lo genérico", () => {
    // «al sur de Quito» contiene las dos palabras y tiene que dar el sur, no el centro.
    expect(resolveSector("al sur de Quito")?.label).not.toBe("Quito");
  });

  it("el vocabulario de lugar trae lo del negocio y lo genérico", () => {
    for (const palabra of ["cumbaya", "sur", "quito", "depot", "tire", "local", "mapa", "norte"]) {
      expect(LOCATION_WORDS).toContain(palabra);
    }
  });
});

describe("el perfil de Depot · los pies de las piezas", () => {
  it("cada plantilla conserva su frase, que no era la misma", () => {
    expect(localesEnUnaLinea(negocio)).toBe("Cumbayá · Quito Sur");
    // La de día y noche dice «desde 1996»; la clásica, «30 años».
    expect(pieDeLocales(negocio)).toBe("Cumbayá · Quito Sur · desde 1996");
    expect(pieDeLocales(negocio, negocio.piezas.antiguedadClasica)).toBe("Cumbayá · Quito Sur · 30 años");
  });

  it("las condiciones y lo incluido siguen palabra por palabra", () => {
    expect(negocio.piezas.condiciones).toBe(
      "Precios incluyen IVA y Ecovalor · por unidad · 3 y 6 meses sin intereses",
    );
    expect(negocio.piezas.todasIncluyen).toBe(
      "Instalación completa · seguro contra golpes y cortes · mantenimiento cada 10.000 km · revisión del vehículo",
    );
  });
});

describe("un negocio con UN solo local no rompe nada", () => {
  it("la línea de locales y el pie se leen bien sin el segundo", () => {
    const uno = { ...negocio, locales: [negocio.locales[0]] };
    expect(localesEnUnaLinea(uno)).toBe("Cumbayá");
    expect(pieDeLocales(uno)).toBe("Cumbayá · desde 1996");
    expect(pieDeLocales({ ...uno, piezas: { ...uno.piezas, antiguedad: "" } })).toBe("Cumbayá");
  });

  it("con muchos locales la línea no se vuelve ilegible", () => {
    const cinco = {
      ...negocio,
      locales: ["A", "B", "C", "D", "E"].map((n) => ({ ...negocio.locales[0], nombreCorto: n })),
    };
    expect(localesEnUnaLinea(cinco)).toBe("A · B · C y 2 más");
  });
});

describe("los candados que llevaban los nombres cosidos al patrón", () => {
  it("la pregunta de local se reconoce con tilde y sin tilde", () => {
    // Estos patrones corren sobre el texto TAL COMO SE ESCRIBIÓ: si el perfil
    // los generara sin tildes, el candado se abriría en silencio.
    expect(sinVisitaNiMapas("¿Cumbayá o Quito Sur? 📍").quitado).toBe(true);
    expect(sinVisitaNiMapas("¿Cumbaya o Quito Sur?").quitado).toBe(true);
    expect(sinVisitaNiMapas("Su cotización está lista.").quitado).toBe(false);
  });

  it("comprar en uno de nuestros locales no es una venta perdida", () => {
    expect(comproEnOtroLugar("Ya Ise el pedido aquí en Ibarra gracias")).toBe(true);
    expect(comproEnOtroLugar("ya compré aquí en cumbaya")).toBe(false);
    expect(comproEnOtroLugar("ya compré con ustedes")).toBe(false);
    // Cotizar en otra parte sigue siendo negociación, no una compra.
    expect(comproEnOtroLugar("hice la cotización acá en Cayambe")).toBe(false);
  });

  it("una sucursal que el bot se inventó sigue saliendo a la luz", () => {
    const reales = ["Depot Tire Cumbayá", "Depot Tire Quito Sur"];
    expect(localesInventados("Puede pasar por Depot Tire Norte", reales)).toContain("Norte");
    expect(localesInventados("Puede pasar por Depot Tire Cumbayá", reales)).toEqual([]);
  });
});

describe("el perfil de Depot · lo que ve el guardián y el cupón", () => {
  it("la rúbrica del guardián nombra al negocio y a su ciudad, sin cambiar el texto", () => {
    // Renderiza IGUAL que cuando estaba escrito a mano, así que el caché del
    // prompt del guardián no se invalida: solo deja de estar clavado.
    expect(INSTRUCCIONES).toContain("ÁNGEL GUARDIÁN del bot de ventas de Depot Tire (llantas, Quito)");
  });

  it("el prefijo del cupón sale de las iniciales del negocio", () => {
    expect(PREFIJO_CUPON).toBe("DT-");
  });
});
