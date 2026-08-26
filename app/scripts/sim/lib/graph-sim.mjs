/**
 * La Graph API de Meta, de mentira, pero completa.
 *
 * El stub de la prueba de carga (`loadtest/stub-graph.mjs`) solo cuenta lo que
 * salió: de las piezas se queda con el `media_id` y TIRA los bytes. Para el
 * simulador eso no sirve — la imagen de la cotización ES media conversación, y
 * la mitad de los errores de Depot se ven en la pieza, no en el texto.
 *
 * Aquí los bytes se guardan y se sirven, y cada envío queda en una lista
 * ordenada que es la única fuente de verdad de «qué vio el cliente»: no la
 * tabla `messages` (que dice lo que el bot CREYÓ mandar) sino lo que de verdad
 * salió por el cable.
 *
 * No manda nada a ningún lado. Es un servidor HTTP local y nada más.
 */
import { createServer } from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const EXTENSION = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/pdf": "pdf",
};

/**
 * @param {{ puerto: number, dirPiezas: string }} opciones
 * @returns {Promise<{ enviados: () => object[], desde: (n:number) => object[], reset: () => void, cerrar: () => Promise<void>, puerto: number }>}
 */
export async function levantarGraphSim({ puerto, dirPiezas }) {
  mkdirSync(dirPiezas, { recursive: true });

  /** Todo lo que el bot intentó enviar, en orden. */
  const enviados = [];
  /** media_id → { archivo, mime, nombre } — lo que el bot MANDÓ. */
  const piezas = new Map();
  /** media_id → { bytes, mime } — lo que el cliente manda (fotos, audios). */
  const entrantes = new Map();
  let contador = 0;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${puerto}`);
    const ruta = url.pathname;

    // --- API del simulador (no es Meta) ---------------------------------
    if (ruta === "/_sim/enviados") {
      const desde = Number(url.searchParams.get("desde") ?? "0");
      return json(res, 200, enviados.filter((e) => e.n > desde));
    }
    // Descarga de media entrante: `downloadMedia` pide primero el metadato a
    // GET /{mediaId} y después baja el `url` que ahí venga. Las dos patas están
    // acá para que la visión y la transcripción del bot corran DE VERDAD sobre
    // la foto o el audio que se adjuntó en la pantalla.
    if (ruta.startsWith("/_sim/descarga/")) {
      const media = entrantes.get(decodeURIComponent(ruta.slice("/_sim/descarga/".length)));
      if (!media) return json(res, 404, { error: "media entrante desconocida" });
      res.writeHead(200, { "Content-Type": media.mime, "Cache-Control": "no-store" });
      return res.end(media.bytes);
    }
    if (req.method === "GET") {
      const id = decodeURIComponent(ruta.replace(/^\//, ""));
      const media = entrantes.get(id);
      if (media) {
        return json(res, 200, {
          id,
          url: `http://127.0.0.1:${puerto}/_sim/descarga/${encodeURIComponent(id)}`,
          mime_type: media.mime,
          file_size: media.bytes.length,
          messaging_product: "whatsapp",
        });
      }
    }

    if (ruta.startsWith("/_sim/pieza/")) {
      const pieza = piezas.get(decodeURIComponent(ruta.slice("/_sim/pieza/".length)));
      if (!pieza) return json(res, 404, { error: "pieza desconocida" });
      res.writeHead(200, { "Content-Type": pieza.mime, "Cache-Control": "no-store" });
      return res.end(pieza.bytes);
    }

    // --- Diagnóstico de canal: el panel pregunta por el número -----------
    if (req.method === "GET") {
      return json(res, 200, {
        id: "SIM",
        name: "Simulador local",
        display_phone_number: "+593 00 000 0000",
        verified_name: "Depot Tire (simulador)",
        quality_rating: "GREEN",
      });
    }

    // --- Subida de media: aquí SÍ se guardan los bytes -------------------
    if (/\/media\/?$/.test(ruta)) {
      contador += 1;
      const mediaId = `SIM_MEDIA_${contador}`;
      try {
        const bytes = await leerCuerpo(req);
        const form = await new Response(bytes, {
          headers: { "content-type": req.headers["content-type"] ?? "" },
        }).formData();
        const archivo = form.get("file");
        if (archivo && typeof archivo !== "string") {
          const buf = Buffer.from(await archivo.arrayBuffer());
          const mime = archivo.type || "application/octet-stream";
          const nombre = `${mediaId}.${EXTENSION[mime] ?? "bin"}`;
          writeFileSync(resolve(dirPiezas, nombre), buf);
          piezas.set(mediaId, { bytes: buf, mime, nombre });
        }
      } catch (error) {
        console.error(`[graph-sim] no se pudo leer la pieza subida: ${error?.message ?? error}`);
      }
      return json(res, 200, { id: mediaId });
    }

    // --- Envío de mensajes ------------------------------------------------
    const crudo = await leerCuerpo(req);
    const cuerpo = (() => { try { return JSON.parse(crudo.toString("utf8")); } catch { return {}; } })();
    contador += 1;
    const wamid = `wamid.SIM_${contador}`;
    // El «escribiendo…» y el acuse de lectura salen por la misma ruta que un
    // mensaje, sin `type`. Sin distinguirlos, la pantalla los pintaba como una
    // burbuja vacía del bot en cada turno.
    const tipo = cuerpo.type
      ?? (cuerpo.template ? "template"
        : cuerpo.typing_indicator ? "escribiendo"
        : cuerpo.status === "read" ? "lectura"
        : "desconocido");
    const mediaId = cuerpo.image?.id ?? cuerpo.document?.id ?? cuerpo.audio?.id ?? null;

    enviados.push({
      n: enviados.length + 1,
      en: new Date().toISOString(),
      para: cuerpo.to ?? null,
      tipo,
      texto: cuerpo.text?.body ?? null,
      caption: cuerpo.image?.caption ?? cuerpo.document?.caption ?? null,
      nombreArchivo: cuerpo.document?.filename ?? null,
      mediaId,
      // La URL que la UI puede pintar directamente.
      pieza: mediaId && piezas.has(mediaId) ? `/api/pieza/${mediaId}` : null,
      plantilla: cuerpo.template?.name ?? null,
      wamid,
    });

    return json(res, 200, {
      messaging_product: "whatsapp",
      contacts: [{ input: cuerpo.to ?? "", wa_id: cuerpo.to ?? "" }],
      messages: [{ id: wamid }],
    });
  });

  await new Promise((ok) => server.listen(puerto, "127.0.0.1", ok));

  return {
    puerto,
    enviados: () => enviados,
    desde: (n) => enviados.filter((e) => e.n > n),
    piezaDe: (mediaId) => piezas.get(mediaId) ?? null,
    /** Registra una foto/audio del cliente y devuelve el media_id que verá el bot. */
    registrarEntrante: (bytes, mime) => {
      contador += 1;
      const id = `SIM_IN_MEDIA_${contador}`;
      entrantes.set(id, { bytes, mime });
      return id;
    },
    reset: () => { enviados.length = 0; },
    cerrar: () => new Promise((ok) => server.close(ok)),
  };
}

function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

function leerCuerpo(req) {
  return new Promise((ok, fail) => {
    const trozos = [];
    req.on("data", (t) => trozos.push(t));
    req.on("end", () => ok(Buffer.concat(trozos)));
    req.on("error", fail);
  });
}
