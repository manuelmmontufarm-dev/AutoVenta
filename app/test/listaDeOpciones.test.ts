import { describe, expect, it } from "vitest";
import {
  armarLista, hechoDeLaLista, listaDeLaPieza, preguntaDeLaLista, textoDeLaLista,
} from "../src/domain/listaDeOpciones.js";
import { esRespuestaDelMenuDePreferencia, escalonContestado, esPedidoDeAmbasOpciones } from "../src/domain/salesIntent.js";

// quoteMessages importa config.ts, que exige estas variables al cargarse.
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_lista_opciones";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";
const { buildCierreOpciones } = await import("../src/services/quoteMessages.js");

/**
 * Familia «después de la lámina el cliente nunca ve un precio escrito» (~25
 * chats, caso +593 99 571 0785, D-Max 255/70R16). El cierre de la pieza era el
 * menú «¿qué prioriza usted?»; ahora es la lista con precios y una sola
 * pregunta: «¿Le cotizo la 1, la 2 o la 3?».
 */
const tres = [
  { nombre: "FALKEN WILDPEAK", precio: 171.2, codigo: "F1" },
  { nombre: "WINRUN R380", precio: 96.5, codigo: "W1" },
  { nombre: "KENDA KR50", precio: 127.93, codigo: "K1" },
];

describe("armarLista", () => {
  it("ordena de menor a mayor: la 1 es Costo, la 2 Equilibrio, la 3 Premium", () => {
    const lista = armarLista(tres, 4)!;
    expect(lista.map((l) => l.nombre)).toEqual(["WINRUN R380", "KENDA KR50", "FALKEN WILDPEAK"]);
    expect(lista.map((l) => l.n)).toEqual([1, 2, 3]);
  });

  it("el total es unitario × la cantidad del cliente (4 si no dijo)", () => {
    expect(armarLista(tres, 4)![1].total).toBe(511.72);
    expect(armarLista(tres, 6)![0].total).toBe(579);
  });

  it("una sola opción, o una sin precio, no arma lista (esas son otras rutas)", () => {
    expect(armarLista([tres[0]], 4)).toBeNull();
    expect(armarLista([tres[0], { nombre: "X", precio: 0, codigo: "X" }], 4)).toBeNull();
    // tres escalones con el mismo código son UNA opción
    expect(armarLista([tres[0], tres[0], tres[0]], 4)).toBeNull();
  });
});

describe("el texto de la lista", () => {
  it("una línea `1 · Marca Modelo — $X c/u · 4 = $Y` por opción y UNA pregunta al final", () => {
    const t = textoDeLaLista(armarLista(tres, 4)!, 4);
    expect(t).toBe([
      "1 · WINRUN R380 — $96.50 c/u · 4 = $386.00",
      "2 · KENDA KR50 — $127.93 c/u · 4 = $511.72",
      "3 · FALKEN WILDPEAK — $171.20 c/u · 4 = $684.80",
      "",
      "¿Le cotizo la 1, la 2 o la 3?",
    ].join("\n"));
    expect(t.match(/\?/g)).toHaveLength(1);
    expect(t).not.toMatch(/prioriz/i);
  });

  it("la pregunta se adapta al número de opciones", () => {
    expect(preguntaDeLaLista(2)).toBe("¿Le cotizo la 1 o la 2?");
    expect(preguntaDeLaLista(3)).toBe("¿Le cotizo la 1, la 2 o la 3?");
  });
});

describe("buildCierreOpciones con lista", () => {
  const base = { entregarRecomendacion: false, recomendacion: "KENDA KR50", motivo: "buen equilibrio", precioConIva: 127.93 };
  const lista = { lista: armarLista(tres, 4)!, cantidad: 4 };

  it("el cierre sin recomendación es la lista con precios, no el menú de prioridad", () => {
    const cierre = buildCierreOpciones({ ...base, lista });
    expect(cierre).toContain("1 · WINRUN R380 — $96.50 c/u · 4 = $386.00");
    expect(cierre).toContain("¿Le cotizo la 1, la 2 o la 3?");
    expect(cierre).not.toMatch(/prioriza|1\) \*Costo\*/i);
  });

  it("con dos opciones, «la 1 o la 2»", () => {
    const dos = { lista: armarLista(tres.slice(0, 2), 4)!, cantidad: 4 };
    expect(buildCierreOpciones({ ...base, lista: dos })).toContain("¿Le cotizo la 1 o la 2?");
  });

  it("sin lista (precio faltante) cae al menú de siempre", () => {
    expect(buildCierreOpciones({ ...base, lista: null })).toContain("¿qué prioriza usted?");
  });

  it("con recomendación entregada NO se toca: sigue «Yo iría por…»", () => {
    const c = buildCierreOpciones({ ...base, entregarRecomendacion: true, lista });
    expect(c).toContain("Yo iría por la *KENDA KR50*");
    expect(c).not.toContain("1 · WINRUN");
  });
});

describe("el «2» que contesta la lista es el escalón, no una cantidad", () => {
  const cierre = textoDeLaLista(armarLista(tres, 4)!, 4);
  it("lo reconoce como respuesta al menú (con y sin reply)", () => {
    expect(esRespuestaDelMenuDePreferencia("2", cierre)).toBe(true);
    expect(esRespuestaDelMenuDePreferencia("la 3", cierre)).toBe(true);
    expect(esRespuestaDelMenuDePreferencia("2", null, cierre)).toBe(true);
    expect(esRespuestaDelMenuDePreferencia("2", "Le queda a $50 c/u")).toBe(false);
    expect(escalonContestado("2", cierre)).toBe("equilibrada");
  });

  it("«las dos» con dos opciones numeradas con «·» pide ver ambas", () => {
    const dos = textoDeLaLista(armarLista(tres.slice(0, 2), 4)!, 4);
    expect(esPedidoDeAmbasOpciones("las dos", dos)).toBe(true);
  });
});

describe("la lista se reconstruye desde lo que la pieza guardó", () => {
  const escalones = {
    premium: { codigo: "F1", nombre: "FALKEN WILDPEAK", precio_con_iva: 171.2 },
    equilibrada: { codigo: "K1", nombre: "KENDA KR50", precio_con_iva: 127.93 },
    economica: { codigo: "W1", nombre: "WINRUN R380", precio_con_iva: 96.5 },
  };
  it("misma lista y misma cantidad que vio el cliente; 4 si la pieza es vieja", () => {
    expect(listaDeLaPieza({ escalones, cantidad: 6 })!.lista[0].total).toBe(579);
    expect(listaDeLaPieza({ escalones })!.cantidad).toBe(4);
    expect(listaDeLaPieza({ escalones: { premium: escalones.premium, equilibrada: escalones.premium, economica: escalones.premium } })).toBeNull();
    expect(listaDeLaPieza(null)).toBeNull();
  });

  it("el hecho del guardián trae cada precio y total, y protege la pregunta", () => {
    const { lista, cantidad } = listaDeLaPieza({ escalones })!;
    const hecho = hechoDeLaLista(lista, cantidad);
    for (const n of ["$96.50", "$386.00", "$127.93", "$511.72", "$171.20", "$684.80"]) expect(hecho).toContain(n);
    expect(hecho).toContain("¿Le cotizo la 1, la 2 o la 3?");
  });
});
