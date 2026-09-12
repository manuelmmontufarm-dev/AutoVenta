import { describe, expect, it } from "vitest";
import { diaDelMesSuelto } from "../src/domain/diasEnEspanol.js";
import { extractCustomerCommitment } from "../src/domain/customerCommitment.js";

const AHORA = new Date("2026-09-12T15:00:00Z");
const responderDia = (texto: string) => extractCustomerCommitment(texto, AHORA, { respondiendoAlDia: true });

describe("un porcentaje o monto no es fecha", () => {
  it.each(["del 25 %", "del 25% de descuento", "del 25 por ciento", "$25"])("descarta %s", (texto) => {
    // Chat 16982: el 25 % del descuento se agendó como día de visita.
    expect(diaDelMesSuelto(texto, AHORA)).toBeNull();
    expect(responderDia(texto)).toBeNull();
  });

  it("conserva una respuesta real a la pregunta del día", () => {
    expect(responderDia("el 25")?.visitDate?.toISOString().slice(0, 10)).toBe("2026-09-25");
  });
});

describe("el número de día manda sobre el nombre", () => {
  it("agenda el 29, no el próximo martes", () => {
    // Chat 17668: «29 martes 2026» se convirtió erróneamente en martes 15.
    expect(responderDia("29 martes 2026")?.visitDate?.toISOString().slice(0, 10)).toBe("2026-09-29");
  });

  it("si el número y el día no coinciden, pregunta en vez de adivinar", () => {
    expect(responderDia("28 martes 2026")).toBeNull();
  });
});

describe("la fecha de otra cosa no agenda una visita", () => {
  it("descarta una reparación y el aviso futuro del cliente", () => {
    // Chat 18294: «La camioneta entró hoy a la mecánica...».
    expect(responderDia(
      "La camioneta entró hoy a la mecánica a una reparación, que me dijeron demora 15 días. Si sale antes me comunico con ustedes",
    )).toBeNull();
    expect(responderDia("El carro está hoy en el taller; yo le aviso cuando salga")).toBeNull();
  });
});
