import { describe, expect, it } from "vitest";
import { jobsAlCorte, traspasoAlCorte } from "../scripts/sim/lib/traspaso-al-corte.mjs";

/**
 * `--copiar-conv N --hasta ISO` devolvía SIEMPRE el chat al bot: los chats
 * mudos de la familia 4 (auditoría del 19-oct) se copiaban como chats sanos y
 * el error «desaparecía» en el simulador.
 */
describe("quién tenía el chat en el corte", () => {
  const msg = (author_kind: string, created_at: string) => ({ direction: "outbound", type: "text", author_kind, created_at });

  it("4231: el advisor_review del 13-ago (antes del 29-sep) dejó la pausa 'infinity'", () => {
    expect(traspasoAlCorte({
      mensajes: [msg("bot", "2026-08-12T19:41:00Z")],
      jobs: [{ type: "advisor_review", status: "sent", executed_at: "2026-08-13T19:41:51Z" }],
      corte: new Date("2026-10-14T17:43:51Z"),
    })).toEqual({ assigned_to: "human", bot_paused_until: "infinity", bot_paused_reason: "revision_automatica" });
  });

  it("12639: la última palabra fue del asesor → humano, pausa de 6 h desde su mensaje", () => {
    expect(traspasoAlCorte({
      mensajes: [msg("bot", "2026-08-31T16:00:00Z"), msg("owner", "2026-08-31T17:00:00Z")],
      jobs: [],
      corte: new Date("2026-10-15T14:24:28Z"),
    })).toEqual({ assigned_to: "human", bot_paused_until: new Date("2026-08-31T23:00:00Z"), bot_paused_reason: "persona_escribio" });
  });

  it("si el bot habló después, el chat era del bot", () => {
    expect(traspasoAlCorte({
      mensajes: [msg("owner", "2026-10-01T10:00:00Z"), msg("bot", "2026-10-02T10:00:00Z")],
      jobs: [],
      corte: new Date("2026-10-03T10:00:00Z"),
    }).assigned_to).toBe("bot");
  });

  it("los seguimientos ejecutados después del corte vuelven a estar agendados; los creados después no existen", () => {
    const corte = new Date("2026-10-14T17:29:00Z");
    const jobs = jobsAlCorte([
      { id: 1, created_at: "2026-10-13T17:29:25Z", executed_at: "2026-10-14T17:29:05Z", status: "sent" },
      { id: 2, created_at: "2026-10-14T17:51:10Z", executed_at: null, status: "scheduled" },
    ], corte);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: 1, status: "scheduled", executed_at: null });
  });
});
