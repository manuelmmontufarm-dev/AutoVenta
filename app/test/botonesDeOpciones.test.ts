/**
 * Botones 1 / 2 / 3 en la pregunta de la lista (Competimotor, 20-nov-2026).
 *
 * Manuel, en la capacitación con Carlos: que la lista de opciones cierre con
 * botones para tocar en vez de escribir el número. Reglas que se prueban:
 *  - solo con la perilla `politica.botonesDeOpciones` (Competimotor sí, Depot no);
 *  - máximo 3 botones, títulos de ≤ 20 caracteres, cuerpo = el bloque entero
 *    (la lista con sus precios va escrita);
 *  - el toque entra como «la N», que los lectores de siempre leen como la
 *    opción N y NUNCA como N llantas;
 *  - un toque a un mensaje de otro ciclo no elige nada.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LISTA = [
  "1 · KENDA KR29 — $95.00 c/u · 4 = $380.00",
  "2 · WINRUN R330 — $110.00 c/u · 4 = $440.00",
  "3 · FALKEN WILDPEAK A/T3W — $140.00 c/u · 4 = $560.00",
  "",
  "¿Le cotizo la 1, la 2 o la 3?",
].join("\n");
const LISTA_DOS = ["1 · KENDA KR29 — $95.00 c/u · 4 = $380.00", "2 · FALKEN ZE310 — $140.00 c/u · 4 = $560.00", "", "¿Le cotizo la 1 o la 2?"].join("\n");
const REPREGUNTA = "¿Cuál le cotizo, la 1, la 2 o la 3?";
const VITRINA = [
  { codigo: "ECO", marca: "Kenda", diseno: "KR29" },
  { codigo: "MED", marca: "Winrun", diseno: "R330" },
  { codigo: "PRE", marca: "Falken", diseno: "Wildpeak A/T3W" },
];
const ESCALONES = {
  economica: { codigo: "ECO", nombre: "KENDA KR29", precio_con_iva: 95 },
  equilibrada: { codigo: "MED", nombre: "WINRUN R330", precio_con_iva: 110 },
  premium: { codigo: "PRE", nombre: "FALKEN WILDPEAK A/T3W", precio_con_iva: 140 },
};

type Botones = typeof import("../src/domain/botones.js");
let b: Botones;
let loQueEligio: typeof import("../src/services/cotizarLoElegido.js").loQueEligio;
let cantidadDelTexto: typeof import("../src/domain/salesIntent.js").cantidadDelTexto;
beforeAll(async () => {
  process.env.WHATSAPP_TOKEN ||= "test";
  process.env.WHATSAPP_APP_SECRET ||= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
  process.env.WHATSAPP_PHONE_ID ||= "test";
  process.env.SELLER_PHONE ||= "593000000000";
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
  b = await import("../src/domain/botones.js");
  ({ loQueEligio } = await import("../src/services/cotizarLoElegido.js"));
  ({ cantidadDelTexto } = await import("../src/domain/salesIntent.js"));
});

const CICLO = 7;
const con = { ciclo: CICLO, botonesDeOpciones: true };

describe("la lista numerada lleva botones con la perilla prendida", () => {
  it("tres opciones → tres botones con el nombre de cada llanta", () => {
    const r = b.botonesParaBloque(LISTA, con);
    expect(r?.cuerpo).toBe(LISTA);
    expect(r?.botones.map((x) => x.id)).toEqual(["opcion:1:c7", "opcion:2:c7", "opcion:3:c7"]);
    expect(r?.botones[0].titulo).toBe("1 · KENDA KR29");
    for (const boton of r!.botones) expect(b.recortarTitulo(boton.titulo).length).toBeLessThanOrEqual(b.MAX_TITULO);
  });

  it("la pregunta sola en su bloque toma los nombres de la lista del bloque anterior (así sale en Competimotor)", () => {
    const [lista, , pregunta] = [LISTA.split("\n\n")[0], "", "¿Le cotizo la 1, la 2 o la 3?"];
    const r = b.botonesParaBloque(pregunta, { ...con, bloquesAnteriores: ["Opciones enviadas", lista] });
    expect(r?.cuerpo).toBe(pregunta);
    expect(r?.botones.map((x) => b.recortarTitulo(x.titulo))).toEqual(["1 · KENDA KR29", "2 · WINRUN R330", "3 · FALKEN WILDPEAK…"]);
  });

  it("dos opciones → dos botones", () => {
    expect(b.botonesParaBloque(LISTA_DOS, con)?.botones.map((x) => x.id)).toEqual(["opcion:1:c7", "opcion:2:c7"]);
  });

  it("la repregunta sin la lista también lleva botones («Opción N»)", () => {
    expect(b.botonesParaBloque(REPREGUNTA, con)?.botones.map((x) => x.titulo)).toEqual(["Opción 1", "Opción 2", "Opción 3"]);
  });

  it("con la perilla apagada (Depot) sale como texto", () => {
    expect(b.botonesParaBloque(LISTA, { ciclo: CICLO, botonesDeOpciones: false })).toBeNull();
  });

  it("un cuerpo de más de 1024 caracteres no se manda con botones (Meta lo rechaza)", () => {
    const largo = `${"x".repeat(1100)}\n${LISTA}`;
    expect(b.botonesParaBloque(largo, con)).toBeNull();
  });

  it("con más de 3 opciones (lista con viñetas, «¿Cuál le cotizo?») no hay botones", () => {
    expect(b.botonesParaBloque("• KENDA\n• WINRUN\n• FALKEN\n• MAXXIS\n\n¿Cuál le cotizo?", con)).toBeNull();
  });
});

describe("el toque es «la N»: elige la opción, no la cantidad", () => {
  it.each([[1, "ECO"], [2, "MED"], [3, "PRE"]] as const)("tocar el %i cotiza %s", (n, codigo) => {
    const texto = b.textoDeBoton(`opcion:${n}:c7`, `${n} · X`, CICLO);
    expect(texto).toBe(`la ${n}`);
    // El toque cita el mensaje de los botones: `mensajeCitado` es la lista.
    expect(loQueEligio(texto, "otra cosa que dijo el bot", LISTA, VITRINA, ESCALONES, 3)).toMatchObject({ codigo });
    expect(cantidadDelTexto(texto, null, LISTA)).toBeNull();
  });

  it("un toque a un mensaje de otro ciclo no elige", () => {
    const texto = b.textoDeBoton("opcion:2:c3", "2 · WINRUN R330", CICLO);
    expect(texto).not.toMatch(/\b[1-3]\b/);
    expect(loQueEligio(texto, LISTA, null, VITRINA, ESCALONES, 3)).toBeNull();
  });
});

describe("la perilla vive en la política de cada cliente", () => {
  const leer = (id: string) => readFileSync(resolve(__dirname, `../src/negocio/politicas/${id}.ts`), "utf8");
  it("Competimotor la tiene prendida", () => {
    expect(leer("mundillantas")).toMatch(/botonesDeOpciones:\s*true/);
  });
  it("Depot no la tiene (sale como texto, igual que antes)", () => {
    expect(leer("depot")).not.toMatch(/botonesDeOpciones/);
  });
});
