import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EN COMPETIMOTOR NO EXISTE «NO HAY» (Carlos Romero y Jenny Paz, 21-nov-2026).
 *
 *   Jenny: «En nuestro lema comercial no existe la palabra no hay al cliente,
 *   siempre hay o podemos conseguirle… si no hay en stock y tengo opciones,
 *   debería pasarle al vendedor». Carlos: «sería una notificación para que el
 *   vendedor vea una solución».
 *
 * Conv 469 (20-nov) es lo que NO quieren: «En *235/75R15 tipo pantanera (M/T)*
 * no me aparece stock disponible en este momento, por eso no puedo darle
 * precio real de esa pantanera.»
 */

process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

const avisos: Array<Record<string, unknown>> = [];
const alertas: Array<Record<string, unknown>> = [];

vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(
    async (strings: TemplateStringsArray) => {
      const consulta = strings.join(" ");
      if (/selected_quantity/.test(consulta)) return [{ selected_quantity: null, current_cycle: 1 }];
      if (/from conversations/.test(consulta)) return [{ tire_size: "235/75R15" }];
      return [];
    },
    { end: async () => undefined },
  ),
}));
vi.mock("../src/services/advisorNotifications.js", async (original) => ({
  ...(await original<object>()),
  notifyAdvisor: async (input: Record<string, unknown>) => { avisos.push(input); return { sent: true, skipped: false }; },
}));
vi.mock("../src/services/followUps.js", async (original) => ({
  ...(await original<object>()),
  createBotAlert: async (input: Record<string, unknown>) => { alertas.push(input); },
}));
vi.mock("../src/services/catalog.js", async (original) => ({
  ...(await original<object>()),
  findByCode: (code: string) => (code === "LL-KR29" ? { code, brand: "KENDA", design: "KR29", sizeLabel: "235/75R15" } : undefined),
}));

const TEXTO_469 = "En *235/75R15 tipo pantanera (M/T)* no me aparece stock disponible en este momento, por eso no puedo darle precio real de esa pantanera.";

async function pasoSinNoHay() {
  const { PASOS } = await import("../src/services/prepararSalida.js");
  const paso = PASOS.find((p) => p.nombre === "sin_no_hay");
  expect(paso, "falta el paso sin_no_hay en la cadena de salida").toBeTruthy();
  return paso!;
}

beforeEach(() => { avisos.length = 0; alertas.length = 0; });

describe("Competimotor: nunca «no hay» al cliente", () => {
  it("la política de Competimotor lo pide y la de Depot no", async () => {
    const { POLITICA_MUNDILLANTAS } = await import("../src/negocio/politicas/mundillantas.js");
    const { POLITICA_DEPOT } = await import("../src/negocio/politicas/depot.js");
    expect(POLITICA_MUNDILLANTAS.nuncaDecirNoHay).toBe(true);
    expect(POLITICA_DEPOT.nuncaDecirNoHay).toBeFalsy();
  });

  it("el caso 469 sale sin «no me aparece stock» ni «no puedo darle precio», y con la frase del negocio", async () => {
    const { sinNoHay, diceNoHay, FRASE_SIN_STOCK_CON_OPCIONES } = await import("../src/domain/sinNoHay.js");
    expect(diceNoHay(TEXTO_469)).toBe(true);
    const limpio = sinNoHay(`${TEXTO_469}\n---\n¿Le cotizo la 1 o la 2?`, { hayOpciones: true });
    expect(diceNoHay(limpio)).toBe(false);
    expect(limpio).not.toMatch(/no me aparece|no puedo darle precio|no hay|no tengo|no tenemos/i);
    expect(limpio).toContain(FRASE_SIN_STOCK_CON_OPCIONES);
    expect(limpio).toContain("¿Le cotizo la 1 o la 2?");
  });

  it("las negaciones de siempre caen; lo que no habla de stock no se toca", async () => {
    const { diceNoHay } = await import("../src/domain/sinNoHay.js");
    for (const malo of [
      "No hay stock en esa medida.",
      "No tenemos M/T en 235/75R15.",
      "En 265/70R16 no tengo llantas ahora.",
      "Esa llanta está agotada.",
      "De Michelin no tenemos.",
      "No le puedo dar precio de esa.",
    ]) expect(diceNoHay(malo), malo).toBe(true);
    for (const bueno of [
      "No hay problema, le espero el sábado.",
      "No tengo ese dato a mano.",
      "No me sale en stock en este momento, pero tenemos estas que son parecidas:",
    ]) expect(diceNoHay(bueno), bueno).toBe(false);
  });

  it("la búsqueda sin stock deja la marca primero y la regla del negocio al final", async () => {
    const { conSinNoHay } = await import("../src/agent/tools.js");
    const { pedidoSinStockDelResultado, CAMPO_SIN_STOCK } = await import("../src/domain/sinNoHay.js");
    const json = conSinNoHay(JSON.stringify({ encontrado: false, aro: 15, regla: "Díselo con todas las letras" }),
      { medida: "235/75R15", tipo: "M/T", marca: null, aro: 15 });
    expect(json.startsWith(`{"${CAMPO_SIN_STOCK}"`)).toBe(true);
    expect(json).toContain("NO EXISTE «NO HAY»");
    // La huella corta a 500 caracteres: la marca se lee igual.
    expect(pedidoSinStockDelResultado(json.slice(0, 120))).toEqual({ medida: "235/75R15", tipo: "M/T", marca: null, aro: 15 });
    // Con stock, el resultado no cambia.
    const conStock = JSON.stringify({ encontrado: true });
    expect(conSinNoHay(conStock, null)).toBe(conStock);
  });

  it("con opciones parecidas: el texto se corrige y el asesor recibe qué pidió y qué se le mostró", async () => {
    const paso = await pasoSinNoHay();
    const huella = [
      { herramienta: "buscar_por_aro_y_tipo", argumentos: '{"aro":15,"tipo":"M/T"}',
        resultado: '{"sin_stock_en_lo_pedido":{"medida":"235/75R15","tipo":"M/T","marca":null,"aro":15},"encontrado":true' },
      { herramienta: "preparar_opciones", argumentos: '{"codes":["LL-KR29"]}', resultado: '{"mensaje_para_enviar":"ok"}' },
    ];
    const salida = await paso.aplicar(TEXTO_469, {
      conversation: { id: 469, current_cycle: 1, stage: "medida_confirmada" },
      tipo: "respuesta", huella, textoDelCliente: "Tipo pantaneras",
    });
    expect(salida).not.toMatch(/no me aparece|no puedo darle precio|no hay/i);
    expect(salida).toContain("No me sale en stock en este momento, pero tenemos estas que son parecidas:");
    expect(avisos).toHaveLength(1);
    expect(avisos[0].eventType).toBe("pedido_sin_stock");
    expect(String(avisos[0].title)).toContain("235/75R15");
    expect(String(avisos[0].title)).toContain("tipo M/T");
    expect((avisos[0].details as string[]).join(" ")).toContain("KENDA KR29 235/75R15");
    expect(alertas).toHaveLength(1);
  });

  it("sin ninguna parecida: no dice «no hay», dice que un asesor la revisa, y el aviso sale", async () => {
    const paso = await pasoSinNoHay();
    const huella = [
      { herramienta: "buscar_llanta", argumentos: '{"width":325,"aspect":30,"rim":21}',
        resultado: '{"sin_stock_en_lo_pedido":{"medida":"325/30R21","tipo":null,"marca":null,"aro":21},"medida":"325/30R21"' },
    ];
    const salida = await paso.aplicar("En 325/30R21 no tenemos stock ahora mismo.\n---\n¿Le ayudo con algo más?", {
      conversation: { id: 7, current_cycle: 1, stage: "medida_confirmada" },
      tipo: "respuesta", huella, textoDelCliente: "Tienen 325/30R21?",
    });
    expect(salida).not.toMatch(/no tenemos|no hay/i);
    expect(salida).toMatch(/asesor/);
    expect(avisos).toHaveLength(1);
    expect(String(avisos[0].title)).toContain("325/30R21");
    expect((avisos[0].details as string[]).join(" ")).toMatch(/no se le mostró ninguna/i);
  });

  it("si lo que sale dice «no me sale en stock» sin búsqueda que lo marcara (ruta directa + Guardián), el aviso sale igual", async () => {
    const paso = await pasoSinNoHay();
    const salida = await paso.aplicar(
      "En la medida *325/30R21* no me sale en stock en este momento, pero un asesor ya le está revisando cómo conseguírsela.",
      { conversation: { id: 8, current_cycle: 1, stage: "nuevo" }, tipo: "respuesta", huella: [],
        textoDelCliente: "Hola, necesito 4 llantas 325/30R21" },
    );
    expect(salida).toContain("asesor");
    expect(avisos).toHaveLength(1);
    expect(String(avisos[0].title)).toContain("325/30R21");
  });

  it("el aviso nuevo existe, es de ventas y entra encendido en los niveles ya guardados", async () => {
    const m = await import("../src/services/advisorNotifications.js");
    expect(m.EVENTOS_AVISO).toContain("pedido_sin_stock");
    expect(m.CATEGORIA_DE_EVENTO.pedido_sin_stock).toBe("ventas");
    expect(m.EVENTOS_ENCENDIDOS_AL_LLEGAR).toContain("pedido_sin_stock");
  });
});
