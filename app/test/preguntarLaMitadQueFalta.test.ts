/**
 * CUANDO FALTA MEDIA MEDIDA, SE PIDE ESA MITAD — no la medida entera otra vez.
 *
 * Auditoría del 8 al 11-sep-2026. Tres chats donde el cliente había dicho casi
 * todo y el bot contestó como si no hubiera dicho nada:
 *
 *   Conv 18677: «¿Dispone llantas MT 30.5 r15?» → KENDA KR29 215/75R15 y «es
 *   la única que tengo para lo que me pidió».
 *   Conv 17668: «65 R 17» → opciones de aro 17 sin medida, y después una
 *   cotización de 4 FALKEN ZE310 215/40R17 por $511.96.
 *   Conv 18468: «185/64 R15 88H» → lo trató como medida real sin stock y
 *   ofreció 185/65R15 como «equivalente», cuando el 64 no existe.
 *
 * Con el ancho del cliente ya en la mano, preguntar «¿me da la medida?» hace
 * que el cliente repita lo que ya escribió. Lo que falta es UNA cosa y hay que
 * nombrarla.
 */
import { beforeAll, describe, expect, it } from "vitest";

let loQueFaltaDeLaMedida: (texto: string) => string | null;

beforeAll(async () => {
  process.env.WHATSAPP_TOKEN ||= "test";
  process.env.WHATSAPP_APP_SECRET ||= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
  process.env.WHATSAPP_PHONE_ID ||= "test";
  process.env.SELLER_PHONE ||= "593000000000";
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
  ({ loQueFaltaDeLaMedida } = await import("../src/domain/tireSize.js"));
});

describe("qué mitad de la medida falta", () => {
  it("la flotación sin ancho nombra el diámetro y el aro que sí dio", () => {
    const falta = loQueFaltaDeLaMedida("¿Dispone llantas MT 30.5 r15?");
    expect(falta).toContain("30.5");
    expect(falta).toContain("15");
    expect(falta).toMatch(/ancho/i);
  });

  it("el perfil y el aro sin ancho piden el ancho", () => {
    const falta = loQueFaltaDeLaMedida("65 R 17");
    expect(falta).toMatch(/ancho/i);
    expect(falta).toContain("17");
  });

  it("un perfil que no existe lo dice con todas las letras", () => {
    const falta = loQueFaltaDeLaMedida("185/64 R15 88H");
    expect(falta).toContain("64");
    expect(falta).toMatch(/no existe|revisar|confirm/i);
  });

  it("dos anchos posibles piden elegir uno", () => {
    const falta = loQueFaltaDeLaMedida("Llantas 200 x 175 R16");
    expect(falta).toContain("200");
    expect(falta).toContain("175");
  });

  it("una medida completa no tiene nada que pedir", () => {
    for (const texto of ["265/70R17", "32x10.50 Rin 15", "235,75r15", "Rin 14 60 195"]) {
      expect(loQueFaltaDeLaMedida(texto), texto).toBeNull();
    }
  });

  it("un mensaje sin medida tampoco: eso se pregunta con la guía de siempre", () => {
    for (const texto of ["Hola, quiero información", "Rin 15", "¿cuánto cuesta?", ""]) {
      expect(loQueFaltaDeLaMedida(texto), texto).toBeNull();
    }
  });
});
