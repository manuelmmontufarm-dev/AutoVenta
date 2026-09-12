/**
 * EL ARO SUELTO NO MANDA CUANDO EL CLIENTE DIJO SU CARRO.
 *
 * Auditoría del 8 al 11-sep-2026, familia B: 30 errores, 12 graves. El patrón
 * es siempre el mismo — el cliente escribe el aro y el vehículo en el mismo
 * mensaje, la ruta del aro se adelanta, muestra tres llantas cualesquiera de
 * ese aro y después las cotiza.
 *
 *   Conv 18684: «para un nissan Qashqai 2020 rin 17» → 4 FALKEN AZENIS
 *   FK520L 215/45R17 por $642.24. La medida real del carro es 225/60R17, y el
 *   cliente lo dijo dos mensajes después.
 *
 *   Conv 18121: «Ford 150 Doble cabina rin 18» → llantas de auto (215/55R18)
 *   y cotización de 4 WINRUN R330 por $374.36.
 *
 *   Conv 18555: «llantas falken rin 16 para el Toyota prado 3p» → 205/50R16 y
 *   cotización; cuando el cliente preguntó si era M/T o A/T, el bot admitió
 *   que «es una opción de calle».
 *
 *   Conv 18519: «una yeneral para camioneta dacsun rin 14» → 185/60R14 de
 *   turismo.
 *
 * La herramienta de vehículo ya existe y ya tiene prohibido cotizar sin la
 * medida escrita (`REGLA_POR_ORIGEN.medida_investigada`). El problema es que
 * la ruta del aro corre ANTES y nunca le da el turno. Con el vehículo sobre la
 * mesa, el que sabe es el fitment.
 */
import { beforeAll, describe, expect, it } from "vitest";

let mencionaVehiculo: (texto: string) => boolean;
let aroParaMostrar: (texto: string, previo: string | null) => number | null;

beforeAll(async () => {
  process.env.WHATSAPP_TOKEN ||= "test";
  process.env.WHATSAPP_APP_SECRET ||= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
  process.env.WHATSAPP_PHONE_ID ||= "test";
  process.env.SELLER_PHONE ||= "593000000000";
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
  ({ mencionaVehiculo } = await import("../src/domain/vehiculoEnTexto.js"));
  ({ aroParaMostrar } = await import("../src/services/mostrarPorAro.js"));
});

describe("reconocer que el cliente nombró su vehículo", () => {
  it("marca y modelo de la tabla de fitment", () => {
    for (const texto of [
      "para un nissan Qashqai 2020 rin 17",
      "¡Hola! Quiero más información para Ford 150 Doble cabina rin 18",
      "llantas falken rin 16 para el Toyota prado 3p ron original",
      "Tengo una camioneta Toyota Hilux 2.7 que llanta me recomiendas",
      "Rin 16 para la dimax 4x4",
      "Toyota yaris 1.3 año 2008",
      "Tengo un Kia Stonic que llantas me aconsejas",
      "Baic x35",
    ]) {
      expect(mencionaVehiculo(texto), texto).toBe(true);
    }
  });

  it("el modelo solo, sin la marca, también cuenta", () => {
    expect(mencionaVehiculo("Clasico B13")).toBe(true);
    expect(mencionaVehiculo("es para una dimax")).toBe(true);
    expect(mencionaVehiculo("para el Prado")).toBe(true);
  });

  it("una medida o un aro a secas no es un vehículo", () => {
    for (const texto of [
      "Rin 14",
      "265/70R17",
      "32x10.50 Rin 15",
      "¡Hola! Quiero más información",
      "Precio",
      "R16",
      "Las 2",
      "Buenos días",
    ]) {
      expect(mencionaVehiculo(texto), texto).toBe(false);
    }
  });

  it("no confunde una marca de llanta con una de carro", () => {
    for (const texto of [
      "que precio tiene la kenda",
      "quiero las falken wildpeak",
      "la winrun más económica",
      "tienen michelin",
    ]) {
      expect(mencionaVehiculo(texto), texto).toBe(false);
    }
  });
});

describe("la ruta del aro le cede el turno al vehículo", () => {
  it("con vehículo en el mensaje, el aro solo no dispara la vitrina", () => {
    for (const texto of [
      "para un nissan Qashqai 2020 rin 17",
      "Quiero más información para Ford 150 Doble cabina rin 18",
      "llantas falken rin 16 para el Toyota prado 3p",
      "Quiero una yeneral para camioneta dacsun rin 14",
    ]) {
      expect(aroParaMostrar(texto, "¿Qué medida usa? Ej: 225/65R17"), texto).toBeNull();
    }
  });

  it("sin vehículo, el aro sigue alcanzando como desde el 8-sep", () => {
    expect(aroParaMostrar("Una llanta ron 15", "¿Qué medida usa? Ej: 225/65R17")).toBe(15);
    expect(aroParaMostrar("Rin 14", "¿Qué medida usa? Ej: 225/65R17")).toBe(14);
    expect(aroParaMostrar("15", "¿Qué aro usa?")).toBe(15);
  });
});
