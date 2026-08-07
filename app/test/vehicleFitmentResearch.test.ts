import { describe, expect, it, vi } from "vitest";
import {
  conDobleVia,
  ESQUEMA_CANDIDATOS,
  estadoDeCandidatos,
  extractTireSizesFromUnknown,
  medidasDelAro,
  normalizarCandidatos,
  normalizarMedida,
  parseRespuestaInvestigacion,
  PREGUNTA_MEDIDA_ESCRITA,
  promptCandidatosFitment,
} from "../src/domain/fitmentResearch.js";

describe("vehicle fitment research", () => {
  it("extrae y deduplica medidas desde respuestas anidadas", () => {
    expect(extractTireSizesFromUnknown({ wheels: [{ tire: "245/65R17" }, { note: "245/65r17 o 245/55R19" }] }))
      .toEqual(["245/65R17", "245/55R19"]);
  });
});

/**
 * El prompt es el arreglo, no el modelo.
 *
 * Medido el 7-ago contra la API con el caso real (Creta 2027, aro 19 →
 * 235/45R19): con el prompt viejo, gpt-5.5 ENCONTRABA la medida y la escribía en
 * la prosa, pero devolvía el arreglo vacío; gpt-5.4 y gpt-4o igual; gpt-4o-mini
 * alucinaba la generación anterior. Subir de modelo no arreglaba nada. Lo que
 * cambió el resultado fue quitarle al modelo el permiso de callarse.
 */
describe("prompt de investigación: siempre candidatos", () => {
  it("declara la lista vacía como la peor respuesta posible", () => {
    const prompt = promptCandidatosFitment("Hyundai Creta 2027", 19);
    expect(prompt).toContain("SIEMPRE devuelve al menos un candidato");
    expect(prompt).toContain("peor respuesta posible");
  });

  it("ya no contiene las frases que hacían que el modelo se autocensure", () => {
    const prompt = promptCandidatosFitment("Hyundai Creta 2027", 19);
    // "No adivines" era lo que convertía una medida probable en silencio.
    expect(prompt).not.toMatch(/No adivines/i);
    // La incertidumbre ahora se expresa en 'confianza', no borrando el dato.
    expect(prompt).toContain("confianza");
    expect(prompt).toContain("baja");
  });

  it("el aro del cliente entra al prompt y manda el orden", () => {
    const prompt = promptCandidatosFitment("Hyundai Creta 2027", 19);
    expect(prompt).toContain("ARO 19");
    expect(prompt).toMatch(/PRIMERO los candidatos de aro 19/);
  });

  it("sin aro no inventa uno", () => {
    const prompt = promptCandidatosFitment("Hyundai Creta 2027", null);
    expect(prompt).not.toMatch(/ARO \d/);
    // El resto del contrato sigue en pie.
    expect(prompt).toContain("SIEMPRE devuelve al menos un candidato");
  });
});

describe("normalización de candidatos", () => {
  it("acepta la medida con espacio, que es como la escribe el modelo", () => {
    // Verificado contra la API: gpt-5.5 devolvió "235/45 R19". El regex estricto
    // no la reconocía y el candidato correcto se caía en silencio.
    expect(normalizarMedida("235/45 R19")).toBe("235/45R19");
    const cands = normalizarCandidatos({ candidatos: [{ medida: "235/45 R19", confianza: "media", porque: "x" }] }, 19);
    expect(cands.map((c) => c.medida)).toEqual(["235/45R19"]);
  });

  it("pone primero las del aro del cliente y luego las de más confianza", () => {
    const cands = normalizarCandidatos(
      {
        candidatos: [
          { medida: "205/65R16", confianza: "alta", porque: "ficha oficial de la versión base" },
          { medida: "215/60R17", confianza: "alta", porque: "otra versión" },
          { medida: "235/45R19", confianza: "media", porque: "la del aro 19" },
        ],
      },
      19,
    );
    // El aro del cliente gana aunque su confianza sea menor: es SU dato.
    expect(cands[0].medida).toBe("235/45R19");
    expect(cands).toHaveLength(3);
  });

  it("no descarta los candidatos de otro aro: filtrar sería volver a la lista vacía", () => {
    const cands = normalizarCandidatos(
      { candidatos: [{ medida: "215/60R17", confianza: "alta", porque: "única que hallé" }] },
      19,
    );
    expect(cands.map((c) => c.medida)).toEqual(["215/60R17"]);
  });

  it("una medida repetida se queda con su mejor respaldo", () => {
    const cands = normalizarCandidatos(
      {
        candidatos: [
          { medida: "235/45R19", confianza: "baja", porque: "por analogía" },
          { medida: "235/45R19", confianza: "alta", porque: "ficha oficial" },
        ],
      },
      null,
    );
    expect(cands).toHaveLength(1);
    expect(cands[0].confianza).toBe("alta");
  });

  it("rescata la medida escrita en la prosa cuando el modelo dejó el arreglo vacío", () => {
    // Exactamente la falla del 7-ago: la respuesta correcta estaba en 'nota'.
    const cands = normalizarCandidatos(
      { candidatos: [], nota: "La Creta de aro 19 monta 235/45R19, pero no hallé la ficha oficial." },
      19,
    );
    expect(cands.map((c) => c.medida)).toEqual(["235/45R19"]);
    expect(cands[0].confianza).toBe("baja");
  });

  it("una confianza que no es de las tres se degrada a baja, no se descarta", () => {
    const cands = normalizarCandidatos({ candidatos: [{ medida: "235/45R19", confianza: "segurísima", porque: "" }] }, null);
    expect(cands[0].confianza).toBe("baja");
  });

  it("sin nada legible devuelve vacío (el candado de tools.ts toma el relevo)", () => {
    expect(normalizarCandidatos({ candidatos: [] }, 19)).toEqual([]);
    expect(normalizarCandidatos(null, 19)).toEqual([]);
  });
});

describe("confianza → estado", () => {
  it("la web nunca produce 'verified', lo más alto es 'reference'", () => {
    expect(estadoDeCandidatos([{ medida: "235/45R19", confianza: "alta", porque: "" }])).toBe("reference");
  });

  it("media y baja quedan en ambiguous: hay qué ofrecer, pero hay que preguntar", () => {
    expect(estadoDeCandidatos([{ medida: "235/45R19", confianza: "media", porque: "" }])).toBe("ambiguous");
    expect(estadoDeCandidatos([{ medida: "235/45R19", confianza: "baja", porque: "" }])).toBe("ambiguous");
  });

  it("sin candidatos, not_found", () => {
    expect(estadoDeCandidatos([])).toBe("not_found");
  });
});

describe("parseo tolerante de la respuesta", () => {
  it("rescata el JSON envuelto en ```json", () => {
    const parsed = parseRespuestaInvestigacion('```json\n{"candidatos":[],"nota":"x"}\n```');
    expect(parsed?.nota).toBe("x");
  });

  it("rescata el JSON con prosa alrededor", () => {
    const parsed = parseRespuestaInvestigacion('Claro, aquí va: {"candidatos":[],"nota":"y"} ¡Espero sirva!');
    expect(parsed?.nota).toBe("y");
  });

  it("cuando no hay JSON avisa por consola en vez de morir en silencio", () => {
    // El catch mudo hacía que una investigación rota se viera igual que un
    // vehículo inexistente; nadie podía saber cuál de las dos era.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(parseRespuestaInvestigacion("no encontré nada útil")).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no parseable"), expect.any(String));
    warn.mockRestore();
  });
});

describe("la doble vía: medida escrita O foto", () => {
  /**
   * Hasta el 6-ago pedir foto era un callejón sin salida y por eso se
   * reescribía cualquier pregunta que la mencionara. Con vision.ts en
   * producción la foto es una vía legítima — y para mucha gente, la más fácil.
   */
  it("la pregunta por defecto ofrece las dos vías", () => {
    expect(PREGUNTA_MEDIDA_ESCRITA).toMatch(/medida/i);
    expect(PREGUNTA_MEDIDA_ESCRITA).toMatch(/foto/i);
  });

  it("una pregunta que SOLO pide foto se reemplaza por la doble vía", () => {
    // Sola, la foto sigue siendo una trampa: si el cliente maneja o la llanta
    // está sucia, la conversación se para ahí.
    expect(conDobleVia("¿Me manda una foto de la etiqueta de la puerta?")).toBe(PREGUNTA_MEDIDA_ESCRITA);
  });

  it("una pregunta que ofrece foto Y medida se respeta tal cual", () => {
    const pregunta = "¿Me escribe la medida o me manda una foto del costado?";
    expect(conDobleVia(pregunta)).toBe(pregunta);
  });

  it("una pregunta discriminante (versión, motor) no se toca: borrarla perdería información", () => {
    expect(conDobleVia("¿Qué versión o motor tiene?")).toBe("¿Qué versión o motor tiene?");
  });
});

describe("el aro recorta las medidas de las fichas", () => {
  it("deja solo las del aro que dijo el cliente", () => {
    expect(medidasDelAro(["245/65R17", "245/55R19"], 19)).toEqual(["245/55R19"]);
  });

  it("sin aro no borra nada", () => {
    expect(medidasDelAro(["245/65R17", "245/55R19"], null)).toEqual(["245/65R17", "245/55R19"]);
  });
});

/**
 * EL CABLEADO CON LA API — el tramo que nadie probaba.
 *
 * `webLookup` corta por NODE_ENV para que la suite no le pegue a OpenAI, y esa
 * guarda dejaba sin cubrir todo lo que va entre el prompt y el parser: qué se
 * manda, qué se hace cuando el modelo rechaza el esquema, y si lo que devuelve
 * la API llega entero hasta los candidatos. El 7-ago no se rompió el prompt ni
 * el parser —los dos tenían tests— sino esa unión. Por eso `investigarCandidatosWeb`
 * recibe el cliente por parámetro: acá se le pasa uno falso y se prueba de punta
 * a punta sin red.
 */
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_fitment_falso";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

const { investigarCandidatosWeb } = await import("../src/services/vehicleFitmentResearch.js");

/** Un cliente falso que guarda cada petición y responde lo que le digan. */
function clienteFalso(...respuestas: Array<string | Error | Record<string, unknown>>) {
  const peticiones: Array<Record<string, unknown>> = [];
  let turno = 0;
  const crear = async (peticion: Record<string, unknown>) => {
    peticiones.push(peticion);
    const respuesta = respuestas[Math.min(turno++, respuestas.length - 1)];
    if (respuesta instanceof Error) throw respuesta;
    if (typeof respuesta === "string") return { output_text: respuesta };
    return respuesta as { output_text: string };
  };
  return { crear, peticiones };
}

describe("cableado de la investigación web", () => {
  it("manda el esquema estructurado, el prompt nuevo y el aro del cliente", async () => {
    const { crear, peticiones } = clienteFalso(
      JSON.stringify({ candidatos: [{ medida: "235/45R19", confianza: "alta", porque: "ficha Hyundai" }], nota: "n", siguiente_pregunta: "" }),
    );

    await investigarCandidatosWeb(crear, "Hyundai", "Creta", 2027, 19);

    expect(peticiones).toHaveLength(1);
    // La salida estructurada es lo que obliga al modelo a llenar el arreglo en
    // vez de contar la medida en la prosa: si esto se cae, vuelve el bug.
    expect(peticiones[0].text).toEqual({ format: ESQUEMA_CANDIDATOS });
    expect(peticiones[0].tools).toEqual([expect.objectContaining({ type: "web_search" })]);
    // Y el aro tiene que llegar hasta el texto que ve el modelo.
    expect(String(peticiones[0].input)).toContain("ARO 19");
    expect(String(peticiones[0].input)).toContain("peor respuesta posible");
  });

  it("si el modelo rechaza el esquema, reintenta en texto plano y rescata el JSON del fence", async () => {
    const { crear, peticiones } = clienteFalso(
      new Error("Unsupported parameter: 'text.format'"),
      "Claro, acá va:\n```json\n{\"candidatos\":[{\"medida\":\"235/45R19\",\"confianza\":\"media\",\"porque\":\"foro\"}],\"nota\":\"revisar versión\",\"siguiente_pregunta\":\"¿Qué motor tiene?\"}\n```",
    );

    const r = await investigarCandidatosWeb(crear, "Hyundai", "Creta", 2027, 19);

    expect(peticiones).toHaveLength(2);
    // El reintento va SIN el esquema; con él volvería a fallar igual.
    expect(peticiones[1].text).toBeUndefined();
    expect(peticiones[1].input).toEqual(peticiones[0].input);
    expect(r?.sizes).toEqual(["235/45R19"]);
    expect(r?.nextQuestion).toBe("¿Qué motor tiene?");
  });

  /**
   * El caso Creta 2027 de punta a punta, con la respuesta tal como la escribe
   * el modelo: la medida con ESPACIO («235/45 R19»), que el regex estricto no
   * reconocía. El candidato correcto se caía en silencio justo después de que
   * el modelo por fin lo devolvía.
   */
  it("la medida con espacio sobrevive el viaje entero", async () => {
    const { crear } = clienteFalso(
      JSON.stringify({
        candidatos: [
          { medida: "235/45 R19", confianza: "media", porque: "ARO 19 apunta a la generación nueva" },
          { medida: "215/60R17", confianza: "baja", porque: "generación anterior" },
        ],
        nota: "Falta confirmar la versión.",
        siguiente_pregunta: "¿Es la versión full?",
      }),
    );

    const r = await investigarCandidatosWeb(crear, "Hyundai", "Creta", 2027, 19);

    expect(r?.sizes).toContain("235/45R19");
    // El aro ordena: la del aro del cliente va primera aunque las dos existan.
    expect(r?.sizes[0]).toBe("235/45R19");
    expect(r?.status).toBe("ambiguous");
    expect(r?.provider).toBe("web");
  });

  it("un candidato sin fuentes citadas igual se devuelve", async () => {
    // Exigir `sources.length` convertía una investigación con la respuesta
    // correcta en un not_found: el vendedor perdía la medida por forma.
    const { crear } = clienteFalso(
      JSON.stringify({ candidatos: [{ medida: "205/55R16", confianza: "baja", porque: "gemelo mecánico" }], nota: "", siguiente_pregunta: "" }),
    );

    const r = await investigarCandidatosWeb(crear, "Marca", "Modelo", 2020, null);

    expect(r).not.toBeNull();
    expect(r?.sources).toEqual([]);
    expect(r?.sizes).toEqual(["205/55R16"]);
  });

  it("las fuentes que cita la API llegan al resultado", async () => {
    const { crear } = clienteFalso({
      output_text: JSON.stringify({ candidatos: [{ medida: "205/55R16", confianza: "alta", porque: "ficha" }], nota: "", siguiente_pregunta: "" }),
      output: [{ content: [{ annotations: [{ title: "Hyundai EC", url: "https://hyundai.com.ec/creta" }] }] }],
    });

    const r = await investigarCandidatosWeb(crear, "Hyundai", "Creta", 2027, 16);

    expect(r?.sources).toEqual([{ title: "Hyundai EC", url: "https://hyundai.com.ec/creta" }]);
    // Un único candidato de confianza alta no necesita repregunta.
    expect(r?.status).toBe("reference");
    expect(r?.nextQuestion).toBeNull();
  });

  it("sin nada legible devuelve null para que el flujo siga a la ficha local", async () => {
    const { crear } = clienteFalso("No tengo información sobre ese vehículo.");

    expect(await investigarCandidatosWeb(crear, "Marca", "Inventada", null, null)).toBeNull();
  });

  it("si los dos intentos fallan, propaga el error en vez de tragárselo", async () => {
    // El llamador lo atrapa y sigue a la ficha local; tragárselo acá dejaría la
    // caída sin log, que era exactamente el fallo silencioso del 7-ago.
    const { crear } = clienteFalso(new Error("500"), new Error("500"));

    await expect(investigarCandidatosWeb(crear, "Marca", "Modelo", null, null)).rejects.toThrow("500");
  });
});
