import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  afirmaLaCotizacion, avisoStockCorto, recordatorioQueFalta, recordatorioStockCorto, yaAvisaDelStock,
} from "../src/domain/stockCorto.js";

/**
 * EL AVISO DE STOCK CORTO TIENE QUE SOBREVIVIR AL TURNO EN QUE NACIÓ.
 *
 * Caso real, conversación 11061 del 26-ago-2026 (Edison, taxi, 185/70R14).
 * El candado de stock funcionó: se creó la alerta al asesor y a las 12:04:11
 * salió «⚠️ hoy tengo *3* disponibles y usted pidió *4*». Y ahí murió — 35
 * segundos después el bot reenvió la pieza («4 unidades cotizadas») y 11
 * segundos más tarde resumió: «la cotización vigente que tiene es la
 * COT-MTACEW5X por 4 × KENDA KR203 185/70R14 a $65.65 c/u, total $262.60».
 * Ninguno de los dos mencionó el stock. El ÚLTIMO mensaje que leyó el cliente
 * —el que se lleva al local— prometía 4 llantas que no existían.
 *
 * Los textos de aquí son los de verdad, copiados de la base.
 */

const VIGENTE = { numero: "COT-MTACEW5X", cantidad: 4, total: 262.6, stockHoy: 3 };

/** El mensaje de las 12:04:57, tal cual salió (lo escribió el guardián). */
const EL_RESUMEN_CULPABLE =
  "Sí, si busca más duración podemos revisar una opción que le convenga para taxi.\n\n" +
  "Por ahora la cotización vigente que tiene es la *COT-MTACEW5X* por *4 × KENDA KR203 185/70R14* " +
  "a *$65.65 c/u*, total *$262.60*.\n\n" +
  "Además incluye instalación, alineación y balanceo, seguro gratuito contra golpes/cortes/daños, " +
  "revisión gratuita del vehículo y mantenimiento/rotación sin costo cada *10.000 km*.";

describe("el mensaje que afirma la cotización", () => {
  it("el resumen de las 12:04 la afirma: nombra el número, la cantidad y el total", () => {
    expect(afirmaLaCotizacion(EL_RESUMEN_CULPABLE, VIGENTE)).toBe(true);
  });

  it("«4 unidades» sin el número ni el total también la afirma", () => {
    // El otro mensaje del mismo caso: «…ya quedó cotizada: 4 unidades en
    // 185/70R14 a $65.65 c/u». Sin esto, media familia de recaídas se escapa.
    expect(afirmaLaCotizacion("ya quedó cotizada: *4 unidades* en 185/70R14", VIGENTE)).toBe(true);
  });

  it("«el juego de 4» la afirma", () => {
    expect(afirmaLaCotizacion("Le dejo listo el juego de 4 entonces", VIGENTE)).toBe(true);
  });

  it("preguntar el día NO la afirma — el aviso en cada turno sería ruido", () => {
    const cierre =
      "Puede pasar sin compromiso a verlas y probarlas en su vehículo.\n" +
      "¿Qué día puede pasar y a cuál local? ¿Depot Tire Cumbayá o Depot Tire Quito Sur?";
    expect(afirmaLaCotizacion(cierre, VIGENTE)).toBe(false);
  });

  it("hablar de otra llanta con otro precio no la afirma", () => {
    expect(afirmaLaCotizacion("La WINRUN R380 le sale a $54.59 c/u", VIGENTE)).toBe(false);
  });
});

describe("¿el texto ya avisa del stock?", () => {
  it("reconoce el aviso propio del bot", () => {
    expect(yaAvisaDelStock(avisoStockCorto(3, 4), 3)).toBe(true);
  });

  it("reconoce el recordatorio", () => {
    expect(yaAvisaDelStock(recordatorioStockCorto(3, 4), 3)).toBe(true);
  });

  it("reconoce el aviso escrito con las palabras del guardián", () => {
    // Salido del simulador el 26-ago: el guardián sí lo repitió una vez, con
    // sus propias palabras. Pegarle un segundo aviso encima sería peor.
    const delGuardian =
      "Sobre que las actuales le aguantan 8 meses: esta opción está pensada como alternativa " +
      "equilibrada. Eso sí, hoy aparecen *3 disponibles* y usted pidió *4*; el asesor le confirma el faltante.";
    expect(yaAvisaDelStock(delGuardian, 3)).toBe(true);
  });

  it("el resumen culpable NO avisa", () => {
    expect(yaAvisaDelStock(EL_RESUMEN_CULPABLE, 3)).toBe(false);
  });

  it("un «3» que no habla de stock no cuenta como aviso", () => {
    expect(yaAvisaDelStock("Le quedan 3 meses de garantía contra golpes", 3)).toBe(false);
  });
});

describe("la decisión completa: ¿hay que pegar el recordatorio?", () => {
  it("EL CASO: al resumen de las 12:04 le falta y se lo pone", () => {
    const recordatorio = recordatorioQueFalta(EL_RESUMEN_CULPABLE, VIGENTE);
    expect(recordatorio).toMatch(/hoy hay \*3\*/);
    expect(recordatorio).toMatch(/cotización es por \*4\*/);
    expect(recordatorio).toMatch(/asesor/);
  });

  it("al reenvío de la pieza también", () => {
    expect(recordatorioQueFalta("Aquí está de nuevo su cotización *COT-MTACEW5X* 🏁", VIGENTE)).not.toBeNull();
  });

  it("con stock de sobra no dice nada", () => {
    expect(recordatorioQueFalta(EL_RESUMEN_CULPABLE, { ...VIGENTE, stockHoy: 8 })).toBeNull();
  });

  it("pedir exactamente lo que hay tampoco avisa", () => {
    expect(recordatorioQueFalta(EL_RESUMEN_CULPABLE, { ...VIGENTE, stockHoy: 4 })).toBeNull();
  });

  it("si en bodega repusieron, el aviso desaparece solo", () => {
    // Se compara contra el stock de HOY, no contra el que había al firmar.
    expect(recordatorioQueFalta(EL_RESUMEN_CULPABLE, { ...VIGENTE, stockHoy: 10 })).toBeNull();
  });

  it("en cero se calla: eso ya no es un recordatorio, es una llamada del asesor", () => {
    expect(recordatorioQueFalta(EL_RESUMEN_CULPABLE, { ...VIGENTE, stockHoy: 0 })).toBeNull();
  });

  it("no lo repite si el mensaje ya lo trae", () => {
    const conAviso = `${EL_RESUMEN_CULPABLE}\n\n${avisoStockCorto(3, 4)}`;
    expect(recordatorioQueFalta(conAviso, VIGENTE)).toBeNull();
  });

  it("no se lo pega a un mensaje que no promete nada", () => {
    expect(recordatorioQueFalta("¿Qué día puede pasar, y a cuál local?", VIGENTE)).toBeNull();
  });
});


describe("el orden de los candados en el turno", () => {
  /**
   * El aviso de stock tiene que ser LO ÚLTIMO que se decide sobre el texto.
   *
   * En producción el mensaje que prometió las 4 llantas lo escribió el Ángel
   * Guardián, corrigiendo otra cosa. Si el candado corriera antes que él —como
   * corría `applyOutboundGuard`— el guardián podría volver a borrar el aviso y
   * el candado no se enteraría. Esta prueba fija el orden: quien reescribe va
   * primero, el aviso de stock va después.
   */
  const index = readFileSync(resolve(__dirname, "../src/index.ts"), "utf8");

  it("asegurarAvisoDeStock corre DESPUÉS de revisarConGuardian", () => {
    const guardian = index.indexOf("revisarConGuardian(conversation");
    const stock = index.indexOf("asegurarAvisoDeStock(");
    expect(guardian, "no se encontró la llamada al guardián").toBeGreaterThan(0);
    expect(stock, "no se encontró la llamada al aviso de stock").toBeGreaterThan(0);
    expect(stock).toBeGreaterThan(guardian);
  });

  it("los bloques que se envían salen del texto con el aviso ya puesto", () => {
    // Si alguien vuelve a partir `custodiado.texto`, el aviso se pierde en el
    // último metro sin que ninguna otra prueba lo note.
    expect(index).toContain("splitBlocks(conStock.texto)");
  });

  it("las tres puertas de la cotización usan el mismo módulo", () => {
    // El agente (tools), la ruta directa (sin agente) y el envío (index).
    for (const archivo of ["../src/agent/tools.ts", "../src/services/directSalesRoutes.ts", "../src/index.ts"]) {
      const texto = readFileSync(resolve(__dirname, archivo), "utf8");
      expect(texto, `${archivo} no consulta el faltante de stock`).toMatch(/stockCorto\.js/);
    }
  });
});
