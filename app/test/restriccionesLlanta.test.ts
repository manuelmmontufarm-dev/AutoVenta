import { describe, expect, it } from "vitest";
import {
  hechosDeRestricciones,
  restriccionesDeLlanta,
  violaRestriccionesDeLlanta,
} from "../src/domain/restriccionesLlanta.js";

describe("memoria de medidas rechazadas", () => {
  it("recuerda el ancho rechazado por roce/consumo", () => {
    const r = restriccionesDeLlanta([
      "no, gracias, 205 muy ancha; con el auto cargado rozan y consume más",
    ]);
    expect(r.anchosRechazados).toEqual([205]);
    expect(violaRestriccionesDeLlanta("205/55R16", r)).toBe(true);
    expect(violaRestriccionesDeLlanta("195/60R16", r)).toBe(false);
  });

  it("la decisión posterior y explícita del cliente rehabilita el ancho", () => {
    const r = restriccionesDeLlanta([
      "205 muy ancha, me roza",
      "ya revisé: deme la 205/55R16",
    ]);
    expect(r.anchosRechazados).toEqual([]);
  });

  // Producción, 31-ago-2026, conv 3 c20 (Manuel Montufar): estos dos mensajes
  // son textuales de la base. El primero no registraba nada («no me gusta» no
  // estaba en el patrón) y el turno siguiente reenvió dos 185.
  it("EL CASO DE MANUEL: «ya no 185 no me gusta» rechaza el 185", () => {
    const r = restriccionesDeLlanta([
      "sabe que esta muy ya no 185 no me gusta que otras tiene",
    ]);
    expect(r.anchosRechazados).toEqual([185]);
    expect(violaRestriccionesDeLlanta("185/65R15", r)).toBe(true);
    expect(violaRestriccionesDeLlanta("195/55R15", r)).toBe(false);
  });

  it("el segundo mensaje de Manuel también rechaza, y el rin 15 no se confunde con un ancho", () => {
    const r = restriccionesDeLlanta([
      "que no quiero 185 que otras tiene que son rin 15",
    ]);
    expect(r.anchosRechazados).toEqual([185]);
  });

  it("EL CASO QUE NO DEBE DISPARAR: hablar de una medida sin rechazarla no la veta", () => {
    expect(restriccionesDeLlanta(["me gusta la kenda en 185/65R15"]).anchosRechazados).toEqual([]);
    expect(restriccionesDeLlanta(["necesito 185/65R15 para mi aveo"]).anchosRechazados).toEqual([]);
  });

  it("EL BORDE: «ya no» pegado a un número también cuenta como rechazo", () => {
    const r = restriccionesDeLlanta(["ya no 205, busco algo mas angosto"]);
    expect(r.anchosRechazados).toContain(205);
  });
});

/**
 * O07 del corpus T115, medido el 31-ago-2026 en dos corridas seguidas:
 *   CLIENTE: «205/50R16»
 *   CLIENTE: «No quiero perfil tan bajo por los baches»
 *   BOT:     [pieza de opciones] «En 205/50R16 ya tiene opciones desde $85.72»
 * La memoria guardaba anchos y el perfil no era ninguno: el rechazo del 50 se
 * perdía y la misma medida volvía con precio. Es la conv 11620 de producción
 * por el otro eje de la medida.
 */
describe("el perfil rechazado por bajo se recuerda", () => {
  it("«no quiero perfil tan bajo» tras 205/50R16 veta los perfiles menores a 51", () => {
    const r = restriccionesDeLlanta(["205/50R16", "No quiero perfil tan bajo por los baches"]);
    expect(r.perfilMinimo).toBe(51);
    expect(violaRestriccionesDeLlanta("205/50R16", r)).toBe(true);
    expect(violaRestriccionesDeLlanta("205/45R16", r)).toBe(true);
    expect(violaRestriccionesDeLlanta("205/60R16", r)).toBe(false);
  });

  it("la frase real de la conv 11620 también cuenta", () => {
    const r = restriccionesDeLlanta(["195/50R16", "No, muy bajo el perfil, cada bache estresa el aro"]);
    expect(r.perfilMinimo).toBe(51);
  });

  it("sin medida sobre la mesa no inventa un veto", () => {
    expect(restriccionesDeLlanta(["no quiero perfil tan bajo"]).perfilMinimo).toBeNull();
  });

  it("hablar del perfil sin rechazarlo no veta nada", () => {
    expect(restriccionesDeLlanta(["205/50R16", "¿qué perfil tiene?"]).perfilMinimo).toBeNull();
  });

  it("si el cliente vuelve a pedir esa medida, el veto se levanta", () => {
    const r = restriccionesDeLlanta([
      "205/50R16",
      "No quiero perfil tan bajo por los baches",
      "mejor sí dame la 205/50R16",
    ]);
    expect(r.perfilMinimo).toBeNull();
    expect(violaRestriccionesDeLlanta("205/50R16", r)).toBe(false);
  });

  it("el hecho para el modelo nombra las dos restricciones", () => {
    const r = restriccionesDeLlanta(["205/50R16", "la 205 es muy ancha y no quiero perfil tan bajo"]);
    const hecho = hechosDeRestricciones(r) ?? "";
    expect(hecho).toMatch(/205/);
    expect(hecho).toMatch(/perfil/);
  });
});
