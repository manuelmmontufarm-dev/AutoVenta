/**
 * «Yo le aviso»: el seguimiento automático no sale. Auditoría 13–18 sep,
 * familia 3, con los mensajes reales de los clientes.
 */
import { describe, expect, it } from "vitest";
import { elClienteDijoQueAvisa } from "../src/domain/clientePosterga.js";

describe("elClienteDijoQueAvisa", () => {
  it.each([
    "yo le contacto",
    "Yo le aviso",
    "le avisaré",
    "Estaré en contacto",
    "ya le paso",
    "cuando pueda le envío",
    "Le aviso más adelante",
    "Ok gracias yo le aviso",
    "cualquier cosa le escribo",
    "Yo me comunico con ustedes",
  ])("«%s» posterga", (t) => expect(elClienteDijoQueAvisa(t)).toBe(true));

  it.each([
    "le aviso el lunes a qué hora paso",
    "¿me avisa cuando llegue la llanta?",
    "Ok",
    "Gracias",
    "205/55R16",
    "mañana le confirmo",
    "Cumbayá",
  ])("«%s» no", (t) => expect(elClienteDijoQueAvisa(t)).toBe(false));
});
