import { describe, expect, it } from "vitest";
import {
  esAutorHumano,
  puedeSaludarComoPrimerContacto,
  quienContesta,
} from "../src/domain/turnoDelHumano.js";
import {
  afirmaQueAviso,
  prometeConsultar,
  RESPUESTA_SIN_AVISO,
  sinAvisoInventado,
} from "../src/domain/avisoAlAsesor.js";
import { quiereComprarADistancia } from "../src/domain/compraADistancia.js";

/**
 * FAMILIA 2-E: EL BOT SE METE EN UN CHAT QUE ATIENDE UNA PERSONA, O DICE QUE
 * ESCALÓ Y NO PASA NADA.
 *
 * Los textos y las horas son los de producción (convs 15426, 21640, 21766 y
 * 23084, 4 al 28-sep-2026).
 */

describe("quién contesta: el turno del humano", () => {
  // Conv 15426: el dueño atendió a mano el 21-sep hasta las 16:45:48 (Quito).
  // La pausa de 6 h venció a las 22:45. El cliente escribió «Buenas tardes» al
  // día siguiente a las 12:24 y el bot le contestó «Soy Martín… ¿Qué medida
  // usa?» a alguien que venía hablando con el dueño de una F-150 aro 20.
  const PAUSA_VENCIDA = new Date("2026-09-22T03:45:48Z");
  const BUENAS_TARDES = new Date("2026-09-22T17:24:32Z");

  it("el humano habló último y nadie le devolvió el chat al bot: calla aunque la pausa haya vencido", () => {
    expect(quienContesta({
      asignadoA: "human", pausaHasta: PAUSA_VENCIDA, autorDelUltimoSaliente: "owner", ahora: BUENAS_TARDES,
    })).toEqual({ contesta: "humano", motivo: "el_humano_hablo_ultimo" });
  });

  it("con la pausa vigente calla siempre (conv 21640: escribió 80 min después del traspaso)", () => {
    expect(quienContesta({
      asignadoA: "human",
      pausaHasta: new Date("2026-09-20T20:00:00Z"),
      autorDelUltimoSaliente: "bot",
      ahora: new Date("2026-09-20T15:20:00Z"),
    })).toEqual({ contesta: "humano", motivo: "pausa_vigente" });
  });

  it("si el asesor se lo devolvió al bot explícitamente, contesta el bot", () => {
    expect(quienContesta({
      asignadoA: "bot", pausaHasta: null, autorDelUltimoSaliente: "owner", ahora: BUENAS_TARDES,
    })).toEqual({ contesta: "bot" });
  });

  it("pausa vencida y el último que habló fue el bot: vuelve al bot (red del 8-ago intacta)", () => {
    expect(quienContesta({
      asignadoA: "human", pausaHasta: PAUSA_VENCIDA, autorDelUltimoSaliente: "bot", ahora: BUENAS_TARDES,
    })).toEqual({ contesta: "bot" });
  });

  it("owner y advisor son personas; bot, system y nada no", () => {
    expect(esAutorHumano("owner")).toBe(true);
    expect(esAutorHumano("advisor")).toBe(true);
    expect(esAutorHumano("bot")).toBe(false);
    expect(esAutorHumano("system")).toBe(false);
    expect(esAutorHumano(null)).toBe(false);
  });

  it("después de un asesor no sale el saludo de primer contacto", () => {
    expect(puedeSaludarComoPrimerContacto("owner")).toBe(false);
    expect(puedeSaludarComoPrimerContacto(null)).toBe(true);
    expect(puedeSaludarComoPrimerContacto("bot")).toBe(true);
  });
});

describe("«ya avisé» solo si quedó registrado", () => {
  // Conv 23084, 24-sep 19:51 (este sí tenía alerta; es la forma de la frase).
  const LOJA =
    "Para provincias como Loja, lo revisa un asesor porque depende de cobertura y envío. " +
    "Ya dejé el caso anotado para que le confirmen 🙌\n\n" +
    "La opción que venía revisando es la *KENDA KR628* en *265/70R16*.";
  // Conv 21766, 20-sep 16:52.
  const PAGO =
    "Ya está avisado el asesor. Por este medio no confirmo cobros ni pagos; ellos le indican el paso seguro para cancelar y coordinar el envío o entrega.";

  it("reconoce las afirmaciones de haber escalado", () => {
    expect(afirmaQueAviso(LOJA)).toBe(true);
    expect(afirmaQueAviso(PAGO)).toBe(true);
    expect(afirmaQueAviso("Ya le avisé al asesor 👍")).toBe(true);
    expect(afirmaQueAviso("Ya pasé su caso al asesor")).toBe(true);
  });

  it("no confunde la promesa condicional del cierre ni lo que confirma el local", () => {
    expect(afirmaQueAviso(
      "¿Qué día cree que puede pasar por *Depot Tire Cumbayá*? Con ese dato le aviso al asesor y le dejan lista su cotización.",
    )).toBe(false);
    expect(afirmaQueAviso("El descuento en efectivo se lo confirman en el local.")).toBe(false);
  });

  it("sin registro, la afirmación se cambia por «se lo consulto y le confirmo» y lo demás queda", () => {
    const { texto, cambiado } = sinAvisoInventado(LOJA);
    expect(cambiado).toBe(true);
    expect(texto).toContain(RESPUESTA_SIN_AVISO);
    expect(texto).not.toMatch(/dej[eé] el caso anotado/i);
    expect(texto).not.toMatch(/lo revisa un asesor/i);
    expect(texto).toContain("*KENDA KR628* en *265/70R16*");
    expect(texto.match(/Se lo consulto y le confirmo/g)).toHaveLength(1);
  });

  it("la frase de pago conserva lo cierto y pierde solo el «ya está avisado»", () => {
    const { texto } = sinAvisoInventado(PAGO);
    expect(texto).not.toMatch(/avisado/i);
    expect(texto).toContain("Por este medio no confirmo cobros ni pagos");
  });

  it("las formas que ya atajaba lo_prometido_se_ejecuta siguen reconocidas", () => {
    expect(afirmaQueAviso("Dejé su caso avisado a un asesor")).toBe(true);
    expect(afirmaQueAviso("Quedó notificado el asesor")).toBe(true);
    expect(afirmaQueAviso("Ya le pasé su consulta al asesor")).toBe(true);
  });

  it("«se lo consulto» es la promesa honesta que el candado registra", () => {
    expect(prometeConsultar(RESPUESTA_SIN_AVISO)).toBe(true);
    expect(prometeConsultar("Para no repetirle lo mismo: se lo consulto a un asesor y le confirmo apenas haya novedad. 🤝")).toBe(true);
    expect(afirmaQueAviso(RESPUESTA_SIN_AVISO)).toBe(false);
  });

  it("un texto sin afirmación no se toca", () => {
    const sano = "Tenemos la *KENDA KR628* en *265/70R16* a $172.55 c/u.";
    expect(sinAvisoInventado(sano)).toEqual({ texto: sano, cambiado: false });
  });
});

describe("compra a distancia", () => {
  it("conv 21766: «Lo compro x este medio me cotiza lo cancelo comfirma y me envia»", () => {
    expect(quiereComprarADistancia("Lo compro x este medio me cotiza lo cancelo comfirma y me envia")).toBe(true);
  });

  it("otras formas reales de decirlo", () => {
    expect(quiereComprarADistancia("Le hago la transferencia y me las envía a Ambato")).toBe(true);
    expect(quiereComprarADistancia("Pago por transferencia y me lo mandan a domicilio")).toBe(true);
    expect(quiereComprarADistancia("quiero comprar por aquí y que me lo envíen")).toBe(true);
  });

  it("no es compra a distancia preguntar, venir, ni pagar en el local", () => {
    expect(quiereComprarADistancia("¿Cuánto cuesta?")).toBe(false);
    expect(quiereComprarADistancia("Mañana paso a comprarlas a Cumbayá")).toBe(false);
    expect(quiereComprarADistancia("¿Aceptan transferencia?")).toBe(false);
    expect(quiereComprarADistancia("Lo compro, el sábado paso")).toBe(false);
  });
});
