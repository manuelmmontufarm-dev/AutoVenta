/**
 * FAMILIA 2-H (auditoría del 28-sep-2026): EL CLIENTE ESCRIBIÓ UNA MEDIDA
 * VÁLIDA Y EL BOT LA CUESTIONA — por el tipo de vehículo, pidiendo foto una y
 * otra vez, o dejando que la investigación del vehículo le gane.
 *
 *   conv 12625  «Me podría ayudar con un rin 195/55/R16» · «Es el número
 *     195/55/16R» → CUATRO veces «usted llegó por llanta de camioneta y esa
 *     medida es de auto… envíeme una foto». Lo escribió el Ángel Guardián: el
 *     hecho «EL CLIENTE BUSCA LLANTA DE CAMIONETA» salía del ANUNCIO aunque el
 *     cliente hubiera escrito su medida.
 *   simulador 28-sep  «Chevrolet Traverse, uso 215/65R16, la uso en ciudad» →
 *     `CIERRE_PIDE_MEDIDA` («necesito la medida exacta… o una foto del
 *     costado»): la medida recién escrita no contaba como «del cliente».
 *   conv 23160  «75  rin 15» · «Es para Vitara clásico 5 huecos» → opciones en
 *     225/65R17 y 225/70R16. El candado «el aro del cliente manda» de
 *     `preparar_opciones` no hacía nada cuando el cliente no había escrito una
 *     medida completa (`medidaEstaPedida(x, [])` es `true`).
 *   conv 22629  «205/55 R15» · foto 225/70R16 · «225/70 R15» → cotizó la R15
 *     sin preguntar cuál de las dos.
 *   conv 22839  «245/74R16»: el 74 lo escribió EL CLIENTE; la guía que pidió
 *     confirmarlo acertó. Se deja fijado para que nadie la «arregle».
 */
import { describe, expect, it } from "vitest";
import {
  aroParaFitment,
  clienteDioSuMedida,
  hechoDeCamionetaVigente,
  medidaEnDisputa,
  respetanElAroDelCliente,
} from "../src/domain/medidaDelCliente.js";
import { sinCuestionarLaMedidaDada } from "../src/domain/preguntasProhibidas.js";
import { loQueFaltaDeLaMedida } from "../src/domain/tireSize.js";
import { medidasEnTexto } from "../src/domain/medidaPedida.js";

process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";
// El cierre real de la pieza, no una copia: vive en un módulo que lee config.
const { CIERRE_PIDE_MEDIDA } = await import("../src/services/quoteMessages.js");

const RAMIRO = [
  "Me podría ayudar con un rin 195/55/R16 en lo posible que no sean chinas gracias",
  "Es el número 195/55/16R",
];

describe("conv 12625 — la medida escrita no se cuestiona por el tipo de vehículo", () => {
  it("el hecho de camioneta NO viaja al guardián si el cliente escribió su medida", () => {
    // El anuncio era de camioneta; el cliente escribió 195/55R16.
    expect(hechoDeCamionetaVigente(["Llantas para camioneta 4x4 — Kenda KR601"], RAMIRO)).toBe(false);
    // Sin medida escrita, el hecho sigue (convs 20211 y 20209).
    expect(hechoDeCamionetaVigente(["Precio Rin 17 para camioneta 4x4"], ["Precio Rin 17 para camioneta 4x4"])).toBe(true);
  });

  it("después del guardián se van «es de auto» / «llegó por camioneta» y el pedido de foto", () => {
    const publicado =
      "Sí, la medida queda confirmada: *195/55R16*.\n\nEn esa medida exacta no me aparece stock disponible ahora. Como usted llegó por llanta de camioneta/SUV/4x4 y esa medida es de auto de perfil bajo, prefiero no ofrecerle una alternativa sin validar primero para no equivocarnos.";
    const { texto, quitadas } = sinCuestionarLaMedidaDada(publicado, ["195/55R16"]);
    expect(texto).toContain("195/55R16");
    expect(texto).toContain("no me aparece stock");
    expect(texto).not.toMatch(/camioneta|de auto|perfil bajo/i);
    expect(quitadas.length).toBeGreaterThan(0);
  });

  it("el pedido de foto suelto se va entero", () => {
    const { texto } = sinCuestionarLaMedidaDada(
      "¿Me puede enviar una foto de la medida que aparece en el costado de la llanta?", ["195/55R16"],
    );
    expect(texto).toBe("");
  });

  it("el seguimiento reescrito pierde la foto y conserva el dato de stock", () => {
    const seguimiento =
      "🛞 Ya tengo su medida *195/55R16*. En esa medida exacta no me aparece stock disponible ahora.\n\nSi puede, envíeme una foto de la medida que aparece en el costado de la llanta para validar bien y no ofrecerle una opción equivocada.";
    const { texto } = sinCuestionarLaMedidaDada(seguimiento, ["195/55R16"]);
    expect(texto).toContain("Ya tengo su medida *195/55R16*");
    expect(texto).not.toMatch(/foto/i);
  });

  it("sin medida escrita no toca nada (la foto es una jugada legítima)", () => {
    const pedido = "¿Me puede enviar una foto de la medida que aparece en el costado de la llanta?";
    expect(sinCuestionarLaMedidaDada(pedido, []).texto).toBe(pedido);
  });
});

describe("simulador 28-sep — Traverse con 215/65R16 escrita en el mismo mensaje", () => {
  const TRAVERSE = "Hola, tengo una Chevrolet Traverse, uso 215/65R16, la uso en ciudad, NO todoterreno";

  it("la medida escrita cuenta como del cliente aunque la ficha todavía no la tenga", () => {
    expect(clienteDioSuMedida(null, [TRAVERSE])).toBe(true);
    // Y aunque el bot haya dejado otra deducida en la ficha.
    expect(clienteDioSuMedida("255/65R18", [TRAVERSE])).toBe(true);
    // Sin medida escrita sigue siendo deducida (conv 13862).
    expect(clienteDioSuMedida("225/70R16", ["Suzuki SZ 2016"])).toBe(false);
  });

  it("el cierre que pide medida o foto no llega a quien la escribió", () => {
    const { texto } = sinCuestionarLaMedidaDada(CIERRE_PIDE_MEDIDA, ["215/65R16"]);
    expect(texto).not.toMatch(/foto|medida exacta|filo de la llanta/i);
  });
});

describe("conv 23160 — «75 rin 15»: el aro que escribió gana a la ficha del vehículo", () => {
  const VITARA = ["¡Hola! Quiero más información", "75  rin 15", "Es para Vitara clásico 5 huecos"];
  const op = (sizeLabel: string) => ({ sizeLabel });

  it("las opciones de otro aro no pasan aunque no haya medida completa", () => {
    expect(respetanElAroDelCliente([op("225/65R17"), op("225/70R16")], VITARA)).toEqual([]);
  });

  it("del aro 15 solo pasa el perfil que escribió", () => {
    const pasan = respetanElAroDelCliente([op("205/75R15"), op("205/65R15"), op("225/70R16")], VITARA);
    expect(pasan.map((p) => p.sizeLabel)).toEqual(["205/75R15"]);
  });

  it("una medida completa escrita se respeta aunque sea de otro aro", () => {
    const textos = ["rin 15", "mejor una 205/55R16"];
    expect(respetanElAroDelCliente([op("205/55R16")], textos).map((p) => p.sizeLabel)).toEqual(["205/55R16"]);
  });

  it("fitment_vehiculo investiga con el aro del cliente aunque el modelo no lo mande", () => {
    expect(aroParaFitment(null, VITARA)).toBe(15);
    expect(aroParaFitment(17, VITARA)).toBe(15);
    expect(aroParaFitment(17, ["Es para Vitara"])).toBe(17);
  });
});

describe("conv 22629 — foto 225/70R16 y después «225/70 R15»: no se cotiza sin preguntar cuál", () => {
  const LUIS = [
    { deCliente: true, texto: "¡Hola! Quiero más información llantas 205/55 R15 Nissan XTrail precio" },
    { deCliente: false, texto: "En 205/55R15 no me sale stock exacto disponible en este momento." },
    { deCliente: true, texto: "[El cliente mandó una foto. Se lee: 225/70R16 100S]" },
    { deCliente: false, texto: "Es la única que tengo para lo que me pidió: *KENDA KR50* — $127.93 c/u con IVA." },
    { deCliente: true, texto: "225/70 R15" },
    { deCliente: true, texto: "4 llantas" },
  ];

  it("la foto y lo escrito después no coinciden: hay disputa", () => {
    expect(medidaEnDisputa(LUIS)).toEqual({ foto: "225/70R16", escrita: "225/70R15" });
  });

  it("una vez preguntado, la última palabra del cliente manda", () => {
    const preguntado = [
      ...LUIS,
      { deCliente: false, texto: "En la foto se lee 225/70R16 y usted escribió 225/70R15: ¿cuál es la de su llanta?" },
      { deCliente: true, texto: "la 15" },
    ];
    expect(medidaEnDisputa(preguntado)).toBeNull();
  });

  it("una corrección explícita no es disputa", () => {
    expect(medidaEnDisputa([
      { deCliente: true, texto: "[El cliente mandó una foto. Se lee: 225/70R16 100S]" },
      { deCliente: true, texto: "perdón, me equivoqué: es 225/70 R15" },
    ])).toBeNull();
  });

  it("lo escrito ANTES de la foto lo corrige la foto (flujo normal)", () => {
    expect(medidaEnDisputa(LUIS.slice(0, 4))).toBeNull();
  });
});

describe("conv 22839 — el «74» lo escribió el cliente, no el bot", () => {
  it("245/74R16 pide confirmar el perfil; 245/75R16 es una medida normal", () => {
    expect(loQueFaltaDeLaMedida("245/74R16")).toMatch(/\*74\*/);
    expect(loQueFaltaDeLaMedida("245/75R16")).toBeNull();
    expect(medidasEnTexto("[El cliente mandó una foto. Se lee: 245/75R16]")).toEqual(["245/75R16"]);
  });
});
