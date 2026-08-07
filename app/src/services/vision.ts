/**
 * Lectura de fotos del cliente (visión).
 *
 * En 14 días de producción llegaron 33 fotos y casi todas eran la etiqueta de
 * la puerta o el costado de la llanta: la medida servida en bandeja, que el bot
 * tiraba a la basura. Aquí la foto se convierte en TEXTO y ese texto entra por
 * el mismo camino que un mensaje escrito, así extractTireSizes le saca la
 * medida sin tocar nada más del pipeline.
 *
 * Modelo aparte del loop (7-ago): leer una foto es UNA llamada, no un turno de
 * conversación, así que va con config.openai.visionModel y no con el modelo
 * barato del loop. Un dígito mal leído en «225/65R17» cotiza la llanta
 * equivocada, y eso cuesta muchísimo más que los centavos que separan al mejor
 * modelo de visión del más barato.
 *
 * El caption viaja con la foto cuando existe: si el cliente escribe «esa llanta
 * mi amigo, a cómo me da», ese texto dice QUÉ buscar en una imagen que casi
 * siempre trae media camioneta dentro. Es opcional a propósito — quien la llama
 * hoy sin caption sigue compilando y comportándose igual.
 *
 * No se registra en ai_runs: esa tabla exige conversation_id + stage y el
 * handler del webhook aún no resolvió la conversación cuando corre la visión
 * (recién la crea recibirMensaje). Meterlo aquí obligaría a duplicar esa
 * resolución por una métrica secundaria; se deja fuera a propósito.
 */
import OpenAI from "openai";
import { config } from "../config.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/** Respuesta pactada con el modelo cuando la foto no aporta nada vendible. */
const SIN_DATOS = "FOTO_SIN_DATOS";

const SYSTEM =
  "Eres el lector de fotos de una llantera ecuatoriana. Describe SOLO lo que se lee en la imagen, en una línea, priorizando: medida de llanta (formato 225/65R17 o 31x10.5R15), marca, modelo, índice carga/velocidad, DOT, y si es la etiqueta de la puerta, la medida recomendada. Si no se lee nada útil di exactamente: FOTO_SIN_DATOS";

/**
 * Devuelve una línea con lo que se lee en la foto, o null si la API falla o la
 * foto no tiene datos útiles (el llamador entonces pide la medida por escrito).
 *
 * `caption` es el texto que el cliente mandó junto a la imagen, si lo hubo.
 */
export async function describirFotoDeLlanta(
  bytes: Buffer,
  mimeType: string,
  caption?: string,
): Promise<string | null> {
  try {
    const dataUrl = `data:${mimeType || "image/jpeg"};base64,${bytes.toString("base64")}`;
    const pie = caption?.trim();
    // La imagen va SIEMPRE primero: así el contrato del contenido no cambia
    // según haya caption o no, y el pie de foto es un extra que se suma al final.
    const contenido = [
      { type: "image_url" as const, image_url: { url: dataUrl } },
      ...(pie
        ? [{ type: "text" as const, text: `El cliente escribió junto a la foto: ${pie}` }]
        : []),
    ];
    const response = await openai.chat.completions.create({
      model: config.openai.visionModel,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: contenido },
      ],
      max_completion_tokens: 150,
      // Temperatura 0: esto es transcripción, no redacción — inventar una medida
      // que no está en la foto es peor que no leer nada.
      temperature: 0,
    });
    const texto = response.choices[0]?.message?.content?.trim();
    if (!texto || texto.toUpperCase().includes(SIN_DATOS)) return null;
    return texto;
  } catch (error) {
    console.warn("⚠️ Visión falló al leer la foto:", error instanceof Error ? error.message : error);
    return null;
  }
}
