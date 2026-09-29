/**
 * FAMILIA 1-B: «EL BOT OFRECE COMO EQUIVALENTE UNA MEDIDA QUE NO MONTA, O QUE
 * VA PARA EL LADO CONTRARIO DEL QUE PIDIÓ EL CLIENTE».
 *
 * No es «en la conv 23080 dijo que le entraba la 215/60R17». Es: la palabra
 * «equivalente» (o «le entra», «de su aro», «más cercana») sale del bot por
 * cinco puertas distintas —la lámina de opciones, la regla de
 * `generar_cotizacion`, la búsqueda de alternativas, el modelo escribiendo a
 * mano, y el guardián cuyo freno restauraba el borrador— y NINGUNA le
 * preguntaba al único juez que existe (`domain/equivalencia.ts`: mismo aro y
 * diámetro dentro del 3 %) si esa medida de verdad equivale.
 *
 * Los textos de aquí son los que recibieron los clientes, copiados del
 * informe de la familia (22 al 24-sep-2026, commits 93b1913 y 65cca9e).
 */
import { describe, expect, it } from "vitest";
import {
  cercaniaDeMedida, direccionPedida, equivaleAAlguna, equivalentesQueEquivalen, ordenarPorCercania, respetaDireccion,
} from "../src/domain/equivalencia.js";
import {
  LINEA_SIN_STOCK_EXACTO, avisoDeMedidaEnOpciones, siguientePasoPorMedidaDistinta, sinEquivalenciasFalsas,
} from "../src/domain/equivalenciaEnTexto.js";

describe("el juez: mismo aro, diámetro ±3 % y un ancho que monta en el mismo rin", () => {
  it("conv 22492: 175/70R14 no es equivalente de una 225/55R14 aunque el diámetro cuadre", () => {
    // 600,6 mm contra 603,1: el diámetro está clavado, pero son 5 cm menos de
    // sección — otro rin, otra llanta. El cliente pidió «ancho 225 para arriba».
    expect(cercaniaDeMedida("225/55R14", "175/70R14")?.aceptable).toBe(false);
  });

  it("conv 23080: 215/60R17 no es equivalente de una 235/60R17 (−3,4 %)", () => {
    expect(equivaleAAlguna(["235/60R17"], "215/60R17")).toBe(false);
  });

  it("conv 22533: una 165/65R13 no es equivalente de nada en aro 14", () => {
    expect(equivaleAAlguna(["185/60R14", "195/60R14"], "165/65R13")).toBe(false);
  });

  it("la equivalente de verdad sigue pasando (conv 22975, 215/60R16 por 225/60R16)", () => {
    expect(equivaleAAlguna(["225/60R16"], "215/60R16")).toBe(true);
    // y la del chat 18225, 2 cm más angosta con el diámetro clavado, también
    expect(cercaniaDeMedida("265/70R16", "245/75R16")?.aceptable).toBe(true);
  });

  it("una equivalente declarada por el bot solo queda cotizable si equivale", () => {
    expect(equivalentesQueEquivalen(["165/65R13"], ["185/60R14", "195/60R14"])).toEqual([]);
    expect(equivalentesQueEquivalen(["215/60R16", "175/70R14"], ["225/60R16"])).toEqual(["215/60R16"]);
  });
});

describe("la dirección que pidió el cliente", () => {
  it("lee «más ancha», «más alto» y «más grande»", () => {
    expect(direccionPedida("215/60 R16 me gustaría un poco más ancha...")).toBe("mas_ancha");
    expect(direccionPedida("Si me gustaría más alto")).toBe("mas_alta");
    expect(direccionPedida("quiero una más grande")).toBe("mas_alta");
    expect(direccionPedida("Cotización 225/60 R16")).toBeNull();
  });

  it("más ancha es más sección; más alta es más diámetro", () => {
    expect(respetaDireccion("215/60R16", "215/65R16", "mas_ancha")).toBe(false);
    expect(respetaDireccion("215/60R16", "225/60R16", "mas_ancha")).toBe(true);
    expect(respetaDireccion("235/60R16", "235/55R16", "mas_alta")).toBe(false);
    expect(respetaDireccion("235/60R16", "245/60R16", "mas_alta")).toBe(true);
  });

  it("conv 22975: pidió más ancha que su 215/60R16 y el orden no le devuelve la 215/65R16", () => {
    const item = (sizeLabel: string) => ({ sizeLabel });
    const ordenadas = ordenarPorCercania(
      [item("215/65R16"), item("205/60R16"), item("225/55R16"), item("225/60R16")],
      "215/60R16",
      "mas_ancha",
    ).map((i) => i.sizeLabel);
    expect(ordenadas).not.toContain("215/65R16");
    expect(ordenadas).not.toContain("205/60R16");
    expect(ordenadas).toEqual(["225/55R16", "225/60R16"]);
  });
});

describe("el candado después del guardián, con los textos que salieron", () => {
  it("conv 22533: «equivalentes de su aro: R380 en 165/65R13» a quien pidió aro 14", () => {
    const salida = sinEquivalenciasFalsas(
      "⚠️ Ojo: en *185/60R14 / 195/60R14* no me queda disponibilidad exacta. Estas son *equivalentes* de su aro: R380 en 165/65R13. Se confirma el calce al montar.\n\nEs la única que tengo para lo que me pidió: *WINRUN R380* — $41.05 c/u con IVA.",
      {
        textosDeLaVisita: [
          "¡Hola! Quiero más información",
          "[El cliente mandó una foto. Se lee: 165/65R13, 185/60R14 82H, 195/60R14 82H; marcas: Lucky, Dayto, Dattin]",
        ],
        medidaDeTrabajo: "165/65R13",
      },
    );
    expect(salida.texto).not.toMatch(/equivalentes\*? de su aro: R380 en 165\/65R13/);
    expect(salida.texto).not.toMatch(/Se confirma el calce al montar/);
    expect(salida.reemplazadas.map((r) => r.medida)).toEqual(["165/65R13"]);
  });

  it("conv 22975: «me gustaría un poco más ancha» contestado con 215/65R16 (misma sección)", () => {
    const salida = sinEquivalenciasFalsas(
      "⚠️ Ojo: en *225/55R16 / 225/60R16* no me queda disponibilidad exacta. Estas son *equivalentes* de su aro: WILDPEAK A/T TRAIL en 215/65R16, KR50 en 215/65R16, R380 en 215/65R16. Se confirma el calce al montar.\n\nComo me indicó que busca algo *medio* y no tipo tractor, la opción recomendada es *KR50 en 215/65R16*, para asfalto y manteniendo aro 16.\n---\n¿Le cotizo la *KR50 en 215/65R16*?",
      {
        textosDeLaVisita: [
          "Cotización 225/60 R16", "Ok", "Para calle", "225/55R16 ?", "Diseño", "No tractor", "Media",
          "215/60 R16 me gustaría un poco más ancha...",
        ],
        textoDelTurno: "215/60 R16 me gustaría un poco más ancha...",
        medidaDeTrabajo: "225/60R16",
      },
    );
    expect(salida.texto).not.toContain("215/65R16");
    expect(salida.reemplazadas.every((r) => r.motivo === "direccion")).toBe(true);
  });

  it("conv 23021: «más alta cercana sería 235/65R16» (+3,4 %) sale como lo que es", () => {
    const salida = sinEquivalenciasFalsas(
      "Sí, se puede revisar una medida más alta, pero debe validarse como equivalente para no afectar el calce, dirección o roce.\n\nEn su caso partimos de *235/60R16*. Una opción más alta cercana sería *235/65R16*.\n\nPara avanzar seguro, puedo ayudarle a validar si esa medida le calza bien a su Gran Vitara antes de cotizarla.",
      {
        textosDeLaVisita: [
          "¡Hola! Quiero más información", "Buenas tardes", "Es un Gran Vitara 5 puertas",
          "[El cliente mandó una foto. Se lee: 265/65R16, BFGoodrich]",
          "[El cliente mandó una foto. Se lee: 235/60R16]",
          "Si me gustaría más alto", "Cómo subir la suspensión",
        ],
        textoDelTurno: "Si me gustaría más alto\nCómo subir la suspensión",
      },
    );
    expect(salida.texto).not.toMatch(/más alta cercana sería \*235\/65R16\*/);
    expect(salida.texto).toMatch(/no es equivalente/);
    expect(salida.texto).toContain("*235/60R16*");
  });

  it("conv 22492: «equivalentes de su aro: KR100 en 165R14» a quien tiene 205/60R13", () => {
    const salida = sinEquivalenciasFalsas(
      "⚠️ Ojo: en *205/60R13* no me queda disponibilidad exacta. Estas son *equivalentes* de su aro: KR100 en 165R14. Se confirma el calce al montar.",
      {
        textosDeLaVisita: [
          "225 /55 o 50 /R14", "Es un Sentra B13,  deseo subir una pulgada", "Original 165/r14", "Esta puesto 205/60R13",
        ],
        textoDelTurno: "Esta puesto 205/60R13",
      },
    );
    expect(salida.texto).not.toContain("165R14");
  });

  it("conv 22492: y después «equivalentes de su aro: KENDA KR100 175/70R14» a quien busca 225", () => {
    const salida = sinEquivalenciasFalsas(
      "⚠️ Ojo: en *225/55R14* no me queda disponibilidad exacta. Estas son *equivalentes* de su aro: *KENDA KR100 175/70R14*, *KENDA KR33 175/70R14* y *KENDA KR203 175/70R14*. Se confirma el calce al montar.",
      {
        textosDeLaVisita: [
          "225 /55 o 50 /R14", "Original 165/r14", "Esta puesto 205/60R13", "Subo al aroma, rin 14.",
          "Necesito subir a 14 y mantener cámara o flanco en 55 o 50, ancho 225 para arriba hasta 235...de ancho",
          "Ya lo tengo valorado, por eso busco esa medida.",
        ],
        medidaDeTrabajo: "225/55R14",
      },
    );
    expect(salida.texto).not.toContain("175/70R14");
  });

  it("conv 23080: «en su 235/60R17 no me queda; le entra la 215/60R17, ¿se la cotizo?»", () => {
    const salida = sinEquivalenciasFalsas(
      "en su 235/60R17 no me queda; le entra la 215/60R17, ¿se la cotizo?",
      {
        textosDeLaVisita: [
          "Hola busco estas llantas en quito", "Falken wildpeak AT 235/55R18",
          "O sea no disponen falken ni en otra medida", "Falken wildpeak at r17", "Quiero falken 235/60R17",
        ],
        textoDelTurno: "Quiero falken 235/60R17",
      },
    );
    expect(salida.texto).toBe(LINEA_SIN_STOCK_EXACTO);
  });

  it("conv 15644: «238 70 16» no se contesta con una 215/65R16 sin aclarar la medida", () => {
    const salida = sinEquivalenciasFalsas(
      "La numeración parece venir como 238/70R16; en catálogo no aparece exacta así. Para aro 16 sí tengo referencia Falken disponible: Falken Wildpeak A/T Trail 215/65R16, $143.65 unitario con IVA.\n---\n¿Le cotizo la Falken Wildpeak A/T Trail en 215/65R16?",
      { textosDeLaVisita: ["¡Hola! Quiero más información precio de falkel numeración 238 70 16"] },
    );
    expect(salida.texto).not.toContain("215/65R16");
    expect(salida.texto).toMatch(/me confirma la medida/i);
  });

  it("un aro suelto nunca da una «equivalente» de otro aro", () => {
    const salida = sinEquivalenciasFalsas(
      "Estas son equivalentes de su aro: ZE310 en 215/60R16.",
      { textosDeLaVisita: ["Falken wildpeak at r17"] },
    );
    expect(salida.texto).not.toContain("215/60R16");
    // del MISMO aro sí puede mostrar opciones: son de su aro, no «equivalentes» de nada
    const mismoAro = sinEquivalenciasFalsas(
      "⚠️ Ojo: estas opciones son de *medidas distintas* del mismo aro (215/60R17, 235/65R17, 225/65R17) — cada tarjeta lleva la suya.",
      { textosDeLaVisita: ["Falken wildpeak at r17"] },
    );
    expect(mismoAro.reemplazadas).toEqual([]);
  });

  describe("lo que está bien no se toca", () => {
    it("la equivalente de verdad", () => {
      const texto = "⚠️ Ojo: en *225/60R16* no me queda disponibilidad exacta. Estas son *equivalentes* de su aro: ZE310 en 215/60R16. Se confirma el calce al montar.";
      expect(sinEquivalenciasFalsas(texto, { textosDeLaVisita: ["Cotización 225/60 R16"] }).texto).toBe(texto);
    });
    it("la medida que el propio cliente nombró", () => {
      const texto = "En 225/65R17 le entra la WINRUN MAXCLAW A/T y la FALKEN ZE310R.";
      expect(sinEquivalenciasFalsas(texto, { textosDeLaVisita: ["Quiero falken 235/60R17", "Y en 225/65R17"] }).texto).toBe(texto);
    });
    it("la frase que informa una cotización ya enviada (la firmó el candado de la cotización)", () => {
      const texto = "Para su Subaru Crosstrek aro 17, ya le envié la cotización por *4 llantas FALKEN ZIEX CT60 A/S 215/60R17* por *$689.60* con IVA.";
      expect(sinEquivalenciasFalsas(texto, { textosDeLaVisita: ["Quiero falken 235/60R17"] }).texto).toBe(texto);
    });
    it("la frase que ya dice que NO es equivalente", () => {
      const texto = "La 175/70R14 no es equivalente de su medida: es 5 cm más angosta.";
      expect(sinEquivalenciasFalsas(texto, { textosDeLaVisita: ["225/55R14"] }).texto).toBe(texto);
    });
  });
});

describe("las puertas deterministas que escribían la palabra", () => {
  it("la lámina de opciones (conv 22533) no llama equivalente a una de otro aro ni la deja cotizable", () => {
    const aviso = avisoDeMedidaEnOpciones({
      permitidas: ["185/60R14", "195/60R14"],
      fueraDeMedida: [{ design: "R380", sizeLabel: "165/65R13" }],
      totalMostradas: 1,
    });
    expect(aviso.avisoCliente).not.toMatch(/\*equivalentes\* de su aro/);
    expect(aviso.avisoCliente).toMatch(/no es equivalente/);
    expect(aviso.equivalentes).toEqual([]);
  });

  it("la lámina con una equivalente de verdad sale igual que siempre", () => {
    const aviso = avisoDeMedidaEnOpciones({
      permitidas: ["225/60R16"],
      fueraDeMedida: [{ design: "ZE310", sizeLabel: "215/60R16" }],
      totalMostradas: 1,
    });
    expect(aviso.avisoCliente).toBe(
      "⚠️ Ojo: en *225/60R16* no me queda disponibilidad exacta. Estas son *equivalentes* de su aro: ZE310 en 215/60R16. Se confirma el calce al montar.",
    );
    expect(aviso.equivalentes).toEqual(["215/60R16"]);
  });

  it("generar_cotizacion (conv 23080) ya no le dicta «le entra la 215/60R17»", () => {
    expect(siguientePasoPorMedidaDistinta(["235/60R17"], "215/60R17")).not.toMatch(/le entra la 215\/60R17/);
    expect(siguientePasoPorMedidaDistinta(["235/60R17"], "225/65R17")).toMatch(/le entra la 225\/65R17/);
  });
});
