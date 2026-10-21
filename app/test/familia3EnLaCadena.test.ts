/**
 * FAMILIA 3 en la cadena de salida: `la_medida_del_cliente_no_se_cuestiona` lee
 * el hecho `medida_escrita` y, si al quitar la pregunta el turno queda vacío,
 * manda los precios de la lámina en vez de «Le consulto con un asesor».
 *
 * Chat 29418 (17-oct 19:08): «Buenas noches requiero de un juego 245/7516» y
 * «245/75/16» → lámina + «…necesito la medida exacta…» → el paso lo quitó, el
 * turno quedó vacío y salió el respaldo genérico.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_medida_falsa";

/** La visita, del más viejo al más nuevo. */
let visita: { direction: "inbound" | "outbound"; content: string; metadata?: unknown }[] = [];
let pieza: unknown = null;

vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(
    async (strings: TemplateStringsArray, ...valores: unknown[]) => {
      const consulta = strings.join(" ");
      if (/metadata->>'piece'='options'/.test(consulta)) return pieza ? [{ metadata: pieza, created_at: new Date() }] : [];
      if (!/from messages/.test(consulta)) return [];
      const ahora = Date.now();
      const filas = [...visita].reverse().map((m, i) => ({ metadata: {}, ...m, created_at: new Date(ahora - (i + 1) * 30_000) }));
      const entrantes = filas.filter((f) => f.direction === "inbound");
      if (/created_at >/.test(consulta)) {
        const desde = valores.find((v): v is Date => v instanceof Date)!;
        return entrantes.filter((f) => f.created_at > desde).map((f, i) => ({ id: i + 1 }));
      }
      return /direction='inbound'/.test(consulta) ? entrantes : filas;
    },
    { end: async () => undefined },
  ),
}));

const { PASOS } = await import("../src/services/prepararSalida.js");
const { CIERRE_PIDE_MEDIDA } = await import("../src/services/quoteMessages.js");
const paso = PASOS.find((p) => p.nombre === "la_medida_del_cliente_no_se_cuestiona")!;
const ctx = (tipo: string, textoDelCliente: string | null) =>
  ({ conversation: { id: 29418, current_cycle: 1, stage: "nuevo" }, tipo, textoDelCliente }) as never;

/** El metadato real de la lámina de la conv 29418 (producción, 17-oct 19:08). */
const PIEZA_29418 = {
  piece: "options", codes: ["356525", "K407B664", "3800B606"], cantidad: 4, sizeLabel: "245/75R16",
  escalones: {
    premium: { codigo: "356525", nombre: "FALKEN WILDPEAK A/T 4W", precio_con_iva: 286.41 },
    economica: { codigo: "K407B664", nombre: "KENDA KR628", precio_con_iva: 163.4 },
    equilibrada: { lonas: 10, codigo: "3800B606", nombre: "KENDA KR29", precio_con_iva: 233.09 },
  },
};

beforeEach(() => {
  visita = [];
  pieza = null;
});

describe("29418 — el turno vaciado sale con los precios de la lámina", () => {
  beforeEach(() => {
    visita = [
      { direction: "inbound", content: "Buenas noches requiero de un juego 245/7516" },
      { direction: "inbound", content: "245/75/16" },
    ];
    pieza = PIEZA_29418;
  });

  it("en vez de quedar vacío, sale la lista con «¿Le cotizo la 1, la 2 o la 3?»", async () => {
    const salida = await paso.aplicar(CIERRE_PIDE_MEDIDA, ctx("respuesta", "Buenas noches requiero de un juego 245/7516\n245/75/16"));
    expect(salida).toContain("245/75R16");
    expect(salida).toContain("1 · KENDA KR628 — $163.40 c/u · 4 = $653.60");
    expect(salida).toContain("3 · FALKEN WILDPEAK A/T 4W — $286.41 c/u · 4 = $1145.64");
    expect(salida).toContain("¿Le cotizo la 1, la 2 o la 3?");
    expect(salida).not.toMatch(/medida exacta|foto/i);
  });

  it("26561: si la lámina es de otra medida (salió por el vehículo), no se manda como suya", async () => {
    pieza = { ...PIEZA_29418, sizeLabel: "195/55R16" };
    const salida = await paso.aplicar(CIERRE_PIDE_MEDIDA, ctx("respuesta", null));
    expect(salida).toBe("");
  });

  it("26561: si la medida llegó mientras se armaba el turno, se calla (contesta el turno siguiente)", async () => {
    pieza = { ...PIEZA_29418, sizeLabel: "205/55R16" };
    const c = { ...(ctx("respuesta", null) as object), inicioDelTurno: new Date(Date.now() - 45_000) } as never as { callarEsteTurno?: boolean };
    const salida = await paso.aplicar(CIERRE_PIDE_MEDIDA, c as never);
    expect(salida).toBe("");
    expect(c.callarEsteTurno).toBe(true);
  });

  it("sin mensaje nuevo en el medio, no se marca callar (sale el respaldo de siempre)", async () => {
    pieza = { ...PIEZA_29418, sizeLabel: "205/55R16" };
    const c = { ...(ctx("respuesta", null) as object), inicioDelTurno: new Date() } as never as { callarEsteTurno?: boolean };
    await paso.aplicar(CIERRE_PIDE_MEDIDA, c as never);
    expect(c.callarEsteTurno).toBeFalsy();
  });

  it("en un seguimiento, callar sigue siendo callar", async () => {
    const salida = await paso.aplicar(CIERRE_PIDE_MEDIDA, ctx("seguimiento", null));
    expect(salida).toBe("");
  });
});

describe("27418 — una sola opción: esa, con su total, y «¿Se la cotizo?»", () => {
  it("la KR605 con su precio", async () => {
    visita = [{ direction: "inbound", content: "X favor el precio de llantas 255 / 45 R.20 pará un jetour gracias" }];
    pieza = {
      piece: "options", cantidad: 4, sizeLabel: "255/45R20",
      escalones: {
        premium: { codigo: "K952B036", nombre: "KENDA KR605", precio_con_iva: 192.97 },
        economica: { codigo: "K952B036", nombre: "KENDA KR605", precio_con_iva: 192.97 },
        equilibrada: { codigo: "K952B036", nombre: "KENDA KR605", precio_con_iva: 192.97 },
      },
    };
    const salida = await paso.aplicar(CIERRE_PIDE_MEDIDA, ctx("respuesta", visita[0].content));
    expect(salida).toBe("Para *255/45R20* tengo la *KENDA KR605* — *$192.97 c/u con IVA* · 4 = *$771.88*.\n\n¿Se la cotizo?");
  });
});

describe("el candado pregunta al hecho `medida_escrita`", () => {
  it("con el hecho anotado, quita la pregunta aunque el texto no traiga la medida legible", async () => {
    visita = [{ direction: "inbound", content: "la de siempre", metadata: { medida_escrita: ["215/65R16"] } }];
    const salida = await paso.aplicar("Le dejo opciones.\n---\n¿Me manda una foto del costado?", ctx("respuesta", null));
    expect(salida).not.toMatch(/foto/i);
  });

  it("con el hecho vacío, no hay medida del cliente y no se quita nada", async () => {
    visita = [{ direction: "inbound", content: "Para una dmax 4/2", metadata: { medida_escrita: [] } }];
    const texto = "Estas son las que más se usan en su vehículo.\n---\n¿Me manda una foto del costado?";
    expect(await paso.aplicar(texto, ctx("respuesta", null))).toBe(texto);
  });
});
