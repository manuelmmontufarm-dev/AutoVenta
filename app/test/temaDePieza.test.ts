import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

/**
 * EL TEMA DE LA COTIZACIÓN (Manuel, 24-nov-2026): «que también puedas elegir la
 * template de cómo sale, tipo que salga con promo de Black Friday o la de
 * Navidad… o una editable que puedan cambiar todo lo que quieran».
 * Es una cinta de color arriba de la cotización y las opciones; no toca precios.
 */
process.env.NEGOCIO = "depot";
process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://test@localhost/test";

const T = await import("../src/domain/temaDePieza.js");
const { PiecesConfigSchema } = await import("../src/services/settings.js");
const { renderPreviewPiece } = await import("../src/render/preview.js");

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe("qué cinta lleva la pieza", () => {
  it("automático y sin tema: ninguna (todo sale como hoy)", () => {
    expect(T.cintaDelTema({ id: "automatico" })).toBeNull();
    expect(T.cintaDelTema({ id: "ninguno" })).toBeNull();
    expect(T.cintaDelTema(null)).toBeNull();
    expect(T.cintaDelTema({ id: "inventado" as never })).toBeNull();
  });

  it("Navidad: la cinta lista", () => {
    expect(T.cintaDelTema({ id: "navidad" })?.titulo).toBe("FELIZ NAVIDAD");
  });

  it("tema Black Friday con la franja del Black Friday ya en la pieza: no se repite", () => {
    expect(T.cintaDelTema({ id: "blackFriday" }, { hayFranjaDeTemporada: true })).toBeNull();
    expect(T.cintaDelTema({ id: "blackFriday" }, { hayFranjaDeTemporada: false })?.titulo).toBe("BLACK FRIDAY");
    // Otro tema sí va aunque esté la franja (Navidad + Black Friday extendido).
    expect(T.cintaDelTema({ id: "navidad" }, { hayFranjaDeTemporada: true })).not.toBeNull();
  });

  it("personalizado: lo que escriba el negocio, recortado y con colores válidos", () => {
    const d = T.cintaDelTema({
      id: "personalizado",
      personalizado: { titulo: "  Feria   de llantas " + "x".repeat(40), bajada: "Solo este sábado", fondo: "rojo", texto: "#FFFFFF", acento: "#00ff00", adorno: "corazones" as never },
    });
    expect(d?.titulo.length).toBe(T.TITULO_MAXIMO);
    expect(d?.titulo.startsWith("Feria de llantas")).toBe(true);
    expect(d?.fondo).toBe(T.PERSONALIZADO_INICIAL.fondo);
    expect(d?.texto).toBe("#ffffff");
    expect(d?.adorno).toBe(T.PERSONALIZADO_INICIAL.adorno);
  });

  it("personalizado vacío (sin título ni texto): no se dibuja una cinta muda", () => {
    expect(T.cintaDelTema({ id: "personalizado", personalizado: { ...T.PERSONALIZADO_INICIAL, titulo: "", bajada: "" } })).toBeNull();
  });
});

describe("Ajustes → Piezas lo guarda", () => {
  it("lo guardado antes de los temas queda en «automático»", () => {
    const cfg = PiecesConfigSchema.parse({ modo: "dia", fuente: "barlow", paleta: "depot", plantilla: "diaNoche", promocion: { modo: "porcentaje" } });
    expect(cfg.tema.id).toBe("automatico");
    expect(cfg.tema.personalizado).toEqual(T.PERSONALIZADO_INICIAL);
  });

  it("guarda el elegido y limpia el personalizado", () => {
    const cfg = PiecesConfigSchema.parse({ tema: { id: "personalizado", personalizado: { titulo: "Aniversario 30", fondo: "#123456" } } });
    expect(cfg.tema.id).toBe("personalizado");
    expect(cfg.tema.personalizado.titulo).toBe("Aniversario 30");
    expect(cfg.tema.personalizado.fondo).toBe("#123456");
    expect(() => PiecesConfigSchema.parse({ tema: { id: "halloween" } })).toThrow();
  });
});

describe("la pieza de verdad", () => {
  it("automático dibuja EXACTAMENTE la misma pieza que antes; Navidad la cambia (las dos plantillas)", async () => {
    for (const plantilla of ["diaNoche", "clasica"]) {
      for (const pieza of ["cotizacion", "opciones"]) {
        const base = { pieza, plantilla, modo: "dia", paleta: "depot", fuente: "barlow" };
        const sinTema = sha(await renderPreviewPiece(base));
        expect(sha(await renderPreviewPiece({ ...base, tema: { id: "automatico" } }))).toBe(sinTema);
        expect(sha(await renderPreviewPiece({ ...base, tema: { id: "navidad" } }))).not.toBe(sinTema);
      }
    }
  }, 120_000);
});
