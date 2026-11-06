/**
 * EL BLACK FRIDAY COMO HECHO (Depot, nov-2026): lo que el vendedor y el
 * guardián saben, cuándo se contesta un servicio o el aceite, y la respuesta
 * corta a «¿tienen promociones?». Las cifras salen de la política y de
 * `domain/promocionDeTemporada.ts`; acá solo se comprueba que lleguen tal cual.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const {
  consultaDeTemporadaDelTurno,
  hechoDeTemporadaParaElGuardian,
  hechoDeTemporadaParaElVendedor,
  incluidosConLaLlanta,
  ordenDeServicioDeTemporada,
  resumenDeLaPromocion,
  yaSalioElResumenDeLaPromocion,
} = await import("../src/services/hechosDeTemporada.js");
const { consultaFueraDeCatalogoActiva } = await import("../src/domain/alcanceComercial.js");
const { preguntaPorLaPromocion } = await import("../src/domain/beneficioDeRedes.js");
const { isGenericFirstContact } = await import("../src/domain/firstContact.js");
const { POLITICA_DEPOT } = await import("../src/negocio/politicas/depot.js");
const { POLITICA_MUNDILLANTAS } = await import("../src/negocio/politicas/mundillantas.js");

const promo = POLITICA_DEPOT.promocionDeTemporada!;
// 12:00 en Quito = 17:00 UTC.
const en = (dia: string) => new Date(`${dia}T17:00:00Z`);
const NOV = en("2026-11-05");
const DIC = en("2026-12-01");
const BENEFICIOS = ["Instalación, alineación y balanceo incluidos", "Seguro gratuito contra daños"];
const op = (ahora = NOV, conAceites = false) => ({ promo, ahora, beneficios: BENEFICIOS, conAceites });

describe("el hecho del vendedor", () => {
  const hecho = hechoDeTemporadaParaElVendedor(op())!;

  it("trae las cuatro promos con sus condiciones y la fecha", () => {
    expect(hecho).toMatch(/Black Friday, hasta el 30 de noviembre/);
    expect(hecho).toMatch(/60 % de descuento en la SEGUNDA llanta/);
    expect(hecho).toMatch(/la 2\.ª y la 4\.ª de un juego de 4/);
    expect(hecho).toMatch(/SOLO marcas Falken y Kenda; cualquier otra marca NO/);
    expect(hecho).toMatch(/NO es el 60 % en todas las llantas/);
    expect(hecho).toMatch(/Revisión de 7 puntos GRATIS/);
  });

  it("la tabla de servicios por auto y camioneta, normal → noviembre", () => {
    expect(hecho).toMatch(/Servicios al 50 %/);
    expect(hecho).toContain("Alineación: auto $40.00 → $20.00, camioneta $60.00 → $30.00");
    expect(hecho).toContain("ABC de frenos: auto $50.00 → $25.00, camioneta $70.00 → $35.00");
  });

  it("los aceites, PVP → −40 %: la lista solo viaja cuando se habla de aceite", () => {
    expect(hecho).toMatch(/40 % de descuento sobre el PVP con IVA de 22 aceites/);
    expect(hecho).not.toContain("15W40 LITRO SUNOCO");
    const conAceites = hechoDeTemporadaParaElVendedor(op(NOV, true))!;
    expect(conAceites).toContain("15W40 LITRO SUNOCO $14.71 → $8.83");
    expect(conAceites).toContain("SYNTURO XENON 5W30 12X1LT $18.11 → $10.87");
  });

  it("dice que alineación y balanceo ya van incluidos con las llantas, según la tabla de beneficios", () => {
    expect(incluidosConLaLlanta(promo, BENEFICIOS)).toEqual(["Alineación", "Balanceo", "Enllantaje"]);
    expect(hecho).toMatch(/alineación, balanceo y enllantaje ya van INCLUIDOS sin costo con la compra de llantas/);
    expect(hecho).toMatch(/PROHIBIDO ofrecerle el descuento de servicios/);
  });

  it("fuera de fechas o sin promo en la política, no existe", () => {
    expect(hechoDeTemporadaParaElVendedor(op(DIC))).toBeNull();
    expect(hechoDeTemporadaParaElVendedor(op(en("2026-10-31")))).toBeNull();
    expect(hechoDeTemporadaParaElVendedor({ promo: POLITICA_MUNDILLANTAS.promocionDeTemporada ?? null, ahora: NOV })).toBeNull();
    expect(hechoDeTemporadaParaElGuardian({ promo: null, ahora: NOV })).toBeNull();
  });
});

describe("el hecho del guardián", () => {
  const hecho = hechoDeTemporadaParaElGuardian(op(NOV, true))!;

  it("trae las mismas cifras que el vendedor", () => {
    expect(hecho).toContain("Alineación: auto $40.00 → $20.00");
    expect(hecho).toContain("15W40 LITRO SUNOCO $14.71 → $8.83");
  });

  it("deja pasar lo cierto: el 60 % Falken/Kenda, los precios de la tabla, el 40 %, la revisión gratis", () => {
    expect(hecho).toMatch(/NO taches como inventado el 60 % en la 2\.ª \(y 4\.ª\) llanta Falken y Kenda/);
    expect(hecho).toMatch(/el 50 % y los precios de servicios de esta tabla/);
    expect(hecho).toMatch(/el 40 % y los precios de aceite de esta lista/);
    expect(hecho).toMatch(/«Revisión de 7 puntos GRATIS»/);
  });

  it("tacha lo falso: otra marca, las 4 llantas, otro servicio, otro aceite, el 50 % al que compra llantas", () => {
    const tacha = hecho.split("\n").find((l) => l.startsWith("SÍ es **hecho_comercial_inventado**"))!;
    expect(tacha).toMatch(/el 60 % en otra marca que no sea Falken y Kenda/);
    expect(tacha).toMatch(/el 60 % en todas las llantas, en las 4/);
    expect(tacha).toMatch(/servicio que no está en la tabla/);
    expect(tacha).toMatch(/precio de aceite que no está en la lista/);
    expect(tacha).toMatch(/a quien compra llantas \(le van incluidos\)/);
  });
});

describe("servicios y aceite en temporada: se contestan", () => {
  const consulta = (textos: string[], ahora = NOV) => consultaDeTemporadaDelTurno(textos, op(ahora));

  it("cambio de aceite: consulta de servicio, con el 40 % y el asesor elige el aceite", () => {
    const c = consulta(["Buenas, cuánto cuesta el cambio de aceite para mi Kia Rio?"])!;
    expect(c).toMatchObject({ tipo: "servicio", aceite: true, servicios: [] });
    const orden = ordenDeServicioDeTemporada(c, op())!;
    expect(orden).toMatch(/40 % de descuento sobre el PVP/);
    expect(orden).toContain("15W40 LITRO SUNOCO $14.71 → $8.83");
    expect(orden).toMatch(/PROHIBIDO elegirlo tú por el modelo del vehículo/);
    expect(orden).toMatch(/notificar_vendedor UNA VEZ/);
    expect(orden).toMatch(/No busques ni cotices llantas/);
  });

  it("alineación de camioneta: el precio de la camioneta", () => {
    const c = consulta(["Cuánto la alineación para mi camioneta?"])!;
    expect(c).toMatchObject({ tipo: "servicio", servicios: ["Alineación"], vehiculo: "camioneta" });
    expect(ordenDeServicioDeTemporada(c, op())).toContain("Alineación $30.00 (normal $60.00)");
  });

  it("sin saber si es auto o camioneta, pregunta antes del precio", () => {
    const c = consulta(["precio del ABC de frenos"])!;
    expect(c.vehiculo).toBeNull();
    const orden = ordenDeServicioDeTemporada(c, op())!;
    expect(orden).toMatch(/pregúntale si es auto o camioneta/);
    expect(orden).not.toMatch(/\$25\.00|\$35\.00/);
  });

  it("quien compra llantas y pregunta si la alineación es al 50 %: va incluida, no se le ofrece el 50 %", () => {
    const c = consulta(["Necesito 4 llantas 205/55R16", "y la alineación es al 50%?"])!;
    expect(c.tipo).toBe("incluido_con_la_llanta");
    const orden = ordenDeServicioDeTemporada(c, op())!;
    expect(orden).toMatch(/ya va INCLUIDO, sin costo/);
    expect(orden).toMatch(/PROHIBIDO ofrecerle el descuento/);
    expect(orden).not.toMatch(/\$20\.00/);
  });

  it("quien compra llantas y pregunta por los frenos o el aceite: eso no va incluido, sí es consulta de servicio", () => {
    expect(consulta(["4 llantas 205/55R16", "y el ABC de frenos?"])?.tipo).toBe("servicio");
    expect(consulta(["4 llantas 205/55R16", "hacen cambio de aceite?"])?.tipo).toBe("servicio");
  });

  it("si después vuelve a las llantas, manda el catálogo", () => {
    expect(consulta(["cuánto el cambio de aceite?", "mejor cotíceme llantas 205/55R16"])).toBeNull();
  });

  it("después del 30-nov todo vuelve a como era: el aceite es fuera de catálogo y no hay consulta de temporada", () => {
    expect(consulta(["Cuánto el cambio de aceite?"], DIC)).toBeNull();
    expect(consultaFueraDeCatalogoActiva(["Cuánto el cambio de aceite?"])).toBe(true);
  });
});

describe("«¿tienen promociones?»: la respuesta corta", () => {
  const resumen = resumenDeLaPromocion(op())!;

  it("nombra las cuatro promos en una línea, sin «¿»/«¡» de apertura ni formato de IA", () => {
    expect(resumen).toBe(
      "Sí, hasta el 30 de noviembre tenemos Black Friday: 60 % de descuento en cada segunda llanta Falken o Kenda, "
      + "25 % en todas las Winrun, 50 % en alineación, balanceo, ABC de frenos y enllantaje, 40 % en el cambio de aceite y "
      + "revisión de 7 puntos gratis.",
    );
    expect(resumen).not.toMatch(/[¿¡*•#]|\n/);
  });

  it("no se repite en el ciclo", () => {
    expect(yaSalioElResumenDeLaPromocion(["Hola", resumen], op())).toBe(true);
    expect(yaSalioElResumenDeLaPromocion(["Hola", "¿Qué medida usa?"], op())).toBe(false);
  });

  it("la pregunta: promociones, black friday, ofertas; con una cifra habla de su cotización", () => {
    expect(preguntaPorLaPromocion("¿Tienen promociones?")).toBe(true);
    expect(preguntaPorLaPromocion("tienen promo de black friday")).toBe(true);
    expect(preguntaPorLaPromocion("qué ofertas hay")).toBe(true);
    expect(preguntaPorLaPromocion("la promo del 60% es en las 4?")).toBe(false);
    expect(preguntaPorLaPromocion("necesito 205/55R16")).toBe(false);
  });

  it("fuera de fechas no hay resumen", () => {
    expect(resumenDeLaPromocion(op(DIC))).toBeNull();
  });

  it("«hola, tienen promo de black friday?» no es un saludo genérico: le toca al agente", () => {
    expect(isGenericFirstContact("Hola, tienen promo de black friday?")).toBe(false);
    expect(isGenericFirstContact("Buenas, el cambio de aceite?")).toBe(false);
  });
});

const { PASOS } = await import("../src/services/prepararSalida.js");

describe("la cadena de salida", () => {
  const paso = (nombre: string) => PASOS.find((p) => p.nombre === nombre)!;
  const ctx = (textoDelCliente: string, ahora: Date) =>
    ({ conversation: { id: -1, current_cycle: 1 }, tipo: "respuesta", textoDelCliente, ahora }) as never;

  it("va antes del beneficio de redes", () => {
    const nombres = PASOS.map((p) => p.nombre);
    expect(nombres.indexOf("la_promocion_de_temporada_se_responde")).toBeGreaterThan(-1);
    expect(nombres.indexOf("la_promocion_de_temporada_se_responde")).toBeLessThan(nombres.indexOf("el_beneficio_se_responde"));
  });

  it("en noviembre contesta la promo y el beneficio de redes no se pega detrás de «¿tienen promociones?»", async () => {
    const c = ctx("¿Tienen promociones?", NOV);
    const borrador = "Sí, tenemos descuentos del 25 %.\n---\n¿Qué medida usa?";
    const conPromo = (await paso("la_promocion_de_temporada_se_responde").aplicar(borrador, c))!;
    expect(conPromo).toMatch(/^Sí, hasta el 30 de noviembre tenemos Black Friday:/);
    expect(conPromo).not.toMatch(/descuentos del 25 %/);
    expect(conPromo).toMatch(/25 % en todas las Winrun/);
    expect(conPromo).toMatch(/¿Qué medida usa\?$/);
    expect(await paso("el_beneficio_se_responde").aplicar(conPromo, c)).toBe(conPromo);
  });

  it("si pregunta por UN servicio («¿la alineación entra en la promo?»), no va el resumen: contesta el vendedor", async () => {
    const borrador = "Con la compra de sus llantas la alineación ya va incluida.";
    expect(await paso("la_promocion_de_temporada_se_responde").aplicar(borrador, ctx("y la alineación entra en la promo?", NOV))).toBe(borrador);
    expect(await paso("la_promocion_de_temporada_se_responde").aplicar(borrador, ctx("tienen promo en cambio de aceite?", NOV))).toBe(borrador);
  });

  it("no deja un «Sí.» suelto debajo del resumen (simulador, 5-nov)", async () => {
    const borrador = "Sí. Tenemos Black Friday todo el mes.\n\nSí.\n\nSi busca llantas, le cotizo con la medida.\n---\n¿Qué medida usa?";
    const r = (await paso("la_promocion_de_temporada_se_responde").aplicar(borrador, ctx("hola tienen promo de black friday?", NOV)))!;
    expect(r).not.toMatch(/^Sí\.$/m);
    expect(r).toMatch(/Si busca llantas, le cotizo con la medida\./);
    expect(r).toMatch(/¿Qué medida usa\?$/);
  });

  it("en diciembre no hace nada", async () => {
    const borrador = "¿Qué medida usa?";
    expect(await paso("la_promocion_de_temporada_se_responde").aplicar(borrador, ctx("¿Tienen promociones?", DIC))).toBe(borrador);
  });
});

describe("el segundo mensaje del saludo (Manuel, 6-nov)", () => {
  it("en noviembre: la lista corta con el 60 % en cada 2.ª llanta y el 25 % de Winrun", async () => {
    const { mensajeDeTemporadaParaElSaludo } = await import("../src/services/hechosDeTemporada.js");
    const m = mensajeDeTemporadaParaElSaludo({ ahora: new Date("2026-11-06T12:00:00-05:00") })!;
    expect(m).toContain("*PROMOCIÓN BLACK FRIDAY*");
    expect(m).toContain("*−60 % en cada 2.ª llanta* Falken y Kenda");
    expect(m).toContain("*−25 %* en Winrun");
    expect(m).toContain("ABC de frenos");
    expect(m).toContain("*−40 %* en cambio de aceite");
    expect(m).toContain("Revisión de 7 puntos GRATIS");
    expect(m).toContain("Válido hasta el 30 de noviembre.");
  });

  it("en diciembre no sale", async () => {
    const { mensajeDeTemporadaParaElSaludo } = await import("../src/services/hechosDeTemporada.js");
    expect(mensajeDeTemporadaParaElSaludo({ ahora: new Date("2026-12-01T12:00:00-05:00") })).toBeNull();
  });
});
