/**
 * Revisión ronda 1 del sprint 5 (B1): `sinSeguimiento` vuelve a exigir lo que
 * exigía antes del sprint («muy/demasiado/bastante/tan lejos»), con la misma
 * fuente única, y ahora además no cuenta la negación ni el local del perfil.
 */
import { describe, expect, it } from "vitest";
import { motivoParaNoSeguir } from "../src/domain/sinSeguimiento.js";

const motivo = (ultimo: string) => motivoParaNoSeguir({ ultimo });

describe("sinSeguimiento · «lejos»", () => {
  it("38924: «Está muy lejos le agradezco» cancela", () => {
    expect(motivo("Está muy lejos le agradezco")).toBe("rechazo_del_cliente");
  });

  it.each(["Cumbayá me queda lejos", "no me queda lejos", "no está tan lejos", "Cumbayá queda muy lejos", "me queda lejos"])(
    "«%s» no cancela",
    (texto) => { expect(motivo(texto)).not.toBe("rechazo_del_cliente"); },
  );
});
