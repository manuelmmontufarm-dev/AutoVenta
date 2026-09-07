/**
 * FAMILIAS E, F, G y H de la auditoría del 2-6 sep-2026 (corrida 3), la parte
 * pura: detectores y candados de texto, sin base ni modelo.
 *
 * E · Datos del negocio sin fuente: «Que parte del sur se encuentran» no
 *     disparaba el mapa (14976) y el bot mandó su propio número «para
 *     ubicación directa» (4 veces); un link de Maps escrito a mano salió vacío
 *     (15555); «1955015 kenda» no contaba como pedir la marca (13435).
 * F · Un día dentro de una excusa quedó como visita: «no pude… hasta el
 *     domingo» (11632), la autorespuesta de vacaciones (14014), «permítame
 *     revisar si mañana puedo» (15426).
 * G · El menú de prioridad sobre una sola opción (7794, 15013) y el menú
 *     pegado otra vez al final de otra respuesta (14976, 14737).
 */
import { describe, expect, it } from "vitest";
import { pideUbicacion } from "../src/domain/ubicacionPedida.js";
import { marcaPreguntada } from "../src/domain/consultaConRespaldo.js";
import { extractCustomerCommitment } from "../src/domain/customerCommitment.js";
import { buildContextualFollowUpMessage } from "../src/domain/followUpMessages.js";
import {
  conMapasCanonicos,
  quitarMenuDePreferencia,
  sinTelefonoPropio,
} from "../src/domain/candadosDeTexto.js";

describe("E · la ubicación se pide de muchas formas", () => {
  it.each([
    "Que parte del sur se  encuentran",
    "Marca precio dirección",
    "direccion para ver",
    "En qué sector están",
    "donde se ubican",
    "Y saber dónde están ubicados",
  ])("«%s» pide la ubicación", (t) => expect(pideUbicacion(t)).toBe(true));

  it.each(["me queda en el sector norte", "la 205 muy ancha", "hola"])(
    "«%s» no la pide",
    (t) => expect(pideUbicacion(t)).toBe(false),
  );
});

describe("E · el bot no da su propio número como «para indicaciones»", () => {
  const TELEFONO = "+593 98 280 1766";
  const TEXTO_14976 =
    "Estamos en *Depot Tire Quito Sur*. También atendemos en *Depot Tire Cumbayá*.\n\n" +
    "No tengo aquí la dirección exacta del local, pero puede escribirnos o llamar al +593 98 280 1766 para ubicación directa.\n\n" +
    "Sobre las opciones 245/70R16 que le envié, dígame qué prioriza:";

  it("quita la frase con el número (y sus variantes de formato)", () => {
    const r = sinTelefonoPropio(TEXTO_14976, TELEFONO);
    expect(r.quitado).toBe(true);
    expect(r.texto).not.toMatch(/1766|llamar al/);
    expect(r.texto).toContain("Depot Tire Quito Sur");
    expect(r.texto).toContain("dígame qué prioriza");
    expect(sinTelefonoPropio("📞 0982801766", TELEFONO).texto).toBe("");
  });

  it("no toca un texto sin el número", () => {
    const r = sinTelefonoPropio("Le esperamos en Quito Sur 🤝", TELEFONO);
    expect(r.quitado).toBe(false);
  });
});

describe("E · los links de Maps solo salen del bloque canónico", () => {
  const CANONICOS = ["https://maps.app.goo.gl/QnMBPXKc1o8igbsp8", "https://maps.app.goo.gl/NQeNN8csyAnRkJDJ7"];
  const BLOQUE = "📍 *Depot Tire Cumbayá*: https://maps.app.goo.gl/QnMBPXKc1o8igbsp8\n📍 *Depot Tire Quito Sur*: https://maps.app.goo.gl/NQeNN8csyAnRkJDJ7";

  it("el link vacío de la conv 15555 se reemplaza por el bloque real", () => {
    const roto = "Tenemos dos locales:\nCumbayá: https://maps.app.goo.gl/\nQuito Sur: https://maps.app.goo.gl/\n¿Cuál le queda mejor?";
    const r = conMapasCanonicos(roto, CANONICOS, BLOQUE);
    expect(r.corregido).toBe(true);
    expect(r.texto).not.toMatch(/maps\.app\.goo\.gl\/(?:\s|$)/);
    expect(r.texto).toContain("QnMBPXKc1o8igbsp8");
    expect(r.texto).toContain("¿Cuál le queda mejor?");
  });

  it("un link inventado también", () => {
    const r = conMapasCanonicos("📍 https://maps.app.goo.gl/AbCdEf123", CANONICOS, BLOQUE);
    expect(r.corregido).toBe(true);
    expect(r.texto).toBe(BLOQUE);
  });

  it("el bloque canónico pasa intacto", () => {
    expect(conMapasCanonicos(BLOQUE, CANONICOS, BLOQUE).corregido).toBe(false);
  });
});

describe("E · marca + medida en el mismo mensaje es pedir esa marca", () => {
  it("«1955015 kenda» y «195/50R15 Kenda» (conv 13435)", () => {
    expect(marcaPreguntada("1955015 kenda")).toBe("KENDA");
    expect(marcaPreguntada("1955015 kenda\n195/50R15\nKenda")).toBe("KENDA");
  });
  it("«cotízame llantas kenda 601 265-70-17» (conv 15964) y una marca que no manejamos (15158)", () => {
    expect(marcaPreguntada("Buenos días, cotízame llantas kenda 601 265-70-17")).toBe("KENDA");
    expect(marcaPreguntada("Hola, busco 4 Venom Power 315/70R17 10PR nuevas")).toBe("VENOM");
  });
  it("«mis Falken rozan» sigue sin ser un pedido", () => {
    expect(marcaPreguntada("mis falken rozan con el guardafango")).toBeNull();
  });
});

describe("F · un día dentro de una excusa no es una visita", () => {
  const now = new Date("2026-09-02T15:25:00.000Z"); // miércoles 2-sep, 10:25 Quito

  it("conv 11632: «no pude… hasta el domingo… otro día le visito» no agenda el domingo", () => {
    const r = extractCustomerCommitment(
      "No mi estimado buenos días, no pude visitar porque me tocó trabajar hasta el domingo, no he podido visitarle mi estimado. Con gusto otro día le visito porque aún no he comprado",
      now, { respondiendoAlDia: true },
    );
    expect(r?.visitDate).toBeUndefined();
  });

  it("conv 14014: la autorespuesta de vacaciones no agenda nada", () => {
    const r = extractCustomerCommitment(
      "Hola, gracias por comunicarte con Franklin Duque. 👋\n\nEn este momento me encuentro en mi periodo de vacaciones y regresaré a mis actividades el 8 de septiembre.",
      now, { respondiendoAlDia: true },
    );
    expect(r).toBeNull();
  });

  it("conv 15426: «permítame revisar si mañana puedo» es un tal vez, no una fecha", () => {
    const r = extractCustomerCommitment("Permítame revisar si mañana puedo en este horario por favor", now, { respondiendoAlDia: true });
    expect(r?.visitDate).toBeUndefined();
  });

  it("«no pude ir el lunes, voy el jueves» agenda el jueves", () => {
    const r = extractCustomerCommitment("no pude ir el lunes, voy el jueves", now);
    expect(r?.visitDate?.toISOString()).toBe("2026-09-03T15:00:00.000Z");
  });

  it("«voy mañana» y «voy el sábado» siguen agendando", () => {
    expect(extractCustomerCommitment("voy mañana", now)?.visitDate).toBeDefined();
    expect(extractCustomerCommitment("voy el sábado", now)?.visitDate).toBeDefined();
  });

  it("«Lunes O martes máximo» es un rango, no el lunes", () => {
    const r = extractCustomerCommitment("Lunes O martes máximo", now, { respondiendoAlDia: true });
    expect(r?.tipo).toBe("tramo");
    expect(r?.visitDate).toBeUndefined();
  });
});

describe("G · el menú de prioridad", () => {
  const MENU =
    "Para afinarle la recomendación sobre las opciones que le envié, dígame una sola cosa: ¿qué prioriza usted?\n\n" +
    "1) *Costo* — la más conveniente de precio\n2) *Equilibrio* — la que mejor balancea precio y rendimiento\n3) *Premium* — la de máxima calidad y durabilidad\n\n" +
    "Con eso le dejo la opción exacta para su medida.";

  it("se quita del final de otra respuesta (conv 14976) y queda lo demás", () => {
    const texto = "Estamos en *Depot Tire Quito Sur*. También atendemos en *Depot Tire Cumbayá*.\n---\nSobre las opciones 245/70R16 que le envié, para afinarle la recomendación dígame qué prioriza:\n\n1) *Costo* — la más conveniente de precio\n2) *Equilibrio* — la que mejor balancea precio y rendimiento\n3) *Premium* — la de máxima calidad y durabilidad";
    const r = quitarMenuDePreferencia(texto);
    expect(r.quitado).toBe(true);
    expect(r.texto).toBe("Estamos en *Depot Tire Quito Sur*. También atendemos en *Depot Tire Cumbayá*.");
  });

  it("el menú a secas (7794, una sola opción) queda vacío para que lo reemplace el cierre de una opción", () => {
    const r = quitarMenuDePreferencia("Es la única opción que tengo: *KENDA KR608* — $271.09 c/u con IVA.\n---\n¿Qué prefiere priorizar: *costo*, *equilibrio* o *premium*? 😊");
    expect(r.quitado).toBe(true);
    expect(r.texto).toBe("Es la única opción que tengo: *KENDA KR608* — $271.09 c/u con IVA.");
    expect(quitarMenuDePreferencia(MENU).texto).toBe("");
    // Simulador 6-sep: sobre la única KR20 el modelo escribió su propia versión.
    const r2 = quitarMenuDePreferencia("Es la única opción disponible para lo que me pidió: *KENDA KR20* — *$143.78 c/u con IVA*.\n---\n¿Prefiere que avancemos con esta opción por costo, equilibrio o premium? 😊");
    expect(r2.quitado).toBe(true);
    expect(r2.texto).toBe("Es la única opción disponible para lo que me pidió: *KENDA KR20* — *$143.78 c/u con IVA*.");
  });

  it("la lista con guiones que escribió el modelo sobre una sola opción también se va (simulador 6-sep)", () => {
    const r = quitarMenuDePreferencia("Es la única opción disponible para la medida que me pidió: *KENDA KR20* — *$143.78 c/u con IVA*.\n\nPara avanzar, puede decirme cuál prefiere:\n- *Costo*: la más conveniente de precio\n- *Equilibrio*: precio y rendimiento\n- *Premium*: máxima calidad");
    expect(r.quitado).toBe(true);
    expect(r.texto).toBe("Es la única opción disponible para la medida que me pidió: *KENDA KR20* — *$143.78 c/u con IVA*.");
  });

  it("un texto sin menú no se toca", () => {
    expect(quitarMenuDePreferencia("¿A cuál local le queda mejor ir?").quitado).toBe(false);
  });
});

describe("corrida 1 · la plantilla de una sola opción también en medida_confirmada", () => {
  it("no pregunta uso ni presupuesto cuando solo hay una llanta en pantalla", () => {
    for (const kind of ["in_window_first", "in_window_second"] as const) {
      const t = buildContextualFollowUpMessage(
        { stage: "medida_confirmada", tireSize: "225/70R16", optionsCount: 1, selectedProductLabel: "KENDA KR50" },
        kind,
      );
      expect(t).not.toMatch(/prioriz|le ayudo a elegir|otra alternativa|otras opciones/i);
      expect(t).toContain("KENDA KR50");
    }
  });
});
