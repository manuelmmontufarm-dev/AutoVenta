import { describe, expect, it } from "vitest";
import { chatReasoningEffort } from "../src/agent/aiRequestPolicy.js";

describe("política de reasoning en Chat Completions", () => {
  it("usa none para GPT-5.5 cuando hay function tools", () => {
    expect(chatReasoningEffort("gpt-5.5", true)).toBe("none");
  });

  it("conserva razonamiento solo en llamadas sin tools", () => {
    expect(chatReasoningEffort("gpt-5.5", false)).toBe("low");
    expect(chatReasoningEffort("gpt-5.5", false, true)).toBe("medium");
  });

  it("no manda el parámetro a modelos que no son GPT-5", () => {
    expect(chatReasoningEffort("gpt-4o-mini", true)).toBeNull();
  });
});
