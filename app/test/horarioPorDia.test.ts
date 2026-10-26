import { describe, expect, it } from "vitest";

/**
 * Horario por día de la semana (26-oct). Depot cierra los domingos y el
 * esquema viejo (`weekday`/`weekend`) solo podía cerrar sábado y domingo JUNTOS.
 * Lo guardado en producción tiene la forma vieja: se lee sin migración.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://test@localhost/test";

const { StoreHoursSchema, DIAS_SEMANA, normalizarHorarioDeLocal, algunLocalAbre, formatStoreHours, horarioEnPalabras } =
  await import("../src/services/settings.js");
const { diasSugeridos } = await import("../src/domain/botones.js");

/** Lo que hay hoy en la tabla `settings` de producción. */
const PRODUCCION_VIEJA = {
  cumbaya: { weekday: { open: "08:30", close: "17:30", closed: false }, weekend: { open: "08:30", close: "14:30", closed: false }, excepciones: [] },
  quitoSur: { weekday: { open: "08:30", close: "17:30", closed: false }, weekend: { open: "08:30", close: "17:30", closed: true }, excepciones: [] },
};

const tramo = (open: string, close: string, closed = false) => ({ open, close, closed });
const unaSemana = (over: Record<string, ReturnType<typeof tramo>> = {}) => ({
  dias: Object.fromEntries(DIAS_SEMANA.map((d) => [d, over[d] ?? tramo("08:30", "17:30")])),
  excepciones: [],
});

describe("la forma vieja de producción se lee sin migración", () => {
  it("weekday cubre lunes a viernes y weekend copia a sábado Y domingo", () => {
    const h = StoreHoursSchema.parse(PRODUCCION_VIEJA);
    for (const d of ["lun", "mar", "mie", "jue", "vie"] as const) expect(h.cumbaya.dias[d]).toMatchObject({ open: "08:30", close: "17:30", closed: false });
    expect(h.cumbaya.dias.sab).toMatchObject({ close: "14:30", closed: false });
    expect(h.cumbaya.dias.dom).toMatchObject({ close: "14:30", closed: false });
    expect(h.quitoSur.dias.sab.closed).toBe(true);
    expect(h.quitoSur.dias.dom.closed).toBe(true);
  });

  it("la forma nueva pasa tal cual y la normalización es idempotente", () => {
    const nueva = unaSemana({ dom: tramo("08:30", "17:30", true) });
    expect(normalizarHorarioDeLocal(nueva)).toEqual(nueva);
    const h = StoreHoursSchema.parse({ cumbaya: nueva });
    expect(StoreHoursSchema.parse(h)).toEqual(h);
  });
});

describe("solo el domingo cerrado", () => {
  const h = StoreHoursSchema.parse({
    cumbaya: unaSemana({ sab: tramo("08:30", "14:30"), dom: tramo("08:30", "17:30", true) }),
    quitoSur: unaSemana({ sab: tramo("08:30", "14:30"), dom: tramo("08:30", "17:30", true) }),
  });

  it("cerrar dom no afecta a sab", () => {
    expect(h.cumbaya.dias.dom.closed).toBe(true);
    expect(h.cumbaya.dias.sab.closed).toBe(false);
  });

  it("algunLocalAbre: sábado sí, domingo no (con los dos locales cerrados)", () => {
    expect(algunLocalAbre(h, new Date("2026-10-24T17:00:00Z"))).toBe(true); // sábado
    expect(algunLocalAbre(h, new Date("2026-10-25T17:00:00Z"))).toBe(false); // domingo
    expect(algunLocalAbre(h, new Date("2026-10-26T17:00:00Z"))).toBe(true); // lunes
  });

  it("si UN local abre el domingo, el día sigue ofreciéndose", () => {
    const uno = StoreHoursSchema.parse({ ...h, cumbaya: unaSemana() });
    expect(algunLocalAbre(uno, new Date("2026-10-25T17:00:00Z"))).toBe(true);
  });

  it("los botones de día saltan el domingo y caen en lunes", () => {
    // sábado 24-oct: mañana es domingo (cerrado) → lunes y martes
    const dias = diasSugeridos(new Date("2026-10-24T17:00:00Z"), (f) => algunLocalAbre(h, f));
    expect(dias.map((d) => d.fecha.toISOString().slice(0, 10))).toEqual(["2026-10-26", "2026-10-27"]);
    expect(dias.some((d) => d.titulo.includes("domingo"))).toBe(false);
  });

  it("el día se lee en Ecuador, no en UTC (22:00 de Quito del sábado ya es domingo en UTC)", () => {
    expect(algunLocalAbre(h, new Date("2026-10-25T03:00:00Z"))).toBe(true); // sábado 22:00 en Quito
  });
});

describe("el texto agrupa días iguales", () => {
  it("horarioEnPalabras separa sábado de domingo cuando difieren", () => {
    const h = StoreHoursSchema.parse({ cumbaya: unaSemana({ sab: tramo("08:30", "14:30"), dom: tramo("08:30", "17:30", true) }) });
    expect(horarioEnPalabras(h.cumbaya)).toBe("lunes a viernes 08:30–17:30; sábado 08:30–14:30; domingo cerrado");
  });

  it("dice «sábado y domingo» solo si son iguales", () => {
    const h = StoreHoursSchema.parse(PRODUCCION_VIEJA);
    expect(horarioEnPalabras(h.cumbaya)).toBe("lunes a viernes 08:30–17:30; sábado y domingo 08:30–14:30");
    expect(horarioEnPalabras(h.quitoSur)).toBe("lunes a viernes 08:30–17:30; sábado y domingo cerrado");
  });

  it("agrupa tramos consecutivos aunque no sean lunes a viernes", () => {
    const h = StoreHoursSchema.parse({ cumbaya: unaSemana({ mie: tramo("10:00", "12:00") }) });
    expect(horarioEnPalabras(h.cumbaya)).toBe("lunes y martes 08:30–17:30; miércoles 10:00–12:00; jueves a domingo 08:30–17:30");
  });

  it("formatStoreHours (prompt y Guardián) usa la misma frase, local por local", () => {
    const h = StoreHoursSchema.parse({
      cumbaya: unaSemana({ sab: tramo("08:30", "14:30"), dom: tramo("08:30", "17:30", true) }),
      quitoSur: unaSemana({ sab: tramo("08:30", "17:30", true), dom: tramo("08:30", "17:30", true) }),
    });
    const t = formatStoreHours(h, "2026-10-26");
    expect(t).toContain("Cumbayá: lunes a viernes 08:30–17:30; sábado 08:30–14:30; domingo cerrado.");
    expect(t).toContain("Quito Sur: lunes a viernes 08:30–17:30; sábado y domingo cerrado.");
  });
});

describe("validación", () => {
  it("un día abierto con cierre antes de la apertura se rechaza", () => {
    expect(() => StoreHoursSchema.parse({ cumbaya: unaSemana({ dom: tramo("18:00", "09:00") }) })).toThrow();
  });
  it("un día cerrado no valida las horas", () => {
    expect(() => StoreHoursSchema.parse({ cumbaya: unaSemana({ dom: tramo("18:00", "09:00", true) }) })).not.toThrow();
  });
});
