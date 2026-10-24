import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * CANARY DE MODELO BARATO POR CLIENTE (23-oct-2026), ver src/agent/canary.ts.
 * Lo que se prueba: el reparto por último dígito del teléfono, el alcance por
 * pieza, el sufijo de ruta, y que sin la variable nada cambia.
 */
async function cargar(env: Record<string, string | undefined>) {
  vi.resetModules();
  const previo: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    previo[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
  const mod = await import("../src/agent/canary.js");
  return { ...mod, restaurar: () => { for (const [k, v] of Object.entries(previo)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } } };
}

let restaurar = () => {};
afterEach(() => restaurar());

describe("canary de modelo barato por cliente", () => {
  it("sin OPENAI_CANARY_MODEL nadie entra y la ruta no cambia", async () => {
    const c = await cargar({ OPENAI_CANARY_MODEL: undefined, AI_CANARY_DIGITS: undefined, AI_CANARY_SCOPE: undefined });
    restaurar = c.restaurar;
    expect(c.enGrupoCanary("593991234561")).toBe(false);
    expect(c.modeloCanary("vendedor", "593991234561", "gpt-5.5")).toBe("gpt-5.5");
    expect(c.rutaCanary("commercial", "593991234561")).toBe("commercial");
  });

  it("entran los teléfonos terminados en 1, 2 y 3 por defecto, con vendedor y guardián", async () => {
    const c = await cargar({ OPENAI_CANARY_MODEL: "gpt-5.5-mini", AI_CANARY_DIGITS: undefined, AI_CANARY_SCOPE: undefined });
    restaurar = c.restaurar;
    for (const d of ["1", "2", "3"]) {
      expect(c.modeloCanary("vendedor", `59399000000${d}`, "gpt-5.5")).toBe("gpt-5.5-mini");
      expect(c.modeloCanary("guardian", `59399000000${d}`, "gpt-5.5")).toBe("gpt-5.5-mini");
      expect(c.rutaCanary("guardian", `59399000000${d}`)).toBe("guardian+canary");
    }
    for (const d of ["0", "4", "5", "6", "7", "8", "9"]) {
      expect(c.modeloCanary("vendedor", `59399000000${d}`, "gpt-5.5")).toBe("gpt-5.5");
      expect(c.rutaCanary("commercial", `59399000000${d}`)).toBe("commercial");
    }
    // El teléfono puede venir con «+» o espacios: cuenta el último DÍGITO.
    expect(c.enGrupoCanary("+593 99 000 0002 ")).toBe(true);
    expect(c.enGrupoCanary("")).toBe(false);
    expect(c.enGrupoCanary(null)).toBe(false);
  });

  it("el alcance limita qué pieza baja: solo guardián, solo vendedor", async () => {
    const g = await cargar({ OPENAI_CANARY_MODEL: "gpt-5.5-mini", AI_CANARY_DIGITS: "1,2,3", AI_CANARY_SCOPE: "guardian" });
    expect(g.modeloCanary("vendedor", "593990000001", "gpt-5.5")).toBe("gpt-5.5");
    expect(g.modeloCanary("guardian", "593990000001", "gpt-5.5")).toBe("gpt-5.5-mini");
    // La ruta marca el GRUPO, no la pieza: el vendedor de este cliente sigue
    // en gpt-5.5 pero su conversación es del canary y se compara como tal.
    expect(g.rutaCanary("commercial", "593990000001")).toBe("commercial+canary");
    g.restaurar();
    const v = await cargar({ OPENAI_CANARY_MODEL: "gpt-5.5-mini", AI_CANARY_DIGITS: "1,2,3", AI_CANARY_SCOPE: "vendedor" });
    restaurar = v.restaurar;
    expect(v.modeloCanary("vendedor", "593990000001", "gpt-5.5")).toBe("gpt-5.5-mini");
    expect(v.modeloCanary("guardian", "593990000001", "gpt-5.5")).toBe("gpt-5.5");
  });

  it("los dígitos se pueden cambiar y la basura se ignora", async () => {
    const c = await cargar({ OPENAI_CANARY_MODEL: "gpt-5.5-mini", AI_CANARY_DIGITS: "7, 9, x, 12", AI_CANARY_SCOPE: undefined });
    restaurar = c.restaurar;
    expect(c.enGrupoCanary("593990000007")).toBe(true);
    expect(c.enGrupoCanary("593990000009")).toBe(true);
    expect(c.enGrupoCanary("593990000001")).toBe(false);
    expect(c.enGrupoCanary("593990000002")).toBe(false);
  });

  it("si el modelo no existe, la validación de arranque apaga el canary sin tumbar nada", async () => {
    const c = await cargar({ OPENAI_CANARY_MODEL: "gpt-no-existe", AI_CANARY_DIGITS: "1,2,3", AI_CANARY_SCOPE: undefined });
    restaurar = c.restaurar;
    expect(c.enGrupoCanary("593990000001")).toBe(true);
    const ok = await c.validarCanaryAlArrancar({ models: { retrieve: async () => { throw new Error("404 The model does not exist"); } } } as never);
    expect(ok).toBe(false);
    expect(c.enGrupoCanary("593990000001")).toBe(false);
    expect(c.modeloCanary("guardian", "593990000001", "gpt-5.5")).toBe("gpt-5.5");
    const ok2 = await c.validarCanaryAlArrancar({ models: { retrieve: async () => ({ id: "gpt-no-existe" }) } } as never);
    expect(ok2).toBe(true);
    expect(c.enGrupoCanary("593990000001")).toBe(true);
  });
});
