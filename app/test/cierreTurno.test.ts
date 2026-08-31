import { describe, expect, it } from "vitest";
import { tipoDeCierreDelTurno } from "../src/domain/cierreTurno.js";

describe("cierre comercial del turno", () => {
  it("respeta una despedida breve y su acuse posterior", () => {
    expect(tipoDeCierreDelTurno("No gracias")).toBe("rechazo_suave");
    expect(tipoDeCierreDelTurno("No por el momento, gracias")).toBe("rechazo_suave");
    expect(tipoDeCierreDelTurno("No muchas gracias esta fuera de mi presupuesto"))
      .toBe("rechazo_suave");
    expect(tipoDeCierreDelTurno("ya tengo una oferta de llantas 195/50/16"))
      .toBe("oferta_ajena");
    expect(tipoDeCierreDelTurno("ya tengo una oferta 195/50R16, ¿me la mejora?"))
      .toBeNull();
    expect(tipoDeCierreDelTurno("Ok", "No gracias")).toBe("acuse_del_cierre");
    expect(tipoDeCierreDelTurno(
      "Muy gentil gracias", "No muchas gracias esta fuera de mi presupuesto",
    )).toBe("acuse_del_cierre");
    expect(tipoDeCierreDelTurno("Ya compré las llantas")).toBe("compra_terminada");
  });

  it("no confunde una restricción de medida con el cierre de la conversación", () => {
    const restriccion = "no, gracias, 205 muy ancha; con el auto cargado rozan";
    expect(tipoDeCierreDelTurno(restriccion)).toBeNull();
    expect(tipoDeCierreDelTurno("Ok", restriccion)).toBeNull();
  });

  it("no borra la intención que viene después de la cortesía", () => {
    expect(tipoDeCierreDelTurno("No gracias, ¿pero tienen rin 17?")).toBeNull();
    expect(tipoDeCierreDelTurno("No gracias, deme la Kenda")).toBeNull();
  });
});


/** T115 C09 (31-ago): «No gracias, ya no necesito» no activaba el cierre y el
 *  modelo débil despidió con una pregunta pegada. */
import { tipoDeCierreDelTurno as _cierreVariante } from "../src/domain/cierreTurno.js";
describe("variantes con «ya no necesito»", () => {
  it.each([
    "No gracias, ya no necesito",
    "ya no lo necesito, gracias",
    "no gracias ya no ocupo",
  ])("«%s» cierra el turno", (t) => {
    expect(_cierreVariante(t)).not.toBeNull();
  });

  it("«ya no me queda claro» no cierra nada", () => {
    expect(_cierreVariante("ya no me queda claro el precio")).toBeNull();
  });
});
