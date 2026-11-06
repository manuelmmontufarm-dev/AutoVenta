/**
 * PRUEBA DE «PERFIL AJENO» — POLÍTICA (Sprint 4, R-20).
 *
 * Con otro negocio cargado (`NEGOCIO=ejemplo` y `NEGOCIO=mundillantas`, módulos
 * recargados), nada de lo que el bot o el guardián leen puede traer la forma
 * de vender de Depot: ni sus locales, ni su ciudad, ni sus marcas, ni sus
 * cuotas. Es la red que avisa si un cambio futuro vuelve a clavar Depot en el
 * código común.
 *
 * Los casos de Mundillantas se saltan mientras su perfil (Sprint 1) no exista
 * en esta rama: el chequeo es por archivo, SIN importar `negocio/index.ts`
 * antes (eso fijaría el perfil de Depot). El Sprint Final los vuelve obligatorios.
 *
 * Lo que queda a propósito: dos ejemplos históricos EN MAYÚSCULAS de las reglas
 * 13 y 21 del guardián («*4 WINRUN R380*», «*KENDA KR28*»). Son citas de casos
 * reales de la rúbrica de Depot y cambiarlas rompería su texto byte a byte;
 * la expresión de abajo, como la del plan, distingue mayúsculas.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const DE_DEPOT = /Depot|Cumbayá|Quito|quiteño|Falken|Kenda|Winrun|3 y 6 meses/;
const ETAPAS = ["nuevo", "medida_confirmada", "seleccionando", "cotizacion_enviada", "seguimiento_venta", "ganado", "perdido"] as const;
const TONOS = ["calido", "neutral", "formal"] as const;

async function cargarComo(id: string) {
  vi.resetModules();
  process.env.NEGOCIO = id;
  const { buildSystemPrompt } = await import("../src/agent/prompts.js");
  const { DEFAULT_AI_CONFIG } = await import("../src/services/settings.js");
  const guardian = await import("../src/services/guardian.js");
  const { buildTools } = await import("../src/agent/tools.js");
  const { PASOS } = await import("../src/services/prepararSalida.js");
  const { politica } = await import("../src/negocio/politica.js");
  const { VOCABULARIO_TRANSCRIPCION } = await import("../src/domain/transcripcionEco.js");
  const { promptCandidatosFitment } = await import("../src/domain/fitmentResearch.js");
  const { COMPACT_PLAYBOOK } = await import("../src/agent/compactPlaybook.js");
  const temporada = await import("../src/services/hechosDeTemporada.js");
  return {
    buildSystemPrompt, DEFAULT_AI_CONFIG, guardian, buildTools, PASOS, politica,
    VOCABULARIO_TRANSCRIPCION, promptCandidatosFitment, COMPACT_PLAYBOOK, temporada,
  };
}

type Cargado = Awaited<ReturnType<typeof cargarComo>>;

const ctxDeSalida = (textoDelCliente: string) =>
  ({ conversation: { id: 1, current_cycle: 1 }, tipo: "respuesta", textoDelCliente }) as never;
const ctxDeHerramientas = {
  conversation: { id: 1, current_cycle: 1, stage: "nuevo", phone: "+593990000001" },
  currentUserText: "",
} as never;

function sinDepot(texto: string, donde: string) {
  const hallado = DE_DEPOT.exec(texto);
  expect(hallado ? `${donde}: «…${texto.slice(Math.max(0, hallado.index - 60), hallado.index + 40)}…»` : null).toBeNull();
}

function casos(id: string, saltar: boolean) {
  describe.skipIf(saltar)(`NEGOCIO=${id}`, () => {
    let m: Cargado;
    const negocioAntes = process.env.NEGOCIO;
    beforeAll(async () => { m = await cargarComo(id); });
    afterAll(() => {
      if (negocioAntes === undefined) delete process.env.NEGOCIO; else process.env.NEGOCIO = negocioAntes;
      vi.resetModules();
    });

    it("el prompt del sistema (todas las etapas y tonos) no trae nada de Depot", () => {
      sinDepot(m.buildSystemPrompt(m.DEFAULT_AI_CONFIG), "prompt sin etapa");
      for (const tono of TONOS) {
        for (const key of ETAPAS) {
          const prompt = m.buildSystemPrompt(
            { ...m.DEFAULT_AI_CONFIG, tono },
            { key, name: key, objective: "Avanzar", prompt: "", version: 1 },
          );
          sinDepot(prompt, `prompt ${key}/${tono}`);
        }
      }
      sinDepot(m.COMPACT_PLAYBOOK, "playbook");
    });

    it("las reglas del guardián (INSTRUCCIONES y SEGUIMIENTO) y sus HECHOS de política no traen nada de Depot", () => {
      sinDepot(m.guardian.INSTRUCCIONES, "INSTRUCCIONES");
      sinDepot(m.guardian.INSTRUCCIONES_SEGUIMIENTO, "INSTRUCCIONES_SEGUIMIENTO");
      sinDepot(m.guardian.hechoDePagos(), "hechoDePagos");
      sinDepot(m.guardian.hechoDeOrigenDeMarcas() ?? "", "hechoDeOrigenDeMarcas");
    });

    it("la regla 16 habla de los locales del perfil, no de «los dos locales» de Depot", () => {
      expect(m.guardian.INSTRUCCIONES).not.toContain("jueves de 4 a 5 en Quito Sur");
    });

    it("respaldo_marcas (descripción y salida) y las demás herramientas no traen nada de Depot", async () => {
      const herramientas = m.buildTools(ctxDeHerramientas);
      for (const t of herramientas) {
        sinDepot(`${t.function.description}\n${JSON.stringify(t.function.parameters)}`, `herramienta ${t.function.name}`);
      }
      const respaldo = herramientas.find((t) => t.function.name === "respaldo_marcas")!;
      sinDepot(await respaldo.execute({ marca: null, precio_con_iva: null }), "salida de respaldo_marcas");
    });

    it("los pasos de pago y beneficio de prepararSalida no traen nada de Depot", async () => {
      const paso = (nombre: string) => m.PASOS.find((p) => p.nombre === nombre)!;
      for (const [nombre, borrador, cliente] of [
        ["sin_descuento_negado", "No hay descuento adicional por efectivo.\n---\n¿Le ayudo con algo más?", "ok"],
        ["el_pago_se_responde", "No puedo confirmar recargos de tarjeta por este medio.", "¿si pago con tarjeta sube el valor?"],
        ["el_pago_se_responde", "Le confirmo enseguida.\n---\n¿A cuál local le queda mejor ir?", "¿aceptan tarjeta? ¿hay cuotas?"],
        ["el_beneficio_se_responde", "¿Le ayudo con algo más?", "¿tienen alguna promoción por redes sociales?"],
        ["la_promocion_de_temporada_se_responde", "¿Le ayudo con algo más?", "¿tienen promo de black friday?"],
      ] as const) {
        sinDepot(String(await paso(nombre).aplicar(borrador, ctxDeSalida(cliente))), `paso ${nombre}`);
      }
    });

    it("el Black Friday de Depot no existe: ni hecho del vendedor, ni del guardián, ni respuesta, ni consulta de servicio", () => {
      const noviembre = new Date("2026-11-05T17:00:00Z");
      expect(m.politica.promocionDeTemporada).toBeUndefined();
      expect(m.temporada.hechoDeTemporadaParaElVendedor({ ahora: noviembre, beneficios: ["Alineación incluida"] })).toBeNull();
      expect(m.temporada.hechoDeTemporadaParaElGuardian({ ahora: noviembre })).toBeNull();
      expect(m.temporada.resumenDeLaPromocion({ ahora: noviembre })).toBeNull();
      expect(m.temporada.consultaDeTemporadaDelTurno(["cuánto el cambio de aceite?"], { ahora: noviembre })).toBeNull();
    });

    it("los textos regionales (Whisper, investigación del vehículo) son de su ciudad", () => {
      sinDepot(m.VOCABULARIO_TRANSCRIPCION, "vocabulario de Whisper");
      sinDepot(m.promptCandidatosFitment("Kia Sportage 2020", 17), "investigación de fitment");
    });

    it("sin formas de pago en la política: el bot no las promete y los pasos devuelven el texto intacto", async () => {
      if (m.politica.formasDePago.length) return;
      const prompt = m.buildSystemPrompt(m.DEFAULT_AI_CONFIG);
      expect(prompt).toContain("Formas de pago: todavía no están confirmadas");
      expect(prompt).not.toMatch(/sin intereses|no sube/);
      const paso = (nombre: string) => m.PASOS.find((p) => p.nombre === nombre)!;
      const borrador = "Le confirmo enseguida.\n---\n¿A cuál local le queda mejor ir?";
      expect(await paso("el_pago_se_responde").aplicar(borrador, ctxDeSalida("¿aceptan tarjeta?"))).toBe(borrador);
      expect(await paso("sin_descuento_negado").aplicar("No hay descuento en efectivo.", ctxDeSalida("ok"))).toBe("No hay descuento en efectivo.");
    });

    it("sin beneficio de redes en la política: no se menciona", async () => {
      if (m.politica.beneficioDeRedes) return;
      const paso = m.PASOS.find((p) => p.nombre === "el_beneficio_se_responde")!;
      const borrador = "¿Le ayudo con algo más?";
      expect(await paso.aplicar(borrador, ctxDeSalida("¿hay algún beneficio por venir de redes sociales?"))).toBe(borrador);
    });
  });
}

casos("ejemplo", false);
// Desde el Sprint Final el perfil de Mundillantas está en el árbol: obligatoria.
casos("mundillantas", false);
