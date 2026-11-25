/**
 * EL BOT NO RESPONDIÓ: LA CAUSA EN PALABRAS SIMPLES Y CUÁNDO SE AVISA.
 *
 * 24-nov-2026, 16:35–17:58. Se acabó el crédito de OpenAI: 13 chats recibieron
 * «tengo un problema técnico» y a Manuel no le llegó nada al teléfono. Estas
 * son las reglas puras de `domain/falloDelBot.ts`, con el reloj fijo.
 */
import { describe, expect, it } from "vitest";
import {
  CAUSAS_DE_FALLO, CAUSA_EN_SIMPLE, QUE_HACER, PRIMER_RECORDATORIO_MS, RECORDATORIO_SIGUIENTE_MS,
  CALMA_PARA_CERRAR_MS, causaDelFallo, decidirAviso, duracionEnPalabras, puedeCerrarse,
  textoDeCaida, textoDeRecordatorio, textoDeSaldoBajo, textoDeVuelta,
} from "../src/domain/falloDelBot.js";
import { esFalloDelProveedor } from "../src/domain/falloDelProveedor.js";

const T0 = new Date("2026-11-24T21:35:00Z");
const mas = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000;

describe("de qué clase fue el fallo", () => {
  it("el error real del 24-nov es «sin crédito», no «límite de uso»", () => {
    const real = "429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.";
    expect(causaDelFallo(new Error(real))).toBe("sin_credito");
    expect(causaDelFallo(Object.assign(new Error(real), { status: 429 }))).toBe("sin_credito");
    expect(causaDelFallo(Object.assign(new Error("You exceeded your current quota, please check your plan and billing details."), { status: 429, code: "insufficient_quota" }))).toBe("sin_credito");
    expect(causaDelFallo(new Error("insufficient_quota"))).toBe("sin_credito");
  });

  it("un 429 sin nada de crédito es límite de uso: se pasa solo, no hay que recargar", () => {
    expect(causaDelFallo(Object.assign(new Error("429 Rate limit reached for gpt-5.5 in organization"), { status: 429 }))).toBe("limite_de_uso");
    expect(causaDelFallo({ status: 429 })).toBe("limite_de_uso");
  });

  it("clave rechazada, sin respuesta, caído", () => {
    expect(causaDelFallo(Object.assign(new Error("401 Incorrect API key provided: sk-proj-****"), { status: 401 }))).toBe("clave_invalida");
    expect(causaDelFallo({ status: 403 })).toBe("clave_invalida");
    expect(causaDelFallo(new Error("Request timed out."))).toBe("proveedor_sin_respuesta");
    expect(causaDelFallo(new Error("Connection error."))).toBe("proveedor_sin_respuesta");
    expect(causaDelFallo({ status: 503 })).toBe("proveedor_caido");
    expect(causaDelFallo(new Error("500 Internal server error"))).toBe("proveedor_caido");
  });

  it("lo que no se reconoce es un error interno, nunca una causa inventada", () => {
    expect(causaDelFallo(new Error("Cannot read properties of null (reading 'codigo')"))).toBe("error_interno");
    expect(causaDelFallo(new Error("El modelo no devolvió una respuesta (rondas agotadas o texto vacío)"))).toBe("error_interno");
    expect(causaDelFallo(null)).toBe("error_interno");
    expect(causaDelFallo(undefined)).toBe("error_interno");
  });

  it("toda causa tiene su frase simple y su «qué hacer»", () => {
    for (const causa of CAUSAS_DE_FALLO) {
      expect(CAUSA_EN_SIMPLE[causa], causa).toMatch(/\S/);
      expect(QUE_HACER[causa], causa).toMatch(/\S/);
    }
  });

  it("una clave rechazada también es fallo del proveedor: al cliente no se le pide repetir", () => {
    expect(esFalloDelProveedor({ status: 401 })).toBe(true);
    expect(esFalloDelProveedor(new Error("Incorrect API key provided"))).toBe(true);
    // lo de siempre no cambia
    expect(esFalloDelProveedor({ status: 400 })).toBe(false);
    expect(esFalloDelProveedor(new Error("400 Invalid schema for function 'buscar_llanta'"))).toBe(false);
  });
});

describe("cuándo suena el teléfono de soporte", () => {
  it("el primer fallo avisa; los 29 que entran detrás, no", () => {
    expect(decidirAviso({ nuevo: true, ultimoAvisoAt: null, recordatorios: 0 }, T0)).toBe("abrir");
    for (let i = 1; i < 30; i += 1) {
      expect(decidirAviso({ nuevo: false, ultimoAvisoAt: T0, recordatorios: 0 }, mas(i * 20_000)), `fallo ${i}`).toBe("nada");
    }
  });

  it("un recordatorio a la media hora, y después cada dos horas", () => {
    expect(decidirAviso({ nuevo: false, ultimoAvisoAt: T0, recordatorios: 0 }, mas(PRIMER_RECORDATORIO_MS - 1))).toBe("nada");
    expect(decidirAviso({ nuevo: false, ultimoAvisoAt: T0, recordatorios: 0 }, mas(PRIMER_RECORDATORIO_MS))).toBe("recordar");
    const recordado = mas(PRIMER_RECORDATORIO_MS);
    expect(decidirAviso({ nuevo: false, ultimoAvisoAt: recordado, recordatorios: 1 }, new Date(recordado.getTime() + 60 * MIN))).toBe("nada");
    expect(decidirAviso({ nuevo: false, ultimoAvisoAt: recordado, recordatorios: 1 }, new Date(recordado.getTime() + RECORDATORIO_SIGUIENTE_MS))).toBe("recordar");
  });

  it("un acierto no cierra el incidente si los fallos siguen frescos", () => {
    expect(puedeCerrarse(T0, mas(10_000))).toBe(false);
    expect(puedeCerrarse(T0, mas(CALMA_PARA_CERRAR_MS - 1))).toBe(false);
    expect(puedeCerrarse(T0, mas(CALMA_PARA_CERRAR_MS))).toBe(true);
  });
});

describe("lo que lee Manuel", () => {
  it("la caída dice el cliente, la causa, el chat y qué hacer", () => {
    const t = textoDeCaida({ cliente: "Depot Tire", causa: "sin_credito", chat: "Carla Mendoza (593991112233)" });
    expect(t.titulo).toBe("🔴 Depot Tire: el bot no está respondiendo");
    expect(t.cuerpo).toBe("Se acabó el crédito de OpenAI. Chat afectado: Carla Mendoza (593991112233). Recarga en platform.openai.com → Billing.");
  });

  it("el recordatorio cuenta los chats y el tiempo", () => {
    const t = textoDeRecordatorio({ cliente: "Competimotor", causa: "sin_credito", chatsAfectados: 13, desde: T0, ahora: mas(35 * MIN) });
    expect(t.titulo).toBe("🔴 Competimotor: el bot SIGUE sin responder");
    expect(t.cuerpo).toContain("Van 13 chats sin respuesta en 35 min");
  });

  it("la vuelta dice cuánto duró y cuántos quedaron esperando", () => {
    const t = textoDeVuelta({ cliente: "Depot Tire", causa: "sin_credito", chatsAfectados: 12, desde: T0, ahora: mas(83 * MIN) });
    expect(t.titulo).toBe("🟢 Depot Tire: el bot volvió a responder");
    expect(t.cuerpo).toBe("Estuvo sin responder 1 h 23 min (se acabó el crédito de openai). 12 chats quedaron sin respuesta: revísalos en el panel.");
  });

  it("el saldo bajo dice cuánto queda, y «unos» cuando es una estimación", () => {
    expect(textoDeSaldoBajo({ cliente: "Depot Tire", restanteUsd: 2.4, umbralUsd: 3, aproximado: false }).cuerpo)
      .toContain("Quedan $2.40 de crédito de OpenAI (aviso por debajo de $3.00)");
    expect(textoDeSaldoBajo({ cliente: "Depot Tire", restanteUsd: 2.4, umbralUsd: 3, aproximado: true }).cuerpo)
      .toContain("Quedan unos $2.40");
    expect(textoDeSaldoBajo({ cliente: "Depot Tire", restanteUsd: -1, umbralUsd: 3, aproximado: false }).cuerpo)
      .toContain("ya no queda crédito");
  });

  it("las duraciones se leen como las diría una persona", () => {
    expect(duracionEnPalabras(20_000)).toBe("menos de 1 min");
    expect(duracionEnPalabras(35 * MIN)).toBe("35 min");
    expect(duracionEnPalabras(120 * MIN)).toBe("2 h");
    expect(duracionEnPalabras(83 * MIN)).toBe("1 h 23 min");
  });
});
