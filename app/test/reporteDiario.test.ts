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
 *  · Que los gráficos de la portada sigan siendo SVG válido y sigan diciendo la
 *    verdad con los casos que rompen a cualquier gráfico: todo en cero, una
 *    sola serie, un valor que se come el resto de la escala.
 *
 * Todo puro: sin base de datos ni reloj real, para que falle por la regla y no
 * por el entorno.
 */
import { describe, expect, it } from "vitest";
import { clasificarAlerta, esErrorDeConversacion, etiquetaTecnica } from "../src/services/alertTaxonomy.js";
import { mezclar, soloTexto } from "../src/render/dailyReportPdf.js";
import { espera } from "../src/render/dailyReportHtml.js";
import {
  areaSemana, barrasConversaciones, barrasKanban, colorDeFase, curva, donaCotizado,
  montoCorto, montoEntero,
} from "../src/render/reportCharts.js";
import { PALETTES, resolvePalette } from "../src/render/depotDesign.js";

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

// ===========================================================================
// Los gráficos de la portada
// ===========================================================================

const P = resolvePalette("grafito");
const F = { texto: "Archivo", cifra: "Precio_exo" };
const DIAS = ["lun 4", "mar 5", "mié 6", "jue 7", "vie 8", "sáb 9", "dom 10"];
const semana = (valores: number[]) =>
  valores.map((valor, i) => ({ etiqueta: DIAS[i]!, valor, esHoy: i === valores.length - 1 }));

describe("dinero abreviado de los ejes", () => {
  it("cambia de unidad donde deja de caber", () => {
    expect(montoCorto(0)).toBe("$0");
    expect(montoCorto(842)).toBe("$842");
    expect(montoCorto(1_240)).toBe("$1.2k");
    expect(montoCorto(21_220)).toBe("$21.2k");
    expect(montoCorto(2_400_000)).toBe("$2.4M");
  });

  it("no escribe «$NaN» en el eje de un reporte", () => {
    // El PDF acaba en el teléfono de un asesor: una cifra rota ahí cuesta más
    // que un gráfico que falte.
    expect(montoCorto(Number.NaN)).toBe("$0");
    expect(montoEntero(Number.POSITIVE_INFINITY)).toBe("$0");
    expect(montoEntero(284_310)).toBe("$284,310");
  });
});

describe("la dona de lo cotizado", () => {
  it("un día vacío no rompe el SVG ni inventa arcos", () => {
    const svg = donaCotizado({ hoy: 0, semana: 0, total: 0 }, P, F);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("0% DE LA SEMANA");
    // Sin datos quedan las dos pistas de fondo y ningún arco de valor.
    expect(svg.match(/<path/g)).toBe(null);
  });

  it("el arco no se cierra del todo aunque el día sea la semana entera", () => {
    // Un círculo completo con «A» degenera —final e inicio coinciden— y el
    // renderizador no dibuja nada: se recorta a 99,9 % para que sí se vea.
    const svg = donaCotizado({ hoy: 5000, semana: 5000, total: 5000 }, P, F);
    expect(svg).toContain("100% DE LA SEMANA");
    expect(svg.match(/<path/g)).toHaveLength(2);
  });

});

describe("el SVG es XML, no una plantilla de texto", () => {
  it("escapa lo que vendría de un nombre de etapa o una fuente", () => {
    // El único texto que no controla este módulo son los nombres y las
    // familias tipográficas. Un `&` sin escapar tumba el documento entero y el
    // reporte sale sin gráficos.
    const svg = barrasKanban(
      [{ nombre: "Medida & talla <chica>", hoy: 1, semana: 2 }],
      P,
      { texto: 'Archivo, "Sans & Co"', cifra: "Precio_exo" },
    );
    expect(svg).toContain("Medida &amp; talla &lt;chica&gt;");
    expect(svg).toContain("Archivo, &quot;Sans &amp; Co&quot;");
    // Ningún `&` suelto: todos son el arranque de una entidad.
    expect(svg.replace(/&(amp|lt|gt|quot);/g, "")).not.toContain("&");
  });
});

describe("las barras del kanban", () => {
  const fases = [
    { nombre: "Medida", hoy: 12, semana: 61 },
    { nombre: "Cotización", hoy: 7, semana: 39 },
    { nombre: "Perdido", hoy: 1, semana: 7, perdido: true },
  ];

  it("escala contra la etapa más movida, no contra cada barra", () => {
    const svg = barrasKanban(fases, P, F);
    // La rejilla rotula 0 · mitad · máximo; el máximo es la etapa más alta.
    expect(svg).toContain(">61<");
    expect(svg).toContain(">31<");
  });

  it("una etapa sin movimiento sale en cero, no desaparece", () => {
    const svg = barrasKanban([{ nombre: "Ganado", hoy: 0, semana: 0 }], P, F);
    expect(svg).toContain("Ganado");
    // Queda la pista de fondo; ninguna barra de valor encima.
    expect(svg.match(/<rect/g)).toHaveLength(1);
  });

  it("«perdido» no comparte la rampa de los que avanzan", () => {
    const avanza = colorDeFase(2, 6, P, false);
    const perdido = colorDeFase(5, 6, P, true);
    expect(perdido).not.toBe(avanza);
    expect(perdido).toBe(mezclar(P.tenue, P.base, 0.5));
  });

  it("la rampa funciona en las seis paletas de la casa", () => {
    // Todo color sale de mezclar dark/accent/gold, que existen en las seis: si
    // una paleta nueva no los trajera, esto lo caza antes que el asesor.
    for (const nombre of Object.keys(PALETTES)) {
      const p = resolvePalette(nombre);
      for (let i = 0; i < 6; i += 1) {
        expect(colorDeFase(i, 6, p, false), `${nombre}#${i}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe("la curva de la semana", () => {
  it("pasa por cada punto en vez de inventarse el camino", () => {
    const puntos = [{ x: 0, y: 10 }, { x: 10, y: 30 }, { x: 20, y: 20 }];
    const d = curva(puntos);
    expect(d.startsWith("M 0 10")).toBe(true);
    // Un tramo Bézier por hueco, y el último acaba justo en el último punto.
    expect(d.match(/C /g)).toHaveLength(2);
    expect(d.endsWith("20 20")).toBe(true);
  });

  it("un solo día no produce curva ni revienta", () => {
    expect(curva([{ x: 5, y: 5 }])).toBe("M 5 5");
    expect(curva([])).toBe("");
  });

  it("una semana entera en cero sigue dando un SVG dibujable", () => {
    const svg = areaSemana(semana([0, 0, 0, 0, 0, 0, 0]), P, F);
    expect(svg.startsWith("<svg")).toBe(true);
    // El eje se rotula igual: sin tope mínimo saldría una división por cero.
    expect(svg).toContain("$0");
    expect(svg).toContain("dom 10");
  });

  it("marca el día del reporte y sólo ese", () => {
    const svg = areaSemana(semana([2140, 3980, 1560, 5230, 720, 4410, 3180]), P, F);
    // Un único punto lleno (r grande) y una única guía vertical punteada.
    expect(svg.match(/r="4.2"/g)).toHaveLength(1);
    expect(svg.match(/r="2.8"/g)).toHaveLength(6);
  });
});

describe("las barras de conversaciones", () => {
  it("el día de cero no dibuja una barra fantasma", () => {
    const svg = barrasConversaciones(semana([0, 0, 0, 0, 0, 0, 5]), P, F);
    expect(svg).toContain('height="0"');
    expect(svg).toContain(">5<");
  });
});
