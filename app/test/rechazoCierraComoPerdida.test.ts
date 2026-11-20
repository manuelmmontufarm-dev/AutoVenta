import { describe, expect, it } from "vitest";
import { etapaDelCierreDelTurno, tipoDeCierreDelTurno } from "../src/domain/cierreTurno.js";
import { POLITICA_DEPOT } from "../src/negocio/politicas/depot.js";
import { POLITICA_MUNDILLANTAS } from "../src/negocio/politicas/mundillantas.js";
import { POLITICA_EJEMPLO } from "../src/negocio/politicas/ejemplo.js";

/**
 * «NO GRACIAS» COMO VENTA PERDIDA, POR PERFIL (Manuel, 20-nov, tras la prueba
 * de Competimotor: CM28 y CM40 quedaban en `seleccionando` / `cotizacion_enviada`).
 *
 * Depot tiene la regla contraria a propósito (`index.ts`, `cierrePerdido.test.ts`:
 * «no gracias» cancela los seguimientos pero no cierra como perdida). Por eso es
 * un interruptor de la política: Competimotor encendido, Depot como hoy.
 */
describe("qué etapa deja el cierre del turno", () => {
  it("CM28/CM40 en Competimotor: «no gracias» y «no gracias ya no» → perdido", () => {
    for (const texto of ["no gracias", "no gracias ya no"]) {
      const tipo = tipoDeCierreDelTurno(texto);
      expect(tipo).toBe("rechazo_suave");
      expect(etapaDelCierreDelTurno(tipo!, POLITICA_MUNDILLANTAS)).toBe("perdido");
    }
  });

  it("Depot (y el perfil de ejemplo): «no gracias» no mueve la etapa, como hoy", () => {
    expect(etapaDelCierreDelTurno("rechazo_suave", POLITICA_DEPOT)).toBeNull();
    expect(etapaDelCierreDelTurno("rechazo_suave", POLITICA_EJEMPLO)).toBeNull();
  });

  it("lo demás es igual para todos", () => {
    for (const p of [POLITICA_DEPOT, POLITICA_MUNDILLANTAS]) {
      expect(etapaDelCierreDelTurno("compra_ajena", p)).toBe("perdido");
      expect(etapaDelCierreDelTurno("compra_terminada", p)).toBe("clasificar");
      expect(etapaDelCierreDelTurno("oferta_ajena", p)).toBeNull();
      expect(etapaDelCierreDelTurno("acuse_del_cierre", p)).toBeNull();
    }
  });
});
