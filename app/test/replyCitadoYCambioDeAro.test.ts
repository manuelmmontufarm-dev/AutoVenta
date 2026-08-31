/**
 * Las dos heridas de la prueba en vivo del 31-ago 14:02–14:04 (Depot Tire).
 *
 * Manuel venía trabajando una 33X12.5R20, pidió «rin 15» y el bot le mostró
 * bien tres opciones de aro 15 con el menú de preferencia al final. Contestó
 * «2» CON REPLY a ese menú y el bot le mandó una WILDPEAK M/T01 33X12.5R20
 * rotulada «MEDIDA EXACTA»: leyó el «2» como «quiero 2 llantas» y agarró la
 * medida vieja, que seguía en la ficha.
 *
 * 1. El reply de WhatsApp no se leía en ningún lado: el «2» se desempataba
 *    adivinando con los últimos salientes.
 * 2. La medida de trabajo solo se borraba al reiniciar el chat (`/restart`) o
 *    al caducar por silencio; cambiar de aro dentro del mismo ciclo la dejaba
 *    intacta.
 */
import { describe, expect, it } from "vitest";
import {
  cantidadParaPrepararOpciones,
  esRespuestaDelMenuDePreferencia,
  MARCA_DEL_MENU,
} from "../src/domain/salesIntent.js";
import { aroDeLaMedida } from "../src/domain/medidaPedida.js";

const MENU = `Para afinarle la recomendación sobre estas opciones, dígame una sola cosa: ${MARCA_DEL_MENU}

1) *Costo* — la más conveniente de precio
2) *Equilibrio* — la que mejor balancea precio y rendimiento
3) *Premium* — la de máxima calidad y durabilidad`;

/** La vitrina que salió después, sin ninguna pregunta de preferencia. */
const VITRINA = "Opciones disponibles 🏁";

describe("el reply de WhatsApp desempata el «2»", () => {
  it("EL BUG: citar el menú lo vuelve el escalón aunque no sea lo último que dijimos", () => {
    // Esto es lo que pasó: entre el menú y el «2» salieron otros salientes, así
    // que la heurística de «lo último que dijimos» ya no veía el menú.
    expect(esRespuestaDelMenuDePreferencia("2", VITRINA)).toBe(false);
    expect(esRespuestaDelMenuDePreferencia("2", VITRINA, MENU)).toBe(true);
    // Y por lo tanto deja de anotarse como cantidad.
    expect(
      cantidadParaPrepararOpciones({
        declarada: null, guardada: null, textoActual: "2",
        ultimoMensajeNuestro: VITRINA, mensajeCitado: MENU,
      }).origen,
    ).not.toBe("respaldo_textual");
  });

  it("EL REVERSO: citar OTRA COSA descarta el escalón, aunque el menú siga a la vista", () => {
    // Un «2» que cita la vitrina son dos llantas. La heurística sola decía que
    // era el escalón porque el menú estaba entre los últimos salientes.
    expect(esRespuestaDelMenuDePreferencia("2", MENU)).toBe(true);
    expect(esRespuestaDelMenuDePreferencia("2", MENU, VITRINA)).toBe(false);
    expect(
      cantidadParaPrepararOpciones({
        declarada: null, guardada: null, textoActual: "2",
        ultimoMensajeNuestro: MENU, mensajeCitado: VITRINA,
      }),
    ).toMatchObject({ cantidad: 2, origen: "respaldo_textual" });
  });

  it("sin reply no cambia nada de lo que ya funcionaba", () => {
    expect(esRespuestaDelMenuDePreferencia("2", MENU, null)).toBe(true);
    expect(esRespuestaDelMenuDePreferencia("2", VITRINA, null)).toBe(false);
    // Y una frase con cantidad no es respuesta al menú ni citándolo.
    for (const texto of ["deme solo 3", "quiero 2 llantas", "son 4"]) {
      expect(esRespuestaDelMenuDePreferencia(texto, MENU, MENU), texto).toBe(false);
    }
  });
});

describe("el aro de la medida de trabajo", () => {
  it("lee métrica y flotación por igual", () => {
    expect(aroDeLaMedida("235/75R15")).toBe(15);
    expect(aroDeLaMedida("185/65R15")).toBe(15);
    expect(aroDeLaMedida("33X12.5R20")).toBe(20);
    expect(aroDeLaMedida("33x12.50R20")).toBe(20);
  });

  it("EL BUG: el aro pedido no coincidía con la medida que venía arrastrando", () => {
    // «rin 15» con una 33X12.5R20 en la ficha: son llantas distintas, y el bot
    // tiene que soltar la vieja en vez de rotularla «MEDIDA EXACTA».
    expect(aroDeLaMedida("33X12.5R20")).not.toBe(15);
  });

  it("en la duda no decide nada: sin medida legible, null", () => {
    for (const nada of [null, undefined, "", "no sé", "una A/T buena"]) {
      expect(aroDeLaMedida(nada as string | null), String(nada)).toBeNull();
    }
  });
});
