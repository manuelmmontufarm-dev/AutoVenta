/**
 * Competimotor, 20-nov-2026 — los dos errores que mandó Carlos por WhatsApp.
 *
 * 1. «Las únicas marcas que manejamos con seguro son KENDA y FALKEN; aquí le
 *    envían con seguro una marca que no tiene». La lámina de opciones de una
 *    TOURADOR FORCE AT II LB en 265/65R17 decía «con IVA, instalación, seguro y
 *    mantenimiento ya incluidos»: la frase era fija.
 * 2. Conv 469 («Abg Jumbo», 11:34): «Llantas 23575r15 / Tipo pantaneras / Que
 *    precio tiene ?» → «En 235/75R15 tipo pantanera (M/T) no me aparece stock».
 *    Había KENDA KR29 y TOWNHALL TH-MT802 en esa medida y FALKEN WILDPEAK M/T en
 *    30X9.5R15. Tres causas: «23575r15» no se leía como medida, la base de tipos
 *    de Competimotor estaba vacía (ninguna llanta tenía tipo) y la 30X9.5R15
 *    quedaba fuera del 3 % de diámetro.
 *
 * Los nombres de las llantas son los del Excel de Fénix de hoy (INV_NOV.XLS,
 * el que está cargado en producción).
 */
import { describe, expect, it } from "vitest";

// El perfil se elige al cargar el módulo: la variable va ANTES de los imports.
process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { warrantyForBrand } = await import("../src/services/quoteMessages.js");
const { loIncluidoEnElJuego } = await import("../src/render/diaNoche.js");
const { respaldoDeMarca } = await import("../src/domain/respaldoMarcas.js");
const { negocio } = await import("../src/negocio/index.js");
const { politica } = await import("../src/negocio/politica.js");
const { hechoDelNegocio } = await import("../src/services/guardian.js");
const { extractTireSizes } = await import("../src/domain/tireSize.js");
const { tipoSolicitadoEn } = await import("../src/domain/opcionesCandados.js");
const { gruposDeLaRafaga } = await import("../src/domain/rafaga.js");
const { normalizarTipo, tipoDeProducto } = await import("../src/domain/tireTypes.js");
const { usoDeclarado, tiposCompatibles } = await import("../src/domain/usoYTipo.js");
const { cercaniaDeMedida, ordenarPorCercania, pulgadasEquivalentes } = await import("../src/domain/equivalencia.js");

const linea = (marca: string) => ({ golpesMeses: warrantyForBrand(marca).roadHazardMonths });

describe("el seguro contra impacto, solo Kenda y Falken", () => {
  it("la TOURADOR del 265/65R17 no lleva seguro y la lámina ya no lo dice", () => {
    expect(warrantyForBrand("TOURADOR").roadHazard).toBeNull();
    expect(loIncluidoEnElJuego([linea("TOURADOR")])).not.toMatch(/seguro/i);
    expect(loIncluidoEnElJuego([linea("TOURADOR")])).toBe("con IVA, instalación y mantenimiento ya incluidos.");
  });

  it("Kenda y Falken sí: la frase de siempre", () => {
    expect(warrantyForBrand("KENDA").roadHazardMonths).toBe(12);
    expect(warrantyForBrand("FALKEN").roadHazardMonths).toBe(18);
    expect(loIncluidoEnElJuego([linea("KENDA"), linea("FALKEN")])).toMatch(/seguro/);
  });

  it("Winrun y Maxxis pierden el seguro pero conservan la garantía de fábrica", () => {
    for (const marca of ["WINRUN", "MAXXIS"]) {
      expect(warrantyForBrand(marca).roadHazard).toBeNull();
      expect(warrantyForBrand(marca).factory).toBeTruthy();
      expect(respaldoDeMarca(marca)?.seguroMeses).toBe(0);
    }
    expect(negocio.garantias.Winrun.fabricaAnios).toBe(0.5);
    expect(negocio.garantias.Maxxis.fabricaAnios).toBe(1);
  });

  it("una lámina mezclada (Kenda + una sin seguro) no promete seguro para todas", () => {
    expect(loIncluidoEnElJuego([linea("KENDA"), linea("HAIDA")])).not.toMatch(/seguro/);
  });

  it("ningún texto del bot dice que Winrun o Maxxis llevan seguro", () => {
    const textos = [
      ...(politica.hechosConfirmados ?? []),
      hechoDelNegocio() ?? "",
      negocio.piezas.seguro?.detalle ?? "",
      ...(negocio.piezas.respaldo ?? []).filter((r) => /seguro/i.test(r.titulo)).map((r) => (r.marcas ?? []).join(",")),
    ].join("\n");
    expect(textos).not.toMatch(/seguro[^.]*\b(?:Winrun|Maxxis)\b[^.]*\.|Kenda, Falken, Winrun y Maxxis/i);
    expect(hechoDelNegocio()).toMatch(/WINRUN:[^·]*SIN seguro/);
    expect(respaldoDeMarca("TOURADOR")).toBeNull();
  });
});

describe("«pantanera» es M/T", () => {
  it("«Llantas 23575r15» se lee como 235/75R15 (antes, nada)", () => {
    expect(extractTireSizes("Llantas 23575r15")).toEqual([{ width: 235, aspect: 75, rim: 15 }]);
    expect(extractTireSizes("26565r17")).toEqual([{ width: 265, aspect: 65, rim: 17 }]);
    // Sin la R no: cinco cifras y dos más pueden ser un teléfono.
    expect(extractTireSizes("2357515")).toEqual([]);
    expect(extractTireSizes("llámeme al 0993873816")).toEqual([]);
  });

  it("«pantanera» es M/T: como tipo pedido, M/T; en boca del cliente, el uso lodo (M/T primero)", () => {
    // El modelo puede pasar tipo: «pantanera» a buscar_por_aro_y_tipo.
    expect(normalizarTipo("pantanera")).toBe("M/T");
    expect(normalizarTipo("Pantaneras")).toBe("M/T");
    // En el texto del cliente es el USO lodo: M/T primero y R/T de respaldo —
    // lo mismo que hizo el asesor en la conv 469 (KR601 RT y TH-MT802).
    expect(usoDeclarado("Tipo pantaneras")).toBe("lodo");
    expect(tiposCompatibles(usoDeclarado("Tipo pantaneras"))?.[0]).toBe("M/T");
    // No es un tipo explícito: no le borra la R/T a quien dice «camino pantanero».
    expect(tipoSolicitadoEn(["Tipo pantaneras"])).toBeNull();
  });

  it("la ráfaga «23575r15» + «Tipo pantaneras» + «Que precio tiene ?» es UN turno", () => {
    expect(gruposDeLaRafaga(["Llantas 23575r15", "Tipo pantaneras", "Que precio tiene ?"])).toEqual([[0, 1, 2]]);
    // Lo que no completa la medida sigue en su propio turno, como antes.
    expect(gruposDeLaRafaga(["205/55R16", "Estoy en Guayaquil"])).toEqual([[0], [1]]);
  });

  it("las M/T del aro 15 de INV_NOV ya tienen tipo", () => {
    expect(tipoDeProducto("A0272", "KR29", "KENDA 235/75R15LT KR29 6PR 104/101Q")).toBe("M/T");
    expect(tipoDeProducto("A0491", "TH-MT802", "TOWNHALL 235/75R15LT TH-MT802 6PR")).toBe("M/T");
    expect(tipoDeProducto("A0092", "WILDPEAK M/T", "FALKEN 30X9.5R15LT WILDPEAK M/T")).toBe("M/T");
    expect(tipoDeProducto("A0273", "KR601", "KENDA 235/75R15LT KR601 RT 6PR 104/101Q")).toBe("R/T");
    // KR628 es A/T (Klever A/T2) en la base que entregó Depot: no se vuelve M/T.
    expect(tipoDeProducto("A0318", "KR628", "KENDA 30X9.5R15LT KR628 LB 104Q 6PR")).toBe("A/T");
    expect(tipoDeProducto("A0490", "TH-AT802", "TOWNHALL 235/75R15 TH-AT802")).toBe("A/T");
    expect(tipoDeProducto("A0472", "FORCE ATII", "TOURADOR 31X10.5R15LT FORCE ATII 6PR")).toBe("A/T");
    expect(tipoDeProducto("A0356", "AT771", "MAXXIS 205/70R15 AT771")).toBe("A/T");
    // Lo que el nombre no dice, no se adivina; «MAT1»/«91HTL» no son A/T ni H/T.
    expect(tipoDeProducto("A0185", "TERRAMAX LB", "ILINK 235/75R15LT TERRAMAX LB")).toBeNull();
    expect(tipoDeProducto("x", "MAT1", "MAXXIS 195/65R15 MAT1 91HTL")).toBeNull();
  });

  it("la 30X9.5R15 cuenta como la 235/75R15 en pulgadas (solo con la tabla del negocio)", () => {
    // 3,9 % más alta: por la cuenta sola no equivale.
    const c = cercaniaDeMedida("235/75R15", "30X9.5R15LT");
    expect(c?.deltaDiametro).toBeGreaterThan(0.03);
    expect(c?.aceptable).toBe(true);
    expect(pulgadasEquivalentes("235/75R15")).toEqual(["30X9.5R15"]);
    // El guardián lo recibe como hecho del negocio (si no, tacha «equivalente»).
    expect(hechoDelNegocio()).toMatch(/30X9\.5R15 = 235\/75R15/);
    // La 31X10.5R15 no está en la tabla ni en el 3 %: sigue sin equivaler.
    expect(cercaniaDeMedida("235/75R15", "31X10.5R15LT")?.aceptable).toBe(false);
    const orden = ordenarPorCercania(
      [{ sizeLabel: "31X10.5R15LT" }, { sizeLabel: "30X9.5R15LT" }, { sizeLabel: "215/75R15LT" }],
      "235/75R15",
    ).map((i) => i.sizeLabel);
    expect(orden).toContain("30X9.5R15LT");
    expect(orden).not.toContain("31X10.5R15LT");
  });
});
