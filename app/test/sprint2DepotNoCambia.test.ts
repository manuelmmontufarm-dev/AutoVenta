/**
 * SPRINT 2 (auditoría Competimotor 26-nov-2026): CON EL PERFIL DEPOT TODO SALE
 * IDÉNTICO. `main` deploya a los dos clientes a la vez; la lista con dos
 * precios, la pregunta que invita, la respuesta al «está caro» y el cierre
 * «¿Puede acercarse hoy…?» viven detrás de `politica.ventaConDosPrecios`.
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "depot";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.DATABASE_URL ||= "postgresql://nadie@localhost/no_se_usa";

const { armarLista, textoDeLaLista, preguntaDeLaLista, hechoDeLaLista } = await import("../src/domain/listaDeOpciones.js");
const { efectivoDeLaLlanta, promocionDeLaLlanta, extrasDeLaOpcionGuardada } = await import("../src/domain/preciosPorPago.js");
const { buildVisitPlanQuestion } = await import("../src/services/quoteMessages.js");
const { encabezadoDelIncluye } = await import("../src/services/benefits.js");
const { PASOS } = await import("../src/services/prepararSalida.js");
const { CORE_PLAYBOOK } = await import("../src/agent/compactPlaybook.js");
const { politica } = await import("../src/negocio/politica.js");

describe("Depot no cambia con el Sprint 2", () => {
  it("la política de Depot no trae las perillas nuevas", () => {
    expect(politica.ventaConDosPrecios).toBeUndefined();
    expect(politica.encabezadoDelIncluye).toBeUndefined();
  });

  it("la lista sale letra por letra como antes, con «¿Le cotizo la 1 o la 2?»", () => {
    const lista = armarLista([
      { nombre: "KENDA KR20", precio: 80.5, codigo: "K1", efectivo: efectivoDeLaLlanta({ minimumPriceWithTax: 80.5, preciosPorPago: { tarjetaConIva: 80.5, efectivoConIva: 70 } }) },
      { nombre: "FALKEN ZE310R", precio: 120, codigo: "F1" },
    ], 4)!;
    expect(textoDeLaLista(lista, 4)).toBe("1 · KENDA KR20 — $80.50 c/u · 4 = $322.00\n2 · FALKEN ZE310R — $120.00 c/u · 4 = $480.00\n\n¿Le cotizo la 1 o la 2?");
    expect(preguntaDeLaLista(3)).toBe("¿Le cotizo la 1, la 2 o la 3?");
    expect(preguntaDeLaLista(5)).toBe("¿Cuál le cotizo?");
    expect(hechoDeLaLista(lista, 4)).not.toContain("DOS precios");
  });

  it("ni efectivo ni promo se guardan en la lámina de Depot", () => {
    const item = { minimumPriceWithTax: 100, preciosPorPago: { tarjetaConIva: 100, efectivoConIva: 90 }, promocionDePrecio: { nombre: "Black Friday", vigenciaCorta: "x" } };
    expect(efectivoDeLaLlanta(item)).toBeNull();
    expect(promocionDeLaLlanta(item)).toBeNull();
    expect(extrasDeLaOpcionGuardada(item)).toEqual({});
  });

  it("la pregunta del día tras cotizar sigue con la cifra del descuento", () => {
    const texto = buildVisitPlanQuestion({
      conDescuentoAutorizado: false,
      locales: ["Cumbayá", "Quito Sur"],
      localElegido: "Cumbayá",
      ahorro: { monto: 277.44, porcentaje: 25, cantidad: 4, porLlanta: 69.36, precioConDescuento: 208.08, precioAntes: 277.44 },
    });
    expect(texto).toContain("*25 %* de descuento ya aplicado, *$277.44* menos");
    expect(texto).not.toContain("agendo la cita");
  });

  it("el INCLUYE es el de siempre", () => {
    expect(encabezadoDelIncluye()).toBe("*INCLUYE*");
  });

  it("el paso del «está caro» no toca el texto de Depot", async () => {
    const paso = PASOS.find((p) => p.nombre === "la_objecion_de_precio_se_responde")!;
    expect(paso).toBeTruthy();
    const ctx = { conversation: { id: 1, current_cycle: 1 }, textoDelCliente: "Disculpe están muy caras" } as never;
    expect(await paso.aplicar("texto del vendedor", ctx)).toBe("texto del vendedor");
  });

  it("el playbook de Depot no lleva la regla de la objeción", () => {
    expect(CORE_PLAYBOOK).not.toContain("Está caro");
  });
});
