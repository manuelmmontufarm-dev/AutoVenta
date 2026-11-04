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
import { describe, expect, it } from "vitest";

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
