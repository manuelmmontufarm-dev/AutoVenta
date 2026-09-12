/**
 * «MEDIDA EXACTA» ES UNA AFIRMACIÓN SOBRE LO QUE PIDIÓ EL CLIENTE.
 *
 * La pieza de opciones marca cada tarjeta en verde («MEDIDA EXACTA») o en
 * ámbar («LE MONTA») comparándola contra la medida pedida. Esa medida salía de
 * `medidasPermitidas(textos, tire_size)`, y `tire_size` se llena por tres
 * puertas: lo que el cliente escribió, lo que se dedujo de su vehículo y lo
 * que se dedujo de su aro. Con las dos últimas, el sello verde afirma que la
 * llanta es «su medida exacta» sobre una medida que el cliente nunca dio.
 *
 * Conv 18821, 10-sep-2026: el cliente pidió 32x10.50R15 en M/T; la ficha quedó
 * con 215/75R15 (deducida) y la lámina salió con esa medida marcada MEDIDA
 * EXACTA. Sobre esa lámina se firmó la cotización de $726.83, y el cliente
 * tuvo que escribir «Pero en la medida que le envié».
 *
 * Cuando no se sabe qué pidió, la tarjeta no se marca: el poster ya sabe
 * quedarse callado con `medidaExacta: null`.
 */
import { beforeAll, describe, expect, it } from "vitest";

let medidaParaElSello: (textos: readonly string[], tireSize?: string | null) => string | null;

beforeAll(async () => {
  process.env.WHATSAPP_TOKEN ||= "test";
  process.env.WHATSAPP_APP_SECRET ||= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
  process.env.WHATSAPP_PHONE_ID ||= "test";
  process.env.SELLER_PHONE ||= "593000000000";
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
  ({ medidaParaElSello } = await import("../src/domain/medidaConfirmada.js"));
});

describe("contra qué medida se sella la tarjeta", () => {
  it("la que el cliente escribió", () => {
    expect(medidaParaElSello(["Necesito 265/70R17", "en MT"], "265/70R17")).toBe("265/70R17");
  });

  it("la deducida del vehículo NO sella nada (conv 18504: Hilux → 205/55R16)", () => {
    expect(medidaParaElSello(["Tengo una camioneta Toyota Hilux 2.7"], "205/55R16")).toBeNull();
  });

  // Aquí el cliente SÍ escribió su medida (en pulgadas), y desde el paso
  // anterior se lee. El sello se compara contra la suya, no contra la deducida
  // que quedó en la ficha: así la KR29 215/75R15 sale marcada «LE MONTA» y no
  // «MEDIDA EXACTA», que es exactamente lo que faltó el 10-sep.
  it("se sella contra la del cliente, no contra la deducida que quedó en la ficha (conv 18821)", () => {
    expect(medidaParaElSello(["32x10.50 Rin 15", "En MT"], "215/75R15")).toBe("32X10.5R15");
  });

  it("ni la que puso una búsqueda por el vehículo (conv 18106: Yaris → 185/60R14)", () => {
    expect(medidaParaElSello(["Toyota yaris 1.3 año 2008", "Rin14"], "185/60R14")).toBeNull();
  });

  it("sin ficha y sin texto, no hay nada que sellar", () => {
    expect(medidaParaElSello([], null)).toBeNull();
    expect(medidaParaElSello(["Hola, quiero información"], null)).toBeNull();
  });

  it("la medida escrita en una forma rara también sella (ahora que se lee)", () => {
    expect(medidaParaElSello(["Por favor la 225R15/75 TRINGLER"], "225/75R15")).toBe("225/75R15");
    expect(medidaParaElSello(["Que cuestan las 235,75r15"], "235/75R15")).toBe("235/75R15");
  });

  it("la letra comercial del final no cambia contra qué se sella", () => {
    // «205R16C» es la 205R16 con el índice de carga reforzado: el extractor lee
    // la medida y el sello se compara contra ella. Lo que importa es que salga
    // del texto del cliente, no de la ficha.
    expect(medidaParaElSello(["necesito 205R16C para la furgoneta"], "205R16C")).toBe("205R16");
  });
});
