import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// salesIntent es dominio puro (sin db ni config): el import estático es seguro.
import { describeUso, escalonesDeOpciones, respuestaDePreferencia } from "../src/domain/salesIntent.js";

const testDatabase = `autoventa_cierre_preferencia_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let agent: typeof import("../src/agent/agent.js");
let prompts: typeof import("../src/agent/prompts.js");
let benefits: typeof import("../src/services/benefits.js");

/**
 * CIERRE POR PREFERENCIA Y CONOCIMIENTO DEL NEGOCIO — reunión con Joaquín,
 * 25-ago-2026 (R-04…R-10 del plan).
 *
 * Los casos vienen de los chats reales de esa reunión: el cierre genérico
 * («¿necesita alguna recomendación?») que devolvía la pregunta al cliente, el
 * INCLUYE mandado dos veces (texto y foto), y el bot contradiciendo a su propia
 * cotización sobre alineación y balanceo.
 */
describe.sequential("Cierre por preferencia — reunión del 25-ago", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.unsafe(`create database ${testDatabase}`);

    process.env.DATABASE_URL = `postgresql://manue@localhost/${testDatabase}`;
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";
    process.env.OPENAI_API_KEY = "test";

    const db = await import("../src/db/client.js");
    appSql = db.sql;
    const schema = await import("../src/db/schema.js");
    await schema.ensureSchema();
    agent = await import("../src/agent/agent.js");
    prompts = await import("../src/agent/prompts.js");
    benefits = await import("../src/services/benefits.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  describe("R-05: el detector lee la respuesta de preferencia como la escribe la gente", () => {
    it("precio: «precio», «la más barata», «la económica» — con faltas reales", () => {
      expect(respuestaDePreferencia("precio")).toBe("precio");
      expect(respuestaDePreferencia("el mejor precio")).toBe("precio");
      expect(respuestaDePreferencia("la más barata")).toBe("precio");
      expect(respuestaDePreferencia("la mas varata")).toBe("precio");
      expect(respuestaDePreferencia("La económica porfa")).toBe("precio");
      expect(respuestaDePreferencia("algo barato")).toBe("precio");
    });

    it("equilibrada: «equilibrada», «la del medio», «la intermedia»", () => {
      expect(respuestaDePreferencia("equilibrada")).toBe("equilibrada");
      expect(respuestaDePreferencia("algo equilibrado entre precio y calidad")).toBe("equilibrada");
      expect(respuestaDePreferencia("la del medio")).toBe("equilibrada");
      expect(respuestaDePreferencia("la de en medio")).toBe("equilibrada");
      expect(respuestaDePreferencia("la intermedia")).toBe("equilibrada");
    });

    it("premium: «premium», «la mejor», «la más cara»", () => {
      expect(respuestaDePreferencia("premium")).toBe("premium");
      expect(respuestaDePreferencia("la mejor")).toBe("premium");
      expect(respuestaDePreferencia("deme la más cara nomás")).toBe("premium");
    });

    it("lo que no es una preferencia devuelve null", () => {
      expect(respuestaDePreferencia("sí")).toBeNull();
      expect(respuestaDePreferencia("cuánto sale")).toBeNull();
      expect(respuestaDePreferencia("¿qué día pueden instalar?")).toBeNull();
      expect(respuestaDePreferencia("no gracias")).toBeNull();
      expect(respuestaDePreferencia("225/65R17")).toBeNull();
    });
  });

  describe("R-06: describir el uso ya cuenta como pedir la recomendación", () => {
    it("reconoce los usos reales de los chats", () => {
      expect(describeUso("son para carretera")).toBe(true);
      expect(describeUso("es para viajar a la costa")).toBe(true);
      expect(describeUso("uso mixto, ciudad y campo")).toBe(true);
      expect(describeUso("la camioneta es para el trabajo")).toBe(true);
      expect(describeUso("quiero unas todo terreno")).toBe(true);
    });

    it("no confunde un pedido normal con un uso", () => {
      expect(describeUso("quiero 4 llantas")).toBe(false);
      expect(describeUso("¿a cómo la Kenda?")).toBe(false);
      expect(describeUso("paso el viernes")).toBe(false);
    });
  });

  describe("R-05: los escalones se arman por precio sobre lo que está en pantalla", () => {
    const opcion = (codigo: string, precio: number) => ({
      codigo, nombre: codigo, precio_con_iva: precio,
    });

    it("tres opciones: cara = premium, media = equilibrada, barata = económica", () => {
      const e = escalonesDeOpciones([opcion("KENDA", 110), opcion("FALKEN", 180), opcion("WINRUN", 95)]);
      expect(e.premium?.codigo).toBe("FALKEN");
      expect(e.equilibrada?.codigo).toBe("KENDA");
      expect(e.economica?.codigo).toBe("WINRUN");
    });

    it("dos opciones: no hay «la del medio»", () => {
      const e = escalonesDeOpciones([opcion("FALKEN", 180), opcion("WINRUN", 95)]);
      expect(e.premium?.codigo).toBe("FALKEN");
      expect(e.equilibrada).toBeNull();
      expect(e.economica?.codigo).toBe("WINRUN");
    });

    it("una sola opción: cualquier preferencia la entrega a ella", () => {
      const e = escalonesDeOpciones([opcion("KENDA", 110)]);
      expect(e.premium?.codigo).toBe("KENDA");
      expect(e.equilibrada?.codigo).toBe("KENDA");
      expect(e.economica?.codigo).toBe("KENDA");
    });
  });

  describe("R-07: el INCLUYE no se manda dos veces", () => {
    it("imagen enviada ⇒ el texto no lo lleva; imagen fallida o pedido explícito ⇒ sí", () => {
      expect(benefits.debeLlevarIncluyeEnTexto(true, false)).toBe(false);
      expect(benefits.debeLlevarIncluyeEnTexto(false, false)).toBe(true);
      expect(benefits.debeLlevarIncluyeEnTexto(true, true)).toBe(true);
    });
  });

  describe("R-08: los beneficios activos son hechos del bot", () => {
    it("el bloque de hechos afirma lo que la cotización imprime y prohíbe negarlo", async () => {
      await appSql`
        insert into benefits (text, position, active)
        values ('Alineación y balanceo incluidos', 0, true)
      `;
      benefits.invalidateBenefitsCache();
      const bloque = await benefits.activeBenefitFactsBlock();
      expect(bloque).toContain("INCLUIDO CON LA COMPRA (fuente determinística)");
      expect(bloque).toContain("Alineación y balanceo incluidos");
      // La contradicción del 25-ago: el bot dijo «es aparte» de algo incluido.
      expect(bloque).toMatch(/PROHIBIDO decir que algo de esta lista «es aparte»/);
    });

    it("un beneficio condicionado a marca o cantidad NO se afirma como hecho general", async () => {
      await appSql`
        insert into benefits (text, position, active, brand)
        values ('Promo solo Falken', 1, true, 'Falken')
      `;
      await appSql`
        insert into benefits (text, position, active, min_quantity)
        values ('Descuento por juego', 2, true, 4)
      `;
      benefits.invalidateBenefitsCache();
      const bloque = await benefits.activeBenefitFactsBlock();
      expect(bloque).not.toContain("Promo solo Falken");
      expect(bloque).not.toContain("Descuento por juego");
    });

    it("sin beneficios vigentes no se inventa el bloque", async () => {
      await appSql`update benefits set active=false`;
      benefits.invalidateBenefitsCache();
      expect(await benefits.activeBenefitFactsBlock()).toBeNull();
      await appSql`update benefits set active=true`;
      benefits.invalidateBenefitsCache();
    });
  });

  describe("R-05: los escalones de la pieza quedan en los hechos del turno siguiente", () => {
    it("getAgentSalesFacts lee los escalones de la metadata de la pieza y el prompt ordena entregarlos", async () => {
      const [c] = await appSql<{ id: number }[]>`
        insert into conversations (phone, name, stage, tire_size)
        values ('593999000111', 'PREFERENCIA', 'seleccionando', '205/55R16')
        returning id
      `;
      const escalones = {
        premium: { codigo: "FALKEN-ZE310", nombre: "FALKEN ZE310", precio_con_iva: 180.5 },
        equilibrada: { codigo: "KENDA-KR628", nombre: "KENDA KR628", precio_con_iva: 130.0 },
        economica: { codigo: "WINRUN-R380", nombre: "WINRUN R380", precio_con_iva: 95.4 },
      };
      await appSql`
        insert into messages (conversation_id, role, content, cycle, status, type, metadata)
        values (${c.id}, 'assistant', 'Opciones enviadas: prueba', 1, 'sent', 'image',
                ${appSql.json({ piece: "options", codes: ["FALKEN-ZE310", "KENDA-KR628", "WINRUN-R380"], escalones })})
      `;
      const facts = await agent.getAgentSalesFacts(c.id);
      expect(facts.escalones?.economica?.codigo).toBe("WINRUN-R380");

      const bloque = agent.salesFactsPrompt(facts);
      expect(bloque).toContain("WINRUN R380 ($95.40 c/u con IVA");
      expect(bloque).toContain("FALKEN ZE310 ($180.50 c/u con IVA");
      // La respuesta de preferencia se entrega, no se re-pregunta (familia 2).
      expect(bloque).toMatch(/PROHIBIDO volver a preguntarle qué prefiere/);
    });

    it("sin pieza de opciones el bloque no menciona escalones", () => {
      const bloque = agent.salesFactsPrompt({
        tireSize: null, vehicle: null, vehicleYear: null,
        selectedProductCode: null, selectedQuantity: null,
        nearestStore: null, visitDate: null, customerCommitment: null,
        lastQuote: null,
      });
      expect(bloque).not.toContain("Escalones");
    });
  });

  describe("R-04/R-09/R-10: las reglas nuevas están publicadas en los DOS prompts", () => {
    it("el prompt del sistema responde primero lo preguntado (familia 1 del guardián)", () => {
      const texto = prompts.buildSystemPrompt();
      expect(texto).toMatch(/pregunta directa, la PRIMERA parte de tu respuesta la contesta/);
      expect(texto).toContain("Las cinco reglas");
    });

    it("el cierre por preferencia y la entrega del escalón están en el prompt", () => {
      const texto = prompts.buildSystemPrompt();
      expect(texto).toMatch(/cierra preguntando la PREFERENCIA/);
      expect(texto).toMatch(/entrega LA opción de ese escalón/);
      expect(texto).not.toContain("¿Necesita alguna recomendación?");
      // R-06: el uso descrito también entrega la recomendación.
      expect(texto).toMatch(/ya describía su uso/);
    });

    it("el descuento en efectivo se confirma en sucursal, sin monto y sin negarlo", () => {
      const texto = prompts.buildSystemPrompt();
      expect(texto).toMatch(/descuento adicional pagando en efectivo/i);
      expect(texto).toMatch(/confirman en la sucursal/);
    });

    it("lo INCLUIDO se afirma; el playbook compacto dice lo mismo (regla de los dos lados)", async () => {
      const texto = prompts.buildSystemPrompt();
      expect(texto).toMatch(/INCLUIDO CON LA COMPRA se afirma con seguridad/);

      const { COMPACT_PLAYBOOK } = await import("../src/agent/compactPlaybook.js");
      expect(COMPACT_PLAYBOOK).toMatch(/pregunta directa/);
      expect(COMPACT_PLAYBOOK).toMatch(/PREFERENCIA/);
      expect(COMPACT_PLAYBOOK).toMatch(/INCLUIDO CON LA COMPRA se AFIRMA/);
      expect(COMPACT_PLAYBOOK).toMatch(/efectivo/);
      expect(COMPACT_PLAYBOOK).not.toContain("¿necesita alguna recomendación?");
    });
  });
});
