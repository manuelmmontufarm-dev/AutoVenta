/**
 * LAS GARANTÍAS QUE VE EL CLIENTE NO CAMBIAN (R-05).
 *
 * Esta tabla se escribió ANTES de mover `warrantyForBrand` del literal al
 * perfil: fija, palabra por palabra, lo que hoy sale en la cotización y en la
 * comparativa para cada marca de Depot y para una marca desconocida. Después
 * del cambio (leer `negocio.garantias` en vez de los `includes` escritos a
 * mano) tiene que seguir verde sin tocarle una letra.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { warrantyForBrand } = await import("../src/services/quoteMessages.js");

/** Lo que Depot dice HOY, marca por marca — el antes y el después de R-05. */
const TABLA_DE_DEPOT = [
  // [marca tal como viene del catálogo, meses contra golpes]
  ["FALKEN", 18],
  ["Falken", 18],
  ["falken zie", 18], // la clave se busca por `includes`, como siempre
  ["KENDA", 12],
  ["kenda", 12],
  ["WINRUN", 6],
  ["winrun", 6],
  ["SAILUN", null], // marca fuera de la tabla: sin seguro contra golpes
  ["GITI", null],
  ["SUNOCO", null], // Depot la vende, pero nunca tuvo seguro contra golpes
  ["", null],
] as const;

describe("warrantyForBrand — la tabla de Depot, byte a byte", () => {
  it.each(TABLA_DE_DEPOT)("%s → %s meses contra golpes", (marca, meses) => {
    const garantia = warrantyForBrand(marca);
    expect(garantia.factory).toBe("5 años garantía de fábrica contra defectos de fabricación");
    expect(garantia.roadHazardMonths).toBe(meses);
    expect(garantia.roadHazard).toBe(
      meses === null ? null : `${meses} meses contra golpes y estalladuras`,
    );
  });
});
