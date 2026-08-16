import { describe, expect, it } from "vitest";
import {
  analizarRepeticion,
  looksRepetitiveReply,
  replySimilarity,
} from "../src/domain/conversationQuality.js";

// La clave diaria vive junto a las consultas, así que el módulo arrastra config
// y el cliente de postgres sólo por vecindad. La clave en sí es pura y nada se
// conecta: postgres.js abre en la primera consulta y aquí no hay ninguna.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_repeticion_test";

const { claveRepeticionDiaria } = await import("../src/services/conversationQuality.js");

/**
 * Los fixtures son conversaciones reales del 15-ago-2026. La 6467 es la que
 * destapó el problema: el detector viejo la marcó como repetitiva estando sana,
 * y ese falso positivo salió 14 veces en un solo día.
 *
 * Los arreglos van del mensaje MÁS NUEVO al más viejo, igual que el
 * `order by created_at desc` de la consulta que los alimenta.
 */
describe("detector de repetición", () => {
  it("no marca la conv 6467: el cliente confirmó y pidió la ubicación", () => {
    const bot = [
      "Perfecto, le anoto para el lunes en Quito Sur. Le aviso al asesor con su número de cotización.",
      "¿Qué día puede pasar y a cuál local? ¿Quito Sur o Cumbayá? Con esos dos datos le aviso al asesor.",
      "Le dejo listo el resumen: 4 × KENDA KR203 en 205/55R16, total $412.",
    ];
    const cliente = ["Sí, el lunes en Quito Sur. ¿Me pasa la ubicación?", "Dale", "Cotíceme por 4"];
    const candidato =
      "Aquí va la ubicación de Quito Sur 📍 Av. Maldonado y Rumichaca. Abrimos de lunes a sábado de 08:00 a 18:00, y el lunes le esperan con su cotización.";

    expect(analizarRepeticion(candidato, bot, cliente)).toBeNull();
  });

  it("marca al bot que lleva tres vueltas con la misma pregunta", () => {
    // Un bucle real se ve así: el mismo prompt produciendo casi el mismo texto,
    // con variaciones de redacción. No son tres paráfrasis ingeniosas.
    const bot = [
      "Para poder avanzar necesito confirmar la versión y el motor de su vehículo, porque de eso depende la medida original de fábrica.",
      "Necesito confirmar la versión y el motor de su vehículo para avanzar, porque de eso depende la medida original de fábrica.",
      "Confirmo con usted la versión y el motor de su vehículo, porque de eso depende la medida original de fábrica.",
    ];
    const cliente = ["Es una Dmax del 2019 full equipo", "Tengo una Dmax", "Buenas"];
    const candidato =
      "Para avanzar necesito confirmar la versión y el motor de su vehículo, porque de eso depende la medida original de fábrica.";

    const repeticion = analizarRepeticion(candidato, bot, cliente);
    expect(repeticion?.regla).toBe("bot_tres_vueltas");
    expect(repeticion?.doble).toBe(true);
  });

  it("marca cuando los dos están dando vueltas", () => {
    const bot = [
      "Con gusto le mando las alternativas apenas confirme la versión exacta de su camioneta.",
      "Le agradezco la paciencia, estoy revisando el inventario disponible ahora mismo.",
    ];
    const cliente = [
      "Ya le dije que quiero saber cuánto cuesta el juego completo instalado",
      "Quiero saber cuánto me cuesta el juego completo ya instalado",
    ];
    const candidato =
      "Con gusto le mando las alternativas apenas me confirme la versión exacta de su camioneta.";

    const repeticion = analizarRepeticion(candidato, bot, cliente);
    expect(repeticion?.regla).toBe("ambos_en_bucle");
    expect(repeticion?.doble).toBe(true);
  });

  it("mantiene el candado del bucle de fitment, pero sin sacar al asesor", () => {
    const bot = [
      "No tengo una medida verificada. ¿Puede enviarme la etiqueta de la puerta?",
      "Necesito la versión o motor para confirmar.",
    ];
    const candidato =
      "Sigo sin una medida verificada para su caso; lo ideal sería la etiqueta de la puerta del conductor, que trae el dato de fábrica.";

    const repeticion = analizarRepeticion(candidato, bot, []);
    expect(repeticion?.regla).toBe("candado_fitment");
    // El candado va al panel, no al WhatsApp del asesor.
    expect(repeticion?.doble).toBe(false);
  });

  it("marca tres mensajes calcados del bot aunque sean puro vocabulario del negocio", () => {
    const calcado =
      "Le comento que la cotización de sus llantas quedó lista con la medida y la marca que conversamos.";
    expect(looksRepetitiveReply(calcado, [calcado, calcado, calcado])).toBe(true);
  });

  it("no marca un mensaje corto de cortesía por mucho que comparta palabras", () => {
    const bot = [
      "Le confirmo su visita del lunes a Quito Sur con su cotización lista.",
      "Le confirmo su visita del lunes a Quito Sur con su cotización lista.",
    ];
    expect(looksRepetitiveReply("Le confirmo, muchas gracias.", bot)).toBe(false);
  });

  it("no marca hablar de local, medida, marca y día: es el vocabulario del negocio", () => {
    const bot = [
      "En Quito Sur tengo la Falken en 205/55R16 para el lunes.",
      "La marca Kenda en esa medida también está disponible en Quito Sur.",
    ];
    const candidato =
      "Le confirmo entonces: la cotización queda con la medida 205/55R16, marca Falken, para retirar el lunes en el local de Quito Sur con instalación incluida.";
    expect(looksRepetitiveReply(candidato, bot, ["Ya, listo"])).toBe(false);
  });

  it("no se activa con menos de dos mensajes previos del bot", () => {
    expect(looksRepetitiveReply("cualquier cosa que diga el bot en este turno", ["hola"])).toBe(false);
  });

  it("no confunde respuestas comerciales distintas", () => {
    expect(
      replySimilarity(
        "Le comparto tres alternativas con sus valores actualizados para que compare tranquilo antes de decidir.",
        "¿En qué sector de la ciudad se encuentra usted, para indicarle cuál sucursal le queda más cerca?",
      ),
    ).toBeLessThan(0.2);
  });
});

describe("tope diario de la alerta", () => {
  it("usa la misma clave todo el día y una distinta al día siguiente", () => {
    const manana = new Date("2026-08-15T13:00:00Z"); // 08:00 en Guayaquil
    const noche = new Date("2026-08-16T02:00:00Z"); // 21:00 del MISMO 15 en Guayaquil
    const siguiente = new Date("2026-08-16T13:00:00Z");

    expect(claveRepeticionDiaria(6467, manana)).toBe(claveRepeticionDiaria(6467, noche));
    expect(claveRepeticionDiaria(6467, siguiente)).not.toBe(claveRepeticionDiaria(6467, manana));
  });

  it("no mezcla conversaciones distintas del mismo día", () => {
    const dia = new Date("2026-08-15T13:00:00Z");
    expect(claveRepeticionDiaria(6467, dia)).not.toBe(claveRepeticionDiaria(6468, dia));
  });
});
