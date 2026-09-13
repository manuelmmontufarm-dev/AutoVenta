/**
 * Pruebas del 12-sep: la ráfaga de mensajes y los reenvíos. Mensajes reales de
 * la conv 3 con sus tiempos.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
process.env.DEBOUNCE_MS = "1";

const { gruposDeLaRafaga } = await import("../src/domain/rafaga.js");
const { InboundPipeline } = await import("../src/pipeline/inbound.js");
const {
  extractExplicitQuantity, pideVariasOpciones, pideVerLasOpcionesOtraVez, pideOpcionesNoCotizacion,
} = await import("../src/domain/salesIntent.js");
const { loQueEligio } = await import("../src/services/cotizarLoElegido.js");
const { ubicacionDadaPorElCliente } = await import("../src/domain/locations.js");

describe("una respuesta completa al frente de la ráfaga es su propio turno", () => {
  it.each([
    [["205/55R16", "Estoy en Guayaquil"], [[0], [1]]],
    [["1", "Si se realiza el pago con tarjeta cuanto sube el valor"], [[0], [1]]],
  ])("%j se parte", (textos, grupos) => expect(gruposDeLaRafaga(textos)).toEqual(grupos));

  it.each([
    [["Deme los dos valores de la kenda", "de las opciones", "que me mando"]],
    [["205/55R16", "4 llantas"]],
    [["265/70R17", "MT"]],
    [["1", "2 llantas"]],
    [["en rin 20", "si"]],
    [["hola"]],
  ])("%j se queda junta", (textos) => expect(gruposDeLaRafaga(textos)).toEqual([textos.map((_, i) => i)]));

  it("el agrupador manda dos turnos en orden", async () => {
    const vistos: string[] = [];
    const pipeline = new InboundPipeline(async (job) => { vistos.push(job.text); });
    pipeline.push("593", "w1", "1");
    pipeline.push("593", "w2", "Si se realiza el pago con tarjeta cuanto sube el valor");
    await new Promise((r) => setTimeout(r, 50));
    expect(vistos).toEqual(["1", "Si se realiza el pago con tarjeta cuanto sube el valor"]);
  });
});

describe("«los dos valores» habla de las opciones, con o sin menú arriba", () => {
  const RAFAGA = "Deme los dos valores de la kenda\nde las opciones\nque me mando";

  it("no es cantidad", () => {
    expect(extractExplicitQuantity(RAFAGA)).toBeNull();
    expect(extractExplicitQuantity("deme las dos llantas")).toBe(2);
    expect(pideVariasOpciones(RAFAGA)).toBe(true);
  });

  it("da los dos precios de la marca que nombró, aunque lo último fuera un reenvío", () => {
    const vitrina = [
      { codigo: "F1", marca: "FALKEN", diseno: "WILDPEAK A/T 4W", medida: "285/70R17" },
      { codigo: "K628", marca: "KENDA", diseno: "KR628", medida: "285/70R17" },
      { codigo: "K29", marca: "KENDA", diseno: "KR29", medida: "285/70R17" },
    ];
    const escalones = {
      economica: { codigo: "K628", nombre: "KENDA KR628", precio_con_iva: 231.5 },
      equilibrada: { codigo: "K29", nombre: "KENDA KR29", precio_con_iva: 270.78 },
      premium: { codigo: "F1", nombre: "FALKEN WILDPEAK A/T 4W", precio_con_iva: 402.1 },
    };
    const r = loQueEligio(RAFAGA, "Se la envié nuevamente 👆", null, vitrina, escalones) as { respuesta: string };
    expect(r.respuesta).toMatch(/KR628/);
    expect(r.respuesta).toMatch(/270\.78/);
    expect(r.respuesta).not.toMatch(/WILDPEAK/);
  });
});

describe("ver las opciones otra vez no es la cotización", () => {
  it.each(["dejeme ver las opciones otra vez", "puede mandarme las opciones de nuevo", "reenvíeme las opciones"])(
    "«%s» pide la lámina", (t) => {
      expect(pideVerLasOpcionesOtraVez(t)).toBe(true);
      expect(pideOpcionesNoCotizacion(t)).toBe(true);
    },
  );

  it.each([
    "mándeme otras opciones",
    "Deme los dos valores de la kenda de las opciones que me mando",
    "que opciones tiene",
    "mándeme de nuevo la foto de la cotización",
    "mándeme las opciones en A/T",
  ])("«%s» no", (t) => expect(pideVerLasOpcionesOtraVez(t)).toBe(false));

  it("pedir la cotización sigue siendo la cotización", () => {
    expect(pideOpcionesNoCotizacion("reenvíe la cotización de las opciones")).toBe(false);
  });
});

describe("el local más cercano necesita una ubicación del cliente (caso 1)", () => {
  const CICLO = ["205/55R16", "1", "La promoción del 25% q son 103$.64 menos"];

  it("un sector que el cliente nunca dijo no vale", () => {
    expect(ubicacionDadaPorElCliente({ textos: CICLO, sector: "cumbaya", lat: null, lng: null })).toBe(false);
    expect(ubicacionDadaPorElCliente({ textos: CICLO, sector: null, lat: -0.2, lng: -78.4 })).toBe(false);
  });

  it("un sector que no se reconoce no elige local, así que no se frena", () => {
    expect(ubicacionDadaPorElCliente({ textos: CICLO, sector: "por mi barrio", lat: null, lng: null })).toBe(true);
  });

  it("lo que sí dijo, vale", () => {
    expect(ubicacionDadaPorElCliente({ textos: [...CICLO, "vivo en tumbaco"], sector: "Tumbaco", lat: null, lng: null })).toBe(true);
    expect(ubicacionDadaPorElCliente({
      textos: ["[El cliente compartió su ubicación: lat -0.2, lng -78.4]"], sector: null, lat: -0.2, lng: -78.4,
    })).toBe(true);
  });
});
