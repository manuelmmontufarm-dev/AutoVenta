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
      "No veo la medida en la foto, ¿me la escribe?",
      "Claro, con gusto. Le recomiendo estas opciones:",
      "Claro, ya le estoy revisando el valor promocional con el que me llegó esa mercadería. Hasta eso, le puedo recomendar estas opciones:",
    ]) expect(diceNoHay(bueno), bueno).toBe(false);
  });

  it("27-nov: negar una PROMOCIÓN no es negar el stock (simulador con Claude, 185/65R14 con 81 en stock)", async () => {
    const { diceNoHay, sinNoHay } = await import("../src/domain/sinNoHay.js");
    // A «X viernes negro hay más descuento» el vendedor escribió esto, y el
    // candado le pegaba «Un asesor también lo está revisando para
    // conseguírsela» + aviso «pedido sin stock» al asesor, con 81 llantas.
    const real = "Claro, el descuento que le puedo ofrecer es pagando en efectivo o transferencia; en esta llanta no tengo una promo adicional confirmada.";
    for (const bueno of [
      real,
      "En esta llanta no tenemos promoción de Black Friday.",
      "En esa medida no hay descuento adicional, solo el precio en efectivo.",
      "Esa llanta no tiene oferta por ahora.",
      "En 185/65R14 no tengo ninguna promoción vigente.",
    ]) expect(diceNoHay(bueno), bueno).toBe(false);
    expect(sinNoHay(real, { hayOpciones: false, pidePrecio: false })).toBe(real);
    // Lo que sí niega el stock sigue cayendo, aunque la oración hable de promoción.
    for (const malo of [
      "En esta llanta no tengo stock, pero hay promoción en otras.",
      "No tenemos esa llanta en promoción ni en stock.",
      "No hay llantas de promoción en 185/65R14.",
    ]) expect(diceNoHay(malo), malo).toBe(true);
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
    expect(salida).not.toMatch(/stock/i);
    expect(salida).toContain("Claro, con gusto. Le recomiendo estas opciones:");
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
    expect((avisos[0].details as string[]).join(" ")).toMatch(/no se le mostró ninguna opción nueva/i);
  });

  it("si lo que sale dice que un asesor la revisa sin búsqueda que lo marcara (ruta directa + Guardián), el aviso sale igual", async () => {
    const paso = await pasoSinNoHay();
    const salida = await paso.aplicar(
      "Claro, un asesor ya se la está revisando para ayudarle con la *325/30R21*.",
      { conversation: { id: 8, current_cycle: 1, stage: "nuevo" }, tipo: "respuesta", huella: [],
        textoDelCliente: "Hola, necesito 4 llantas 325/30R21" },
    );
    expect(salida).toContain("asesor");
    expect(avisos).toHaveLength(1);
    expect(String(avisos[0].title)).toContain("325/30R21");
  });

  // ── 24-nov-2026: Carlos Romero, sobre la respuesta real del bot ──────────
  //   «eso también se tendría que corregir, que no diga lo de no hay Stock…
  //   sería omitir solo lo de no hay Stock… y decir sí claro, y recomendar».
  //   «Y cuando pregunten precios por la que quieren y no haya Stock, decir
  //   algo como "Claro, ya le estoy revisando el valor promocional con el que
  //   me llegó esa mercadería" y avisar al Asesor para que intervenga».
  //   Manuel: «y que continúe con "hasta eso, le puedo recomendar…"». Carlos: «Exacto».
  const TEXTO_24NOV = "De CONTINENTAL no me sale en stock en este momento en esa medida, pero tenemos estas que son parecidas:\n\n"
    + "*Kenda KR203* como opción de más respaldo y *Tourador TH2* como opción económica para uso diario.\n\n"
    + "Continental es una marca premium alemana, y la PowerContact 2 que vendemos es fabricada en Cuenca.";

  it("24-nov: «no me sale en stock» y «no la veo en stock» también son «no hay»", async () => {
    const { diceNoHay } = await import("../src/domain/sinNoHay.js");
    for (const malo of [
      TEXTO_24NOV,
      "No me sale en stock en este momento, pero tenemos estas que son parecidas:",
      "No la veo en stock ahora.",
      "En stock no me sale esa medida.",
    ]) expect(diceNoHay(malo), malo).toBe(true);
  });

  it("24-nov: la respuesta real sale sin nombrar el stock: «Claro» y la recomendación, el resto igual", async () => {
    const { sinNoHay } = await import("../src/domain/sinNoHay.js");
    const limpio = sinNoHay(TEXTO_24NOV, { hayOpciones: true, pidePrecio: false });
    expect(limpio).not.toMatch(/stock|no me sale|no hay/i);
    expect(limpio.startsWith("Claro, con gusto. Le recomiendo estas opciones:")).toBe(true);
    expect(limpio).toContain("*Kenda KR203* como opción de más respaldo");
    expect(limpio).toContain("fabricada en Cuenca");
  });

  it("24-nov: si pregunta el PRECIO de la que quiere y no hay: valor promocional + «hasta eso, le puedo recomendar», y el asesor se entera de que pidió precio", async () => {
    const paso = await pasoSinNoHay();
    const { pideElPrecio } = await import("../src/domain/sinNoHay.js");
    expect(pideElPrecio("Qué precio tiene la continental?")).toBe(true);
    expect(pideElPrecio("a cómo la continental")).toBe(true);
    expect(pideElPrecio("No dispone talvez en continental")).toBe(false);
    const huella = [
      { herramienta: "buscar_llanta", argumentos: '{"width":185,"aspect":65,"rim":15}',
        resultado: '{"sin_stock_en_lo_pedido":{"medida":"185/65R15","tipo":null,"marca":"CONTINENTAL","aro":15},"encontrado":true' },
      { herramienta: "preparar_opciones", argumentos: '{"codes":["LL-KR29"]}', resultado: '{"mensaje_para_enviar":"ok"}' },
    ];
    const salida = await paso.aplicar("De Continental no me sale en stock en esa medida.\n---\n¿Le cotizo la A o la B?", {
      conversation: { id: 24, current_cycle: 1, stage: "medida_confirmada" },
      tipo: "respuesta", huella, textoDelCliente: "Y qué precio tiene la Continental?",
    });
    expect(salida).not.toMatch(/stock|no me sale/i);
    expect(salida).toContain("Claro, ya le estoy revisando el valor promocional con el que me llegó esa mercadería.");
    expect(salida).toContain("Hasta eso, le puedo recomendar estas opciones:");
    expect(salida).toContain("¿Le cotizo la A o la B?");
    expect(avisos).toHaveLength(1);
    expect(String(avisos[0].reason)).toMatch(/precio/i);
    expect(String(avisos[0].action)).toMatch(/precio/i);
  });

  it("24-nov: la frase aprobada, escrita por el vendedor sin búsqueda que la marque, también avisa al asesor", async () => {
    const paso = await pasoSinNoHay();
    const texto = "Claro, ya le estoy revisando el valor promocional con el que me llegó esa mercadería. Hasta eso, le puedo recomendar estas opciones:";
    const salida = await paso.aplicar(texto, {
      conversation: { id: 25, current_cycle: 1, stage: "medida_confirmada" },
      tipo: "respuesta", huella: [], textoDelCliente: "Precio de la Continental 185/65R15?",
    });
    expect(salida).toContain(texto);
    expect(avisos).toHaveLength(1);
  });

  it("24-nov: el vendedor y el Guardián reciben la regla nueva: nada de «stock», «Claro» y recomendar", async () => {
    const m = await import("../src/domain/sinNoHay.js");
    for (const regla of [m.REGLA_SIN_NO_HAY_VENDEDOR, m.REGLA_SIN_NO_HAY_GUARDIAN]) {
      expect(regla).toContain("no me sale en stock");
      expect(regla).toContain(m.FRASE_PRECIO_SIN_STOCK);
      expect(regla).not.toContain("SÍ está permitido");
    }
    expect(m.REGLA_SIN_NO_HAY_VENDEDOR).toMatch(/Claro/);
  });

  it("el aviso nuevo existe, es de ventas y entra encendido en los niveles ya guardados", async () => {
    const m = await import("../src/services/advisorNotifications.js");
    expect(m.EVENTOS_AVISO).toContain("pedido_sin_stock");
    expect(m.CATEGORIA_DE_EVENTO.pedido_sin_stock).toBe("ventas");
    expect(m.EVENTOS_ENCENDIDOS_AL_LLEGAR).toContain("pedido_sin_stock");
  });
});
