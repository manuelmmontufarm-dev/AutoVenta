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

describe("N1 · las equivalentes de 1456 (305/50R20)", () => {
  it("275/55R20 (la KR628 que vendió el asesor) es equivalente; 285/55R20 también", async () => {
    const { esEquivalente } = await import("../src/domain/equivalencia.js");
    expect(esEquivalente("305/50R20", "275/55R20")).toBe(true);
    expect(esEquivalente("305/50R20", "285/55R20")).toBe(true);
    // El diámetro sigue mandando: 275/60R20 (838 mm, +3,1 %) no.
    expect(esEquivalente("305/50R20", "275/60R20")).toBe(false);
  });
});

describe("N3 · «Xq necesito las 4 llantas» acepta la única ofrecida", () => {
  it("pedir la cantidad de la ofrecida es aceptarla", async () => {
    const { aceptaLaOferta, pideCantidadDeLaOfrecida } = await import("../src/domain/ofertaVigente.js");
    expect(pideCantidadDeLaOfrecida("Y ese es el precio tope mi estimado de las llantas\nXq necesito las 4 llantas")).toBe(true);
    expect(pideCantidadDeLaOfrecida("Deseó 4")).toBe(true);
    expect(pideCantidadDeLaOfrecida("¿necesito las 4?")).toBe(false);
    expect(pideCantidadDeLaOfrecida("y en 185 tiene?")).toBe(false);
    const leida = { oferta: { tipo: "oferta_de_cotizar" as const, clase: "una" as const, codigo: "A0455" }, fuente: "hecho" as const, turnosAtras: 0 };
    expect(aceptaLaOferta(leida, "Y ese es el precio tope mi estimado de las llantas\nXq necesito las 4 llantas")).toBe(true);
  });
});

describe("2b · la oferta de asesor es un hecho y su «sí» es pedirlo (720)", () => {
  it("detecta la oferta en el texto que se envía y el sí la acepta", async () => {
    const { ofreceAsesor, aceptaElAsesor } = await import("../src/domain/pideAsesor.js");
    expect(ofreceAsesor("¿Desea que le ayude a validar disponibilidad con un asesor?")).toBe(true);
    expect(ofreceAsesor("¿Desea que le pida a un asesor que le confirme si pueden recibir cheque?")).toBe(true);
    expect(ofreceAsesor("Un asesor le confirma el envío. ¿Le cotizo la 1 o la 2?")).toBe(false);
    expect(aceptaElAsesor("Sí", true)).toBe(true);
    expect(aceptaElAsesor("Sí", false)).toBe(false);
    expect(aceptaElAsesor("Sí, la 2", true)).toBe(false);
  });
});

describe("4 · preguntas directas (697, 538, 884, 1456)", () => {
  it("fotos, cheques y la marca con la letra doble", async () => {
    const { pideFotos, formaDePagoSinDefinir, marcaQueNombro, hechosDePreguntaDirecta } = await import("../src/domain/preguntaDirecta.js");
    expect(pideFotos("De puede enviar foto de las dos para verlas")).toBe(true);
    expect(pideFotos("Me podria enviar una foto")).toBe(true);
    expect(pideFotos("le mando una foto del costado")).toBe(false);
    expect(formaDePagoSinDefinir("Si acepta cheques")).toBe("cheque");
    expect(formaDePagoSinDefinir("aceptan transferencia?")).toBeNull();
    expect(marcaQueNombro("Maxiis 195/50/15")).toBe("maxxis");
    expect(hechosDePreguntaDirecta("Si acepta cheques").join(" ")).toMatch(/cheque/);
  });
});

describe("1c · el envío se explica en el turno en que dice de dónde es (1142, 1614)", () => {
  it("«Claro, le ayudo con eso.» a «Estoy. De quitto» pasa a la respuesta del envío", async () => {
    const { conElEnvioExplicado } = await import("../src/domain/visitaImposible.js");
    const r = conElEnvioExplicado("Claro, le ayudo con eso.", "Estoy.  De quitto");
    expect(r).toMatch(/Laar Courier/);
    expect(r).not.toMatch(/le ayudo con eso/);
  });
  it("si el borrador ya habla del envío no se toca", async () => {
    const { conElEnvioExplicado } = await import("../src/domain/visitaImposible.js");
    const t = "Hacemos envíos a Manta por Laar Courier.";
    expect(conElEnvioExplicado(t, "Soy de manta")).toBe(t);
  });
  it("con un solo local, «¿Cuál local le queda mejor?» se quita", async () => {
    const { sinPreguntaDeLocalConUnoSolo } = await import("../src/domain/visitaImposible.js");
    expect(sinPreguntaDeLocalConUnoSolo("Aquí queda nuestro local:\n---\n¿Cuál local le queda mejor?")).toBe("Aquí queda nuestro local:");
  });
  it("el doble botón: manda el último toque", async () => {
    const { textoDeLaRafaga } = await import("../src/domain/rafaga.js");
    expect(textoDeLaRafaga(["la 1", "la 2"])).toBe("la 2");
    expect(textoDeLaRafaga(["la 2", "la 2"])).toBe("la 2");
    expect(textoDeLaRafaga(["hola", "la 2"])).toBe("hola\nla 2");
  });
});
