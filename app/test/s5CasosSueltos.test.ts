/**
 * SPRINT 5 (auditoría Competimotor 26-nov-2026, familia F-06) — CASOS SUELTOS.
 *
 * Textos reales de los chats de Competimotor (perfil `mundillantas`). Cada
 * bloque es un caso de la familia; lo que tiene que valer igual para Depot va
 * aparte, en `s5CasosSueltos.depot.test.ts`.
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

const { dondeEstaElCliente } = await import("../src/domain/fueraDeCobertura.js");
const { pideUnAsesor } = await import("../src/domain/pideAsesor.js");
const { usoDeclarado } = await import("../src/domain/usoYTipo.js");

describe("1 · cliente de otra ciudad (1142, 1258, 1614, 710, 1202)", () => {
  it("1142: «Estoy.  De quitto» (con la t doble) es un cliente de Quito", () => {
    expect(dondeEstaElCliente("Estoy.  De quitto")).toMatchObject({ estado: "fuera", ciudad: "Quito" });
  });
  it("1258: «Soy de GYE» es Guayaquil", () => {
    expect(dondeEstaElCliente("Soy de GYE")).toMatchObject({ estado: "fuera", ciudad: "Guayaquil" });
  });
  it("1614: «Soy de manta» es Manta", () => {
    expect(dondeEstaElCliente("Soy de manta")).toMatchObject({ estado: "fuera", ciudad: "Manta" });
  });
  it("845 (sano): «será para el próximo fin de semana porque estoy por Manta ahorita» viene", () => {
    expect(dondeEstaElCliente("Listo amigo, entonces será para el próximo fin de semana porque estoy por Manta ahorita.")?.estado)
      .not.toBe("fuera");
  });
  it("1427 (sano): «cuando este x santo domingo le visito» viene", () => {
    expect(dondeEstaElCliente("Listo muchas gracias cuando este x santo domingo le visito")?.estado).not.toBe("fuera");
  });
});

describe("2 · pide asesor y el bot sigue el guion (720, 469)", () => {
  it("720: «Asesor» a secas es pedirlo", () => {
    expect(pideUnAsesor("Asesor")).toBe(true);
  });
  it("469: «Un asesor» a secas es pedirlo", () => {
    expect(pideUnAsesor("Un asesor")).toBe(true);
  });
  it("mencionarlo en una frase sigue sin ser pedirlo", () => {
    for (const t of ["gracias al asesor", "¿y qué dice el asesor?", "el asesor me dijo que sí"]) {
      expect(pideUnAsesor(t), t).toBe(false);
    }
  });
});

describe("3 · llanta de carga / comercial (1717, 1632, 1652, 454)", () => {
  it("454: «Índice de carga… Extra Load / XL» de una SUV NO es uso de carga", () => {
    const texto = "Marca: Nexen\nModelo: N'Fera Primus\nMedida exacta: 215/65 R17\n"
      + "Índice de carga y velocidad: 103V (con especificación Extra Load / XL, es decir, reforzada para mayor carga)";
    expect(usoDeclarado(texto)).not.toBe("carga");
  });
  it("1652: «Para cargar» sí es uso de carga", () => {
    expect(usoDeclarado("Para cargar")).toBe("carga");
  });
  it("1717 / 1632: la C o LT pegada a la medida pide llanta de carga", async () => {
    const { pideLlantaDeCarga } = await import("../src/domain/llantaDeCarga.js");
    expect(pideLlantaDeCarga("195R15C")).toBe(true);
    expect(pideLlantaDeCarga("225/65/R16LT")).toBe(true);
    expect(pideLlantaDeCarga("Es para una furgoneta escolar King Long")).toBe(true);
    expect(pideLlantaDeCarga("LT285/70R17")).toBe(true);
    // No dispara: medidas de pasajero y el «XL» de la 454.
    expect(pideLlantaDeCarga("215/65 R17 103V XL")).toBe(false);
    expect(pideLlantaDeCarga("245/70 R16")).toBe(false);
  });
  it("el catálogo: 195R15C y las LT sin sufijo en la etiqueta son de carga", async () => {
    const { esLlantaDeCarga } = await import("../src/domain/llantaDeCarga.js");
    expect(esLlantaDeCarga({ name: "KENDA 195R15C 8PR KR33", sizeLabel: "195R15" })).toBe(true);
    expect(esLlantaDeCarga({ name: "KAPSEN 225/75R16 RS23 LT 115/112S", sizeLabel: "225/75R16" })).toBe(true);
    expect(esLlantaDeCarga({ name: "ILINK 235/65R16C MULTIMI 115/113", sizeLabel: "235/65R16" })).toBe(true);
    expect(esLlantaDeCarga({ name: "TOWNHALL TH-161 195/50R15", sizeLabel: "195/50R15" })).toBe(false);
  });
});

describe("5 · doble botón (1085, 1295)", () => {
  it("«la 1» + «la 2» tocados seguidos son UN turno, no dos cotizaciones cruzadas", async () => {
    const { gruposDeLaRafaga } = await import("../src/domain/rafaga.js");
    expect(gruposDeLaRafaga(["la 1", "la 2"])).toEqual([[0, 1]]);
  });
  it("lo de antes no cambia: «1» + una pregunta de otra cosa siguen en dos turnos", async () => {
    const { gruposDeLaRafaga } = await import("../src/domain/rafaga.js");
    expect(gruposDeLaRafaga(["1", "Si se realiza el pago con tarjeta cuanto sube el valor"])).toEqual([[0], [1]]);
  });
});

describe("1b · lo que se le dice a quien está en otra ciudad (710, 1614)", () => {
  it("710: «Donde estan ubicados en guayaquil» → dónde estamos + cómo se envía (courier, lo paga el cliente)", async () => {
    const { respuestaDirectaDeUbicacionFueraDeCobertura } = await import("../src/domain/visitaImposible.js");
    const r = respuestaDirectaDeUbicacionFueraDeCobertura("Donde estan ubicados en guayaquil") ?? "";
    expect(r).toMatch(/Santo Domingo/);
    expect(r).toMatch(/Laar Courier|Bemaut/);
    expect(r).toMatch(/lo paga el cliente|lo paga usted/);
    // Un solo local: nada de «nuestros locales».
    expect(r).not.toMatch(/nuestros locales/i);
  });
  it("1614: la respuesta fija (con cotización) explica el envío y no pregunta «qué ciudad le queda mejor»", async () => {
    const { respuestaFijaFueraDeCobertura } = await import("../src/domain/visitaImposible.js");
    const r = respuestaFijaFueraDeCobertura(true);
    expect(r).toMatch(/Laar Courier|Bemaut/);
    expect(r).not.toMatch(/qu[eé] ciudad le queda/i);
  });
});
