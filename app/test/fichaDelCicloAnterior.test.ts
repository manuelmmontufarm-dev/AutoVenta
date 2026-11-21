/**
 * Conv 469 (Competimotor, 21-nov-2026), lo puro: la vigencia de la fecha de
 * llegada/visita (regla 2) y la ficha del ciclo anterior (regla 3).
 */
import { describe, expect, it } from "vitest";
import { fechaVigente, finDelDiaSiguiente } from "../src/domain/vigenciaDeLaFecha.js";
import { textoDeLaFicha, type FichaDelCicloAnterior } from "../src/domain/fichaDelCicloAnterior.js";

/** 21-nov-2026 08:48 en Guayaquil: el asesor marcó la venta como ganada. */
const GANADA = new Date("2026-11-21T13:48:12Z");

describe("la fecha de llegada o visita sigue vigente hasta el final del día siguiente", () => {
  it("una columna date (medianoche UTC) se lee por su día calendario", () => {
    // Llegada el jueves 26-nov → vigente hasta el fin del viernes 27 en Guayaquil.
    expect(finDelDiaSiguiente(new Date("2026-11-26T00:00:00Z"), true)?.toISOString()).toBe("2026-11-28T05:00:00.000Z");
    expect(finDelDiaSiguiente("2026-11-26", true)?.toISOString()).toBe("2026-11-28T05:00:00.000Z");
    expect(fechaVigente({ pickupDate: new Date("2026-11-26T00:00:00Z") }, new Date("2026-11-28T04:59:00Z"))).toBe(true);
    expect(fechaVigente({ pickupDate: new Date("2026-11-26T00:00:00Z") }, new Date("2026-11-28T05:01:00Z"))).toBe(false);
  });

  it("una visita a las 20:00 de Guayaquil (01:00 UTC del día siguiente) cuenta por su día local", () => {
    const visita = new Date("2026-11-25T01:00:00Z"); // martes 24-nov 20:00
    expect(finDelDiaSiguiente(visita)?.toISOString()).toBe("2026-11-26T05:00:00.000Z");
    expect(fechaVigente({ visitDate: visita }, new Date("2026-11-25T23:00:00Z"))).toBe(true);
    expect(fechaVigente({ visitDate: visita }, new Date("2026-11-26T06:00:00Z"))).toBe(false);
  });

  it("sin fecha no hay nada vigente", () => {
    expect(fechaVigente({}, GANADA)).toBe(false);
    expect(fechaVigente({ pickupDate: null, visitDate: null }, GANADA)).toBe(false);
  });
});

describe("la ficha del ciclo anterior", () => {
  const ficha469: FichaDelCicloAnterior = {
    cycle: 1,
    resultado: "ganado",
    cerradoEn: GANADA,
    nota: "Compro 235/75R15 TOWNHALL MT",
    medida: null,
    llanta: null,
    cotizacion: null,
    venta: null,
    local: null,
    entrega: null,
    visita: null,
    ultimoDelAsesor: {
      texto: "Muchas gracias por elegir *COMPETIMOTOR* su seguridad y su confianza son lo primero 🚗🔧",
      en: new Date("2026-11-21T13:39:15Z"),
    },
  };

  it("conv 469: dice que ya compró, cuándo, qué anotó el asesor, y prohíbe pedir la medida", () => {
    const texto = textoDeLaFicha(ficha469)!;
    expect(texto).toContain("Resultado: GANADA");
    expect(texto).toContain("sábado 21 de noviembre");
    expect(texto).toContain("«Compro 235/75R15 TOWNHALL MT»");
    expect(texto).toContain("Muchas gracias por elegir *COMPETIMOTOR*");
    expect(texto).toMatch(/PROHIBIDO pedirle otra vez la medida/);
    expect(texto).toMatch(/notificar_vendedor con motivo caso_sin_resolver/);
    // Sin dato, no hay línea: nada de «Medida: null».
    expect(texto).not.toMatch(/null|undefined|Medida:|Venta registrada/);
  });

  it("con venta registrada, cotización, local y llegada guardados, los nombra", () => {
    const texto = textoDeLaFicha({
      ...ficha469,
      medida: "235/75R15",
      llanta: "4 × TOWNHALL TH-MT802 235/75R15",
      cotizacion: { numero: "COT-MT0ABC12", cantidad: 4, total: 437 },
      venta: { factura: "001-002-000012345", monto: 437 },
      local: "Competimotor (Vía Quevedo km 1½)",
      entrega: new Date("2026-11-26T00:00:00Z"),
    })!;
    expect(texto).toContain("Medida: 235/75R15 · Llanta: 4 × TOWNHALL TH-MT802 235/75R15");
    expect(texto).toContain("Cotización: COT-MT0ABC12 (no le escribas el número), 4 llantas, total $437.00");
    expect(texto).toContain("Venta registrada: factura 001-002-000012345, monto $437.00");
    expect(texto).toContain("Local: Competimotor (Vía Quevedo km 1½)");
    expect(texto).toContain("Fecha de entrega/llegada: jueves 26 de noviembre");
  });

  it("una compra perdida es contexto, no una orden de pasar al asesor", () => {
    const texto = textoDeLaFicha({ ...ficha469, resultado: "perdido", nota: "precio", medida: "205/55R16" })!;
    expect(texto).toContain("Resultado: perdida");
    expect(texto).not.toMatch(/YA TE COMPRÓ|notificar_vendedor/);
  });

  it("el reinicio por silencio no se presenta como una venta perdida", () => {
    const texto = textoDeLaFicha({ ...ficha469, resultado: "perdido", nota: "Reinicio por inactividad (>15 h)", medida: "205/55R16" })!;
    expect(texto).toMatch(/no se cerró: el chat se reinició por silencio/);
  });

  it("sin ficha no hay bloque", () => {
    expect(textoDeLaFicha(null)).toBeNull();
  });
});
