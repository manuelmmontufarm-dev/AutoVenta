import { describe, expect, it } from "vitest";
import { Resvg } from "@resvg/resvg-js";

/**
 * Las piezas del chat se abren rápido (22-nov-2026): memoria de 30 min por
 * mensaje, versión chica para la burbuja y la miniatura de una foto fuera de
 * la lista de mensajes (que se refresca cada pocos segundos).
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_no_se_conecta";

const { achicarPieza, guardarPieza, medidasDelPng, olvidarPiezas, piezaEnMemoria } = await import("../src/services/piezasDelChat.js");
const { sinMiniatura } = await import("../src/services/hubData.js");

const pngDe = (ancho: number, alto: number): Buffer =>
  Buffer.from(new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}"><rect width="100%" height="100%" fill="#c8102e"/></svg>`).render().asPng());

describe("piezas del chat", () => {
  it("la versión chica mide 560 px de ancho y conserva la proporción", () => {
    const grande = pngDe(1080, 1350);
    expect(medidasDelPng(grande)).toEqual({ ancho: 1080, alto: 1350 });
    const chica = achicarPieza(grande, 560);
    expect(medidasDelPng(chica)).toEqual({ ancho: 560, alto: 700 });
    expect(chica.length).toBeLessThan(grande.length * 1.01);
  });

  it("una pieza que ya es chica, o algo que no es PNG, se devuelve tal cual", () => {
    const chica = pngDe(400, 300);
    expect(achicarPieza(chica, 560)).toBe(chica);
    const basura = Buffer.from("no soy una imagen, pero no puedo tumbar el chat");
    expect(achicarPieza(basura, 560)).toBe(basura);
    expect(medidasDelPng(basura)).toBeNull();
  });

  it("la memoria devuelve la pieza durante 30 min y después la olvida", () => {
    olvidarPiezas();
    const png = pngDe(10, 10);
    guardarPieza("7:chica", png, 1_000);
    expect(piezaEnMemoria("7:chica", 1_000 + 29 * 60_000)).toBe(png);
    expect(piezaEnMemoria("7:chica", 1_000 + 31 * 60_000)).toBeNull();
    expect(piezaEnMemoria("8:chica")).toBeNull();
  });

  it("la memoria no crece sin tope: guarda las 40 más recientes", () => {
    olvidarPiezas();
    const png = pngDe(4, 4);
    for (let i = 0; i < 45; i += 1) guardarPieza(`${i}:grande`, png);
    expect(piezaEnMemoria("0:grande")).toBeNull();
    expect(piezaEnMemoria("44:grande")).toBe(png);
  });

  it("la lista de mensajes no carga la miniatura de la foto, pero dice que existe", () => {
    const meta = { adjunto: "foto", autor: "Ana", miniatura: `data:image/jpeg;base64,${"A".repeat(60_000)}` };
    expect(sinMiniatura(meta)).toEqual({ adjunto: "foto", autor: "Ana", tieneMiniatura: true });
    const otro = { piece: "quote" };
    expect(sinMiniatura(otro)).toBe(otro);
    expect(sinMiniatura(null)).toEqual({});
  });
});
