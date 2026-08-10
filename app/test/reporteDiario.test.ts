/**
 * Lo que se prueba aquí es lo que se rompió en producción:
 *
 *  · Que la ventana de 24 h de WhatsApp cerrándose deje de contar como error —
 *    el motivo de todo este cambio.
 *  · Que el corte del reporte sea de verdad 20:00 → 20:00 de Ecuador, incluido
 *    el caso de pedirlo a media tarde (debe devolver el último día cerrado, no
 *    medio día suelto).
 *  · Que el PDF no pinte cuadros vacíos cuando un cliente lleva emojis en el
 *    nombre de WhatsApp, sin llevarse por delante tildes ni flechas.
 *
 * Todo puro: sin base de datos ni reloj real, para que falle por la regla y no
 * por el entorno.
 */
import { describe, expect, it } from "vitest";
import { clasificarAlerta, esErrorDeConversacion, etiquetaTecnica } from "../src/services/alertTaxonomy.js";
import { mezclar, soloTexto } from "../src/render/dailyReportPdf.js";
import { espera } from "../src/render/dailyReportHtml.js";

// `dailyReport` arrastra config y la conexión sólo por estar en el mismo
// módulo que las consultas; la ventana en sí no depende de ninguna de las dos.
// Nada se conecta: postgres.js abre en la primera consulta y aquí no hay.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_reporte_test";

const { ventanaDelReporte } = await import("../src/services/dailyReport.js");

describe("qué cuenta como error del bot", () => {
  it("la ventana de 24 h cerrándose NO es un error", () => {
    expect(clasificarAlerta("window_closing")).toBe("operativo");
    expect(esErrorDeConversacion("window_closing")).toBe(false);
  });

  it("los estados normales del negocio quedan fuera del tab", () => {
    for (const tipo of [
      "two_follow_ups_no_reply", "advisor_follow_up", "recommend_close_lost",
      "visit_not_confirmed", "visita_comprometida", "visita_manana", "human_requested",
    ]) {
      expect(clasificarAlerta(tipo), tipo).toBe("operativo");
    }
  });

  it("lo que se rompió dentro del chat sí es un error", () => {
    for (const tipo of [
      "repetitive_conversation", "guard_bot_atascado", "guard_mensaje_duplicado",
      "guard_saludo_repetido", "negative_sentiment", "customer_opt_out",
    ]) {
      expect(clasificarAlerta(tipo), tipo).toBe("conversacion");
    }
  });

  it("los fallos de plomería van aparte y con etiqueta propia", () => {
    expect(clasificarAlerta("send_error")).toBe("tecnico");
    expect(clasificarAlerta("template_required")).toBe("tecnico");
    expect(etiquetaTecnica("send_error")).toBe("No salió un mensaje");
    expect(etiquetaTecnica("repetitive_conversation")).toBe("");
  });

  it("un tipo nuevo se muestra en vez de esconderse", () => {
    // Equivocarse hacia «visible» se nota y se corrige; hacia «oculto», no.
    expect(clasificarAlerta("modo_de_fallo_que_no_existe_todavia")).toBe("conversacion");
  });
});

describe("la ventana del reporte", () => {
  it("a las 20:00 cierra el día que termina ahí", () => {
    const { desde, hasta } = ventanaDelReporte(new Date("2026-08-09T20:00:00-05:00"));
    expect(hasta.toISOString()).toBe(new Date("2026-08-09T20:00:00-05:00").toISOString());
    expect(desde.toISOString()).toBe(new Date("2026-08-08T20:00:00-05:00").toISOString());
  });

  it("pasada la medianoche sigue siendo el reporte de las 20:00 de ayer", () => {
    const { desde, hasta } = ventanaDelReporte(new Date("2026-08-10T01:30:00-05:00"));
    expect(hasta.toISOString()).toBe(new Date("2026-08-09T20:00:00-05:00").toISOString());
    expect(desde.toISOString()).toBe(new Date("2026-08-08T20:00:00-05:00").toISOString());
  });

  it("a media tarde devuelve el último día cerrado, no medio día suelto", () => {
    const { desde, hasta } = ventanaDelReporte(new Date("2026-08-09T15:00:00-05:00"));
    expect(hasta.toISOString()).toBe(new Date("2026-08-08T20:00:00-05:00").toISOString());
    expect(hasta.getTime() - desde.getTime()).toBe(86_400_000);
  });

  it("la clave del día es el día en que se trabajó, no el siguiente", () => {
    // El corte cae a las 20:00, dentro del mismo día: la clave nunca puede
    // saltar al día siguiente o el candado dejaría pasar dos reportes.
    expect(ventanaDelReporte(new Date("2026-08-09T20:00:00-05:00")).diaClave).toBe("2026-08-09");
    expect(ventanaDelReporte(new Date("2026-08-10T03:00:00-05:00")).diaClave).toBe("2026-08-09");
  });
});

describe("texto del PDF", () => {
  it("descarta emojis del nombre del cliente sin comerse las tildes", () => {
    // El nombre sale del perfil de WhatsApp: es texto libre y trae de todo.
    expect(soloTexto("María José 🛞 Peñafiel")).toBe("María José Peñafiel");
    expect(soloTexto("🔥🔥 Depot 🔥")).toBe("Depot");
  });

  it("conserva lo que la fuente sí sabe pintar", () => {
    // Con Helvetica la flecha salía como «!»; con Archivo embebida se queda.
    expect(soloTexto("20:00 → 20:00")).toBe("20:00 → 20:00");
    expect(soloTexto("Dijo: “paso el lunes” — confirmar")).toBe("Dijo: “paso el lunes” — confirmar");
    expect(soloTexto("265/70R16 · $1,290.75 · ×3")).toBe("265/70R16 · $1,290.75 · ×3");
  });
});

describe("gradiente de la banda", () => {
  it("mezcla los extremos y respeta la proporción", () => {
    expect(mezclar("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mezclar("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mezclar("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("devuelve siempre seis dígitos, también con canales bajos", () => {
    // Sin el relleno a dos dígitos, un canal como 0x05 salía «#5...» y pdfmake
    // pintaba negro: el gradiente de la banda se perdía sin dar error.
    expect(mezclar("#23262b", "#f07818", 0.28)).toMatch(/^#[0-9a-f]{6}$/);
    expect(mezclar("#010101", "#020202", 0.5)).toBe("#020202");
  });
});

describe("cuánto lleva esperando", () => {
  const ahora = new Date("2026-08-09T20:00:00-05:00");
  it("usa la unidad que se lee de un vistazo", () => {
    expect(espera(new Date(ahora.getTime() - 22 * 60_000).toISOString(), ahora)).toBe("22 min");
    expect(espera(new Date(ahora.getTime() - 7 * 3_600_000).toISOString(), ahora)).toBe("7 h");
    expect(espera(new Date(ahora.getTime() - 5 * 86_400_000).toISOString(), ahora)).toBe("5 d");
    expect(espera(null, ahora)).toBe("");
  });
});
