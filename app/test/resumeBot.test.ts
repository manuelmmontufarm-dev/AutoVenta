import { describe, expect, it } from "vitest";
import { hasUnansweredCustomerMessage } from "../src/domain/conversationState.js";

describe("retomar conversación al devolverla al bot", () => {
  it("detecta un inbound posterior a la última respuesta", () => {
    expect(hasUnansweredCustomerMessage(
      new Date("2026-07-21T19:45:00Z"), new Date("2026-07-21T19:40:00Z"),
    )).toBe(true);
  });

  it("no duplica una respuesta ya enviada", () => {
    expect(hasUnansweredCustomerMessage(
      new Date("2026-07-21T19:40:00Z"), new Date("2026-07-21T19:45:00Z"),
    )).toBe(false);
  });
});
