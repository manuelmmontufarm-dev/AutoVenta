/**
 * SPRINT 2 — PRECIO Y CIERRE (auditoría Competimotor 26-nov-2026, F-02 y F-03).
 *
 * Con los textos reales de los chats. Lo puro: la lista con los dos precios,
 * la pregunta que invita, la objeción de precio, la línea de la promo y la
 * pregunta del cierre según el horario. Lo que toca base va en
 * `competimotorPrecioYCierre.integration.test.ts`.
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.DATABASE_URL ||= "postgresql://nadie@localhost/no_se_usa";

const { armarLista, textoDeLaLista, preguntaDeLaLista, listaDeLaPieza, hechoDeLaLista, hechoDePromocionesEnPantalla } = await import("../src/domain/listaDeOpciones.js");
const { esLaListaNumerada, traeMarcaDelMenu } = await import("../src/domain/salesIntent.js");
const { efectivoDeLaLlanta, promocionDeLaLlanta, precioEnEfectivoDeUnaLlanta } = await import("../src/domain/preciosPorPago.js");
const objecion = await import("../src/domain/objecionDePrecio.js");
const { botonesParaBloque, textoDeBoton } = await import("../src/domain/botones.js");
const { preguntaHoyOCita, buildVisitPlanQuestion } = await import("../src/services/quoteMessages.js");
const { preguntaElDia } = await import("../src/domain/customerCommitment.js");
const { estructurarTurno } = await import("../src/domain/estructuraDelTurno.js");
const { politica } = await import("../src/negocio/politica.js");

describe("la política de Competimotor prende el Sprint 2", () => {
  it("ventaConDosPrecios y el encabezado del INCLUYE", () => {
    expect(politica.ventaConDosPrecios).toBe(true);
    expect(politica.encabezadoDelIncluye).toBe("sin costo, comprando 2 o 4 llantas");
  });
});

describe("1 · la lista muestra tarjeta Y efectivo desde la primera vez (1303, 639)", () => {
  // Chat 1303, 23-nov 15:22, 245/65R17: MAXXIS AT771 B $185.99 / C $168.99; FALKEN WILDPEAK A/T TRAIL B $225 / C $208.
  const lista1303 = armarLista([
    { nombre: "FALKEN WILDPEAK A/T TRAIL", precio: 225, codigo: "350234", efectivo: 208 },
    { nombre: "MAXXIS AT771", precio: 185.99, codigo: "R17/245/65 MAXXIS 771", efectivo: 168.99 },
  ], 4)!;

  it("dos líneas por opción: el total con tarjeta y el total en efectivo, con el c/u entre paréntesis", () => {
    const texto = textoDeLaLista(lista1303, 4);
    expect(texto).toBe([
      "1 · MAXXIS AT771 — 4 llantas: *$743.96* con tarjeta ($185.99 c/u)",
      "     💵 *$675.96* en efectivo o transferencia ($168.99 c/u)",
      "2 · FALKEN WILDPEAK A/T TRAIL — 4 llantas: *$900.00* con tarjeta ($225.00 c/u)",
      "     💵 *$832.00* en efectivo o transferencia ($208.00 c/u)",
      "",
      "¿Con cuál se queda, la 1 o la 2?",
    ].join("\n"));
  });

  it("chat 639: el cliente quería 2 — los totales van por 2, no por 4", () => {
    // 20-nov 19:48, 225/70R15: HAIDA HD737 B $101.20 / C $92; KENDA KR33A B $143.75 / C $129.95 (catálogo del 20-nov).
    const lista = armarLista([
      { nombre: "HAIDA HD737", precio: 101.2, codigo: "A0142", efectivo: 92 },
      { nombre: "KENDA KR33A", precio: 143.75, codigo: "A0253", efectivo: 129.95 },
    ], 2)!;
    const texto = textoDeLaLista(lista, 2);
    expect(texto).toContain("1 · HAIDA HD737 — 2 llantas: *$202.40* con tarjeta ($101.20 c/u)");
    expect(texto).toContain("💵 *$184.00* en efectivo o transferencia ($92.00 c/u)");
    expect(texto).toContain("2 · KENDA KR33A — 2 llantas: *$287.50* con tarjeta ($143.75 c/u)");
    expect(texto).not.toMatch(/· 4 = /);
  });

  it("con promo más barata que el efectivo, un solo precio y el pie de la promo", () => {
    const lista = armarLista([
      { nombre: "WINRUN WAXCLAW H T2", precio: 119, codigo: "A0552", efectivo: 119, promocion: "Black Friday hasta el sábado 5-dic" },
      { nombre: "FALKEN ZE310R", precio: 226.55, codigo: "A0031", efectivo: 206 },
    ], 4)!;
    const texto = textoDeLaLista(lista, 4);
    expect(texto).toContain("1 · WINRUN WAXCLAW H T2 🖤 — 4 llantas: *$476.00* con tarjeta, efectivo o transferencia ($119.00 c/u)");
    expect(texto).toContain("🖤 Black Friday hasta el sábado 5-dic");
  });

  it("el INCLUYE va entre las opciones y la pregunta", () => {
    const texto = textoDeLaLista(lista1303, 4, "*INCLUYE* sin costo, comprando 2 o 4 llantas:\n- Enllantaje, balanceo y nitrógeno");
    const lineas = texto.split("\n");
    expect(lineas.at(-1)).toBe("¿Con cuál se queda, la 1 o la 2?");
    expect(texto.indexOf("*INCLUYE*")).toBeGreaterThan(texto.indexOf("2 · FALKEN"));
  });

  it("el quitador de frases repetidas del turno no se lleva el efectivo de la 2.ª opción", () => {
    const texto = textoDeLaLista(lista1303, 4);
    const { texto: salida, repetidosQuitados } = estructurarTurno(texto);
    expect(repetidosQuitados).toEqual([]);
    expect(salida).toContain("*$832.00* en efectivo");
  });

  it("la lámina guarda el efectivo y la lista se rearma igual (seguimientos y Guardián)", () => {
    const pieza = listaDeLaPieza({
      escalones: {
        premium: { codigo: "350234", nombre: "FALKEN WILDPEAK A/T TRAIL", precio_con_iva: 225, efectivo_con_iva: 208 },
        equilibrada: null,
        economica: { codigo: "R17/245/65 MAXXIS 771", nombre: "MAXXIS AT771", precio_con_iva: 185.99, efectivo_con_iva: 168.99 },
      },
      cantidad: 4,
    })!;
    expect(textoDeLaLista(pieza.lista, pieza.cantidad)).toBe(textoDeLaLista(lista1303, 4));
    const hecho = hechoDeLaLista(pieza.lista, 4);
    expect(hecho).toContain("$675.96");
    expect(hecho).toContain("DOS precios");
  });

  it("efectivoDeLaLlanta: el C del catálogo, nunca más caro que el de hoy (Black Friday)", () => {
    expect(efectivoDeLaLlanta({ minimumPriceWithTax: 185.99, preciosPorPago: { tarjetaConIva: 185.99, efectivoConIva: 168.99 } })).toBe(168.99);
    expect(efectivoDeLaLlanta({ minimumPriceWithTax: 109, preciosPorPago: { tarjetaConIva: 125.99, efectivoConIva: 115 } })).toBe(109);
    expect(efectivoDeLaLlanta({ minimumPriceWithTax: 100 })).toBeNull();
    expect(promocionDeLaLlanta({ promocionDePrecio: { nombre: "Black Friday", vigenciaCorta: "hasta el sábado 5-dic" } })).toBe("Black Friday hasta el sábado 5-dic");
    expect(promocionDeLaLlanta({})).toBeNull();
  });
});

describe("la pregunta que invita sigue siendo el menú de la lista", () => {
  it("«¿Con cuál se queda, la 1, la 2 o la 3?» la reconocen los lectores del menú", () => {
    expect(preguntaDeLaLista(3)).toBe("¿Con cuál se queda, la 1, la 2 o la 3?");
    expect(preguntaDeLaLista(2)).toBe("¿Con cuál se queda, la 1 o la 2?");
    expect(esLaListaNumerada(preguntaDeLaLista(2))).toBe(true);
    expect(traeMarcaDelMenu(preguntaDeLaLista(3))).toBe(true);
  });
});

describe("2 · «está caro» es objeción de precio (textos reales)", () => {
  it.each([
    "No gracias están muy caras", // 1321
    "Disculpe están muy caras", // 1303
    "El precio esta elevado", // 1762
    "Ninguna todas está. Carísimas", // 697
    "tiene algo más accesible?",
    "está carito",
    "mi tope es 400",
    "se me sale del presupuesto",
    "está fuera de mi presupuesto",
    "no me alcanza el presupuesto",
    "mi presupuesto es de 400",
    "tengo un presupuesto de 500",
    "la más cara está carísima",
  ])("«%s» → objeción", (texto) => {
    expect(objecion.esObjecionDePrecio(texto)).toBe(true);
  });
  it.each([
    "Nesecito dos cuanto es el valor", // 1321: pide el precio, no lo objeta
    "Que precio tiene este tipo de llantas rin 18",
    "la 1",
    "para mi carro",
    "en efectivo hay descuento?",
    // Revisión de la coordinadora (27-nov): «presupuesto» es pedir la cotización, y la pregunta por la opción.
    "me ayuda con un presupuesto",
    "envíeme el presupuesto de las 4",
    "¿cuál es la más cara?",
    "y la más cara cuánto?",
    "cuál es la más barata",
    "no está caro",
    "no es cara",
    "no me parece caro",
  ])("«%s» → NO es objeción", (texto) => {
    expect(objecion.esObjecionDePrecio(texto)).toBe(false);
  });
});

describe("2 · la respuesta al «está caro»: efectivo de lo que vio + la más barata + lo incluido", () => {
  const incluye = "*INCLUYE* sin costo, comprando 2 o 4 llantas:\n- Enllantaje, balanceo y nitrógeno\n- Alineación (comprando las 4 llantas)";

  it("1303: sin nada más barato en la medida, dice que la 1 ya es la más económica y no calca la lista", () => {
    const r = objecion.respuestaAObjecionDePrecio({
      vistas: [
        { n: 1, nombre: "MAXXIS AT771", tarjeta: 185.99, efectivo: 168.99 },
        { n: 2, nombre: "FALKEN WILDPEAK A/T TRAIL", tarjeta: 225, efectivo: 208 },
      ],
      cantidad: 4, medida: "245/65R17", masBarata: null, incluye,
    })!;
    expect(r).toContain("Pagando en *efectivo o transferencia* le queda más bajo:");
    expect(r).toContain("1 · MAXXIS AT771 — 4 llantas: *$675.96* ($168.99 c/u)");
    expect(r).toContain("2 · FALKEN WILDPEAK A/T TRAIL — 4 llantas: *$832.00* ($208.00 c/u)");
    expect(r).toContain("La *MAXXIS AT771* ya es la más económica que tengo en *245/65R17*.");
    expect(r).toContain("*INCLUYE*");
    expect(r).not.toContain("$743.96"); // el total con tarjeta de la lista: no se calca
    expect(r.split("\n---\n").at(-1)).toBe("¿Con cuál se queda, la 1 o la 2?");
  });

  it("697: hay una más barata en 235/75R15 (TOWNHALL TH-AT802 $103.50) y se la ofrece con sus dos precios", () => {
    const r = objecion.respuestaAObjecionDePrecio({
      vistas: [
        { n: 1, nombre: "GOODYEAR WRANGLER WORKHORSE AT", tarjeta: 162, efectivo: 150 },
        { n: 2, nombre: "KENDA KR29", tarjeta: 197.8, efectivo: 179.4 },
        { n: 3, nombre: "FALKEN WILDPEAK A/T 4W", tarjeta: 247.25, efectivo: 224.25 },
      ],
      cantidad: 4, medida: "235/75R15",
      masBarata: { nombre: "TOWNHALL TH-AT802", tarjeta: 103.5, efectivo: 94.3 },
      incluye,
    })!;
    expect(r).toContain("Lo más económico que tengo en *235/75R15* es la *TOWNHALL TH-AT802*: 4 llantas *$414.00* con tarjeta o *$377.20* en efectivo o transferencia.");
    expect(r.split("\n---\n").at(-1)).toBe("¿Le cotizo la *TOWNHALL TH-AT802*? 😊");
  });

  it("1321: una sola opción vista y 2 llantas; la más barata de la medida que alcanza para 2", () => {
    const r = objecion.respuestaAObjecionDePrecio({
      vistas: [{ nombre: "FALKEN ZE310R", tarjeta: 180.55, efectivo: 164.45 }],
      cantidad: 2, medida: "225/60R17",
      masBarata: { nombre: "WINRUN R380", tarjeta: 109.25, efectivo: 98.9 },
      incluye: null,
    })!;
    // $164.45 c/u: lo mismo que cerró el asesor a mano («$164.50… el par en $329»).
    expect(r).toContain("• FALKEN ZE310R — 2 llantas: *$328.90* ($164.45 c/u)");
    expect(r).toContain("*WINRUN R380*: 2 llantas *$218.50* con tarjeta o *$197.80* en efectivo o transferencia.");
  });

  it("sin efectivo ni nada más barato no hay respuesta nueva (sigue el turno del modelo)", () => {
    expect(objecion.respuestaAObjecionDePrecio({
      vistas: [{ nombre: "X", tarjeta: 100, efectivo: null }], cantidad: 4, medida: null, masBarata: null, incluye: null,
    })).toBeNull();
  });
});

describe("3 · descuento o promoción: la promo verdadera o «el descuento es en efectivo» (40, 463, 1790)", () => {
  it.each([
    "en efectivo hay descuento?", // 40
    "No hay descuentos o promociones en esa medida", // 463
    "X viernes  negro  hay más descuento", // 1790
    "cuál es viernes negro", // 385
  ])("«%s» pregunta por descuento o promoción", (texto) => {
    expect(objecion.preguntaPorDescuentoOPromocion(texto)).toBe(true);
  });

  it("sin promo en sus llantas: lo dice claro y que el descuento es pagando en efectivo o transferencia", () => {
    expect(objecion.lineaDeDescuentoOPromocion([null, null], "225/65R17"))
      .toBe("Por ahora en *225/65R17* no hay una promoción vigente: el descuento es pagando en *efectivo o transferencia* 💵.");
  });

  it("con promo vigente: la nombra y aclara que no se descuenta otra vez (639)", () => {
    expect(objecion.lineaDeDescuentoOPromocion(["Black Friday hasta el sábado 5-dic"], null))
      .toBe("Ese precio ya trae la promoción (*Black Friday hasta el sábado 5-dic*): no se descuenta otra vez.");
  });

  it("las frases del modelo que afirman una promo se reconocen (463 y 1790, textuales)", () => {
    expect(objecion.afirmaUnaPromocion("Sí, las opciones que le envié ya están con valor promocional en esa medida.")).toBe(true);
    expect(objecion.afirmaUnaPromocion("Su cotización ya queda con el precio promocional vigente de Black Friday.")).toBe(true);
    expect(objecion.afirmaUnaPromocion("Ese es el valor promocional vigente con el que me llegó esa mercadería por Viernes Negro 🤝")).toBe(true);
    expect(objecion.afirmaUnaPromocion("Puede pasar sin compromiso cuando guste por Competimotor.")).toBe(false);
  });

  it("el Guardián recibe qué opciones NO están en promoción", () => {
    const lista = armarLista([
      { nombre: "TOURADOR FORCE A/T X", precio: 119.99, codigo: "TOU-046", efectivo: 108.99 },
      { nombre: "FALKEN ZE310R", precio: 180.55, codigo: "A0058", efectivo: 164.45 },
    ], 4)!;
    const hecho = hechoDePromocionesEnPantalla(lista);
    expect(hecho).toContain("TOURADOR FORCE A/T X, FALKEN ZE310R NO están en ninguna promoción vigente");
    expect(hecho).toContain("es FALSO");
  });
});

describe("4 · tras la cotización: «¿Puede acercarse hoy o qué día le agendo la cita?», según el horario", () => {
  // Horario de Competimotor: lu–vi 8:00–17:30 (por defecto del perfil), sábado 8–16, domingo cerrado.
  const horario = { competimotor: { dias: {
    lun: { open: "08:00", close: "17:30", closed: false }, mar: { open: "08:00", close: "17:30", closed: false },
    mie: { open: "08:00", close: "17:30", closed: false }, jue: { open: "08:00", close: "17:30", closed: false },
    vie: { open: "08:00", close: "17:30", closed: false }, sab: { open: "08:00", close: "16:00", closed: false },
    dom: { open: "08:00", close: "16:00", closed: true },
  } } } as never;

  it("sábado 10:00: ofrece hoy", () => {
    expect(preguntaHoyOCita(new Date("2026-11-28T10:00:00-05:00"), horario)).toBe("¿Puede acercarse hoy o qué día le agendo la cita? 📅");
  });
  it("sábado 15:00 (cierra a las 16 y la instalación dura hora y media): NO ofrece hoy", () => {
    expect(preguntaHoyOCita(new Date("2026-11-28T15:00:00-05:00"), horario)).toBe("¿Qué día le agendo la cita? 📅");
  });
  it("domingo: NO ofrece hoy", () => {
    expect(preguntaHoyOCita(new Date("2026-11-29T10:00:00-05:00"), horario)).toBe("¿Qué día le agendo la cita? 📅");
  });
  it("las dos formas siguen siendo la pregunta del día (la respuesta se registra como visita)", () => {
    expect(preguntaElDia("¿Puede acercarse hoy o qué día le agendo la cita? 📅")).toBe(true);
    expect(preguntaElDia("¿Qué día le agendo la cita? 📅")).toBe(true);
  });

  it("el botón «Hoy» sale SOLO cuando la pregunta ofrece hoy, y entra como «voy hoy»", () => {
    const ahora = new Date("2026-11-28T10:00:00-05:00");
    const conHoy = botonesParaBloque("¿Puede acercarse hoy o qué día le agendo la cita? 📅", { ciclo: 1, ahora, estaAbierto: () => true })!;
    expect(conHoy.botones.map((b) => b.titulo)).toEqual(["Hoy", "Mañana", "Otro día"]);
    expect(textoDeBoton(conHoy.botones[0].id, "Hoy", 1, ahora)).toBe("voy hoy");
    const sinHoy = botonesParaBloque("¿Qué día le agendo la cita? 📅", { ciclo: 1, ahora, estaAbierto: () => true })!;
    expect(sinHoy.botones.map((b) => b.titulo)).not.toContain("Hoy");
  });

  it("1403/639 (F-03): la pregunta tras cotizar NO dice «N % de descuento ya aplicado, $X menos»", () => {
    // COT-MWTXQG06 (1403): TOURADOR 4 × $109 (Black Friday) con lista $125.99 (P2): la frase salía con «13 %, $67.96 menos».
    const ahorro = { monto: 67.96, porcentaje: 13, cantidad: 4, porLlanta: 16.99, precioConDescuento: 109, precioAntes: 125.99 };
    const texto = buildVisitPlanQuestion({ conDescuentoAutorizado: false, locales: ["Competimotor"], localElegido: "Competimotor", ahorro, ahora: new Date("2026-11-23T19:07:00-05:00") });
    expect(texto).not.toMatch(/descuento ya aplicado|\$67\.96|13 %/);
    expect(texto).toContain("¿Qué día le agendo la cita? 📅"); // 19:07: ya cerró
    expect(texto).toContain("📍 *Competimotor*");
  });
});

describe("la cantidad del «está caro» es la que dijo el cliente (1321)", () => {
  it.each([
    ["Nesecito dos cuanto es el valor", 2],
    ["Solo quiero es dos, un par.", 2],
    ["necesito 2", 2],
    ["quiero las cuatro", 4],
  ])("«%s» → %i", (texto, n) => {
    expect(objecion.cantidadDichaConTolerancia(texto)).toBe(n);
  });
  it.each(["No gracias están muy caras", "paso en dos días", "225/60 rin 17", "la 2"])("«%s» → sin cantidad", (texto) => {
    expect(objecion.cantidadDichaConTolerancia(texto)).toBeNull();
  });
});

describe("precioEnEfectivoDeUnaLlanta (para el 1.er seguimiento del Sprint 4) = el efectivo de la lámina", () => {
  it("cuadro rojo: WINRUN WAXCLAW 235/65R18, Black Friday $119 < Precio C $129 → $119", () => {
    const item = { minimumPriceWithTax: 119, preciosPorPago: { tarjetaConIva: 142.6, efectivoConIva: 129.95 }, promocionDePrecio: { nombre: "Black Friday", vigenciaCorta: "hasta el sábado 5-dic" } };
    expect(precioEnEfectivoDeUnaLlanta(item)).toBe(119);
    expect(precioEnEfectivoDeUnaLlanta(item)).toBe(efectivoDeLaLlanta(item));
  });
  it("sin promo: el Precio C; con promo por cantidad: null (depende de cuántas)", () => {
    expect(precioEnEfectivoDeUnaLlanta({ minimumPriceWithTax: 180.55, preciosPorPago: { tarjetaConIva: 180.55, efectivoConIva: 164.45 } })).toBe(164.45);
    expect(precioEnEfectivoDeUnaLlanta({ minimumPriceWithTax: 100, preciosPorPago: { tarjetaConIva: 100, efectivoConIva: 90 }, promocionPorCantidad: { x: 1 } })).toBeNull();
  });
});
