import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { sinNumerosDeCotizacion, tieneNumeroDeCotizacion } from "../src/domain/numerosDeCotizacion.js";
import { despedidaQueCorresponde } from "../src/domain/cierrePerdido.js";
import { recordatorioQueFalta } from "../src/domain/stockCorto.js";

const fuenteGuardian = (): string => readFileSync(
  join(fileURLToPath(new URL("..", import.meta.url)), "src/services/guardian.ts"),
  "utf8",
);

/**
 * LA RÚBRICA DEL GUARDIÁN NO COBRA POR TRABAJO QUE YA HACE UN CANDADO.
 *
 * Medido el 12-sep-2026: la rúbrica pesaba ~4.900 tokens y se manda en CADA
 * corrida (5.740 en 30 días, el 55 % de la factura de IA). Creció de 1.388 a
 * 6.505 tokens de entrada en cinco semanas porque cada error nuevo se resolvió
 * agregándole un párrafo — era más fácil que ponerlo en su capa.
 *
 * El guardián corre en el paso 3 de los 24 de `prepararSalida.ts` y los
 * candados deterministas corren DESPUÉS. Cuando un candado ya hace el trabajo,
 * lo que el guardián escribió se descarta: son tokens que se pagan para
 * producir texto que se tira.
 *
 * Estas pruebas son el cerrojo del nivel 1 del plan
 * (`docs/PLAN-ADELGAZAR-GUARDIAN.md`): fijan que las reglas salieron de la
 * rúbrica Y que el candado que las reemplaza sigue sosteniendo el caso solo.
 * Sin la segunda mitad, borrar la regla es devolverle el error al cliente.
 */
describe("las reglas que un candado ya hace salieron de la rúbrica", () => {
  it("la 14 (números de cotización) no está: la hace `sin_numeros_de_cotizacion`", () => {
    const fuente = fuenteGuardian();
    expect(fuente).not.toContain("NÚMEROS DE COTIZACIÓN: NUNCA en el mensaje al cliente");
  });

  it("la 10 (aviso de stock corto) no está: la hace `aviso_de_stock`", () => {
    const fuente = fuenteGuardian();
    expect(fuente).not.toContain("10. DISPONIBILIDAD. Si los HECHOS traen la línea «STOCK CORTO»");
  });

  it("la 17 (stock no alcanza) SÍ se queda: el candado solo pega el aviso, y ahí no basta", () => {
    const fuente = fuenteGuardian();
    expect(fuente).toContain("AVISAR DEL STOCK NO SIEMPRE ALCANZA");
  });
});

/**
 * LA 18 SE MUEVE, NO SE BORRA.
 *
 * `despedida_de_venta_perdida` corre en `respuesta` y `retomada` pero NO en
 * `seguimiento`, y el guardián revisa seguimientos: 1.121 de sus 5.740
 * corridas del mes (19,5 %). Borrarla dejaría ese camino sin nadie que frene
 * la insistencia a quien ya se despidió.
 */
describe("la 18 (al que se despidió no se le insiste) vive solo en el bloque de seguimiento", () => {
  it("salió de la rúbrica general", () => {
    const fuente = fuenteGuardian();
    const general = fuente.slice(
      fuente.indexOf("export const INSTRUCCIONES = `"),
      fuente.indexOf("const INSTRUCCIONES_SEGUIMIENTO"),
    );
    expect(general).not.toContain("AL QUE SE DESPIDIÓ NO SE LE INSISTE");
  });

  it("y está en el de seguimiento, que es la puerta sin candado", () => {
    const fuente = fuenteGuardian();
    const seguimiento = fuente.slice(fuente.indexOf("const INSTRUCCIONES_SEGUIMIENTO"));
    expect(seguimiento.slice(0, 2000)).toContain("AL QUE SE DESPIDIÓ NO SE LE INSISTE");
  });
});

/**
 * LA OTRA MITAD: EL CANDADO SOSTIENE EL CASO SIN LA REGLA.
 *
 * Cada uno de estos casos es el que la regla borrada atendía. Si alguno se
 * pone rojo, la regla tiene que volver a la rúbrica — no se deja el hueco.
 */
describe("el candado sostiene lo que la rúbrica dejó de decir", () => {
  it("el número de cotización se va aunque lo escriba el guardián", () => {
    // El caso real: en el chat de Andrés Tamayo (26-ago) fue el GUARDIÁN quien
    // llenó cuatro mensajes seguidos de «COT-MTACN72K», discutiendo consigo
    // mismo delante del cliente.
    const delGuardian = "Su cotización COT-MTACN72K por 4 Falken Wildpeak queda lista.";
    expect(tieneNumeroDeCotizacion(delGuardian)).toBe(true);
    const limpio = sinNumerosDeCotizacion(delGuardian);
    expect(limpio).toBe("Su cotización por 4 Falken Wildpeak queda lista.");
    expect(tieneNumeroDeCotizacion(limpio)).toBe(false);
  });

  it("y también el `AV-`, sin llevarse el cupón ni la medida", () => {
    const texto = "Cotización AV-9K3MZ1 de 4 en 235/75R15. Su código es DT-PUMA47.";
    const limpio = sinNumerosDeCotizacion(texto);
    expect(limpio).toBe("Cotización de 4 en 235/75R15. Su código es DT-PUMA47.");
  });

  it("el aviso de stock corto se pega solo cuando el borrador afirma la cotización", () => {
    const cotizacion = { numero: "COT-X1", cantidad: 4, total: 262.6, stockHoy: 3 };
    // Afirma la cotización y no avisa → el candado pone el dato.
    expect(recordatorioQueFalta("Le confirmo el juego de 4 por $262.60.", cotizacion)).toBeTruthy();
    // Los dos modos de equivocarse que la regla 10 enumeraba, ya cubiertos:
    expect(recordatorioQueFalta("¿Qué día cree que puede pasar?", cotizacion)).toBeNull();
    expect(
      recordatorioQueFalta("Le confirmo el juego de 4; hoy hay 3 y el resto lo confirma el asesor.", cotizacion),
    ).toBeNull();
  });

  it("la despedida reemplaza el borrador entero cuando el cliente ya compró en otro lado", () => {
    // El caso de la regla 18 (conv 4732, 27-ago): «Gracias ya compré en otro
    // lugar» y en el mismo turno recibió la pregunta del día con descuento.
    expect(despedidaQueCorresponde("Gracias ya compré en otro lugar")).toBeTruthy();
    // Y el no blando sigue sin cerrar: es un botón del propio bot.
    expect(despedidaQueCorresponde("otro día")).toBeNull();
  });
});

/**
 * EL CERROJO DE VERDAD: EL ORDEN Y LAS PUERTAS.
 *
 * Borrar una regla de la rúbrica solo es seguro mientras su candado (a) corra
 * DESPUÉS del guardián —él es la última mano que reescribe— y (b) corra en las
 * MISMAS puertas que el guardián revisa. Si alguien mueve un paso de sitio o le
 * recorta el `corre`, la regla borrada deja un hueco y nadie se entera.
 *
 * Por eso esto se prueba sobre `PASOS` y no sobre la intención.
 */
describe("el orden y las puertas que sostienen los recortes", () => {
  let PASOS: typeof import("../src/services/prepararSalida.js")["PASOS"];

  beforeAll(async () => {
    process.env.WHATSAPP_TOKEN ||= "test";
    process.env.WHATSAPP_APP_SECRET ||= "test";
    process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
    process.env.WHATSAPP_PHONE_ID ||= "test";
    process.env.SELLER_PHONE ||= "593000000000";
    process.env.OPENAI_API_KEY ||= "test";
    process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
    ({ PASOS } = await import("../src/services/prepararSalida.js"));
  });

  const indice = (nombre: string): number => PASOS.findIndex((p) => p.nombre === nombre);

  it("los tres candados corren DESPUÉS del Ángel Guardián", () => {
    const guardian = indice("angel_guardian");
    expect(guardian).toBeGreaterThanOrEqual(0);
    for (const candado of ["sin_numeros_de_cotizacion", "aviso_de_stock", "despedida_de_venta_perdida"]) {
      expect(indice(candado), `${candado} no está en PASOS`).toBeGreaterThan(guardian);
    }
  });

  it("las reglas BORRADAS tienen su candado en las tres puertas que el guardián revisa", () => {
    const puertasDelGuardian = PASOS[indice("angel_guardian")].corre;
    expect([...puertasDelGuardian].sort()).toEqual(["respuesta", "retomada", "seguimiento"]);
    // Si una de estas pierde una puerta, la regla tiene que volver a la rúbrica.
    for (const candado of ["sin_numeros_de_cotizacion", "aviso_de_stock"]) {
      expect([...PASOS[indice(candado)].corre].sort(), candado).toEqual(["respuesta", "retomada", "seguimiento"]);
    }
  });

  it("y la regla MOVIDA sigue siendo la que hace falta: su candado no cubre `seguimiento`", () => {
    // Esta es la razón exacta de que la 18 viva en INSTRUCCIONES_SEGUIMIENTO en
    // vez de estar borrada. El día que este paso cubra `seguimiento`, la regla
    // se puede sacar de ahí también — y esta prueba es la que lo va a avisar.
    expect([...PASOS[indice("despedida_de_venta_perdida")].corre].sort()).toEqual(["respuesta", "retomada"]);
  });
});
