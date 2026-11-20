import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
// Solo funciones puras; la URL existe porque config la exige al importar.
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { tocaAvisoManana, relojDeGuayaquil, primerNombre, AvisoMananaSchema } =
  await import("../src/services/avisoDeLaManana.js");
const { estadoDesdeMeta } = await import("../src/services/plantillasMeta.js");

/**
 * El mensaje de la mañana (19-nov-2026): una plantilla con el botón «Listo»
 * que abre la ventana de 24 h de cada asesor. Lo que importa es que salga a la
 * hora del negocio (Guayaquil, no UTC) y que no salga a media tarde si el
 * proceso estuvo caído toda la mañana.
 */
describe("aviso de la mañana: cuándo sale", () => {
  const cfg = { activo: true, hora: "08:00" };
  // Guayaquil es UTC-5 todo el año.
  const a = (hhmm: string) => new Date(`2026-11-20T${hhmm}:00-05:00`);

  it("usa la hora de Guayaquil, no la del servidor", () => {
    expect(relojDeGuayaquil(new Date("2026-11-20T13:05:00Z"))).toEqual({ dia: "2026-11-20", minutos: 8 * 60 + 5 });
    // 03:00 UTC del 21 todavía es el 20 en Quito.
    expect(relojDeGuayaquil(new Date("2026-11-21T03:00:00Z")).dia).toBe("2026-11-20");
  });

  it("no sale antes de la hora", () => {
    expect(tocaAvisoManana(cfg, a("07:59"))).toBe(false);
  });

  it("sale desde la hora hasta el mediodía", () => {
    expect(tocaAvisoManana(cfg, a("08:00"))).toBe(true);
    expect(tocaAvisoManana(cfg, a("11:59"))).toBe(true);
  });

  it("si el proceso estuvo caído toda la mañana, a la tarde ya no sale", () => {
    expect(tocaAvisoManana(cfg, a("12:00"))).toBe(false);
    expect(tocaAvisoManana(cfg, a("16:00"))).toBe(false);
  });

  it("una hora tardía igual tiene su hora de margen", () => {
    expect(tocaAvisoManana({ activo: true, hora: "11:30" }, a("12:15"))).toBe(true);
    expect(tocaAvisoManana({ activo: true, hora: "11:30" }, a("12:31"))).toBe(false);
  });

  it("apagado no sale nunca", () => {
    expect(tocaAvisoManana({ activo: false, hora: "08:00" }, a("09:00"))).toBe(false);
  });

  it("sin nada guardado arranca encendido a las 8 con la plantilla aprobada", () => {
    expect(AvisoMananaSchema.parse({})).toEqual({
      activo: true, hora: "08:00", plantilla: "avisos_del_dia_v1", idioma: "es",
    });
  });

  it("saluda por el primer nombre", () => {
    expect(primerNombre("Joaquín Tamayo")).toBe("Joaquín");
    expect(primerNombre("  ")).toBe("equipo");
  });
});

describe("estado de Meta al vocabulario del panel", () => {
  it.each([
    ["APPROVED", "approved"],
    ["PENDING", "pending"],
    ["IN_APPEAL", "pending"],
    ["REJECTED", "rejected"],
    ["PAUSED", "rejected"],
    ["DISABLED", "rejected"],
    [undefined, "not_configured"],
  ])("%s → %s", (meta, panel) => {
    expect(estadoDesdeMeta(meta)).toBe(panel);
  });
});
