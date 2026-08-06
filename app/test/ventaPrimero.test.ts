import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// La rúbrica es la misma que usa la eval de calidad: un solo criterio en todo el repo.
// @ts-expect-error módulo .mjs sin tipos
import { evaluarReglas } from "../scripts/eval/rubrica.mjs";

const testDatabase = `autoventa_venta_primero_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let agent: typeof import("../src/agent/agent.js");
let prompts: typeof import("../src/agent/prompts.js");
let settings: typeof import("../src/services/settings.js");

/**
 * VENTA PRIMERO — las fallas de las capturas del 5-ago no pueden volver.
 *
 * Cada bloque parte de un chat real: el Chevrolet Orlando (pidió foto y versión
 * teniendo la medida) y KLEVER (cotización duplicada + «no tengo ficha
 * verificada» ante "son todo terreno"). Se prueba en las tres capas donde
 * estaba la falla: prompt del sistema, prompts por etapa (base) y hechos
 * determinísticos del agente.
 */
describe.sequential("Venta primero — los arreglos de Joaquín", () => {
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
    settings = await import("../src/services/settings.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  describe("el prompt del sistema vende, no pregunta", () => {
    it("declara VENDER como objetivo y la medida manda sobre el vehículo", () => {
      const texto = prompts.buildSystemPrompt();
      expect(texto).toContain("Tu objetivo: VENDER");
      expect(texto).toContain("La medida manda sobre el vehículo");
      expect(texto).toContain("PROHIBIDO PEDIR FOTOS");
    });

    it("no queda NINGUNA instrucción de pedir fotos (la contradicción que rompió el caso Orlando)", () => {
      const texto = prompts.buildSystemPrompt();
      // Las únicas menciones válidas de "foto" son las prohibiciones y qué
      // hacer si el CLIENTE manda una. Nunca "pide/envía una foto".
      expect(texto).not.toMatch(/pide una foto|env[íi]ame una foto|m[áa]ndame una foto|puede mandarme una foto|ofrece identificar la medida con una foto/i);
    });

    it("el tipo de llanta que pide el cliente dispara búsqueda, no ficha verificada", () => {
      const texto = prompts.buildSystemPrompt();
      expect(texto).toMatch(/describe el USO o el TIPO[\s\S]{0,200}buscar_por_aro_y_tipo/);
    });
  });

  describe("los prompts por etapa (base de datos) quedaron en venta-primero", () => {
    it("la migración 011 reescribió el prompt sembrado de 'nuevo'", async () => {
      const publicado = await settings.getPublishedStagePrompt("nuevo");
      expect(publicado.prompt).toContain("esa manda");
      expect(publicado.prompt).not.toContain("confirma la medida antes de hablar de precios");
      // La etapa 'nuevo' ahora puede cotizar: medida+cantidad en el primer
      // mensaje no debe esperar a cambiar de etapa.
      expect(publicado.allowedTools).toContain("generar_cotizacion");
      expect(publicado.allowedTools).toContain("buscar_por_aro_y_tipo");
    });

    it("'seleccionando' manda cotizar en cuanto haya modelo y cantidad", async () => {
      const publicado = await settings.getPublishedStagePrompt("seleccionando");
      expect(publicado.prompt).toContain("cotiza de inmediato");
      expect(publicado.allowedTools).toContain("tipos_de_llanta");
    });

    it("reescribe también versiones republicadas (v4/v6) si el texto sigue siendo el viejo — el caso real de Depot", async () => {
      // Producción tenía el texto dañino intacto en una v4 publicada, con una
      // lista de herramientas propia. La migración debe reescribir el texto y
      // UNIR las herramientas, sin quitar ninguna.
      await appSql`
        update stage_prompt_versions set status='archived' where stage='nuevo' and status='published'
      `;
      await appSql`
        insert into stage_prompt_versions (stage, version, status, objective, prompt, allowed_tools, settings, created_by, published_at)
        values ('nuevo', 4, 'published', 'Identificar medida o vehículo sin presionar al cliente.',
                'Haz una sola pregunta clara para obtener la medida. Si da vehículo, confirma la medida antes de hablar de precios.',
                '["buscar_llanta","buscar_catalogo","fitment_vehiculo"]',
                '{"autoAction":"none","requiresHumanApproval":false,"fallback":""}', 'system', now())
      `;
      const { runVentaPrimeroMigration } = await import("../src/db/migrations/011_venta_primero.js");
      await runVentaPrimeroMigration(appSql);
      const publicado = await settings.getPublishedStagePrompt("nuevo");
      expect(publicado.version).toBe(4);
      expect(publicado.prompt).toContain("esa manda");
      expect(publicado.prompt).not.toContain("confirma la medida antes de hablar de precios");
      // Unión: conserva las que tenía y suma las de venta-primero.
      expect(publicado.allowedTools).toEqual(expect.arrayContaining([
        "buscar_llanta", "buscar_catalogo", "fitment_vehiculo",
        "generar_cotizacion", "buscar_por_aro_y_tipo", "tipos_de_llanta", "preparar_opciones",
      ]));
    });

    it("la migración NO pisa un prompt editado por el dueño", async () => {
      // Simula una edición del panel: nueva versión publicada, v1 archivada.
      await appSql`
        update stage_prompt_versions set status='archived' where stage='medida_confirmada' and version=1
      `;
      await appSql`
        insert into stage_prompt_versions (stage, version, status, objective, prompt, allowed_tools, settings, created_by, published_at)
        values ('medida_confirmada', 2, 'published', 'obj del dueño', 'prompt del dueño', '["buscar_llanta"]', '{"autoAction":"none","requiresHumanApproval":false,"fallback":""}', 'owner', now())
      `;
      const { runVentaPrimeroMigration } = await import("../src/db/migrations/011_venta_primero.js");
      await runVentaPrimeroMigration(appSql);
      const publicado = await settings.getPublishedStagePrompt("medida_confirmada");
      expect(publicado.prompt).toBe("prompt del dueño");
    });
  });

  describe("anti-duplicado: la cotización reciente es un hecho, no una esperanza", () => {
    it("expone la última cotización del ciclo con número y minutos", async () => {
      const [c] = await appSql<{ id: number }[]>`
        insert into conversations (phone, name, stage, tire_size)
        values ('593995614041', 'KLEVER', 'seleccionando', '225/60R17')
        returning id
      `;
      await appSql`
        insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, created_at)
        values (${c.id}, 1, '[]', 555.30, 83.29, 638.59, 'COT-MSGJQPAK', now() - interval '5 minutes')
      `;
      const facts = await agent.getAgentSalesFacts(c.id);
      expect(facts.lastQuote?.number).toBe("COT-MSGJQPAK");
      expect(facts.lastQuote?.total).toBeCloseTo(638.59);
      expect(facts.lastQuote?.minutesAgo).toBeGreaterThanOrEqual(4);
      expect(facts.lastQuote?.minutesAgo).toBeLessThanOrEqual(6);

      // Con cotización de hace 5 min, el prompt PROHÍBE generar otra.
      const bloque = agent.salesFactsPrompt(facts);
      expect(bloque).toContain("NO generes otra cotización");
      expect(bloque).toContain("COT-MSGJQPAK");
    });

    it("pasados 30 minutos ya no bloquea (el cliente pudo cambiar de pedido)", () => {
      const bloque = agent.salesFactsPrompt({
        tireSize: "225/60R17", vehicle: null, vehicleYear: null,
        selectedProductCode: null, selectedQuantity: 4,
        lastQuote: { number: "COT-VIEJA", total: 638.59, minutesAgo: 45 },
      });
      expect(bloque).not.toContain("NO generes otra cotización");
      // Pero la cotización sigue listada como hecho.
      expect(bloque).toContain("COT-VIEJA");
    });

    it("siempre recuerda: con medida no se pregunta vehículo, y nunca fotos", () => {
      const bloque = agent.salesFactsPrompt({
        tireSize: null, vehicle: null, vehicleYear: null,
        selectedProductCode: null, selectedQuantity: null, lastQuote: null,
      });
      expect(bloque).toContain("cotiza con esa medida");
      expect(bloque).toContain("Nunca pidas fotos");
    });
  });

  describe("la rúbrica atrapa las respuestas reales que arruinaron las ventas", () => {
    const ctxConMedida = {
      etapa: "nuevo", clienteDioMedida: true, turno: 2,
      tienePrecioAutorizado: false, tieneDescuentoAutorizado: false, tieneStock: false,
    };

    it("reprueba la respuesta real del caso Orlando (pidió foto)", () => {
      const respuestaReal =
        "No tengo una medida verificada para ese modelo.\n\n¿Podrías enviarme una foto de la etiqueta de la puerta o de la medida que aparece en una llanta actual? Así confirmamos la compatibilidad.";
      const r = evaluarReglas(respuestaReal, ctxConMedida);
      expect(r.fallos.map((f: { id: string }) => f.id)).toContain("pide_foto");
      expect(r.aprueba).toBe(false);
    });

    it("reprueba la respuesta real del caso KLEVER (pidió versión teniendo la medida)", () => {
      const respuestaReal =
        "No tengo una ficha técnica verificada para afirmar que estas llantas son todo terreno. Quisiera verificar la compatibilidad de su vehículo. ¿Me puede dar la versión de su auto?";
      const r = evaluarReglas(respuestaReal, ctxConMedida);
      expect(r.fallos.map((f: { id: string }) => f.id)).toContain("pregunta_vehiculo_con_medida");
    });

    it("reprueba el «si prefieres mándame una foto del costado» del primer turno", () => {
      const respuestaReal =
        "¡Hola! Con gusto le ayudo. ¿Qué medida dice el filo de su llanta actual? Si prefiere, puede mandarme una foto del costado y yo la leo.";
      const r = evaluarReglas(respuestaReal, { ...ctxConMedida, clienteDioMedida: false, turno: 1 });
      expect(r.fallos.map((f: { id: string }) => f.id)).toContain("pide_foto");
    });

    it("aprueba la conducta nueva: pedir la medida escrita y avanzar", () => {
      const respuestaBuena =
        "¡Buenas! Para cotizarle de una: ¿me escribe la medida que dice el filo de la llanta? Es algo como 225/65R17.";
      const r = evaluarReglas(respuestaBuena, { ...ctxConMedida, clienteDioMedida: false, turno: 1 });
      expect(r.fallos.map((f: { id: string }) => f.id)).not.toContain("pide_foto");
      expect(r.aprueba).toBe(true);
    });

    it("aprueba ofrecer con límite dicho sin frenar la venta", () => {
      const respuestaBuena =
        "En esa medida tengo Falken Wildpeak A/T, justo lo todo terreno que busca. ¿Le preparo la cotización por las 4?";
      const r = evaluarReglas(respuestaBuena, ctxConMedida);
      expect(r.fallos.filter((f: { gravedad: string }) => f.gravedad !== "baja")).toHaveLength(0);
    });
  });

  describe("candado anti-duplicado en la herramienta misma (caso KLEVER)", () => {
    it("con una cotización vigente por el MISMO pedido, la tool devuelve el número existente sin generar otra", async () => {
      const [c] = await appSql<{ id: number }[]>`
        insert into conversations (phone, name, stage, tire_size, selected_quantity)
        values ('593995614099', 'KLEVER BIS', 'seleccionando', '225/60R17', 4)
        returning id
      `;
      await appSql`
        insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, created_at)
        values (${c.id}, 1,
                '[{"code":"FALKEN-ZE310R-22560R17","quantity":4}]',
                555.30, 83.29, 638.59, 'COT-VIGENTE1', now() - interval '5 minutes')
      `;
      const { buildTools } = await import("../src/agent/tools.js");
      const tools = buildTools({
        conversation: { id: c.id, phone: "593995614099", name: "KLEVER BIS", stage: "seleccionando", bot_paused_until: null, status: "open", current_cycle: 1 },
        customerPhone: "593995614099",
        currentUserText: "Las 4 llantas",
      } as never);
      const cotizar = tools.find((t) => t.function.name === "generar_cotizacion")!;
      const resultado = JSON.parse(await cotizar.execute({
        items: [{ code: "FALKEN-ZE310R-22560R17", cantidad: 4 }],
        nombre_cliente: "KLEVER BIS",
      }));
      // No genera una segunda: recuerda la vigente, con su número.
      expect(resultado.mensaje_para_enviar).toContain("COT-VIGENTE1");
      const [conteo] = await appSql<{ n: number }[]>`
        select count(*)::int as n from quotes where conversation_id=${c.id}
      `;
      expect(conteo.n).toBe(1);
    });
  });

  describe("fitment nunca vuelve a pedir foto", () => {
    it("todas las salidas de la investigación piden la medida escrita", async () => {
      const { researchVehicleFitment } = await import("../src/services/vehicleFitmentResearch.js");
      // Vehículo inexistente → rama not_found (sin red: NODE_ENV=test corta la web).
      const r = await researchVehicleFitment("MarcaFicticia", "ModeloFicticio", null);
      expect(r.status).toBe("not_found");
      expect(r.nextQuestion ?? "").not.toMatch(/foto|imagen/i);
      expect(r.nextQuestion).toContain("medida");
    });
  });
});
