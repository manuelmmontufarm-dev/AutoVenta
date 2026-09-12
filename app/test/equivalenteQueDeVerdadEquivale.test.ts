/**
 * UNA EQUIVALENTE QUE NO EQUIVALE ES PEOR QUE UN «NO TENGO».
 *
 * Cuando en la medida del cliente no hay, el bot ofrece «equivalentes de su
 * aro». La lista la armaba la escalera de marcas, que elige por precio: dentro
 * de cada marca gana la más barata con stock. En una llanta, la más barata del
 * aro es casi siempre la más angosta — o sea, lo más lejano a lo que pidió.
 *
 * Cuatro casos de la auditoría del 8 al 11-sep:
 *
 *   conv 18225 · pidió 265/70R16 M/T. Le ofreció KENDA KR29 en *245/75R16*.
 *               CLIENTE: «Buen día pero es llanta es muy baja».
 *               Acá los números defienden al bot a medias: la 245/75R16 mide
 *               774 mm contra 777 de la pedida — clavada, monta perfecto. Lo
 *               que el cliente vio es el ANCHO: 2 cm menos de sección, que se
 *               nota a simple vista. El bot le ofreció UNA sola equivalente,
 *               más angosta, sin decirle que era más angosta.
 *   conv 17831 · pidió 285/75R16 A/T. Le ofreció 215/65R16, 245/70R16 y
 *               235/70R16 — hasta 7 cm más angostas — y nunca mencionó la
 *               KENDA KR29 285/75R16 que estaba en catálogo.
 *   conv 18100 · pidió 235/45R18. Le ofreció 225/40R18 (−4,7 % de diámetro) y
 *               225/55R18 (+5,4 %) en la misma imagen: ni equivalen entre sí.
 *   conv 18407 · pidió 205R14 para una Kia Pregio (furgoneta). Le ofreció una
 *               KR20 en 195/60R14, que es de auto, «se confirma el calce».
 *
 * Una equivalente de verdad mantiene el diámetro exterior (el velocímetro y la
 * caja lo notan) y se le parece en ancho. El criterio es el del taller: mismo
 * ancho primero, después ±10 mm, y el diámetro dentro del 3 %.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_equiv_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";
process.env.SELLER_PHONE ??= "test";

const { diametroExteriorMm, cercaniaDeMedida, ordenarPorCercania } = await import(
  "../src/domain/equivalencia.js"
);

describe("diámetro exterior", () => {
  it("lo calcula de una medida métrica", () => {
    // 265/70R16 → 16 × 25.4 + 2 × (265 × 0.70) = 406.4 + 371 = 777.4 mm
    expect(Math.round(diametroExteriorMm("265/70R16") ?? 0)).toBe(777);
    // 245/75R16 → 406.4 + 367.5 = 773.9 — casi el mismo, por eso «le monta»
    expect(Math.round(diametroExteriorMm("245/75R16") ?? 0)).toBe(774);
  });

  it("lo lee de una medida en pulgadas, donde ya viene dado", () => {
    // 33X12.5R15 → 33 pulgadas = 838.2 mm
    expect(Math.round(diametroExteriorMm("33X12.5R15") ?? 0)).toBe(838);
  });

  it("una medida sin perfil no tiene diámetro calculable", () => {
    expect(diametroExteriorMm("205R14")).toBeNull();
    expect(diametroExteriorMm(null)).toBeNull();
  });
});

describe("cercanía de una candidata a la medida pedida", () => {
  it("la misma medida es lo más cerca que hay", () => {
    expect(cercaniaDeMedida("265/70R16", "265/70R16")?.mismoAncho).toBe(true);
    expect(cercaniaDeMedida("265/70R16", "265/70R16")?.deltaDiametro).toBe(0);
  });

  it("el chat 18225: la 245/75R16 sí monta, pero es más angosta y hay que decirlo", () => {
    const ofrecida = cercaniaDeMedida("265/70R16", "245/75R16");
    // 774 mm contra 777: el diámetro está clavado, la llanta monta.
    expect(ofrecida?.aceptable).toBe(true);
    // Pero son 2 cm menos de sección, y eso es lo que el cliente vio.
    expect(ofrecida?.mismoAncho).toBe(false);
    expect(ofrecida?.deltaAncho).toBe(20);
  });

  it("y la 265/75R16 del mismo ancho se pasa del 3 %: no es equivalente limpia", () => {
    // 804 mm contra 777 → +3,4 %. Respetar el ancho no alcanza si el diámetro
    // se va: el velocímetro y la caja lo notan antes que el ojo.
    const mismoAncho = cercaniaDeMedida("265/70R16", "265/75R16");
    expect(mismoAncho?.mismoAncho).toBe(true);
    expect(mismoAncho?.aceptable).toBe(false);
  });

  it("el chat 17831: 215/65R16 por una 285/75R16 no es equivalente", () => {
    // 285/75R16 = 834 mm · 215/65R16 = 686 mm → 18 % menos. Fuera.
    expect(cercaniaDeMedida("285/75R16", "215/65R16")?.aceptable).toBe(false);
  });

  it("el chat 18100: ni la 225/40R18 ni la 225/55R18 equivalen a una 235/45R18", () => {
    expect(cercaniaDeMedida("235/45R18", "225/40R18")?.aceptable).toBe(false);
    expect(cercaniaDeMedida("235/45R18", "225/55R18")?.aceptable).toBe(false);
  });

  it("el chat 18729: 255/55R19 por una 255/45R19 se va del 3 %", () => {
    expect(cercaniaDeMedida("255/45R19", "255/55R19")?.aceptable).toBe(false);
  });

  it("una de otro aro nunca es equivalente", () => {
    expect(cercaniaDeMedida("265/70R16", "265/70R17")?.aceptable).toBe(false);
  });
});

describe("ordenar candidatas por cercanía", () => {
  const item = (sizeLabel: string, precio: number) => ({ sizeLabel, minimumPriceWithTax: precio });

  it("el chat 18225: gana la que mantiene el diámetro, no la más barata", () => {
    const ordenadas = ordenarPorCercania(
      [item("235/70R16", 180), item("245/75R16", 233), item("265/75R16", 275)],
      "265/70R16",
    );
    // La 235/70R16 era la más barata y la que la escalera habría puesto
    // primero; tiene 5,4 % menos de diámetro, así que ni entra.
    expect(ordenadas.map((o) => o.sizeLabel)).toEqual(["245/75R16"]);
  });

  it("deja fuera las que no equivalen", () => {
    const ordenadas = ordenarPorCercania(
      [item("215/65R16", 120), item("265/75R16", 275)],
      "285/75R16",
    );
    expect(ordenadas.map((o) => o.sizeLabel)).not.toContain("215/65R16");
  });

  it("sin medida pedida no reordena ni descarta nada", () => {
    const lista = [item("245/75R16", 233), item("265/75R16", 275)];
    expect(ordenarPorCercania(lista, null)).toEqual(lista);
  });
});
