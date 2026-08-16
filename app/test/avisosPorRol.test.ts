import { describe, expect, it } from "vitest";

/**
 * Enrutamiento de avisos por rol y forma del mensaje.
 *
 * Aquí no hay base ni WhatsApp a propósito: lo que se prueba es la decisión de
 * a quién le llega cada aviso, y esa decisión tiene que poder recorrerse evento
 * por evento. El día que alguien agregue un tipo nuevo, el test falla y le
 * obliga a contestar dos preguntas —¿le llega al del mostrador? ¿con qué
 * cabecera?— antes de que el evento exista en producción.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_no_se_conecta";

const {
  EVENTOS_AVISO, EVENTOS_ASESOR, ROLES_ASESOR, buildAdvisorMessage,
  cabeceraDeEvento, esRolAsesor, recibeEvento,
} = await import("../src/services/advisorNotifications.js");

/**
 * Los cinco de la reunión del 14-ago, escritos a mano y no leídos del código:
 * si alguien cambia la lista de producción, este literal es el acta contra la
 * que se compara.
 */
const LOS_CINCO = [
  "ventana_por_cerrar",
  "quote_created",
  "visita_comprometida",
  "visita_manana",
  "visita_hoy",
] as const;

describe("Rol del asesor", () => {
  it("solo reconoce los dos niveles que existen", () => {
    expect(ROLES_ASESOR).toEqual(["admin", "asesor"]);
    expect(esRolAsesor("admin")).toBe(true);
    expect(esRolAsesor("asesor")).toBe(true);
    // Lo que llegaría por la API si alguien se equivoca al escribirlo.
    for (const basura of ["Asesor", "vendedor", "", null, undefined, 1]) {
      expect(esRolAsesor(basura)).toBe(false);
    }
  });
});

describe("Quién recibe cada aviso", () => {
  it("el admin lo recibe todo, sin excepción", () => {
    for (const evento of EVENTOS_AVISO) {
      expect(recibeEvento("admin", evento), `admin debería recibir ${evento}`).toBe(true);
    }
  });

  it("el asesor de local recibe exactamente los cinco de la reunión", () => {
    for (const evento of EVENTOS_AVISO) {
      const esperado = (LOS_CINCO as readonly string[]).includes(evento);
      expect(recibeEvento("asesor", evento), `asesor y ${evento}`).toBe(esperado);
    }
    expect([...EVENTOS_ASESOR].sort()).toEqual([...LOS_CINCO].sort());
  });

  it("nada de reportes, guardián, sentimiento ni fallas técnicas para el asesor", () => {
    // Los que motivaron la separación: el asesor que recibe esto deja de leer
    // el canal, y entonces tampoco lee la cotización nueva.
    for (const ruido of [
      "send_error", "repetitive_conversation", "guard_bot_atascado",
      "guard_pide_foto", "guard_mensaje_duplicado", "guard_saludo_repetido",
      "negative_sentiment", "customer_opt_out", "bot_apagado_con_clientes",
    ] as const) {
      expect(recibeEvento("asesor", ruido), `asesor NO debería recibir ${ruido}`).toBe(false);
    }
  });
});

describe("Cabecera por tipo de aviso", () => {
  it("ningún evento se queda sin cabecera propia", () => {
    for (const evento of EVENTOS_AVISO) {
      const cabecera = cabeceraDeEvento(evento);
      expect(cabecera, `sin cabecera: ${evento}`).toBeTruthy();
      // El formato es el que WhatsApp muestra en negrita, con emoji al frente:
      // es lo único que se ve en la notificación del celular.
      expect(cabecera, `formato de ${evento}`).toMatch(/^\S+ \*[^*]+\*$/u);
    }
  });

  it("una venta, una visita y una falla no se ven iguales", () => {
    const venta = cabeceraDeEvento("quote_created");
    const hoy = cabeceraDeEvento("visita_hoy");
    const manana = cabeceraDeEvento("visita_manana");
    const falla = cabeceraDeEvento("send_error");
    expect(new Set([venta, hoy, manana, falla]).size).toBe(4);
  });
});

describe("El mensaje que ve el asesor", () => {
  const base = {
    conversationId: 42,
    cycle: 1,
    eventType: "quote_created" as const,
    dedupeKey: "42:1:quote_created",
    title: "Cotización nueva",
    reason: "Pidió precio de cuatro llantas.",
    action: "Llámalo antes de que compre en otro lado.",
    customer: "Andrés",
    phone: "593999888777",
  };

  it("empieza por la cabecera y pone el dato que decide antes del nombre", () => {
    const texto = buildAdvisorMessage({
      ...base,
      details: ["$483,28", "4× Kenda KR33A", "Quito Sur"],
    });
    const lineas = texto.split("\n");
    expect(lineas[0]).toBe("💰 *NUEVA COTIZACIÓN*");
    expect(lineas[1]).toBe("Cotización nueva");
    // Los detalles en UNA línea: cada línea suelta empuja el link fuera de la
    // vista previa de la notificación.
    expect(lineas[2]).toBe("$483,28 · 4× Kenda KR33A · Quito Sur");
    expect(lineas.indexOf("👤 Andrés")).toBeGreaterThan(2);
    expect(lineas[lineas.length - 1]).toContain("/#/ticket/42");
  });

  it("sin detalles no deja una línea vacía en medio", () => {
    const lineas = buildAdvisorMessage({ ...base, details: [] }).split("\n");
    expect(lineas).not.toContain("");
    expect(lineas[2]).toBe("👤 Andrés");
  });
});
