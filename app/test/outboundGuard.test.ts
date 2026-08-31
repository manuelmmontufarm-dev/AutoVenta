import { describe, expect, it } from "vitest";

// El módulo importa config (exige env): valores de prueba ANTES del import.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { guardOutboundReply, corregirPrecios } = await import("../src/services/outboundGuard.js");

/**
 * El guardián de salida, probado contra los MENSAJES REALES que el bot mandó
 * a clientes el 5-ago (los de las capturas de Joaquín). Ninguno puede volver a
 * salir: aunque el modelo los produzca, aquí se frenan.
 */
describe("Guardián de salida — las fallas del 5-ago no pueden volver a enviarse", () => {
  describe("caso Ricardo Nitro: disculpas en cadena", () => {
    const APOLOGIA = "Disculpa, tuve un problema procesando tu mensaje. ¿Me lo repites por favor?";

    it("la segunda disculpa seguida NO se envía y se marca bot atascado", () => {
      const r = guardOutboundReply(APOLOGIA, APOLOGIA, true);
      expect(r.text).toBeNull();
      expect(r.issues).toContain("bot_atascado");
    });

    it("una disculpa aislada sí pasa (es honesta); solo la repetición es spam", () => {
      const r = guardOutboundReply(APOLOGIA, "Aquí están sus opciones 🛞", true);
      expect(r.text).toBe(APOLOGIA);
      expect(r.issues).toEqual([]);
    });

    it("un mensaje calcado al anterior no se envía; sale el acuse neutro", () => {
      // El calcado sigue sin salir (intención del 5-ago intacta). Lo que subió
      // es el silencio: el contrato T115 exige que ningún turno quede mudo
      // (31-ago, R06: el cliente dijo «Ok» y nadie le contestó nada).
      const texto = "Estas son las opciones disponibles para su medida.";
      const r = guardOutboundReply(texto, texto, true);
      expect(r.text).not.toBe(texto);
      expect(r.text).toContain("Quedo atento");
      expect(r.issues).toContain("mensaje_duplicado");
    });

    it("si el acuse neutro TAMBIÉN acaba de salir, ahí sí silencio", () => {
      const neutro = "Quedo atento a lo que necesite. 🤝";
      const r = guardOutboundReply(neutro, neutro, true);
      expect(r.text).toBeNull();
    });

    it("el duplicado se detecta aunque cambien espacios o mayúsculas", () => {
      const r = guardOutboundReply(
        "Estas son las  opciones disponibles.",
        "estas son las opciones DISPONIBLES.",
        true,
      );
      expect(r.issues).toContain("mensaje_duplicado");
      expect(r.text).not.toContain("opciones disponibles");
    });
  });

  describe("pedir fotos: ya es una jugada legítima (visión activa desde el 6-ago)", () => {
    it("deja pasar el ofrecimiento de leer la foto — antes lo censuraba", () => {
      const real =
        "Perfecto, ¿puede decirme qué medida dice el filo de su llanta actual? Si prefiere, puede mandarme una foto del costado y yo la leo.";
      const r = guardOutboundReply(real, null, false);
      expect(r.text).toBe(real);
      expect(r.issues).toEqual([]);
    });

    it("el caso Orlando ya no se recorta: la foto es una vía de venta, no un callejón", () => {
      const real =
        "No tengo una medida verificada para ese modelo.\n\n¿Podrías enviarme una foto de la etiqueta de la puerta o de la medida que aparece en una llanta actual? Así confirmamos la compatibilidad.";
      const r = guardOutboundReply(real, null, false);
      expect(r.text).toBe(real);
      expect(r.issues).toEqual([]);
    });

    it("no toca un mensaje que habla de fotos sin pedirlas", () => {
      const inocente = "La imagen de la cotización ya le llegó arriba 👆 ¿Le queda mejor Cumbayá o Quito Sur?";
      const r = guardOutboundReply(inocente, null, true);
      expect(r.text).toBe(inocente);
      expect(r.issues).toEqual([]);
    });
  });

  describe("caso Jordian: saludo de nuevo a mitad de conversación", () => {
    it("recorta el «¡Buenas tardes!» real y recapitaliza", () => {
      const real =
        "¡Buenas tardes! ¿Qué medida necesita para sus llantas? Puede encontrarla en el costado de su llanta actual.";
      const r = guardOutboundReply(real, "Mensaje anterior del bot.", true);
      expect(r.issues).toContain("saludo_repetido");
      expect(r.text).toMatch(/^¿Qué medida necesita/);
    });

    it("en el PRIMER mensaje del ciclo el saludo es bienvenido", () => {
      const primero = "¡Hola! Con gusto le ayudo. ¿Qué medida necesita?";
      const r = guardOutboundReply(primero, null, false);
      expect(r.text).toBe(primero);
      expect(r.issues).toEqual([]);
    });

    it("si el mensaje era SOLO un saludo a mitad de hilo, no se envía", () => {
      const r = guardOutboundReply("¡Hola!", "Mensaje anterior.", true);
      expect(r.text).toBeNull();
    });
  });

  it("una respuesta buena pasa intacta, sin tocar una letra", () => {
    const buena =
      "En 225/60R17 tengo Falken Wildpeak A/T, justo lo todo terreno que busca 🛞\n---\n¿Le preparo la cotización por las 4?";
    const r = guardOutboundReply(buena, "Otro mensaje.", true);
    expect(r.text).toBe(buena);
    expect(r.issues).toEqual([]);
  });
});

/**
 * Corrector de precios, probado contra los HALLAZGOS REALES del Ángel Guardián
 * del 14/15-ago: las cifras que el guardián corrigió con IA (y tokens) tienen
 * que corregirse ahora con texto y aritmética, gratis y con guardián apagado.
 */
describe("corrector de precios — los precio_incorrecto ALTA del informe del guardián", () => {
  describe("coma decimal (convs 5657, 6129, 6347): «$600,96» contra cotización $600.96", () => {
    it("normaliza la coma decimal a punto", () => {
      const r = corregirPrecios("Su cotización quedó en $600,96 con IVA incluido.");
      expect(r.texto).toBe("Su cotización quedó en $600.96 con IVA incluido.");
      expect(r.ajustes).toHaveLength(1);
    });

    it("los casos reales: $785,76 y $339,80", () => {
      expect(corregirPrecios("Total: $785,76 💵").texto).toBe("Total: $785.76 💵");
      expect(corregirPrecios("El total es $339,80.").texto).toBe("El total es $339.80.");
    });

    it("aplana el estilo europeo con miles: $1.234,56 → $1234.56", () => {
      expect(corregirPrecios("Serían $1.234,56 por el juego.").texto)
        .toBe("Serían $1234.56 por el juego.");
    });

    it("no toca los miles estilo gringo ($1,200) ni números sin plata", () => {
      const texto = "Rinde $1,200 en promedio y dura 50,000 km, medida 205/55R16.";
      const r = corregirPrecios(texto);
      expect(r.texto).toBe(texto);
      expect(r.ajustes).toEqual([]);
    });
  });

  describe("céntimo transcrito mal (convs 6175, 6375): el modelo recalcula en vez de copiar", () => {
    // Caso real 6175: 4 × $97.97 = $391.88, pero la cotización registra
    // $391.89 (el IVA se redondea por línea). El monto real manda.
    const montos = [391.89, 97.97];

    it("$391.88 → $391.89 cuando la cotización vigente dice $391.89", () => {
      const r = corregirPrecios("El total por las 4 queda en $391.88 con IVA.", montos);
      expect(r.texto).toBe("El total por las 4 queda en $391.89 con IVA.");
      expect(r.ajustes).toEqual(["$391.88 → $391.89"]);
    });

    it("caso 6375: $555.56 → $555.57", () => {
      const r = corregirPrecios("Quedó en $555.56 por el juego 👍", [555.57]);
      expect(r.texto).toBe("Quedó en $555.57 por el juego 👍");
    });

    it("una cifra exacta de la cotización pasa intacta", () => {
      const r = corregirPrecios("Cada una sale $97.97 y el total $391.89.", montos);
      expect(r.ajustes).toEqual([]);
    });

    it("una cifra genuinamente distinta (otro producto) no se toca", () => {
      const r = corregirPrecios("La económica sale $84.50 cada una.", montos);
      expect(r.texto).toBe("La económica sale $84.50 cada una.");
      expect(r.ajustes).toEqual([]);
    });

    it("sin cotización vigente no inventa nada: solo normaliza formato", () => {
      const r = corregirPrecios("Le sale aproximadamente $391.88.", []);
      expect(r.texto).toBe("Le sale aproximadamente $391.88.");
      expect(r.ajustes).toEqual([]);
    });
  });

  it("las dos familias juntas en un mismo mensaje", () => {
    const r = corregirPrecios("Total $391,88, o sea $97.96 cada una.", [391.89, 97.97]);
    expect(r.texto).toBe("Total $391.89, o sea $97.97 cada una.");
    expect(r.ajustes).toHaveLength(3);
  });
});


/** T115 H02 (31-ago, agente en mini): cuatro veces «la medida 165/80R13 no
 *  tiene stock exacto» con maquillaje distinto. La tercera corta y deriva —
 *  y la promesa la ejecuta de verdad lo_prometido_se_ejecuta. */
describe("idea repetida por tercera vez", () => {
  const IDEA = "La medida 165/80R13 no tiene stock exacto ahora mismo. Si le sirve, reviso equivalencias del aro 13.";
  const VARIANTE = "La medida *165/80R13* no tiene stock exacto ahora. Si le sirve reviso equivalencias del aro 13!!";

  it("dos repeticiones se toleran; la tercera deriva", async () => {
    const { guardOutboundReply, RESPUESTA_ANTI_BUCLE } = await import("../src/services/outboundGuard.js");
    const tolerada = guardOutboundReply(VARIANTE, "otro texto", true, [IDEA]);
    expect(tolerada.issues).not.toContain("idea_repetida");
    const cortada = guardOutboundReply(VARIANTE, "otro texto", true, [IDEA, "algo distinto", IDEA]);
    expect(cortada.issues).toContain("idea_repetida");
    expect(cortada.text).toBe(RESPUESTA_ANTI_BUCLE);
  });

  it("mensajes cortos nunca disparan el corte", async () => {
    const { guardOutboundReply } = await import("../src/services/outboundGuard.js");
    const r = guardOutboundReply("Con gusto 🤝", "x", true, ["Con gusto 🤝", "Con gusto 🤝"]);
    expect(r.issues).not.toContain("idea_repetida");
  });
});
