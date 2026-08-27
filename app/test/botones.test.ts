import { beforeAll, describe, it, expect } from "vitest";
import {
  botonesParaBloque,
  diasSugeridos,
  recortarTitulo,
  textoDeBoton,
  MAX_TITULO,
  TEXTO_OTRO_DIA,
} from "../src/domain/botones.js";
import { respuestaDePreferencia } from "../src/domain/salesIntent.js";
import { extractExplicitStore, PREGUNTA_DE_LOCAL } from "../src/domain/storeSelection.js";
import { extractCustomerCommitment } from "../src/domain/customerCommitment.js";

// `quoteMessages` arrastra la config del negocio (los locales y sus mapas), que
// exige el entorno completo. Los módulos de dominio de arriba no: son puros.
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

const CICLO = 9;
const opts = { ciclo: CICLO, ahora: new Date("2026-08-27T15:00:00Z") };

describe("la escalera NO lleva botones (decisión de producto, 27-ago)", () => {
  // Manuel lo probó en su teléfono y lo bajó: la primera respuesta del cliente
  // es la que le dice si del otro lado hay alguien que entiende o un menú de
  // call center. El menú numerado de Joaquín se queda; se contesta escribiendo.
  it.each([
    ["los tres escalones", ["precio", "equilibrada", "premium"]],
    ["solo dos", ["precio", "premium"]],
    ["uno solo", ["premium"]],
  ])("con %s sigue saliendo como texto", (_caso, escalones) => {
    const bloque = qm.menuDePreferencia(escalones).join("\n");
    expect(botonesParaBloque(bloque, opts)).toBeNull();
  });

  it("y el menú numerado sigue intacto para que se conteste escribiendo", () => {
    const bloque = qm.menuDePreferencia(["precio", "equilibrada", "premium"]).join("\n");
    expect(bloque).toMatch(/1\) \*Costo\*/);
    expect(respuestaDePreferencia("2")).toBe("equilibrada");
    expect(respuestaDePreferencia("la equilibrio")).toBe("equilibrada");
  });
});

describe("local", () => {
  it("ofrece los dos locales sobre la pregunta real del dominio", () => {
    const r = botonesParaBloque(PREGUNTA_DE_LOCAL, opts);
    expect(r?.botones.map((b) => b.titulo)).toEqual(["Cumbayá", "Quito Sur"]);
  });
});

describe("día", () => {
  it("nunca ofrece hoy, y agrega la salida a texto libre", () => {
    const r = botonesParaBloque("¿Qué día cree que puede pasar? 📅", opts);
    expect(r?.botones.map((b) => b.titulo)).toEqual(["Mañana", "El sábado", "Otro día"]);
  });

  it("salta los días en que ningún local abre", () => {
    const soloEntreSemana = (f: Date) => f.getUTCDay() !== 0 && f.getUTCDay() !== 6;
    const dias = diasSugeridos(new Date("2026-08-27T15:00:00Z"), soloEntreSemana);
    expect(dias.map((d) => d.titulo)).toEqual(["Mañana", "El lunes"]);
  });
});

describe("«Otro día» no vuelve a ofrecer los mismos días (bucle del simulador)", () => {
  const pregunta = "¿Qué día cree que puede pasar por *Depot Tire Cumbayá*? 📅";

  it("sin contexto sí ofrece los días", () => {
    expect(botonesParaBloque(pregunta, opts)?.botones).toHaveLength(3);
  });

  it("pero si el cliente acaba de tocar «Otro día», la repregunta va sin botones", () => {
    expect(botonesParaBloque(pregunta, { ...opts, mensajeDelCliente: TEXTO_OTRO_DIA })).toBeNull();
    expect(botonesParaBloque(pregunta, { ...opts, mensajeDelCliente: TEXTO_OTRO_DIA.toUpperCase() })).toBeNull();
  });

  it("y una respuesta cualquiera no apaga los botones", () => {
    expect(botonesParaBloque(pregunta, { ...opts, mensajeDelCliente: "gracias" })?.botones).toHaveLength(3);
  });
});

describe("un turno normal no lleva botones", () => {
  it.each([
    "Le confirmo que las 4 están disponibles en Cumbayá.",
    "El precio de hoy es $124.76 con IVA y Ecovalor.",
    "¿Qué medida usa o qué vehículo es?",
  ])("%s", (bloque) => {
    expect(botonesParaBloque(bloque, opts)).toBeNull();
  });
});

describe("el toque se traduce al texto que los parsers YA entendían", () => {
  it("el local cae en extractExplicitStore", () => {
    expect(extractExplicitStore(textoDeBoton(`local:cumbaya:c${CICLO}`, "x", CICLO))).toBe("Depot Tire Cumbayá");
    expect(extractExplicitStore(textoDeBoton(`local:quito_sur:c${CICLO}`, "x", CICLO))).toBe("Depot Tire Quito Sur");
  });

  it("el día cae en extractCustomerCommitment con fecha", () => {
    const texto = textoDeBoton("dia:2026-08-28:c9", "El viernes", 9);
    const c = extractCustomerCommitment(texto, new Date("2026-08-27T15:00:00Z"), {
      respondiendoAlDia: true,
    });
    expect(c?.visitDate).toBeInstanceOf(Date);
  });

  it("«otro día» no inventa una fecha ni escala a un humano", () => {
    const texto = textoDeBoton(`dia:otro:c${CICLO}`, "Otro día", CICLO);
    expect(texto).toBe(TEXTO_OTRO_DIA);
    // Lo que importa: que ningún parser lo lea como una visita agendada.
    expect(
      extractCustomerCommitment(texto, new Date("2026-08-27T15:00:00Z"), { respondiendoAlDia: true }),
    ).toBeNull();
  });
});

describe("un toque a un mensaje viejo no se lee como respuesta de hoy", () => {
  // Se afirma el EFECTO, no el mecanismo. La primera versión devolvía el título
  // («Quito Sur») y este bloque pasaba en verde — pero «Quito Sur» es justo lo
  // que `extractExplicitStore` entiende, así que el toque viejo cambiaba el
  // local igual. Lo descubrió el simulador, no el test. Ahora se le pregunta a
  // cada parser si se tragó la nota.
  const nota = textoDeBoton("local:quito_sur:c3", "Quito Sur", 9);

  it("ningún parser lo lee como una respuesta", () => {
    expect(extractExplicitStore(nota)).toBeNull();
    expect(
      extractCustomerCommitment(textoDeBoton("dia:2026-08-28:c3", "Mañana", 9), new Date("2026-08-27T15:00:00Z"), {
        respondiendoAlDia: true,
      }),
    ).toBeNull();
  });

  it("entra como nota para que el agente pregunte", () => {
    expect(nota).toMatch(/^\[El cliente tocó un botón de un mensaje anterior/);
  });
});

describe("los detectores de botones son ESTRICTOS (fallas del simulador, 27-ago)", () => {
  it("una respuesta que MENCIONA la visita no se lleva los botones del día", () => {
    const bloque =
      "Sí, para carretera van bien: son *FALKEN ZE310R 205/55R16* y ya tiene su cotización por 4. " +
      "Si quiere, en *Depot Tire Cumbayá* le confirman el ajuste al montar y le aplican la visita que ya agendó.";
    expect(botonesParaBloque(bloque, opts)).toBeNull();
  });

  it("el mensaje de los dos mapas no se lleva los botones del local", () => {
    const bloque =
      "Puede pasar sin compromiso a verlas.\n" +
      "📍 *Depot Tire Cumbayá*: https://maps.app.goo.gl/QnMBPXKc1o8igbsp8\n" +
      "📍 *Depot Tire Quito Sur*: https://maps.app.goo.gl/NQeNN8csyAnRkJDJ7";
    expect(botonesParaBloque(bloque, opts)).toBeNull();
  });
});

describe("los días se cuentan en la zona del negocio", () => {
  it("a las 23:00 de Quito, «Mañana» es mañana y no pasado", () => {
    // 04:00 UTC del 27 = 23:00 del 26 en Ecuador. Mañana es el 27, no el 28.
    const r = botonesParaBloque("¿Qué día cree que puede pasar? 📅", {
      ciclo: 1,
      ahora: new Date("2026-08-27T04:00:00Z"),
    });
    expect(r?.botones[0]).toMatchObject({ titulo: "Mañana", id: "dia:2026-08-27:c1" });
    expect(r?.botones[1]).toMatchObject({ titulo: "El viernes", id: "dia:2026-08-28:c1" });
  });
});

describe("los títulos respetan el tope de Meta", () => {
  it("recorta lo que se pasa de 20", () => {
    expect(recortarTitulo("a".repeat(30))).toHaveLength(MAX_TITULO);
    expect(recortarTitulo("Quito Sur")).toBe("Quito Sur");
  });

  it("ningún título generado se pasa", () => {
    const bloques = [PREGUNTA_DE_LOCAL, "¿Qué día cree que puede pasar? 📅"];
    for (const b of bloques) {
      for (const boton of botonesParaBloque(b, opts)?.botones ?? []) {
        expect(boton.titulo.length).toBeLessThanOrEqual(MAX_TITULO);
      }
    }
  });
});
