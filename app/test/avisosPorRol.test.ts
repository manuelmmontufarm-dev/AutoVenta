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
  AVISOS_GENERALES, CATEGORIAS_AVISO, CATEGORIA_DE_EVENTO, EVENTOS_AVISO, ID_NIVEL, NIVELES_DEFECTO,
  NOMBRE_DE_AVISO_GENERAL, NOMBRE_DE_EVENTO, buildAdvisorMessage, cabeceraDeEvento, nivelDe,
  nivelesDesdeMatrizVieja, recibeEvento, recibeGeneral,
} = await import("../src/services/advisorNotifications.js");

/**
 * El acta de la reunión con Andrés (19-ago), escrita a mano y no leída del
 * código: el asesor de local recibe ventas y visitas, y los avisos de ventana
 * de 24 h no le llegan a NADIE por defecto — eran demasiados. La matriz es
 * editable desde Ajustes; esto prueba el punto de partida.
 */
const DEL_MOSTRADOR = [
  "quote_created",
  "customer_ready_to_buy",
  "visita_comprometida",
  "visita_manana",
  "visita_hoy",
] as const;

describe("Niveles de aviso", () => {
  it("arranca con Nivel 1 y Nivel 2, con los ids de siempre", () => {
    expect(NIVELES_DEFECTO.map((n) => [n.id, n.nombre])).toEqual([["admin", "Nivel 1"], ["asesor", "Nivel 2"]]);
    for (const n of NIVELES_DEFECTO) expect(n.id).toMatch(ID_NIVEL);
  });

  it("un nivel que ya no existe recibe como el primero, nunca nada", () => {
    expect(nivelDe("nivel-borrado").id).toBe("admin");
    expect(recibeEvento("nivel-borrado", "quote_created")).toBe(true);
  });

  it("un nivel nuevo recibe exactamente lo que se le marca", () => {
    const niveles = [...NIVELES_DEFECTO, { id: "bodega", nombre: "Bodega", eventos: ["visita_hoy" as const], generales: [] }];
    for (const evento of EVENTOS_AVISO) {
      expect(recibeEvento("bodega", evento, niveles), `bodega y ${evento}`).toBe(evento === "visita_hoy");
    }
    expect(recibeGeneral("bodega", "reporte_diario", niveles)).toBe(false);
  });

  it("la matriz vieja por categorías se convierte sin perder lo marcado", () => {
    const niveles = nivelesDesdeMatrizVieja({ admin: ["ventas", "tecnico"], asesor: ["visitas"] });
    expect(niveles?.[0].eventos.sort()).toEqual(["customer_ready_to_buy", "quote_created", "send_error"].sort());
    expect(niveles?.[1].eventos.sort()).toEqual(["visita_comprometida", "visita_hoy", "visita_manana"].sort());
    expect(nivelesDesdeMatrizVieja("basura")).toBeNull();
  });

  it("todo aviso tiene nombre para el panel: también los generales", () => {
    for (const evento of EVENTOS_AVISO) expect(NOMBRE_DE_EVENTO[evento], `sin nombre: ${evento}`).toBeTruthy();
    for (const g of AVISOS_GENERALES) expect(NOMBRE_DE_AVISO_GENERAL[g], `sin nombre: ${g}`).toBeTruthy();
  });

  it("el reporte diario y el prendido/apagado van al Nivel 1 por defecto, no al 2", () => {
    for (const g of AVISOS_GENERALES) {
      expect(recibeGeneral("admin", g)).toBe(true);
      expect(recibeGeneral("asesor", g)).toBe(false);
    }
  });
});

describe("Quién recibe cada aviso (niveles por defecto)", () => {
  it("cada evento tiene exactamente una categoría conocida", () => {
    for (const evento of EVENTOS_AVISO) {
      expect(CATEGORIAS_AVISO, `categoría de ${evento}`).toContain(CATEGORIA_DE_EVENTO[evento]);
    }
  });

  it("el admin recibe todo MENOS la ventana de 24 h", () => {
    for (const evento of EVENTOS_AVISO) {
      const esperado = evento !== "ventana_por_cerrar";
      expect(recibeEvento("admin", evento), `admin y ${evento}`).toBe(esperado);
    }
  });

  it("el asesor de local recibe exactamente ventas y visitas", () => {
    for (const evento of EVENTOS_AVISO) {
      const esperado = (DEL_MOSTRADOR as readonly string[]).includes(evento);
      expect(recibeEvento("asesor", evento), `asesor y ${evento}`).toBe(esperado);
    }
  });

  it("los niveles mandan: re-encender la ventana desde el panel vuelve a avisar", () => {
    const conVentana = NIVELES_DEFECTO.map((n) => ({ ...n, eventos: [...n.eventos, "ventana_por_cerrar" as const] }));
    expect(recibeEvento("admin", "ventana_por_cerrar", conVentana)).toBe(true);
    expect(recibeEvento("asesor", "ventana_por_cerrar", conVentana)).toBe(true);
    // Y apagarle las ventas al Nivel 2 también obedece.
    const sinVentas = NIVELES_DEFECTO.map((n) => (n.id === "asesor" ? { ...n, eventos: n.eventos.filter((e) => e !== "quote_created") } : n));
    expect(recibeEvento("asesor", "quote_created", sinVentas)).toBe(false);
  });

  it("nada de guardián, sentimiento ni fallas técnicas para el asesor", () => {
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
