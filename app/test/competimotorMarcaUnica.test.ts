/**
 * EL BOT DE COMPETIMOTOR HABLA SOLO COMO COMPETIMOTOR (cierre del 18-nov-2026).
 *
 * Acta `docs/reuniones/2026-11-18-competimotor-cierre.md`, 31:12–32:20: Jenny
 * vio el saludo «Competimotor y Mundillantas» y el encabezado del PDF con las
 * dos marcas y dijo «esto no puede pasar». Son dos marcas que se venden por
 * separado, con asesores distintos. El servicio de Railway que hoy existe
 * (`NEGOCIO=mundillantas`, número «Competimotor Online») tiene que ser SOLO
 * Competimotor: un cliente no ve la palabra «Mundillantas» en ningún lado.
 *
 * Y como ese servicio tiene un solo local, el bot no pregunta «a cuál local»:
 * manda «Aquí queda nuestro local» con el mapa y pregunta el día (Manuel,
 * 18-nov, tarde). Es regla del perfil —un local, ninguna pregunta—, no un `if`
 * por nombre de negocio.
 */
import { describe, expect, it } from "vitest";

// El perfil se elige al cargar el módulo: la variable va ANTES de los imports.
// SIN `IDENTIDAD`: es exactamente lo que tiene hoy el servicio de Railway.
process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { readFileSync } = await import("node:fs");
const path = await import("node:path");
const { negocio, fraseDePresentacion, inicialesDelNegocio } = await import("../src/negocio/index.js");
const { identidadDeLaPieza, identidadDeLaConversacion } = await import("../src/negocio/identidad.js");
const { presentacionDeApertura, FIRMA_DE_PRESENTACION } = await import("../src/domain/saludo.js");
const { hayQueElegirLocal } = await import("../src/domain/storeSelection.js");
const { buildStoreChoiceBlocks, buildVisitPlanQuestion } = await import("../src/services/quoteMessages.js");
const quotePdf = await import("../src/services/quotePdf.js");
const { asesoresDelLocal } = await import("../src/services/asesoresPorLocal.js");
const { nombreDelResponsable } = await import("../src/server/privacidad.js");
const { CORE_PLAYBOOK, COMPACT_PLAYBOOK } = await import("../src/agent/compactPlaybook.js");
const { INSTRUCCIONES } = await import("../src/services/guardian.js");
const { buildSystemPrompt } = await import("../src/agent/prompts.js");
const { depotLogo } = await import("../src/render/assets.js");
const { PREFIJO_CUPON } = await import("../src/domain/coupons.js");

const ASSETS = path.join(import.meta.dirname, "..", "assets", "mundillantas");
const comoDataUri = (archivo: string) =>
  `data:image/png;base64,${readFileSync(path.join(ASSETS, archivo)).toString("base64")}`;
/** El texto sin las imágenes incrustadas: una base64 no es algo que el cliente lea. */
const sinImagenes = (texto: string) => texto.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, "");

const MAPS_COMPETIMOTOR = "https://maps.app.goo.gl/QTFCzK2KDRXULRwz7";

describe("Competimotor · el saludo", () => {
  it("se presenta solo como Competimotor", () => {
    const saludo = presentacionDeApertura("Jenny");
    expect(saludo).toContain("Competimotor");
    expect(saludo).not.toMatch(/mundi/i);
    expect(FIRMA_DE_PRESENTACION).toBe("Soy el asistente de Competimotor");
    expect(fraseDePresentacion(negocio)).toBe("Competimotor");
  });

  it("el prompt del vendedor y el del guardián no nombran a Mundillantas", () => {
    for (const texto of [CORE_PLAYBOOK, COMPACT_PLAYBOOK, INSTRUCCIONES, buildSystemPrompt()]) {
      expect(texto).not.toMatch(/mundillantas|mundi\s+(falken|kenda)/i);
    }
  });

  it("la página de privacidad la firma Competimotor", () => {
    expect(nombreDelResponsable(negocio)).toBe("Competimotor");
  });
});

describe("Competimotor · nada del perfil que sale al cliente nombra a Mundillantas", () => {
  it("ni locales, ni piezas, ni identidades, ni teléfono", () => {
    // `id` es la carpeta de assets y la política (interno),
    // `palabrasDeLugarPropias` solo descuenta palabras del detector de
    // repetición y `pendientesNumericos` es la lista del panel de lo que falta
    // preguntarle a Jenny, y `marcasHermanas` es lo que usa el detector de
    // locales ajenos: ninguno llega a un cliente.
    const {
      id: _id, palabrasDeLugarPropias: _palabras, pendientesNumericos: _pendientes, marcasHermanas: _hermanas,
      ...loQueVeElCliente
    } = negocio;
    expect(JSON.stringify(loQueVeElCliente, (_k, v) => (v instanceof RegExp ? v.source : v)))
      .not.toMatch(/mundi/i);
  });

  it("un solo local, el de Competimotor, con su dirección y su mapa", () => {
    expect(negocio.locales.map((l) => l.slug)).toEqual(["competimotor"]);
    expect(negocio.locales[0].direccion).toBe("Vía Quevedo km 1½ y Juan León Mera #834, Santo Domingo");
    expect(negocio.locales[0].mapsUrl).toBe(MAPS_COMPETIMOTOR);
  });

  it("el cupón lleva las iniciales de Competimotor, no las de las dos marcas", () => {
    expect(inicialesDelNegocio(negocio)).toBe("CO");
    expect(PREFIJO_CUPON).toBe("CO-");
  });
});

describe("Competimotor · la cotización (PDF e imagen)", () => {
  it("la pieza se dibuja con la identidad de Competimotor aun sin local elegido", () => {
    expect(identidadDeLaPieza(negocio, null)).toBe("competimotor");
    // Un chat viejo que quedó con un local de Mundillantas no cambia la marca.
    expect(identidadDeLaPieza(negocio, "Mundillantas Falken")).toBe("competimotor");
    expect(identidadDeLaConversacion(negocio, "Mundillantas Kenda").id).toBe("competimotor");
  });

  it("el logo es el de Competimotor solo, no el combinado", () => {
    expect(depotLogo("blanco")?.dataUri).toBe(comoDataUri("logo-competimotor-blanco.png"));
    expect(depotLogo("color")?.dataUri).toBe(comoDataUri("logo-competimotor.png"));
    expect(depotLogo("blanco")?.dataUri).not.toBe(comoDataUri("logo-blanco.png"));
  });

  it("el PDF de la cotización: logo de Competimotor y ni una palabra de Mundillantas", async () => {
    const quote = quotePdf.buildQuote([{
      code: "KD-KR20", description: "KENDA 205/55R16 KR20", quantity: 4, unitPrice: 80 / 1.15,
      brand: "KENDA", design: "KR20", sizeLabel: "205/55R16",
      listPriceWithTax: 80, salePriceWithTax: 80, availability: "available",
    }], "Jenny", "593");
    const doc = JSON.stringify(await quotePdf.documentoDelPdf(quote));
    expect(doc).toContain(comoDataUri("logo-competimotor-blanco.png"));
    expect(doc).not.toContain(comoDataUri("logo-blanco.png"));
    expect(sinImagenes(doc)).not.toMatch(/mundi/i);
  });
});

describe("Competimotor · la imagen de la cotización (las dos plantillas)", () => {
  const linea = {
    brand: "KENDA", design: "KR20", sizeLabel: "205/55R16", loadSpeedLabel: "91V", loadSpeedTranslation: null,
    quantity: 4, unitConIva: 80, pvpConIva: null, availability: "available" as const,
    golpesMeses: null, fabricaAnios: 0, photoUri: "data:image/png;base64,iVBORw0KGgo=",
  };

  it("encabezado con el logo de Competimotor, pie con su local, ni una palabra de Mundillantas", async () => {
    const { quotePoster } = await import("../src/render/depotPosters.js");
    const { quotePosterDiaNoche } = await import("../src/render/diaNoche.js");
    const { resolveTheme } = await import("../src/render/depotDesign.js");
    const identidad = identidadDeLaPieza(negocio, null);
    const piezas = [
      quotePoster({ number: "COT-1", dateLabel: "18 / 11 / 2026", identidad, line: linea, subtotal: 278, iva: 42, total: 320 },
        resolveTheme("depotRojo", "exo")),
      quotePosterDiaNoche({ number: "COT-1", dateLabel: "18 / 11 / 2026", identidad, line: linea, total: 320 }, "noche"),
      quotePosterDiaNoche({ number: "COT-1", dateLabel: "18 / 11 / 2026", identidad, line: linea, total: 320 }, "dia"),
    ];
    for (const pieza of piezas) {
      const arbol = JSON.stringify(pieza);
      expect(arbol).not.toContain(comoDataUri("logo-blanco.png"));
      expect(arbol).not.toContain(comoDataUri("logo.png"));
      expect(sinImagenes(arbol)).not.toMatch(/mundi/i);
    }
    // La de noche lleva el logo blanco de Competimotor; la de día, el rojo.
    expect(JSON.stringify(piezas[1])).toContain(comoDataUri("logo-competimotor-blanco.png"));
  });
});

describe("Competimotor · un solo local: no hay «a cuál local»", () => {
  it("no hay local que elegir", () => {
    expect(hayQueElegirLocal).toBe(false);
  });

  it("el cierre de la cotización: «Aquí queda nuestro local» con el mapa UNA vez, y la pregunta del día", () => {
    const { ubicaciones, pregunta } = buildStoreChoiceBlocks();
    const todo = `${ubicaciones}\n${pregunta}`;
    expect(ubicaciones).toMatch(/^Aquí queda nuestro local/);
    expect(todo.split(MAPS_COMPETIMOTOR).length - 1).toBe(1);
    // Sprint 2 (auditoría 26-nov): la pregunta con dos salidas; «hoy» depende de la hora.
    expect(pregunta).toMatch(/^¿(?:Puede acercarse hoy o qué día le agendo la cita|Qué día le agendo la cita)\? 📅$/);
    expect(todo).not.toMatch(/a cu[aá]l local|mundi/i);
  });

  it("la pregunta de visita sin local guardado tampoco pregunta el local", () => {
    const texto = buildVisitPlanQuestion({
      conDescuentoAutorizado: false,
      locales: negocio.locales.map((l) => l.nombre),
      conCotizacion: true,
    });
    expect(texto).toMatch(/^Aquí queda nuestro local/);
    // Sprint 2 (auditoría 26-nov): la pregunta con dos salidas; «hoy» depende de la hora.
    expect(texto).toMatch(/¿(?:Puede acercarse hoy o qué día le agendo la cita|Qué día le agendo la cita)\? 📅$/);
    expect(texto.split(MAPS_COMPETIMOTOR).length - 1).toBe(1);
    expect(texto).not.toMatch(/a cu[aá]l local|mundi/i);
  });

  it("sin mapas (el que llama ya los puso), solo la pregunta del día", () => {
    const texto = buildVisitPlanQuestion({
      conDescuentoAutorizado: false,
      locales: negocio.locales.map((l) => l.nombre),
      conCotizacion: false,
      enlaces: false,
    });
    expect(texto).toMatch(/^¿Qué día cree que puede ir\?/);
    expect(texto).not.toContain(MAPS_COMPETIMOTOR);
  });
});

describe("Competimotor · los avisos van al asesor de Competimotor", () => {
  const asesores = [{ id: 1, nombre: "Asesor Competimotor" }, { id: 2, nombre: "Asesor Mundillantas" }];

  it("sin local elegido, el único local decide: solo su asesor", () => {
    expect(asesoresDelLocal(asesores, { competimotor: [1] }, null).map((a) => a.id)).toEqual([1]);
  });

  it("sin asignación cargada siguen yendo a todos (nadie se queda sin aviso)", () => {
    expect(asesoresDelLocal(asesores, {}, null).map((a) => a.id)).toEqual([1, 2]);
  });
});

describe("el mismo código levanta después el servicio de Mundillantas", () => {
  it("IDENTIDAD=mundillantas: sus 2 locales, su nombre, nada de Competimotor", async () => {
    const { MUNDILLANTAS } = await import("../src/negocio/negocios/mundillantas.js");
    const { perfilDelServicio } = await import("../src/negocio/identidad.js");
    const mundi = perfilDelServicio(MUNDILLANTAS, "mundillantas");
    expect(mundi.id).toBe("mundillantas");
    expect(mundi.nombre).toBe("Mundillantas");
    expect(fraseDePresentacion(mundi)).toBe("Mundillantas");
    expect(mundi.locales.map((l) => l.slug)).toEqual(["matriz", "local2"]);
    expect(mundi.identidades?.map((i) => i.id)).toEqual(["mundillantas"]);
    // Su número todavía no lo eligieron: pendiente, nunca el de Competimotor.
    expect(mundi.telefono.startsWith("[PENDIENTE]")).toBe(true);
    const { id: _id, palabrasDeLugarPropias: _p, pendientesNumericos: _n, marcasHermanas: _h, identidadPorDefecto: _d, ...visible } = mundi;
    expect(mundi.marcasHermanas).toEqual(["Competimotor"]);
    expect(JSON.stringify(visible, (_k, v) => (v instanceof RegExp ? v.source : v))).not.toMatch(/competi/i);
  });

  it("sin IDENTIDAD el servicio es Competimotor (el que existe hoy)", async () => {
    const { MUNDILLANTAS } = await import("../src/negocio/negocios/mundillantas.js");
    const { perfilDelServicio } = await import("../src/negocio/identidad.js");
    expect(perfilDelServicio(MUNDILLANTAS, undefined).nombre).toBe("Competimotor");
    expect(perfilDelServicio(MUNDILLANTAS, "  ").nombre).toBe("Competimotor");
  });

  it("una IDENTIDAD mal escrita no arranca, y en Depot la variable no tiene sentido", async () => {
    const { MUNDILLANTAS } = await import("../src/negocio/negocios/mundillantas.js");
    const { DEPOT } = await import("../src/negocio/negocios/depot.js");
    const { perfilDelServicio } = await import("../src/negocio/identidad.js");
    expect(() => perfilDelServicio(MUNDILLANTAS, "mundilantas")).toThrow(/no es una marca/);
    expect(() => perfilDelServicio(DEPOT, "competimotor")).toThrow(/no separa marcas/);
    // Depot sin la variable: el mismo objeto, ni un byte distinto.
    expect(perfilDelServicio(DEPOT, undefined)).toBe(DEPOT);
  });
});
