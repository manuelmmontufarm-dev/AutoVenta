/** La guarda: en Depot (sin `casosSueltosF06`) el «sí» a una cita no cambia de camino. */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "depot";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

const { aceptaLaCita } = await import("../src/domain/ofertaVigente.js");
const { politica } = await import("../src/negocio/politica.js");

describe("Depot no cambia", () => {
  it("no tiene la política", () => { expect(politica.casosSueltosF06).toBeFalsy(); });
  it("un «si» tras un turno con `ofrece_cita` no se desvía", () => {
    expect(aceptaLaCita("si", [{ direction: "inbound", cita: null }, { direction: "outbound", cita: true }], false)).toBe(false);
  });
});

describe("Depot: «sí, mañana» tras `ofrece_cita` sigue el camino de siempre", async () => {
  const { respondeALaCita } = await import("../src/domain/ofertaVigente.js");
  it("no se toma como respuesta al día por la cita", () => {
    expect(respondeALaCita([{ direction: "inbound", cita: null }, { direction: "outbound", cita: true }])).toBe(false);
  });
});
