/**
 * REVISIÓN FINAL (21-oct) del sprint 1 de la auditoría del 19-oct.
 *
 * 1. El «¿Cuál le cotizo…?» del menú sin elegir lo tiene que garantizar un
 *    candado DESPUÉS del Ángel Guardián: si él lo cambiaba por «¿Se la
 *    cotizo?», nadie lo restauraba.
 * 3. El hecho de la oferta va en el bloque que la CONTIENE: si el envío se
 *    cortaba después de ella, la oferta que el cliente leyó quedaba sin hecho.
 */
import { describe, expect, it } from "vitest";
import { bloqueDeLaOferta, type OfertaDeCotizar } from "../src/domain/ofertaVigente.js";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
const { PASOS } = await import("../src/services/prepararSalida.js");

const menuSinElegir: OfertaDeCotizar = { tipo: "oferta_de_cotizar", clase: "menu", opciones: 3, sinElegir: true };
const nombres = PASOS.map((p) => p.nombre);
const candado = PASOS.find((p) => p.nombre === "menu_sin_elegir_pregunta_cual")!;
const ctx = (ofertaDelTurno: OfertaDeCotizar | null) => ({
  conversation: { id: 1, current_cycle: 1, stage: "medida_confirmada" as const },
  tipo: "respuesta" as const,
  ofertaDelTurno,
});

describe("el «¿Cuál le cotizo…?» va después del Guardián", () => {
  it("el candado existe, corre después de angel_guardian y antes de separar la pregunta", () => {
    expect(candado).toBeTruthy();
    expect(nombres.indexOf("menu_sin_elegir_pregunta_cual")).toBeGreaterThan(nombres.indexOf("angel_guardian"));
    expect(nombres.indexOf("menu_sin_elegir_pregunta_cual")).toBeLessThan(nombres.indexOf("pregunta_en_su_propio_mensaje"));
  });

  it("si el Guardián la cambió por «¿Se la cotizo?», se restaura (chat 29367, «Ok gracias»)", async () => {
    expect(await candado.aplicar("Con gusto 😊\n---\n¿Se la cotizo? 😊", ctx(menuSinElegir) as never))
      .toBe("Con gusto 😊\n---\n¿Cuál le cotizo, la 1, la 2 o la 3?");
  });

  it("chat 28606 (revisión final, r2 y r3): el Guardián la cambió por «¿prefiere la 1 o la 2?» o «¿le cotizo la *1, la 2 o la 3*?» → se reemplaza, no se duplica", async () => {
    expect(await candado.aplicar("Perfecto, son *4 llantas*.\n---\nPara cotizarle el juego, ¿prefiere la 1 o la 2?", ctx(menuSinElegir) as never))
      .toBe("Perfecto, son *4 llantas*.\n---\nPara cotizarle el juego, ¿Cuál le cotizo, la 1, la 2 o la 3?");
    expect(await candado.aplicar("Para las *4 llantas*, ¿le cotizo la *1, la 2 o la 3*?", ctx(menuSinElegir) as never))
      .toBe("Para las *4 llantas*, ¿Cuál le cotizo, la 1, la 2 o la 3?");
  });

  it("si el Guardián la quitó, se agrega en su propio bloque", async () => {
    expect(await candado.aplicar("Con tarjeta no es más caro.", ctx(menuSinElegir) as never))
      .toBe("Con tarjeta no es más caro.\n---\n¿Cuál le cotizo, la 1, la 2 o la 3?");
  });

  it("no toca nada si la puerta no declaró un menú sin elegir (la lista inicial, una oferta de una llanta)", async () => {
    const lista = "1 · A\n2 · B\n3 · C\n---\n¿Le cotizo la 1, la 2 o la 3?";
    expect(await candado.aplicar(lista, ctx({ tipo: "oferta_de_cotizar", clase: "menu", opciones: 3 }) as never)).toBe(lista);
    expect(await candado.aplicar("¿Se la cotizo? 😊", ctx({ tipo: "oferta_de_cotizar", clase: "una", codigo: "X" }) as never)).toBe("¿Se la cotizo? 😊");
    expect(await candado.aplicar("¿Se la cotizo? 😊", ctx(null) as never)).toBe("¿Se la cotizo? 😊");
  });
});

describe("el hecho va en el bloque que contiene la oferta", () => {
  it("chat 29029: la Falken en el bloque 1, «¿Se la cotizo?» en el 2 → el 2", () => {
    expect(bloqueDeLaOferta(["Para la medida *215/65R16*, le mostré la *FALKEN WILDPEAK A/T TRAIL*.", "¿Se la cotizo? 😊"])).toBe(1);
  });
  it("la oferta antes de bloques que no ofrecen nada → el de la oferta, no el último", () => {
    expect(bloqueDeLaOferta(["Perfecto, 4 llantas.", "¿Cuál le cotizo, la 1, la 2 o la 3?", "📍 *Depot Tire Cumbayá*: https://maps…"])).toBe(1);
  });
  it("sin ningún bloque que ofrezca solo, el último", () => {
    expect(bloqueDeLaOferta(["Hola", "¿Qué día puede pasar?"])).toBe(1);
  });
});
