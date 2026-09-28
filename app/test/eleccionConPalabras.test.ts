/**
 * ELEGIR CON PALABRAS ES ELEGIR (auditoría 25-27 sep 2026).
 *
 * Producción: «La segunda opción» (conv 23356, cinco veces en seis minutos),
 * «1 costos» (23561), «El juego» (23580) y un audio «Sí, cotízemela» (5151)
 * no cotizaron. El lector del menú devolvía null, la herramienta bloqueaba,
 * el vendedor escribía «¿Se la cotizo?» y el guardián lo borraba. Los textos
 * de acá son los reales.
 */
import { describe, expect, it } from "vitest";
import { autorizaCotizacionEnEsteTurno, respuestaDePreferencia } from "../src/domain/salesIntent.js";
import { pidioCotizacionExplicita } from "../src/domain/consultaConRespaldo.js";
import { podarHechosNuevosDelGuardian, frenarHechosNuevosDelGuardian } from "../src/domain/guardianNoVendeSolo.js";

describe("el escalón dicho con palabras", () => {
  it.each([
    ["La segunda opción", "equilibrada"],
    ["1 costos", "precio"],
    ["1) costo", "precio"],
    ["la tercera opción", "premium"],
    ["opción 2 equilibrio", "equilibrada"],
    ["3 premium", "premium"],
    ["La primera", "precio"],
  ])("%s → %s", (texto, escalon) => {
    expect(respuestaDePreferencia(texto)).toBe(escalon);
    expect(autorizaCotizacionEnEsteTurno(texto)).toBe(true);
  });

  it("un número seguido de otra cosa sigue siendo cantidad, no escalón", () => {
    expect(respuestaDePreferencia("1 llanta")).toBeNull();
    expect(respuestaDePreferencia("2 llantas por favor")).toBeNull();
    expect(respuestaDePreferencia("necesito 3 para el lunes")).toBeNull();
  });

  it("lo que ya funcionaba sigue igual", () => {
    expect(respuestaDePreferencia("2")).toBe("equilibrada");
    expect(respuestaDePreferencia("#1")).toBe("precio");
    expect(respuestaDePreferencia("La opción 3")).toBe("premium");
    expect(respuestaDePreferencia("Quiero más información")).toBeNull();
  });
});

describe("el sí del que compra por juego", () => {
  it("«El juego» y «las 4» autorizan", () => {
    expect(autorizaCotizacionEnEsteTurno("El juego")).toBe(true);
    expect(autorizaCotizacionEnEsteTurno("Sí, el juego de 4")).toBe(true);
    expect(autorizaCotizacionEnEsteTurno("las cuatro")).toBe(true);
  });
  it("«el juego» dentro de una pregunta de precio no es un sí", () => {
    expect(autorizaCotizacionEnEsteTurno("gracias, lo pienso y le aviso")).toBe(false);
    expect(autorizaCotizacionEnEsteTurno("¿me pasa la dirección del local?")).toBe(false);
  });
});

describe("«cotízemela» es pedir la cotización con todas sus letras", () => {
  it.each([
    "Sí, cotízemela para ver cuánto sale, por favor. Muchas gracias, le agradezco.",
    "[El cliente mandó un audio. Dice: Sí, cotízemela para ver cuánto sale, por favor.]",
    "cotíceme las 4",
    "cotizeme esa",
    "Cotízame la Kenda",
  ])("%s", (texto) => {
    expect(pidioCotizacionExplicita(texto)).toBe(true);
  });
  it("hablar de una cotización vieja no es pedir una", () => {
    expect(pidioCotizacionExplicita("la cotización que me mandó ayer tiene un error")).toBe(false);
  });
});

describe("corrección frenada: el borrador con dato falso no se restaura, se poda la oferta nueva", () => {
  const productos = [
    { code: "F1", brand: "FALKEN", design: "WILDPEAK A/T" },
    { code: "F2", brand: "FALKEN", design: "ZIEX CT60 A/S" },
    { code: "W1", brand: "WINRUN", design: "R380" },
    { code: "F3", brand: "FALKEN", design: "WILDPEAK A/T TRAIL" },
  ];

  it("conv 23080: se va el párrafo con la CT60 a $172.40 y queda la negativa honesta", () => {
    const borrador = "en su 235/60R17 no me queda; le entra la 215/60R17, ¿se la cotizo?";
    const correccion = [
      "En *235/60R17* no me queda *FALKEN Wildpeak A/T* disponible.",
      "",
      "La opción *FALKEN* que tengo en esa medida es *FALKEN ZIEX CT60 A/S* a *$172.40 c/u con IVA*, pero es *H/T*, no A/T.",
      "",
      "Si desea mantener *FALKEN Wildpeak A/T*, habría que revisar otra medida que le calce correctamente.",
    ].join("\n");
    const yaDicho = "Opciones enviadas: FALKEN WILDPEAK A/T TRAIL"; // lo que el bot ya mostró en el ciclo
    expect(frenarHechosNuevosDelGuardian(borrador, correccion, productos, yaDicho).bloqueado).toBe(true);
    const podado = podarHechosNuevosDelGuardian(borrador, correccion, productos, yaDicho);
    expect(podado).not.toBeNull();
    expect(podado).not.toMatch(/CT60|172\.40/);
    expect(podado).toMatch(/no me queda/);
    expect(podado).toMatch(/otra medida que le calce/);
    expect(podado).not.toMatch(/le entra la 215/);
  });

  it("conv 23489: se va la lista de A/T nuevas y no queda el «:» colgando", () => {
    const borrador = "⚠️ Ojo: en *205/65R16* no me queda disponibilidad exacta. Estas son *equivalentes* de su aro: R380 en 215/65R16. Se confirma el calce al montar.\n\n---\n\nYo iría por la *WINRUN R380* — $85.52 c/u con IVA: para uso ciudad conviene una turismo SUV.";
    const correccion = [
      "⚠️ Ojo: en *205/65R16* no me queda disponibilidad exacta hoy.",
      "",
      "Para lo que me pide —todo terreno y ciudad— sí tengo opción *A/T* en medidas equivalentes de aro 16:",
      "",
      "• *FALKEN WILDPEAK A/T TRAIL* en *215/60R16* — *$162.78 c/u con IVA*",
      "• *FALKEN WILDPEAK A/T TRAIL* en *215/65R16* — *$165.10 c/u con IVA*",
      "",
      "---",
      "",
      "¿Qué medida dice en el costado de su llanta?",
    ].join("\n");
    const podado = podarHechosNuevosDelGuardian(borrador, correccion, productos, "");
    expect(podado).not.toBeNull();
    expect(podado).not.toMatch(/TRAIL|162\.78|165\.10/);
    expect(podado).not.toMatch(/aro 16:\s*$/m);
    expect(podado).toMatch(/¿Qué medida dice en el costado/);
  });

  it("si al podar no queda nada con sustancia, devuelve null (y el que llama cae al borrador)", () => {
    const borrador = "Quedo atento.";
    const correccion = "Le ofrezco la *WINRUN R380* a *$85.52 c/u con IVA*.";
    expect(podarHechosNuevosDelGuardian(borrador, correccion, productos, "")).toBeNull();
  });
});
