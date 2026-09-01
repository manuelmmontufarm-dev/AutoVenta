import { beforeAll, describe, expect, it } from "vitest";
import { pidioCotizacionExplicita } from "../src/domain/consultaConRespaldo.js";
import {
  autorizaCotizacionEnEsteTurno,
  pidePrecio,
  respuestaDePreferencia,
} from "../src/domain/salesIntent.js";

// `quoteMessages` arrastra la config del negocio, que exige el entorno
// completo (mismo patrón que botones.test.ts). Los de dominio son puros.
type QuoteMessages = typeof import("../src/services/quoteMessages.js");
let qm: QuoteMessages;

beforeAll(async () => {
  process.env.WHATSAPP_TOKEN ||= "test";
  process.env.WHATSAPP_APP_SECRET ||= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
  process.env.WHATSAPP_PHONE_ID ||= "test";
  process.env.SELLER_PHONE ||= "593000000000";
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
  process.env.ADMIN_KEY ||= "test";
  process.env.OWNER_KEY ||= "test";
  qm = await import("../src/services/quoteMessages.js");
});

/**
 * Conv 13615 (producción, 1-sep 12:53): Hugo escribió «¡Hola! Quiero más
 * información. Favor costo de las 235/60 R 18» y el bot mandó las opciones Y
 * la cotización COT-MTIWP1SI ($605.56) en el mismo turno, sin dejarlo elegir.
 * Manuel pidió el flujo contrario: opciones primero, cotización recién cuando
 * el cliente conteste el menú de preferencia (costo/equilibrio/premium).
 */
const MENSAJE_DE_HUGO = "¡Hola! Quiero más información.\nFavor costo de las 235/60 R 18";

describe("preguntar el precio no firma la cotización del turno (conv 13615)", () => {
  it("el mensaje de Hugo pide precio pero NO es un pedido explícito de cotización", () => {
    expect(pidePrecio(MENSAJE_DE_HUGO)).toBe(true);
    expect(pidioCotizacionExplicita(MENSAJE_DE_HUGO)).toBe(false);
  });

  it("el turno del precio NO autoriza generar_cotizacion", () => {
    expect(autorizaCotizacionEnEsteTurno(MENSAJE_DE_HUGO)).toBe(false);
    expect(autorizaCotizacionEnEsteTurno("a como las 185/70R14")).toBe(false);
    expect(autorizaCotizacionEnEsteTurno("que precio tienen las 265/65R17")).toBe(false);
  });

  it("las señales de verdad SÍ siguen autorizando en el mismo turno", () => {
    // «Mándame una cotización» con todas sus letras (T115 Q06, 31-ago).
    expect(autorizaCotizacionEnEsteTurno("Mándame una cotización")).toBe(true);
    expect(autorizaCotizacionEnEsteTurno("cotízame las 235/60R18")).toBe(true);
    // Contestó el menú de preferencia.
    expect(autorizaCotizacionEnEsteTurno("la económica")).toBe(true);
    expect(autorizaCotizacionEnEsteTurno("2")).toBe(true);
    // Cantidad explícita — «el juego» son 4 en toda llantera (caso Wilson).
    expect(autorizaCotizacionEnEsteTurno("deme 4 Kenda")).toBe(true);
    expect(autorizaCotizacionEnEsteTurno("¿Cuánto sale el juego?")).toBe(true);
    // Elección directa y aceptación de la oferta de cotizar.
    expect(autorizaCotizacionEnEsteTurno("dale con esa")).toBe(true);
    expect(autorizaCotizacionEnEsteTurno("Ok", true)).toBe(true);
  });

  it("el caso límite: «costo» seco es elección del escalón 1, no pregunta de precio", () => {
    // Respuesta al menú «1) Costo…» — sí autoriza (es la elección).
    expect(respuestaDePreferencia("Costo")).toBe("precio");
    expect(autorizaCotizacionEnEsteTurno("Costo")).toBe(true);
    // «costo» dentro de una frase de primera vez no es elección.
    expect(respuestaDePreferencia(MENSAJE_DE_HUGO)).toBeNull();
  });

  it("sin recomendación entregada, el cierre del turno es el menú de preferencia", () => {
    const cierre = qm.buildCierreOpciones({
      entregarRecomendacion: false,
      recomendacion: "KENDA KR605",
      motivo: "buen equilibrio",
      precioConIva: 151.39,
    });
    expect(cierre).toContain("¿qué prioriza usted?");
    expect(cierre).toContain("Costo");
    expect(cierre).toContain("Equilibrio");
    expect(cierre).toContain("Premium");
    expect(cierre).not.toContain("Yo iría por");
  });
});
