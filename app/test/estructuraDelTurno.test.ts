import { describe, expect, it } from "vitest";
import { esMismaIdea, estructurarTurno } from "../src/domain/estructuraDelTurno.js";

// La prueba del orden importa prepararSalida, que arrastra config.ts.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const MAPAS =
  "📍 *Depot Tire Cumbayá*: https://maps.app.goo.gl/QnMBPXKc1o8igbsp8\n📍 *Depot Tire Quito Sur*: https://maps.app.goo.gl/NQeNN8csyAnRkJDJ7";

describe("estructura del turno: respuesta / links / pregunta", () => {
  it("deja como entró un turno simple sin links", () => {
    const texto = "Para 235/60R16 le recomiendo la FALKEN ZE310R.\n---\n¿Le cotizo las 4 llantas?";
    const r = estructurarTurno(texto);
    expect(r.texto).toBe(texto);
    expect(r.reordenado).toBe(false);
  });

  it("junta en un solo mensaje la respuesta y quita la idea repetida (chat del 1-sep, 16:02)", () => {
    // Cuatro burbujas reales: la 3 y la 4 repetían la 1.
    const texto = [
      "Para 235/60R16, si busca buen agarre en asfalto y que no derrape, le sugiero la FALKEN ZE310R.\n\nPrecio: $161.08 c/u con IVA. Incluye instalación, alineación, balanceo, seguro contra daños y mantenimiento cada 10.000 km.",
      "También tiene la FALKEN ZE914ER a $159.36 c/u con IVA si prefiere menor precio.",
      "Sí, para buena adherencia al pavimento en 235/60R16 le recomiendo la FALKEN ZE310R.\n\nEs la opción premium de las enviadas y está en $161.08 c/u con IVA.",
      "Con la compra incluye instalación, alineación, balanceo, seguro gratuito por daños, mantenimiento cada 10.000 km y revisión del vehículo.",
    ].join("\n---\n");
    const r = estructurarTurno(texto);
    const mensajes = r.texto.split("\n---\n");
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0]).toContain("ZE310R");
    expect(mensajes[0]).toContain("ZE914ER");
    // La 4 repite los beneficios de la 1 con otras palabras: se va.
    expect(r.repetidosQuitados.length).toBeGreaterThanOrEqual(1);
    expect(r.repetidosQuitados.some((p) => p.startsWith("Con la compra incluye"))).toBe(true);
  });

  it("saca los links del párrafo y los manda en su propio mensaje, con la pregunta al final", () => {
    // Chat del 1-sep, 16:38: el texto, los mapas y la pregunta venían en una sola burbuja.
    const texto =
      `Para decirle con seguridad cuál le queda más cerca, ¿me puede compartir su ubicación por WhatsApp?\n\nMientras tanto, le dejo los dos locales:\n\n${MAPAS}`;
    const r = estructurarTurno(texto);
    const mensajes = r.texto.split("\n---\n");
    expect(mensajes).toHaveLength(2);
    expect(mensajes[0]).not.toMatch(/https?:/);
    expect(mensajes[0]).toContain("le dejo los dos locales");
    expect(mensajes[1]).toBe(MAPAS);
    expect(r.reordenado).toBe(true);
  });

  it("la pregunta va después de los links aunque un paso anterior los haya pegado detrás", () => {
    const texto = `Atendemos en dos locales.\n---\n¿A cuál le queda mejor ir?\n---\n${MAPAS}`;
    const r = estructurarTurno(texto);
    expect(r.texto.split("\n---\n")).toEqual([
      "Atendemos en dos locales.",
      MAPAS,
      "¿A cuál le queda mejor ir?",
    ]);
  });

  it("un «---» al inicio o al final no llega al cliente (simulador 1-sep, 23:01)", () => {
    const r = estructurarTurno("---\nLe recomiendo la FALKEN ZE310R.\n\n---\n¿Le cotizo las 4 llantas?\n---\n");
    expect(r.texto).toBe("Le recomiendo la FALKEN ZE310R.\n---\n¿Le cotizo las 4 llantas?");
  });

  it("no manda el mismo link dos veces", () => {
    const texto = `${MAPAS}\n---\nAquí los mapas otra vez:\n${MAPAS}`;
    const r = estructurarTurno(texto);
    const mensajes = r.texto.split("\n---\n");
    expect(mensajes).toEqual(["Aquí los mapas otra vez:", MAPAS]);
  });

  it("un bloque con precio no cuenta como la pregunta de cierre", () => {
    const texto = "Le recomiendo la ZE310R.\n---\n¿Le cotizo 4 llantas a $161.08 c/u?";
    const r = estructurarTurno(texto);
    // Con precio no es «solo pregunta»: se queda como respuesta, sin reordenar.
    expect(r.texto.split("\n---\n")).toHaveLength(1);
  });

  it("conserva la primera versión de una idea y quita las siguientes", () => {
    const a = "Para buen agarre en asfalto le recomiendo la FALKEN ZE310R en 235/60R16, es la opción premium de las enviadas.";
    const b = "Sí, para buen agarre en asfalto en 235/60R16 le recomiendo la FALKEN ZE310R, es la opción premium de las enviadas.";
    expect(esMismaIdea(a, b)).toBe(true);
    const r = estructurarTurno(`${a}\n---\n${b}`);
    expect(r.texto).toBe(a);
    expect(r.repetidosQuitados).toEqual([b]);
  });

  it("dos frases cortas distintas no se confunden", () => {
    expect(esMismaIdea("Sí, claro.", "Sí, cómo no.")).toBe(false);
    const r = estructurarTurno("Perfecto.\n---\nCon gusto.");
    expect(r.texto).toBe("Perfecto.\n\nCon gusto.");
  });
});

describe("orden de la cadena de salida", () => {
  it("la estructura corre después de los candados de contenido y antes del calco reciente", async () => {
    const { PASOS } = await import("../src/services/prepararSalida.js");
    const nombres = PASOS.map((p) => p.nombre);
    const estructura = nombres.indexOf("estructura_del_turno");
    expect(estructura).toBeGreaterThan(nombres.indexOf("pregunta_en_su_propio_mensaje"));
    expect(estructura).toBeGreaterThan(nombres.indexOf("ubicacion_cuando_la_piden"));
    expect(estructura).toBeGreaterThan(nombres.indexOf("sin_pregunta_repetida_en_el_turno"));
    // El calco compara bloque a bloque contra lo ya enviado: tiene que ver los
    // mismos bloques que van a salir (links solos, pregunta sola).
    expect(estructura).toBeLessThan(nombres.indexOf("sin_calco_reciente"));
  });
});
