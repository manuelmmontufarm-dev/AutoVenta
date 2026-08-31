import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  afirmaLaCotizacion, avisoStockCorto, recordatorioQueFalta, recordatorioStockCorto, yaAvisaDelStock,
} from "../src/domain/stockCorto.js";
// La cadena de candados arrastra la config de la app al importarse (el
// guardián, la base). Estos valores de mentira son solo para que el import no
// se caiga: ninguna prueba de este archivo toca la red ni la base.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { PASOS, pasosPara } = await import("../src/services/prepararSalida.js");

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
   * El orden es un DATO, no el orden de unas líneas en un archivo.
   *
   * Hasta el 27-ago esta prueba leía `src/index.ts` como texto y comparaba
   * posiciones con `indexOf`. Vigilaba una sola de las cuatro puertas por las
   * que el bot le habla a un cliente, y no se enteraba de que `resumeBot`
   * corría UN candado de los ocho. Ahora la cadena vive en `PASOS`
   * (services/prepararSalida.ts) y esto afirma sobre esa lista: falla si se
   * reordena o se quita un paso, y NO falla por mover una línea de `index.ts`.
   */
  const nombres = PASOS.map((p) => p.nombre);

  it("la cadena es exactamente esta, en este orden", () => {
    expect(nombres).toEqual([
      "sin_pregunta_pendiente_consecutiva",
      "guardian_deterministico",
      "angel_guardian",
      "guardian_no_vende_solo",
      // El dedupe repite DESPUÉS del guardián porque él reescribe y puede
      // reintroducir la pregunta ya vetada (T115 conv 9887, 30-ago).
      "sin_pregunta_consecutiva_tras_guardian",
      "aviso_de_stock",
      "alcance_fuera_de_catalogo",
      "despedida_de_venta_perdida",
      "ubicacion_cuando_la_piden",
      "insistir_con_lo_que_falta",
      // Regla 3 del corpus: si el texto afirma un aviso, el aviso existe
      // (T115 E01, 31-ago: el mini escribió «ya le avisé» sin avisar).
      "lo_prometido_se_ejecuta",
      "sin_preguntas_prohibidas",
      "sin_json_crudo",
      "sin_locales_inventados",
      "sin_numeros_de_cotizacion",
      "pregunta_en_su_propio_mensaje",
    ]);
  });

  it("la política de aceite propio queda respaldada aunque el modelo afirme que sí", async () => {
    const paso = PASOS.find((p) => p.nombre === "alcance_fuera_de_catalogo")!;
    const salida = await paso.aplicar("Sí, puede llevar su aceite.", {
      conversation: { id: 1, current_cycle: 1, stage: "nuevo" },
      tipo: "respuesta",
      textoDelCliente: "¿Puedo llevar mi aceite?",
      consultaFueraDeCatalogo: true,
    } as never);

    expect(salida).toMatch(/no puedo confirmarle/i);
    expect(salida).toMatch(/asesor/i);
    expect(salida).not.toMatch(/^s[íi]/i);
  });

  /**
   * El aviso de stock tiene que ser LO ÚLTIMO que se decide sobre el texto.
   *
   * En producción el mensaje que prometió las 4 llantas lo escribió el Ángel
   * Guardián, corrigiendo otra cosa. Si el candado corriera antes que él —como
   * corría `applyOutboundGuard`— el guardián podría volver a borrar el aviso y
   * el candado no se enteraría. Esta prueba fija el orden: quien reescribe va
   * primero, el aviso de stock va después.
   */
  it("el aviso de stock corre DESPUÉS del Ángel Guardián", () => {
    expect(nombres.indexOf("aviso_de_stock"))
      .toBeGreaterThan(nombres.indexOf("angel_guardian"));
  });

  it("el freno de ofertas nuevas corre inmediatamente DESPUÉS del Ángel Guardián", () => {
    expect(nombres.indexOf("guardian_no_vende_solo"))
      .toBe(nombres.indexOf("angel_guardian") + 1);
  });

  it("el candado del JSON crudo también corre DESPUÉS del guardián", () => {
    // Misma razón que el aviso de stock: quien puede dejar salir el JSON es el
    // Ángel Guardián, que reescribe el texto entero al final.
    expect(nombres.indexOf("sin_json_crudo"))
      .toBeGreaterThan(nombres.indexOf("angel_guardian"));
  });

  it("los tres candados deterministas del final van después de quien reescribe", () => {
    // Las preguntas de más, el JSON crudo y los números de cotización: los tres
    // corren DESPUÉS del guardián, que es quien reescribe.
    for (const candado of ["sin_preguntas_prohibidas", "sin_json_crudo", "sin_numeros_de_cotizacion"]) {
      expect(nombres.indexOf(candado), candado)
        .toBeGreaterThan(nombres.indexOf("angel_guardian"));
    }
  });

  it("la pregunta se separa LO ÚLTIMO, con la cadena ya terminada", () => {
    // Los candados de arriba todavía pueden pegar o reescribir la pregunta del
    // cierre, así que separarla antes no serviría de nada (27-ago).
    expect(nombres[nombres.length - 1]).toBe("pregunta_en_su_propio_mensaje");
  });

  it("el turno normal corre la cadena entera", () => {
    expect(pasosPara("respuesta").map((p) => p.nombre)).toEqual(nombres);
  });

  it("el bot que retoma tras un humano corre los mismos candados", () => {
    // La fuga que motivó todo esto: `resumeBot` llama al MISMO `runAgent` con
    // las MISMAS herramientas y corría UNO de los ocho.
    const retomada = pasosPara("retomada").map((p) => p.nombre);
    for (const candado of ["guardian_deterministico", "angel_guardian", "guardian_no_vende_solo", "aviso_de_stock",
      "sin_preguntas_prohibidas", "sin_json_crudo", "sin_numeros_de_cotizacion"]) {
      expect(retomada, candado).toContain(candado);
    }
  });

  it("el seguimiento corre los deterministas, sin bloquear el envío", () => {
    const seguimiento = pasosPara("seguimiento").map((p) => p.nombre);
    for (const candado of ["angel_guardian", "guardian_no_vende_solo", "aviso_de_stock",
      "sin_preguntas_prohibidas", "sin_json_crudo", "sin_numeros_de_cotizacion"]) {
      expect(seguimiento, candado).toContain(candado);
    }
    // El guardián determinístico puede DEVOLVER null (no enviar), y en un
    // seguimiento eso dejaría el job contabilizado como enviado sin mensaje.
    expect(seguimiento).not.toContain("guardian_deterministico");
    // Y la pregunta no se separa: el seguimiento sale como un solo mensaje, así
    // que el «---» le quedaría a la vista al cliente.
    expect(seguimiento).not.toContain("pregunta_en_su_propio_mensaje");
  });

  it("la plantilla fuera de ventana no recibe NADA", () => {
    // Su texto lo fija Meta y no se puede tocar. Pasa igual por la cadena para
    // que no quede ninguna puerta suelta — con la lista vacía.
    expect(pasosPara("plantilla")).toEqual([]);
  });

  it("las dos puertas que COTIZAN usan el mismo módulo", () => {
    // El agente (tools) y la ruta directa (sin agente). El envío ya no aparece
    // acá: desde el 27-ago las tres puertas de SALIDA consultan el faltante a
    // través de `PASOS`, y eso lo prueba la lista de arriba en vez del fuente.
    for (const archivo of ["../src/agent/tools.ts", "../src/services/directSalesRoutes.ts"]) {
      const texto = readFileSync(resolve(__dirname, archivo), "utf8");
      expect(texto, `${archivo} no consulta el faltante de stock`).toMatch(/stockCorto\.js/);
    }
  });
});
