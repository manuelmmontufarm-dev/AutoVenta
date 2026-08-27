/**
 * «DEME SOLO 3» — conversación 3, ciclo 7, producción, 27-ago-2026.
 *
 * El bot cotizó 4 × FALKEN ZE310R 225/65R17 por $637.96 y el cliente pidió 3.
 * Lo que salió, textual:
 *
 *   21:05 CLIENTE  «deme solo 3»
 *   21:05 BOT      «Sí, le queda por *3* de la misma *FALKEN ZE310R* que ya
 *                   tiene cotizada. Si quiere, le ajusto la cotización al
 *                   toque con esa cantidad.»
 *   21:06 CLIENTE  «dale»
 *   21:06 BOT      «Perfecto, queda anotado que necesita *3 unidades*…
 *                   Seguimos con el local: ¿a cuál de los dos le queda mejor ir?»
 *   21:10 CLIENTE  «ya pero quiero ver lo que esta cotizado»
 *   21:11 BOT      [reenvía la MISMA pieza de 4 llantas por $637.96]
 *
 * Manuel: «el cliente ni sabe cuánto le va a salir con 3 llantas». En los dos
 * turnos el modelo no llamó ninguna herramienta (`ai_runs`: routine_stage,
 * tools: []). El guardián sí lo vio —`promesa_incumplible` en alta— pero solo
 * reescribe texto.
 *
 * Y en la misma conversación aparecieron otras dos fallas de la misma familia
 * —el sistema anota algo que el cliente nunca ve, o no anota lo que sí dijo—:
 * el «2» del menú de preferencia se guardó como «quiere 2 llantas», y «al de
 * quito» no se reconoció como local, así que no se registró la sucursal y la
 * pregunta del día salió sin el monto del descuento.
 */
import { describe, expect, it } from "vitest";
import { esRespuestaDelMenuDePreferencia, extractExplicitQuantity, MARCA_DEL_MENU } from "../src/domain/salesIntent.js";
import { extractExplicitStore, PREGUNTA_DE_LOCAL, preguntamosElLocal } from "../src/domain/storeSelection.js";

/** El cierre de opciones tal como sale, recortado. */
const MENU = `Para afinarle la recomendación sobre las opciones que le envié, dígame una sola cosa: ${MARCA_DEL_MENU}

1) *Costo* — la más conveniente de precio
2) *Equilibrio* — la que mejor balancea precio y rendimiento
3) *Premium* — la de máxima calidad y durabilidad`;

describe("el «2» del menú es el escalón, no dos llantas", () => {
  it("EL BUG: contestar el menú ya no queda anotado como cantidad", () => {
    // Lo que pasó en la conv 3: el cliente contestó «2» (Equilibrio), compró
    // un juego de 4, y la ficha decía que quería 2.
    expect(extractExplicitQuantity("2")).toBe(2);            // el lector puro sigue igual
    expect(esRespuestaDelMenuDePreferencia("2", MENU)).toBe(true);  // pero acá se ataja
    for (const opcion of ["1", "2", "3", " 2 ", "la 2", "opción 3", "2)"]) {
      expect(esRespuestaDelMenuDePreferencia(opcion, MENU), opcion).toBe(true);
    }
  });

  it("EL CASO QUE NO DEBE DISPARAR: una cantidad de verdad sigue contando", () => {
    // Si el último mensaje NO fue el menú, un número suelto es una cantidad.
    expect(esRespuestaDelMenuDePreferencia("2", "¿Cuántas lleva?")).toBe(false);
    // Y aunque venga el menú, una frase con cantidad no es una respuesta al menú.
    for (const texto of ["deme solo 3", "quiero 2 llantas", "son 4", "juego"]) {
      expect(esRespuestaDelMenuDePreferencia(texto, MENU), texto).toBe(false);
    }
    expect(extractExplicitQuantity("deme solo 3")).toBe(3);
  });

  it("sin menú a la vista no ataja nada", () => {
    expect(esRespuestaDelMenuDePreferencia("2", null)).toBe(false);
    expect(esRespuestaDelMenuDePreferencia("2", "")).toBe(false);
  });
});

describe("«al de quito» es Quito Sur", () => {
  const preguntandoElLocal = "Puede pasar sin compromiso.\n📍 *Depot Tire Cumbayá*: https://x\n📍 *Depot Tire Quito Sur*: https://y\n¿A cuál de los dos le queda mejor ir? 📍";

  it("la pregunta nueva del local sigue siendo reconocible", () => {
    expect(preguntamosElLocal(preguntandoElLocal)).toBe(true);
  });

  it("EL BUG: el cliente dijo «al de quito» y no se registró ninguna sucursal", () => {
    for (const texto of ["al de quito", "el de quito", "quito", "al quito"]) {
      expect(extractExplicitStore(texto, { respondiendoAlLocal: true }), texto)
        .toBe("Depot Tire Quito Sur");
    }
  });

  it("lo que ya andaba sigue andando", () => {
    expect(extractExplicitStore("al sur", { respondiendoAlLocal: true })).toBe("Depot Tire Quito Sur");
    expect(extractExplicitStore("cumbaya", { respondiendoAlLocal: true })).toBe("Depot Tire Cumbayá");
    expect(extractExplicitStore("quito sur")).toBe("Depot Tire Quito Sur");
    expect(extractExplicitStore("el de cumbaya")).toBe("Depot Tire Cumbayá");
  });

  it("EL CASO QUE NO DEBE DISPARAR: fuera de la pregunta, «Quito» es dónde vive", () => {
    // Los dos locales están en Quito: sin la pregunta sobre la mesa, nombrar la
    // ciudad no elige ninguno.
    expect(extractExplicitStore("estoy en quito")).toBeNull();
    expect(extractExplicitStore("vivo en quito norte")).toBeNull();
  });

  it("y si nombra los dos, sigue sin adivinar", () => {
    expect(extractExplicitStore("en quito, cumbaya", { respondiendoAlLocal: true })).toBeNull();
  });
});

/**
 * REGRESIÓN QUE ME COMÍ YO. Al partir el cierre en dos mensajes (26-ago,
 * pedido de Joaquín: «que no pregunte a cuál local en el mismo mensaje que las
 * ubicaciones, sino uno corto después»), la pregunta corta dejó de nombrar los
 * locales — y `preguntamosElLocal` exigía ver «cumbayá» y «sur». La ventana son
 * los últimos 3 salientes, así que en cuanto se envía algo detrás, el mensaje
 * de los links se cae de ahí y el «al de quito» del cliente ya no se lee como
 * elección. Cazado en el simulador el 27-ago: el local no se registraba y el
 * guardián marcaba `estado_desincronizado`.
 */
describe("la pregunta corta del local sigue siendo reconocible", () => {
  it("EL BUG: la pregunta sola, sin los nombres, cuenta como preguntar el local", () => {
    expect(preguntamosElLocal(`${PREGUNTA_DE_LOCAL} 📍`)).toBe(true);
  });

  it("quien la escribe y quien la reconoce usan el MISMO texto", async () => {
    process.env.WHATSAPP_TOKEN ||= "test";
    process.env.WHATSAPP_APP_SECRET ||= "test";
    process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
    process.env.WHATSAPP_PHONE_ID ||= "test";
    process.env.SELLER_PHONE ||= "593000000000";
    process.env.OPENAI_API_KEY ||= "test";
    process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
    const qm = await import("../src/services/quoteMessages.js");
    // Si alguien reescribe la pregunta y se olvida del detector, esto falla.
    expect(qm.buildStoreChoiceBlocks().pregunta).toContain(PREGUNTA_DE_LOCAL);
    expect(preguntamosElLocal(qm.buildStoreChoiceBlocks().pregunta)).toBe(true);
  });

  it("la señal vieja —los dos nombres— sigue valiendo", () => {
    expect(preguntamosElLocal("📍 *Depot Tire Cumbayá*: x\n📍 *Depot Tire Quito Sur*: y")).toBe(true);
  });

  it("EL CASO QUE NO DEBE DISPARAR: otra pregunta no abre la puerta", () => {
    expect(preguntamosElLocal("¿Qué día cree que puede pasar?")).toBe(false);
    expect(preguntamosElLocal("¿Me confirma la medida?")).toBe(false);
    expect(preguntamosElLocal(null)).toBe(false);
  });
});
