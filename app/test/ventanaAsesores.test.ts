import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
// Solo se prueban funciones puras; la URL existe porque config la exige al importar.
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { debeAvisarVentana, mensajeVentana } = await import("../src/services/advisorWindow.js");

/**
 * La regla del recordatorio, sin base de datos ni reloj real.
 *
 * Lo que se prueba es lo que decidió el negocio el 8-ago: en vez de pagar
 * plantillas aprobadas, avisar a tiempo para que alguien le pida al asesor que
 * escriba. Un recordatorio que llega tarde no sirve, y uno que llega cada
 * quince minutos se silencia — los dos bordes están aquí.
 */
const AHORA = new Date("2026-08-08T15:00:00.000Z");
const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3_600_000);

describe("cuándo pedir que reabran la ventana del asesor", () => {
  it("quien nunca escribió no puede recibir nada: se avisa de una", () => {
    expect(debeAvisarVentana({ ventana_hasta: null, ventana_avisada_en: null }, AHORA))
      .toBe("nunca_escribio");
  });

  it("con la ventana holgada no se molesta a nadie", () => {
    expect(debeAvisarVentana({ ventana_hasta: enHoras(20), ventana_avisada_en: null }, AHORA))
      .toBeNull();
  });

  it("avisa cuando faltan menos de 3 h, que es cuando todavía se puede hacer algo", () => {
    expect(debeAvisarVentana({ ventana_hasta: enHoras(2.5), ventana_avisada_en: null }, AHORA))
      .toBe("por_vencer");
  });

  it("distingue la ya vencida: el mensaje que toca es otro", () => {
    expect(debeAvisarVentana({ ventana_hasta: enHoras(-1), ventana_avisada_en: null }, AHORA))
      .toBe("vencida");
  });

  it("no repite el recordatorio dentro del mismo día", () => {
    expect(debeAvisarVentana(
      { ventana_hasta: enHoras(1), ventana_avisada_en: enHoras(-2) },
      AHORA,
    )).toBeNull();
  });

  it("pasado el día vuelve a insistir: la ventana sigue cerrada", () => {
    expect(debeAvisarVentana(
      { ventana_hasta: enHoras(1), ventana_avisada_en: enHoras(-21) },
      AHORA,
    )).toBe("por_vencer");
  });
});

describe("el texto del recordatorio", () => {
  it("dice a quién escribirle, qué pedirle y a qué número", () => {
    const texto = mensajeVentana(
      { nombre: "Joaquín Tamayo", ventana_hasta: enHoras(2) },
      "por_vencer",
      AHORA,
    );
    expect(texto).toMatch(/Joaquín Tamayo/);
    expect(texto).toMatch(/2 h/);
    expect(texto).toMatch(/cualquier mensaje/i);
    expect(texto).toMatch(/\+593 98 280 1766/);
  });

  it("a quien nunca escribió no le habla de tiempo restante", () => {
    const texto = mensajeVentana(
      { nombre: "Joaquín Tamayo", ventana_hasta: null },
      "nunca_escribio",
      AHORA,
    );
    expect(texto).toMatch(/no puede recibir avisos/i);
    expect(texto).not.toMatch(/quedan/i);
  });

  // El que lee esto no tiene por qué saber qué es una ventana de 24 h ni un
  // 131047: si el mensaje no dice qué hacer, es una queja, no un aviso.
  it("nunca menciona el código de error de Meta", () => {
    for (const motivo of ["nunca_escribio", "por_vencer", "vencida"] as const) {
      const texto = mensajeVentana({ nombre: "X", ventana_hasta: enHoras(1) }, motivo, AHORA);
      expect(texto).not.toMatch(/131047|Meta|ventana de 24/i);
      expect(texto).toMatch(/👉/);
    }
  });
});
