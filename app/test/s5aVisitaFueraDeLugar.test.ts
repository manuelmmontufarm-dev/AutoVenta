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

describe("C3 · una lámina suelta no es compromiso de cierre", () => {
  it("39769/39887: solo hubo pieza de opciones (sin cotización, producto ni cantidad) → no hay cierre", () => {
    expect(hayCompromisoDeCierre({
      hayCotizacionFormal: false,
      hayPiezaDeOpciones: true,
      productoElegido: false,
      cantidadElegida: false,
    })).toBe(false);
  });

  it("sano: con producto o cantidad elegidos sí hay compromiso (conv 13909: «Premium» elegido)", () => {
    expect(hayCompromisoDeCierre({
      hayCotizacionFormal: false, hayPiezaDeOpciones: true, productoElegido: true, cantidadElegida: false,
    })).toBe(true);
    expect(hayCompromisoDeCierre({
      hayCotizacionFormal: false, hayPiezaDeOpciones: true, productoElegido: false, cantidadElegida: true,
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

  it("39845: «Estoy por el oriente» → fuera", () => {
    expect(dondeEstaElCliente("Estoy por el oriente llego en 15 días asta entonces seguiré cotizando")?.estado)
      .toBe("fuera");
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
