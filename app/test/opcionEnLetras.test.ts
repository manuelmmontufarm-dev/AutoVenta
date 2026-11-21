/**
 * «uno», «la dos», «opción tres»: la posición del menú escrita con letras.
 *
 * Capacitación de Competimotor, 20-nov-2026 (Carlos): el bot mandó la lámina
 * con 3 opciones, preguntó cuál cotizar, el cliente contestó «uno» y el bot le
 * repitió la pregunta. Las dos caras de la trampa se prueban juntas: una
 * elección no puede cambiar la cantidad, y una cantidad («quiero dos», «mejor
 * solo uno», CM09 «mejor solo 2») no puede leerse como elegir una opción.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { opcionEnDigitos } from "../src/domain/opcionEnLetras.js";
import {
  cantidadDelTexto, eligePosicionDelMenu, escalonContestado, esRespuestaDelMenuDePreferencia,
  extractExplicitQuantity, respuestaDePreferencia,
} from "../src/domain/salesIntent.js";
import { soloAcuseOCantidad } from "../src/domain/ofertaAceptada.js";
import { posicionElegida } from "../src/domain/listaDeOpciones.js";

// Lo que Competimotor manda debajo de la lámina (`textoDeLaLista`) y la repregunta de `preguntaCualLeCotizo`.
const LISTA = "1. *KENDA KR29* — $95.00 c/u\n2. *WINRUN R330* — $110.00 c/u\n3. *FALKEN ZE310* — $140.00 c/u\n¿Le cotizo la 1, la 2 o la 3?";
const REPREGUNTA = "¿Cuál le cotizo, la 1, la 2 o la 3?";

const VITRINA = [
  { codigo: "ECO", marca: "Kenda", diseno: "KR29" },
  { codigo: "MED", marca: "Winrun", diseno: "R330" },
  { codigo: "PRE", marca: "Falken", diseno: "ZE310" },
];
const ESCALONES = {
  economica: { codigo: "ECO", nombre: "KENDA KR29", precio_con_iva: 95 },
  equilibrada: { codigo: "MED", nombre: "WINRUN R330", precio_con_iva: 110 },
  premium: { codigo: "PRE", nombre: "FALKEN ZE310", precio_con_iva: 140 },
};

let loQueEligio: typeof import("../src/services/cotizarLoElegido.js").loQueEligio;
let respondioElMenu: typeof import("../src/services/followUps.js").respondioElMenu;
beforeAll(async () => {
  process.env.WHATSAPP_TOKEN ||= "test";
  process.env.WHATSAPP_APP_SECRET ||= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
  process.env.WHATSAPP_PHONE_ID ||= "test";
  process.env.SELLER_PHONE ||= "593000000000";
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
  ({ loQueEligio } = await import("../src/services/cotizarLoElegido.js"));
  ({ respondioElMenu } = await import("../src/services/followUps.js"));
});

const ELECCIONES: [string, number][] = [
  ["uno", 1], ["Uno", 1], ["la uno", 1], ["el uno", 1], ["opción uno", 1],
  ["dos", 2], ["la dos", 2], ["La dos porfa", 2], ["opción dos", 2], ["quiero la opción dos", 2],
  ["me quedo con la dos", 2], ["la dos por favor", 2], ["número dos", 2],
  ["tres", 3], ["el tres", 3], ["opción tres", 3], ["la tres gracias", 3], ["Opcion tres", 3],
];

describe("la posición con letras elige la opción", () => {
  it.each(ELECCIONES)("«%s» a la lista elige la %i", (texto, n) => {
    const r = loQueEligio(texto, LISTA, null, VITRINA, ESCALONES, 3);
    expect(r).toMatchObject({ codigo: ["ECO", "MED", "PRE"][n - 1] });
  });

  it.each(ELECCIONES)("«%s» no se lee como cantidad ni como menú sin elegir", (texto) => {
    expect(soloAcuseOCantidad(texto)).toBe(false);
    expect(cantidadDelTexto(opcionEnDigitos(texto, { menuAbierto: true }), LISTA)).toBeNull();
  });

  it.each(ELECCIONES)("«%s» cuenta como menú contestado para los seguimientos", async (texto) => {
    expect(respondioElMenu(texto)).toBe(true);
  });

  it("los lectores de siempre ven el dígito", () => {
    expect(posicionElegida("la dos")).toBe(2);
    expect(posicionElegida("opción tres")).toBe(3);
    expect(respuestaDePreferencia("la dos")).toBe("equilibrada");
    expect(eligePosicionDelMenu("mi disculpa, quiero la opción dos")).toBe(true);
    expect(escalonContestado("uno", LISTA)).toBe("precio");
    expect(esRespuestaDelMenuDePreferencia("tres", LISTA)).toBe(true);
  });

  it("la repregunta «¿Cuál le cotizo, la 1…?» también es el menú", () => {
    expect(esRespuestaDelMenuDePreferencia("2", REPREGUNTA)).toBe(true);
    expect(loQueEligio("dos", REPREGUNTA, null, VITRINA, ESCALONES, 3)).toMatchObject({ codigo: "MED" });
    expect(loQueEligio("la uno", REPREGUNTA, null, VITRINA, ESCALONES, 3)).toMatchObject({ codigo: "ECO" });
  });

  it("con el reply al mensaje de la lista, «dos» es la opción aunque después hayamos dicho otra cosa", () => {
    expect(loQueEligio("dos", "Estamos en la Av. Quito.", LISTA, VITRINA, ESCALONES, 3)).toMatchObject({ codigo: "MED" });
  });

  it("la elección no cambia la cantidad que el cliente ya dijo", () => {
    expect(extractExplicitQuantity(opcionEnDigitos("quiero la dos"))).toBeNull();
    expect(cantidadDelTexto(opcionEnDigitos("la dos, 2 llantas"), LISTA)).toBe(2);
  });
});

describe("la cantidad con letras sigue siendo cantidad", () => {
  const CANTIDADES: [string, number][] = [
    ["quiero dos", 2], ["mejor solo uno", 1], ["mejor solo 2", 2], ["solo dos", 2],
    ["dos llantas", 2], ["mejor solo dos llantas", 2], ["necesito tres", 3],
  ];
  it.each(CANTIDADES)("«%s» = %i llantas, no una opción", (texto, n) => {
    const t = opcionEnDigitos(texto, { menuAbierto: true });
    expect(t).toBe(texto);
    expect(cantidadDelTexto(t, LISTA)).toBe(n);
    // Con la lista abierta, es «cuántas sin decir cuál»: se pregunta cuál y se guarda la cantidad.
    expect(soloAcuseOCantidad(texto)).toBe(true);
    const r = loQueEligio(texto, LISTA, null, VITRINA, ESCALONES, 3);
    expect(r && "codigo" in r).toBeFalsy();
    expect(r).toMatchObject({ menuSinElegir: true, cantidad: n });
  });

  it("«mejor dos» y «las dos» no eligen una posición", () => {
    expect(opcionEnDigitos("mejor dos", { menuAbierto: true })).toBe("mejor dos");
    expect(opcionEnDigitos("las dos", { menuAbierto: true })).toBe("las dos");
    expect(posicionElegida("las dos")).toBeNull();
  });

  it("la palabra pelada sin menú abierto queda como estaba", () => {
    expect(opcionEnDigitos("dos")).toBe("dos");
    expect(respuestaDePreferencia("dos")).toBeNull();
  });

  it("fechas, horas y cosas contadas no se tocan", () => {
    expect(opcionEnDigitos("voy el dos de diciembre")).toBe("voy el dos de diciembre");
    expect(opcionEnDigitos("a la una")).toBe("a la una");
    expect(opcionEnDigitos("la dos llantas")).toBe("la dos llantas");
    expect(opcionEnDigitos("el tres")).toBe("el 3");
  });

  it("con otra cosa en el mensaje solo cambia la palabra", () => {
    expect(opcionEnDigitos("la dos con tarjeta cuánto sale?")).toBe("la 2 con tarjeta cuánto sale?");
  });
});
