/**
 * EL SEGUIMIENTO LEE LOS HECHOS DEL CICLO ANTES DE REDACTAR (auditoría
 * 19-oct-2026, familia 6 — 98 chats, 175 borradores).
 *
 * «¿Le mando las opciones que tengo en su medida?» se redactó 175 veces cuando
 * la lámina de opciones YA había salido; el Guardián la corrigió 174 (se paga
 * el borrador y la corrección) y en 29752 y 28783 salió tal cual. La plantilla
 * miraba la etapa («nuevo», «medida confirmada») y no la pieza enviada.
 *
 * Los hechos que manda: la pieza `options` del ciclo (`optionsCount`,
 * `optionsList`), la cotización (`quoteNumber`), el día y el local de la visita.
 */
import { describe, expect, it } from "vitest";
import { buildContextualFollowUpMessage } from "../src/domain/followUpMessages.js";
import { ofertaEnElTexto } from "../src/domain/ofertaVigente.js";

const enQuito = (iso: string) => new Date(`${iso}-05:00`);

/** 29752: la lámina que el bot ya había mandado (Sun 18-oct 22:10). */
const LAMINA_29752 = {
  cantidad: 4,
  lista: [
    { n: 1, codigo: "KR33A", nombre: "KENDA KR33A", precio: 130.97, total: 523.88 },
    { n: 2, codigo: "KR100", nombre: "KENDA KR100", precio: 150.24, total: 600.96 },
  ],
};
const LAMINA_DE_LA_PIEZA = [
  { codigo: "KR33A", marca: "KENDA", diseno: "KR33A", medida: "215/75R16" },
  { codigo: "KR100", marca: "KENDA", diseno: "KR100", medida: "215/75R16" },
];

describe("con la lámina ya enviada no se ofrece mandarla", () => {
  for (const kind of ["in_window_first", "in_window_second"] as const) {
    it(`29752 (${kind}): etapa «medida confirmada» + lámina de 2 → pregunta cuál le cotizo`, () => {
      const texto = buildContextualFollowUpMessage({
        stage: "medida_confirmada",
        tireSize: "195/85R16",
        optionsCount: 2,
        optionsList: LAMINA_29752,
      }, kind);
      expect(texto).not.toMatch(/le mando las opciones/i);
      expect(texto).toContain("¿Le cotizo la 1 o la 2?");
      // Y el hecho de oferta que se guarda con el mensaje es el menú de dos.
      expect(ofertaEnElTexto(texto, LAMINA_DE_LA_PIEZA)).toMatchObject({ clase: "menu", opciones: 2 });
    });
  }

  it("29752 en el simulador: la lámina era de EQUIVALENTES (215/75R16) → no se nombra la medida pedida", () => {
    for (const kind of ["in_window_first", "in_window_second"] as const) {
      const texto = buildContextualFollowUpMessage({
        stage: "medida_confirmada",
        tireSize: "195/85R16",
        optionsCount: 2,
        optionsList: LAMINA_29752,
        optionsEquivalentes: true,
      }, kind);
      expect(texto, kind).not.toContain("195/85R16");
      expect(texto, kind).toMatch(/equivalentes/);
    }
  });

  it("etapa «nuevo» con lámina de 3 y sin precios guardados → «¿Le cotizo la 1, la 2 o la 3?»", () => {
    const texto = buildContextualFollowUpMessage({
      stage: "nuevo",
      tireSize: "205/55R16",
      optionsCount: 3,
    }, "in_window_first");
    expect(texto).not.toMatch(/le mando las opciones/i);
    expect(texto).toContain("¿Le cotizo la 1, la 2 o la 3?");
  });

  it("aro solo («Rin 15»), sin medida guardada, con lámina → no pide la medida, pregunta cuál", () => {
    const texto = buildContextualFollowUpMessage({ stage: "nuevo", optionsCount: 3 }, "in_window_first");
    expect(texto).not.toMatch(/me confirma la medida|me falta la medida/i);
    expect(texto).toContain("¿Le cotizo la 1, la 2 o la 3?");
  });

  it("una sola llanta en la lámina → «¿se la cotizo?» y el hecho guardado es `una`", () => {
    const texto = buildContextualFollowUpMessage({
      stage: "nuevo",
      tireSize: "195/60R14",
      optionsCount: 1,
    }, "in_window_first");
    expect(texto).not.toMatch(/le mando las opciones/i);
    expect(texto).toMatch(/¿se la cotizo\?/i);
    expect(ofertaEnElTexto(texto, [LAMINA_DE_LA_PIEZA[0]])).toMatchObject({ clase: "una" });
  });
});

describe("sin lámina enviada", () => {
  it("28783: sin juego en su medida (había 1 llanta) no se ofrecen «las opciones que tengo en su medida»", () => {
    for (const kind of ["in_window_first", "in_window_second"] as const) {
      const texto = buildContextualFollowUpMessage({
        stage: "nuevo",
        tireSize: "195/60R14",
        optionsCount: null,
        juegoEnSuMedida: false,
      }, kind);
      expect(texto, kind).not.toMatch(/opciones que tengo en su medida/i);
      expect(texto, kind).toMatch(/equivalente/i);
    }
  });

  it("caso sano: con juego disponible y sin lámina, el ofrecimiento sigue", () => {
    const texto = buildContextualFollowUpMessage({
      stage: "nuevo",
      tireSize: "205/55R16",
      optionsCount: null,
      juegoEnSuMedida: true,
    }, "in_window_first");
    expect(texto).toMatch(/le mando las opciones/i);
  });

  it("la pregunta por la medida no saluda con 👋 dentro de una conversación viva (46 de 86 corregidas por eso)", () => {
    const texto = buildContextualFollowUpMessage({ stage: "nuevo" }, "in_window_first");
    expect(texto).not.toContain("👋");
    expect(texto).toMatch(/medida/);
  });
});

describe("la visita: «no alcanzó a pasar» se dice al día siguiente", () => {
  // 6145: «Mañana» dicho el viernes 16 → visita el sábado 17 (10:00 de relleno).
  const base = {
    stage: "seguimiento_venta" as const,
    tireSize: "195/50R15",
    nearestStore: "Depot Tire Cumbayá",
    customerCommitment: "mañana",
    visitDate: enQuito("2026-10-17T10:00:00"),
    quoteNumber: "COT-MVB49JAK",
  };

  it("6145: a las 12:37 del sábado 17 el seguimiento dice «hoy», no «no alcanzó a pasar»", () => {
    for (const kind of ["in_window_first", "in_window_second"] as const) {
      const texto = buildContextualFollowUpMessage(base, kind, enQuito("2026-10-17T12:37:00"));
      expect(texto, kind).not.toMatch(/no alcanz|le esperábamos|no pudimos/i);
      expect(texto, kind).toMatch(/\bhoy\b/i);
    }
  });

  it("al día siguiente sí: «no alcanzó a pasar»", () => {
    const texto = buildContextualFollowUpMessage(base, "in_window_first", enQuito("2026-10-18T09:00:00"));
    expect(texto).toMatch(/no alcanzó a pasar/);
  });

  it("caso sano: la víspera, día y local confirmados → «✅ Perfecto, le esperamos el sábado 17 de octubre»", () => {
    const texto = buildContextualFollowUpMessage(base, "in_window_first", enQuito("2026-10-16T13:31:00"));
    expect(texto).toContain("✅ Perfecto, le esperamos el *sábado 17 de octubre*");
  });
});

describe("seguimiento de visita sin local elegido", () => {
  const nombres = ["Depot Tire Cumbayá", "Depot Tire Quito Sur"];

  it("no pregunta «¿le ayudo a dejar lista la visita?» (49 de 49 corregidas): pregunta el local", () => {
    const texto = buildContextualFollowUpMessage({
      stage: "seguimiento_venta",
      tireSize: "205/55R16",
      storeNames: nombres,
    }, "in_window_first");
    expect(texto).not.toMatch(/dejar lista la visita/i);
    expect(texto).toContain("Cumbayá");
    expect(texto).toContain("Quito Sur");
  });

  it("ni el segundo pregunta el día antes que el local (34 de 56 corregidas)", () => {
    const texto = buildContextualFollowUpMessage({
      stage: "seguimiento_venta",
      tireSize: "205/55R16",
      storeNames: nombres,
    }, "in_window_second");
    expect(texto).not.toMatch(/qu[eé] d[ií]a/i);
    expect(texto).toContain("Quito Sur");
  });
});
