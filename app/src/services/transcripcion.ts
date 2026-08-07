/**
 * Escucha de las notas de voz del cliente (transcripción).
 *
 * En Ecuador el cliente habla, no escribe: manda la nota de voz manejando o
 * desde el taller. Hasta hoy el webhook contestaba que no podía escuchar y esa
 * venta se enfriaba ahí mismo. Aquí el audio se convierte en TEXTO y ese texto
 * entra por el mismo camino que un mensaje escrito, así extractTireSizes le
 * saca la medida sin tocar nada más del pipeline (mismo criterio que vision.ts).
 *
 * No se registra en ai_runs: esa tabla exige conversation_id + stage y el
 * handler del webhook aún no resolvió la conversación cuando corre la
 * transcripción (recién la crea recibirMensaje). Meterlo aquí obligaría a
 * duplicar esa resolución por una métrica secundaria; se deja fuera a propósito.
 */
import OpenAI, { toFile } from "openai";
import { config } from "../config.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * El prompt de Whisper NO es una instrucción: es un sesgo de vocabulario, un
 * pedazo de texto de ejemplo que empuja al modelo hacia esas palabras. Por eso
 * van las medidas y las marcas que vendemos — sin esto «205/55R16» sale como
 * «doscientos cinco cincuenta y cinco erre dieciséis» o «205 55 R 16» y
 * extractTireSizes no la reconoce; y «Kenda» sale «quenda», «Falken» «falcon».
 */
const VOCABULARIO =
  "Llantas en Quito. Medidas como 205/55R16, 265/70R17, aro, rin, juego de 4. Marcas: Kenda, Falken, Sunoco, Eurolub, Wildpeak. Cotización, precio, camioneta.";

/**
 * Devuelve lo que dijo el cliente en el audio, o null si la API falla o el
 * audio salió mudo (el llamador entonces pide la consulta por escrito).
 */
export async function transcribirAudio(
  bytes: Buffer,
  mimeType: string,
): Promise<string | null> {
  try {
    // WhatsApp manda audio/ogg con códec opus; Whisper lo acepta tal cual, así
    // que no hay que transcodificar. El nombre del archivo es obligatorio para
    // la API multipart (de ahí se deduce el formato) aunque el audio venga en
    // memoria y nunca toque el disco.
    const file = await toFile(bytes, "audio.ogg", { type: mimeType || "audio/ogg" });
    const response = await openai.audio.transcriptions.create({
      file,
      model: config.openai.transcribeModel,
      // Fijar el español evita que un «hola» corto lo detecte como portugués o
      // italiano y devuelva una frase inventada en otro idioma.
      language: "es",
      prompt: VOCABULARIO,
    });
    const texto = response.text?.trim();
    if (!texto) return null;
    return texto;
  } catch (error) {
    console.warn(
      "⚠️ Transcripción falló al escuchar el audio:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
