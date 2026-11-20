import { describe, expect, it } from "vitest";
import { leerVisita } from "../src/domain/fechaDeVisita.js";
import { cantidadPedidaPorElCliente, extractExplicitQuantity } from "../src/domain/salesIntent.js";
import { tipoDeCierreDelTurno } from "../src/domain/cierreTurno.js";

/**
 * PRUEBA COMPETIMOTOR 40 × 3 (18-nov-2026) · familia A: «el cliente cambia de
 * idea y la base no lo registra». Textos reales del cliente en las corridas del
 * simulador (`mediciones/competimotor-2026-11-19-03-{17,33}/corridas/`).
 */
const enQuito = (iso: string) => new Date(`${iso}-05:00`);

describe("CM09 · «mejor solo 2 x ahora» + «dale» (agrupados con \\n)", () => {
  const TEXTO = "mejor solo 2 x ahora\ndale";

  it("la cantidad es 2", () => {
    expect(extractExplicitQuantity(TEXTO)).toBe(2);
    expect(extractExplicitQuantity("mejor solo 2 por ahora")).toBe(2);
    expect(extractExplicitQuantity("solo 3 nomas")).toBe(3);
    // la que usa la recotización (services/recotizar.ts)
    expect(cantidadPedidaPorElCliente(TEXTO, "¿Qué día cree que puede ir? Con ese dato le aviso al asesor 📅")).toBe(2);
  });

  it("«por ahora» no es una visita para hoy (respondiendo a «¿Qué día cree que puede ir?»)", () => {
    expect(leerVisita(TEXTO, enQuito("2026-11-18T22:34:40"), { respondiendoAlDia: true })).toBeNull();
    expect(leerVisita("x ahora no puedo", enQuito("2026-11-18T10:00:00"), { respondiendoAlDia: true })).toBeNull();
  });

  it("«ahora mismo paso» sí sigue siendo hoy", () => {
    const lectura = leerVisita("ahora mismo paso", enQuito("2026-11-18T10:00:00"), { respondiendoAlDia: true });
    expect(lectura?.visitDate).toBeTruthy();
  });
});

describe("CM40 · «no gracias ya no» es una despedida", () => {
  it("cierra el turno como rechazo suave (sin IA, sin insistir)", () => {
    expect(tipoDeCierreDelTurno("no gracias ya no")).toBe("rechazo_suave");
    expect(tipoDeCierreDelTurno("muy caro\nno gracias ya no")).toBe(null); // la objeción va al agente
  });

  it("«ya no me queda claro el precio» no es despedida", () => {
    expect(tipoDeCierreDelTurno("ya no me queda claro el precio")).toBe(null);
  });
});

describe("CM30 · «ya compre» después de «no gracias» es compra en otro lado, no venta ganada", () => {
  it("con el rechazo justo antes: compra_ajena", () => {
    expect(tipoDeCierreDelTurno("ya compre", "no gracias")).toBe("compra_ajena");
  });

  it("sin rechazo antes, sigue siendo compra terminada (Depot, cierreTurno.test.ts)", () => {
    expect(tipoDeCierreDelTurno("Ya compré las llantas")).toBe("compra_terminada");
    expect(tipoDeCierreDelTurno("ya compre", "paso el sabado")).toBe("compra_terminada");
  });
});
