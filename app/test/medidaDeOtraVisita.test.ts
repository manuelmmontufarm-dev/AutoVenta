/**
 * La cotización de otra medida — conversación 4732 (Andrés Tamayo), 26-ago-2026.
 *
 * Lo que vio Joaquín: «aquí le cotizó mal a mi papá que estaba haciendo
 * pruebas. Pidió una medida que no había, le dio la opción alterna correcta,
 * pero cuando mandó la cotización le mandó de otra medida completamente
 * diferente, y luego nunca le mandó la cotización».
 *
 * Lo que pasó de verdad, leído de producción:
 *
 *  · 13-ago 03:14 — el cliente compra para una Dongfeng: pide **265/65R17** y
 *    se le cotiza la FALKEN WILDPEAK A/T 4W código 356398. La conversación
 *    nunca se cierra, así que el ciclo 1 sigue abierto.
 *  · 26-ago 15:54 — vuelve por OTRO carro: «Hola llantas 235/70R15». No hay
 *    stock exacto y el bot le ofrece bien la equivalente: FALKEN WILDPEAK
 *    A/T 4W en **235/75R15**, código 356521.
 *  · 26-ago 15:55 — «Me gusta la Falken». El candado de medida BLOQUEA la
 *    235/75R15, que era la correcta (alerta `medida_no_coincide`: «el bot
 *    intentó cotizar 235/75R15 y el cliente pidió 235/70R15 o 265/65R17»).
 *  · 26-ago 17:10 — «Ok». El modelo arrastra el código viejo (356398) y el
 *    candado lo DEJA PASAR, porque 265/65R17 seguía figurando como «pedida»
 *    trece días después. Sale la cotización COT-MTACN72K por una llanta de
 *    otra medida.
 *
 * El candado hizo exactamente lo contrario de su trabajo, y la causa es una
 * sola: `medidasPermitidas` no tenía noción del tiempo y el ciclo solo rota
 * cuando la conversación se cierra. El Ángel Guardián sí lo vio —tres veces,
 * `medida_incorrecta` en alta— pero él solo reescribe texto, y la foto ya
 * había salido: por eso el bot quedó tres turnos prometiendo una cotización
 * que nada iba a generar.
 */
import { describe, expect, it } from "vitest";
import {
  esMismaVisitaPorSilencio, HORAS_QUE_CIERRAN_LA_VISITA, medidaEstaPedida,
  medidasPermitidas, mensajesDeLaVisitaActual,
} from "../src/domain/medidaPedida.js";
import { sinNumerosDeCotizacion, tieneNumeroDeCotizacion } from "../src/domain/numerosDeCotizacion.js";

/** Los inbound del ciclo 1 tal como están en producción, del nuevo al viejo. */
const INBOUND_4732 = [
  { content: "CUMBAYA", created_at: new Date("2026-08-26T17:12:00Z") },
  { content: "Ok", created_at: new Date("2026-08-26T17:11:22Z") },
  { content: "235/75R15", created_at: new Date("2026-08-26T17:10:47Z") },
  { content: "Ok", created_at: new Date("2026-08-26T17:09:49Z") },
  { content: "Me gusta la Falken", created_at: new Date("2026-08-26T15:54:59Z") },
  { content: "Hola llantas 235/70R15", created_at: new Date("2026-08-26T15:54:16Z") },
  { content: "Que garantía tiene esta llanta", created_at: new Date("2026-08-13T03:21:57Z") },
  { content: "Q rendimiento puede dar esta marca y medida", created_at: new Date("2026-08-13T03:21:16Z") },
  { content: "Quiero para un camino mixto", created_at: new Date("2026-08-13T03:19:09Z") },
  { content: "265/65R17", created_at: new Date("2026-08-13T03:17:49Z") },
  { content: "[El cliente mandó un audio. Dice: La medida está mal, yo necesito para la Rich 6 de la Dongfeng en rin 17.]", created_at: new Date("2026-08-13T03:16:13Z") },
  { content: "Buenas noches", created_at: new Date("2026-08-13T03:14:46Z") },
];

describe("la compra de hace dos semanas no es la de hoy", () => {
  it("corta en el silencio de 13 días y se queda solo con la visita del 26", () => {
    const visita = mensajesDeLaVisitaActual(INBOUND_4732);
    expect(visita).toHaveLength(6);
    expect(visita.at(-1)?.content).toBe("Hola llantas 235/70R15");
    expect(visita.map((m) => m.content)).not.toContain("265/65R17");
  });

  it("NO parte una conversación viva: minutos de diferencia siguen siendo la misma compra", () => {
    // El caso que no debe disparar el arreglo. Los seis mensajes del 26-ago
    // van de 15:54 a 17:12 — con una pausa de 75 minutos en el medio, que es
    // exactamente el rato que este cliente se tomó para contestar «Ok».
    const delDia = INBOUND_4732.slice(0, 6);
    expect(mensajesDeLaVisitaActual(delDia)).toHaveLength(6);
  });

  it("el borde: justo por debajo del corte entra, justo por encima no", () => {
    const base = new Date("2026-08-26T12:00:00Z").getTime();
    const hora = 3_600_000;
    const casi = [
      { content: "b", created_at: new Date(base) },
      { content: "a", created_at: new Date(base - HORAS_QUE_CIERRAN_LA_VISITA * hora) },
    ];
    const pasado = [
      { content: "b", created_at: new Date(base) },
      { content: "a", created_at: new Date(base - (HORAS_QUE_CIERRAN_LA_VISITA * hora + 60_000)) },
    ];
    expect(mensajesDeLaVisitaActual(casi)).toHaveLength(2);
    expect(mensajesDeLaVisitaActual(pasado)).toHaveLength(1);
    expect(esMismaVisitaPorSilencio(casi[1].created_at, casi[0].created_at)).toBe(true);
    expect(esMismaVisitaPorSilencio(pasado[1].created_at, pasado[0].created_at)).toBe(false);
  });

  it("una fecha ilegible no corta la visita", () => {
    const sucios = [
      { content: "b", created_at: new Date("2026-08-26T17:00:00Z") },
      { content: "roto", created_at: new Date("no es una fecha") },
      { content: "a", created_at: new Date("2026-08-26T16:59:00Z") },
    ];
    expect(mensajesDeLaVisitaActual(sucios)).toHaveLength(3);
  });
});

describe("el candado de medida, con la ventana puesta", () => {
  const deLaVisita = () => mensajesDeLaVisitaActual(INBOUND_4732).map((m) => m.content);

  it("EL BUG: la 265/65R17 del 13-ago ya no se puede firmar el 26", () => {
    const permitidas = medidasPermitidas(deLaVisita(), "235/75R15");
    expect(permitidas).not.toContain("265/65R17");
    // La llanta que de verdad se cotizó aquel día: FALKEN WILDPEAK A/T 4W
    // 265/65R17, código 356398, $221.77.
    expect(medidaEstaPedida("265/65R17", permitidas)).toBe(false);
  });

  it("y la equivalente que el cliente sí aceptó pasa sin pelear", () => {
    const permitidas = medidasPermitidas(deLaVisita(), "235/75R15");
    expect(permitidas).toEqual(expect.arrayContaining(["235/70R15", "235/75R15"]));
    // La que el bot le enseñó y él eligió: código 356521, $208.48.
    expect(medidaEstaPedida("235/75R15", permitidas)).toBe(true);
    expect(medidaEstaPedida("235/70R15", permitidas)).toBe(true);
  });

  it("sin la ventana el candado se daba vuelta — así fallaba antes", () => {
    // Esta es la prueba que falla si alguien quita `mensajesDeLaVisitaActual`:
    // con TODO el ciclo, la medida rancia entra y la buena no cambia nada.
    const conTodoElCiclo = medidasPermitidas(
      INBOUND_4732.map((m) => m.content),
      "235/70R15",
    );
    expect(medidaEstaPedida("265/65R17", conTodoElCiclo)).toBe(true);
  });
});

describe("los números de cotización no van al cliente", () => {
  // Los cuatro mensajes son los que salieron de verdad, escritos por el
  // GUARDIÁN al corregir — que es justo quien corre después de todos los
  // candados deterministas.
  it("los limpia de las correcciones reales del 26-ago sin dejar la frase coja", () => {
    expect(sinNumerosDeCotizacion(
      "La cotización *COT-MTACN72K* no la tomo como válida para usted porque salió en *265/65R17*, no en *235/75R15*.",
    )).toBe("La cotización no la tomo como válida para usted porque salió en *265/65R17*, no en *235/75R15*.");

    expect(sinNumerosDeCotizacion(
      "Perfecto. No le confirmo todavía ese valor, porque la cotización *COT-MTACN72K* corresponde a otra medida (*265/65R17*) y usted está validando *235/75R15*.",
    )).toBe("Perfecto. No le confirmo todavía ese valor, porque la cotización corresponde a otra medida (*265/65R17*) y usted está validando *235/75R15*.");
  });

  it("la línea que solo existía para nombrar el número se va entera", () => {
    expect(sinNumerosDeCotizacion("🛞 4 llantas: $811.48\n🔖 Número de venta: AV-MTACN72K"))
      .toBe("🛞 4 llantas: $811.48");
  });

  it("NO toca el cupón ni las medidas — que es lo único que el cliente sí usa", () => {
    const cupon = "🎟️ Su código de descuento es *DT-PUMA47*\n\nPor confirmar su visita le damos un *2 % adicional* sobre su cotización.";
    expect(sinNumerosDeCotizacion(cupon)).toBe(cupon);
    const sinNumeros = "Le sirve la equivalente en *235/75R15*, 4 llantas por $833.92.";
    expect(sinNumerosDeCotizacion(sinNumeros)).toBe(sinNumeros);
    expect(tieneNumeroDeCotizacion(sinNumeros)).toBe(false);
    expect(tieneNumeroDeCotizacion(cupon)).toBe(false);
  });

  it("reconoce las dos formas que emite el sistema", () => {
    expect(tieneNumeroDeCotizacion("su cotización COT-MTACN72K")).toBe(true);
    expect(tieneNumeroDeCotizacion("número de venta AV-85")).toBe(false);
    expect(tieneNumeroDeCotizacion("número de venta AV-MTACN72K")).toBe(true);
  });
});
