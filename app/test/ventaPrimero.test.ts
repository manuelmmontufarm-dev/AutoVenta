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
    });

    /**
     * La prohibición de pedir fotos venció el 6-ago, cuando vision.ts entró a
     * producción: hoy el bot SÍ lee fotos, y prohibírselo le quita la jugada que
     * hace cualquier vendedor en el local («mándeme una foto y le confirmo»).
     * Lo que NO vence es la regla del caso Orlando: pedir algo nunca puede ser
     * el mensaje completo.
     */
    it("ya no dice que no puede leer fotos (visión entró a producción el 6-ago)", () => {
      const texto = prompts.buildSystemPrompt();
      expect(texto).not.toMatch(/PROHIBIDO PEDIR FOTOS|no puedes leer(las)?|no puedo leer/i);
      expect(texto).toContain("sí puedes leer fotos");
    });

    it("pedir la medida o la foto nunca puede ser el mensaje completo", () => {
      const texto = prompts.buildSystemPrompt();
      expect(texto).toContain("la petición nunca puede ser el mensaje completo");
    });

    it("el tipo de llanta que pide el cliente dispara búsqueda, no ficha verificada", () => {
      const texto = prompts.buildSystemPrompt();
      expect(texto).toMatch(/describe el USO o el TIPO[\s\S]{0,200}buscar_por_aro_y_tipo/);
    });

    /**
     * Caso real del 7-ago (conversación 1704): "Para rin 19 / hyundai creta
     * 2027" y el bot no ofreció NADA porque se fue por fitment. El aro solo
     * ya alcanza para mostrar opciones.
     */
    it("un ARO sin tipo basta para buscar: tipo null y a mostrar opciones", () => {
      const texto = prompts.buildSystemPrompt();
      expect(texto).toContain("El ARO solo ya es suficiente para mostrar opciones");
      // El paso 1c tiene que decir explícitamente cómo se llama la tool sin tipo.
      expect(texto).toMatch(/ARO[\s\S]{0,400}buscar_por_aro_y_tipo[\s\S]{0,200}tipo: null/);
      // El tipo y el uso son preguntas POSTERIORES, nunca un peaje previo.
      expect(texto).toMatch(/TIPO y el USO se preguntan DESPU[ÉE]S/);
    });

    it("el aro le gana al vehículo, igual que la medida", () => {
      const texto = prompts.buildSystemPrompt();
      expect(texto).toMatch(/ARO tambi[ée]n manda sobre el veh[íi]culo/);
      // Con aro en el mismo mensaje que el carro, fitment queda fuera.
      expect(texto).toMatch(/fitment_vehiculo es el [úu]ltimo recurso[\s\S]{0,160}no hay medida NI aro/);
    });

    it("prohíbe cerrar un turno con una limitación y una pregunta, sin ofrecer nada", () => {
      const texto = prompts.buildSystemPrompt();
      expect(texto).toMatch(/PROHIBIDO terminar un turno con una limitaci[óo]n tuya y una pregunta/);
      // "No tengo una medida verificada" nunca puede ser el mensaje completo.
      expect(texto).toMatch(/no tengo una medida verificada[\s\S]{0,200}NUNCA pueden ser el mensaje completo/i);
      expect(texto).toMatch(/NUNCA pueden ser el mensaje completo[\s\S]{0,240}opciones del aro/i);
    });
  });

  /*
   * Caso Eulalia (19-ago, conv 7832): «¿se la cotizo por 4?» → «uyedeme porfa»
   * → volvió a preguntar lo mismo → «list» → «¿a su nombre o como cliente
   * final?». Tres confirmaciones para una cotización que estaba lista; salió
   * 1 h 48 min después. La pregunta por el nombre nacía del esquema: el campo
   * era obligatorio y el modelo preguntaba para llenarlo.
   */
  describe("caso Eulalia: cotizar no pregunta el nombre", () => {
    it("nombre_cliente ya no es requerido en generar_cotizacion", async () => {
      const { buildTools } = await import("../src/agent/tools.js");
      const tools = buildTools({
        conversation: { id: 1, current_cycle: 1 } as never,
        customerPhone: "593999999999",
        customerName: "Eulalia",
        currentUserText: "List",
      });
      const cotizar = tools.find((t) => t.function.name === "generar_cotizacion");
      const params = cotizar?.function.parameters as { required?: string[] };
      expect(params.required ?? []).not.toContain("nombre_cliente");
    });

    it("el prompt prohíbe la pregunta y acepta «uyedeme porfa» como un sí", () => {
      const prompt = prompts.buildSystemPrompt();
      expect(prompt).toMatch(/cliente final/i);
      expect(prompt).toMatch(/uyedeme/i);
      expect(prompt).toMatch(/ayúdeme/i);
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
      // El número sigue siendo un HECHO (facts.lastQuote.number, arriba), pero
      // desde el 26-ago no viaja al prompt: si el modelo no puede decírselo al
      // cliente, tenerlo a la vista solo lo tienta. Ver domain/numerosDeCotizacion.
      expect(bloque).not.toContain("COT-MSGJQPAK");
      expect(bloque).toContain("Cotización YA ENVIADA en este ciclo");
    });

    it("pasados 30 minutos ya no bloquea (el cliente pudo cambiar de pedido)", () => {
      const bloque = agent.salesFactsPrompt({
        tireSize: "225/60R17", vehicle: null, vehicleYear: null,
        selectedProductCode: null, selectedQuantity: 4,
        lastQuote: { number: "COT-VIEJA", total: 638.59, minutesAgo: 45 },
      });
      expect(bloque).not.toContain("NO generes otra cotización");
      // Pero la cotización sigue listada como hecho — por su contenido, no por
      // su número.
      expect(bloque).toContain("Cotización YA ENVIADA en este ciclo");
      expect(bloque).not.toContain("COT-VIEJA");
    });

    it("siempre recuerda: con medida no se pregunta vehículo, y la foto es una opción válida", () => {
      const bloque = agent.salesFactsPrompt({
        tireSize: null, vehicle: null, vehicleYear: null,
        selectedProductCode: null, selectedQuantity: null, lastQuote: null,
      });
      expect(bloque).toContain("cotiza con esa medida");
      // Antes aquí decía "Nunca pidas fotos". Venció el 6-ago con vision.ts en
      // producción: hoy pedir la foto del costado es la jugada del vendedor.
      expect(bloque).not.toMatch(/Nunca pidas fotos|no puedes leer(las)?/i);
      expect(bloque).toContain("sí puedes leer fotos");
    });
  });

  /*
   * Informe del guardián, semana del 14-ago (170 correcciones): las familias
   * grandes eran re-preguntar datos ya confirmados y atribuirle a la cotización
   * vigente una medida o marca que no contiene. Los hechos ahora llevan la
   * prohibición pegada al dato, y la cotización lleva su contenido.
   */
  describe("los hechos matan las re-preguntas del informe del guardián", () => {
    const base = {
      tireSize: null, vehicle: null, vehicleYear: null,
      selectedProductCode: null, selectedQuantity: null,
      nearestStore: null, visitDate: null, visitTimeLabel: null, customerCommitment: null,
      lastQuote: null,
    };

    it("cada dato confirmado lleva su prohibición pegada", () => {
      const bloque = agent.salesFactsPrompt({
        ...base,
        tireSize: "235/75R15",
        selectedQuantity: 4,
        nearestStore: "Depot Tire Quito Sur",
        // La prohibición de repreguntar el día cuelga de la FECHA REGISTRADA,
        // no del texto del cliente (cambio del 26-ago, ver el caso de abajo).
        visitDate: new Date("2026-08-27T15:00:00.000Z"),
        customerCommitment: "mañana en la tarde",
      });
      expect(bloque).toMatch(/235\/75R15 — PROHIBIDO volver a pedir medida, aro o foto/);
      expect(bloque).toMatch(/PROHIBIDO preguntar «¿se la cotizo por 4\?»/);
      expect(bloque).toMatch(/PROHIBIDO escribir el otro local/);
      expect(bloque).toMatch(/PROHIBIDO volver a preguntar qué día viene/);
    });

    /*
     * Cazado en el simulador el 26-ago, y es el reverso exacto del bug del
     * 24-ago: antes, CUALQUIER compromiso —aunque fuera solo una hora— imprimía
     * «PROHIBIDO volver a preguntar qué día viene». Al cliente que escribió «de
     * 4 a 5 … ese día paso», el modelo se encontró con la pregunta prohibida y
     * sin el dato, y rellenó el hueco: «Listo, jueves de 4 a 5 pm». Nadie dijo
     * jueves. Un hecho que miente es peor que un hecho que falta.
     */
    it("un compromiso SIN fecha pide el día en vez de prohibir la pregunta", () => {
      const bloque = agent.salesFactsPrompt({
        ...base,
        nearestStore: "Depot Tire Quito Sur",
        visitDate: null,
        visitTimeLabel: "de 4 a 5 pm",
        customerCommitment: "X la tarde de 4 a 5 x yo soy de probincia i ese día paso x ai",
      });
      expect(bloque).toMatch(/el DÍA todavía NO lo dijo/);
      expect(bloque).toMatch(/PROHIBIDO escribir un día de la semana/);
      expect(bloque).not.toMatch(/PROHIBIDO volver a preguntar qué día viene/);
      expect(bloque).not.toMatch(/Local y visita ya están confirmados/);
    });

    it("la cotización vigente dice QUÉ contiene, no solo cuánto vale", async () => {
      const [c] = await appSql<{ id: number }[]>`
        insert into conversations (phone, name, status, stage, current_cycle)
        values ('593977000111', 'Guardián detalle', 'open', 'cotizacion_enviada', 1)
        returning id
      `;
      await appSql`
        insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, created_at)
        values (${c.id}, 1,
          ${appSql.json([{ code: "X", brand: "KENDA", design: "KR50", quantity: 4, sizeLabel: "225/60R17" }])},
          542.30, 81.34, 623.64, 'COT-MT06MIVA', now() - interval '5 minutes')
      `;
      const facts = await agent.getAgentSalesFacts(c.id);
      expect(facts.lastQuote?.detalle).toBe("4 × KENDA KR50 225/60R17");
      const bloque = agent.salesFactsPrompt(facts);
      expect(bloque).toContain("Cotización YA ENVIADA en este ciclo: 4 × KENDA KR50 225/60R17");
      expect(bloque).not.toContain("COT-MT06MIVA");
      expect(bloque).toContain("PROHIBIDO atribuirle otra medida");
    });

    it("detalleDeItems tolera items vacíos o con otra forma", () => {
      expect(agent.detalleDeItems([])).toBeNull();
      expect(agent.detalleDeItems(null)).toBeNull();
      expect(agent.detalleDeItems([{ quantity: 2 }])).toBeNull();
      expect(agent.detalleDeItems([{ brand: "FALKEN", design: "ZE310", quantity: 2, size: "205/55R16" }]))
        .toBe("2 × FALKEN ZE310 205/55R16");
    });
  });

  describe("la rúbrica atrapa las respuestas reales que arruinaron las ventas", () => {
    const ctxConMedida = {
      etapa: "nuevo", clienteDioMedida: true, turno: 2,
      tienePrecioAutorizado: false, tieneDescuentoAutorizado: false, tieneStock: false,
    };

    it("reprueba la respuesta real del caso Orlando (pidió y no ofreció nada)", () => {
      // Antes esto se reprobaba por `pide_foto`. Desde services/vision.ts el bot
      // sí lee fotos y la migración 012 repuso esa vía a propósito, así que lo
      // que reprueba ya no es la palabra «foto»: es que el turno entero sea un
      // «no tengo» seguido de una petición, sin nada que el cliente pueda mirar.
      const respuestaReal =
        "No tengo una medida verificada para ese modelo.\n\n¿Podrías enviarme una foto de la etiqueta de la puerta o de la medida que aparece en una llanta actual? Así confirmamos la compatibilidad.";
      const r = evaluarReglas(respuestaReal, ctxConMedida);
      expect(r.fallos.map((f: { id: string }) => f.id)).toContain("pide_sin_ofrecer");
      expect(r.aprueba).toBe(false);
    });

    it("reprueba la respuesta real del caso KLEVER (pidió versión teniendo la medida)", () => {
      const respuestaReal =
        "No tengo una ficha técnica verificada para afirmar que estas llantas son todo terreno. Quisiera verificar la compatibilidad de su vehículo. ¿Me puede dar la versión de su auto?";
      const r = evaluarReglas(respuestaReal, ctxConMedida);
      expect(r.fallos.map((f: { id: string }) => f.id)).toContain("pregunta_vehiculo_con_medida");
    });

    it("ofrecer la foto ya NO es el problema; quedarse sin ofrecer nada sí", () => {
      // Misma frase, dos veredictos: lo que cambia no es la foto, es si el turno
      // le deja algo al cliente.
      const soloPide =
        "¡Hola! Con gusto le ayudo. ¿Qué medida dice el filo de su llanta actual? Si prefiere, puede mandarme una foto del costado y yo la leo.";
      const ctx = { ...ctxConMedida, clienteDioMedida: false, turno: 1 };
      expect(evaluarReglas(soloPide, ctx).fallos.map((f: { id: string }) => f.id))
        .toContain("pide_sin_ofrecer");

      // La misma petición, pero acompañada de la guía de la medida (la pieza que
      // enseña dónde mirar), ya no deja al cliente con las manos vacías.
      expect(evaluarReglas(soloPide, { ...ctx, mandoPieza: true }).fallos.map((f: { id: string }) => f.id))
        .not.toContain("pide_sin_ofrecer");
    });

    it("aprueba la conducta de hoy: pedir el aro diciendo cuáles hay", () => {
      // Lo que cambió el 8-ago: el dato que se pide es el ARO, y la pregunta va
      // con una oferta pegada. Antes bastaba con pedir la medida escrita; hoy
      // eso solo es media respuesta.
      const respuestaBuena =
        "¡Buenas! Tenemos llantas en aros del 13 al 22. ¿Me dice su aro o la medida del costado, por ejemplo 225/65R17?";
      const r = evaluarReglas(respuestaBuena, { ...ctxConMedida, clienteDioMedida: false, turno: 1 });
      expect(r.fallos.map((f: { id: string }) => f.id)).not.toContain("pide_sin_ofrecer");
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
    it("con una cotización vigente por el MISMO pedido, la tool no genera ni repite el número", async () => {
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
      // No genera una segunda y tampoco vuelve a escribir el número que ya
      // está visible en la pieza original.
      expect(resultado.mensaje_para_enviar).not.toContain("COT-VIGENTE1");
      const [conteo] = await appSql<{ n: number }[]>`
        select count(*)::int as n from quotes where conversation_id=${c.id}
      `;
      expect(conteo.n).toBe(1);
    });
  });

  describe("INCLUYE aparece una sola vez", () => {
    it("la primera pieza lo muestra, la siguiente lo omite y un pedido explícito lo habilita", async () => {
      const [c] = await appSql<{ id: number }[]>`
        insert into conversations (phone, name, stage)
        values ('593995614177', 'BENEFICIOS UNA VEZ', 'seleccionando')
        returning id
      `;
      await appSql`
        insert into benefits (text, position, active)
        values ('Beneficio prueba única', -100, true)
      `;
      const { buildBenefitsBlockOnce, invalidateBenefitsCache } = await import("../src/services/benefits.js");
      invalidateBenefitsCache();

      const primera = await buildBenefitsBlockOnce(c.id, 1);
      expect(primera).toContain("*INCLUYE*");
      expect(primera).toContain("Beneficio prueba única");

      await appSql`
        insert into messages (conversation_id, role, content, cycle, status)
        values (${c.id}, 'assistant', ${primera}, 1, 'sent')
      `;
      expect(await buildBenefitsBlockOnce(c.id, 1)).toBe("");
      expect(await buildBenefitsBlockOnce(c.id, 1, {}, true)).toContain("*INCLUYE*");
    });
  });

  describe("fecha de visita ya respondida", () => {
    it("local_mas_cercano confirma Martes 10 am sin volver a pedir el día ni repetir descuento", async () => {
      const [c] = await appSql<{ id: number }[]>`
        insert into conversations (
          phone, name, stage, tire_size, nearest_store, location_label,
          visit_date, customer_commitment
        ) values (
          '593995614188', 'VISITA SIN REPETIR', 'cotizacion_enviada', '205/55R16',
          'Depot Tire Cumbayá', 'Cumbayá', now() + interval '2 days', 'Martes 10 am'
        ) returning id
      `;
      const { buildTools } = await import("../src/agent/tools.js");
      const tools = buildTools({
        conversation: { id: c.id, phone: "593995614188", name: "VISITA SIN REPETIR", stage: "cotizacion_enviada", bot_paused_until: null, status: "open", current_cycle: 1 },
        customerPhone: "593995614188",
        currentUserText: "Martes 10 am",
      } as never);
      const local = tools.find((t) => t.function.name === "local_mas_cercano")!;
      const result = JSON.parse(await local.execute({ lat: null, lng: null, sector: "Cumbayá" }));
      expect(result.mensaje_para_enviar).toContain("Martes 10 am");
      expect(result.mensaje_para_enviar).toContain("Depot Tire Cumbayá");
      expect(result.mensaje_para_enviar).not.toMatch(/qué día|podría pasar|descuento/i);
    });
  });

  /**
   * Este bloque se llamaba «fitment nunca vuelve a pedir foto» y exigía que la
   * repregunta NO mencionara la foto. Esa regla venció el 6-ago, cuando
   * vision.ts entró a producción: hoy el bot sí las lee, y el título afirmaba lo
   * contrario de la regla vigente. Lo que nunca venció es la lección del caso
   * Orlando — la foto no puede ser la ÚNICA salida, porque si el cliente maneja
   * o la llanta está sucia la conversación se para ahí. Así que ahora se exige
   * lo que de verdad protege al cliente: las dos vías, siempre juntas.
   */
  describe("fitment siempre ofrece las dos vías", () => {
    it("la salida not_found pide la medida escrita Y ofrece la foto", async () => {
      const { researchVehicleFitment } = await import("../src/services/vehicleFitmentResearch.js");
      // Vehículo inexistente → rama not_found (sin red: NODE_ENV=test corta la web).
      const r = await researchVehicleFitment("MarcaFicticia", "ModeloFicticio", null);
      expect(r.status).toBe("not_found");
      expect(r.nextQuestion).toMatch(/medida/i);
      // La foto ya es una vía válida, pero nunca sola: las dos en la misma frase.
      expect(r.nextQuestion).toMatch(/foto/i);
    });
  });
});
