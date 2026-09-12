/**
 * AL QUE NO PUEDE VENIR NO SE LE MANDAN MAPAS NI SE LE PIDE UN DÍA.
 *
 * El cliente dice dónde está, el bot lo entiende, y aun así el turno sale con
 * los dos mapas de Quito o con «¿qué día puede pasar?». En la auditoría del 8
 * al 11-sep:
 *
 *   conv 17934 · «Soy de Guayaquil» → al día siguiente el seguimiento le
 *                reenvió los dos mapas.
 *   conv 18025 · «Soy de TULCÁN ya le molestare gracias» → mapas de Quito en
 *                el mismo turno, y otra vez al día siguiente.
 *   conv 18603 · «No viajo a Quito» → el seguimiento volvió a mandar el mapa
 *                de Quito Sur.
 *   conv 18302 · «Yo vivo en santo domingo» → el bot le asignó Quito Sur «como
 *                lo más práctico» y 3 h después el seguimiento repitió la
 *                pregunta del día.
 *   conv 18262 · pidió envío a San Lorenzo → los dos seguimientos insistieron
 *                con «a cuál local le queda mejor ir», con mapas.
 *
 * El que anuncia que sube a Quito es otra cosa y sí puede coordinar (conv
 * 18821), así que el corte no es «está lejos» sino «no puede pasar».
 */
import { describe, expect, it } from "vitest";
import { sinVisitaNiMapas } from "../src/domain/visitaImposible.js";

const MAPAS = "📍 *Depot Tire Cumbayá*: https://maps.app.goo.gl/abc\n📍 *Depot Tire Quito Sur*: https://maps.app.goo.gl/def";

describe("el turno para quien no puede pasar por el local", () => {
  it("conv 17934 y 18025: se van los mapas", () => {
    const texto = `Con gusto, muchas gracias a usted.\n---\n${MAPAS}`;
    const r = sinVisitaNiMapas(texto);
    expect(r.texto).not.toContain("maps.app.goo.gl");
    expect(r.texto).toContain("Con gusto");
    expect(r.quitado).toBe(true);
  });

  it("conv 18302: se va la pregunta del día de visita", () => {
    const r = sinVisitaNiMapas("Entiendo.\n---\n¿Qué día cree que puede pasar por *Depot Tire Quito Sur*? 📅");
    expect(r.texto).not.toMatch(/qué día/i);
    expect(r.quitado).toBe(true);
  });

  it("conv 18262: se va la pregunta del local", () => {
    const r = sinVisitaNiMapas("Sí, se puede coordinar envío por Servientrega.\n---\n¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍");
    expect(r.texto).not.toMatch(/cuál local/i);
    expect(r.texto).toContain("Servientrega");
  });

  it("lo demás del turno se respeta: no se borra la respuesta", () => {
    const r = sinVisitaNiMapas(`La *KENDA KR29* queda en *$181.71 c/u con IVA*.\n---\n${MAPAS}`);
    expect(r.texto).toContain("KENDA KR29");
    expect(r.texto).toContain("181.71");
  });

  it("un turno que no habla de visita ni mapas queda igual", () => {
    const texto = "La garantía de fábrica es de 5 años contra defectos.";
    const r = sinVisitaNiMapas(texto);
    expect(r.texto).toBe(texto);
    expect(r.quitado).toBe(false);
  });

  it("si el turno ERA solo la pregunta, queda vacío y no se manda (conv 18106)", () => {
    // Ahí la respuesta de verdad —«En Guayaquil no tenemos local»— ya salió en
    // su propio mensaje; lo que sobra es el mensaje aparte con la pregunta.
    const r = sinVisitaNiMapas("¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍");
    expect(r.texto.trim()).toBe("");
    expect(r.quitado).toBe(true);
  });
});
