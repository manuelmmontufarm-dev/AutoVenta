import { beforeAll, describe, expect, it } from "vitest";
import { preguntaElDia, preguntamosElDia } from "../src/domain/customerCommitment.js";
import { preguntaElLocal, preguntamosElLocal } from "../src/domain/storeSelection.js";

// El texto EXACTO que salió en producción el 27-ago (conv 3, ciclo 15, 05:08:54)
// después de que el cliente tocara «Otro día». Terminó sin preguntar nada.
const EL_QUE_FALLO =
  "Listo, queda *Quito Sur* anotado.\n\n" +
  "Cuando tenga claro el día que puede pasar, me avisa y le ayudo a coordinar con el asesor para su cotización.";

describe("el candado del cierre no se calla con un mensaje que solo MENCIONA el día", () => {
  it("el detector laxo lo daba por preguntado — esa era la falla", () => {
    expect(preguntamosElDia(EL_QUE_FALLO)).toBe(true);
  });

  it("el estricto ve que ahí no se preguntó nada", () => {
    expect(preguntaElDia(EL_QUE_FALLO)).toBe(false);
  });

  it("y sigue reconociendo la pregunta de verdad, para no repetirla", () => {
    for (const real of [
      "¿Qué día cree que puede pasar? Le aviso al asesor. 📅",
      "¿Qué día podría pasar por *Depot Tire Cumbayá*? 📅",
      "¿Cuándo puede venir?",
    ]) {
      expect(preguntaElDia(real)).toBe(true);
    }
  });
});

describe("la pregunta en imperativo TAMBIÉN cuenta (doble pregunta del 27-ago)", () => {
  // El texto EXACTO del mensaje 14130 en producción, conv 3, 13:15:36. Preguntó
  // el día sin usar «?», así que el candado creyó que no había preguntado y le
  // pegó la pregunta otra vez: el cliente la vio dos veces en dos mensajes.
  const IMPERATIVO =
    "Claro, *Depot Tire Cumbayá* ya quedó anotado.  \n" +
    "Dígame *qué día* sí le queda y se lo registro; la cotización ya la tiene por " +
    "*4 WINRUN R330 205/45R17* por *$286.88*.";

  it("se reconoce como pregunta aunque no lleve signos", () => {
    expect(preguntaElDia(IMPERATIVO)).toBe(true);
  });

  it("y el «avíseme usted cuando sepa» sigue SIN contar", () => {
    // La otra cara del mismo filo: si esto contara, volvería la falla anterior
    // —el turno que termina sin pedir nada y deja morir el hilo—.
    expect(preguntaElDia(EL_QUE_FALLO)).toBe(false);
  });

  it.each([
    "Dígame qué día le queda mejor.",
    "Me dice qué día puede pasar y lo agendo.",
    "Avíseme cuál día le sirve.",
  ])("reconoce «%s»", (texto) => expect(preguntaElDia(texto)).toBe(true));

  it.each([
    "Le confirmo el día con el asesor.",
    "Dígame la medida que busca.",
    "Ya quedó registrado para el asesor.",
  ])("no se dispara con «%s»", (texto) => expect(preguntaElDia(texto)).toBe(false));
});

describe("lo mismo con el local", () => {
  const MAPAS =
    "Puede pasar sin compromiso a verlas y probarlas en su vehículo.\n" +
    "📍 *Depot Tire Cumbayá*: https://maps.app.goo.gl/QnMBPXKc1o8igbsp8\n" +
    "📍 *Depot Tire Quito Sur*: https://maps.app.goo.gl/NQeNN8csyAnRkJDJ7";

  it("el mensaje de los mapas nombra los dos locales sin preguntar nada", () => {
    expect(preguntamosElLocal(MAPAS)).toBe(true);   // laxo: se conforma con los nombres
    expect(preguntaElLocal(MAPAS)).toBe(false);     // estricto: ahí no hay pregunta
  });

  it("y la pregunta real se sigue reconociendo", () => {
    expect(preguntaElLocal("¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍")).toBe(true);
    expect(preguntaElLocal("¿A cuál local le queda mejor ir?")).toBe(true);
  });

  // Lote del 29-ago, casos 35–37 y 44: el modelo preguntó el local nombrando
  // las sucursales sin decir «local», el estricto no lo reconoció y el candado
  // pegó la pregunta otra vez — el cliente la vio dos veces en el mismo turno.
  it.each([
    "¿Cumbayá o Quito Sur? 🤝",
    "📍 ¿Le queda mejor Cumbayá o Quito Sur?",
    "Para coordinar su visita, ¿le queda mejor ir a *Cumbayá* o *Quito Sur*? 📍",
    "si me dice cuál le queda mejor, le envío solo ese mapa. ¿Cumbayá o Quito Sur? 🤝",
  ])("los dos nombres dentro de una pregunta bastan: «%s»", (texto) => {
    expect(preguntaElLocal(texto)).toBe(true);
  });

  it("los nombres en líneas sin pregunta siguen sin contar (los mapas)", () => {
    expect(preguntaElLocal(`${MAPAS}\n¿Le queda alguna otra duda?`)).toBe(false);
  });
});

describe("el turno que confirma la visita deja la puerta abierta", () => {
  let PREGUNTA_DE_CIERRE: string;
  beforeAll(async () => {
    ({ PREGUNTA_DE_CIERRE } = await import("../src/domain/preguntaPendiente.js"));
  });

  it("lleva una pregunta, para que el hilo no muera en un punto", () => {
    // Ya no tiene que TERMINAR en «?»: desde el 27-ago cierra con «Ahí le
    // esperamos», que es lo que pidió Manuel. Lo que no puede faltar es la
    // pregunta — es la única razón por la que este bloque existe.
    expect(PREGUNTA_DE_CIERRE).toMatch(/¿[^?]+\?/);
  });

  it("no pide ninguno de los datos que ya se tienen", () => {
    expect(PREGUNTA_DE_CIERRE).not.toMatch(/d[íi]a|local|medida|cu[áa]nt/i);
  });
});
