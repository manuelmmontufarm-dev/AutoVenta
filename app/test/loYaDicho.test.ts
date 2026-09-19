/**
 * NO SE VUELVE A PREGUNTAR LO QUE EL CLIENTE YA DIJO.
 * Reportes de Joaquín del 14 y 15-sep-2026, con los textos reales.
 */
import { describe, expect, it } from "vitest";
import { localPorLaZonaDicha } from "../src/domain/locations.js";
import { extractCustomerCommitment } from "../src/domain/customerCommitment.js";

// Las coordenadas reales de `config.ts`, sin cargar la configuración entera.
const business = { stores: [
  { name: "Depot Tire Cumbayá", address: "", lat: -0.198, lng: -78.443, mapsUrl: "" },
  { name: "Depot Tire Quito Sur", address: "", lat: -0.2487128, lng: -78.5296804, mapsUrl: "" },
] as never };

describe("la zona dicha en el mismo mensaje elige el local (conv 20427)", () => {
  it("«…ya q yo me ubico al sur de Quito» es Quito Sur", () => {
    expect(localPorLaZonaDicha(business.stores,
      "Dónde está ubicado los locales ya q yo me ubico al sur de Quito")?.name).toBe("Depot Tire Quito Sur");
  });
  it("sin zona, o preguntando en general, no elige por él", () => {
    expect(localPorLaZonaDicha(business.stores, "¡Hola! Quiero más información en q ciudad venden dirección o ubicación")).toBeNull();
    expect(localPorLaZonaDicha(business.stores, "donde quedan")).toBeNull();
  });
});

describe("«fin de semana» ya es una fecha (conv 20589, 15-sep)", () => {
  // Lunes 14-sep-2026, 19:13 en Quito.
  const lunes = new Date("2026-09-15T00:13:00Z");
  it("contestando a la pregunta del día, se anota el sábado y no queda como tramo", () => {
    const c = extractCustomerCommitment("fin de semana", lunes, { respondiendoAlDia: true });
    expect(c?.tipo).toBe("fecha");
    expect(c?.visitDate?.toISOString().slice(0, 10)).toBe("2026-09-19");
    expect(c?.visitTimeLabel).toContain("fin de semana");
  });
  it("«esta semana» sigue sin ser un día", () => {
    expect(extractCustomerCommitment("esta semana", lunes, { respondiendoAlDia: true })?.tipo).toBe("tramo");
  });
  it("una pregunta sobre el fin de semana no agenda nada", () => {
    expect(extractCustomerCommitment("¿atienden el fin de semana?", lunes, {})).toBeNull();
  });
});
