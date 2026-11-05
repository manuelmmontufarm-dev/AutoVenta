import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PERFILES_SIM, perfilDeSimulacion } from "../scripts/sim/lib/entorno-prod.mjs";

/**
 * R-36 — el simulador puede correr como OTRO cliente (`--perfil <id>`).
 *
 * La tabla de perfiles vive en `lib/entorno-prod.mjs` y estas pruebas la fijan:
 * Depot sigue siendo EXACTAMENTE lo de hoy (su entorno de Railway y el catálogo
 * de Contífico), los perfiles sin servicio corren con semilla y catálogo por
 * archivo, y un `--perfil` desconocido no arranca. Las partes que necesitan
 * procesos vivos se cubren con `npm run sim -- --perfil ejemplo --humo`; acá se
 * fija, estático como en `simuladorFidelidad`, que `sim.mjs` consulta la tabla
 * y no exporta Contífico cuando el catálogo es por archivo.
 */
describe("simulador · perfiles (R-36)", () => {
  it("depot es lo de hoy: Railway Depot_Tire/AutoVenta y catálogo de Contífico", () => {
    expect(perfilDeSimulacion("depot")).toEqual({
      entorno: "Depot_Tire",
      servicio: "AutoVenta",
      catalogo: "contifico",
    });
  });

  it("ejemplo y mundillantas corren sin servicio y con catálogo por archivo", () => {
    for (const id of ["ejemplo", "mundillantas"]) {
      const perfil = perfilDeSimulacion(id);
      expect(perfil.servicio, id).toBeNull();
      expect(perfil.catalogo, id).toBe("archivo");
    }
  });

  it("un --perfil desconocido no arranca, y el error lista los que existen", () => {
    expect(() => perfilDeSimulacion("depo")).toThrowError(/no existe/);
    expect(() => perfilDeSimulacion("depo")).toThrowError(/depot/);
  });

  it("todo perfil de la tabla declara catálogo contifico o archivo", () => {
    for (const [id, perfil] of Object.entries(PERFILES_SIM)) {
      expect(["contifico", "archivo"], id).toContain(perfil.catalogo);
    }
  });
});

describe("simulador · sim.mjs usa la tabla (fijaciones estáticas)", () => {
  const sim = readFileSync(resolve(__dirname, "../scripts/sim/sim.mjs"), "utf8");

  it("resuelve --perfil con perfilDeSimulacion (un id desconocido lanza)", () => {
    expect(sim).toContain('valor("perfil", null)');
    expect(sim).toContain("perfilDeSimulacion(PERFIL)");
  });

  it("con catálogo por archivo no exporta CONTIFICO_* ni levanta el doble", () => {
    // El bloque de variables de Contífico del spawn está detrás de la bandera.
    expect(sim).toContain("...(CATALOGO_POR_ARCHIVO ? {} : {");
    // Y el doble de Contífico solo se levanta en el camino sin archivo.
    expect(sim).toMatch(/if \(CATALOGO_POR_ARCHIVO\) \{[\s\S]*?\} else \{[\s\S]*?levantarContificoSim/);
  });

  it("NEGOCIO del perfil se pone después de las variables copiadas", () => {
    // `lastIndexOf`: la misma expresión aparece antes en el paso de migración.
    const copiadas = sim.indexOf("...modelosAlineados");
    const negocioDelPerfil = sim.lastIndexOf("...(PERFIL ? { NEGOCIO: PERFIL } : {})");
    expect(copiadas).toBeGreaterThan(-1);
    expect(negocioDelPerfil).toBeGreaterThan(copiadas);
  });

  it("un perfil sin servicio corre la semilla; sin --perfil, el camino de hoy no cambia", () => {
    expect(sim).toContain("src/db/seed-negocio.ts");
    // El camino clásico sigue intacto: copia de producción y verificación.
    expect(sim).toContain("copiarConfiguracionDeProduccion(env.DATABASE_URL)");
    expect(sim).toContain("await verificarLaCopia()");
  });
});
