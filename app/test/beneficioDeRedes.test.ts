/**
 * EL BENEFICIO DE REDES, PEDIDO POR JOAQUÍN EL 10-SEP.
 *
 * Textual, del grupo de arreglos:
 *
 *   «que el bot comunique un beneficio extra para los clientes que vienen de
 *    redes sociales: una nueva alineación + rotación completamente gratis
 *    cuando el vehículo llegue a los 10.000 km posteriores a la compra.
 *
 *    Es importante que el mensaje deje claro que este beneficio es adicional a
 *    los servicios que ya recibe el día de la instalación, no que la
 *    alineación se hará recién a los 10.000 km.
 *
 *    La idea es que este mensaje salga automáticamente después de enviar la
 *    cotización.»
 *
 * Las dos advertencias de ese pedido son las que prueban estos casos: que se
 * entienda que es ADICIONAL, y que salga UNA vez —el asesor ya lo estaba
 * pegando a mano en los chats 16982 y 18684, y dos veces sería peor que
 * ninguna.
 */
import { describe, expect, it } from "vitest";
import { BENEFICIO_DE_REDES, yaSalioElBeneficioDeRedes } from "../src/domain/beneficioDeRedes.js";

describe("el texto del beneficio", () => {
  it("dice que es adicional a lo del día de la instalación", () => {
    expect(BENEFICIO_DE_REDES).toMatch(/adem[áa]s de los servicios|adicional/i);
    expect(BENEFICIO_DE_REDES).toMatch(/instalaci[óo]n/i);
  });

  it("dice qué es y cuándo: alineación + rotación a los 10.000 km", () => {
    expect(BENEFICIO_DE_REDES).toMatch(/alineaci[óo]n/i);
    expect(BENEFICIO_DE_REDES).toMatch(/rotaci[óo]n/i);
    expect(BENEFICIO_DE_REDES).toMatch(/10\.?000\s*km/i);
    expect(BENEFICIO_DE_REDES).toMatch(/gratis/i);
  });

  it("le pide al cliente mencionarlo al asesor, que es como se registra", () => {
    expect(BENEFICIO_DE_REDES).toMatch(/mencion/i);
    expect(BENEFICIO_DE_REDES).toMatch(/asesor/i);
  });

  it("no promete que la alineación se hace recién a los 10.000 km", () => {
    // La advertencia explícita de Joaquín. El texto no puede sonar a que hay
    // que esperar para la alineación de la instalación.
    expect(BENEFICIO_DE_REDES).not.toMatch(/reci[ée]n a los|cuando llegue a los 10.000 km le alineamos/i);
  });
});

describe("sale una sola vez por ciclo", () => {
  it("lo reconoce en lo ya enviado aunque cambien los espacios", () => {
    expect(yaSalioElBeneficioDeRedes([BENEFICIO_DE_REDES])).toBe(true);
    expect(yaSalioElBeneficioDeRedes(["Cotización lista", BENEFICIO_DE_REDES.replace(/\s+/g, " ")])).toBe(true);
  });

  it("también si lo mandó el asesor a mano (convs 16982 y 18684)", () => {
    const aMano = "🎁 Y tienes un beneficio adicional por venir de nuestras redes sociales: además de los "
      + "servicios incluidos en la instalación de tus llantas, te obsequiamos una alineación + rotación "
      + "completamente GRATIS a los 10.000 km";
    expect(yaSalioElBeneficioDeRedes([aMano])).toBe(true);
  });

  it("con mensajes que no lo mencionan, no", () => {
    expect(yaSalioElBeneficioDeRedes(["Cotización COT-X enviada por $511.96", "¿A cuál local le queda mejor ir?"])).toBe(false);
    expect(yaSalioElBeneficioDeRedes([])).toBe(false);
  });
});
