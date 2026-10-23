import { describe, expect, it } from "vitest";
import {
  cuantilPoisson,
  curvaAcumulada,
  diasEntre,
  diaDeLaSemana,
  franjaDeHora,
  grupoDeAtencion,
  lunesDe,
  mediana,
  rangoPoisson,
  ventasPorLlegar,
} from "../src/domain/estadisticaVentas.js";

/**
 * Con 26 ventas en tres meses, un porcentaje solo miente: 2 ventas en una
 * semana son compatibles con 0,2 o con 7. Estos valores son los de la tabla
 * de Garwood (IC exacto de Poisson al 95 %) y los cuantiles de Poisson que
 * pide la PARTE B del plan (R-06); si alguien cambia el método, cambian.
 */
describe("rango de Poisson exacto (Garwood, 95 %)", () => {
  it.each([
    [0, 0, 3.7],
    [2, 0.2, 7.2],
    [5, 1.6, 11.7],
    [15, 8.4, 24.7],
  ])("n = %i → %f–%f", (n, bajo, alto) => {
    expect(rangoPoisson(n)).toEqual({ bajo, alto });
  });

  it("n grande no se rompe (sin desbordar e^-λ)", () => {
    const r = rangoPoisson(900);
    expect(r.bajo).toBeGreaterThan(840);
    expect(r.alto).toBeLessThan(965);
  });
});

describe("cuantiles de Poisson", () => {
  it("Poisson(4): 2,5 % = 1 y 97,5 % = 8", () => {
    expect(cuantilPoisson(4, 0.025)).toBe(1);
    expect(cuantilPoisson(4, 0.975)).toBe(8);
  });
  it("λ = 0 → 0", () => {
    expect(cuantilPoisson(0, 0.975)).toBe(0);
  });
});

describe("franja por hora de Guayaquil", () => {
  it("bordes 6, 11, 14, 18", () => {
    expect(franjaDeHora(0)).toBe("madrugada");
    expect(franjaDeHora(5)).toBe("madrugada");
    expect(franjaDeHora(6)).toBe("manana");
    expect(franjaDeHora(10)).toBe("manana");
    expect(franjaDeHora(11)).toBe("mediodia");
    expect(franjaDeHora(13)).toBe("mediodia");
    expect(franjaDeHora(14)).toBe("tarde");
    expect(franjaDeHora(17)).toBe("tarde");
    expect(franjaDeHora(18)).toBe("noche");
    expect(franjaDeHora(23)).toBe("noche");
  });
});

describe("semana y día", () => {
  it("el lunes de la semana", () => {
    expect(lunesDe("2026-10-19")).toBe("2026-10-19"); // lunes
    expect(lunesDe("2026-10-23")).toBe("2026-10-19"); // viernes
    expect(lunesDe("2026-10-25")).toBe("2026-10-19"); // domingo: cierra la semana
    expect(lunesDe("2026-11-01")).toBe("2026-10-26"); // cruza el mes
  });
  it("lunesDe con un instante usa la hora de Guayaquil, no UTC", () => {
    // Domingo 25-oct 21:00 en Guayaquil = lunes 26-oct 02:00 UTC.
    expect(lunesDe(new Date("2026-10-26T02:00:00Z"))).toBe("2026-10-19");
    expect(lunesDe(new Date("2026-10-26T05:00:00Z"))).toBe("2026-10-26");
  });
  it("día de la semana, 0 = domingo", () => {
    expect(diaDeLaSemana("2026-10-25")).toBe(0);
    expect(diaDeLaSemana("2026-10-24")).toBe(6);
    expect(diaDeLaSemana("2026-10-19")).toBe(1);
  });
  it("días entre dos fechas", () => {
    expect(diasEntre("2026-09-28", "2026-10-03")).toBe(5);
    expect(diasEntre("2026-10-03", "2026-10-03")).toBe(0);
  });
});

describe("mediana y curva acumulada", () => {
  it("mediana", () => {
    expect(mediana([])).toBeNull();
    expect(mediana([9, 1, 5])).toBe(5);
    expect(mediana([1, 2, 6, 10])).toBe(4);
  });
  it("% de ventas con rezago ≤ cada corte", () => {
    const rezagos = [0, 0, 1, 2, 5, 8, 20, 70];
    expect(curvaAcumulada(rezagos, [1, 3, 7, 14, 30, 60])).toEqual([
      { dias: 1, pct: 37.5 },
      { dias: 3, pct: 50 },
      { dias: 7, pct: 62.5 },
      { dias: 14, pct: 75 },
      { dias: 30, pct: 87.5 },
      { dias: 60, pct: 87.5 },
    ]);
  });
  it("sin ventas, todo en 0", () => {
    expect(curvaAcumulada([], [1, 7])).toEqual([{ dias: 1, pct: 0 }, { dias: 7, pct: 0 }]);
  });
});

describe("grupo de atención", () => {
  it("0 o 1 mensajes del asesor = bot", () => {
    expect(grupoDeAtencion(0, 12)).toBe("bot");
    expect(grupoDeAtencion(1, 12)).toBe("bot");
    expect(grupoDeAtencion(1, 0)).toBe("bot");
  });
  it("el asesor escribió más que el bot = asesor", () => {
    expect(grupoDeAtencion(9, 4)).toBe("asesor");
  });
  it("el resto = bot y asesor", () => {
    expect(grupoDeAtencion(3, 10)).toBe("bot_y_asesor");
    expect(grupoDeAtencion(4, 4)).toBe("bot_y_asesor");
  });
});

describe("ventas por llegar en 14 días", () => {
  /**
   * Caso armado a mano. Rezagos de 10 ventas: 0,0,0,1,2,5,10,10,20,40.
   * F(x) = fracción con rezago ≤ x. Tasa 0,05.
   *  - día de hoy (edad 0), 20 chats vivos: F(14) − F(0) = 0,8 − 0,3 = 0,5 → 20 · 0,05 · 0,5 = 0,5
   *  - hace 5 días, 10 chats: F(19) − F(5) = 0,8 − 0,6 = 0,2 → 10 · 0,05 · 0,2 = 0,1
   *  - hace 30 días, 40 chats: F(44) − F(30) = 1 − 0,9 = 0,1 → 40 · 0,05 · 0,1 = 0,2
   *  - hace 70 días: fuera de los 60 días, no cuenta.
   * esperado = 0,8; Poisson(0,8): 2,5 % = 0, 97,5 % = 3.
   */
  it("caso a mano", () => {
    const r = ventasPorLlegar({
      hoy: "2026-10-23",
      tasa: 0.05,
      rezagos: [0, 0, 0, 1, 2, 5, 10, 10, 20, 40],
      chatsPorDia: [
        { dia: "2026-10-23", chats: 20 },
        { dia: "2026-10-18", chats: 10 },
        { dia: "2026-09-23", chats: 40 },
        { dia: "2026-08-14", chats: 99 },
      ],
    });
    expect(r).toEqual({ esperado: 0.8, bajo: 0, alto: 3, chatsVivos: 70 });
  });
  it("sin ventas previas no inventa nada", () => {
    expect(ventasPorLlegar({ hoy: "2026-10-23", tasa: 0, rezagos: [], chatsPorDia: [{ dia: "2026-10-23", chats: 5 }] }))
      .toEqual({ esperado: 0, bajo: 0, alto: 0, chatsVivos: 5 });
  });
});
