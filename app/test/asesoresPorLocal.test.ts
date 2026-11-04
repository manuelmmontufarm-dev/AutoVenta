import { beforeAll, describe, expect, it } from "vitest";
import type { asesoresDelLocal as AsesoresDelLocal, podarAsignaciones as PodarAsignaciones } from "../src/services/asesoresPorLocal.js";

// El servicio llega hasta config.ts por db/client: se satisface con valores de
// mentira ANTES del import (los imports estáticos se izan, por eso es dinámico).
let asesoresDelLocal: typeof AsesoresDelLocal;
let podarAsignaciones: typeof PodarAsignaciones;
beforeAll(async () => {
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgresql://localhost/test";
  ({ asesoresDelLocal, podarAsignaciones } = await import("../src/services/asesoresPorLocal.js"));
});

/**
 * R-34 — los avisos van al asesor del local elegido.
 *
 * La regla, pura para probarla caso por caso: con un local elegido y asesores
 * asignados a ese local, el aviso va solo a ellos; sin asignación o sin local,
 * a todos — que es exactamente lo que pasa hoy en Depot, donde nadie asignó
 * nada. Un filtro que deja la lista vacía vuelve a todos: un aviso que no sale
 * es una venta que nadie atiende (misma filosofía del respaldo de
 * `asesoresActivos`).
 */
const ana = { id: 1, nombre: "Ana", telefono: "593911111111", rol: "asesor" };
const beto = { id: 2, nombre: "Beto", telefono: "593922222222", rol: "asesor" };
const carla = { id: 3, nombre: "Carla", telefono: "593933333333", rol: "admin" };
const todos = [ana, beto, carla];
const SLUGS = ["matriz", "sucursal"];

describe("asesores por local · regla de enrutamiento (R-34)", () => {
  it("sin local elegido, el aviso va a todos (como hoy)", () => {
    expect(asesoresDelLocal(todos, { matriz: [1] }, null, SLUGS)).toEqual(todos);
  });

  it("sin asignación para ese local, a todos (Depot no cambia)", () => {
    expect(asesoresDelLocal(todos, {}, "matriz", SLUGS)).toEqual(todos);
    expect(asesoresDelLocal(todos, { matriz: [] }, "matriz", SLUGS)).toEqual(todos);
  });

  it("con local y asignación, solo los asesores de ese local", () => {
    expect(asesoresDelLocal(todos, { matriz: [1, 3] }, "matriz", SLUGS)).toEqual([ana, carla]);
    expect(asesoresDelLocal(todos, { matriz: [1], sucursal: [2] }, "sucursal", SLUGS)).toEqual([beto]);
  });

  it("un asesor sin id (el respaldo del entorno) nunca se queda fuera", () => {
    const respaldo = { nombre: "Manuel", telefono: "593900000000", rol: "admin" };
    expect(asesoresDelLocal([respaldo], { matriz: [1] }, "matriz", SLUGS)).toEqual([respaldo]);
  });

  it("si el filtro dejaría la lista vacía, vuelve a todos", () => {
    // Los asignados al local ya no están activos (no vienen en la lista):
    // mejor que el aviso salga de más a que no salga.
    expect(asesoresDelLocal(todos, { matriz: [99] }, "matriz", SLUGS)).toEqual(todos);
  });

  it("un local que ya no existe en el perfil se ignora y se reporta", () => {
    const { asignaciones, ignoradas } = podarAsignaciones(
      { matriz: [1], localViejo: [2] },
      SLUGS,
    );
    expect(asignaciones).toEqual({ matriz: [1] });
    expect(ignoradas).toEqual(["localViejo"]);
  });
});
