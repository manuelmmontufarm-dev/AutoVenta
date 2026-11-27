/**
 * REVISIÓN FINAL (auditoría Competimotor 26-nov-2026, F-06): el «sí» a
 * «¿Le agendo una cita?» y la pregunta del día que vuelve tras el precio (1790).
 * Lo que tiene que valer igual para Depot va en `s4CitaYDia.depot.test.ts`.
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

const { turnoDelBotOfrecioCita, aceptaLaCita } = await import("../src/domain/ofertaVigente.js");
const { sinBloquesCalcados } = await import("../src/domain/calcoReciente.js");

// Más nuevo primero, como los lee `ultimoTurnoOfrecioCita` (order by created_at desc).
const TRAS_EL_SEGUNDO = [
  { direction: "inbound", cita: null },
  { direction: "outbound", cita: true },   // 2.º seguimiento «¿Le agendo una cita?»
  { direction: "outbound", cita: null },   // 1.º seguimiento
  { direction: "inbound", cita: null },
];

describe("A · «sí» a «¿Le agendo una cita?» (463, 1415)", () => {
  it("el último turno del bot llevó `ofrece_cita`", () => {
    expect(turnoDelBotOfrecioCita(TRAS_EL_SEGUNDO)).toBe(true);
  });
  it("una cita de un turno ANTERIOR no cuenta (el cliente ya contestó otra cosa)", () => {
    expect(turnoDelBotOfrecioCita([
      { direction: "inbound", cita: null }, { direction: "outbound", cita: null },
      { direction: "inbound", cita: null }, { direction: "outbound", cita: true },
    ])).toBe(false);
  });
  it.each(["si", "Sí", "sii", "ok", "dale", "claro", "si por favor"])("«%s» acepta la cita", (t) => {
    expect(aceptaLaCita(t, TRAS_EL_SEGUNDO, false)).toBe(true);
  });
  it("«sí, mañana» no es un sí a secas: lo registra el camino de la visita", () => {
    expect(aceptaLaCita("sí, mañana", TRAS_EL_SEGUNDO, false)).toBe(false);
  });
  it("con la visita ya registrada no se vuelve a preguntar el día", () => {
    expect(aceptaLaCita("si", TRAS_EL_SEGUNDO, true)).toBe(false);
  });
  it("sin `ofrece_cita` el «sí» sigue su camino (la oferta de cotizar)", () => {
    expect(aceptaLaCita("si", [{ direction: "inbound", cita: null }, { direction: "outbound", cita: null }], false)).toBe(false);
  });
});

describe("B · la pregunta del día que vuelve tras el precio no es calco (1790)", () => {
  const DIA = "¿Puede acercarse hoy o qué día le agendo la cita? 📅";
  const PRECIOS = "Estos son los precios según cómo pague:\n💳 Con tarjeta: *$49.45* c/u";
  it("eximida por hecho, se conserva aunque haya salido hace un minuto", () => {
    const r = sinBloquesCalcados(`${PRECIOS}\n---\n${DIA}`, [DIA], 1, [DIA]);
    expect(r.texto).toContain(DIA);
    expect(r.calcados).toEqual([]);
  });
  it("sin el hecho, la pregunta repetida sigue siendo calco (como siempre)", () => {
    const r = sinBloquesCalcados(`${PRECIOS}\n---\n${DIA}`, [DIA], 1);
    expect(r.texto).not.toContain(DIA);
  });
  it("eximir la pregunta no salva otro bloque calcado", () => {
    const r = sinBloquesCalcados(`${PRECIOS}\n---\n${DIA}`, [PRECIOS, DIA], 2, [DIA]);
    expect(r.texto).toBe(DIA);
  });
});

describe("B · el turno de 1790 cierra con la pregunta del día", async () => {
  const { conLaPreguntaDelDia } = await import("../src/domain/preguntaDelDia.js");
  const DIA = "¿Qué día le agendo la cita? 📅";
  const PRECIOS = "Estos son los precios según cómo pague:\n💳 Con tarjeta: *$49.45* c/u";
  it("«¿Se la cotizo?» al final (vuelta 1 de 1790) se cambia por la del día", () => {
    expect(conLaPreguntaDelDia(`${PRECIOS}\n---\n¿Se la cotizo?`, DIA)).toBe(`${PRECIOS}\n---\n${DIA}`);
  });
  it("la pregunta pegada al último bloque también se cambia", () => {
    expect(conLaPreguntaDelDia(`${PRECIOS}\nSi le sirve, ¿se la cotizo? 😊`, DIA)).toBe(`${PRECIOS}\nSi le sirve,\n---\n${DIA}`);
  });
  it("sin pregunta, la del día va en su propio mensaje", () => {
    expect(conLaPreguntaDelDia(PRECIOS, DIA)).toBe(`${PRECIOS}\n---\n${DIA}`);
  });
  it("si ya cierra preguntando el día, no se toca", () => {
    const t = `${PRECIOS}\n---\n¿Qué día cree que puede ir? 📅`;
    expect(conLaPreguntaDelDia(t, DIA)).toBe(t);
  });
});

describe("A · «sí, mañana» a la cita es respuesta al día", async () => {
  const { respondeALaCita } = await import("../src/domain/ofertaVigente.js");
  it("tras `ofrece_cita`, el turno del cliente responde al día", () => {
    expect(respondeALaCita(TRAS_EL_SEGUNDO)).toBe(true);
  });
});
