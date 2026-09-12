/**
 * CÓMO ESCRIBEN LA MEDIDA LOS CLIENTES DE VERDAD — auditoría del 8 al 11-sep-2026.
 *
 * Cada caso de este archivo salió de un chat de producción de esa ventana, y
 * cada uno terminó en uno de estos tres finales:
 *
 *  · una cotización en la medida equivocada (conv 18821: «32x10.50 Rin 15» →
 *    KENDA KR29 215/75R15 por $726.83, rotulada MEDIDA EXACTA);
 *  · un «no me aparece stock» con la llanta en bodega (conv 18535: «33 * 12.5
 *    rin 15», y el catálogo tenía 6 unidades de la 33X12.50R15);
 *  · un «necesito la medida exacta» a quien acababa de escribirla (convs
 *    16954, 18342, 18666, 18893).
 *
 * La causa es una sola y está en este archivo de dominio: hay DOS lectores de
 * medidas —el métrico y el de pulgadas— y solo el métrico aprendió a leer
 * «rin»/«aro». El de pulgadas exige la R pegada al aro, así que «32x10.50 Rin
 * 15» no es una medida para él; y como el detector de aro solo descarta el
 * texto cuando ve una medida MÉTRICA, ese mismo mensaje queda clasificado como
 * «el cliente dio solo el aro 15» y arranca la ruta del aro.
 *
 * La regla que fijan estas pruebas: si el cliente escribió una medida, se lee;
 * si escribió media medida, se pide la otra mitad; nunca se convierte en
 * «solo el aro».
 */
import { beforeAll, describe, expect, it } from "vitest";

let ts: typeof import("../src/domain/tireSize.js");
let mc: typeof import("../src/domain/medidaConfirmada.js");

beforeAll(async () => {
  process.env.WHATSAPP_TOKEN ||= "test";
  process.env.WHATSAPP_APP_SECRET ||= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
  process.env.WHATSAPP_PHONE_ID ||= "test";
  process.env.SELLER_PHONE ||= "593000000000";
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
  ts = await import("../src/domain/tireSize.js");
  mc = await import("../src/domain/medidaConfirmada.js");
});

/** La etiqueta canónica de lo que sea que traiga el texto, o null. */
const leer = (texto: string): string | null => {
  const flot = ts.extractFlotationSizes(texto)[0];
  if (flot) return ts.formatFlotationSize(flot);
  const metrica = ts.extractTireSizes(texto)[0];
  if (metrica) return ts.formatTireSize(metrica);
  const conv = ts.extractConventionalSizes(texto)[0];
  return conv ? ts.formatConventionalSize(conv) : null;
};

describe("pulgadas con el aro dicho en palabras", () => {
  // Conv 18821, 10-sep 19:49. «32x10.50 Rin 15» + «En MT». Salió KR29
  // 215/75R15 —cuatro pulgadas más chica— como «la única que tengo para lo
  // que me pidió», y encima cotizada.
  it("«32x10.50 Rin 15» es una medida de pulgadas, no un aro suelto", () => {
    expect(leer("32x10.50 Rin 15")).toBe("32X10.5R15");
  });

  // Conv 18535, 10-sep 11:43. El asterisco es como el propio catálogo de
  // Depot escribe la mitad de sus flotación («35*12.50R17LT»).
  it("«Llantas 33 * 12.5 rin 15» también", () => {
    expect(leer("Llantas 33 * 12.5 rin 15")).toBe("33X12.5R15");
  });

  // Conv 17863, 9-sep 14:04. «que modelos de llanta tiene en 37 12.50 rin 20
  // que sean AT o MT» — la ficha quedó con medida nula y el bot buscó por aro.
  it("«37 12.50 rin 20», sin separador entre diámetro y ancho", () => {
    expect(leer("que modelos tiene en 37 12.50 rin 20 que sean AT o MT")).toBe("37X12.5R20");
  });

  // Conv 17707, 9-sep 15:52. Salió una KENDA KR33 195R15 —ocho centímetros
  // más angosta— presentada como «equivalente de su aro».
  it("«30.5/10/R15», con barras y diámetro decimal", () => {
    expect(leer("O también 30.5/10/R15")).toBe("30.5X10R15");
  });

  // Conv 18330, 10-sep 05:21. La foto decía LT315/75R16 y el cliente escribió
  // «315x75R16»: es la MÉTRICA con una x de separador, no una flotación. Lo
  // que distingue a una de otra es el ancho — tres dígitos es milímetros.
  it("«315x75R16» es la métrica 315/75R16, no una flotación", () => {
    expect(leer("315x75R16")).toBe("315/75R16");
  });

  it("no inventa una flotación donde hay un teléfono o un precio", () => {
    expect(leer("0993728763")).toBeNull();
    expect(leer("son $103.64 menos")).toBeNull();
  });
});

describe("media medida: se pide la otra mitad, no se adivina", () => {
  // Conv 18677, 10-sep 20:55. «¿Dispone llantas MT 30.5 r15?» → KENDA KR29
  // 215/75R15 y «es la única que tengo para lo que me pidió».
  it("«MT 30.5 r15» no es una medida completa", () => {
    expect(leer("¿Dispone llantas MT 30.5 r15?")).toBeNull();
  });

  it("pero sí se reconoce como flotación a la que le falta el ancho", () => {
    const parcial = ts.flotacionIncompleta("¿Dispone llantas MT 30.5 r15?");
    expect(parcial).toEqual({ diameter: 30.5, rim: 15 });
  });

  // Conv 17668, 9-sep 09:58. «65 R 17» (le faltaba el ancho) terminó en una
  // cotización de 4 FALKEN ZE310 215/40R17 por $511.96.
  it("«65 R 17» no es una medida ni un aro que habilite cotizar", () => {
    expect(leer("65 R 17")).toBeNull();
    expect(ts.medidaIncompleta("65 R 17")).toBe(true);
  });

  // Conv 18468, 10-sep 15:42. El perfil 64 no existe; el bot lo trató como
  // medida real «sin stock» y ofreció 185/65R15 como equivalente.
  it("«185/64 R15» tiene un perfil que no existe: no se acepta en silencio", () => {
    expect(leer("185/64 R15 88H")).toBeNull();
    expect(ts.medidaIncompleta("185/64 R15 88H")).toBe(true);
  });

  // Conv 18204, 9-sep 18:12. «Llantas 200 x 175 R16» se leyó como 175R16.
  it("«200 x 175 R16» es ambigua: no se resuelve sola", () => {
    expect(ts.medidaIncompleta("Llantas 200 x 175 R16")).toBe(true);
  });
});

describe("separadores que la gente escribe y el parser no leía", () => {
  const casos: [string, string, string][] = [
    // texto, esperado, chat de donde salió
    ["Buenos días necesito cuatro llantas 175//70 R13", "175/70R13", "conv 17711"],
    ["Que cuestan las 235,75r15", "235/75R15", "conv 18893"],
    ["Tal vez dispone de llamtas 215/65R/16", "215/65R16", "conv 16954"],
    ["235)75/15", "235/75R15", "conv 18342"],
    ["Costo de medida 245/ 70 para camioneta R 16", "245/70R16", "conv 18666"],
  ];
  for (const [texto, esperado, chat] of casos) {
    it(`${JSON.stringify(texto)} → ${esperado} (${chat})`, () => {
      expect(leer(texto)).toBe(esperado);
    });
  }

  it("las formas que ya funcionaban siguen igual", () => {
    expect(leer("205-65-16")).toBe("205/65R16");
    expect(leer("265  75.  16")).toBe("265/75R16");
    expect(leer("235/75 rin 15")).toBe("235/75R15");
    expect(leer("Son 265 / 70 R 16 MT 764")).toBe("265/70R16");
    expect(leer("195 50 15")).toBe("195/50R15");
    expect(leer("Rin 14 60 195 doble propósito")).toBe("195/60R14");
  });
});

describe("la medida escrita en otro orden", () => {
  // Conv 17647, 9-sep 09:46. «Por favor la 225R15/75 TRINGLER» se leyó como
  // 225R15 (sin perfil): el bot dijo que no había exacta y presentó la KENDA
  // KR601 225/75R15 —justo la medida pedida— como «equivalente».
  it("«225R15/75» es 225/75R15, no 225R15", () => {
    expect(leer("Por favor la 225R15/75 TRINGLER")).toBe("225/75R15");
  });

  // Conv 17707, 9-sep 11:00. «Me interesa llantasR15/275/35» dejó solo el aro
  // 15 y salieron llantas de turismo de cualquier medida.
  it("«R15/275/35» es 275/35R15", () => {
    expect(leer("Me interesa llantasR15/275/35")).toBe("275/35R15");
  });
});

describe("una medida nunca es «solo el aro»", () => {
  /*
   * Este es el puente que faltaba. `aroEnTexto` descarta el texto cuando ve
   * una medida métrica, pero no cuando ve una de pulgadas — y de ahí arranca
   * la ruta que muestra opciones por aro y después las cotiza.
   */
  it("las medidas de pulgadas no habilitan la ruta del aro", () => {
    for (const texto of [
      "32x10.50 Rin 15",
      "Llantas 33 * 12.5 rin 15",
      "que modelos tiene en 37 12.50 rin 20",
      "O también 30.5/10/R15",
    ]) {
      expect(mc.aroEnTexto(texto), texto).toBeNull();
      expect(mc.aroRespondido(texto, "¿Qué medida usa?"), texto).toBeNull();
    }
  });

  it("media medida tampoco", () => {
    expect(mc.aroEnTexto("¿Dispone llantas MT 30.5 r15?")).toBeNull();
    expect(mc.aroEnTexto("65 R 17")).toBeNull();
  });

  it("el aro de verdad se sigue leyendo", () => {
    expect(mc.aroEnTexto("Una llanta ron 15")).toBe(15);
    expect(mc.aroEnTexto("tengo rim 16")).toBe(16);
    expect(mc.aroEnTexto("arillo 14")).toBe(14);
    expect(mc.aroEnTexto("llantas de 15 pulgadas")).toBe(15);
    expect(mc.aroEnTexto("Rin 14")).toBe(14);
    expect(mc.aroRespondido("15", "¿Qué aro usa?")).toBe(15);
  });
});
