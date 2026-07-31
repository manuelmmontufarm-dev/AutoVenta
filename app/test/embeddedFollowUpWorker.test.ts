import { describe, expect, it } from "vitest";
import { shouldRunEmbeddedWorker } from "../src/workers/embeddedFollowUpWorker.js";

describe("shouldRunEmbeddedWorker", () => {
  it("corre el worker cuando no se declara nada (el caso que dejó staging sin seguimientos)", () => {
    expect(shouldRunEmbeddedWorker({})).toBe(true);
  });

  it("se apaga solo con la señal explícita de servicio externo", () => {
    expect(shouldRunEmbeddedWorker({ FOLLOW_UP_WORKER: "externo" })).toBe(false);
    expect(shouldRunEmbeddedWorker({ FOLLOW_UP_WORKER: " EXTERNAL " })).toBe(false);
  });

  it("ante un valor desconocido prefiere correr: un seguimiento de más se ve, uno de menos no", () => {
    expect(shouldRunEmbeddedWorker({ FOLLOW_UP_WORKER: "si" })).toBe(true);
    expect(shouldRunEmbeddedWorker({ FOLLOW_UP_WORKER: "" })).toBe(true);
  });
});
