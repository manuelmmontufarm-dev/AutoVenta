/**
 * FIJACIÓN DE DEPOT (Sprint 4 — política por cliente).
 *
 * Estas pruebas se escribieron ANTES de mover ningún texto: fijan, byte a
 * byte, las superficies de Depot que la política por cliente tiene que dejar
 * idénticas (R-11…R-20). Los hashes se tomaron de `origin/main` = `dc50dab`
 * el 4-nov-2026, con `NEGOCIO` sin definir (= Depot).
 *
 * Si una de estas pruebas se rompe, el contrato con Depot cambió: no la
 * ajustes para que pase — arreglá el código.
 */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
delete process.env.NEGOCIO; // Estas fijaciones son de Depot, el perfil por defecto.
delete process.env.PROMO;

const { buildSystemPrompt } = await import("../src/agent/prompts.js");
const { DEFAULT_AI_CONFIG } = await import("../src/services/settings.js");
const guardian = await import("../src/services/guardian.js");
const { buildTools } = await import("../src/agent/tools.js");
const { COMPACT_PLAYBOOK } = await import("../src/agent/compactPlaybook.js");
const { dondeEstaElCliente } = await import("../src/domain/fueraDeCobertura.js");
const { quiereComprarADistancia, cierreSinVisita } = await import("../src/domain/compraADistancia.js");
const { preguntamosElLocal, preguntaElLocal, PREGUNTA_DE_LOCAL, LOCALES_COMO_ALTERNATIVA } = await import("../src/domain/storeSelection.js");
const { elegirFaseOperativa } = await import("../src/agent/faseOperativa.js");
const { JUEGO_COMPLETO } = await import("../src/domain/opcionesCandados.js");
const { esConsultaFueraDeCatalogo } = await import("../src/domain/alcanceComercial.js");
const { mencionaOtraCiudad } = await import("../src/domain/ubicacionPedida.js");
const { promptCandidatosFitment } = await import("../src/domain/fitmentResearch.js");
const { nivelDeLinea } = await import("../src/domain/escalera.js");
const { respaldoDeMarca } = await import("../src/domain/respaldoMarcas.js");

const sha = (texto: string) => createHash("sha256").update(texto).digest("hex");

describe("fijación de Depot: el prompt del sistema, byte a byte", () => {
  it("buildSystemPrompt con la config por defecto es el de dc50dab", () => {
    expect(sha(buildSystemPrompt(DEFAULT_AI_CONFIG))).toBe(
      "464f76fc887240258b8e0ac5cfe1c2f25c11a1888c2c4479a46ebb9d9fdeb651",
    );
  });

  it("el playbook compacto es el de dc50dab", () => {
    expect(sha(COMPACT_PLAYBOOK)).toBe(
      "ea2c64b9819e8399bdbcad0a3befd615a55093b58fb1e271a655349b595f9ad7",
    );
  });

  it("las líneas del negocio dicen lo de hoy", () => {
    const prompt = buildSystemPrompt(DEFAULT_AI_CONFIG);
    expect(prompt).toContain(
      "una llantera en Quito con más de 30 años de experiencia. Vende Kenda, Sunoco, Eurolub, Falken y ofrece mantenimiento preventivo automotriz.",
    );
    expect(prompt).toContain("Español natural de Ecuador. Usa «usted» salvo que el cliente tutee.");
    // El gentilicio sale solo con el tono cálido.
    expect(buildSystemPrompt({ ...DEFAULT_AI_CONFIG, tono: "calido" })).toContain("como un buen vendedor quiteño");
  });
});

describe("fijación de Depot: las reglas del guardián, byte a byte", () => {
  it("INSTRUCCIONES es la rúbrica de dc50dab", () => {
    expect(sha(guardian.INSTRUCCIONES)).toBe(
      "bbde53997896325e6176b809a6ca7417dc6c59e3815dea2be7ff062496dac148",
    );
  });

  it("la regla 16 y los ejemplos nombran los locales de Depot", () => {
    expect(guardian.INSTRUCCIONES).toContain("Primero los dos locales con sus links");
    expect(guardian.INSTRUCCIONES).toContain("jueves de 4 a 5 en Quito Sur");
  });

  it("INSTRUCCIONES_SEGUIMIENTO es el literal de dc50dab", () => {
    const seg = (guardian as Record<string, unknown>).INSTRUCCIONES_SEGUIMIENTO;
    // Antes del Sprint 4 la constante no estaba exportada; el literal de abajo
    // ES el de dc50dab, copiado tal cual. Cuando se exporte, se compara.
    if (typeof seg !== "string") return;
    expect(sha(seg)).toBe("195844091cffaf2ce5bfe6a5067f11d90d82e6b8d40caa332675ece4e7956484");
    expect(seg).toContain("¿Qué día cree que puede pasar por Depot Tire Cumbayá?");
  });
});

describe("fijación de Depot: las descripciones de herramientas, byte a byte", () => {
  it("todas las herramientas (nombre, descripción y parámetros) son las de dc50dab", () => {
    const ctx = {
      conversation: { id: 1, current_cycle: 1, stage: "nuevo", phone: "+593990000001" },
      currentUserText: "",
    } as never;
    const volcado = buildTools(ctx)
      .map((t) => `## ${t.function.name}\n${t.function.description}\n### parámetros\n${JSON.stringify(t.function.parameters, null, 1)}`)
      .join("\n\n");
    expect(sha(volcado)).toBe("dc6ebe3fcd796676330e6d2fc722e3a5fbc33f99482636a0828849f0d4a8f27f");
  });
});

describe("fijación de Depot: cobertura y lugares deciden como hoy", () => {
  it("las ciudades lejanas siguen siendo «fuera»", () => {
    expect(dondeEstaElCliente("Estoy en guayaquil")).toEqual({ estado: "fuera", ciudad: "Guayaquil" });
    expect(dondeEstaElCliente("Soy de Santo Domingo")).toEqual({ estado: "fuera", ciudad: "Santo Domingo" });
    expect(dondeEstaElCliente("vivo en Ambato")).toEqual({ estado: "fuera", ciudad: "Ambato" });
  });

  it("Quito y el valle siguen siendo cobertura", () => {
    for (const t of ["vivo en quito", "estoy en cumbaya", "estoy por tumbaco", "vivo en sangolqui"]) {
      expect(dondeEstaElCliente(t)?.estado, t).toBe("cobertura");
    }
  });

  it("anunciar que sube a Quito sigue siendo «viene»", () => {
    expect(dondeEstaElCliente("Soy de Santo Domingo pero el lunes voy a estar en quito")?.estado).toBe("viene");
    expect(dondeEstaElCliente("vivo en Ibarra, estando en Quito sector norte")?.estado).toBe("viene");
    expect(dondeEstaElCliente("no vivo en Quito")?.estado).toBe("fuera");
  });

  it("mencionaOtraCiudad reconoce las mismas ciudades de hoy", () => {
    expect(mencionaOtraCiudad("soy de ambato")).toBe(true);
    expect(mencionaOtraCiudad("estoy en santo domingo")).toBe(true);
    expect(mencionaOtraCiudad("quiero 4 llantas 205/55R16")).toBe(false);
  });

  it("quiereComprarADistancia y su cierre son los de hoy", () => {
    expect(quiereComprarADistancia("Lo compro x este medio me cotiza lo cancelo comfirma y me envia")).toBe(true);
    expect(quiereComprarADistancia("mejor el sábado paso por cumbaya y pago por transferencia")).toBe(false);
    expect(cierreSinVisita("compra_a_distancia")).toEqual(["Un asesor le confirma pago y envío por acá. 🤝"]);
    expect(cierreSinVisita("fuera_de_cobertura")).toEqual([]);
  });
});

describe("fijación de Depot: elección de local y fase operativa", () => {
  it("la pregunta del local es la de hoy", () => {
    expect(PREGUNTA_DE_LOCAL).toBe("¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*?");
    expect(LOCALES_COMO_ALTERNATIVA).toBe("*Cumbayá* o *Quito Sur*");
  });

  it("los detectores reconocen la pregunta con los dos nombres", () => {
    expect(preguntamosElLocal("Le mando los mapas de Cumbayá y Quito Sur")).toBe(true);
    expect(preguntaElLocal("¿Cumbayá o Quito Sur?")).toBe(true);
    expect(preguntaElLocal("Puede pasar por el local de Cumbayá.\nEl de Quito Sur abre mañana.")).toBe(false);
  });

  it("nombrar un local de Depot sigue siendo señal de visita", () => {
    const base = { etapaGuardada: "nuevo" as const, tieneCotizacion: false };
    expect(elegirFaseOperativa({ ...base, texto: "puedo ir a cumbaya?" })).toBe("seguimiento_venta");
    expect(elegirFaseOperativa({ ...base, texto: "voy al de quito sur" })).toBe("seguimiento_venta");
  });
});

describe("fijación de Depot: juego, alcance, escalera y textos regionales", () => {
  it("el juego comercial sigue siendo 4", () => {
    expect(JUEGO_COMPLETO).toBe(4);
  });

  it("lo fuera de catálogo es lo de hoy (sin productos derivados extra)", () => {
    expect(esConsultaFueraDeCatalogo("quiero un cambio de aceite")).toBe(true);
    expect(esConsultaFueraDeCatalogo("necesito lubricantes para mi carro")).toBe(false);
    expect(esConsultaFueraDeCatalogo("venden baterías?")).toBe(false);
  });

  it("la escalera y el conocimiento de marcas de Depot cargan igual", () => {
    expect(nivelDeLinea("FALKEN", "WILDPEAK A/T4W")).toBe("PREMIUM");
    expect(nivelDeLinea("KENDA", "KR203")).toBe("ECONOMICA");
    expect(respaldoDeMarca("KENDA")?.seguroMeses).toBe(12);
    expect(respaldoDeMarca("GITI")?.seguroMeses).toBeNull();
  });

  it("el prompt del asesor técnico sigue diciendo Quito", () => {
    expect(promptCandidatosFitment("Kia Sportage 2020", null)).toContain(
      "Eres el asesor técnico de una llantera en Quito, Ecuador.",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 4 — la política por cliente (R-11…R-19). Lo de arriba fija a Depot;
// lo de abajo prueba que otro cliente vende con lo suyo.
// ─────────────────────────────────────────────────────────────────────────────

const { faltantesDeLaPolitica, politica } = await import("../src/negocio/politica.js");
const { POLITICA_DEPOT } = await import("../src/negocio/politicas/depot.js");
const { POLITICA_EJEMPLO } = await import("../src/negocio/politicas/ejemplo.js");
const { POLITICA_MUNDILLANTAS } = await import("../src/negocio/politicas/mundillantas.js");
const datos = await import("../src/domain/datosDelNegocio.js");

describe("la política comercial (R-11)", () => {
  it("sin NEGOCIO la política viva es la de Depot", () => {
    expect(politica).toBe(POLITICA_DEPOT);
    expect(politica.juegoCompleto).toBe(4);
    expect(politica.escalonPorPrecio).toBe(false);
    expect(politica.asesorEnReglas).toBe("Manuel");
  });

  it("faltantesDeLaPolitica: Depot y la plantilla completas; Mundillantas avisa que faltan las formas de pago", () => {
    expect(faltantesDeLaPolitica(POLITICA_DEPOT)).toEqual([]);
    expect(faltantesDeLaPolitica(POLITICA_EJEMPLO)).toEqual([]);
    expect(faltantesDeLaPolitica(POLITICA_MUNDILLANTAS).join(" ")).toMatch(/formas de pago/);
    expect(faltantesDeLaPolitica({ ...POLITICA_EJEMPLO, cuotasSinIntereses: "[PENDIENTE] cuántos meses" }))
      .toContain("Política · cuotas sin intereses");
  });

  it("los archivos de política son solo literales: no importan node:fs, domain/ ni services/ (los empaqueta el panel)", async () => {
    const { readFileSync } = await import("node:fs");
    for (const archivo of ["politica.ts", "politicas/depot.ts", "politicas/ejemplo.ts", "politicas/mundillantas.ts"]) {
      const fuente = readFileSync(new URL(`../src/negocio/${archivo}`, import.meta.url), "utf8");
      const imports = [...fuente.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
      for (const ruta of imports) expect(ruta, `${archivo} importa ${ruta}`).toMatch(/^\.\.?\/(?:index|politica|politicas\/\w+)\.js$/);
    }
  });

  it("un negocio sin política no arranca (mismo criterio que un NEGOCIO mal escrito)", async () => {
    vi.resetModules();
    vi.doMock("../src/negocio/index.js", async (original) => {
      const real = await original<typeof import("../src/negocio/index.js")>();
      return { ...real, negocio: { ...real.negocio, id: "sin_politica" } };
    });
    await expect(import("../src/negocio/politica.js")).rejects.toThrow(/no tiene política comercial/);
    vi.doUnmock("../src/negocio/index.js");
    vi.resetModules();
  });
});

describe("pagos según la política (R-12)", () => {
  it("Depot: la frase de siempre; plantilla: solo las formas; sin formas: nada", () => {
    expect(datos.politicaDePagos(POLITICA_DEPOT)).toBe(datos.politicaDePagos());
    expect(datos.politicaDePagos(POLITICA_EJEMPLO)).toBe("Se acepta efectivo, tarjeta y transferencia.");
    expect(datos.politicaDePagos(POLITICA_MUNDILLANTAS)).toBe("");
    expect(datos.hayPoliticaDePagos(POLITICA_MUNDILLANTAS)).toBe(false);
    expect(datos.hayDescuentoEnEfectivo(POLITICA_EJEMPLO)).toBe(false);
  });

  it("la plantilla no promete «no sube con tarjeta» ni cuotas ni descuento", () => {
    expect(datos.politicaDePagos(POLITICA_EJEMPLO)).not.toMatch(/no sube|mismo precio|meses|descuento/i);
  });

  it("respuesta completa: Depot exige las dos mitades; la plantilla, nombrar una forma de pago", () => {
    expect(datos.respondeElPagoCompleto("Con tarjeta no sube.", POLITICA_DEPOT)).toBe(false);
    expect(datos.respondeElPagoCompleto(datos.politicaDePagos(POLITICA_DEPOT), POLITICA_DEPOT)).toBe(true);
    expect(datos.respondeElPagoCompleto("Puede pagar con tarjeta.", POLITICA_EJEMPLO)).toBe(true);
    expect(datos.respondeElPagoCompleto("Eso se lo confirma el asesor.", POLITICA_EJEMPLO)).toBe(false);
  });
});

describe("Depot: lo que la política no debe cambiar en sus decisiones", () => {
  it("«estoy en la av quevedo» sigue siendo Quevedo, fuera de cobertura (Depot no tiene una calle Quevedo)", () => {
    expect(dondeEstaElCliente("estoy en la av quevedo")).toEqual({ estado: "fuera", ciudad: "Quevedo" });
  });
});

/**
 * Un perfil de Santo Domingo armado sobre la plantilla, con la matriz en la
 * «Av. Quevedo km 1» (el dato confirmado de Mundillantas). Con id
 * `mundillantas` la política que se elige es la suya. No depende de que el
 * perfil real del Sprint 1 exista en esta rama.
 */
async function conPerfilDeSantoDomingo() {
  vi.resetModules();
  vi.doMock("../src/negocio/index.js", async (original) => {
    const real = await original<typeof import("../src/negocio/index.js")>();
    const { EJEMPLO } = await import("../src/negocio/negocios/ejemplo.js");
    return {
      ...real,
      negocio: {
        ...EJEMPLO,
        id: "mundillantas",
        nombre: "Mundillantas",
        ciudad: "Santo Domingo",
        marcas: [],
        locales: [
          { ...EJEMPLO.locales[0], slug: "matriz", nombre: "Mundillantas Matriz", nombreCorto: "Matriz", direccion: "Av. Quevedo km 1, Santo Domingo", comoLoNombran: /\bmatriz\b/ },
          { ...EJEMPLO.locales[0], slug: "competimotor", nombre: "Competimotor", nombreCorto: "Competimotor", direccion: "[PENDIENTE] dirección", comoLoNombran: /\bcompetimotor\b/ },
        ],
      },
    };
  });
  const modulos = {
    cobertura: await import("../src/domain/fueraDeCobertura.js"),
    ubicacion: await import("../src/domain/ubicacionPedida.js"),
    alcance: await import("../src/domain/alcanceComercial.js"),
    candados: await import("../src/domain/opcionesCandados.js"),
    distancia: await import("../src/domain/compraADistancia.js"),
    fase: await import("../src/agent/faseOperativa.js"),
    local: await import("../src/domain/storeSelection.js"),
  };
  vi.doUnmock("../src/negocio/index.js");
  return modulos;
}

describe("cobertura y lugares con un negocio de Santo Domingo (R-14)", () => {
  it("«soy de santo domingo» no es otra ciudad; «estoy en la av quevedo» queda dentro", async () => {
    const { cobertura } = await conPerfilDeSantoDomingo();
    expect(cobertura.dondeEstaElCliente("soy de santo domingo")?.estado).toBe("cobertura");
    expect(cobertura.dondeEstaElCliente("vivo en sto domingo")?.estado).not.toBe("fuera");
    expect(cobertura.dondeEstaElCliente("estoy en la av quevedo")?.estado).toBe("cobertura");
    expect(cobertura.dondeEstaElCliente("estoy por la avenida quevedo")?.estado).toBe("cobertura");
  });

  it("las ciudades de verdad lejanas siguen fuera, incluida la ciudad de Quevedo", async () => {
    const { cobertura } = await conPerfilDeSantoDomingo();
    expect(cobertura.dondeEstaElCliente("soy de quevedo")).toEqual({ estado: "fuera", ciudad: "Quevedo" });
    expect(cobertura.dondeEstaElCliente("Estoy en guayaquil")).toEqual({ estado: "fuera", ciudad: "Guayaquil" });
    // Quito ES otra ciudad para un negocio de Santo Domingo.
    expect(cobertura.dondeEstaElCliente("vivo en quito")).toEqual({ estado: "fuera", ciudad: "Quito" });
  });

  it("anunciar que viene a Santo Domingo es «viene»", async () => {
    const { cobertura } = await conPerfilDeSantoDomingo();
    expect(cobertura.dondeEstaElCliente("soy de ambato pero el lunes voy a estar en santo domingo")?.estado).toBe("viene");
  });

  it("la lista de «otras ciudades» del mapa no cuenta la propia", async () => {
    const { ubicacion } = await conPerfilDeSantoDomingo();
    expect(ubicacion.mencionaOtraCiudad("santo domingo")).toBe(false);
    expect(ubicacion.mencionaOtraCiudad("tsachilas")).toBe(false);
    expect(ubicacion.mencionaOtraCiudad("ambato")).toBe(true);
  });

  it("los locales del perfil reemplazan a Cumbayá y Quito Sur en los detectores", async () => {
    const { distancia, fase, local } = await conPerfilDeSantoDomingo();
    expect(distancia.quiereComprarADistancia("lo compro por este medio y me lo envian")).toBe(true);
    expect(distancia.quiereComprarADistancia("el sabado paso por competimotor y lo compro por este medio")).toBe(false);
    expect(fase.elegirFaseOperativa({ etapaGuardada: "nuevo", tieneCotizacion: false, texto: "puedo ir a la matriz?" })).toBe("seguimiento_venta");
    expect(fase.elegirFaseOperativa({ etapaGuardada: "nuevo", tieneCotizacion: false, texto: "cumbaya" })).toBe("nuevo");
    expect(local.preguntamosElLocal("Le mando los mapas de Matriz y Competimotor")).toBe(true);
    expect(local.preguntamosElLocal("Le mando los mapas de Cumbayá y Quito Sur")).toBe(false);
  });
});

describe("juego, envío y derivados al asesor con la política de Mundillantas (R-18)", () => {
  it("lubricantes, baterías, aceites y taller van al asesor; las llantas no", async () => {
    const { alcance } = await conPerfilDeSantoDomingo();
    for (const t of ["venden baterías?", "tienen lubricantes", "necesito aceite para el carro", "tienen taller?", "hacen trabajos en sus talleres?"]) {
      expect(alcance.esConsultaFueraDeCatalogo(t), t).toBe(true);
    }
    expect(alcance.esConsultaFueraDeCatalogo("busco 4 llantas 205/55R16")).toBe(false);
  });

  it("el juego es el de la política y, sin envíos confirmados, el cierre a distancia no los promete", async () => {
    const { candados, distancia } = await conPerfilDeSantoDomingo();
    expect(candados.JUEGO_COMPLETO).toBe(POLITICA_MUNDILLANTAS.juegoCompleto);
    expect(distancia.cierreSinVisita("compra_a_distancia")[0]).not.toMatch(/confirma pago y envío/);
    expect(distancia.cierreSinVisita("compra_a_distancia")[0]).toMatch(/si se puede/);
  });
});
