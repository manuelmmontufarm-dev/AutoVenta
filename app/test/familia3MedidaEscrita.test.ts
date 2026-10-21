/**
 * FAMILIA 3 (auditoría del 19-oct-2026): el cliente escribe su medida y el bot
 * se la vuelve a pedir; el Guardián lo corrige con los precios de la lámina y
 * una traba posterior descarta la corrección por «precio nuevo».
 *
 * Los textos son los de los chats reales, tal cual llegaron. La clase de
 * entrada: «una medida escrita a mano con separadores raros (punto tras la R,
 * comas, guion bajo, dos puntos, asterisco, "rn"), el aro primero, o el perfil
 * pegado al aro» — y «un total del juego (unitario × N) de un precio que el
 * cliente está viendo en la lámina».
 */
import { describe, expect, it } from "vitest";
import { medidaCanonica } from "../src/domain/tireSize.js";
import { aroEnTexto } from "../src/domain/medidaConfirmada.js";
import {
  medidaSinConfirmar, medidasDelMensaje, medidasEscritasPorElCliente, medidasParaElHecho,
} from "../src/domain/medidaDelCliente.js";
import { frenarHechosNuevosDelGuardian, podarHechosNuevosDelGuardian } from "../src/domain/guardianNoVendeSolo.js";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";

describe("un solo lector: las medidas escritas a mano de los chats de la familia 3", () => {
  const casos: [string, string, string][] = [
    ["27418", "X favor el precio de llantas 255 / 45 R.20 pará un jetour gracias", "255/45R20"],
    ["29259", "buen,día,en cuánto,me,sale,4,llantas,rin,15,75,215,grcias", "215/75R15"],
    ["29418", "Buenas noches requiero de un juego 245/7516", "245/75R16"],
    ["29418", "245/75/16", "245/75R16"],
    ["27352", "La medida es 235 × 75 rn 15", "235/75R15"],
    ["27352", "¡Hola! Quiero más información llantas rn15 AT 235 ×70 precio por favor gracias", "235/70R15"],
    ["27352 (brief)", "235/70R15 AT", "235/70R15"],
    ["25063", "¡Hola! Quiero más información en 205_45_16 xfa el presio ydonde boy", "205/45R16"],
    ["26561", "La medida es 185/ 65/15", "185/65R15"],
    ["27920", "195:55;15", "195/55R15"],
    ["28076", "225*70*16", "225/70R16"],
    ["28149", "205 _ 55 rin _ 17", "205/55R17"],
    ["28701", "Buenas tardes  En ese labrado espina de pescado 195_60_15", "195/60R15"],
    ["28854", "Buenas tardes tienen en 15 195 65 o 70 talvez y el precio", "195/65R15"],
    ["28854", "Lo mío es 195-65-15, ring 15.", "195/65R15"],
    ["29523", "245 60 15 dispone?", "245/60R15"],
    ["brief", "255/45 R20", "255/45R20"],
    ["brief", "215 75 15", "215/75R15"],
    ["29029 (sano)", "Buen día, me ayudas con 215/65/16", "215/65R16"],
  ];
  for (const [chat, texto, medida] of casos) {
    it(`${chat}: «${texto}» → ${medida}`, () => {
      expect(medidaCanonica(texto)).toBe(medida);
      expect(medidasEscritasPorElCliente([texto])).toEqual([medida]);
    });
  }
});

describe("lo que NO es una medida completa sigue sin serlo", () => {
  it("media medida (23160): «75  rin 15» no es medida, y el aro no se adivina", () => {
    expect(medidaCanonica("75  rin 15")).toBeNull();
    expect(medidasEscritasPorElCliente(["75  rin 15"])).toEqual([]);
  });
  it("solo el vehículo (8924): «Para una dmax 4/2» no trae medida", () => {
    expect(medidaCanonica("Para una dmax 4/2")).toBeNull();
  });
  it("«Rin 13 datsun 1200» es aro 13, no medida completa", () => {
    expect(medidaCanonica("Rin 13 datsun 1200")).toBeNull();
    expect(aroEnTexto("Rin 13 datsun 1200")).toBe(13);
  });
  it("«Rin. 16» (29900) es aro 16", () => {
    expect(aroEnTexto("Rin. 16")).toBe(16);
  });
  it("un teléfono con espacios no se vuelve medida pegada", () => {
    expect(medidaCanonica("mi número 0998 185 6514")).toBeNull();
    expect(medidaCanonica("llámeme al 099 185 6514")).toBeNull();
  });
  it("tres números sueltos sin forma de medida no inventan una", () => {
    expect(medidaCanonica("son 4 llantas a 15 dólares 100 cada una")).toBeNull();
  });
  it("la flotación sigue siendo flotación", () => {
    expect(medidaCanonica("33 * 12.5 rin 15")).toBe("33X12.5R15");
    expect(medidaCanonica("31x10.50x15")).toBe("31X10.5R15");
  });
});

describe("«el cliente escribió su medida» es un hecho del mensaje", () => {
  it("al guardar, el mensaje lleva las medidas que se leyeron", () => {
    expect(medidasParaElHecho("X favor el precio de llantas 255 / 45 R.20 pará un jetour gracias")).toEqual(["255/45R20"]);
    expect(medidasParaElHecho("Para una dmax 4/2")).toEqual([]);
  });
  it("el lector pregunta al hecho; sin hecho (mensajes de antes del deploy) lee el texto", () => {
    expect(medidasDelMensaje({ content: "texto cualquiera", metadata: { medida_escrita: ["255/45R20"] } })).toEqual(["255/45R20"]);
    expect(medidasDelMensaje({ content: "245/75/16", metadata: { medida_escrita: [] } })).toEqual([]);
    expect(medidasDelMensaje({ content: "245/75/16", metadata: {} })).toEqual(["245/75R16"]);
    expect(medidasDelMensaje({ content: "245/75/16", metadata: null })).toEqual(["245/75R16"]);
  });
});

describe("medidaSinConfirmar sale del hecho", () => {
  it("27418: la ficha 255/45R20 y el hecho «escribió 255/45R20» → confirmada", () => {
    expect(medidaSinConfirmar({
      tireSize: "255/45R20",
      escritasEnElCiclo: ["255/45R20"],
      escritasEnTodas: ["255/45R20"],
      aroDelCliente: null,
    })).toBe(false);
  });
  it("8924: solo el vehículo, la ficha la dedujo la herramienta → sin confirmar (se pide la medida)", () => {
    expect(medidaSinConfirmar({
      tireSize: "245/70R16", escritasEnElCiclo: [], escritasEnTodas: [], aroDelCliente: null,
    })).toBe(true);
  });
  it("con el aro del cliente no se bloquea (conv 3, 7-sep)", () => {
    expect(medidaSinConfirmar({
      tireSize: "185/60R14", escritasEnElCiclo: [], escritasEnTodas: [], aroDelCliente: 14,
    })).toBe(false);
  });
  it("una medida escrita en una visita anterior que coincide con la ficha también es suya", () => {
    expect(medidaSinConfirmar({
      tireSize: "215/65R16", escritasEnElCiclo: [], escritasEnTodas: ["215/65R16"], aroDelCliente: null,
    })).toBe(false);
  });
});

/** El metadato real de la pieza de opciones de la conv 27418 (producción, 14-oct 15:02). */
const PIEZA_27418 = {
  codes: ["K952B036"], error: null, piece: "options",
  motivo: "Para Jetour en esa medida, la Kenda SUV es la opción más adecuada por tipo de vehículo y disponibilidad",
  cantidad: 4,
  escalones: {
    premium: { codigo: "K952B036", nombre: "KENDA KR605", precio_con_iva: 192.97 },
    economica: { codigo: "K952B036", nombre: "KENDA KR605", precio_con_iva: 192.97 },
    equilibrada: { codigo: "K952B036", nombre: "KENDA KR605", precio_con_iva: 192.97 },
  },
  sizeLabel: "255/45R20", recomendado: "K952B036",
};
const BORRADOR_27418 =
  "Estas son las que más se usan en su vehículo, pero para cotizarle con seguridad necesito la medida exacta. ¿Me escribe la que dice el filo de la llanta (ej. 225/65R17), o me manda una foto del costado? 📸";
const CORRECCION_27418 =
  "Sí, para la medida *255/45R20* tengo esta opción para su Jetour:\n\n1 · *KENDA KR605* — *$192.97 c/u con IVA* · 4 = *$771.88*\n\n¿Le cotizo la 1?";
const YA_DICHO_27418 = [
  `Opciones enviadas: KENDA KR605\n${JSON.stringify(PIEZA_27418)}`,
  "¿Qué medida usa? Ej: 225/65R17\n{}",
].join("\n");
const PRODUCTOS_27418 = [{ code: "K952B036", brand: "KENDA", design: "KR605" }];

describe("la traba del Guardián: el total del juego de un precio en pantalla no es un precio nuevo", () => {
  it("27418: la corrección con «· 4 = $771.88» pasa (metadato real de la pieza)", () => {
    const r = frenarHechosNuevosDelGuardian(BORRADOR_27418, CORRECCION_27418, PRODUCTOS_27418, YA_DICHO_27418);
    expect(r.bloqueado).toBe(false);
    expect(r.texto).toBe(CORRECCION_27418);
  });

  it("27418 con el hecho explícito `preciosMostrados` de la pieza también pasa", () => {
    // El texto de la pieza nombra la llanta pero no trae ningún precio: el
    // único lugar donde está el $192.97 es el hecho.
    const soloElNombre = "Opciones enviadas: KENDA KR605\n{}";
    expect(frenarHechosNuevosDelGuardian(BORRADOR_27418, CORRECCION_27418, PRODUCTOS_27418, soloElNombre).bloqueado).toBe(true);
    const r = frenarHechosNuevosDelGuardian(BORRADOR_27418, CORRECCION_27418, PRODUCTOS_27418, soloElNombre, [192.97]);
    expect(r.bloqueado).toBe(false);
  });

  it("29418: la lista de tres con sus totales pasa", () => {
    const pieza = {
      piece: "options", codes: ["356525", "K407B664", "3800B606"], cantidad: 4, sizeLabel: "245/75R16",
      escalones: {
        premium: { codigo: "356525", nombre: "FALKEN WILDPEAK A/T 4W", precio_con_iva: 286.41 },
        economica: { codigo: "K407B664", nombre: "KENDA KR628", precio_con_iva: 163.4 },
        equilibrada: { lonas: 10, codigo: "3800B606", nombre: "KENDA KR29", precio_con_iva: 233.09 },
      },
    };
    const correccion =
      "Para la medida *245/75R16*, estas son las opciones disponibles para el juego de 4:\n\n1 · *KENDA KR628* — *$163.40 c/u* · 4 = *$653.60*\n2 · *KENDA KR29* — *$233.09 c/u* · 4 = *$932.36*\n3 · *FALKEN WILDPEAK A/T 4W* — *$286.41 c/u* · 4 = *$1145.64*\n\n¿Le cotizo la 1, la 2 o la 3?";
    const r = frenarHechosNuevosDelGuardian(
      BORRADOR_27418, correccion,
      [
        { code: "356525", brand: "FALKEN", design: "WILDPEAK A/T 4W" },
        { code: "K407B664", brand: "KENDA", design: "KR628" },
        { code: "3800B606", brand: "KENDA", design: "KR29" },
      ],
      `Opciones enviadas: FALKEN WILDPEAK A/T 4W · KENDA KR628 · KENDA KR29\n${JSON.stringify(pieza)}`,
    );
    expect(r.bloqueado).toBe(false);
  });

  it("un precio inventado sigue frenándose aunque haya pieza", () => {
    const inventado = CORRECCION_27418.replace("$771.88", "$700.00");
    const r = frenarHechosNuevosDelGuardian(BORRADOR_27418, inventado, PRODUCTOS_27418, YA_DICHO_27418);
    expect(r.bloqueado).toBe(true);
    expect(r.motivos).toContain("precio_nuevo");
  });

  it("sin nada en pantalla, el total de un precio inventado no pasa", () => {
    const r = frenarHechosNuevosDelGuardian(BORRADOR_27418, CORRECCION_27418, PRODUCTOS_27418, "");
    expect(r.bloqueado).toBe(true);
  });

  it("el precio de la cotización enviada (hecho `preciosMostrados` de la pieza quote) no es nuevo", () => {
    const correccion = "Su cotización es por 4 × *KENDA KR605* a *$192.97 c/u*, total *$771.88*.";
    const yaDicho = "Cotización COT-X enviada por $771.88\n{\"piece\":\"quote\"}\nOpciones enviadas: KENDA KR605\n{}";
    expect(frenarHechosNuevosDelGuardian("Le dejo su cotización.", correccion, PRODUCTOS_27418, yaDicho).bloqueado).toBe(true);
    expect(frenarHechosNuevosDelGuardian("Le dejo su cotización.", correccion, PRODUCTOS_27418, yaDicho, [192.97, 771.88]).bloqueado).toBe(false);
  });

  it("la poda tampoco corta la línea del total", () => {
    const podado = podarHechosNuevosDelGuardian(BORRADOR_27418, CORRECCION_27418, PRODUCTOS_27418, YA_DICHO_27418);
    expect(podado).toContain("$771.88");
  });
});
