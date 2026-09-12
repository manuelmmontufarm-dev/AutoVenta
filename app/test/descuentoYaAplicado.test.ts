import { describe, expect, it } from "vitest";
import { fraseDeAhorro } from "../src/domain/ahorro.js";

describe("el ahorro aclara que ya está aplicado", () => {
  it("conserva porcentaje y monto sin prometer una rebaja adicional", () => {
    // Chats 17668 y 16982: el cliente leyó la frase anterior como promoción aparte.
    expect(fraseDeAhorro({ porcentaje: 25, monto: 103.64, cantidad: 4 }))
      .toBe("*25 %* de descuento ya aplicado, *$103.64* menos");
  });
});
