/**
 * Stub de la Graph API de Meta.
 *
 * Existe para que ninguna prueba de carga mande un WhatsApp de verdad, y para
 * tener el registro exacto de todo lo que el bot INTENTÓ enviar. Ese registro
 * es el criterio de "no duplicó": la base dice lo que el bot creyó hacer, este
 * log dice lo que realmente salió por el cable.
 *
 * Uso: node stub-graph.mjs [--port 4610] [--log ruta.jsonl] [--chaos 0.0]
 */
import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, value, index, list) => {
    if (value.startsWith("--")) acc.push([value.slice(2), list[index + 1]]);
    return acc;
  }, []),
);

const port = Number(args.port ?? 4610);
const logPath = args.log ?? "graph-sends.jsonl";
// Fracción de peticiones que se rechazan con un error transitorio, para
// ejercitar los reintentos de graphSend (3 intentos, backoff 400/800 ms).
const chaos = Number(args.chaos ?? 0);

writeFileSync(logPath, "");
let counter = 0;
const stats = { total: 0, chaos429: 0, chaos503: 0, byType: {} };

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    const parsed = (() => { try { return JSON.parse(body); } catch { return {}; } })();
    const receivedAt = new Date().toISOString();

    // GET de diagnóstico de canal (/me, /{phoneId}) — el panel los usa.
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        id: "STUB", name: "Stub Load Test",
        display_phone_number: "+593 00 000 0000", verified_name: "Depot Tire (stub)",
        quality_rating: "GREEN",
      }));
      return;
    }

    if (chaos > 0 && Math.random() < chaos) {
      const transient = Math.random() < 0.5 ? 429 : 503;
      if (transient === 429) stats.chaos429 += 1; else stats.chaos503 += 1;
      appendFileSync(logPath, `${JSON.stringify({ receivedAt, path: req.url, rejected: transient })}\n`);
      res.writeHead(transient, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "stub: error transitorio inyectado", code: transient } }));
      return;
    }

    counter += 1;
    stats.total += 1;

    // Subida de media (multipart a /{phoneId}/media). Meta responde `{id}` y el
    // bot usa ese id para mandar la imagen; el stub respondía el shape de un
    // MENSAJE, sin `id` arriba, así que `uploadMedia` fallaba siempre. Efecto:
    // toda pieza caía al fallback de texto largo y el eval nunca medía el camino
    // real —el de la imagen— sino el degradado. Se veía como bot verboso.
    if (/\/media\/?$/.test((req.url ?? "").split("?")[0])) {
      const mediaId = `STUB_MEDIA_${counter}`;
      stats.byType.media = (stats.byType.media ?? 0) + 1;
      appendFileSync(logPath, `${JSON.stringify({ receivedAt, path: req.url, to: null, type: "media", text: null, templateName: null, providerMessageId: mediaId })}\n`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: mediaId }));
      return;
    }

    const type = parsed.type ?? (parsed.template ? "template" : "desconocido");
    stats.byType[type] = (stats.byType[type] ?? 0) + 1;
    const id = `wamid.STUB_OUT_${counter}`;

    appendFileSync(logPath, `${JSON.stringify({
      receivedAt,
      path: req.url,
      to: parsed.to ?? null,
      type,
      // El texto exacto es lo que permite detectar respuestas duplicadas.
      text: parsed.text?.body ?? null,
      templateName: parsed.template?.name ?? null,
      providerMessageId: id,
    })}\n`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      messaging_product: "whatsapp",
      contacts: [{ input: parsed.to ?? "", wa_id: parsed.to ?? "" }],
      messages: [{ id }],
    }));
  });
});

server.listen(port, () => {
  console.log(`[stub-graph] escuchando en :${port} · log=${logPath} · caos=${chaos}`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => {
    console.log(`[stub-graph] ${JSON.stringify(stats)}`);
    server.close(() => process.exit(0));
  });
}
