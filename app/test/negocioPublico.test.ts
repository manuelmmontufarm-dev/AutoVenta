/**
 * `GET /api/negocio` (R-09) — el contrato exacto de MULTICLIENTE.md §3.2.
 *
 * El panel (otro sprint) lo consume en paralelo, así que la forma no se
 * negocia: si cambia una clave acá, el panel se rompe sin avisar.
 */
import { describe, expect, it } from "vitest";
import { DEPOT } from "../src/negocio/negocios/depot.js";
import { MUNDILLANTAS } from "../src/negocio/negocios/mundillantas.js";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { armarNegocioPublico, negocioPublico } = await import("../src/server/negocioPublico.js");
const { COMPACT_PLAYBOOK } = await import("../src/agent/compactPlaybook.js");

const CLAVES = ["id", "nombre", "ciudad", "telefono", "identidades", "locales", "marcas", "vendedor", "playbook", "faltantes"];

describe("armarNegocioPublico · la forma", () => {
  it("exactamente las claves del contrato", () => {
    expect(Object.keys(armarNegocioPublico(DEPOT, "x")).sort()).toEqual([...CLAVES].sort());
  });

  it("Depot: una identidad, dos locales, nada pendiente", () => {
    expect(armarNegocioPublico(DEPOT, "PLAYBOOK")).toEqual({
      id: "depot",
      nombre: "Depot Tire",
      ciudad: "Quito",
      telefono: "+593 98 280 1766",
      identidades: [{ id: "depot", nombre: "Depot Tire", locales: ["cumbaya", "quito_sur"] }],
      locales: [
        { slug: "cumbaya", nombre: "Depot Tire Cumbayá", nombreCorto: "Cumbayá", claveHorario: "cumbaya" },
        { slug: "quito_sur", nombre: "Depot Tire Quito Sur", nombreCorto: "Quito Sur", claveHorario: "quitoSur" },
      ],
      marcas: ["Kenda", "Sunoco", "Eurolub", "Falken"],
      vendedor: { nombre: "Martín" },
      playbook: "PLAYBOOK",
      faltantes: [],
    });
  });

  it("Mundillantas: dos identidades, tres locales y lo que falta preguntar", () => {
    const pub = armarNegocioPublico(MUNDILLANTAS, "PLAYBOOK");
    expect(pub.identidades).toEqual([
      { id: "mundillantas", nombre: "Mundillantas", locales: ["matriz", "local2"] },
      { id: "competimotor", nombre: "Competimotor", locales: ["competimotor"] },
    ]);
    expect(pub.locales.map((l) => l.slug)).toEqual(["matriz", "local2", "competimotor"]);
    expect(pub.faltantes.length).toBeGreaterThan(2);
    expect(pub.faltantes).toContain("vendedor · nombre");
  });

  it("no comparte arreglos con el perfil (el panel no puede mutarlo)", () => {
    const pub = armarNegocioPublico(MUNDILLANTAS, "x");
    pub.identidades[0].locales.push("otro");
    pub.marcas.push("otra");
    expect(MUNDILLANTAS.identidades![0].locales).toEqual(["matriz", "local2"]);
    expect(MUNDILLANTAS.marcas).toEqual(["Kenda", "Falken", "Winrun", "Maxxis"]);
  });
});

describe("negocioPublico · la instancia viva", () => {
  it("sin NEGOCIO es Depot, con el playbook compacto sin editar", () => {
    const pub = negocioPublico();
    expect(pub.id).toBe("depot");
    expect(pub.playbook).toBe(COMPACT_PLAYBOOK);
  });
});
