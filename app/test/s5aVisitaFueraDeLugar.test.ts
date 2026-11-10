/**
 * SPRINT 5a (auditoría del 9-nov-2026) — EL BOT PREGUNTA DÍA O LOCAL A QUIEN NO
 * CORRESPONDE. La parte pura: las tres lecturas que deciden si el candado de
 * cierre puede pegar «¿A cuál local le queda mejor ir…?».
 *
 * Clase de entrada que dispara el error: el cliente dice que no puede venir
 * SIN nombrar una ciudad de la lista («está muy lejos», «soy de bolivar»,
 * «difícil ir a Quito»), o habla de una cotización AJENA («tengo una cotización
 * en $85 en Mazini»), o solo vio un menú sin elegir nada. En los tres casos el
 * candado cree que hay venta en cierre y que el cliente puede pasar.
 *
 * Textos reales de los chats 38924, 39597, 18535, 39845 y 39769.
 */
import { describe, expect, it } from "vitest";
import { hayCompromisoDeCierre } from "../src/domain/compromisoDeCierre.js";
import { dondeEstaElCliente } from "../src/domain/fueraDeCobertura.js";
import { elegirFaseOperativa } from "../src/agent/faseOperativa.js";

describe("13909 se queda como estaba (revisión ronda 1)", () => {
  it("la lámina sola SIGUE siendo compromiso: una venta de palabra (lámina, local, «Gracias») recibe la pregunta del día", () => {
    // 39769 sale por COTIZACION_AJENA (la fase deja de ser de cierre) y 39887
    // por la exención de la oferta del turno: ninguno necesitaba tocar esto.
    expect(hayCompromisoDeCierre({
      hayCotizacionFormal: false, hayPiezaDeOpciones: true, productoElegido: false, cantidadElegida: false,
    })).toBe(true);
  });
});

describe("C1 · «está muy lejos» dice que no viene aunque no nombre ciudad", () => {
  it.each([
    ["38924", "Está muy lejos le agradezco"],
    ["39597 16:09", "aya chuta esta lejos donde estoy yo bueno muchas gracias x su tiempo"],
    ["variante", "me queda lejos, gracias"],
    ["variante", "no puedo ir, gracias"],
    ["variante", "imposible ir hasta allá"],
  ])("%s: «%s» → fuera", (_conv, texto) => {
    expect(dondeEstaElCliente(texto)?.estado).toBe("fuera");
  });

  it("39597 16:10: «soy de bolivar esta muy aledado» → fuera, Bolívar", () => {
    const donde = dondeEstaElCliente("esq soy de bolivar esta muy aledado muchas gracias");
    expect(donde?.estado).toBe("fuera");
    expect(donde?.ciudad).toBe("Bolívar");
  });

  it("«Estoy en el oriente» (sin anunciar vuelta) → fuera", () => {
    expect(dondeEstaElCliente("Estoy en el oriente")?.estado).toBe("fuera");
  });

  it("la avenida Simón Bolívar de Quito NO es la provincia", () => {
    expect(dondeEstaElCliente("estoy por la Simón Bolívar")?.estado).not.toBe("fuera");
    expect(dondeEstaElCliente("vivo cerca de la av. bolivar")?.estado).not.toBe("fuera");
  });
});

describe("C2 · «difícil ir a Quito» no es «viene a Quito»", () => {
  it("18535: «Muy dificel ir a Quito» → fuera, no viene", () => {
    expect(dondeEstaElCliente("Muy dificel ir a Quito")?.estado).toBe("fuera");
  });

  it("variante: «no me es posible ir a Quito» → fuera", () => {
    expect(dondeEstaElCliente("no me es posible ir a Quito")?.estado).toBe("fuera");
  });
});

describe("los sanos no cambian", () => {
  it("«está lejos de mi casa pero voy el sábado» sigue siendo venta viva (no fuera)", () => {
    expect(dondeEstaElCliente("está lejos de mi casa pero voy el sábado")?.estado).not.toBe("fuera");
  });

  it("40082: «Yo vivo en pedernales» → fuera, Pedernales", () => {
    expect(dondeEstaElCliente("Yo vivo en pedernales")).toEqual({ estado: "fuera", ciudad: "Pedernales" });
  });

  it("conv 18821: «el lunes voy a estar en quito» → viene", () => {
    expect(dondeEstaElCliente("Yo el lunes voy a estar en quito")?.estado).toBe("viene");
  });

  it("«Estoy en Ibarra» → fuera, Ibarra", () => {
    expect(dondeEstaElCliente("Estoy en Ibarra")).toEqual({ estado: "fuera", ciudad: "Ibarra" });
  });
});

describe("C3 · la cotización de OTRO no es pedir cotización", () => {
  const fase = (texto: string) =>
    elegirFaseOperativa({ etapaGuardada: "seleccionando", texto, tieneCotizacion: false });

  it("39769: «tengo una cotización en $85 en Mazini» no fija cotizacion_enviada", () => {
    expect(fase("En realidad estoy buscando algo más económico\ntengo una cotización en $85 en Mazini"))
      .not.toBe("cotizacion_enviada");
  });

  it.each([
    "me hicieron una cotización en otro lado más barata",
    "tengo otra cotización de la competencia",
  ])("variante: «%s» no fija cotizacion_enviada", (texto) => {
    expect(fase(texto)).not.toBe("cotizacion_enviada");
  });

  it("sano: «me hace la cotización de la 2» y «cotízame» siguen siendo pedir cotizar", () => {
    expect(fase("me hace la cotización de la 2 por favor")).toBe("cotizacion_enviada");
    expect(fase("cotízame esas")).toBe("cotizacion_enviada");
  });
});

describe("revisión ronda 1 · B1: «lejos» y «no puedo» que NO son estar fuera", () => {
  it.each([
    "no me queda lejos",
    "no nos queda lejos, mañana pasamos",
    "Cumbayá me queda lejos",
    "Cumbaya es lejos para mi",
    "Quito Sur me queda lejos, mejor Cumbayá",
    "No puedo pasar esos días",
    "no puedo ir el fin de semana",
    "esa semana no puedo ir",
    "Esta semana es complicado pasar",
    "no puedo pasar hoy",
  ])("«%s» → no es fuera", (texto) => {
    expect(dondeEstaElCliente(texto)?.estado).not.toBe("fuera");
  });

  it("siguen fuera: 38924 y «muy difícil ir a Quito»", () => {
    expect(dondeEstaElCliente("Está muy lejos le agradezco")?.estado).toBe("fuera");
    expect(dondeEstaElCliente("Muy dificel ir a Quito")?.estado).toBe("fuera");
  });

  it("«lejos» / «no puedo ir» sin ciudad vale para el turno: no se guarda en la ficha", () => {
    expect(dondeEstaElCliente("Está muy lejos le agradezco")).toMatchObject({ estado: "fuera", soloElTurno: true });
    expect(dondeEstaElCliente("Estoy en Ibarra")?.soloElTurno).toBeFalsy();
  });
});

describe("revisión ronda 1 · B2: el que avisa que vuelve VIENE", () => {
  it("39329: «La próxima semana estoy por allá, este rato estoy trabajando en el oriente» → viene", () => {
    expect(dondeEstaElCliente("La próxima semana estoy por allá, este rato estoy trabajando en el oriente")?.estado).toBe("viene");
  });

  it("39845: «Estoy por el oriente llego en 15 días…» → viene (lo suyo era el dedupe del día, C5)", () => {
    expect(dondeEstaElCliente("Estoy por el oriente llego en 15 días asta entonces seguiré cotizando")?.estado).toBe("viene");
  });
});

describe("revisión ronda 1 · el local que «le queda lejos» no es el elegido", () => {
  it("«Quito Sur me queda lejos, mejor Cumbayá» → Cumbayá", async () => {
    const { extractExplicitStore } = await import("../src/domain/storeSelection.js");
    expect(extractExplicitStore("Quito Sur me queda lejos, mejor Cumbayá", { respondiendoAlLocal: true })).toBe("Depot Tire Cumbayá");
  });

  it("«Cumbayá me queda lejos» no registra Cumbayá", async () => {
    const { extractExplicitStore } = await import("../src/domain/storeSelection.js");
    expect(extractExplicitStore("Cumbayá me queda lejos", { respondiendoAlLocal: true })).toBeNull();
  });

  it("SANO: «Cumbayá no me queda lejos» y «Cumbayá» siguen eligiendo Cumbayá", async () => {
    const { extractExplicitStore } = await import("../src/domain/storeSelection.js");
    expect(extractExplicitStore("Cumbayá no me queda lejos", { respondiendoAlLocal: true })).toBe("Depot Tire Cumbayá");
    expect(extractExplicitStore("Cumbayá", { respondiendoAlLocal: true })).toBe("Depot Tire Cumbayá");
  });
});
