/**
 * UN «GRACIAS» NO ES UN CHAT OLVIDADO.
 *
 * El rescate retoma los chats que el asesor dejó sin contestar más de 12 h.
 * Mira si hay un mensaje del cliente sin respuesta después, y nada más — así
 * que una despedida cuenta como pendiente.
 *
 * Tres de los cinco rescates de la auditoría del 8 al 11-sep cayeron sobre
 * despedidas, y los tres repreguntaron algo ya resuelto:
 *
 *   conv 404 · CLIENTE: «Muchas gracias organizaré mi presupuesto estaremos en
 *              contacto» · ASESOR: «CLaro que si le esperamos» · CLIENTE:
 *              «Igualmente» → 18 h después el bot: «¿A cuál local le queda
 *              mejor ir?» (y ya sabían desde agosto que está en el Valle).
 *   conv 6468 · «voy a la del sur… el fin de semana» + «Gracias» → el bot
 *              volvió a preguntar el local y el fin de semana.
 *   conv 16872 · el asesor ya había mandado el mapa y el cliente confirmó «El
 *              sábado entre las 10 estoy dónde ustedes» → el bot repreguntó
 *              el local y el cliente tuvo que escribir «Quito sur» otra vez.
 *   conv 18294 · el asesor cerró y el cliente dijo «Gracias» → 12 h después el
 *              bot contestó «Con gusto, quedo atento» a ese agradecimiento.
 *
 * Lo que los distingue de un chat de verdad olvidado es el ÚLTIMO mensaje del
 * cliente: si se despidió, o si ya hay una visita anotada, no hay nada que
 * rescatar.
 */
import { describe, expect, it } from "vitest";
import { mereceRescate } from "../src/domain/rescateDeChat.js";

describe("a quién vale la pena rescatar", () => {
  const base = { visitaRegistrada: false, ultimoDelCliente: "¿me cotiza 205/55R16?" };

  it("un cliente con una pregunta sin responder, sí", () => {
    expect(mereceRescate(base).rescatar).toBe(true);
    expect(mereceRescate({ ...base, ultimoDelCliente: "sigue disponible?" }).rescatar).toBe(true);
  });

  it("conv 404 y 18294: una despedida o un agradecimiento, no", () => {
    for (const t of [
      "Muchas gracias organizaré mi presupuesto estaremos en contacto",
      "Igualmente",
      "Gracias",
      "Ok gracias",
      "listo gracias",
      "Muy amable",
    ]) {
      expect(mereceRescate({ ...base, ultimoDelCliente: t }).rescatar, t).toBe(false);
    }
  });

  it("conv 16872: con la visita ya anotada tampoco hay nada que rescatar", () => {
    expect(mereceRescate({ ...base, visitaRegistrada: true }).rescatar).toBe(false);
  });

  it("un cliente que dio un plazo no se rescata: dijo que él avisa", () => {
    for (const t of ["Ya le confirmo en el transcurso del día", "Yo le aviso", "le escribo luego"]) {
      expect(mereceRescate({ ...base, ultimoDelCliente: t }).rescatar, t).toBe(false);
    }
  });

  it("cada negativa dice por qué, para que el asesor lo entienda en la alerta", () => {
    expect(mereceRescate({ ...base, ultimoDelCliente: "Gracias" }).motivo).toBe("despedida");
    expect(mereceRescate({ ...base, visitaRegistrada: true }).motivo).toBe("visita_registrada");
    expect(mereceRescate({ ...base, ultimoDelCliente: "Yo le aviso" }).motivo).toBe("plazo");
  });
});
