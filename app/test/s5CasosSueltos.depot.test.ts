/**
 * SPRINT 5 (F-06) — DEPOT NO CAMBIA.
 *
 * Los textos fijos de abajo son los que Depot manda HOY (sacados del código
 * de `main` 4e53288 antes de tocar nada). Lo de Competimotor va detrás de su
 * política; si uno de estos cambia, se cambió Depot sin que Manuel lo decida.
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "depot";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

const v = await import("../src/domain/visitaImposible.js");
const { dondeEstaElCliente } = await import("../src/domain/fueraDeCobertura.js");

describe("Depot: lo que se le dice a quien está en otra ciudad sigue igual", () => {
  it("la respuesta a «¿dónde están en Guayaquil?»", () => {
    expect(v.respuestaDirectaDeUbicacionFueraDeCobertura("Donde estan ubicados en guayaquil"))
      .toBe("Nuestros locales están en Quito: *Cumbayá* y *Quito Sur*. Por ahora no tenemos local fuera de Quito.");
  });
  it("la respuesta fija, con y sin cotización", () => {
    expect(v.respuestaFijaFueraDeCobertura(false))
      .toBe("Nuestros locales están en Quito: *Cumbayá* y *Quito Sur*. Por ahora no tenemos local fuera de Quito.");
    expect(v.respuestaFijaFueraDeCobertura(true))
      .toBe("Nuestros locales están en Quito: *Cumbayá* y *Quito Sur*. Por ahora no tenemos local fuera de Quito.\n---\nSi desea coordinar el pago y el envío, un asesor le ayuda. 🤝");
  });
  it("«Soy de santo domingo» sigue siendo fuera para Depot", () => {
    expect(dondeEstaElCliente("Soy de santo domingo")).toEqual({ estado: "fuera", ciudad: "Santo Domingo" });
  });
});

describe("Depot: los arreglos de F-06 detrás de la política no lo tocan", () => {
  it("equivalencia: sigue con 20 mm de ancho (305/50R20 → 275/55R20 NO)", async () => {
    const { esEquivalente } = await import("../src/domain/equivalencia.js");
    expect(esEquivalente("305/50R20", "275/55R20")).toBe(false);
    expect(esEquivalente("305/50R20", "285/55R20")).toBe(true);
  });
  it("«Asesor» a secas, la oferta de asesor, «índice de carga», el envío y el local único: como antes", async () => {
    const { pideUnAsesor, ofreceAsesor, aceptaElAsesor } = await import("../src/domain/pideAsesor.js");
    const { usoDeclarado } = await import("../src/domain/usoYTipo.js");
    const { requisitoDeCarga } = await import("../src/domain/equivalencia.js");
    const { pideCantidadDeLaOfrecida, aceptaLaOferta } = await import("../src/domain/ofertaVigente.js");
    const { hechosDePreguntaDirecta } = await import("../src/domain/preguntaDirecta.js");
    expect(pideUnAsesor("Asesor")).toBe(false);
    expect(ofreceAsesor("¿Desea que le ayude a validar disponibilidad con un asesor?")).toBe(false);
    expect(aceptaElAsesor("Sí", true)).toBe(false);
    expect(usoDeclarado("Índice de carga y velocidad: 103V")).toBe("carga");
    expect(requisitoDeCarga(["195R15C"])).toBeNull();
    expect(v.conElEnvioExplicado("Claro, le ayudo con eso.", "Soy de Guayaquil")).toBe("Claro, le ayudo con eso.");
    expect(v.sinPreguntaDeLocalConUnoSolo("¿A cuál local le queda mejor ir?")).toBe("¿A cuál local le queda mejor ir?");
    expect(hechosDePreguntaDirecta("Si acepta cheques")).toEqual([]);
    expect(pideCantidadDeLaOfrecida("Xq necesito las 4 llantas")).toBe(true); // el detector es puro…
    const leida = { oferta: { tipo: "oferta_de_cotizar" as const, clase: "una" as const, codigo: "X" }, fuente: "hecho" as const, turnosAtras: 1 };
    expect(aceptaLaOferta(leida, "Xq necesito las 4 llantas")).toBe(false); // …pero en Depot no acepta
  });
  it("«Estoy por Manta ahorita… el próximo fin de semana» sigue como antes en Depot", () => {
    expect(dondeEstaElCliente("Listo amigo, entonces será para el próximo fin de semana porque estoy por Manta ahorita.")?.estado).toBe("fuera");
  });
  it("el doble botón en Depot: igual que antes (dos turnos, unión con salto de línea)", async () => {
    const { gruposDeLaRafaga, textoDeLaRafaga } = await import("../src/domain/rafaga.js");
    expect(gruposDeLaRafaga(["la 1", "la 2"])).toEqual([[0], [1]]);
    expect(textoDeLaRafaga(["la 1", "la 2"])).toBe("la 1\nla 2");
  });
});
