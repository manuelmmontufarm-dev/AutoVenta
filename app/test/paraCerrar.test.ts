/**
 * Para cerrar (Manuel, 24-oct): con ~500 chats al mes la pestaña no puede
 * llenarse sola. Estas pruebas fijan las reglas que la mantienen corta:
 * quién le toca a quién, el archivo a los 14 días, la ✕ que dura hasta que el
 * cliente vuelve a escribir, y la compra que saca al cliente sin que nadie toque nada.
 */
import { describe, expect, it } from "vitest";
import { clasificar, puntaje, temperatura, TOPE_DIARIO, type FilaParaCerrar } from "../src/domain/paraCerrar.js";

// Sábado 24-oct-2026, 13:15 en Quito.
const AHORA = new Date("2026-10-24T18:15:00Z");
const horas = (h: number) => new Date(AHORA.getTime() - h * 3_600_000);
const dias = (d: number) => horas(d * 24);

function fila(p: Partial<FilaParaCerrar> = {}): FilaParaCerrar {
  return {
    ticketId: 1, nombre: "Carlos Vera", telefono: "593984127710", medida: "265/65R17",
    llantas: "4× GENERAL GRABBER AT3 265/65R17", total: 892.4, local: "Quito Norte",
    visita: null, visitaHora: null, compromiso: null,
    ultimoCliente: horas(3), ultimoAsesor: null, asesorAntesDelCliente: false,
    descartadoAt: null, pospuestoHasta: null, pospuestoEn: null, revividoAt: null, compro: false,
    ...p,
  };
}

describe("a qué lista va cada cliente", () => {
  it("el cliente escribió último → Para cerrar", () => {
    const r = clasificar([fila()], AHORA);
    expect(r.paraCerrar.map((c) => c.ticketId)).toEqual([1]);
    expect(r.empujando).toEqual([]);
  });

  it("un asesor escribió después del cliente → Empujando, no Para cerrar", () => {
    const r = clasificar([fila({ ultimoCliente: horas(30), ultimoAsesor: horas(2) })], AHORA);
    expect(r.paraCerrar).toEqual([]);
    expect(r.empujando.map((c) => c.ticketId)).toEqual([1]);
  });

  it("si el cliente contesta después del asesor, vuelve solo a Para cerrar y se marca «volvió»", () => {
    const r = clasificar([fila({ ultimoCliente: horas(1), ultimoAsesor: horas(20), asesorAntesDelCliente: true })], AHORA);
    expect(r.empujando).toEqual([]);
    expect(r.paraCerrar[0]).toMatchObject({ ticketId: 1, volvio: true });
  });

  it("si compró (factura en Contífico) no sale en ninguna lista y se cuenta", () => {
    const r = clasificar([fila({ compro: true }), fila({ ticketId: 2, compro: true, ultimoAsesor: horas(1), ultimoCliente: horas(5) })], AHORA);
    expect([...r.paraCerrar, ...r.empujando, ...r.archivo]).toEqual([]);
    expect(r.compraron).toBe(2);
  });
});

describe("el archivo: 14 días sin texto", () => {
  it("13 días en Empujando sigue ahí y dice cuánto le queda", () => {
    const r = clasificar([fila({ ultimoCliente: dias(15), ultimoAsesor: dias(13) })], AHORA);
    expect(r.empujando[0]).toMatchObject({ ticketId: 1, seArchivaEn: 1 });
  });

  it("15 días sin texto de nadie → archivo, aunque estuviera en Para cerrar", () => {
    const r = clasificar([fila({ ultimoCliente: dias(15) })], AHORA);
    expect(r.paraCerrar).toEqual([]);
    expect(r.archivo[0]).toMatchObject({ ticketId: 1, sacado: false });
  });

  it("sacarlo del archivo reinicia los 14 días", () => {
    const r = clasificar([fila({ ultimoCliente: dias(30), ultimoAsesor: dias(29), revividoAt: horas(1) })], AHORA);
    expect(r.archivo).toEqual([]);
    expect(r.empujando[0]).toMatchObject({ ticketId: 1, seArchivaEn: 14 });
  });
});

describe("la ✕ y posponer", () => {
  it("la ✕ lo manda al archivo como «sacado»", () => {
    const r = clasificar([fila({ ultimoCliente: dias(2), ultimoAsesor: dias(1), descartadoAt: horas(1) })], AHORA);
    expect(r.empujando).toEqual([]);
    expect(r.archivo[0]).toMatchObject({ ticketId: 1, sacado: true });
  });

  it("la ✕ deja de valer si el cliente vuelve a escribir", () => {
    const r = clasificar([fila({ ultimoCliente: horas(1), ultimoAsesor: dias(1), descartadoAt: horas(5) })], AHORA);
    expect(r.paraCerrar.map((c) => c.ticketId)).toEqual([1]);
  });

  it("pospuesto no sale hasta la fecha, y se cuenta aparte", () => {
    const r = clasificar([fila({ pospuestoHasta: new Date("2026-10-30T14:00:00Z"), pospuestoEn: horas(1), ultimoCliente: horas(3) })], AHORA);
    expect(r.paraCerrar).toEqual([]);
    expect(r.pospuestos).toBe(1);
  });

  it("pospuesto vuelve si el cliente escribe antes de la fecha", () => {
    const r = clasificar([fila({ pospuestoHasta: new Date("2026-10-30T14:00:00Z"), pospuestoEn: horas(5), ultimoCliente: horas(1) })], AHORA);
    expect(r.paraCerrar.map((c) => c.ticketId)).toEqual([1]);
  });
});

describe("el tope del día y el orden", () => {
  it("cuenta como contactado a quien un asesor le escribió hoy (hora de Quito)", () => {
    const r = clasificar([
      fila({ ticketId: 1, ultimoCliente: horas(30), ultimoAsesor: horas(2) }),
      // 04:00 UTC del 24 = 23:00 del 23 en Quito: fue ayer.
      fila({ ticketId: 2, ultimoCliente: horas(40), ultimoAsesor: new Date("2026-10-24T04:00:00Z") }),
      fila({ ticketId: 3 }),
    ], AHORA);
    expect(r.contactadosHoy).toBe(1);
    expect(r.tope).toBe(TOPE_DIARIO);
  });

  it("una cita mañana gana a una cotización más cara sin día", () => {
    const conCita = fila({ ticketId: 1, total: 300, visita: new Date("2026-10-25T15:00:00Z") });
    const caraSinDia = fila({ ticketId: 2, total: 1100 });
    expect(puntaje(conCita, AHORA)).toBeGreaterThan(puntaje(caraSinDia, AHORA));
    expect(clasificar([caraSinDia, conCita], AHORA).paraCerrar.map((c) => c.ticketId)).toEqual([1, 2]);
  });

  it("la conversación fresca pesa más que una de hace cinco días por la misma plata", () => {
    expect(puntaje(fila({ ultimoCliente: horas(2) }), AHORA)).toBeGreaterThan(puntaje(fila({ ultimoCliente: dias(5) }), AHORA));
  });

  it("marca la ventana de 24 h cerrada: solo plantilla", () => {
    const r = clasificar([fila({ ticketId: 1, ultimoCliente: horas(3) }), fila({ ticketId: 2, ultimoCliente: horas(30) })], AHORA);
    const ventana = Object.fromEntries(r.paraCerrar.map((c) => [c.ticketId, c.ventanaAbierta]));
    expect(ventana).toEqual({ 1: true, 2: false });
  });
});

describe("temperatura: si todavía viene (medido el 26-oct contra Contífico)", () => {
  // Sábado 24 a las 13:15 en Quito. Las visitas a mediodía de Quito.
  const visita = (dia: string) => new Date(`${dia}T17:00:00Z`);

  it("con fecha: hoy o después es caliente; ayer, última oportunidad; 2+ días, ya no viene", () => {
    expect(temperatura({ visita: visita("2026-10-24"), ultimoCliente: dias(10) }, AHORA)).toBe("caliente");
    expect(temperatura({ visita: visita("2026-10-27"), ultimoCliente: dias(10) }, AHORA)).toBe("caliente");
    expect(temperatura({ visita: visita("2026-10-23"), ultimoCliente: horas(2) }, AHORA)).toBe("ultima");
    expect(temperatura({ visita: visita("2026-10-22"), ultimoCliente: horas(2) }, AHORA)).toBe("fria");
  });

  it("la fecha manda: aunque escriba hoy, si su día fue hace 3 días ya no viene", () => {
    expect(temperatura({ visita: visita("2026-10-21"), ultimoCliente: horas(1) }, AHORA)).toBe("fria");
  });

  it("sin fecha: menos de 24 h callado es caliente; 1 a 4 días, última; 5 o más, ya no viene", () => {
    expect(temperatura({ visita: null, ultimoCliente: horas(23) }, AHORA)).toBe("caliente");
    expect(temperatura({ visita: null, ultimoCliente: horas(30) }, AHORA)).toBe("ultima");
    expect(temperatura({ visita: null, ultimoCliente: horas(4 * 24 + 23) }, AHORA)).toBe("ultima");
    expect(temperatura({ visita: null, ultimoCliente: dias(5) }, AHORA)).toBe("fria");
  });

  it("los que ya no vienen van al fondo de Para cerrar aunque tengan más plata", () => {
    const r = clasificar([
      fila({ ticketId: 1, total: 2000, ultimoCliente: dias(6) }),
      fila({ ticketId: 2, total: 200, ultimoCliente: horas(30) }),
    ], AHORA);
    expect(r.paraCerrar.map((c) => [c.ticketId, c.temperatura])).toEqual([[2, "ultima"], [1, "fria"]]);
  });

  it("Empujando también trae su temperatura", () => {
    const r = clasificar([fila({ visita: visita("2026-10-21"), ultimoCliente: dias(4), ultimoAsesor: dias(3) })], AHORA);
    expect(r.empujando[0].temperatura).toBe("fria");
  });
});
