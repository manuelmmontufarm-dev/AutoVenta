import { describe, expect, it } from "vitest";
import { debeAlertarBotApagado } from "../src/workers/embeddedFollowUpWorker.js";

/**
 * El caso real: 6-ago, bot apagado a las 13:16, 139 mensajes de 38 clientes sin
 * respuesta y nadie se enteró. La regla que se prueba aquí es la que convierte
 * ese silencio en una alerta — y la que evita que la alerta sea spam.
 */
describe("debeAlertarBotApagado", () => {
  const apagadoAt = "2026-08-06T18:16:00.000Z";

  it("con el bot encendido no alerta nunca, aunque haya gente escribiendo", () => {
    expect(
      debeAlertarBotApagado({ activo: true, apagadoAt: null }, 12, new Date()),
    ).toBeNull();
  });

  it("apagado pero sin nadie esperando: no hay nada que avisar", () => {
    expect(
      debeAlertarBotApagado(
        { activo: false, apagadoAt },
        0,
        new Date("2026-08-06T19:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("apagado con clientes esperando: alerta", () => {
    const r = debeAlertarBotApagado(
      { activo: false, apagadoAt },
      3,
      new Date("2026-08-06T19:00:00.000Z"),
    );
    expect(r?.alertar).toBe(true);
    expect(r?.dedupeKey).toBe(`bot_apagado:${apagadoAt}:0`);
  });

  it("la clave es estable dentro de la misma hora apagada (una alerta por hora, no cada 5 min)", () => {
    const a = debeAlertarBotApagado({ activo: false, apagadoAt }, 3, new Date("2026-08-06T18:20:00.000Z"));
    const b = debeAlertarBotApagado({ activo: false, apagadoAt }, 8, new Date("2026-08-06T19:10:00.000Z"));
    expect(a?.dedupeKey).toBe(b?.dedupeKey);
  });

  it("cambia de clave al cumplirse otra hora apagada: el recordatorio vuelve a sonar", () => {
    const primera = debeAlertarBotApagado({ activo: false, apagadoAt }, 3, new Date("2026-08-06T18:30:00.000Z"));
    const segunda = debeAlertarBotApagado({ activo: false, apagadoAt }, 38, new Date("2026-08-06T19:30:00.000Z"));
    expect(segunda?.dedupeKey).not.toBe(primera?.dedupeKey);
    expect(segunda?.dedupeKey).toBe(`bot_apagado:${apagadoAt}:1`);
  });

  it("sin fecha de apagado no inventa un apagón (instalación que nunca se encendió)", () => {
    expect(
      debeAlertarBotApagado({ activo: false, apagadoAt: null }, 5, new Date()),
    ).toBeNull();
  });
});
