/**
 * La curva de llegada (Manuel, 26-oct): el color de Para cerrar sale de cuándo
 * llega la gente de verdad, y se recalcula con cada factura. Estas pruebas fijan
 * cómo se cuenta y dónde corta.
 */
import { describe, expect, it } from "vitest";
import { medirCurva, probabilidad, probabilidadEn, type Observacion } from "../src/domain/llegada.js";
import { clasificar, leerTemperatura, type Estadistica } from "../src/domain/paraCerrar.js";

const HOY = "2026-10-26";
const sinCompra = (inicio: string, n: number): Observacion[] => Array.from({ length: n }, () => ({ inicio, compra: null }));

// Lo medido en producción el 26-oct para el reloj «fecha»: 8 el mismo día, 1 al siguiente.
const FECHA_26_OCT: Observacion[] = [
  ...Array.from({ length: 8 }, () => ({ inicio: "2026-10-10", compra: "2026-10-10" })),
  { inicio: "2026-10-12", compra: "2026-10-13" },
  ...sinCompra("2026-10-01", 81),
];

describe("medirCurva", () => {
  it("cuenta antes, el mismo día y después, y a cuántos días llegaron los de después", () => {
    const c = medirCurva([...FECHA_26_OCT, { inicio: "2026-10-20", compra: "2026-10-18" }], HOY, 2);
    expect(c).toMatchObject({ compradores: 10, antes: 1, mismoDia: 8, despues: 1, despuesPorDia: { 1: 1 } });
  });

  it("de los que llegaron a k días sin comprar, cuántos compraron después", () => {
    const c = medirCurva(FECHA_26_OCT, HOY, 2);
    expect(c.curva[0]).toMatchObject({ quedaban: 90, compraron: 9 });
    expect(c.curva[1]).toMatchObject({ quedaban: 82, compraron: 1 });
    expect(c.curva[2]).toMatchObject({ quedaban: 81, compraron: 0 });
  });

  it("el corte es el día después del último que llegó, más un día de margen", () => {
    const c = medirCurva(FECHA_26_OCT, HOY, 2);
    expect(c.corteMedido).toBe(2);
    expect(c.corte).toBe(3);
    expect(c.suficiente).toBe(true);
  });

  it("una sola compra tardía corre el corte: mientras alguien llegó así de tarde, hay chance", () => {
    const c = medirCurva([...FECHA_26_OCT, { inicio: "2026-10-01", compra: "2026-10-05" }], HOY, 2);
    expect(c.corteMedido).toBe(5);
    expect(c.corte).toBe(6);
  });

  it("lo de más de 30 días es otra visita y no corre el corte", () => {
    const c = medirCurva([...FECHA_26_OCT, { inicio: "2026-08-01", compra: "2026-10-01" }], HOY, 2);
    expect(c.corte).toBe(3);
  });

  it("con menos de 5 ventas no hay curva que valga: usa el corte por defecto", () => {
    const c = medirCurva([{ inicio: "2026-10-10", compra: "2026-10-10" }, ...sinCompra("2026-10-01", 50)], HOY, 2);
    expect(c.suficiente).toBe(false);
    expect(c.corte).toBe(2);
  });

  it("la probabilidad se suaviza: 0 de 81 no es 0 %", () => {
    expect(probabilidad(0, 81)).toBeCloseTo(0.0061, 3);
    expect(probabilidadEn(medirCurva(FECHA_26_OCT, HOY, 2), 1)).toBeCloseTo(1.5 / 83, 4);
  });
});

describe("la temperatura sale de la curva y se mueve con las ventas nuevas", () => {
  const AHORA = new Date("2026-10-26T18:00:00Z"); // lunes 13:00 en Quito
  const est = (fecha: Observacion[]): Estadistica => ({
    fecha: medirCurva(fecha, HOY, 2), silencio: medirCurva([], HOY, 5), calculada: AHORA.toISOString(), ultimaFactura: null,
  });
  const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000);

  it("con la curva del 26-oct: 2 días después de su fecha todavía es ámbar; a los 3, ya no viene", () => {
    const e = est(FECHA_26_OCT);
    expect(leerTemperatura({ visita: hace(2), ultimoCliente: hace(3) }, AHORA, e)).toMatchObject({ temperatura: "ultima", reloj: "fecha", dias: 2 });
    expect(leerTemperatura({ visita: hace(3), ultimoCliente: hace(3) }, AHORA, e).temperatura).toBe("fria");
  });

  it("si mañana entra una factura de alguien que llegó 4 días tarde, el mismo cliente vuelve a ámbar", () => {
    const e = est([...FECHA_26_OCT, { inicio: "2026-10-01", compra: "2026-10-05" }]);
    expect(leerTemperatura({ visita: hace(3), ultimoCliente: hace(3) }, AHORA, e).temperatura).toBe("ultima");
  });

  it("cada cliente lleva su probabilidad y el reporte trae la curva con que se pintó", () => {
    const e = est(FECHA_26_OCT);
    const r = clasificar([{
      ticketId: 1, nombre: "X", telefono: "1", medida: null, llantas: "", total: 300, local: "Cumbayá",
      visita: hace(1), visitaHora: null, compromiso: null, ultimoCliente: hace(1), ultimoAsesor: null,
      asesorAntesDelCliente: false, descartadoAt: null, pospuestoHasta: null, pospuestoEn: null, revividoAt: null, compro: false,
    }], AHORA, e);
    expect(r.paraCerrar[0]).toMatchObject({ temperatura: "ultima", reloj: "fecha", dias: 1 });
    expect(r.paraCerrar[0].probabilidad).toBeCloseTo(1.5 / 83, 4);
    expect(r.estadistica.fecha.corte).toBe(3);
  });
});
