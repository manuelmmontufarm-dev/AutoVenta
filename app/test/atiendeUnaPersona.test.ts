/**
 * «Lo atiende un asesor» en el panel (21-nov): la marca y el orden de Inbox,
 * Pipeline y Para cerrar salen de la misma regla con la que el bot decide
 * callarse, no de `assigned_to` a secas. Con `assigned_to` el panel marcó 4.201
 * de 4.608 chats abiertos de Depot; de verdad atendidos por una persona, uno.
 */
import { describe, expect, it } from "vitest";
import { atiendeUnaPersona as regla, type FilaDeTurno } from "../src/domain/turnoDelHumano.js";

const atiendeUnaPersona = (f: FilaDeTurno, ahora: Date) => regla(f, 48, ahora);

const AHORA = new Date("2026-11-21T16:00:00Z");
const horas = (h: number) => new Date(AHORA.getTime() - h * 3_600_000);
const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3_600_000);
const fila = (p: Partial<FilaDeTurno> = {}): FilaDeTurno => ({
  assigned_to: "human", bot_paused_until: null, bot_paused_reason: null,
  autor_ultimo_saliente: "bot", ultimo_saliente_humano_en: null, ...p,
});

describe("¿lo atiende una persona?", () => {
  it("el asesor acaba de escribir (pausa vigente) → sí", () => {
    expect(atiendeUnaPersona(fila({ bot_paused_until: enHoras(5), bot_paused_reason: "persona_escribio", autor_ultimo_saliente: "owner", ultimo_saliente_humano_en: horas(1) }), AHORA)).toBe(true);
  });

  it("el asesor habló último hace un día, sin pausa → sí", () => {
    expect(atiendeUnaPersona(fila({ autor_ultimo_saliente: "owner", ultimo_saliente_humano_en: horas(24) }), AHORA)).toBe(true);
  });

  it("pausa infinita de antes del 28-sep, nadie escribió → no", () => {
    expect(atiendeUnaPersona(fila({ bot_paused_until: new Date(NaN) }), AHORA)).toBe(false);
  });

  it("pausa vencida y el último saliente es del bot → no", () => {
    expect(atiendeUnaPersona(fila({ bot_paused_until: horas(30) }), AHORA)).toBe(false);
  });

  it("revisión automática de 24 h sin ninguna persona en el chat → no (contesta el bot)", () => {
    expect(atiendeUnaPersona(fila({ bot_paused_until: enHoras(4), bot_paused_reason: "revision_automatica" }), AHORA)).toBe(false);
  });

  it("la última palabra de una persona tiene más de 48 h → no", () => {
    expect(atiendeUnaPersona(fila({ autor_ultimo_saliente: "owner", ultimo_saliente_humano_en: horas(60) }), AHORA)).toBe(false);
  });

  it("asignado al bot → no", () => {
    expect(atiendeUnaPersona(fila({ assigned_to: "bot" }), AHORA)).toBe(false);
  });
});
