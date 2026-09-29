/**
 * UN TURNO QUE EMPEZÓ CON UN MENSAJE DEL CLIENTE NO TERMINA EN SILENCIO.
 *
 * Conv 22481 (+593 99 365 5671, 23-sep 18:03): «Yo vivo en Ibarra, estando en
 * Quito sector norte». El agente corrió, el guardián aprobó mapas + «¿Qué día
 * podría pasar?», y `sin_visita_si_no_puede_venir` lo quitó todo y devolvió
 * null. La puerta hizo `if (!salida.texto) return;`: ni mensaje, ni alerta, y
 * el cliente esperó 5 días. Otros pasos también pueden devolver null.
 *
 * La familia: «un paso vacía el turno y nadie se entera». El dueño de la
 * decisión es `correrPasos`, no cada puerta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const alertas: Array<Record<string, unknown>> = [];
vi.mock("../src/services/followUps.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/services/followUps.js")>();
  return { ...real, createBotAlert: vi.fn(async (a: Record<string, unknown>) => { alertas.push(a); }) };
});

import type { ContextoDeSalida, PasoDeSalida } from "../src/services/prepararSalida.js";
// La cadena arrastra la config de la app al importarse; valores de mentira.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
const { correrPasos, RESPALDO_TURNO_VACIO } = await import("../src/services/prepararSalida.js");

const ctx = (tipo: ContextoDeSalida["tipo"]): ContextoDeSalida => ({
  conversation: { id: 22481, current_cycle: 3, stage: "seguimiento_venta" as never },
  tipo, textoDelCliente: "Yo vivo en Ibarra, estando en Quito sector norte",
});
const paso = (nombre: string, salida: string | null, extra: Partial<PasoDeSalida> = {}): PasoDeSalida => ({
  nombre, corre: ["respuesta", "retomada", "seguimiento"], aplicar: async () => salida, ...extra,
});

beforeEach(() => { alertas.length = 0; });

describe("turno vaciado por un paso", () => {
  it("conv 22481: sale la línea segura (no mapa ni visita) y queda una alerta alta con el paso", async () => {
    const r = await correrPasos([paso("sin_visita_si_no_puede_venir", null)], "mapas + ¿Qué día podría pasar?", ctx("respuesta"));
    expect(r.texto).toBe(RESPALDO_TURNO_VACIO);
    expect(r.texto).toBe("Le consulto con un asesor y le confirmo por acá 🙌");
    expect(r.texto).not.toMatch(/maps|qu[eé] d[ií]a|local/i);
    expect(r.vaciadoPor).toBe("sin_visita_si_no_puede_venir");
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      conversationId: 22481, cycle: 3, priority: "high",
      dedupeKey: "turno_vacio:22481:3",
    });
    expect(String(alertas[0].exactReason)).toContain("sin_visita_si_no_puede_venir");
  });

  it("la puerta retomada tiene el mismo respaldo", async () => {
    const r = await correrPasos([paso("x", null)], "hola", ctx("retomada"));
    expect(r.texto).toBe(RESPALDO_TURNO_VACIO);
    expect(alertas).toHaveLength(1);
  });

  it("un paso que declara «callar es lo correcto» no recibe respaldo ni alerta", async () => {
    const r = await correrPasos([paso("despedida", null, { silencioEsCorrecto: true })], "hola", ctx("respuesta"));
    expect(r.texto).toBeNull();
    expect(alertas).toHaveLength(0);
  });

  it("el seguimiento no nace de un mensaje del cliente: callar sigue siendo callar", async () => {
    const r = await correrPasos([paso("sin_calco_del_hilo", null)], "hola", ctx("seguimiento"));
    expect(r.texto).toBeNull();
    expect(alertas).toHaveLength(0);
  });

  it("un borrador vacío desde el agente tampoco se pierde", async () => {
    const r = await correrPasos([paso("a", "algo")], "", ctx("respuesta"));
    expect(r.texto).toBe(RESPALDO_TURNO_VACIO);
    expect(r.vaciadoPor).toBe("borrador_vacio");
  });

  it("un turno normal no se toca", async () => {
    const r = await correrPasos([paso("a", "Claro 😊")], "Claro 😊", ctx("respuesta"));
    expect(r.texto).toBe("Claro 😊");
    expect(alertas).toHaveLength(0);
  });
});
