import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * «NO GRACIAS» A SECAS ES «ESA NO», NO «ADIÓS» (Manuel, 20-nov, tras PR #65).
 *
 * Después de una lámina o una cotización, el «no gracias» solo rechaza lo que
 * vio: Competimotor le muestra las opciones de la medida que todavía no vio (la
 * misma ruta de «qué más tiene») o, si no quedan, le pregunta qué busca. Nunca
 * repite la misma, y la venta no queda perdida.
 *
 * El desistimiento explícito —«no gracias ya no», «ya no», «ya compré», «no me
 * interesa»— sigue cerrando como hoy. Depot sigue con su despedida aprobada: el
 * interruptor `noGraciasPideOtraOpcion` está apagado allí (decisión de Manuel).
 */
process.env.NEGOCIO = "mundillantas";
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

let estado = { lamina: false, cotizacion: false, ya_ofrecida: false };
let pieza: Record<string, unknown> | null = null;
let herramientaSinMas = false;
const llamadas: Record<string, unknown>[] = [];
const textosDeLaHerramienta: (string | undefined)[] = [];
const eventos: Record<string, unknown>[] = [];

vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(async (partes: TemplateStringsArray) => {
    const consulta = partes.join("?");
    if (consulta.includes("ya_ofrecida")) return [estado];
    return pieza ? [{ metadata: pieza }] : [];
  }, { end: async () => undefined }),
}));
vi.mock("../src/services/conversations.js", () => ({
  logFunnelEvent: async (_id: number, _tipo: string, data: Record<string, unknown>) => { eventos.push(data); },
}));
vi.mock("../src/agent/tools.js", () => ({
  buildTools: (ctx: { currentUserText?: string }) => {
    textosDeLaHerramienta.push(ctx.currentUserText);
    return [{
      function: { name: "preparar_opciones" },
      execute: async (args: Record<string, unknown>) => {
        llamadas.push(args);
        return herramientaSinMas
          ? JSON.stringify({ error: "El cliente ya vio todas las opciones de 215/65R16." })
          : JSON.stringify({ mensaje_para_enviar: "1 · HAIDA HD667 — $79.10 c/u · 4 = $316.40\n\n¿Le cotizo esta?" });
      },
    }];
  },
}));

const { esNoGraciasASecas, etapaDelCierreDelTurno, tipoDeCierreDelTurno } = await import("../src/domain/cierreTurno.js");
const { pideMasOpciones } = await import("../src/domain/recomendacionPorMarca.js");
const { tryOtraOpcionTrasNoGracias, PREGUNTA_TRAS_NO_GRACIAS } = await import("../src/services/otraOpcionTrasNoGracias.js");
const { POLITICA_DEPOT } = await import("../src/negocio/politicas/depot.js");
const { POLITICA_MUNDILLANTAS } = await import("../src/negocio/politicas/mundillantas.js");
const { POLITICA_EJEMPLO } = await import("../src/negocio/politicas/ejemplo.js");

const ctx = { conversation: { id: 28, current_cycle: 1 } as never, customerPhone: "593900002801" };
const LAMINA_CM28 = { piece: "options", codes: ["A0412", "A0377"], sizeLabel: "215/65R16", seleccion: "primera", recomendado: "A0412" };

beforeEach(() => {
  estado = { lamina: false, cotizacion: false, ya_ofrecida: false };
  pieza = null;
  herramientaSinMas = false;
  llamadas.length = 0;
  textosDeLaHerramienta.length = 0;
  eventos.length = 0;
});

describe("qué es un «no gracias» a secas", () => {
  it("el «no gracias» solo, con cortesía alrededor", () => {
    for (const t of ["no gracias", "No gracias.", "no muchas gracias", "ok no gracias", "disculpe no gracias 🙏", "No, gracias"]) {
      expect(esNoGraciasASecas(t), t).toBe(true);
    }
  });

  it("el desistimiento explícito NO es a secas: sigue cerrando como hoy", () => {
    for (const t of ["no gracias ya no", "ya no", "ya no gracias", "no gracias ya no lo necesito", "ya compre", "no me interesa", "no por el momento, gracias"]) {
      expect(esNoGraciasASecas(t), t).toBe(false);
    }
    // y el cierre del turno de esos no cambió
    expect(tipoDeCierreDelTurno("no gracias ya no")).toBe("rechazo_suave");
    expect(tipoDeCierreDelTurno("ya no gracias")).toBe("rechazo_suave");
  });
});

describe("el interruptor, por perfil", () => {
  it("Competimotor encendido; Depot y el ejemplo apagados (Depot: decisión de Manuel)", () => {
    expect(POLITICA_MUNDILLANTAS.noGraciasPideOtraOpcion).toBe(true);
    expect(POLITICA_DEPOT.noGraciasPideOtraOpcion).toBe(false);
    expect(POLITICA_EJEMPLO.noGraciasPideOtraOpcion).toBe(false);
  });

  it("«no gracias» ya no deja la venta perdida en ningún perfil", () => {
    expect(etapaDelCierreDelTurno("rechazo_suave")).toBeNull();
    // lo demás sigue igual
    expect(etapaDelCierreDelTurno("compra_ajena")).toBe("perdido");
    expect(etapaDelCierreDelTurno("compra_terminada")).toBe("clasificar");
  });
});

describe("ruta directa «no gracias» → otra opción (Competimotor)", () => {
  it("CM28: con la lámina en pantalla, sale la lámina con las que no vio", async () => {
    estado.lamina = true;
    pieza = LAMINA_CM28;
    const respuesta = await tryOtraOpcionTrasNoGracias(ctx, "no gracias");
    expect(respuesta).toContain("HAIDA HD667");
    expect(llamadas[0]).toMatchObject({ codes: ["A0412", "A0377"] });
    // la herramienta tiene que leerlo como pedido de MÁS: así no repite las vistas
    expect(pideMasOpciones(textosDeLaHerramienta[0])).toBe(true);
    expect(eventos[0]).toMatchObject({ route: "otra_opcion_tras_no_gracias", con: "lamina" });
  });

  it("si ya vio todas, pregunta qué busca (no repite la misma)", async () => {
    estado.lamina = true;
    pieza = LAMINA_CM28;
    herramientaSinMas = true;
    expect(await tryOtraOpcionTrasNoGracias(ctx, "no gracias")).toBe(PREGUNTA_TRAS_NO_GRACIAS);
    expect(eventos[0]).toMatchObject({ con: "pregunta" });
  });

  it("después de una cotización sin lámina, pregunta qué busca", async () => {
    estado.cotizacion = true;
    expect(await tryOtraOpcionTrasNoGracias(ctx, "no gracias")).toBe(PREGUNTA_TRAS_NO_GRACIAS);
  });

  it("sin lámina ni cotización en el ciclo, no entra: se despide como hoy", async () => {
    expect(await tryOtraOpcionTrasNoGracias(ctx, "no gracias")).toBeNull();
  });

  it("el segundo «no gracias» del ciclo ya no ofrece nada más: se despide", async () => {
    estado = { lamina: true, cotizacion: true, ya_ofrecida: true };
    pieza = LAMINA_CM28;
    expect(await tryOtraOpcionTrasNoGracias(ctx, "no gracias")).toBeNull();
    expect(llamadas).toHaveLength(0);
  });

  it("CM40: «no gracias ya no» no entra, aunque haya cotización", async () => {
    estado = { lamina: true, cotizacion: true, ya_ofrecida: false };
    pieza = LAMINA_CM28;
    expect(await tryOtraOpcionTrasNoGracias(ctx, "no gracias ya no")).toBeNull();
    expect(llamadas).toHaveLength(0);
  });
});
