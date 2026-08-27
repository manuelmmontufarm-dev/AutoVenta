import { describe, expect, it } from "vitest";
import { conPreguntaEnSuPropioMensaje } from "../src/domain/preguntaSola.js";

const bloques = (t: string) => t.split(/\n\s*-{3,}\s*\n/);

describe("la pregunta final sale en su propio mensaje", () => {
  it("la separa del párrafo que la traía pegada", () => {
    const r = conPreguntaEnSuPropioMensaje(
      "Claro, *Depot Tire Cumbayá* ya quedó anotado. ¿Qué día cree que puede pasar? 📅",
    );
    expect(r.separada).toBe(true);
    expect(bloques(r.texto)).toEqual([
      "Claro, *Depot Tire Cumbayá* ya quedó anotado.",
      "¿Qué día cree que puede pasar? 📅",
    ]);
  });

  it("se lleva el emoji con la pregunta, no lo deja huérfano", () => {
    const r = conPreguntaEnSuPropioMensaje("Listo. ¿A cuál local le queda mejor ir? 📍");
    expect(bloques(r.texto)[1]).toBe("¿A cuál local le queda mejor ir? 📍");
  });

  it("si el bloque YA es solo la pregunta, no toca nada", () => {
    const solo = "¿Qué día cree que puede pasar? 📅";
    expect(conPreguntaEnSuPropioMensaje(solo)).toEqual({ texto: solo, separada: false });
  });

  it("sin pregunta al final no toca nada", () => {
    const t = "Perfecto: *sábado 29 de agosto en Depot Tire Cumbayá*. Ya quedó registrado.";
    expect(conPreguntaEnSuPropioMensaje(t)).toEqual({ texto: t, separada: false });
  });

  it("una pregunta a mitad de párrafo se queda donde está", () => {
    const t = "¿Le sirve para carretera? Sí, y además rinde más en ciudad.";
    expect(conPreguntaEnSuPropioMensaje(t).separada).toBe(false);
  });

  it("se lleva la coletilla que va detrás del signo (la pregunta de cierre)", () => {
    const r = conPreguntaEnSuPropioMensaje(
      "Perfecto: *domingo 30 de agosto en Depot Tire Cumbayá*. Ya quedó registrado para el asesor.\n\n" +
      "¿Le queda alguna otra duda? Ahí le esperamos. 🤝",
    );
    expect(r.separada).toBe(true);
    expect(bloques(r.texto)[1]).toBe("¿Le queda alguna otra duda? Ahí le esperamos. 🤝");
  });

  it("pero un párrafo entero detrás del signo NO se arrastra", () => {
    const t =
      "Le cuento. ¿Le sirve para carretera? Sí, y además rinde bastante más en ciudad, " +
      "sobre todo si maneja a diario y hace trayectos cortos con mucho semáforo.";
    expect(conPreguntaEnSuPropioMensaje(t).separada).toBe(false);
  });

  it("respeta el tope de bloques soltando el más viejo, nunca la pregunta", () => {
    const t = ["uno", "dos", "tres", "cuatro. ¿Qué día cree que puede pasar? 📅"].join("\n---\n");
    const r = conPreguntaEnSuPropioMensaje(t, 4);
    const bs = bloques(r.texto);
    expect(bs).toHaveLength(4);
    expect(bs[bs.length - 1]).toBe("¿Qué día cree que puede pasar? 📅");
    expect(bs).not.toContain("uno");
  });

  it("respeta los bloques que ya existían", () => {
    const t = "Primero esto.\n---\nY luego. ¿Qué día cree que puede pasar? 📅";
    expect(bloques(conPreguntaEnSuPropioMensaje(t).texto)).toEqual([
      "Primero esto.", "Y luego.", "¿Qué día cree que puede pasar? 📅",
    ]);
  });
});
