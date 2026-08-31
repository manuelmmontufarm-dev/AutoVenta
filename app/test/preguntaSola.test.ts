import { describe, expect, it } from "vitest";
import { esSoloPregunta, conPreguntaEnSuPropioMensaje } from "../src/domain/preguntaSola.js";

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

/**
 * Producción, 31-ago 20:07 (Manuel probando): mandó «y en llantas 185/70R15 qué
 * cuesta» mientras salía el turno anterior, y el bot siguió con «¿a cuál local
 * le queda mejor?» — cerrando un turno que el cliente ya había dejado atrás.
 * Ese bloque se puede callar; un bloque con datos, jamás.
 */
describe("esSoloPregunta — qué se puede callar cuando el cliente ya siguió", () => {
  it.each([
    "¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍",
    "¿Qué día cree que puede pasar? Le aviso al asesor para que le atienda apenas llegue. 📅",
    "¿Le queda alguna otra duda? Ahí le esperamos. 🤝",
    "¿Me dice la medida, o prefiere mandarme una foto del costado y la leo yo? 📸",
  ])("«%s» es solo cierre", (bloque) => {
    expect(esSoloPregunta(bloque)).toBe(true);
  });

  it.each([
    "Cotización COT-MTHO6QN8 enviada por $391.89",
    "Yo iría por la *KENDA KR20* — $91.28 c/u con IVA: es la equilibrada. ¿Le sirve?",
    "Opciones enviadas: FALKEN ZE310R · KENDA KR20 · WINRUN R330",
    "Para *185/70R15* no me aparece stock exacto disponible en este momento.",
  ])("«%s» NO se calla: trae datos", (bloque) => {
    expect(esSoloPregunta(bloque)).toBe(false);
  });

  it("un párrafo largo con una pregunta al final tampoco se calla", () => {
    const largo = "Le cuento que la Falken es japonesa, con cinco años de garantía de fábrica contra defectos y doce meses de seguro contra golpes, y además incluye instalación, alineación y balanceo sin costo en cualquiera de los dos locales. ¿Le interesa?";
    expect(esSoloPregunta(largo)).toBe(false);
  });
});
