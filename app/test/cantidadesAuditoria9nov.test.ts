/**
 * SPRINT 3 DE LA AUDITORÍA DEL 9-NOV-2026 · «CANTIDADES MAL ENTENDIDAS».
 *
 * La regla que no se discute: la cantidad dice CUÁNTAS, no CUÁL; un número que
 * es una posición del menú o parte de una medida nunca es cantidad; y la
 * cantidad no cambia entre el menú y la cotización sin decírselo al cliente.
 * Estos son los textos reales de los chats que fallaron (39535, 39337, 33574,
 * 38251, 39601) y los sanos que no pueden moverse (39565, 39991).
 */
import { describe, expect, it, vi } from "vitest";

// `cotizarLoElegido` arrastra la config y el cliente de base (no conecta hasta usarlo).
vi.hoisted(() => {
  process.env.OPENAI_API_KEY ||= "test";
  process.env.WHATSAPP_TOKEN ||= "test";
  process.env.WHATSAPP_APP_SECRET ||= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
  process.env.WHATSAPP_PHONE_ID ||= "test";
  process.env.SELLER_PHONE ||= "593999000111";
  process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
});

import { cantidadGrandePedida, cantidadValidaDeLaFicha, conLaCantidadDicha, esAnchoDeLlanta } from "../src/domain/cantidadGrande.js";
import {
  cantidadDelTexto, cantidadParaPrepararOpciones, cantidadPedidaPorElCliente, extractExplicitQuantity,
  MARCA_DE_LA_LISTA,
} from "../src/domain/salesIntent.js";
import { loQueEligio } from "../src/services/cotizarLoElegido.js";
import { ofertaVigente, opcionesDelMenuAbierto, type FilaDelHilo } from "../src/domain/ofertaVigente.js";

const MENU_39535 =
  "1 · WINRUN MAXCLAW A/T — $124.76 c/u · 4 = $499.04\n2 · KENDA KR50 — 2 × $170.57 + 2 × $68.23 = $477.60\n3 · FALKEN ZIEX CT60 A/S — 2 × $231.04 + 2 × $92.42 = $646.92\n---\n¿Le cotizo la 1, la 2 o la 3?";
const VITRINA = [
  { codigo: "2257016WRMAXCLAWAT", marca: "WINRUN", diseno: "MAXCLAW A/T", medida: "225/70R16" },
  { codigo: "K503B600", marca: "KENDA", diseno: "KR50", medida: "225/70R16" },
  { codigo: "329015", marca: "FALKEN", diseno: "ZIEX CT60 A/S", medida: "225/70R16" },
];
const ESCALONES = {
  economica: { codigo: "2257016WRMAXCLAWAT", nombre: "WINRUN MAXCLAW A/T", precio_con_iva: 124.76 },
  equilibrada: { codigo: "K503B600", nombre: "KENDA KR50", precio_con_iva: 170.57 },
  premium: { codigo: "329015", nombre: "FALKEN ZIEX CT60 A/S", precio_con_iva: 231.04 },
};

describe("3.1 · una enumeración de posiciones del menú nunca es una cantidad (39535)", () => {
  it("«Las 1-2-3 por favor» a un menú de 3: loQueEligio pregunta cuál y NO trae cantidad", () => {
    const r = loQueEligio("Las 1-2-3 por favor", MENU_39535, null, VITRINA, ESCALONES, 3);
    expect(r).toMatchObject({ menuSinElegir: true });
    expect(r).not.toHaveProperty("cantidad");
  });

  it.each([
    "Las 1-2-3 por favor", "las 1, 2 y 3", "1 y 2", "la 1 y la 3", "las 1 y 2", "la 1 y 2 por favor",
    "1-2-3", "todas",
  ])("cantidadDelTexto(«%s») con el menú arriba no es cantidad", (texto) => {
    expect(cantidadDelTexto(texto, MENU_39535, null)).toBeNull();
  });

  it("«Todas» y «las 1-2-3» tampoco son cantidad por el respaldo que usa preparar_opciones", () => {
    expect(cantidadPedidaPorElCliente("Las 1-2-3 por favor", MENU_39535)).toBeNull();
    expect(cantidadPedidaPorElCliente("Todas", MENU_39535)).toBeNull();
  });

  it("sin cantidad dicha, el 4 de la ficha sigue mandando para el menú (no se pisa con 1)", () => {
    const r = cantidadParaPrepararOpciones({
      declarada: null, guardada: 4, textoActual: "Las 1-2-3 por favor", ultimoMensajeNuestro: MENU_39535,
    });
    expect(r).toMatchObject({ cantidad: 4, origen: "ficha", guardar: false });
  });
});

describe("3.1 · lo sano no se mueve", () => {
  it("«2» pelado = la opción 2 del menú (39565), no dos llantas", () => {
    expect(cantidadDelTexto("2", MENU_39535, null)).toBeNull();
    expect(loQueEligio("2", MENU_39535, null, VITRINA, ESCALONES, 3)).toMatchObject({ codigo: "K503B600" });
  });
  it("«La 1» = la opción 1 (39991), sin cantidad", () => {
    expect(cantidadDelTexto("La 1", MENU_39535, null)).toBeNull();
    expect(loQueEligio("La 1", MENU_39535, null, VITRINA, ESCALONES, 3)).toMatchObject({ codigo: "2257016WRMAXCLAWAT" });
  });
  it("las cantidades dichas con sustantivo siguen contando", () => {
    expect(extractExplicitQuantity("Necesito 4 llantas 225/70R16 para un Gran Vitara")).toBe(4);
    expect(extractExplicitQuantity("dos llantas")).toBe(2);
    expect(cantidadDelTexto("2 llantas", MENU_39535, null)).toBe(2);
    expect(cantidadDelTexto("4 llantas", MENU_39535, null)).toBe(4);
    expect(cantidadDelTexto("deme las 4 llantas", MENU_39535, null)).toBe(4);
  });
  it("«4 llantas / Quiero» a un menú abierto: pregunta cuál y SÍ guarda las 4 (auditoría 19-oct, 28606)", () => {
    const r = loQueEligio("4 llantas\nQuiero", MENU_39535, null, VITRINA, ESCALONES, 3);
    expect(r).toMatchObject({ menuSinElegir: true, cantidad: 4 });
  });
  it("la lista con precios también cuenta como menú (MARCA_DE_LA_LISTA)", () => {
    expect(MENU_39535.toLowerCase()).toContain(MARCA_DE_LA_LISTA);
    expect(cantidadDelTexto("Las 1-2-3 por favor", MENU_39535, null)).toBeNull();
  });
});

describe("3.2 · el ancho de la medida no es una cantidad (39337, 33574, 38251)", () => {
  it.each([
    ["39337 (con salto de línea)", "Buenas tardes necesito\n235:75+15 r"],
    ["39337 (en una línea)", "Buenas tardes necesito 235:75+15 r"],
    ["33574", "Pero quiero la 235 70 rind 16"],
    ["38251", "Son 16, creo, la número en 65"],
    ["ancho pegado a otra cifra", "necesito 265 65 17"],
    ["ancho con puntos", "necesito 205.55.16"],
    ["ancho con guion", "quiero 195-65-15"],
  ])("%s: cantidadGrandePedida es null", (_caso, texto) => {
    expect(cantidadGrandePedida(texto)).toBeNull();
    expect(cantidadPedidaPorElCliente(texto, null)).toBeNull();
  });

  it("el tope absurdo baja a 100: 235 ya no es cantidad, 20 sí", () => {
    expect(cantidadGrandePedida("quiero 235 llantas")).toBeNull();
    expect(cantidadGrandePedida("necesito 150 llantas")).toBeNull();
    expect(cantidadGrandePedida("necesito 100 llantas")).toBe(100);
    expect(cantidadGrandePedida("necesito 20 llantas")).toBe(20);
  });

  it("lo sano: «necesito 20 llantas 235/75» sigue siendo 20", () => {
    expect(cantidadGrandePedida("necesito 20 llantas 235/75")).toBe(20);
    expect(cantidadGrandePedida("Necesito 20 llantas 235/75R15")).toBe(20);
    expect(cantidadGrandePedida("deme 12 llantas")).toBe(12);
    expect(cantidadGrandePedida("quiero 16 llantas")).toBe(16);
    expect(cantidadGrandePedida("25 % de descuento: quiero 20 llantas")).toBe(20);
  });

  it("preparar_opciones no guarda 235 por el respaldo textual (39337 end to end)", () => {
    const r = cantidadParaPrepararOpciones({
      declarada: null, guardada: null,
      textoActual: "Buenas tardes necesito\n235:75+15 r\nPara una camioneta de trabajo", ultimoMensajeNuestro: "¿Qué medida usa? Ej: 225/65R17",
    });
    expect(r).toMatchObject({ cantidad: 4, origen: "default", guardar: false });
  });
});

describe("3.3 · «Dos por fa» después de cotización + menú sigue contestando al menú (39601)", () => {
  const cot = (): FilaDelHilo => ({ role: "assistant", content: "Cotización COT-MW6IUXU8 enviada por $776.92", metadata: { piece: "quote", quoteNumber: "COT-MW6IUXU8" } });
  const lamina = (): FilaDelHilo => ({ role: "assistant", content: "Opciones enviadas: FALKEN ZIEX CT60 A/S · KENDA KR628 · WINRUN MAXCLAW A/T", metadata: { piece: "options", cantidad: 4 } });
  const listaTexto = (): FilaDelHilo => ({ role: "assistant", content: "1 · WINRUN … 2 · KENDA … 3 · FALKEN …", metadata: {} });
  const pregunta = (): FilaDelHilo => ({
    role: "assistant", content: "¿Le cotizo la 1, la 2 o la 3?",
    metadata: { oferta: { tipo: "oferta_de_cotizar", clase: "menu", opciones: 3 } },
  });
  const cliente = (t: string): FilaDelHilo => ({ role: "user", content: t });

  it("hilo real: texto 275 → cotización → lámina 235 → menú → «Dos por fa»: el menú de 3 sigue vivo", () => {
    const leida = ofertaVigente([
      cliente("275 70 R16 buenos días precio por favor d ese rin"), cliente("[foto LT235/70R16]"),
      cot(), lamina(), listaTexto(), pregunta(), cliente("Dos por fa"),
    ]);
    expect(leida.oferta).toMatchObject({ clase: "menu", opciones: 3 });
    expect(opcionesDelMenuAbierto(leida)).toBe(3);
  });

  it("la cotización que viene DESPUÉS de la oferta sí la mata", () => {
    const leida = ofertaVigente([cliente("hola"), lamina(), pregunta(), cot(), cliente("gracias")]);
    expect(leida.oferta).toBeNull();
  });

  it("el cierre de una cotización que suena a oferta (sin lámina en medio) sigue muerto", () => {
    const cierre: FilaDelHilo = {
      role: "assistant", content: "¿Se la cotizo?",
      metadata: { oferta: { tipo: "oferta_de_cotizar", clase: "una" } },
    };
    const leida = ofertaVigente([cliente("cotice"), cot(), cierre, cliente("si")]);
    expect(leida.oferta).toBeNull();
  });

  it("loQueEligio con el menú vivo atrapa «Dos por fa» y pregunta cuál, sin leerlo como 2 llantas", () => {
    const r = loQueEligio("Dos por fa", MENU_39535, null, VITRINA, ESCALONES, 3);
    expect(r).toMatchObject({ menuSinElegir: true });
    expect(r).not.toHaveProperty("cantidad");
  });
});

describe("cantidadValidaDeLaFicha · un solo lector de la cantidad de la ficha", () => {
  it.each([[1, 1], [4, 4], [20, 20], [100, 100], ["4", 4]])("%s → %s", (entra, sale) => {
    expect(cantidadValidaDeLaFicha(entra)).toBe(sale);
  });
  it.each([185, 205, 103, 16.5, 235, 0, -1, 101, 500, null, undefined, "", "abc", NaN])(
    "%s no es cantidad (de las 7 fichas sucias de producción — 185, 205, 103, 16, 97, 235, 235 — el filtro frena 5)",
    (entra) => { expect(cantidadValidaDeLaFicha(entra)).toBeNull(); },
  );
  it("16 y 97 SÍ caben en 1..100 (son enteros): lo que los frena es que no se escriban más — el candado de escritura y de lectura de anchos", () => {
    expect(cantidadValidaDeLaFicha(16)).toBe(16);
    expect(cantidadValidaDeLaFicha(97)).toBe(97);
  });
  it("esAnchoDeLlanta: 125–355 múltiplo de 5", () => {
    for (const n of [125, 185, 205, 235, 265, 355]) expect(esAnchoDeLlanta(n)).toBe(true);
    for (const n of [120, 130 + 1, 360, 16, 97, 100]) expect(esAnchoDeLlanta(n)).toBe(false);
  });
});

describe("3.2 · números pegados a otras cifras sin nombrar la unidad", () => {
  it.each([
    "Son 16, creo, la número en 65", "quiero 15 en 205 55",
  ])("«%s» no es una cantidad", (t) => { expect(cantidadGrandePedida(t)).toBeNull(); });
  it.each([
    ["necesito 20", 20], ["quiero 12 llantas 205/55R16", 12], ["deme 24 unidades", 24],
    ["necesito 10 rin 16", 10], ["quiero 12 rin 15", 12], ["necesito 10 aro 14", 10], ["necesito 24 rin 22.5", 24],
    ["son 20 para 10 carros", 20], ["necesito 12 para el 15 de noviembre", 12], ["necesito 10, mi presupuesto es 900", 10],
  ])("«%s» sí (%s)", (t, n) => { expect(cantidadGrandePedida(t as string)).toBe(n); });
});

describe("3.4 · la cantidad que no es el juego se dice dentro de la confirmación", () => {
  const base = "La opción 1, *KENDA KR601* — *$181.69 c/u con IVA*. Le dejo la cotización 👍";
  it("1, 2, 3 y más de 8 se nombran; 4 a 8 no", () => {
    expect(conLaCantidadDicha(base, 1)).toBe(base.replace("Le dejo la cotización 👍", "Le dejo la cotización por *1 llanta* 👍"));
    expect(conLaCantidadDicha(base, 3)).toContain("por *3 llantas* 👍");
    expect(conLaCantidadDicha(base, 20)).toContain("por *20 llantas* 👍");
    for (const n of [4, 5, 8]) expect(conLaCantidadDicha(base, n)).toBe(base);
  });
  it("una frase sin la cola conocida recibe el aviso en su línea, sin perderlo", () => {
    expect(conLaCantidadDicha("Listo, le cotizo la *X* 👍", 2)).toBe("Listo, le cotizo la *X* 👍\nAquí le mando la cotización con *2 llantas* 👍");
  });
});
