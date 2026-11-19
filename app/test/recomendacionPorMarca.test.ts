/**
 * QUÉ LLANTAS VAN PRIMERO EN COMPETIMOTOR (reunión 18-nov-2026, min. 00:00–01:46).
 *
 * Sobre el catálogo REAL del cliente: `fixtures/competimotor-medidas-06nov.json`
 * son las filas de 7 medidas del Excel de Fénix que Jenny mandó el 6-nov
 * (`INVENTARIO_06NOV_fenix.xls`), leídas con el lector de `fuentes/archivo.ts`
 * tal cual (código, marca, diseño, medida, stock y precio con IVA).
 *
 * La regla: Falken + Winrun + Kenda (una por marca) + 1 de mayor inventario
 * entre las demás; «qué más tiene» → el resto, hasta 10 en total.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POLITICA_MUNDILLANTAS } from "../src/negocio/politicas/mundillantas.js";
import { POLITICA_DEPOT } from "../src/negocio/politicas/depot.js";
import {
  escalonesDelConjunto,
  marcaNombradaEnLaMedida,
  masOpciones,
  pideMasOpciones,
  primeraRecomendacion,
  recomendacionDeLaMedida,
} from "../src/domain/recomendacionPorMarca.js";
import { opcionesQueAlcanzan } from "../src/domain/opcionesCandados.js";

interface Fila { code: string; brand: string; design: string; sizeLabel: string; stock: number; precioConIva: number }
const FILAS = JSON.parse(
  readFileSync(new URL("./fixtures/competimotor-medidas-06nov.json", import.meta.url), "utf8"),
) as Fila[];
const enLaMedida = (medida: string) =>
  FILAS.filter((f) => f.sizeLabel === medida).map((f) => ({ ...f, minimumPriceWithTax: f.precioConIva }));
/** Lo vendible para `cantidad` llantas: la regla de stock que YA existe (`opcionesQueAlcanzan`). */
const vendibles = (medida: string, cantidad = 4) => opcionesQueAlcanzan(enLaMedida(medida), cantidad);
const REGLA = POLITICA_MUNDILLANTAS.recomendacionPorMarca!;
const marcas = (xs: readonly { brand: string }[]) => xs.map((x) => x.brand);
const codigos = (xs: readonly { code: string }[]) => xs.map((x) => x.code);

describe("la regla es de Competimotor, no de Depot", () => {
  it("Mundillantas la trae; Depot no (su escalera Falken/Kenda/Winrun queda igual)", () => {
    expect(REGLA).toEqual({ marcasPrimero: ["FALKEN", "WINRUN", "KENDA"], extrasPorInventario: 1, topeConMasOpciones: 10, porLamina: 6 });
    expect(POLITICA_DEPOT.recomendacionPorMarca).toBeUndefined();
  });
});

describe("primera lámina de una medida", () => {
  it("265/70R16 — están las tres marcas y más: Falken, Winrun, Kenda + la de mayor inventario (Townhall, 23)", () => {
    const sel = primeraRecomendacion(vendibles("265/70R16"), REGLA);
    expect(marcas(sel)).toEqual(["FALKEN", "WINRUN", "KENDA", "TOWNHALL"]);
    // Kenda tiene dos modelos: KR608 (8) y KR628 (2, no alcanza el juego) → la KR608.
    expect(codigos(sel)).toEqual(["A0082", "A0562", "A0300", "A0497"]);
  });

  it("265/70R17 — Falken con tres modelos: va el de MÁS stock (Wildpeak M/T, 8); Kenda con tres empatados en 4: la más barata", () => {
    const sel = primeraRecomendacion(vendibles("265/70R17"), REGLA);
    expect(marcas(sel)).toEqual(["FALKEN", "WINRUN", "KENDA", "TOURADOR"]);
    expect(sel.map((p) => p.design)).toEqual(["WILDPEAK M/T", "MAXCLAW A/T", "KR608", "FORCE AT II LB"]);
    // Tourador tiene dos filas (21 y 9): una sola opción por marca, la de 21.
    expect(sel[3].stock).toBe(21);
  });

  it("235/75R15 — falta Winrun: no se nombra ni se rellena; empate de inventario (Goodyear 11 = Townhall 11) → la más barata", () => {
    const sel = primeraRecomendacion(vendibles("235/75R15"), REGLA);
    expect(marcas(sel)).toEqual(["FALKEN", "KENDA", "TOWNHALL"]);
    expect(sel.find((p) => p.brand === "TOWNHALL")?.precioConIva).toBe(116.15);
  });

  it("205/55R16 — falta Falken: Winrun + Kenda + Townhall (31)", () => {
    expect(marcas(primeraRecomendacion(vendibles("205/55R16"), REGLA))).toEqual(["WINRUN", "KENDA", "TOWNHALL"]);
  });

  it("215/65R16 — Falken y Winrun tienen 2 y piden 4: no alcanzan (regla de stock de siempre) → menos de 4 opciones", () => {
    const sel = primeraRecomendacion(vendibles("215/65R16"), REGLA);
    expect(marcas(sel)).toEqual(["KENDA", "TOWNHALL"]);
  });

  it("215/65R16 con 2 llantas pedidas: las dos SÍ alcanzan y entran", () => {
    const sel = primeraRecomendacion(vendibles("215/65R16", 2), REGLA);
    expect(marcas(sel)).toEqual(["FALKEN", "WINRUN", "KENDA", "TOWNHALL"]);
  });

  it("205/60R16 — solo Falken de las tres: Falken + la de mayor inventario", () => {
    expect(marcas(primeraRecomendacion(vendibles("205/60R16"), REGLA))).toEqual(["FALKEN", "TOWNHALL"]);
  });

  it("el resultado no depende del orden en que vino el Excel", () => {
    const al = vendibles("265/70R17");
    expect(codigos(primeraRecomendacion([...al].reverse(), REGLA))).toEqual(codigos(primeraRecomendacion(al, REGLA)));
  });
});

describe("«qué más tiene»", () => {
  it("265/70R17 — 13 vendibles: tras las 4 de la primera salen 6 más (10 en total) y ninguna repetida", () => {
    const al = vendibles("265/70R17");
    expect(al).toHaveLength(13);
    const primera = new Set(codigos(primeraRecomendacion(al, REGLA)));
    const mas = masOpciones(al, REGLA, primera);
    expect(mas).toHaveLength(6);
    expect(mas.some((p) => primera.has(p.code))).toBe(false);
    // De mayor a menor inventario: Townhall 17 primero.
    expect(mas[0]).toMatchObject({ brand: "TOWNHALL", stock: 17 });
    // Y con las 10 ya vistas, el tope se cumple: no hay tercera lámina.
    expect(masOpciones(al, REGLA, new Set([...primera, ...codigos(mas)]))).toEqual([]);
  });

  it("205/55R16 — 9 vendibles (menos de 10): tras las 3 de la primera salen las 6 que quedan, todas", () => {
    const al = vendibles("205/55R16");
    const primera = new Set(codigos(primeraRecomendacion(al, REGLA)));
    const mas = masOpciones(al, REGLA, primera);
    expect(primera.size + mas.length).toBe(al.length);
    expect(marcas(mas)).toEqual(expect.arrayContaining(["MAXXIS", "GOODYEAR", "XBRI", "HAIDA"]));
  });

  it("«algo más barato»: lo nuevo va de la más barata a la más cara", () => {
    const al = vendibles("265/70R17");
    const primera = new Set(codigos(primeraRecomendacion(al, REGLA)));
    const r = recomendacionDeLaMedida(al, REGLA, { texto: "tiene algo más barato?", yaMostrados: primera });
    expect(r.modo).toBe("mas");
    const precios = r.opciones.map((p) => p.precioConIva);
    expect(precios).toEqual([...precios].sort((a, b) => a - b));
  });

  it("los pedidos de más se reconocen; elegir del menú no es pedir más", () => {
    for (const t of ["qué más tiene", "Que mas tiene?", "otra marca", "algo más barato", "más opciones", "tiene otras opciones?", "qué otras hay", "y algo mas economico?"]) {
      expect(pideMasOpciones(t), t).toBe(true);
    }
    for (const t of ["la más barata", "la 2", "ok", "precio", "215/65R16", "me quedo con la kenda"]) {
      expect(pideMasOpciones(t), t).toBe(false);
    }
  });
});

describe("el cliente pide una marca concreta", () => {
  it("«tiene Maxxis?» en 205/55R16: se le contesta Maxxis, la regla de las tres no la tapa", () => {
    const r = recomendacionDeLaMedida(vendibles("205/55R16"), REGLA, { texto: "tiene Maxxis?" });
    expect(r).toMatchObject({ modo: "marca", marca: "MAXXIS" });
    expect(marcas(r.opciones)).toEqual(["MAXXIS"]);
  });

  it("una marca que no está en esa medida no cuenta como pedida (sigue la primera lámina)", () => {
    expect(marcaNombradaEnLaMedida("tiene michelin?", vendibles("205/55R16"))).toBeNull();
    expect(recomendacionDeLaMedida(vendibles("205/55R16"), REGLA, { texto: "tiene michelin?" }).modo).toBe("primera");
  });

  it("sin marca y sin pedir más: primera lámina", () => {
    const r = recomendacionDeLaMedida(vendibles("265/70R16"), REGLA, { texto: "215/65r16 precio?" });
    expect(r.modo).toBe("primera");
    expect(r.opciones).toHaveLength(4);
  });
});

describe("la lista escrita con más de 3 opciones", () => {
  const cuatro = [
    { nombre: "FALKEN WILDPEAK A/T 4W", precio: 282.9, codigo: "A0082" },
    { nombre: "WINRUN MAXCLAW A/T", precio: 178.25, codigo: "A0562" },
    { nombre: "KENDA KR608", precio: 295.55, codigo: "A0300" },
    { nombre: "TOWNHALL TH-AT802", precio: 147.2, codigo: "A0497" },
  ];

  it("Depot (tope 3 de siempre): con 4 no hay lista; con 3 sale numerada y «¿Le cotizo la 1, la 2 o la 3?»", async () => {
    const { armarLista, textoDeLaLista } = await import("../src/domain/listaDeOpciones.js");
    expect(armarLista(cuatro, 4)).toBeNull();
    const tres = armarLista(cuatro.slice(0, 3), 4)!;
    expect(textoDeLaLista(tres, 4)).toBe(
      "1 · WINRUN MAXCLAW A/T — $178.25 c/u · 4 = $713.00\n2 · FALKEN WILDPEAK A/T 4W — $282.90 c/u · 4 = $1131.60\n3 · KENDA KR608 — $295.55 c/u · 4 = $1182.20\n\n¿Le cotizo la 1, la 2 o la 3?",
    );
  });

  it("con la regla por marca: 4 con viñetas, de la más barata a la más cara, y «¿Cuál le cotizo?»", async () => {
    const { armarLista, textoDeLaLista } = await import("../src/domain/listaDeOpciones.js");
    const lista = armarLista(cuatro, 4, REGLA.porLamina)!;
    expect(textoDeLaLista(lista, 4)).toBe(
      "• TOWNHALL TH-AT802 — $147.20 c/u · 4 = $588.80\n• WINRUN MAXCLAW A/T — $178.25 c/u · 4 = $713.00\n• FALKEN WILDPEAK A/T 4W — $282.90 c/u · 4 = $1131.60\n• KENDA KR608 — $295.55 c/u · 4 = $1182.20\n\n¿Cuál le cotizo?",
    );
  });

  it("la pieza guarda las 4 en `metadata.lista` y de ahí la leen Guardián y seguimientos; no hay «posición 4»", async () => {
    const { listaDeLaPieza, opcionPorPosicion } = await import("../src/domain/listaDeOpciones.js");
    const metadata = {
      cantidad: 4,
      escalones: { premium: { codigo: "A0300", nombre: "KENDA KR608", precio_con_iva: 295.55 } },
      lista: cuatro.map((o) => ({ codigo: o.codigo, nombre: o.nombre, precio_con_iva: o.precio })),
    };
    expect(listaDeLaPieza(metadata)?.lista.map((l) => l.codigo)).toEqual(["A0497", "A0562", "A0082", "A0300"]);
    expect(opcionPorPosicion(metadata, 1)).toBeNull();
  });
});

describe("escalones dentro del conjunto", () => {
  it("con 4 opciones: una sola premium (la más cara), una sola económica (la más barata), el resto equilibrio", () => {
    const sel = primeraRecomendacion(vendibles("265/70R16"), REGLA);
    const esc = escalonesDelConjunto(sel);
    // Falken 282.90 · Winrun 178.25 · Kenda 295.55 · Townhall 147.20
    expect(esc.get("A0300")).toBe("premium");
    expect(esc.get("A0497")).toBe("economica");
    expect(esc.get("A0082")).toBe("equilibrio");
    expect(esc.get("A0562")).toBe("equilibrio");
  });
});
