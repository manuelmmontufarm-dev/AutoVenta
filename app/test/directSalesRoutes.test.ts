import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { requestsQuoteResend } = await import("../src/services/directSalesRoutes.js");

describe("ruta directa de reenvío", () => {
  it.each([
    "mándeme de nuevo la foto de la cotización",
    "reenvíe la proforma por favor",
    "puede enviar otra vez el pdf",
    "no me llegó, mande nuevamente la imagen de cotización",
    "otra foto de la cotización por favor",
    "no veo la imagen de la proforma",
  ])("detecta %s", (text) => expect(requestsQuoteResend(text)).toBe(true));

  it.each([
    "cotízame otra medida 225/65R17",
    "mándeme otras opciones",
    "quiero una comparación diferente",
    "cuánto cuesta esa llanta",
  ])("no confunde %s", (text) => expect(requestsQuoteResend(text)).toBe(false));
});
